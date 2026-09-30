import { addRestriction } from "../legality/checkpoints.js";
import { dealDamage } from "../state/damage.js";
import {
  hasPayableEndTheRunInterrupt,
  openPendingEndTheRun,
} from "../state/endTheRun.js";
import { log } from "../state/createGame.js";
import {
  chargeableInstalledIds,
  chargeCard,
  identifyMark,
  resolveSabotageAmount,
  trashCorpCardFacedownToArchives,
} from "../state/msKeywords.js";
import { noteVirusProgramInstalled } from "../state/virusInstall.js";
import {
  beginExpose,
  exposeLegalTargets,
  openExposeInterruptOrComplete,
  preventPendingExpose,
} from "../state/expose.js";
import { preventPendingInstalledTrash } from "../state/trashPrevent.js";
import { noteInstalledThisTurn, noteProgramOrHardwareInstalled } from "../state/programHardwareInstall.js";
import {
  azJobConnectionOrHardwareInstallDiscount,
  noteJobConnectionOrHardwareInstalled,
} from "../state/azInstallDiscount.js";
import { noteCorpAbilityCausedRunnerCreditLossOrSpend } from "../state/gamenet.js";
import { maybeFireHostedCreditsGte } from "../state/hostedCredits.js";
import { maybeFirePowerCountersGte, syncEtrPerPowerCounterSubs, syncGainsSubroutinesPerAdvancement } from "../state/powerCounters.js";
import { effectiveRunnerTags, runnerIsTagged } from "../state/tags.js";
import { recomputeRunnerMaxHandSize } from "../state/handSize.js";
import {
  fireCorpOnTrash,
  fireRonaldFiveOnCorpTrash,
  noteTrashMatchingRunnerIdentityFaction,
  fireOnRemoveTags,
  fireOnFirstAvoidOrRemoveTagThisTurn,
  fireOnTakeTagsWhenUntagged,
  moveRunnerCardToHeap,
  noteCorpCardAddedToArchives,
  noteFirstCorpCardTrashEachTurn,
  purgeVirusCounters,
  releaseHostedCardsOnTrash,
} from "../state/trashHooks.js";
import {
  hostFenrisIdentity,
  legalFenrisHostIds,
} from "../state/fenris.js";
import { fireCorpIdentityFlippedFirstOperationPlay } from "../state/identityFlipHooks.js";
import {
  creditsAvailableForInstall,
  spendCreditsForInstall,
  stealthHostedCreditsAvailable,
  takeFromStealthHostedCredits,
} from "../state/costs.js";
import { fireFirstBadPublicityTake } from "../state/badPublicityHooks.js";
import { removeCardFromCurrentZone, canScoreAgenda, checkWinConditions, scoreAgenda, stealAgenda, agendaPointsFor } from "../state/scoring.js";
import { autoResolveTrace, startTrace } from "../state/trace.js";
import { startPsiGame } from "../state/psi.js";
import {
  allIceStrengthBonusFromLockdowns,
  cannotBreakExceptIcebreakerActive,
  cardHasIcebreakerSubtype,
} from "../state/lockdowns.js";
import { applyRunAccessRestrictions } from "../state/accessFilter.js";
import { preventPendingDamage } from "../state/damage.js";
import { pickRandomSubset } from "../state/rng.js";
import {
  hasPayableTagInterrupt,
  openPendingTags,
  preventPendingTags,
} from "../state/tags.js";
import { scoredAgendaBreakerPenaltyIfIceDerezzed } from "../state/breakerMods.js";
import { memoryLimit, usedMemory, effectiveMemoryCost } from "../state/turn.js";
import { effectiveIceSubtypes, serverIdForIce } from "../cards/stubs.js";
import type { GameState, RuleCite, Side } from "../state/types.js";
import { CR } from "../timing/labels.js";
import { fx, type Cond, type Effect, type Primitive, type SideRef } from "./ir.js";
import { applySpinFalDtPrimitive } from "./spinFalDtPrimitives.js";
import { applySpinHapPrimitive } from "./spinHapPrimitives.js";
import { applyLunarUpPrimitive } from "./lunarUpPrimitives.js";
import { applyLunarTsbPrimitive } from "./lunarTsbPrimitives.js";
import { applyLunarFcPrimitive } from "./lunarFcPrimitives.js";
import { applyLunarUaoPrimitive } from "./lunarUaoPrimitives.js";
import { applyLunarAtrPrimitive } from "./lunarAtrPrimitives.js";
import { applyLunarTsPrimitive } from "./lunarTsPrimitives.js";
import { applyOacPrimitive } from "./oacPrimitives.js";
import { applySansanValPrimitive } from "./sansanValPrimitives.js";
import { applySansanBbPrimitive } from "./sansanBbPrimitives.js";
import { applySansanCcPrimitive } from "./sansanCcPrimitives.js";
import { applySansanUwPrimitive } from "./sansanUwPrimitives.js";
import { applySansanOhPrimitive } from "./sansanOhPrimitives.js";
import { applySansanUotPrimitive } from "./sansanUotPrimitives.js";
import { applyDadPrimitive } from "./dadPrimitives.js";
import { applyMumbadKgPrimitive } from "./mumbadKgPrimitives.js";
import { applyMumbadBfPrimitive } from "./mumbadBfPrimitives.js";
import { applyMumbadDagPrimitive } from "./mumbadDagPrimitives.js";
import { applyMumbadSiPrimitive } from "./mumbadSiPrimitives.js";
import { applyMumbadTlmPrimitive } from "./mumbadTlmPrimitives.js";
import { applyMumbadFtmPrimitive } from "./mumbadFtmPrimitives.js";
import { fireRunnerValTrigger } from "./sansanValHooks.js";
import { applySpinTcPrimitive } from "./spinTcPrimitives.js";

export interface EffectCtx {
  state: GameState;
  /** Card whose ability/sub is firing. */
  sourceId: string;
  /** Who paid (paid abilities); defaults to source.side. */
  payerSide?: Side;
}

export type EvalResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

/** Jesminder-class source that would prevent the first tag this turn. */
function findPreventFirstTagThisTurn(state: GameState): string | null {
  const idCard = state.cards[state.runner.identityId];
  if (idCard?.preventFirstTagThisTurn) return idCard.id;
  for (const rid of state.runner.rig) {
    if (state.cards[rid]?.preventFirstTagThisTurn) return rid;
  }
  return null;
}

/**
 * Nested cost "take N tags" is unpayable when a static/mandatory interrupt
 * would prevent that tag payment (CR 1.16.1b).
 */
function canPayTakeTagsNestedCost(state: GameState, amount: number): boolean {
  if (amount <= 0) return true;
  const preventSrc = findPreventFirstTagThisTurn(state);
  if (!preventSrc) return true;
  // First tag this turn would be fully prevented for amount === 1.
  if (state.turn.tagsGivenThisTurn === 0 && amount === 1) return false;
  return true;
}

function breakerStrength(state: GameState, breakerId: string): number {
  const card = state.cards[breakerId];
  let base = card.breaker?.strength ?? card.strength ?? 0;
  if (card.strengthBonusPerIcebreaker) {
    const n = state.runner.rig.filter(
      (id) =>
        Boolean(state.cards[id].breaker) ||
        (state.cards[id].subtypes ?? []).includes("icebreaker"),
    ).length;
    base += card.strengthBonusPerIcebreaker * n;
  }
  if (card.strengthBonusPerHeapSubtype) {
    const sub = card.strengthBonusPerHeapSubtype.subtype.toLowerCase();
    const n = state.runner.discard.filter((id) =>
      (state.cards[id]?.subtypes ?? []).some((s) => s.toLowerCase() === sub),
    ).length;
    base += card.strengthBonusPerHeapSubtype.bonus * n;
  }
  if (card.strengthBonusPerCoreDamageThisGame) {
    base += card.strengthBonusPerCoreDamageThisGame * state.runner.brainDamage;
  }
  if (typeof card.strengthPenaltyPerGripCard === "number") {
    base -= card.strengthPenaltyPerGripCard * state.runner.hand.length;
  }
  if (card.strengthPerPowerCounter) {
    base += card.powerCounters ?? 0;
  }
  if (typeof card.strengthBonusPerUnusedMu === "number") {
    base +=
      card.strengthBonusPerUnusedMu *
      Math.max(0, memoryLimit(state) - usedMemory(state));
  }
  if (card.threatStrengthBonus) {
    const corpPts = agendaPointsFor(state, "corp");
    const runnerPts = agendaPointsFor(state, "runner");
    if (Math.max(corpPts, runnerPts) >= card.threatStrengthBonus.level) {
      base += card.threatStrengthBonus.amount;
    }
  }
  base += state.turn.breakerStrengthBoostsThisTurn[breakerId] ?? 0;
  // Dinosaurus-class: host grants strength to the hosted icebreaker.
  if (card.hostId) {
    const host = state.cards[card.hostId];
    if (host?.hostNonAiIcebreaker && host.hostIcebreakerStrengthBonus) {
      base += host.hostIcebreakerStrengthBonus;
    }
  }
  // GAMEDRAGON-class: hardware hosted on the breaker grants strength.
  for (const id of state.runner.rig) {
    const mod = state.cards[id];
    if (mod?.hostId === breakerId && mod.hostIcebreakerStrengthBonus) {
      base += mod.hostIcebreakerStrengthBonus;
    }
  }
  const runBoost = state.run?.strengthBoosts[breakerId] ?? 0;
  const encBoost = state.run?.encounterStrengthBoosts[breakerId] ?? 0;
  const stegodon = scoredAgendaBreakerPenaltyIfIceDerezzed(state);
  return base + runBoost + encBoost - stegodon;
}

/** Trojan host / same-server strength mods (Monkeywrench / Chisel). */
function trojanIceStrengthModifier(state: GameState, iceId: string): number {
  let mod = 0;
  let serverIce: string[] | null = null;
  for (const server of Object.values(state.servers)) {
    if (server.ice.includes(iceId)) {
      serverIce = server.ice;
      break;
    }
  }
  for (const id of state.runner.rig) {
    const trojan = state.cards[id];
    if (!trojan?.hostId) continue;
    if (trojan.hostId === iceId) {
      if (trojan.hostStrengthModifier) {
        mod += trojan.hostStrengthModifier;
      }
      if (typeof trojan.hostStrengthPerVirusCounter === "number") {
        mod +=
          (trojan.virusCounters ?? 0) * trojan.hostStrengthPerVirusCounter;
      }
    } else if (
      serverIce &&
      trojan.otherIceProtectingServerStrengthModifier &&
      serverIce.includes(trojan.hostId) &&
      trojan.hostId !== iceId
    ) {
      mod += trojan.otherIceProtectingServerStrengthModifier;
    }
  }
  return mod;
}

/** Rime-class: rezzed ice on the same server grants strength to all ice there. */
function sameServerIceStrengthBonus(state: GameState, iceId: string): number {
  let bonus = 0;
  for (const server of Object.values(state.servers)) {
    if (!server.ice.includes(iceId)) continue;
    for (const id of server.ice) {
      const ice = state.cards[id];
      if (!ice?.rezzed || !ice.sameServerIceStrengthBonus) continue;
      bonus += ice.sameServerIceStrengthBonus;
    }
    break;
  }
  return bonus;
}

/** Experiential Data-class: rezzed root upgrades buff ice protecting their server. */
function rootUpgradeIceStrengthBonus(state: GameState, iceId: string): number {
  let bonus = 0;
  for (const server of Object.values(state.servers)) {
    if (!server.ice.includes(iceId)) continue;
    for (const id of server.root) {
      const up = state.cards[id];
      if (!up?.rezzed) continue;
      bonus += up.iceProtectingThisServerStrengthBonus ?? 0;
    }
    break;
  }
  return bonus;
}

function iceStrength(state: GameState, iceId: string): number {
  const card = state.cards[iceId];
  let base = card.strength ?? 0;
  if (card.strengthBonusPerIcebreaker) {
    const n = state.runner.rig.filter(
      (id) =>
        Boolean(state.cards[id].breaker) ||
        (state.cards[id].subtypes ?? []).includes("icebreaker"),
    ).length;
    base += card.strengthBonusPerIcebreaker * n;
  }
  if (typeof card.strengthPerVirusCounter === "number") {
    base += (card.virusCounters ?? 0) * card.strengthPerVirusCounter;
  }
  if (card.strengthBonusPerRezzedIceWithSubtype) {
    const { subtype, bonus: perBonus } =
      card.strengthBonusPerRezzedIceWithSubtype;
    let count = 0;
    for (const server of Object.values(state.servers)) {
      for (const id of server.ice) {
        const ice = state.cards[id];
        if (ice?.rezzed && (ice.subtypes ?? []).includes(subtype)) {
          count += 1;
        }
      }
    }
    base += count * perBonus;
  }
  let penalty = 0;
  for (const id of state.runner.rig) {
    penalty += state.cards[id]?.allIceStrengthPenalty ?? 0;
  }
  let subtypeBonus = 0;
  const idCard = state.cards[state.corp.identityId];
  if (idCard?.iceStrengthBonusForSubtype) {
    const { subtype, bonus: b } = idCard.iceStrengthBonusForSubtype;
    if ((card.subtypes ?? []).includes(subtype)) subtypeBonus += b;
  }
  for (const server of Object.values(state.servers)) {
    for (const rid of [...server.root, ...server.ice]) {
      const src = state.cards[rid];
      if (!src?.rezzed || !src.iceStrengthBonusForSubtype) continue;
      const { subtype, bonus: b } = src.iceStrengthBonusForSubtype;
      if ((card.subtypes ?? []).includes(subtype)) subtypeBonus += b;
    }
  }
  const bonus = allIceStrengthBonusFromLockdowns(state);
  return (
    base +
    trojanIceStrengthModifier(state, iceId) +
    sameServerIceStrengthBonus(state, iceId) +
    rootUpgradeIceStrengthBonus(state, iceId) +
    (state.run?.iceStrengthBoosts?.[iceId] ?? 0) +
    bonus -
    penalty +
    subtypeBonus
  );
}

/** Fire ice + Runner-rig onBypass triggers after a piece of ice is bypassed. */
export function fireOnBypassTriggers(state: GameState, iceId: string): void {
  const bypassed = state.cards[iceId];
  if (bypassed?.onBypass) {
    const r = evalEffect({ state, sourceId: iceId }, bypassed.onBypass);
    if (!r.ok) {
      log(state, `onBypass failed on ${bypassed.title}: ${r.error}`);
    }
    if (state.pendingChoice) return;
  }
  for (const id of [...state.runner.rig]) {
    const card = state.cards[id];
    if (!card?.onBypass) continue;
    const r = evalEffect({ state, sourceId: id }, card.onBypass);
    if (!r.ok) {
      log(state, `onBypass failed on ${card.title}: ${r.error}`);
    }
    if (state.pendingChoice) return;
  }
  // Jeitinho-class: heap cards may install on bypass when Threat met.
  for (const id of [...state.runner.discard]) {
    const card = state.cards[id];
    const spec = card?.onBypassMayInstallFromHeap;
    if (!spec) continue;
    const threatPts = Math.max(
      agendaPointsFor(state, "corp"),
      agendaPointsFor(state, "runner"),
    );
    if (threatPts < spec.requiresThreat) continue;
    if (state.runner.clicks < spec.clickCost) continue;
    const installCost = card.installCost ?? 0;
    if (creditsAvailableForInstall(state, "runner") < installCost) continue;
    state.pendingChoice = {
      sourceId: id,
      chooser: "runner",
      options: [
        {
          id: "install-from-heap",
          label: `Spend ${spec.clickCost}[click]: install ${card.title} from heap (${installCost}¢)`,
          effect: {
            op: "do",
            action: {
              kind: "install_heap_paying_click",
              cardId: id,
              clickCost: spec.clickCost,
            },
          },
        },
        {
          id: "decline",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "runner", amount: 0 },
          },
        },
      ],
    };
    log(
      state,
      `${card.title} — may spend ${spec.clickCost}[click] to install from heap (Threat ${spec.requiresThreat}).`,
    );
    return;
  }
}

/** Fire trojan onHostRezzed / onHostDerezzed for ice that stayed installed. */
export function fireHostRezStateTriggers(
  state: GameState,
  iceId: string,
  kind: "rez" | "derez",
): void {
  for (const id of [...state.runner.rig]) {
    const card = state.cards[id];
    if (card?.hostId !== iceId) continue;
    const fx = kind === "rez" ? card.onHostRezzed : card.onHostDerezzed;
    if (!fx) continue;
    const r = evalEffect({ state, sourceId: id }, fx);
    if (!r.ok) {
      log(
        state,
        `onHost${kind === "rez" ? "Rezzed" : "Derezzed"} failed on ${card.title}: ${r.error}`,
      );
    }
    if (state.pendingChoice) return;
  }
}

/** Barry Wong / Compromised Employee: fire onAnyIceRez on identity + rig. */
export function fireOnAnyIceRez(state: GameState, iceId: string): void {
  const ice = state.cards[iceId];
  if (!ice || ice.type !== "ice" || !ice.rezzed) return;
  const fire = (cardId: string): void => {
    if (state.pendingChoice) return;
    const card = state.cards[cardId];
    const fx = card?.onAnyIceRez;
    if (!fx) return;
    const r = evalEffect({ state, sourceId: cardId }, fx);
    if (!r.ok) {
      log(state, `onAnyIceRez failed on ${card!.title}: ${r.error}`);
    }
  };
  fire(state.runner.identityId);
  for (const id of state.runner.rig) {
    fire(id);
  }
}

/**
 * e3 Feedback Implants / Snowball: after a subroutine is broken, fire
 * onBreakSubroutine hooks on installed Runner cards and apply
 * strengthBonusOnBreakSubForRun on the breaker that broke.
 */
export function fireAfterBreakSubroutineHooks(
  state: GameState,
  breakerId: string | null,
): void {
  const enc = state.run?.encounter;
  if (!enc) return;
  const ice = state.cards[enc.iceId];
  if (ice?.gainCreditWheneverRunnerBreaksSubroutine) {
    state.corp.credits += 1;
    log(
      state,
      `${ice.title} — gain 1¢ (subroutine broken) → ${state.corp.credits}¢.`,
    );
  }
  if (breakerId && state.runner.rig.includes(breakerId)) {
    const breaker = state.cards[breakerId];
    const bonus = breaker?.strengthBonusOnBreakSubForRun;
    if (typeof bonus === "number" && bonus !== 0 && state.run) {
      state.run.strengthBoosts[breakerId] =
        (state.run.strengthBoosts[breakerId] ?? 0) + bonus;
      log(
        state,
        `${breaker!.title} — +${bonus} strength for the remainder of the run.`,
      );
    }
  }
  if (state.pendingChoice) return;
  const unbroken = enc.broken.some((b) => !b);
  for (const id of state.runner.rig) {
    if (state.pendingChoice) return;
    const card = state.cards[id];
    if (!card) continue;
    if (card.onBreakSubroutine) {
      const r = evalEffect({ state, sourceId: id }, card.onBreakSubroutine);
      if (!r.ok) {
        log(state, `onBreakSubroutine failed on ${card.title}: ${r.error}`);
      }
      if (state.pendingChoice) return;
    }
    const mayPay = card.onBreakSubroutineMayPayCreditsBreakAnother;
    if (mayPay && unbroken) {
      const credits = Math.max(0, mayPay.credits ?? 1);
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "runner", amount: 0 },
          },
        },
      ];
      if (state.runner.credits >= credits) {
        options.unshift({
          id: `pay-break:${credits}`,
          label: `Pay ${credits}¢ to break 1 subroutine`,
          effect: {
            op: "seq",
            effects: [
              {
                op: "do",
                action: {
                  kind: "lose_credits",
                  side: "runner",
                  amount: credits,
                },
              },
              {
                op: "do",
                action: { kind: "break_encounter_subroutine", maxSubs: 1 },
              },
            ],
          },
        });
      }
      if (options.length > 1) {
        state.pendingChoice = { sourceId: id, chooser: "runner", options };
        log(
          state,
          `${card.title} — may pay ${credits}¢ to break another subroutine.`,
        );
        return;
      }
    }
  }
}

/** Fire Brasília / Thunderbolt when ice is rezzed during a run. */
export function fireIceRezDuringRunHooks(
  state: GameState,
  iceId: string,
): void {
  if (!state.run) return;
  const ice = state.cards[iceId];
  if (!ice || ice.type !== "ice" || !ice.rezzed) return;
  const iceServer = serverHostingCard(state, iceId);
  if (!iceServer) return;

  // Thunderbolt first (no choice) so it still applies when onRez opened a choice.
  const idCard = state.cards[state.corp.identityId];
  const tb = idCard?.onRezApOrDestroyerIceDuringRun;
  if (tb) {
    const subtypes = ice.subtypes ?? [];
    const isApOrDestroyer =
      subtypes.includes("ap") || subtypes.includes("destroyer");
    if (isApOrDestroyer) {
      state.run.iceStrengthBoosts[iceId] =
        (state.run.iceStrengthBoosts[iceId] ?? 0) + tb.strengthBonus;
      log(
        state,
        `${idCard!.title} — ${ice.title} gets +${tb.strengthBonus} strength this run.`,
      );
      if (tb.gainEtrUnlessTrashInstalledSub) {
        if (!ice.baseSubroutines) {
          ice.baseSubroutines = ice.subroutines
            ? structuredClone(ice.subroutines)
            : [];
        }
        const granted = {
          id: `${ice.defId}-thunderbolt-etr-unless-trash`,
          text: "End the run unless the Runner trashes 1 of their installed cards.",
          effect: {
            op: "do" as const,
            action: { kind: "end_the_run_unless_trash_installed" as const },
          },
        };
        ice.subroutines = [...(ice.subroutines ?? []), granted];
        if (!state.run.thunderboltGrantedIceIds) {
          state.run.thunderboltGrantedIceIds = [];
        }
        if (!state.run.thunderboltGrantedIceIds.includes(iceId)) {
          state.run.thunderboltGrantedIceIds.push(iceId);
        }
        if (state.run.encounter?.iceId === iceId) {
          state.run.encounter.broken.push(false);
        }
        log(
          state,
          `${ice.title} gains Thunderbolt ETR-unless-trash subroutine for this run.`,
        );
      }
    }
  }

  // Brasília: once per turn may-derez offer (skip if another choice is open).
  if (state.pendingChoice) return;
  if (state.run.attackedServerId !== iceServer.id) return;
  for (const uid of iceServer.root) {
    const up = state.cards[uid];
    const hook = up?.oncePerTurnOnRezIceProtectingThisServerDuringRun;
    if (!up?.rezzed || !hook) continue;
    if (state.turn.brasiliaAbilityUsedIds.includes(uid)) continue;
    const bonus = hook.mayDerezOtherIceForStrengthBonus;
    const others: string[] = [];
    for (const server of Object.values(state.servers)) {
      for (const id of server.ice) {
        if (id === iceId) continue;
        if (state.cards[id]?.rezzed) others.push(id);
      }
    }
    if (others.length === 0) continue;
    if (!state.turn.brasiliaAbilityUsedIds.includes(uid)) {
      state.turn.brasiliaAbilityUsedIds.push(uid);
    }
    state.pendingChoice = {
      sourceId: uid,
      chooser: "corp",
      options: [
        {
          id: "decline-brasilia",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
        ...others.map((oid) => ({
          id: `brasilia-derez:${oid}`,
          label: `Derez ${state.cards[oid]!.title} → +${bonus} strength on ${ice.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "brasilia_derez_other_ice_for_strength" as const,
              otherIceId: oid,
              rezzedIceId: iceId,
              bonus,
              brasiliaId: uid,
            },
          },
        })),
      ],
    };
    log(
      state,
      `${up.title} — may derez another ice for +${bonus} strength on ${ice.title}.`,
    );
    break;
  }
}

/** Nuvem: first R&D trash each Corp turn gains credits. */
export function maybeFireNuvemFirstRdTrash(state: GameState): void {
  if (state.turn.nuvemFirstRdTrashUsedThisTurn) return;
  const idCard = state.cards[state.corp.identityId];
  const n = idCard?.creditsOnFirstRdTrashThisTurn ?? 0;
  if (n <= 0) return;
  state.turn.nuvemFirstRdTrashUsedThisTurn = true;
  state.corp.credits += n;
  log(state, `${idCard!.title} — gain ${n}¢ (first R&D trash this turn).`);
}

/** Tallie Perrault: gray/black ops operation trashed after resolving. */
export function fireGrayBlackOpsTrashedHooks(
  state: GameState,
  opCardId: string,
): void {
  const op = state.cards[opCardId];
  if (!op || op.type !== "operation") return;
  const subs = op.subtypes ?? [];
  if (!subs.includes("gray ops") && !subs.includes("black ops")) return;
  for (const id of state.runner.rig) {
    const card = state.cards[id];
    if (!card?.onGrayOrBlackOpsTrashedAfterResolve) continue;
    const r = evalEffect(
      { state, sourceId: id },
      card.onGrayOrBlackOpsTrashedAfterResolve,
    );
    if (!r.ok) {
      log(
        state,
        `onGrayOrBlackOpsTrashedAfterResolve failed on ${card.title}: ${r.error}`,
      );
    }
  }
}

/** Nuvem: after operation or expendable card action. */
export function fireOnAfterOperationOrExpendable(
  state: GameState,
): void {
  const idCard = state.cards[state.corp.identityId];
  if (!idCard?.onAfterOperationOrExpendable) return;
  const r = evalEffect(
    { state, sourceId: idCard.id },
    idCard.onAfterOperationOrExpendable,
  );
  if (!r.ok) {
    log(
      state,
      `onAfterOperationOrExpendable failed on ${idCard.title}: ${r.error}`,
    );
  }
}

/** Zwicky: first credit gain via agenda/operation ability each turn. */
function maybeFireZwickyCreditsGained(
  state: GameState,
  sourceId: string,
): void {
  if (state.turn.zwickyCreditsDrawUsedThisTurn) return;
  const source = state.cards[sourceId];
  if (!source || (source.type !== "agenda" && source.type !== "operation")) {
    return;
  }
  const idCard = state.cards[state.corp.identityId];
  if (!idCard?.onCreditsGainedFromAgendaOrOperationAbility) return;
  state.turn.zwickyCreditsDrawUsedThisTurn = true;
  const r = evalEffect(
    { state, sourceId: idCard.id },
    idCard.onCreditsGainedFromAgendaOrOperationAbility,
  );
  if (!r.ok) {
    log(
      state,
      `onCreditsGainedFromAgendaOrOperationAbility failed on ${idCard.title}: ${r.error}`,
    );
  }
}

function resolveSide(ctx: EffectCtx, ref: SideRef): Side {
  if (ref === "corp" || ref === "runner") return ref;
  if (ref === "payer") {
    return ctx.payerSide ?? ctx.state.cards[ctx.sourceId].side;
  }
  return ctx.state.cards[ctx.sourceId].side;
}

/** Install cost after card-level discounts, then effect discount. */
function countInstalledIcebreakersForCost(state: GameState): number {
  return state.runner.rig.filter(
    (id) =>
      Boolean(state.cards[id].breaker) ||
      (state.cards[id].subtypes ?? []).includes("icebreaker"),
  ).length;
}

function gripInstallCostAfterDiscount(
  state: GameState,
  card: GameState["cards"][string],
  discount: number,
): number {
  let cost = card.installCost;
  if (
    card.installCostDiscountIfSuccessfulRunThisTurn &&
    state.turn.successfulRunThisTurn
  ) {
    cost = Math.max(
      0,
      cost - card.installCostDiscountIfSuccessfulRunThisTurn,
    );
  }
  if (
    card.installCostDiscountIfSuccessfulHqRunThisTurn &&
    state.turn.successfulHqRunThisTurn
  ) {
    cost = Math.max(
      0,
      cost - card.installCostDiscountIfSuccessfulHqRunThisTurn,
    );
  }
  if (card.installCostDiscountPerInstalledIcebreaker) {
    cost = Math.max(
      0,
      cost -
        card.installCostDiscountPerInstalledIcebreaker *
          countInstalledIcebreakersForCost(state),
    );
  }
  if (card.type === "program" && state.turn.programsInstalledThisTurn === 0) {
    for (const id of state.runner.rig) {
      const d = state.cards[id].firstProgramInstallDiscount ?? 0;
      if (d > 0) cost = Math.max(0, cost - d);
    }
  }
  const azDisc = azJobConnectionOrHardwareInstallDiscount(state, card);
  if (azDisc > 0) cost = Math.max(0, cost - azDisc);
  return Math.max(0, cost - discount);
}

function trashOtherConsoles(state: GameState, keepId: string): void {
  const toTrash = state.runner.rig.filter((id) => {
    if (id === keepId) return false;
    return (state.cards[id].subtypes ?? []).includes("console");
  });
  for (const id of toTrash) {
    const card = state.cards[id];
    removeCardFromCurrentZone(state, id);
    state.runner.discard.push(id);
    card.zone = "runner:heap";
    card.faceup = true;
    log(
      state,
      `Trash ${card.title} (console limit; CR 3.8.5b).`,
    );
  }
}

/**
 * Install a grip program/hardware/resource paying `discount`¢ less.
 * Places powerCountersOnInstall before returning so may-charge sees them.
 */
function installGripCardDiscounted(
  state: GameState,
  cardId: string,
  discount: number,
  sourceId: string,
): EvalResult {
  const card = state.cards[cardId];
  if (!card || !state.runner.hand.includes(cardId)) {
    return {
      ok: false,
      error: `install_grip_card: ${cardId} not in grip.`,
      cites: [CR.runnerBasicInstall],
    };
  }
  if (!["program", "hardware", "resource"].includes(card.type)) {
    return {
      ok: false,
      error: "install_grip_card supports program/hardware/resource.",
      cites: [CR.runnerBasicInstall],
    };
  }
  if (card.installOnIce || (card.subtypes ?? []).includes("trojan")) {
    log(
      state,
      `Install ${card.title} discounted — host-ice installs not supported here.`,
    );
    return { ok: true };
  }
  if (card.type === "program") {
    const need = effectiveMemoryCost(state, cardId);
    if (usedMemory(state) + need > memoryLimit(state)) {
      log(
        state,
        `Install ${card.title} discounted — insufficient MU.`,
      );
      return { ok: true };
    }
  }
  const cost = gripInstallCostAfterDiscount(state, card, discount);
  if (creditsAvailableForInstall(state, "runner") < cost) {
    log(
      state,
      `Install ${card.title} discounted — cannot afford ${cost}¢.`,
    );
    return { ok: true };
  }
  spendCreditsForInstall(state, "runner", cost);
  state.runner.hand = state.runner.hand.filter((x) => x !== cardId);
  state.runner.rig.push(cardId);
  card.zone = "runner:rig";
  card.faceup = true;
  if ((card.recurringCreditsMax ?? 0) > 0) {
    card.recurringCredits = card.recurringCreditsMax;
  }
  if ((card.hostedCreditsOnInstall ?? 0) > 0) {
    card.hostedCredits = card.hostedCreditsOnInstall;
  }
  if ((card.powerCountersOnInstall ?? 0) > 0) {
    card.powerCounters = card.powerCountersOnInstall;
  }
  if (
    (card.handSizeBonus ?? 0) !== 0 ||
    (card.handSizePerPowerCounter ?? 0) !== 0
  ) {
    recomputeRunnerMaxHandSize(state);
  }
  if ((card.subtypes ?? []).includes("console")) {
    trashOtherConsoles(state, cardId);
  }
  noteInstalledThisTurn(state, cardId);
  if (card.type === "program") {
    state.turn.programsInstalledThisTurn += 1;
  }
  noteJobConnectionOrHardwareInstalled(state, card);
  const src = state.cards[sourceId]?.title ?? sourceId;
  log(
    state,
    `Install ${card.title} for ${cost}¢ (${discount}¢ discount; from ${src}; CR ${CR.runnerBasicInstall.number}).`,
  );
  if (card.onInstall) {
    const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
    if (!r.ok) return r;
  }
  noteVirusProgramInstalled(state, cardId);
  noteProgramOrHardwareInstalled(state, cardId);
  return { ok: true };
}

function canInstallHeapCard(
  state: GameState,
  cardId: string,
  discount: number,
): boolean {
  const card = state.cards[cardId];
  if (!card || !state.runner.discard.includes(cardId)) return false;
  if (!["program", "hardware", "resource"].includes(card.type)) return false;
  if (card.installOnIce || (card.subtypes ?? []).includes("trojan")) {
    return false;
  }
  if (card.type === "program") {
    const need = effectiveMemoryCost(state, cardId);
    if (usedMemory(state) + need > memoryLimit(state)) return false;
  }
  return (
    creditsAvailableForInstall(state, "runner") >=
    gripInstallCostAfterDiscount(state, card, discount)
  );
}

function installHeapCardDiscounted(
  state: GameState,
  cardId: string,
  discount: number,
  sourceId: string,
): EvalResult {
  const card = state.cards[cardId];
  if (!card || !state.runner.discard.includes(cardId)) {
    return {
      ok: false,
      error: `install_heap_card: ${cardId} not in heap.`,
      cites: [CR.runnerBasicInstall],
    };
  }
  if (!["program", "hardware", "resource"].includes(card.type)) {
    return {
      ok: false,
      error: "install_heap_card supports program/hardware/resource.",
      cites: [CR.runnerBasicInstall],
    };
  }
  if (card.installOnIce || (card.subtypes ?? []).includes("trojan")) {
    log(
      state,
      `Install ${card.title} from heap — host-ice installs not supported here.`,
    );
    return { ok: true };
  }
  if (card.type === "program") {
    const need = effectiveMemoryCost(state, cardId);
    if (usedMemory(state) + need > memoryLimit(state)) {
      log(state, `Install ${card.title} from heap — insufficient MU.`);
      return { ok: true };
    }
  }
  const cost = gripInstallCostAfterDiscount(state, card, discount);
  if (creditsAvailableForInstall(state, "runner") < cost) {
    log(state, `Install ${card.title} from heap — cannot afford ${cost}¢.`);
    return { ok: true };
  }
  spendCreditsForInstall(state, "runner", cost);
  state.runner.discard = state.runner.discard.filter((x) => x !== cardId);
  state.runner.rig.push(cardId);
  card.zone = "runner:rig";
  card.faceup = true;
  if ((card.recurringCreditsMax ?? 0) > 0) {
    card.recurringCredits = card.recurringCreditsMax;
  }
  if ((card.hostedCreditsOnInstall ?? 0) > 0) {
    card.hostedCredits = card.hostedCreditsOnInstall;
  }
  if ((card.powerCountersOnInstall ?? 0) > 0) {
    card.powerCounters = card.powerCountersOnInstall;
  }
  if (
    (card.handSizeBonus ?? 0) !== 0 ||
    (card.handSizePerPowerCounter ?? 0) !== 0
  ) {
    recomputeRunnerMaxHandSize(state);
  }
  if ((card.subtypes ?? []).includes("console")) {
    trashOtherConsoles(state, cardId);
  }
  noteInstalledThisTurn(state, cardId);
  if (card.type === "program") {
    state.turn.programsInstalledThisTurn += 1;
  }
  const src = state.cards[sourceId]?.title ?? sourceId;
  log(
    state,
    `Install ${card.title} from heap for ${cost}¢ (${discount}¢ discount; from ${src}; CR ${CR.runnerBasicInstall.number}).`,
  );
  if (card.onInstall) {
    const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
    if (!r.ok) return r;
  }
  noteVirusProgramInstalled(state, cardId);
  noteProgramOrHardwareInstalled(state, cardId);
  // Exile: whenever the Runner installs a program from the heap, draw 1.
  if (card.type === "program") {
    const idCard = state.cards[state.runner.identityId];
    if (idCard?.onInstallProgramFromHeap) {
      const r2 = evalEffect(
        { state, sourceId: idCard.id },
        idCard.onInstallProgramFromHeap,
      );
      if (!r2.ok) {
        log(
          state,
          `onInstallProgramFromHeap failed on ${idCard.title}: ${r2.error}`,
        );
      }
    }
  }
  return { ok: true };
}

/**
 * Flux Capacitor: after the first subroutine break this encounter with host
 * ice, offer may-charge. Returns true when a pendingChoice was opened.
 */
export function maybeFireFluxFirstBreakCharge(state: GameState): boolean {
  const enc = state.run?.encounter;
  if (!enc) return false;
  const brokenCount = enc.broken.filter(Boolean).length;
  if (brokenCount !== 1) return false;
  const fired = enc.firstBreakChargeFiredIds ?? [];
  for (const id of state.runner.rig) {
    const card = state.cards[id];
    if (
      !card?.chargeOnFirstBreakDuringHostEncounter ||
      card.hostId !== enc.iceId ||
      fired.includes(id)
    ) {
      continue;
    }
    enc.firstBreakChargeFiredIds = [...fired, id];
    const r = evalEffect({ state, sourceId: id }, fx.mayChargeChoose());
    if (!r.ok) {
      log(state, `Flux first-break charge failed on ${card.title}: ${r.error}`);
      continue;
    }
    if (state.pendingChoice) return true;
  }
  return false;
}

function offerMayChargeCard(
  state: GameState,
  cardId: string,
  sourceId: string,
): EvalResult {
  const card = state.cards[cardId];
  if (!card || (card.powerCounters ?? 0) < 1) {
    log(
      state,
      `May charge ${card?.title ?? cardId} — not able (CR ${CR.chargeRequiresCounter.number}).`,
    );
    return { ok: true };
  }
  state.pendingChoice = {
    sourceId,
    chooser: "runner",
    options: [
      {
        id: "charge",
        label: `Charge ${card.title}`,
        effect: {
          op: "do" as const,
          action: {
            kind: "charge" as const,
            pick: "card" as const,
            cardId,
          },
        },
      },
      {
        id: "decline",
        label: "Decline to charge",
        effect: {
          op: "do" as const,
          action: {
            kind: "gain_credits" as const,
            side: "runner" as const,
            amount: 0,
          },
        },
      },
    ],
  };
  log(
    state,
    `May charge ${card.title} (CR ${CR.charge.number}).`,
  );
  return { ok: true };
}

/** Deterministic stack shuffle used after searches (v0). */
function shuffleRunnerStack(state: GameState): void {
  state.runner.deck.reverse();
}

function stackProgramInstallCost(
  state: GameState,
  card: GameState["cards"][string],
): number {
  let cost = card.installCost;
  if (
    card.installCostDiscountIfSuccessfulRunThisTurn &&
    state.turn.successfulRunThisTurn
  ) {
    cost = Math.max(
      0,
      cost - card.installCostDiscountIfSuccessfulRunThisTurn,
    );
  }
  if (
    card.installCostDiscountIfSuccessfulHqRunThisTurn &&
    state.turn.successfulHqRunThisTurn
  ) {
    cost = Math.max(
      0,
      cost - card.installCostDiscountIfSuccessfulHqRunThisTurn,
    );
  }
  if (card.installCostDiscountPerInstalledIcebreaker) {
    cost = Math.max(
      0,
      cost -
        card.installCostDiscountPerInstalledIcebreaker *
          countInstalledIcebreakersForCost(state),
    );
  }
  if (card.type === "program" && state.turn.programsInstalledThisTurn === 0) {
    for (const id of state.runner.rig) {
      const discount = state.cards[id].firstProgramInstallDiscount ?? 0;
      if (discount > 0) cost = Math.max(0, cost - discount);
    }
  }
  return cost;
}

function canInstallStackProgram(
  state: GameState,
  cardId: string,
): boolean {
  const card = state.cards[cardId];
  if (!card || card.type !== "program") return false;
  if (card.installOnIce || (card.subtypes ?? []).includes("trojan")) {
    return false;
  }
  const need = effectiveMemoryCost(state, cardId);
  if (usedMemory(state) + need > memoryLimit(state)) return false;
  return state.runner.credits >= stackProgramInstallCost(state, card);
}

/**
 * Install a program from the Runner's stack paying full install cost.
 * Shuffles the remaining stack afterward.
 */
function installStackProgramPaying(
  state: GameState,
  cardId: string,
  sourceId: string,
): EvalResult {
  const card = state.cards[cardId];
  if (!card || !state.runner.deck.includes(cardId)) {
    return {
      ok: false,
      error: `install_stack_program: ${cardId} not in stack.`,
      cites: [CR.runnerBasicInstall],
    };
  }
  if (card.type !== "program") {
    return {
      ok: false,
      error: "install_stack_program requires a program.",
      cites: [CR.runnerBasicInstall],
    };
  }
  if (!canInstallStackProgram(state, cardId)) {
    log(
      state,
      `Install ${card.title} from stack — cannot afford or insufficient MU.`,
    );
    shuffleRunnerStack(state);
    return { ok: true };
  }
  const cost = stackProgramInstallCost(state, card);
  state.runner.credits -= cost;
  state.runner.deck = state.runner.deck.filter((x) => x !== cardId);
  state.runner.rig.push(cardId);
  card.zone = "runner:rig";
  card.faceup = true;
  if ((card.recurringCreditsMax ?? 0) > 0) {
    card.recurringCredits = card.recurringCreditsMax;
  }
  if ((card.hostedCreditsOnInstall ?? 0) > 0) {
    card.hostedCredits = card.hostedCreditsOnInstall;
  }
  if ((card.powerCountersOnInstall ?? 0) > 0) {
    card.powerCounters = card.powerCountersOnInstall;
  }
  if (
    (card.handSizeBonus ?? 0) !== 0 ||
    (card.handSizePerPowerCounter ?? 0) !== 0
  ) {
    recomputeRunnerMaxHandSize(state);
  }
  if ((card.subtypes ?? []).includes("console")) {
    trashOtherConsoles(state, cardId);
  }
  noteInstalledThisTurn(state, cardId);
  state.turn.programsInstalledThisTurn += 1;
  shuffleRunnerStack(state);
  const src = state.cards[sourceId]?.title ?? sourceId;
  log(
    state,
    `Search stack — install ${card.title} for ${cost}¢ (from ${src}; CR ${CR.runnerBasicInstall.number}).`,
  );
  if (card.onInstall) {
    const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
    if (!r.ok) return r;
  }
  noteVirusProgramInstalled(state, cardId);
  noteProgramOrHardwareInstalled(state, cardId);
  return { ok: true };
}

function stackCardInstallCost(
  state: GameState,
  card: GameState["cards"][string],
  discount: number,
): number {
  return gripInstallCostAfterDiscount(state, card, discount);
}

function canInstallStackCard(
  state: GameState,
  cardId: string,
  discount: number,
): boolean {
  const card = state.cards[cardId];
  if (!card) return false;
  if (!["program", "hardware", "resource"].includes(card.type)) return false;
  if (card.installOnIce || (card.subtypes ?? []).includes("trojan")) {
    return false;
  }
  if (card.type === "program") {
    const need = effectiveMemoryCost(state, cardId);
    if (usedMemory(state) + need > memoryLimit(state)) return false;
  }
  return (
    creditsAvailableForInstall(state, "runner") >=
    stackCardInstallCost(state, card, discount)
  );
}

/**
 * Install program/hardware/resource from stack paying `discount`¢ less.
 * Shuffles the remaining stack afterward.
 */
function installStackCardPaying(
  state: GameState,
  cardId: string,
  discount: number,
  sourceId: string,
): EvalResult {
  const card = state.cards[cardId];
  if (!card || !state.runner.deck.includes(cardId)) {
    return {
      ok: false,
      error: `install_stack_card: ${cardId} not in stack.`,
      cites: [CR.runnerBasicInstall],
    };
  }
  if (!["program", "hardware", "resource"].includes(card.type)) {
    return {
      ok: false,
      error: "install_stack_card supports program/hardware/resource.",
      cites: [CR.runnerBasicInstall],
    };
  }
  if (!canInstallStackCard(state, cardId, discount)) {
    log(
      state,
      `Install ${card.title} from stack — cannot afford or insufficient MU.`,
    );
    shuffleRunnerStack(state);
    return { ok: true };
  }
  const cost = stackCardInstallCost(state, card, discount);
  spendCreditsForInstall(state, "runner", cost);
  state.runner.deck = state.runner.deck.filter((x) => x !== cardId);
  state.runner.rig.push(cardId);
  card.zone = "runner:rig";
  card.faceup = true;
  if ((card.recurringCreditsMax ?? 0) > 0) {
    card.recurringCredits = card.recurringCreditsMax;
  }
  if ((card.hostedCreditsOnInstall ?? 0) > 0) {
    card.hostedCredits = card.hostedCreditsOnInstall;
  }
  if ((card.powerCountersOnInstall ?? 0) > 0) {
    card.powerCounters = card.powerCountersOnInstall;
  }
  if (
    (card.handSizeBonus ?? 0) !== 0 ||
    (card.handSizePerPowerCounter ?? 0) !== 0
  ) {
    recomputeRunnerMaxHandSize(state);
  }
  if ((card.subtypes ?? []).includes("console")) {
    trashOtherConsoles(state, cardId);
  }
  noteInstalledThisTurn(state, cardId);
  if (card.type === "program") {
    state.turn.programsInstalledThisTurn += 1;
  }
  shuffleRunnerStack(state);
  const src = state.cards[sourceId]?.title ?? sourceId;
  log(
    state,
    `Search stack — install ${card.title} for ${cost}¢ (${discount}¢ discount; from ${src}; CR ${CR.runnerBasicInstall.number}).`,
  );
  if (card.onInstall) {
    const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
    if (!r.ok) return r;
  }
  noteVirusProgramInstalled(state, cardId);
  noteProgramOrHardwareInstalled(state, cardId);
  return { ok: true };
}

function searchStackTypeInstall(
  state: GameState,
  sourceId: string,
  cardType: "program" | "hardware" | "resource",
  discount: number,
): EvalResult {
  const matches = state.runner.deck.filter((id) => {
    const c = state.cards[id];
    return (
      c.type === cardType &&
      !c.installOnIce &&
      !(c.subtypes ?? []).includes("trojan")
    );
  });
  if (matches.length === 0) {
    shuffleRunnerStack(state);
    log(state, `Search stack for a ${cardType} — none found.`);
    return { ok: true };
  }
  const affordable = matches.filter((id) =>
    canInstallStackCard(state, id, discount),
  );
  if (affordable.length === 0) {
    shuffleRunnerStack(state);
    log(
      state,
      `Search stack for a ${cardType} — ${matches.length} found but none affordable.`,
    );
    return { ok: true };
  }
  if (affordable.length === 1) {
    return installStackCardPaying(
      state,
      affordable[0]!,
      discount,
      sourceId,
    );
  }
  state.pendingChoice = {
    sourceId,
    chooser: "runner",
    options: affordable.map((id) => {
      const c = state.cards[id];
      const cost = stackCardInstallCost(state, c, discount);
      return {
        id: `stack-install-${id}`,
        label: `Install ${c.title} for ${cost}¢`,
        effect: {
          op: "do" as const,
          action: {
            kind: "install_stack_card" as const,
            cardId: id,
            discount,
          },
        },
      };
    }),
  };
  log(
    state,
    `Search stack — choose among ${affordable.length} ${cardType}(s) to install.`,
  );
  return { ok: true };
}


function installSetAsideCardPayingNoShuffle(
  state: GameState,
  cardId: string,
  discount: number,
): EvalResult {
  const card = state.cards[cardId];
  if (!card || !(state.runner.setAside ?? []).includes(cardId)) {
    return {
      ok: false,
      error: `set-aside install: ${cardId} not set aside.`,
      cites: [CR.runnerBasicInstall],
    };
  }
  const isProg = card.type === "program";
  const isVirt =
    card.type === "resource" && (card.subtypes ?? []).includes("virtual");
  if (!isProg && !isVirt) {
    return {
      ok: false,
      error: "Gachapon install requires a program or virtual resource.",
      cites: [CR.runnerBasicInstall],
    };
  }
  if (isProg) {
    if (card.installOnIce || (card.subtypes ?? []).includes("trojan")) {
      return { ok: true };
    }
    const need = effectiveMemoryCost(state, cardId);
    if (usedMemory(state) + need > memoryLimit(state)) {
      log(state, `Install ${card.title} — insufficient MU.`);
      return { ok: true };
    }
  }
  const cost = Math.max(0, (card.installCost ?? 0) - discount);
  if (state.runner.credits < cost) {
    log(state, `Install ${card.title} — cannot afford ${cost}¢.`);
    return { ok: true };
  }
  state.runner.credits -= cost;
  state.runner.setAside = (state.runner.setAside ?? []).filter((x) => x !== cardId);
  state.runner.rig.push(cardId);
  card.zone = "runner:rig";
  card.faceup = true;
  if ((card.recurringCreditsMax ?? 0) > 0) {
    card.recurringCredits = card.recurringCreditsMax;
  }
  if ((card.hostedCreditsOnInstall ?? 0) > 0) {
    card.hostedCredits = card.hostedCreditsOnInstall;
  }
  if ((card.powerCountersOnInstall ?? 0) > 0) {
    card.powerCounters = card.powerCountersOnInstall;
  }
  if (
    (card.handSizeBonus ?? 0) !== 0 ||
    (card.handSizePerPowerCounter ?? 0) !== 0
  ) {
    recomputeRunnerMaxHandSize(state);
  }
  if ((card.subtypes ?? []).includes("console")) {
    trashOtherConsoles(state, cardId);
  }
  noteInstalledThisTurn(state, cardId);
  if (isProg) state.turn.programsInstalledThisTurn += 1;
  log(
    state,
    `Install ${card.title} from set-aside for ${cost}¢ (−${discount}¢; CR ${CR.runnerBasicInstall.number}).`,
  );
  if (card.onInstall) {
    const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
    if (!r.ok) return r;
  }
  if (isProg) noteVirusProgramInstalled(state, cardId);
  noteProgramOrHardwareInstalled(state, cardId);
  return { ok: true };
}

function heapCardsWithTrashAbilities(state: GameState): string[] {
  return state.runner.discard.filter((id) => {
    const card = state.cards[id];
    if (!card) return false;
    if (card.trashCost !== undefined) return true;
    return (card.paidAbilities ?? []).some((a) => Boolean(a.cost?.trashSelf));
  });
}

function rfgRunnerSetAside(state: GameState): void {
  const aside = [...(state.runner.setAside ?? [])];
  for (const id of aside) {
    const card = state.cards[id];
    if (!card) continue;
    if (card.zone !== "runner:set-aside") continue;
    card.zone = "removed-from-game";
    card.faceup = true;
    if (!state.removedFromGame) state.removedFromGame = [];
    if (!state.removedFromGame.includes(id)) state.removedFromGame.push(id);
  }
  state.runner.setAside = [];
  if (aside.length > 0) {
    log(state, `Remove ${aside.length} set-aside card(s) from the game.`);
  }
}

function shuffleRunnerSetAsideIntoStack(state: GameState): void {
  const aside = state.runner.setAside ?? [];
  for (const id of aside) {
    if (state.cards[id]?.zone !== "runner:set-aside") continue;
    state.runner.deck.push(id);
    state.cards[id]!.zone = "runner:stack";
    state.cards[id]!.faceup = false;
  }
  state.runner.setAside = [];
  shuffleRunnerStack(state);
  log(
    state,
    `Shuffle ${aside.length} set-aside card(s) into the stack.`,
  );
}

function offerBurnerMoves(
  state: GameState,
  sourceId: string,
  revealed: string[],
  movesLeft: number,
): EvalResult {
  const stillInHq = revealed.filter((id) => state.corp.hand.includes(id));
  if (movesLeft <= 0 || stillInHq.length === 0) {
    for (const id of stillInHq) {
      state.cards[id]!.faceup = false;
    }
    log(state, `Burner — reveal/move complete.`);
    return { ok: true };
  }
  const options: Array<{ id: string; label: string; effect: Effect }> = [];
  for (const id of stillInHq) {
    const title = state.cards[id]!.title;
    options.push({
      id: `top:${id}`,
      label: `Top of R&D: ${title}`,
      effect: {
        op: "do",
        action: {
          kind: "burner_place",
          cardId: id,
          position: "top",
          revealed,
          movesLeft: movesLeft - 1,
        },
      },
    });
    options.push({
      id: `bottom:${id}`,
      label: `Bottom of R&D: ${title}`,
      effect: {
        op: "do",
        action: {
          kind: "burner_place",
          cardId: id,
          position: "bottom",
          revealed,
          movesLeft: movesLeft - 1,
        },
      },
    });
  }
  state.pendingChoice = { sourceId, chooser: "runner", options };
  log(
    state,
    `Burner — choose ${movesLeft} more card(s) to move to R&D top/bottom.`,
  );
  return { ok: true };
}

function museZoneCards(
  state: GameState,
  zone: "stack" | "heap" | "grip",
): string[] {
  if (zone === "stack") return state.runner.deck;
  if (zone === "heap") return state.runner.discard;
  return state.runner.hand;
}

function museEligiblePrograms(
  state: GameState,
  zone: "stack" | "heap" | "grip",
): string[] {
  return museZoneCards(state, zone).filter((id) => {
    const c = state.cards[id];
    if (!c || c.type !== "program") return false;
    return !(c.subtypes ?? []).includes("daemon");
  });
}

function removeMuseProgramFromZone(
  state: GameState,
  cardId: string,
  from: "stack" | "heap" | "grip",
): void {
  if (from === "stack") {
    state.runner.deck = state.runner.deck.filter((x) => x !== cardId);
  } else if (from === "heap") {
    state.runner.discard = state.runner.discard.filter((x) => x !== cardId);
  } else {
    state.runner.hand = state.runner.hand.filter((x) => x !== cardId);
  }
}

function finishMuseInstall(
  state: GameState,
  cardId: string,
  from: "stack" | "heap" | "grip",
  sourceId: string,
  hostId: string | undefined,
  onIce: boolean,
): EvalResult {
  const card = state.cards[cardId];
  if (!card) {
    return {
      ok: false,
      error: `muse install: missing ${cardId}`,
      cites: [CR.runnerBasicInstall],
    };
  }
  const inZone = museZoneCards(state, from).includes(cardId);
  if (!inZone) {
    log(state, `Muse — ${card.title} no longer in ${from}.`);
    if (from === "stack") shuffleRunnerStack(state);
    return { ok: true };
  }
  const cost = gripInstallCostAfterDiscount(state, card, 0);
  const hostOnDaemon =
    hostId !== undefined && Boolean(state.cards[hostId]?.daemonHost);
  if (!onIce && !hostOnDaemon && card.type === "program") {
    const need = effectiveMemoryCost(state, cardId);
    if (usedMemory(state) + need > memoryLimit(state)) {
      log(state, `Muse — insufficient MU for ${card.title}.`);
      if (from === "stack") shuffleRunnerStack(state);
      return { ok: true };
    }
  }
  if (creditsAvailableForInstall(state, "runner") < cost) {
    log(state, `Muse — cannot afford ${card.title} (${cost}¢).`);
    if (from === "stack") shuffleRunnerStack(state);
    return { ok: true };
  }
  spendCreditsForInstall(state, "runner", cost);
  removeMuseProgramFromZone(state, cardId, from);
  state.runner.rig.push(cardId);
  card.zone = "runner:rig";
  card.faceup = true;
  if (hostId) card.hostId = hostId;
  if ((card.recurringCreditsMax ?? 0) > 0) {
    card.recurringCredits = card.recurringCreditsMax;
  }
  if ((card.hostedCreditsOnInstall ?? 0) > 0) {
    card.hostedCredits = card.hostedCreditsOnInstall;
  }
  if ((card.powerCountersOnInstall ?? 0) > 0) {
    card.powerCounters = card.powerCountersOnInstall;
  }
  noteInstalledThisTurn(state, cardId);
  state.turn.programsInstalledThisTurn += 1;
  if (from === "stack") shuffleRunnerStack(state);
  const hostTitle = hostId ? state.cards[hostId]?.title ?? hostId : "rig";
  log(
    state,
    `Muse (${state.cards[sourceId]?.title ?? sourceId}) — install ${card.title} for ${cost}¢ hosted on ${hostTitle}.`,
  );
  if (card.onInstall) {
    const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
    if (!r.ok) return r;
  }
  noteVirusProgramInstalled(state, cardId);
  noteProgramOrHardwareInstalled(state, cardId);
  return { ok: true };
}

function canInstallSetAsideIgnoringCosts(
  state: GameState,
  cardId: string,
): boolean {
  const card = state.cards[cardId];
  if (!card) return false;
  if (!["program", "hardware", "resource"].includes(card.type)) return false;
  if (card.installOnIce || (card.subtypes ?? []).includes("trojan")) {
    return false;
  }
  const aside = state.runner.setAside ?? [];
  if (!aside.includes(cardId)) return false;
  if (card.type === "program") {
    const need = effectiveMemoryCost(state, cardId);
    if (usedMemory(state) + need > memoryLimit(state)) return false;
  }
  return true;
}

function installSetAsideIgnoringCosts(
  state: GameState,
  cardId: string,
  sourceId: string,
): EvalResult {
  const card = state.cards[cardId];
  if (!card || !(state.runner.setAside ?? []).includes(cardId)) {
    return {
      ok: false,
      error: `wizard_chest_install: ${cardId} not set aside.`,
      cites: [CR.runnerBasicInstall],
    };
  }
  if (!canInstallSetAsideIgnoringCosts(state, cardId)) {
    log(
      state,
      `Install ${card.title} from set-aside ignoring costs — cannot (MU/type).`,
    );
    shuffleRunnerSetAsideIntoStack(state);
    return { ok: true };
  }
  state.runner.setAside = (state.runner.setAside ?? []).filter(
    (x) => x !== cardId,
  );
  state.runner.rig.push(cardId);
  card.zone = "runner:rig";
  card.faceup = true;
  if ((card.recurringCreditsMax ?? 0) > 0) {
    card.recurringCredits = card.recurringCreditsMax;
  }
  if ((card.hostedCreditsOnInstall ?? 0) > 0) {
    card.hostedCredits = card.hostedCreditsOnInstall;
  }
  if ((card.powerCountersOnInstall ?? 0) > 0) {
    card.powerCounters = card.powerCountersOnInstall;
  }
  if (
    (card.handSizeBonus ?? 0) !== 0 ||
    (card.handSizePerPowerCounter ?? 0) !== 0
  ) {
    recomputeRunnerMaxHandSize(state);
  }
  if ((card.subtypes ?? []).includes("console")) {
    trashOtherConsoles(state, cardId);
  }
  noteInstalledThisTurn(state, cardId);
  if (card.type === "program") {
    state.turn.programsInstalledThisTurn += 1;
  }
  shuffleRunnerSetAsideIntoStack(state);
  const src = state.cards[sourceId]?.title ?? sourceId;
  log(
    state,
    `Install ${card.title} from set-aside ignoring all costs (from ${src}; CR ${CR.runnerBasicInstall.number}).`,
  );
  if (card.onInstall) {
    const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
    if (!r.ok) return r;
  }
  noteVirusProgramInstalled(state, cardId);
  noteProgramOrHardwareInstalled(state, cardId);
  return { ok: true };
}

function canInstallSetAsideProgram(
  state: GameState,
  cardId: string,
  discount: number,
): boolean {
  const card = state.cards[cardId];
  if (!card || card.type !== "program") return false;
  if (card.installOnIce || (card.subtypes ?? []).includes("trojan")) {
    return false;
  }
  const aside = state.runner.setAside ?? [];
  if (!aside.includes(cardId)) return false;
  const need = effectiveMemoryCost(state, cardId);
  if (usedMemory(state) + need > memoryLimit(state)) return false;
  return state.runner.credits >= stackCardInstallCost(state, card, discount);
}

function installSetAsideProgramPaying(
  state: GameState,
  cardId: string,
  discount: number,
  sourceId: string,
): EvalResult {
  const card = state.cards[cardId];
  if (!card || !(state.runner.setAside ?? []).includes(cardId)) {
    return {
      ok: false,
      error: `install_set_aside_program: ${cardId} not set aside.`,
      cites: [CR.runnerBasicInstall],
    };
  }
  if (card.type !== "program") {
    return {
      ok: false,
      error: "install_set_aside_program requires a program.",
      cites: [CR.runnerBasicInstall],
    };
  }
  if (!canInstallSetAsideProgram(state, cardId, discount)) {
    log(
      state,
      `Install ${card.title} from set-aside — cannot afford or insufficient MU.`,
    );
    shuffleRunnerSetAsideIntoStack(state);
    return { ok: true };
  }
  const cost = stackCardInstallCost(state, card, discount);
  state.runner.credits -= cost;
  state.runner.setAside = (state.runner.setAside ?? []).filter(
    (x) => x !== cardId,
  );
  state.runner.rig.push(cardId);
  card.zone = "runner:rig";
  card.faceup = true;
  if ((card.recurringCreditsMax ?? 0) > 0) {
    card.recurringCredits = card.recurringCreditsMax;
  }
  if ((card.hostedCreditsOnInstall ?? 0) > 0) {
    card.hostedCredits = card.hostedCreditsOnInstall;
  }
  if ((card.powerCountersOnInstall ?? 0) > 0) {
    card.powerCounters = card.powerCountersOnInstall;
  }
  if (
    (card.handSizeBonus ?? 0) !== 0 ||
    (card.handSizePerPowerCounter ?? 0) !== 0
  ) {
    recomputeRunnerMaxHandSize(state);
  }
  if ((card.subtypes ?? []).includes("console")) {
    trashOtherConsoles(state, cardId);
  }
  noteInstalledThisTurn(state, cardId);
  state.turn.programsInstalledThisTurn += 1;
  shuffleRunnerSetAsideIntoStack(state);
  const src = state.cards[sourceId]?.title ?? sourceId;
  log(
    state,
    `Install ${card.title} from set-aside for ${cost}¢ (${discount}¢ discount; from ${src}; CR ${CR.runnerBasicInstall.number}).`,
  );
  if (card.onInstall) {
    const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
    if (!r.ok) return r;
  }
  noteVirusProgramInstalled(state, cardId);
  noteProgramOrHardwareInstalled(state, cardId);
  return { ok: true };
}

function searchStackProgramInstall(
  state: GameState,
  sourceId: string,
): EvalResult {
  const matches = state.runner.deck.filter((id) => {
    const c = state.cards[id];
    return (
      c.type === "program" &&
      !c.installOnIce &&
      !(c.subtypes ?? []).includes("trojan")
    );
  });
  if (matches.length === 0) {
    shuffleRunnerStack(state);
    log(state, `Search stack for a program — none found.`);
    return { ok: true };
  }
  const affordable = matches.filter((id) => canInstallStackProgram(state, id));
  if (affordable.length === 0) {
    shuffleRunnerStack(state);
    log(
      state,
      `Search stack for a program — ${matches.length} found but none affordable.`,
    );
    return { ok: true };
  }
  if (affordable.length === 1) {
    return installStackProgramPaying(state, affordable[0]!, sourceId);
  }
  state.pendingChoice = {
    sourceId,
    chooser: "runner",
    options: affordable.map((id) => {
      const c = state.cards[id];
      const cost = stackProgramInstallCost(state, c);
      return {
        id: `stack-install-${id}`,
        label: `Install ${c.title} for ${cost}¢`,
        effect: {
          op: "do" as const,
          action: {
            kind: "install_stack_program" as const,
            cardId: id,
          },
        },
      };
    }),
  };
  log(
    state,
    `Search stack — choose among ${affordable.length} programs to install.`,
  );
  return { ok: true };
}

/**
 * Offer the next unused exclusive option, or auto-resolve when only one
 * remains. Clears `pendingExclusiveChoices` when done.
 */
export function offerNextExclusiveChoice(state: GameState): EvalResult {
  const pend = state.pendingExclusiveChoices;
  if (!pend || pend.remaining <= 0) {
    state.pendingExclusiveChoices = null;
    return { ok: true };
  }
  const available = pend.options.filter((o) => !pend.usedIds.includes(o.id));
  if (available.length === 0) {
    state.pendingExclusiveChoices = null;
    log(state, `Exclusive choices — no unused options left.`);
    return { ok: true };
  }
  if (available.length === 1) {
    const o = available[0]!;
    pend.usedIds.push(o.id);
    pend.remaining -= 1;
    log(state, `Exclusive choice auto-resolve "${o.label}".`);
    const r = evalEffect({ state, sourceId: pend.sourceId }, o.effect);
    if (!r.ok) return r;
    if (
      state.pendingChoice ||
      state.pendingTrashProgram ||
      state.pendingSabotage ||
      state.pendingDamage ||
      state.trace
    ) {
      return r;
    }
    return offerNextExclusiveChoice(state);
  }
  state.pendingChoice = {
    sourceId: pend.sourceId,
    chooser: pend.chooser,
    options: available.map((o) => ({
      id: o.id,
      label: o.label,
      effect: structuredClone(o.effect),
    })),
  };
  log(
    state,
    `Exclusive choices — ${pend.remaining} remaining among ${available.length} options (from ${state.cards[pend.sourceId]?.title ?? pend.sourceId}).`,
  );
  return { ok: true };
}

/**
 * After a nested pendingChoice resolves, continue exclusive multi-choice
 * if any remain. Call from choose_option after the selected effect settles.
 */
export function resumeExclusiveChoicesIfPending(state: GameState): EvalResult {
  if (!state.pendingExclusiveChoices) return { ok: true };
  if (
    state.pendingChoice ||
    state.pendingTrashProgram ||
    state.pendingSabotage ||
    state.pendingDamage ||
    state.trace
  ) {
    return { ok: true };
  }
  return offerNextExclusiveChoice(state);
}

function startExclusiveChoicesExactlyN(
  state: GameState,
  sourceId: string,
  n: number,
  options: Array<{ id: string; label: string; effect: Effect }>,
  chooser: "corp" | "runner",
): EvalResult {
  const remaining = Math.min(n, options.length);
  if (remaining <= 0) {
    log(state, `Choose exactly ${n} — no options to resolve.`);
    return { ok: true };
  }
  state.pendingExclusiveChoices = {
    sourceId,
    chooser,
    options: options.map((o) => ({
      id: o.id,
      label: o.label,
      effect: structuredClone(o.effect),
    })),
    remaining,
    usedIds: [],
  };
  log(
    state,
    `Choose exactly ${n} — resolve ${remaining} exclusive option(s).`,
  );
  return offerNextExclusiveChoice(state);
}

function startExclusiveChoicesPerPassedIce(
  state: GameState,
  sourceId: string,
  options: Array<{ id: string; label: string; effect: Effect }>,
): EvalResult {
  const passed = state.run?.passedIceIds?.length ?? 0;
  const remaining = Math.min(passed, options.length);
  if (remaining <= 0) {
    log(
      state,
      `Exclusive choices per passed ice — passed ${passed}; nothing to resolve.`,
    );
    return { ok: true };
  }
  state.pendingExclusiveChoices = {
    sourceId,
    chooser: "runner",
    options: options.map((o) => ({
      id: o.id,
      label: o.label,
      effect: structuredClone(o.effect),
    })),
    remaining,
    usedIds: [],
  };
  log(
    state,
    `Exclusive choices per passed ice — passed ${passed}, resolve ${remaining} (CR ${CR.successfulRun.number}).`,
  );
  return offerNextExclusiveChoice(state);
}

function iceProtectsRemote(state: GameState, iceId: string): boolean {
  for (const server of Object.values(state.servers)) {
    if (server.ice.includes(iceId)) {
      return server.kind === "remote";
    }
  }
  return false;
}

function iceProtectsCentral(state: GameState, iceId: string): boolean {
  for (const server of Object.values(state.servers)) {
    if (server.ice.includes(iceId)) {
      return server.kind === "central";
    }
  }
  return false;
}

function serverHostingCard(
  state: GameState,
  cardId: string,
): import("../state/types.js").Server | null {
  for (const server of Object.values(state.servers)) {
    if (server.root.includes(cardId) || server.ice.includes(cardId)) {
      return server;
    }
  }
  return null;
}

function hostServerUnprotectedByIce(
  state: GameState,
  sourceId: string,
): boolean {
  const server = serverHostingCard(state, sourceId);
  if (!server) return false;
  return server.ice.length === 0;
}

function returnRdLookedToDeckTop(state: GameState): void {
  const ids = state.turn.rdLookedCards;
  if (ids.length === 0) return;
  for (const id of ids) {
    state.cards[id].faceup = false;
    state.cards[id].zone = "corp:rd";
  }
  state.corp.deck = [...ids, ...state.corp.deck];
  state.turn.rdLookedCards = [];
  state.turn.rdArrangePlaced = [];
}

function finishRdArrange(state: GameState, sourceId: string): EvalResult {
  const placed = state.turn.rdArrangePlaced;
  for (const id of placed) {
    state.cards[id].faceup = false;
    state.cards[id].zone = "corp:rd";
  }
  state.corp.deck = [...placed, ...state.corp.deck];
  state.turn.rdArrangePlaced = [];
  state.turn.rdLookedCards = [];
  const maybeDraw = state.turn.rdArrangeThenMayDrawIfUnprotected;
  state.turn.rdArrangeThenMayDrawIfUnprotected = false;
  log(state, `R&D rearranged (${placed.length} cards).`);
  if (maybeDraw && hostServerUnprotectedByIce(state, sourceId)) {
    state.pendingChoice = {
      sourceId,
      chooser: "corp",
      options: [
        {
          id: "draw",
          label: "Draw 1 card",
          effect: { op: "do", action: { kind: "draw", side: "corp", amount: 1 } },
        },
        {
          id: "decline",
          label: "Decline to draw",
          effect: { op: "do", action: { kind: "gain_credits", side: "corp", amount: 0 } },
        },
      ],
    };
    log(state, `Federal — host server unprotected; may draw 1.`);
  }
  return { ok: true };
}

function offerRdArrangeChoice(
  state: GameState,
  sourceId: string,
): EvalResult {
  const remaining = state.turn.rdLookedCards;
  if (remaining.length === 0) {
    return finishRdArrange(state, sourceId);
  }
  state.pendingChoice = {
    sourceId,
    chooser: state.cards[sourceId]?.side === "runner" ? "runner" : "corp",
    options: remaining.map((id) => ({
      id: `rd-arrange:${id}`,
      label: `Place ${state.cards[id].title} on top next`,
      effect: {
        op: "do" as const,
        action: { kind: "rd_arrange_pick" as const, cardId: id },
      },
    })),
  };
  log(state, `Arrange R&D — choose next card for top (${remaining.length} remaining).`);
  return { ok: true };
}

function offerCultivateTrashChoice(
  state: GameState,
  sourceId: string,
): EvalResult {
  const remaining = state.turn.rdLookedCards;
  state.pendingChoice = {
    sourceId,
    chooser: "corp",
    options: remaining.map((id) => ({
      id: `cultivate-trash:${id}`,
      label: `Trash ${state.cards[id].title}`,
      effect: {
        op: "do" as const,
        action: { kind: "cultivate_trash_looked" as const, cardId: id },
      },
    })),
  };
  log(state, `Cultivate — choose 1 to trash.`);
  return { ok: true };
}

function offerCultivateHqChoice(
  state: GameState,
  sourceId: string,
): EvalResult {
  const remaining = state.turn.rdLookedCards;
  state.pendingChoice = {
    sourceId,
    chooser: "corp",
    options: remaining.map((id) => ({
      id: `cultivate-hq:${id}`,
      label: `Add ${state.cards[id].title} to HQ`,
      effect: {
        op: "do" as const,
        action: { kind: "cultivate_hq_looked" as const, cardId: id },
      },
    })),
  };
  log(state, `Cultivate — choose 1 to add to HQ.`);
  return { ok: true };
}

function shuffleCorpRdAfterSearch(state: GameState): void {
  state.corp.deck.reverse();
}

function corpCardInstallable(type: string): boolean {
  return (
    type === "agenda" ||
    type === "asset" ||
    type === "ice" ||
    type === "upgrade"
  );
}

type TrashInstalledParams = {
  rezzedOnly?: boolean;
  includeSubtypes?: string[];
  attackedServerOnly?: boolean;
};

/** Legal targets for `trash_installed` (LEO Labor Solutions gate). */
export function trashInstalledLegalTargets(
  state: GameState,
  _sourceId: string,
  action: TrashInstalledParams,
): string[] {
  const targets: string[] = [];
  const attacked = action.attackedServerOnly
    ? state.run?.attackedServerId
    : undefined;
  if (action.attackedServerOnly && !attacked) return targets;
  const servers = attacked
    ? [state.servers[attacked]].filter(Boolean)
    : Object.values(state.servers);
  for (const server of servers) {
    if (!server) continue;
    for (const id of [...server.root, ...server.ice]) {
      const c = state.cards[id];
      if (!c || c.side !== "corp") continue;
      if (action.rezzedOnly && !c.rezzed) continue;
      if (action.includeSubtypes?.length) {
        const subs = c.subtypes ?? [];
        if (!action.includeSubtypes.some((st) => subs.includes(st))) {
          continue;
        }
      }
      targets.push(id);
    }
  }
  return targets;
}

function resolveInstallServerId(
  state: GameState,
  serverId: string,
): import("../state/types.js").ServerId | null {
  if (serverId !== "__new_remote__") {
    const sid = serverId as import("../state/types.js").ServerId;
    return state.servers[sid] ? sid : null;
  }
  const remoteNum = state.nextRemoteNumber++;
  const sid =
    `remote-${remoteNum}` as import("../state/types.js").ServerId;
  state.servers[sid] = { id: sid, kind: "remote", ice: [], root: [] };
  return sid;
}

function finishPlaceAdvancementsOnTarget(
  ctx: EffectCtx,
  action: Extract<Primitive, { kind: "place_advancements" }>,
  sourceId: string,
  source: import("../state/types.js").CardInstance,
  targetId: string,
): EvalResult {
  const { state } = ctx;
  const target = state.cards[targetId];
  if (!target) {
    log(state, `Place advancements — invalid target.`);
    if (action.then) return evalEffect(ctx, action.then);
    return { ok: true };
  }
  let amount = action.amount;
  if (
    (action.bonusAmountIfNoCorpInstallFromHqThisTurn ?? 0) > 0 &&
    !state.turn.corpInstalledFromHqThisTurn
  ) {
    amount += action.bonusAmountIfNoCorpInstallFromHqThisTurn!;
  }
  target.advancementTokens = (target.advancementTokens ?? 0) + amount;
  state.turn.lastAdvancementTargetId = targetId;
  syncGainsSubroutinesPerAdvancement(target);
  if (action.cannotScoreTargetThisTurn) {
    if (!state.turn.cannotScoreOrRezCardIds.includes(targetId)) {
      state.turn.cannotScoreOrRezCardIds.push(targetId);
    }
  }
  log(
    state,
    `Place ${amount} advancement(s) on ${target.title} → ${target.advancementTokens}.`,
  );
  const after = action.then;
  if (action.thenMayScore && canScoreAgenda(state, target)) {
    const scoreFx: Effect = {
      op: "do",
      action: { kind: "score_agenda_card", cardId: targetId },
    };
    const options: Array<{ id: string; label: string; effect: Effect }> = [
      {
        id: `score:${targetId}`,
        label: `Score ${target.title}`,
        effect: after
          ? { op: "seq", effects: [scoreFx, structuredClone(after)] }
          : scoreFx,
      },
      {
        id: "decline",
        label: "Decline",
        effect: after
          ? structuredClone(after)
          : {
              op: "do",
              action: {
                kind: "gain_credits",
                side: "corp",
                amount: 0,
              },
            },
      },
    ];
    state.pendingChoice = {
      sourceId,
      chooser: "corp",
      options,
    };
    log(
      state,
      `${source.title} — may score ${target.title} (CR ${CR.scoringAgenda.number}).`,
    );
    return { ok: true };
  }
  if (after) return evalEffect(ctx, after);
  return { ok: true };
}

function evalCond(ctx: EffectCtx, cond: Cond): boolean {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (cond.op) {
    case "true":
      return true;
    case "false":
      return false;
    case "during_run":
      return state.run !== null;
    case "source_is_breaker":
      return Boolean(source.breaker);
    case "source_is_ice":
      return source.type === "ice";
    case "source_rezzed":
      return Boolean(source.rezzed);
    case "grip_nonempty":
      return state.runner.hand.length > 0;
    case "has_installed_program":
      return state.runner.rig.some((id) => state.cards[id].type === "program");
    case "runner_tagged":
      return runnerIsTagged(state);
    case "tags_gte":
      return effectiveRunnerTags(state) >= cond.amount;
    case "first_mandate_this_turn":
      // Sudden Commandment is counted when played; first means ≤ 1 including self.
      return (state.turn.mandatesPlayedThisTurn ?? 0) <= 1;
    case "clicks_remaining": {
      const side = resolveSide(ctx, cond.side);
      const p = side === "corp" ? state.corp : state.runner;
      return p.clicks > 0;
    }
    case "clicks_gte": {
      const side = resolveSide(ctx, cond.side);
      const p = side === "corp" ? state.corp : state.runner;
      return p.clicks >= cond.amount;
    }
    case "credits_gt_other_side": {
      const side = resolveSide(ctx, cond.side);
      const mine = side === "corp" ? state.corp.credits : state.runner.credits;
      const theirs = side === "corp" ? state.runner.credits : state.corp.credits;
      return mine > theirs;
    }
    case "credits_eq_other_side": {
      const side = resolveSide(ctx, cond.side);
      const mine = side === "corp" ? state.corp.credits : state.runner.credits;
      const theirs = side === "corp" ? state.runner.credits : state.corp.credits;
      return mine === theirs;
    }
    case "credits_lte": {
      const side = resolveSide(ctx, cond.side);
      const p = side === "corp" ? state.corp : state.runner;
      return p.credits <= cond.amount;
    }
    case "credits_gte": {
      const side = resolveSide(ctx, cond.side);
      const p = side === "corp" ? state.corp : state.runner;
      return p.credits >= cond.amount;
    }
    case "protecting_remote":
      return iceProtectsRemote(state, sourceId);
    case "protecting_central":
      return iceProtectsCentral(state, sourceId);
    case "not":
      return !evalCond(ctx, cond.cond);
    case "ice_rezzed_this_turn":
      return (state.turn.iceRezzedThisTurn ?? 0) > 0;
    case "self_scored_this_turn":
      return (state.turn.scoredCardIdsThisTurn ?? []).includes(sourceId);
    case "hq_nonempty":
      return state.corp.hand.length > 0;
    case "has_installed_resource":
      return state.runner.rig.some((id) => state.cards[id].type === "resource");
    case "grip_count_odd":
      return state.runner.hand.length % 2 === 1;
    case "grip_count_gte":
      return state.runner.hand.length >= cond.amount;
    case "hq_count_gt_grip":
      return state.corp.hand.length > state.runner.hand.length;
    case "grip_count_eq_hq":
      return state.runner.hand.length === state.corp.hand.length;
    case "encounter_ice_strength_lte": {
      const iceId = state.run?.encounter?.iceId;
      if (!iceId) return false;
      return iceStrength(state, iceId) <= cond.amount;
    }
    case "no_successful_run_on_host_server_last_turn": {
      const host = serverHostingCard(state, sourceId);
      if (!host) return true;
      return !(state.turn.successfulRunServersLastTurn ?? []).includes(host.id);
    }
    case "successful_run_this_turn":
      return state.turn.successfulRunThisTurn;
        case "self_installed_this_turn":
      return (state.turn.installedThisTurn ?? []).includes(sourceId);
case "run_unsuccessful":
      return state.run?.successful === false;
    case "run_successful":
      return state.run?.successful === true;
    case "attacking_central": {
      const sid = state.run?.attackedServerId;
      return sid === "hq" || sid === "rd" || sid === "archives";
    }
    case "attacking_rd":
      return state.run?.attackedServerId === "rd";
    case "attacking_hq":
      return state.run?.attackedServerId === "hq";
    case "attacking_archives":
      return state.run?.attackedServerId === "archives";
    case "attacking_remote": {
      const sid = state.run?.attackedServerId;
      if (!sid) return false;
      return state.servers[sid]?.kind === "remote";
    }
    case "advancements_gte":
      return (source.advancementTokens ?? 0) >= cond.amount;
    case "agenda_counters_gte":
      return (source.agendaCounters ?? 0) >= cond.amount;
    case "hq_count_lte":
      return state.corp.hand.length <= cond.amount;
    case "power_counters_gte":
      return (source.powerCounters ?? 0) >= cond.amount;
    case "hosted_credits_gte":
      return (source.hostedCredits ?? 0) >= cond.amount;
    case "virus_counters_gte":
      return (source.virusCounters ?? 0) >= cond.amount;
    case "has_mark":
      return state.markServerId !== null;
    case "attacking_mark":
      return (
        state.markServerId !== null &&
        state.run?.attackedServerId === state.markServerId
      );
    case "source_protects_attacked_server": {
      if (!state.run) return false;
      const server = state.servers[state.run.attackedServerId];
      if (!server) return false;
      return (
        server.ice.includes(sourceId) || server.root.includes(sourceId)
      );
    }
    case "source_installed": {
      const zone = source.zone ?? "";
      return zone.endsWith(":root") || zone.endsWith(":ice");
    }
    case "another_copy_of_source_title_in_either_score_area": {
      const title = source.title;
      let count = 0;
      for (const id of [...state.corp.score, ...state.runner.score]) {
        if (state.cards[id]?.title === title) count++;
      }
      return count >= 2;
    }
    case "threat": {
      const corpPts = agendaPointsFor(state, "corp");
      const runnerPts = agendaPointsFor(state, "runner");
      return Math.max(corpPts, runnerPts) >= cond.level;
    }
    case "source_has_subtype":
      return (source.subtypes ?? []).includes(cond.subtype);
    case "host_server_unprotected_by_ice":
      return hostServerUnprotectedByIce(state, sourceId);
    case "attacked_server_protected_by_ice": {
      if (!state.run) return false;
      const server = state.servers[state.run.attackedServerId];
      return (server?.ice.length ?? 0) > 0;
    }
    case "attacking_chosen_server":
      return Boolean(
        state.run &&
          source.chosenServerId &&
          state.run.attackedServerId === source.chosenServerId,
      );
    case "last_agenda_scored_or_stolen_from_source_server_root": {
      const host = serverHostingCard(state, sourceId);
      if (!host) return false;
      return state.turn.lastAgendaScoredOrStolenServerId === host.id;
    }
    case "successful_all_centrals_this_turn":
      return (
        state.turn.successfulHqRunThisTurn &&
        state.turn.successfulRdRunThisTurn &&
        state.turn.successfulArchivesRunThisTurn
      );
    case "corp_played_operation_this_turn":
      return (state.turn.corpActionTypeCounts.play_operation ?? 0) > 0;
    case "identity_flipped":
      return Boolean(source.identityFlipped);
    case "identity_unflipped":
      return !source.identityFlipped;
    case "accessed_a_card_this_turn":
      return Boolean(state.turn.accessedACardThisTurn);
    case "not_accessed_a_card_this_turn":
      return !state.turn.accessedACardThisTurn;
    case "last_scored_agenda_installed_this_turn": {
      const scored = state.turn.scoredCardIdsThisTurn ?? [];
      const last = scored[scored.length - 1];
      if (!last) return false;
      return (state.turn.installedThisTurn ?? []).includes(last);
    }
    case "played_from_non_hq":
      return Boolean(state.turn.operationPlayedFromNonHq);
    case "and":
      return cond.conds.every((c) => evalCond(ctx, c));
    case "or":
      return cond.conds.some((c) => evalCond(ctx, c));
    case "identity_has_subtype": {
      const idCard = state.cards[state.runner.identityId];
      return (idCard?.subtypes ?? []).includes(cond.subtype);
    }
    case "link_gte": {
      const idCard = state.cards[state.runner.identityId];
      const printed = idCard?.link ?? 0;
      const effective = Math.max(state.runner.link ?? 0, printed);
      return effective >= cond.amount;
    }
    case "runner_mu_full":
      return usedMemory(state) >= memoryLimit(state);
    case "runner_unused_mu_gte":
      return memoryLimit(state) - usedMemory(state) >= cond.amount;
    case "subroutine_resolved_this_run":
      return Boolean(state.run?.subroutineResolvedThisRun);
    case "clicks_gained_this_run_gte": {
      return (state.run?.clicksGainedThisRun ?? 0) >= cond.amount;
    }
    case "did_not_break_printed_sub_with_decoder_this_encounter": {
      return !state.run?.encounter?.brokePrintedSubWithDecoder;
    }
    default: {
      const _c: never = cond;
      return _c;
    }
  }
}

function trashToHeap(state: GameState, cardId: string): void {
  moveRunnerCardToHeap(state, cardId);
}

function maybeFireThreatGiveTagsOnRezzedTrash(
  state: GameState,
  card: GameState["cards"][string],
  wasRezzed: boolean,
): void {
  const spec = card.threatGiveTagsOnRezzedTrash;
  if (!spec || !wasRezzed) return;
  const threatPts = Math.max(
    agendaPointsFor(state, "corp"),
    agendaPointsFor(state, "runner"),
  );
  if (threatPts < spec.level) return;
  state.runner.tags += spec.tags;
  log(
    state,
    `${card.title} — Threat ${spec.level}: give Runner ${spec.tags} tag(s) → ${state.runner.tags}.`,
  );
}


function maybeFireAuCoOnHqTrash(state: GameState, wasFromHq: boolean): void {
  if (!wasFromHq) return;
  const idCard = state.cards[state.corp.identityId];
  if (!idCard?.powerCounterOnDamageOrTrashFromHq) return;
  idCard.powerCounters = (idCard.powerCounters ?? 0) + 1;
  log(
    state,
    `${idCard.title} — place 1 power (trash from HQ) → ${idCard.powerCounters}.`,
  );
}

/** Parasite-class: trash host ice when effective strength ≤ threshold. */
export function maybeTrashHostsAtStrengthLte(state: GameState): void {
  const victims: string[] = [];
  for (const id of state.runner.rig) {
    const card = state.cards[id];
    if (!card || typeof card.trashHostWhenStrengthLte !== "number") continue;
    const hostId = card.hostId;
    if (!hostId) continue;
    const host = state.cards[hostId];
    if (!host || host.type !== "ice") continue;
    const str = iceStrength(state, hostId);
    if (str > card.trashHostWhenStrengthLte) continue;
    victims.push(hostId);
  }
  for (const hostId of [...new Set(victims)]) {
    const host = state.cards[hostId];
    if (!host || host.type !== "ice") continue;
    const str = iceStrength(state, hostId);
    trashCorpCardToArchives(state, hostId);
    if (state.run?.encounter?.iceId === hostId) state.run.encounter = null;
    log(
      state,
      `Trash ${host.title} — host strength ${str} ≤ parasite threshold (CR ${CR.trashing.number}).`,
    );
  }
}

function trashCorpCardToArchives(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  const wasRezzed = Boolean(card.rezzed);
  const printedRez = card.rezCost ?? null;
  const zoneBefore = card.zone;
  const wasFromHq = zoneBefore === "corp:hq";
  const wasInstalled = zoneBefore.startsWith("server:");
  // Kessleroid: Runner cannot trash while rezzed.
  if (
    card.cannotBeTrashedByRunnerWhileRezzed &&
    wasRezzed &&
    state.activeSide === "runner"
  ) {
    log(state, `Cannot trash rezzed ${card.title}.`);
    return;
  }
  maybeFireThreatGiveTagsOnRezzedTrash(state, card, wasRezzed);
  // Marilyn Campaign: when would be trashed, may shuffle into R&D instead.
  if (card.mayShuffleIntoRdWhenTrashed && card.rezzed) {
    removeCardFromCurrentZone(state, cardId);
    state.corp.deck.push(cardId);
    card.zone = "corp:rd";
    card.faceup = false;
    card.rezzed = false;
    card.hostedCredits = undefined;
    log(state, `${card.title} — shuffle into R&D instead of trash.`);
    return;
  }
  // Director Haas: while trashed and being accessed by the Runner, add to
  // the Runner's score area as an agenda instead of moving to Archives.
  if (card.onTrashWhileAccessed && state.run?.accessingCardId === cardId) {
    const r = evalEffect({ state, sourceId: cardId }, card.onTrashWhileAccessed);
    if (!r.ok) {
      log(state, `onTrashWhileAccessed failed on ${card.title}: ${r.error}`);
    }
    return;
  }
  removeCardFromCurrentZone(state, cardId);
  state.corp.discard.push(cardId);
  card.zone = "corp:archives";
  card.faceup = true;
  card.rezzed = false;
  noteCorpCardAddedToArchives(state);
  // Capture host server for onTrash effects (Vaporframe Fabricator).
  const zoneMatch = /^server:([^:]+):(root|ice)$/.exec(zoneBefore);
  state.turn.onTrashSourceServerId = zoneMatch
    ? (zoneMatch[1] as import("../state/types.js").ServerId)
    : null;
  fireCorpOnTrash(state, cardId);
  fireRonaldFiveOnCorpTrash(state);
  noteTrashMatchingRunnerIdentityFaction(state, cardId);
  state.turn.onTrashSourceServerId = null;
  noteFirstCorpCardTrashEachTurn(state);
  maybeFireOnRezzedCardTrashed(state, wasRezzed, printedRez);
  maybeFireHostileArchitecture(state, wasInstalled, cardId, wasRezzed);
  maybeFireYakovCredits(state, wasInstalled, cardId, zoneBefore);
  maybeFireAuCoOnHqTrash(state, wasFromHq);

}

function maybeFireHostileArchitecture(
  state: GameState,
  wasInstalled: boolean,
  trashedId: string,
  trashedWasRezzed: boolean,
): void {
  if (!wasInstalled || state.turn.hostileArchitectureUsedThisTurn) return;
  // Include the just-trashed card (Hostile Architecture can fire on itself).
  const candidates: string[] = [trashedId];
  for (const server of Object.values(state.servers)) {
    for (const id of server.root) candidates.push(id);
  }
  for (const id of candidates) {
    const card = state.cards[id];
    const n = card?.meatDamageOnInstalledCorpTrashOncePerTurn ?? 0;
    if (n <= 0) continue;
    const active =
      id === trashedId ? trashedWasRezzed : Boolean(card?.rezzed);
    if (!active) continue;
    state.turn.hostileArchitectureUsedThisTurn = true;
    const r = evalEffect(
      { state, sourceId: id },
      { op: "do", action: { kind: "meat_damage", amount: n } },
    );
    if (!r.ok) {
      log(state, `${card!.title} meat damage failed: ${r.error}`);
    }
    return;
  }
}

function maybeFireYakovCredits(
  state: GameState,
  wasInstalled: boolean,
  trashedId: string,
  zoneBefore: string,
): void {
  if (!wasInstalled || state.turn.corpInstallInProgress) return;
  // zone like server:remote-1:root or server:hq:ice
  const m = /^server:([^:]+):(root|ice)$/.exec(zoneBefore);
  if (!m) return;
  const sid = m[1]!;
  const server = state.servers[sid as import("../state/types.js").ServerId];
  const candidates = new Set<string>([trashedId]);
  if (server) {
    for (const id of [...server.root, ...server.ice]) candidates.add(id);
  }
  for (const id of candidates) {
    const card = state.cards[id];
    const n = card?.creditsOnTrashFromThisServer ?? 0;
    if (n <= 0) continue;
    // Trashed Yakov still pays; other cards must be rezzed.
    if (id !== trashedId && !card?.rezzed) continue;
    state.corp.credits += n;
    log(state, `${card!.title} — gain ${n}¢ (card trashed from this server).`);
  }
}

function maybeFireOnRezzedCardTrashed(
  state: GameState,
  wasRezzed: boolean,
  printedRez: number | null,
): void {
  if (!wasRezzed) return;
  // Always record printed rez for Kimberlite / Ob Superheavy consumers.
  if (printedRez !== null) {
    state.turn.lastTrashedRezzedPrintedRezCost = printedRez;
  }
  if (state.turn.corpInstallInProgress) return;
  if (state.turn.obSuperheavyUsedThisTurn) return;
  const idCard = state.cards[state.corp.identityId];
  if (!idCard?.onRezzedCardTrashed) return;
  if (printedRez === null) return;
  state.turn.obSuperheavyUsedThisTurn = true;
  log(
    state,
    `${idCard.title} — rezzed card trashed (printed rez ${printedRez}¢).`,
  );
  const r = evalEffect(
    { state, sourceId: idCard.id },
    idCard.onRezzedCardTrashed,
  );
  if (!r.ok) {
    log(state, `onRezzedCardTrashed failed on ${idCard.title}: ${r.error}`);
  }
}

function drawCards(state: GameState, side: Side, amount: number): number {
  if (side === "runner" && state.turn.ccRunnerCannotDraw) {
    return 0;
  }
  // Genetics Pavilion: Runner cannot draw more than N cards during their turn.
  if (side === "runner" && amount > 0 && state.activeSide === "runner") {
    let limit: number | undefined;
    for (const server of Object.values(state.servers)) {
      for (const id of server.root) {
        const c = state.cards[id];
        if (
          c?.rezzed &&
          typeof c.runnerCannotDrawMoreThanPerTurn === "number"
        ) {
          limit =
            limit === undefined
              ? c.runnerCannotDrawMoreThanPerTurn
              : Math.min(limit, c.runnerCannotDrawMoreThanPerTurn);
        }
      }
    }
    if (limit !== undefined) {
      const already = state.turn.uotRunnerCardsDrawnThisTurn ?? 0;
      const room = Math.max(0, limit - already);
      if (room <= 0) {
        log(
          state,
          `Genetics Pavilion — Runner cannot draw more this turn (limit ${limit}).`,
        );
        return 0;
      }
      amount = Math.min(amount, room);
    }
  }
  if (side === "runner" && amount > 0) {
    if (fireOnWouldDrawOncePerTurn(state, side, amount)) {
      // Draw deferred to Class Act bottom leaf (or pendingChoice).
      return 0;
    }
  }
  const p = side === "corp" ? state.corp : state.runner;
  let drew = 0;
  for (let i = 0; i < amount; i++) {
    const top = p.deck.shift();
    if (!top) break;
    p.hand.push(top);
    const card = state.cards[top];
    card.zone = side === "corp" ? "corp:hq" : "runner:grip";
    card.faceup = side === "runner";
    drew += 1;
    // Political Dealings: whenever Corp draws an agenda, may reveal and install.
    if (side === "corp" && card.type === "agenda") {
      for (const server of Object.values(state.servers)) {
        for (const id of server.root) {
          const asset = state.cards[id];
          if (!asset?.rezzed || !asset.onDrawAgendaMayRevealAndInstall) continue;
          const r = applyMumbadDagPrimitive(
            { state, sourceId: id },
            {
              kind: "political_dealings_may_install_drawn_agenda",
              cardId: top,
            },
          );
          if (r && !r.ok) {
            log(state, `Political Dealings failed: ${r.error}`);
          }
          if (state.pendingChoice) break;
        }
        if (state.pendingChoice) break;
      }
    }
  }
  if (side === "runner" && drew > 0) {
    state.turn.uotRunnerCardsDrawnThisTurn =
      (state.turn.uotRunnerCardsDrawnThisTurn ?? 0) + drew;
  }
  return drew;
}

function pendingTrashAmong(
  state: GameState,
  sourceId: string,
  candidates: string[],
  label: string,
): EvalResult {
  if (candidates.length === 0) {
    log(state, `Trash ${label} — no targets (CR ${CR.trashing.number}).`);
    return { ok: true };
  }
  if (candidates.length > 1) {
    state.pendingTrashProgram = {
      sourceId,
      candidates: [...candidates],
    };
    log(
      state,
      `Trash ${label} — Corp must choose among ${candidates.length} (CR ${CR.trashing.number}).`,
    );
    return { ok: true };
  }
  const id = candidates[0]!;
  const title = state.cards[id].title;
  trashToHeap(state, id);
  log(state, `Trash installed ${title} (CR ${CR.trashing.number}).`);
  return { ok: true };
}


/** Fire Hyoubu-class first-reveal-each-turn triggers after a reveal. */
function noteCardRevealed(
  state: GameState,
  _cardId: string,
  _revealerSourceId: string,
): void {
  if (state.turn.firstRevealCreditUsedThisTurn) return;
  const idCard = state.cards[state.corp.identityId];
  if (!idCard?.onFirstRevealEachTurn) return;
  state.turn.firstRevealCreditUsedThisTurn = true;
  log(state, `${idCard.title} — first reveal this turn.`);
  const r = evalEffect(
    { state, sourceId: idCard.id },
    idCard.onFirstRevealEachTurn,
  );
  if (!r.ok) {
    log(state, `onFirstRevealEachTurn failed on ${idCard.title}: ${r.error}`);
  }
}

/** Class Act: interrupt first would-draw each turn before cards move. */
function fireOnWouldDrawOncePerTurn(
  state: GameState,
  side: Side,
  amount: number,
): boolean {
  if (side !== "runner" || amount <= 0) return false;
  for (const id of [...state.runner.rig]) {
    const card = state.cards[id];
    if (!card?.onWouldDrawOncePerTurn) continue;
    if (state.turn.onWouldDrawOncePerTurnFiredIds.includes(id)) continue;
    state.turn.onWouldDrawOncePerTurnFiredIds.push(id);
    state.turn.pendingWouldDrawAmount = amount;
    log(state, `${card.title} — interrupt would-draw of ${amount}.`);
    const r = evalEffect(
      { state, sourceId: id },
      card.onWouldDrawOncePerTurn,
    );
    if (!r.ok) {
      log(state, `onWouldDrawOncePerTurn failed on ${card.title}: ${r.error}`);
      state.turn.pendingWouldDrawAmount = null;
      return false;
    }
    // Class Act opens pendingChoice; draw is deferred to bottom leaf.
    return true;
  }
  return false;
}

function applyPrimitive(ctx: EffectCtx, action: Primitive): EvalResult {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
        case "prevent_declare_run_successful": {
      if (!state.run) {
        log(state, `Prevent declare successful — no run.`);
        return { ok: true };
      }
      state.run.cannotDeclareSuccessful = true;
      log(state, `${source.title} — this run cannot be declared successful.`);
      return { ok: true };
    }
case "end_the_run": {
      if (!state.run) {
        return {
          ok: false,
          error: "End the run with no active run.",
          cites: [CR.endTheRun],
        };
      }
      if (state.run.encounter?.forbidEndTheRunThisEncounter) {
        log(
          state,
          `End the run suppressed this encounter (Banner) (CR ${CR.endTheRun.number}).`,
        );
        return { ok: true };
      }
      if (
        state.run.shredPreventFirstEndTheRun &&
        !state.run.shredFirstEndTheRunUsed
      ) {
        state.run.shredFirstEndTheRunUsed = true;
        const sid = state.run.attackedServerId;
        const rootN = state.servers[sid]?.root.length ?? 0;
        const hq = [...state.corp.hand];
        if (rootN > 0 && hq.length >= rootN) {
          const picks = hq.slice(hq.length - rootN);
          for (const id of picks) {
            trashCorpCardToArchives(state, id);
            log(
              state,
              `Shred — Corp reveals and trashes ${state.cards[id]!.title} from HQ.`,
            );
          }
          state.run.endedTheRun = true;
          state.run.successful = false;
          log(
            state,
            `Shred — Corp trashed ${rootN} from HQ; end the run proceeds.`,
          );
          return { ok: true };
        }
        log(
          state,
          `Shred — prevent end the run (Corp cannot trash ${rootN} from HQ).`,
        );
        return { ok: true };
      }
      // Lucky Charm-class: Corp card ability ETR may open interrupt PAW.
      const fromCorpAbility = Boolean(source && source.side === "corp");
      if (
        fromCorpAbility &&
        hasPayableEndTheRunInterrupt(state) &&
        !state.pendingEndTheRun
      ) {
        openPendingEndTheRun(state, sourceId, true);
        return { ok: true };
      }
      state.run.endedTheRun = true;
      state.run.successful = false;
      log(
        state,
        `End the run (CR ${CR.endTheRun.number}) — run is unsuccessful.`,
      );
      return { ok: true };
    }
    case "forbid_end_the_run_this_encounter": {
      if (!state.run?.encounter) {
        log(state, `${source.title} — forbid ETR: no encounter.`);
        return { ok: true };
      }
      state.run.encounter.forbidEndTheRunThisEncounter = true;
      log(
        state,
        `${source.title} — subroutines cannot end the run this encounter.`,
      );
      return { ok: true };
    }
    case "gain_credits": {
      const side = resolveSide(ctx, action.side);
      const p = side === "corp" ? state.corp : state.runner;
      p.credits += action.amount;
      log(
        state,
        `${side} gains ${action.amount}¢ (CR ${CR.gainCredits.number}).`,
      );
      if (action.amount > 0 && side === "corp") {
        maybeFireZwickyCreditsGained(state, sourceId);
      }
      return { ok: true };
    }
    case "lose_all_credits": {
      const side = resolveSide(ctx, action.side);
      if (
        side === "runner" &&
        state.run?.blockCreditPoolSpendAndLose
      ) {
        log(
          state,
          `Runner cannot lose credits from credit pool (Aircheck-class block).`,
        );
        return { ok: true };
      }
      const p = side === "corp" ? state.corp : state.runner;
      const lost = p.credits;
      p.credits = 0;
      log(
        state,
        `${side} loses all credits (${lost}¢) → 0 (CR ${CR.gainCredits.number}).`,
      );
      if (lost > 0 && side === "runner") {
        noteCorpAbilityCausedRunnerCreditLossOrSpend(state, lost, sourceId);
      }
      return { ok: true };
    }
    case "lose_credits": {
      const side = resolveSide(ctx, action.side);
      if (
        side === "runner" &&
        state.run?.runnerCannotSpendCreditsForRun &&
        action.amount > 0
      ) {
        return {
          ok: false,
          error: "Runner cannot spend credits for remainder of this run.",
          cites: [CR.gainCredits],
        };
      }
      if (
        side === "runner" &&
        state.run?.runnerCannotSpendCredits &&
        action.amount > 0
      ) {
        return {
          ok: false,
          error: "Runner cannot spend credits while this ice's subroutines resolve.",
          cites: [CR.gainCredits],
        };
      }
      if (
        side === "runner" &&
        state.run?.blockCreditPoolSpendAndLose &&
        action.amount > 0
      ) {
        log(
          state,
          `Runner cannot lose credits from credit pool (Aircheck-class block).`,
        );
        return { ok: true };
      }
      const p = side === "corp" ? state.corp : state.runner;
      const lost = Math.min(action.amount, p.credits);
      p.credits -= lost;
      log(
        state,
        `${side} loses ${lost}¢ (requested ${action.amount}) → ${p.credits} (CR ${CR.gainCredits.number}).`,
      );
      if (lost > 0 && side === "runner") {
        noteCorpAbilityCausedRunnerCreditLossOrSpend(state, lost, sourceId);
      }
      if (lost > 0 && side === "corp") {
        // Ixodidae: whenever Corp loses ≥1¢, gain N¢.
        for (const rid of [...state.runner.rig]) {
          const rc = state.cards[rid];
          const n = rc?.gainCreditsWhenCorpLosesCredits;
          if (typeof n !== "number" || n <= 0) continue;
          state.runner.credits += n;
          log(
            state,
            `${rc!.title} — gain ${n}¢ (Corp lost credits) → ${state.runner.credits}¢.`,
          );
        }
      }
      if (lost > 0 && action.gainPerCreditLost) {
        const gainSide = resolveSide(ctx, action.gainPerCreditLost.side);
        const gainAmt = lost * action.gainPerCreditLost.per;
        const gp = gainSide === "corp" ? state.corp : state.runner;
        gp.credits += gainAmt;
        log(
          state,
          `${gainSide} gains ${gainAmt}¢ (${lost} lost × ${action.gainPerCreditLost.per}) (CR ${CR.gainCredits.number}).`,
        );
      }
      // "If they do" — only when at least 1 credit was actually lost.
      if (lost > 0 && action.then) {
        return evalEffect(ctx, action.then);
      }
      return { ok: true };
    }
    case "pump_strength": {
      if (!state.run) {
        return {
          ok: false,
          error: "Pump requires an active run.",
          cites: [CR.icebreakerStrengthImplicit],
        };
      }
      if (!source.breaker) {
        return {
          ok: false,
          error: "Pump requires an icebreaker.",
          cites: [CR.programStrength],
        };
      }
      let amount = action.amount;
      if (source.breaker.pumpUsesIcebreakerCount) {
        amount = state.runner.rig.filter(
          (id) =>
            Boolean(state.cards[id].breaker) ||
            (state.cards[id].subtypes ?? []).includes("icebreaker"),
        ).length;
      }
      let duration = action.duration ?? "encounter";
      for (const id of state.runner.rig) {
        const mod = state.cards[id];
        if (
          mod?.hostId === sourceId &&
          mod.extendsHostBreakerPumpToRun
        ) {
          duration = "run";
          break;
        }
      }
      const bucket =
        duration === "run"
          ? state.run.strengthBoosts
          : state.run.encounterStrengthBoosts;
      bucket[sourceId] = (bucket[sourceId] ?? 0) + amount;
      const eff = breakerStrength(state, sourceId);
      log(
        state,
        `Pump ${source.title} +${amount} (${duration}) → strength ${eff} (CR ${CR.icebreakerStrengthImplicit.number}, ${CR.paidAbility.number}).`,
      );
      return { ok: true };
    }
    case "fortify_ice": {
      if (!state.run || source.type !== "ice") {
        return {
          ok: false,
          error: "Fortify requires ice during a run.",
          cites: [CR.iceStrength],
        };
      }
      state.run.iceStrengthBoosts[sourceId] =
        (state.run.iceStrengthBoosts[sourceId] ?? 0) + action.amount;
      const eff = iceStrength(state, sourceId);
      log(
        state,
        `Fortify ${source.title} +${action.amount} → strength ${eff} (CR ${CR.iceStrength.number}, ${CR.paidAbility.number}).`,
      );
      return { ok: true };
    }
    case "weaken_ice": {
      if (!state.run) {
        return {
          ok: false,
          error: "Weaken ice requires an active run/encounter.",
          cites: [CR.iceStrength],
        };
      }
      const iceId = state.run.encounter?.iceId;
      if (!iceId) {
        return {
          ok: false,
          error: "Weaken ice requires an encounter.",
          cites: [CR.iceStrength],
        };
      }
      const ice = state.cards[iceId];
      if (ice.strengthCannotBeLowered) {
        log(
          state,
          `Weaken ${ice.title} prevented — strength cannot be lowered.`,
        );
        return { ok: true };
      }
      state.run.iceStrengthBoosts[iceId] =
        (state.run.iceStrengthBoosts[iceId] ?? 0) - action.amount;
      const eff = iceStrength(state, iceId);
      log(
        state,
        `Weaken ${ice.title} −${action.amount} → strength ${eff} (CR ${CR.iceStrength.number}).`,
      );
      maybeTrashHostsAtStrengthLte(state);
      return { ok: true };
    }
    case "spend_stealth_credits": {
      const need = action.amount;
      if (need <= 0) return { ok: true };
      if (stealthHostedCreditsAvailable(state) < need) {
        return {
          ok: false,
          error: "Insufficient stealth credits.",
          cites: [CR.paidAbility],
        };
      }
      const left = takeFromStealthHostedCredits(state, need);
      if (left > 0) {
        return {
          ok: false,
          error: "Insufficient stealth credits.",
          cites: [CR.paidAbility],
        };
      }
      return { ok: true };
    }
    case "redirect_approach_to_server": {
      if (!state.run) {
        return {
          ok: false,
          error: "Redirect approach requires an active run.",
          cites: [CR.announceServer],
        };
      }
      const sid = action.serverId;
      const server = state.servers[sid];
      if (!server) {
        return {
          ok: false,
          error: `Unknown server ${sid}.`,
          cites: [CR.announceServer],
        };
      }
      state.run.attackedServerId = sid;
      state.run.position = server.ice.length > 0 ? 0 : null;
      log(
        state,
        `Baker — change attacked server to ${sid} and approach${
          server.ice.length > 0 ? ` ${sid} ice` : ` ${sid}`
        }.`,
      );
      return { ok: true };
    }
    case "net_damage_per_runner_scored_agenda": {
      const amount = state.runner.score.length;
      if (amount <= 0) {
        log(state, `Philotic — no agendas in Runner score area.`);
        return { ok: true };
      }
      dealDamage(state, "net", amount, sourceId);
      log(
        state,
        `${source?.title ?? sourceId} — ${amount} net damage (1 per Runner scored agenda).`,
      );
      return { ok: true };
    }
    case "net_damage":
    case "meat_damage":
    case "core_damage":
    case "brain_damage": {
      const dtype =
        action.kind === "net_damage"
          ? "net"
          : action.kind === "meat_damage"
            ? "meat"
            : action.kind === "core_damage"
              ? "core"
              : "brain";
      const interactive =
        action.kind === "core_damage" && Boolean(action.interactive);
      const preventByLoseAllClicks =
        action.kind === "core_damage" &&
        Boolean(action.preventByLoseAllClicks);
      const cannotPrevent =
        (action.kind === "meat_damage" || action.kind === "core_damage") &&
        Boolean(action.cannotPrevent);
      dealDamage(state, dtype, action.amount, sourceId, {
        interactive,
        preventByLoseAllClicks,
        ...(cannotPrevent ? { cannotPrevent: true } : {}),
      });
      return { ok: true };
    }
    case "net_damage_1_plus_copies_of_source_title_in_other_score_area": {
      const title = source.title;
      const inRunnerScore = state.runner.score.includes(sourceId);
      const otherScore = inRunnerScore
        ? state.corp.score
        : state.runner.score;
      const copies = otherScore.filter(
        (id) => state.cards[id]?.title === title,
      ).length;
      const amount = 1 + copies;
      dealDamage(state, "net", amount, sourceId);
      log(
        state,
        `${source.title} — ${amount} net damage (1 + ${copies} copie(s) in other score area).`,
      );
      return { ok: true };
    }
    case "give_tags": {
      if (state.turn.bbPreventAllTagsThisRun) {
        log(state, `Dorm Computer — prevent all tags this run.`);
        return { ok: true };
      }
      const tagsBefore = state.runner.tags;
      const beforeTags = state.turn.tagsGivenThisTurn;
      let amount = action.amount;
      const preventSrc = findPreventFirstTagThisTurn(state);
      if (preventSrc && beforeTags === 0 && amount > 0) {
        amount -= 1;
        log(
          state,
          `${state.cards[preventSrc]!.title} — prevent 1 tag (first this turn).`,
        );
      }
      if (amount <= 0) {
        // Still count the prevented instance so further tags this turn land.
        state.turn.tagsGivenThisTurn += 1;
        return { ok: true };
      }
      // Tag interrupt PAW when a payable avoid ability exists (Decoy-class).
      if (!state.pendingTags && hasPayableTagInterrupt(state)) {
        openPendingTags(state, amount, sourceId);
        return { ok: true };
      }
      state.runner.tags += amount;
      state.turn.tagsGivenThisTurn += amount;
      log(
        state,
        `Runner receives ${amount} tag(s) → ${state.runner.tags} (CR ${CR.tags.number}).`,
      );
      fireOnTakeTagsWhenUntagged(state, tagsBefore, amount);
      if (state.runner.tags > 0) {
        for (const id of [...state.runner.rig]) {
          const res = state.cards[id];
          if (!res?.trashSelfWhenRunnerTagged) continue;
          moveRunnerCardToHeap(state, id);
          log(state, `${res.title} — trashed (Runner is tagged).`);
        }
      }
      if (beforeTags === 0 && amount > 0) {
        const idCard = state.cards[state.corp.identityId];
        if (idCard?.onFirstTagThisTurn) {
          const r = evalEffect(
            { state, sourceId: idCard.id },
            idCard.onFirstTagThisTurn,
          );
          if (!r.ok) return r;
        }
      }
      return { ok: true };
    }
    case "give_tags_per_advancement": {
      const base = action.base ?? 0;
      const per = action.per ?? 1;
      const adv = source.advancementTokens ?? 0;
      const amount = base + per * adv;
      if (amount <= 0) {
        log(state, `Give tags per advancement — 0 tags.`);
        return { ok: true };
      }
      return evalEffect(ctx, {
        op: "do",
        action: { kind: "give_tags", amount },
      });
    }

    case "give_tags_equal_to_last_trace_excess": {
      const n = Math.max(0, state.turn.lastTraceExcess ?? 0);
      log(
        state,
        `${source.title} — give ${n} tag(s) equal to lastTraceExcess.`,
      );
      if (n <= 0) return { ok: true };
      return applyPrimitive(ctx, { kind: "give_tags", amount: n });
    }
    case "indexing_may_instead_of_breach": {
      if (!state.run || state.run.attackedServerId !== "rd") {
        log(state, `Indexing — not a successful R&D run.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "breach",
            label: "Breach R&D",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
          {
            id: "arrange",
            label: "Instead of breaching: look at top 5 of R&D and arrange",
            effect: {
              op: "do",
              action: { kind: "indexing_instead_of_breach_arrange" as const },
            },
          },
        ],
      };
      log(state, `Indexing — may instead of breaching R&D.`);
      return { ok: true };
    }
    case "indexing_instead_of_breach_arrange": {
      if (state.run) state.run.skipBreach = true;
      return applyPrimitive(ctx, { kind: "look_top_n_rd_arrange", n: 5 });
    }
    case "draw_n_then_bottom_one_of_drawn": {
      const amount = Math.max(0, action.amount ?? 0);
      const before = [...state.runner.hand];
      const drawR = applyPrimitive(ctx, {
        kind: "draw",
        side: "runner",
        amount,
      });
      if (!drawR.ok) return drawR;
      const drawn = state.runner.hand.filter((id) => !before.includes(id));
      if (drawn.length === 0) {
        log(state, `${source.title} — drew no cards to bottom.`);
        return { ok: true };
      }
      if (drawn.length === 1) {
        return applyPrimitive(ctx, {
          kind: "bottom_drawn_card",
          cardId: drawn[0]!,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: drawn.map((id) => ({
          id: `bottom:${id}`,
          label: `Put ${state.cards[id]!.title} on bottom of stack`,
          effect: {
            op: "do" as const,
            action: { kind: "bottom_drawn_card" as const, cardId: id },
          },
        })),
      };
      log(
        state,
        `${source.title} — choose 1 of ${drawn.length} drawn cards to bottom.`,
      );
      return { ok: true };
    }
    case "bottom_drawn_card": {
      const cardId = action.cardId;
      if (!state.runner.hand.includes(cardId)) {
        log(state, `bottom_drawn_card — card not in grip.`);
        return { ok: true };
      }
      state.runner.hand = state.runner.hand.filter((id) => id !== cardId);
      state.runner.deck.push(cardId);
      state.cards[cardId]!.zone = "runner:stack";
      state.cards[cardId]!.faceup = false;
      log(
        state,
        `${source.title} — put ${state.cards[cardId]!.title} on bottom of stack.`,
      );
      return { ok: true };
    }
    case "midori_may_swap_approached_ice_with_hq": {
      const run = state.run;
      if (!run || run.position === null) {
        log(state, `Midori — no approached ice.`);
        return { ok: true };
      }
      const approachedId =
        state.servers[run.attackedServerId]?.ice[run.position];
      if (!approachedId) {
        log(state, `Midori — no approached ice.`);
        return { ok: true };
      }
      const hqIce = state.corp.hand.filter(
        (id) => state.cards[id]?.type === "ice",
      );
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
        ...hqIce.map((iceId) => ({
          id: iceId,
          label: `Swap with ${state.cards[iceId]!.title} from HQ`,
          effect: {
            op: "do" as const,
            action: {
              kind: "midori_swap_approached_ice_with_hq" as const,
              replacementIceId: iceId,
            },
          },
        })),
      ];
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(state, `Midori — may swap approached ice with ice from HQ.`);
      return { ok: true };
    }
    case "midori_swap_approached_ice_with_hq": {
      const run = state.run;
      if (!run || run.position === null) {
        log(state, `Midori swap — no run.`);
        return { ok: true };
      }
      const serverId = run.attackedServerId;
      const approachedId = state.servers[serverId]?.ice[run.position];
      const replacementId = action.replacementIceId;
      const replacement = state.cards[replacementId];
      const approached = approachedId ? state.cards[approachedId] : undefined;
      if (
        !approachedId ||
        !approached ||
        !replacement ||
        replacement.type !== "ice" ||
        !state.corp.hand.includes(replacementId)
      ) {
        log(state, `Midori swap — invalid ice.`);
        return { ok: true };
      }
      state.corp.hand = state.corp.hand.filter((id) => id !== replacementId);
      state.servers[serverId]!.ice[run.position!] = replacementId;
      replacement.zone = `server:${serverId}:ice`;
      replacement.rezzed = false;
      replacement.faceup = false;
      state.corp.hand.push(approachedId);
      approached.zone = "corp:hq";
      approached.rezzed = false;
      log(
        state,
        `Midori — swap ${approached.title} with ${replacement.title} from HQ (unrezzed).`,
      );
      return applyPrimitive(ctx, { kind: "offer_jack_out" });
    }

    case "trash_program": {
      const encIce = state.run?.encounter?.iceId;
      if (
        encIce === sourceId &&
        source.maxInstalledRunnerTrashesPerEncounter &&
        (state.run!.encounter!.installedRunnerTrashesThisEncounter ?? 0) >=
          source.maxInstalledRunnerTrashesPerEncounter
      ) {
        log(
          state,
          `${source.title} — already trashed max installed Runner cards this encounter.`,
        );
        return { ok: true };
      }
      let programs = state.runner.rig.filter(
        (id) => state.cards[id].type === "program",
      );
      if (action.aiOnly) {
        programs = programs.filter((id) => {
          const c = state.cards[id];
          return (
            (c.subtypes ?? []).includes("ai") ||
            c.breaker?.breaksSubtype === "*"
          );
        });
      }
      if (action.excludeSubtypes?.length) {
        programs = programs.filter((id) => {
          const subs = state.cards[id].subtypes ?? [];
          return !action.excludeSubtypes!.some((s) => subs.includes(s));
        });
      }
      if (action.includeSubtypes?.length) {
        programs = programs.filter((id) => {
          const subs = state.cards[id].subtypes ?? [];
          return action.includeSubtypes!.some((s) => subs.includes(s));
        });
      }
      if (programs.length === 0) {
        log(
          state,
          `Trash program — no installed ${action.aiOnly ? "AI " : ""}program (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      if (action.pick === "choose" && programs.length > 1) {
        state.pendingTrashProgram = {
          sourceId,
          candidates: [...programs],
        };
        log(
          state,
          `Trash program — Corp must choose among ${programs.length} (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const progId = programs[0]!;
      const title = state.cards[progId].title;
      trashToHeap(state, progId);
      if (state.pendingTrashPrevent) {
        log(
          state,
          `Pending trash of installed program ${title} — interrupt PAW.`,
        );
        return { ok: true };
      }
      log(
        state,
        `Trash installed program ${title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "trash_installed_resources_with_any_subtype": {
      const want = new Set(action.subtypes.map((s) => s.toLowerCase()));
      const targets = state.runner.rig.filter((id) => {
        const c = state.cards[id];
        if (!c || c.type !== "resource") return false;
        return (c.subtypes ?? []).some((s) => want.has(s.toLowerCase()));
      });
      if (targets.length === 0) {
        log(
          state,
          `Trash connection/job resources — none installed (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      for (const id of [...targets]) {
        const title = state.cards[id]!.title;
        trashToHeap(state, id);
        log(
          state,
          `Trash installed resource ${title} (CR ${CR.trashing.number}).`,
        );
      }
      return { ok: true };
    }
    case "trash_installed_resource_with_subtype": {
      const want = action.subtype.toLowerCase();
      const targets = state.runner.rig.filter((id) => {
        const c = state.cards[id];
        if (!c || c.type !== "resource") return false;
        return (c.subtypes ?? []).some((s) => s.toLowerCase() === want);
      });
      if (targets.length === 0) {
        log(
          state,
          `Trash ${action.subtype} resource — none installed (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      if (action.pick === "choose" && targets.length > 1) {
        state.pendingTrashProgram = {
          sourceId,
          candidates: [...targets],
        };
        log(
          state,
          `Trash ${action.subtype} resource — Corp must choose among ${targets.length} (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const resId = targets[0]!;
      const title = state.cards[resId]!.title;
      trashToHeap(state, resId);
      log(
        state,
        `Trash installed ${action.subtype} resource ${title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "trash_ice_rezzed_this_run": {
      const ids = state.run?.iceRezzedThisRunIds ?? [];
      const targets = ids.filter((id) => {
        const c = state.cards[id];
        if (!c || c.type !== "ice") return false;
        // Still installed protecting a server.
        for (const server of Object.values(state.servers)) {
          if (server.ice.includes(id)) return true;
        }
        return false;
      });
      if (targets.length === 0) {
        log(
          state,
          `Trash ice rezzed this run — none available (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      if (action.pick === "choose" && targets.length > 1) {
        state.pendingChoice = {
          sourceId,
          chooser: "runner",
          options: targets.map((id) => ({
            id: `trash-ice-rezzed:${id}`,
            label: `Trash ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: { kind: "trash_corp_card" as const, cardId: id },
            },
          })),
        };
        log(
          state,
          `Trash ice rezzed this run — Runner chooses among ${targets.length}.`,
        );
        return { ok: true };
      }
      const iceId = targets[0]!;
      const title = state.cards[iceId]!.title;
      const r = applyPrimitive(ctx, {
        kind: "trash_corp_card",
        cardId: iceId,
      });
      if (!r.ok) return r;
      log(state, `Trash ice ${title} rezzed this run (CR ${CR.trashing.number}).`);
      return { ok: true };
    }
    case "trash_resource": {
      const encIce = state.run?.encounter?.iceId;
      if (
        encIce === sourceId &&
        source.maxInstalledRunnerTrashesPerEncounter &&
        (state.run!.encounter!.installedRunnerTrashesThisEncounter ?? 0) >=
          source.maxInstalledRunnerTrashesPerEncounter
      ) {
        log(
          state,
          `${source.title} — already trashed max installed Runner cards this encounter.`,
        );
        return { ok: true };
      }
      const resources = state.runner.rig.filter(
        (id) => state.cards[id].type === "resource",
      );
      if (resources.length === 0) {
        log(
          state,
          `Trash resource — no installed resource (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      if (action.pick === "choose" && resources.length > 1) {
        state.pendingTrashProgram = {
          sourceId,
          candidates: [...resources],
        };
        log(
          state,
          `Trash resource — Corp must choose among ${resources.length} (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const resId = resources[0]!;
      const title = state.cards[resId].title;
      if (action.cannotPrevent) {
        trashToHeap(state, resId);
      } else {
        trashToHeap(state, resId);
      }
      log(
        state,
        `Trash installed resource ${title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "trash_own_resource": {
      const resources = state.runner.rig.filter(
        (id) => state.cards[id].type === "resource",
      );
      if (resources.length === 0) {
        return {
          ok: false,
          error: "Must trash an installed resource — none available.",
          cites: [CR.trashing],
        };
      }
      if (resources.length === 1) {
        const resId = resources[0]!;
        const title = state.cards[resId].title;
        trashToHeap(state, resId);
        log(
          state,
          `Trash own resource ${title} (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: resources.map((id) => ({
          id: `trash-own:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: { kind: "trash_runner_rig_card" as const, cardId: id },
          },
        })),
      };
      log(
        state,
        `${source.title} — Runner must trash an installed resource (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "trash_own_program": {
      const programs = state.runner.rig.filter(
        (id) => state.cards[id].type === "program",
      );
      if (programs.length === 0) {
        return {
          ok: false,
          error: "Must trash an installed program — none available.",
          cites: [CR.trashing],
        };
      }
      if (programs.length === 1) {
        const progId = programs[0]!;
        const title = state.cards[progId].title;
        const cost = state.cards[progId].installCost;
        trashToHeap(state, progId);
        state.turn.lastTrashedOwnProgramInstallCost = cost;
        log(
          state,
          `Trash own program ${title} (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: programs.map((id) => ({
          id: `trash-own-program:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "trash_runner_rig_card_record_program_cost" as const,
              cardId: id,
            },
          },
        })),
      };
      log(
        state,
        `${source.title} — Runner must trash an installed program (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "take_hosted_credits": {
      const available = source.hostedCredits ?? 0;
      const taken = Math.min(action.amount, available);
      source.hostedCredits = available - taken;
      const side = source.side;
      const p = side === "corp" ? state.corp : state.runner;
      p.credits += taken;
      log(
        state,
        `Take ${taken}¢ from ${source.title} (hosted ${source.hostedCredits}) (CR ${CR.gainCredits.number}).`,
      );
      if ((source.hostedCredits ?? 0) <= 0) {
        const stillInstalled =
          (side === "runner" && state.runner.rig.includes(sourceId)) ||
          (side === "corp" && source.zone.startsWith("server:"));
        if (!stillInstalled) {
          // Already trashed as a cost (Cybersand); do not double-archive.
        } else if (side === "corp" && source.mayShuffleIntoRdWhenTrashed) {
          removeCardFromCurrentZone(state, sourceId);
          state.corp.deck.push(sourceId);
          source.zone = "corp:rd";
          source.faceup = false;
          source.rezzed = false;
          log(
            state,
            `${source.title} — shuffle into R&D instead of trash (hosted empty).`,
          );
        } else {
          removeCardFromCurrentZone(state, sourceId);
          if (side === "runner") {
            state.runner.discard.push(sourceId);
            source.zone = "runner:heap";
          } else {
            state.corp.discard.push(sourceId);
            source.zone = "corp:archives";
          }
          source.faceup = true;
          log(
            state,
            `${source.title} trashed — hosted credits empty (CR ${CR.trashing.number}).`,
          );
        }
        const drawN = source.drawOnHostedEmpty ?? 0;
        if (drawN > 0) {
          const n = drawCards(state, side, drawN);
          log(
            state,
            `${side} draws ${n} from empty ${source.title} (CR ${CR.drawing.number}).`,
          );
        }
        const clicksN = source.clicksOnHostedEmpty ?? 0;
        if (clicksN > 0) {
          const p = side === "corp" ? state.corp : state.runner;
          p.clicks += clicksN;
          log(
            state,
            `${side} gains ${clicksN} [click] from empty ${source.title} (CR ${CR.spendClicks.number}).`,
          );
        }
      }
      return { ok: true };
    }
    case "place_hosted_credits": {
      source.hostedCredits = (source.hostedCredits ?? 0) + action.amount;
      log(
        state,
        `Place ${action.amount}¢ on ${source.title} → ${source.hostedCredits} (CR ${CR.gainCredits.number}).`,
      );
      maybeFireHostedCreditsGte(state, sourceId);
      return { ok: true };
    }
    case "may_pay_credits_add_virus_counter": {
      const cost = Math.max(0, action.credits ?? 0);
      const amount = Math.max(0, action.amount ?? 1);
      const canPay = state.runner.credits >= cost && cost > 0;
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "runner", amount: 0 },
          },
        },
      ];
      if (canPay || cost === 0) {
        options.unshift({
          id: "pay",
          label: `Pay ${cost}¢: place ${amount} virus counter(s)`,
          effect: {
            op: "do",
            action: {
              kind: "pay_credits_add_virus_counter" as const,
              credits: cost,
              amount,
            },
          },
        });
      }
      state.pendingChoice = { sourceId, chooser: "runner", options };
      log(state, `${source.title} — may pay ${cost}¢ for virus.`);
      return { ok: true };
    }
    case "pay_credits_add_virus_counter": {
      const cost = Math.max(0, action.credits ?? 0);
      const amount = Math.max(0, action.amount ?? 1);
      if (state.runner.credits < cost) {
        log(state, `${source.title} — cannot afford virus payment.`);
        return { ok: true };
      }
      state.runner.credits -= cost;
      return applyPrimitive(ctx, { kind: "add_virus_counter", amount });
    }
    case "add_virus_counter": {
      source.virusCounters = (source.virusCounters ?? 0) + action.amount;
      log(
        state,
        `Place ${action.amount} virus counter(s) on ${source.title} → ${source.virusCounters}.`,
      );
      if (source.type === "program") {
        if (!state.turn.programsWithVirusPlacedThisTurn.includes(sourceId)) {
          state.turn.programsWithVirusPlacedThisTurn.push(sourceId);
        }
      }
      if (source.recurringCreditsMaxEqualsVirusCounters) {
        source.recurringCreditsMax = source.virusCounters ?? 0;
      }
      // Tranquilizer: at threshold, derez host ice.
      const threshold = source.derezHostAtVirus;
      if (
        threshold !== undefined &&
        (source.virusCounters ?? 0) >= threshold &&
        source.hostId
      ) {
        const host = state.cards[source.hostId];
        if (host?.type === "ice" && host.rezzed) {
          host.rezzed = false;
          log(
            state,
            `${source.title} derezzes host ${host.title} (${source.virusCounters} virus).`,
          );
        }
      }
      maybeTrashHostsAtStrengthLte(state);
      return { ok: true };
    }
    case "place_virus_on_program_that_received_virus_this_turn": {
      const ids = (state.turn.programsWithVirusPlacedThisTurn ?? []).filter(
        (id) => {
          const c = state.cards[id];
          return c && c.type === "program" && state.runner.rig.includes(id);
        },
      );
      if (ids.length === 0) {
        log(state, `${source.title} — no program received virus this turn.`);
        return { ok: true };
      }
      if (ids.length === 1) {
        return applyPrimitive(ctx, {
          kind: "place_virus_on_program",
          cardId: ids[0]!,
          amount: action.amount,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: ids.map((id) => ({
          id: `surge-virus:${id}`,
          label: `Place ${action.amount} virus on ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "place_virus_on_program" as const,
              cardId: id,
              amount: action.amount,
            },
          },
        })),
      };
      log(
        state,
        `${source.title} — choose a program that received virus this turn.`,
      );
      return { ok: true };
    }
    case "place_virus_on_program": {
      const card = state.cards[action.cardId];
      if (!card || card.type !== "program") {
        log(state, `Place virus — invalid program.`);
        return { ok: true };
      }
      card.virusCounters = (card.virusCounters ?? 0) + action.amount;
      if (!state.turn.programsWithVirusPlacedThisTurn.includes(action.cardId)) {
        state.turn.programsWithVirusPlacedThisTurn.push(action.cardId);
      }
      if (card.recurringCreditsMaxEqualsVirusCounters) {
        card.recurringCreditsMax = card.virusCounters ?? 0;
      }
      log(
        state,
        `Place ${action.amount} virus counter(s) on ${card.title} → ${card.virusCounters}.`,
      );
      return { ok: true };
    }
    case "may_search_stack_copy_of_last_installed_hardware_add_to_grip": {
      const lastId = state.turn.lastHardwareInstalledId;
      const last = lastId ? state.cards[lastId] : undefined;
      if (!last || last.type !== "hardware") {
        log(state, `${source.title} — no hardware install to copy.`);
        return { ok: true };
      }
      const title = last.title;
      const matches = state.runner.deck.filter(
        (id) => state.cards[id]?.title === title,
      );
      if (matches.length === 0) {
        state.pendingChoice = {
          sourceId,
          chooser: "runner",
          options: [
            {
              id: "decline-search",
              label: "Decline search",
              effect: {
                op: "do" as const,
                action: { kind: "gain_credits", side: "runner", amount: 0 },
              },
            },
            {
              id: "search-none",
              label: `Search stack for another ${title} (none)`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "search_stack_copy_of_last_installed_hardware_add_to_grip" as const,
                },
              },
            },
          ],
        };
        log(
          state,
          `${source.title} — may search stack for another ${title}.`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "decline-search",
            label: "Decline search",
            effect: {
              op: "do" as const,
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
          {
            id: "search-copy",
            label: `Search stack for another ${title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "search_stack_copy_of_last_installed_hardware_add_to_grip" as const,
              },
            },
          },
        ],
      };
      log(state, `${source.title} — may search stack for another ${title}.`);
      return { ok: true };
    }
    case "search_stack_copy_of_last_installed_hardware_add_to_grip": {
      const lastId = state.turn.lastHardwareInstalledId;
      const last = lastId ? state.cards[lastId] : undefined;
      if (!last || last.type !== "hardware") {
        shuffleRunnerStack(state);
        log(state, `${source.title} — search: no hardware install.`);
        return { ok: true };
      }
      const title = last.title;
      const matches = state.runner.deck.filter(
        (id) => state.cards[id]?.title === title,
      );
      if (matches.length === 0) {
        shuffleRunnerStack(state);
        log(state, `Search stack for ${title} — none found.`);
        return { ok: true };
      }
      const id = matches[0]!;
      state.runner.deck = state.runner.deck.filter((x) => x !== id);
      state.runner.hand.push(id);
      state.cards[id]!.zone = "runner:grip";
      state.cards[id]!.faceup = true;
      shuffleRunnerStack(state);
      log(
        state,
        `Search stack — reveal ${state.cards[id]!.title} and add to grip.`,
      );
      return { ok: true };
    }
    case "look_top_last_trace_excess_stack_trash_one_arrange_rest": {
      const n = Math.max(0, state.turn.lastTraceExcess ?? 0);
      if (n <= 0) {
        log(state, `${source.title} — look top 0 of stack (no excess).`);
        return { ok: true };
      }
      const taken = state.runner.deck.splice(
        0,
        Math.min(n, state.runner.deck.length),
      );
      if (taken.length === 0) {
        log(state, `${source.title} — stack empty.`);
        return { ok: true };
      }
      for (const id of taken) {
        state.cards[id]!.faceup = true;
        log(state, `Look stack — ${state.cards[id]!.title}.`);
      }
      state.turn.rdLookedCards = taken;
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: taken.map((id) => ({
          id: `data-hound-trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "data_hound_trash_looked" as const,
              cardId: id,
            },
          },
        })),
      };
      log(
        state,
        `${source.title} — Corp trashes 1 of ${taken.length} looked card(s).`,
      );
      return { ok: true };
    }
    case "data_hound_trash_looked": {
      const looked = state.turn.rdLookedCards ?? [];
      const idx = looked.indexOf(action.cardId);
      if (idx < 0) {
        log(state, `Data Hound trash — card not in look zone.`);
        return { ok: true };
      }
      looked.splice(idx, 1);
      trashToHeap(state, action.cardId);
      log(
        state,
        `Trash ${state.cards[action.cardId]!.title} from stack look.`,
      );
      state.turn.rdLookedCards = looked;
      if (looked.length === 0) {
        return { ok: true };
      }
      // Arrange remaining in any order on top of stack (Corp chooses order).
      // Simple path: present permutation via sequential top-placement.
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "arrange-as-is",
            label: "Arrange remaining (current order on top)",
            effect: {
              op: "do" as const,
              action: {
                kind: "data_hound_arrange_looked" as const,
                order: [...looked],
              },
            },
          },
          ...looked.map((id) => ({
            id: `arrange-first:${id}`,
            label: `Put ${state.cards[id]!.title} on top first`,
            effect: {
              op: "do" as const,
              action: {
                kind: "data_hound_arrange_looked" as const,
                order: [id, ...looked.filter((x) => x !== id)],
              },
            },
          })),
        ],
      };
      log(state, `${source.title} — arrange remaining looked cards.`);
      return { ok: true };
    }
    case "data_hound_arrange_looked": {
      const order = action.order ?? [];
      for (let i = order.length - 1; i >= 0; i--) {
        const id = order[i]!;
        state.cards[id]!.faceup = false;
        state.runner.deck.unshift(id);
      }
      state.turn.rdLookedCards = [];
      log(
        state,
        `Arrange ${order.length} card(s) on top of stack.`,
      );
      return { ok: true };
    }
    case "choose_server_corp_trash_ice_protecting": {
      const servers = (Object.keys(state.servers) as import("../state/types.js").ServerId[]).filter(
        (sid) => (state.servers[sid]?.ice.length ?? 0) > 0,
      );
      if (servers.length === 0) {
        log(state, `${source.title} — no servers with ice.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: servers.map((serverId) => ({
          id: `kraken-server:${serverId}`,
          label: `Choose ${serverId}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "corp_trash_ice_protecting_server" as const,
              serverId,
            },
          },
        })),
      };
      log(state, `${source.title} — choose a server.`);
      return { ok: true };
    }
    case "corp_trash_ice_protecting_server": {
      const sid = action.serverId as import("../state/types.js").ServerId;
      const ice = [...(state.servers[sid]?.ice ?? [])];
      if (ice.length === 0) {
        log(state, `${source.title} — no ice protecting ${action.serverId}.`);
        return { ok: true };
      }
      if (ice.length === 1) {
        return applyPrimitive(ctx, {
          kind: "corp_trash_ice_card",
          cardId: ice[0]!,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: ice.map((id) => ({
          id: `kraken-trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: { kind: "corp_trash_ice_card" as const, cardId: id },
          },
        })),
      };
      log(
        state,
        `${source.title} — Corp trashes 1 ice protecting ${action.serverId}.`,
      );
      return { ok: true };
    }
    case "corp_trash_ice_card": {
      const card = state.cards[action.cardId];
      if (!card || card.type !== "ice") {
        log(state, `Corp trash ice — invalid target.`);
        return { ok: true };
      }
      const r = applyPrimitive(ctx, {
        kind: "trash_corp_card",
        cardId: action.cardId,
      });
      if (!r.ok) return r;
      log(state, `Corp trashes ice ${card.title}.`);
      return { ok: true };
    }
    case "trash_virtual_resource_or_link_card": {
      const targets = state.runner.rig.filter((id) => {
        const c = state.cards[id];
        if (!c) return false;
        const subs = (c.subtypes ?? []).map((s) => s.toLowerCase());
        if (c.type === "resource" && subs.includes("virtual")) return true;
        if (subs.includes("link")) return true;
        return false;
      });
      if (targets.length === 0) {
        log(
          state,
          `Trash virtual resource or link — none installed (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      if (action.pick === "choose" && targets.length > 1) {
        state.pendingTrashProgram = {
          sourceId,
          candidates: [...targets],
        };
        log(
          state,
          `Trash virtual/link — Corp must choose among ${targets.length} (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const id = targets[0]!;
      const title = state.cards[id]!.title;
      trashToHeap(state, id);
      log(
        state,
        `Trash ${title} (virtual resource or link) (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "remove_virus_counters": {
      const have = source.virusCounters ?? 0;
      const removed = Math.min(action.amount, have);
      source.virusCounters = have - removed;
      log(
        state,
        `Remove ${removed} virus counter(s) from ${source.title} → ${source.virusCounters}.`,
      );
      return { ok: true };
    }
    case "gain_credits_per_virus": {
      const n = source.virusCounters ?? 0;
      const gained = n * action.per;
      const side = source.side;
      const p = side === "corp" ? state.corp : state.runner;
      p.credits += gained;
      log(
        state,
        `${side} gains ${gained}¢ (${n} virus × ${action.per}) from ${source.title} (CR ${CR.gainCredits.number}).`,
      );
      return { ok: true };
    }
    case "increase_hand_size": {
      const side = resolveSide(ctx, action.side);
      const p = side === "corp" ? state.corp : state.runner;
      p.maxHandSize += action.amount;
      log(
        state,
        `${side} max hand size +${action.amount} → ${p.maxHandSize} (CR ${CR.maxHandSize.number}).`,
      );
      return { ok: true };
    }
    case "trash_hq": {
      const hq = [...state.corp.hand];
      if (hq.length === 0) {
        log(state, `Trash from HQ — HQ empty (CR ${CR.trashing.number}).`);
        return { ok: true };
      }
      const amount = Math.max(1, action.amount ?? 1);
      if (action.pick === "random") {
        const n = Math.min(amount, hq.length);
        // Deterministic "random": trash from the end of HQ.
        const picks = hq.slice(hq.length - n);
        for (const id of picks) {
          trashCorpCardToArchives(state, id);
          log(
            state,
            `Trash ${state.cards[id].title} from HQ at random (CR ${CR.trashing.number}).`,
          );
        }
        if (action.then) {
          return evalEffect(ctx, action.then);
        }
        return { ok: true };
      }
      if (action.pick === "choose" && hq.length > 1) {
        // Multi-card HQ choose leaves pending; `then` deferred until host
        // resolves the trash (Anemone uses pick:"first" for auto).
        state.pendingTrashProgram = { sourceId, candidates: hq };
        log(
          state,
          `Trash from HQ — Corp must choose among ${hq.length} (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const n = Math.min(amount, hq.length);
      const picks = hq.slice(hq.length - n);
      for (const id of picks) {
        trashCorpCardToArchives(state, id);
        log(
          state,
          `Trash ${state.cards[id].title} from HQ (CR ${CR.trashing.number}).`,
        );
      }
      if (action.then) {
        return evalEffect(ctx, action.then);
      }
      return { ok: true };
    }
    case "trash_hq_card": {
      if (!state.corp.hand.includes(action.cardId)) {
        log(state, `Trash HQ card — not in HQ.`);
        return { ok: true };
      }
      const title = state.cards[action.cardId]!.title;
      trashCorpCardToArchives(state, action.cardId);
      log(
        state,
        `Trash ${title} from HQ (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "trash_hardware": {
      const encIce = state.run?.encounter?.iceId;
      if (
        encIce === sourceId &&
        source.maxInstalledRunnerTrashesPerEncounter &&
        (state.run!.encounter!.installedRunnerTrashesThisEncounter ?? 0) >=
          source.maxInstalledRunnerTrashesPerEncounter
      ) {
        log(
          state,
          `${source.title} — already trashed max installed Runner cards this encounter.`,
        );
        return { ok: true };
      }
      const hw = state.runner.rig.filter(
        (id) => state.cards[id].type === "hardware",
      );
      if (action.pick === "choose") {
        return pendingTrashAmong(state, sourceId, hw, "hardware");
      }
      if (hw.length === 0) {
        log(state, `Trash hardware — none installed (CR ${CR.trashing.number}).`);
        return { ok: true };
      }
      const id = hw[0]!;
      trashToHeap(state, id);
      log(
        state,
        `Trash installed hardware ${state.cards[id].title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "trash_hardware_install_cost_lte_last_trace_excess": {
      const maxCost = state.turn.lastTraceExcess;
      if (maxCost === null || maxCost === undefined) {
        log(
          state,
          `${source.title} — no last trace excess; cannot trash hardware.`,
        );
        return { ok: true };
      }
      const hw = state.runner.rig.filter((id) => {
        const c = state.cards[id];
        return (
          c?.type === "hardware" && (c.installCost ?? 0) <= maxCost
        );
      });
      if (hw.length === 0) {
        log(
          state,
          `Trash hardware ≤${maxCost} install — none installed (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      if (action.pick === "choose" || hw.length > 1) {
        return pendingTrashAmong(
          state,
          sourceId,
          hw,
          `hardware (install ≤${maxCost})`,
        );
      }
      const id = hw[0]!;
      trashToHeap(state, id);
      log(
        state,
        `Trash installed hardware ${state.cards[id].title} (install ≤${maxCost}) (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "trash_up_to_n_resources": {
      const remaining =
        typeof action.remaining === "number" ? action.remaining : action.n;
      if (remaining <= 0) return { ok: true };
      const resources = state.runner.rig.filter(
        (id) => state.cards[id]?.type === "resource",
      );
      if (resources.length === 0) {
        log(
          state,
          `Trash up to ${remaining} resources — none installed (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        resources.map((id) => ({
          id: `trash-res-up:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "seq" as const,
            effects: [
              {
                op: "do" as const,
                action: {
                  kind: "trash_runner_rig_card" as const,
                  cardId: id,
                },
              },
              {
                op: "do" as const,
                action: {
                  kind: "trash_up_to_n_resources" as const,
                  n: action.n,
                  remaining: remaining - 1,
                },
              },
            ],
          },
        }));
      options.push({
        id: "decline",
        label: "Decline further trashes",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(
        state,
        `${source.title} — may trash up to ${remaining} more resource(s).`,
      );
      return { ok: true };
    }
    case "trash_program_or_hardware": {
      const cands = state.runner.rig.filter((id) => {
        const t = state.cards[id].type;
        return t === "program" || t === "hardware";
      });
      if (action.pick === "choose" || cands.length > 1) {
        return pendingTrashAmong(
          state,
          sourceId,
          cands,
          "program or hardware",
        );
      }
      if (cands.length === 0) {
        log(
          state,
          `Trash program/hardware — none installed (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const id = cands[0]!;
      trashToHeap(state, id);
      log(
        state,
        `Trash installed ${state.cards[id].title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "trash_resource_or_hardware": {
      const cands = state.runner.rig.filter((id) => {
        const typ = state.cards[id].type;
        return typ === "resource" || typ === "hardware";
      });
      if (action.pick === "choose" || cands.length > 1) {
        return pendingTrashAmong(
          state,
          sourceId,
          cands,
          "resource or hardware",
        );
      }
      if (cands.length === 0) {
        log(
          state,
          `Trash resource/hardware — none installed (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const id = cands[0]!;
      trashToHeap(state, id);
      log(
        state,
        `Trash installed ${state.cards[id].title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }

    case "shuffle_hq_to_rd": {
      const n = Math.min(action.amount, state.corp.hand.length);
      for (let i = 0; i < n; i++) {
        const id = state.corp.hand.pop()!;
        state.corp.deck.push(id);
        state.cards[id].zone = "corp:rd";
        state.cards[id].faceup = false;
      }
      // Deterministic "shuffle": reverse then rotate by hand size (stable for tests).
      state.corp.deck.reverse();
      log(
        state,
        `Shuffle ${n} from HQ into R&D (CR ${CR.drawing.number}).`,
      );
      return { ok: true };
    }
    case "shuffle_any_number_hq_to_rd": {
      if (state.corp.hand.length === 0) {
        log(state, `Shuffle from HQ into R&D — HQ empty.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          ...state.corp.hand.map((id) => {
            const c = state.cards[id]!;
            return {
              id: `shuffle-hq:${id}`,
              label: `Shuffle ${c.title} into R&D`,
              effect: {
                op: "seq" as const,
                effects: [
                  {
                    op: "do" as const,
                    action: {
                      kind: "shuffle_hq_card_into_rd" as const,
                      cardId: id,
                    },
                  },
                  {
                    op: "do" as const,
                    action: { kind: "shuffle_any_number_hq_to_rd" as const },
                  },
                ],
              },
            };
          }),
          {
            id: "shuffle-done",
            label: "Done",
            effect: {
              op: "do" as const,
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
        ],
      };
      log(state, `May shuffle any number of cards from HQ into R&D.`);
      return { ok: true };
    }
    case "shuffle_hq_card_into_rd": {
      const cardId = action.cardId;
      const idx = state.corp.hand.indexOf(cardId);
      if (idx < 0) {
        log(state, `Shuffle HQ card into R&D — not in HQ.`);
        return { ok: true };
      }
      state.corp.hand.splice(idx, 1);
      state.corp.deck.push(cardId);
      const card = state.cards[cardId];
      card.zone = "corp:rd";
      card.faceup = false;
      state.corp.deck.reverse();
      log(
        state,
        `Shuffle ${card.title} from HQ into R&D (CR ${CR.drawing.number}).`,
      );
      return { ok: true };
    }
    case "may_remove_power_counters_then_net_damage": {
      const hosted = source.powerCounters ?? 0;
      const maxRemove = Math.min(action.maxRemove, hosted);
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (let n = 0; n <= maxRemove; n++) {
        const dmg = action.base + action.perRemoved * n;
        options.push({
          id: `remove-${n}`,
          label:
            n === 0
              ? `Remove 0 power counters — do ${dmg} net damage`
              : `Remove ${n} power counter(s) — do ${dmg} net damage`,
          effect: {
            op: "seq",
            effects: [
              ...(n > 0
                ? [
                    {
                      op: "do" as const,
                      action: {
                        kind: "remove_power_counter" as const,
                        amount: n,
                      },
                    },
                  ]
                : []),
              {
                op: "do" as const,
                action: { kind: "net_damage" as const, amount: dmg },
              },
            ],
          },
        });
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(
        state,
        `${source.title} — may remove up to ${maxRemove} power counter(s), then net damage.`,
      );
      return { ok: true };
    }
    case "set_rez_ice_forfeit_discount": {
      if (action.forfeit) {
        state.turn.rezIceForfeitDiscountCardId = action.cardId;
      } else {
        state.turn.rezIceForfeitDiscountCardId = null;
      }
      log(
        state,
        action.forfeit
          ? `Rez ${state.cards[action.cardId]?.title ?? action.cardId} — will forfeit an agenda for discount.`
          : `Rez ${state.cards[action.cardId]?.title ?? action.cardId} — pay full cost.`,
      );
      return { ok: true };
    }
    case "shuffle_archives_to_rd": {
      const n = Math.min(action.amount, state.corp.discard.length);
      for (let i = 0; i < n; i++) {
        const id = state.corp.discard.pop()!;
        state.corp.deck.push(id);
        state.cards[id].zone = "corp:rd";
        state.cards[id].faceup = false;
      }
      state.corp.deck.reverse();
      log(
        state,
        `Shuffle ${n} from Archives into R&D (CR ${CR.drawing.number}).`,
      );
      return { ok: true };
    }
    case "net_damage_agenda_points_this_turn": {
      const amount = state.turn.agendaPointsScoredThisTurn;
      if (amount <= 0) {
        log(state, `Neurospike — 0 agenda points scored this turn.`);
        return { ok: true };
      }
      dealDamage(state, "net", amount, sourceId);
      return { ok: true };
    }
    case "forbid_scoring_agendas_this_turn": {
      state.turn.cannotScoreAgendas = true;
      log(state, `Cannot score agendas for the remainder of this turn.`);
      return { ok: true };
    }
    case "forbid_advance_this_turn": {
      state.turn.cannotAdvanceCards = true;
      log(state, `Cannot advance cards for the remainder of this turn.`);
      return { ok: true };
    }
    case "skip_discard_this_turn": {
      state.turn.skipDiscardThisTurn = true;
      log(state, `Skip discard step this turn.`);
      return { ok: true };
    }
    case "place_advancements": {
      const installed: string[] = [];
      if (action.anyInstalledIce) {
        for (const server of Object.values(state.servers)) {
          for (const id of server.ice) {
            if (action.excludeSelf && id === sourceId) continue;
            if (state.cards[id]?.type === "ice") installed.push(id);
          }
        }
      } else if (action.onlyRemoteRoot) {
        for (const server of Object.values(state.servers)) {
          if (server.kind !== "remote") continue;
          for (const id of server.root) {
            if (action.excludeSelf && id === sourceId) continue;
            if (state.cards[id]) installed.push(id);
          }
        }
      } else if (action.onlyIceProtectingSourceServerWithNoAdvancements) {
        const zone = source.zone;
        if (zone.startsWith("server:") && zone.endsWith(":root")) {
          const serverId = zone
            .replace(/^server:/, "")
            .replace(/:root$/, "") as import("../state/types.js").ServerId;
          const server = state.servers[serverId];
          if (server) {
            for (const id of server.ice) {
              const c = state.cards[id];
              if (c?.type === "ice" && (c.advancementTokens ?? 0) === 0) {
                installed.push(id);
              }
            }
          }
        }
      } else if (action.onlyIceProtectingSourceServer) {
        const zone = source.zone;
        if (zone.startsWith("server:") && zone.endsWith(":root")) {
          const serverId = zone
            .replace(/^server:/, "")
            .replace(/:root$/, "") as import("../state/types.js").ServerId;
          const server = state.servers[serverId];
          if (server) {
            for (const id of server.ice) {
              if (state.cards[id]?.type === "ice") installed.push(id);
            }
          }
        }
      } else if (action.sameServerRootOrIceAsSource) {
        const zone = source.zone;
        if (zone.startsWith("server:") && zone.endsWith(":root")) {
          const serverId = zone
            .replace(/^server:/, "")
            .replace(/:root$/, "") as import("../state/types.js").ServerId;
          const server = state.servers[serverId];
          if (server) {
            for (const id of [...server.root, ...server.ice]) {
              if (action.excludeSelf && id === sourceId) continue;
              const c = state.cards[id];
              if (c && (c.type === "agenda" || c.canAdvance)) {
                installed.push(id);
              }
            }
          }
        }
      } else if (action.sameServerRootAsSource) {
        const zone = source.zone;
        if (zone.startsWith("server:") && zone.endsWith(":root")) {
          const serverId = zone
            .replace(/^server:/, "")
            .replace(/:root$/, "") as import("../state/types.js").ServerId;
          const server = state.servers[serverId];
          if (server) {
            for (const id of server.root) {
              if (action.excludeSelf && id === sourceId) continue;
              const c = state.cards[id];
              if (c && (c.type === "agenda" || c.canAdvance)) {
                installed.push(id);
              }
            }
          }
        }
      } else {
        for (const server of Object.values(state.servers)) {
          for (const id of [...server.root, ...server.ice]) {
            if (action.excludeSelf && id === sourceId) continue;
            const c = state.cards[id];
            // Advanceable only: agendas always; other cards need canAdvance
            // (CR §1.9.5f / Vasilisa; Seamless Launch).
            if (c.type === "agenda" || c.canAdvance) {
              installed.push(id);
            }
          }
        }
      }
      let candidates = installed;
      if (action.preferNotInstalledThisTurn) {
        const filtered = installed.filter(
          (id) => !state.turn.installedThisTurn.includes(id),
        );
        if (filtered.length > 0) candidates = filtered;
      }
      if (action.unrezzedOnly) {
        candidates = candidates.filter((id) => !state.cards[id]?.rezzed);
      }
      if (action.faceupOnly) {
        candidates = candidates.filter((id) => {
          const c = state.cards[id];
          return Boolean(c?.faceup || c?.rezzed);
        });
      }
      if (candidates.length === 0) {
        log(state, `Place advancements — no eligible card.`);
        if (action.then) return evalEffect(ctx, action.then);
        return { ok: true };
      }
      const pickMode = action.pick ?? "first";
      if (pickMode === "choose" && candidates.length > 1) {
        const options: Array<{ id: string; label: string; effect: Effect }> =
          candidates.map((id) => ({
            id: `adv:${id}`,
            label: `Place on ${state.cards[id]!.title}`,
            effect: {
              op: "do",
              action: {
                kind: "place_advancements_on",
                cardId: id,
                amount: action.amount,
                ...(action.cannotScoreTargetThisTurn
                  ? { cannotScoreTargetThisTurn: true }
                  : {}),
                ...(action.then !== undefined
                  ? { then: structuredClone(action.then) }
                  : {}),
              },
            },
          }));
        options.push({
          id: "decline",
          label: "Decline",
          effect: action.then
            ? structuredClone(action.then)
            : {
                op: "do",
                action: { kind: "gain_credits", side: "corp", amount: 0 },
              },
        });
        state.pendingChoice = { sourceId, chooser: "corp", options };
        log(state, `${source.title} — choose card for advancements.`);
        return { ok: true };
      }
      return finishPlaceAdvancementsOnTarget(
        ctx,
        action,
        sourceId,
        source,
        candidates[0]!,
      );
    }
    case "place_advancements_on_self_per_faceup_archive_types": {
      const types = new Set<string>();
      for (const id of state.corp.discard) {
        const c = state.cards[id];
        if (c?.faceup) types.add(c.type);
      }
      const n = (action.base ?? 0) + types.size;
      source.advancementTokens = (source.advancementTokens ?? 0) + n;
      log(
        state,
        `Place ${n} advancement(s) on ${source.title} (base ${action.base ?? 0} + ${types.size} faceup Archives types) → ${source.advancementTokens}.`,
      );
      return { ok: true };
    }

    case "score_self_as_agenda": {
      const pts = action.agendaPoints ?? source.agendaPoints ?? 1;
      source.agendaPoints = pts;
      removeCardFromCurrentZone(state, sourceId);
      state.corp.score.push(sourceId);
      source.zone = "corp:score";
      source.faceup = true;
      source.rezzed = true;
      state.turn.agendaPointsScoredThisTurn += pts;
      log(
        state,
        `Corp adds ${source.title} to the score area as a ${pts}-point agenda (CR ${CR.scoringAgenda.number}).`,
      );
      checkWinConditions(state);
      return { ok: true };
    }
    case "add_to_runner_score_as_agenda": {
      const pts = action.agendaPoints ?? source.agendaPoints ?? 0;
      source.agendaPoints = pts;
      if (action.addSubtypes?.length) {
        const merged = new Set([
          ...(source.subtypes ?? []),
          ...action.addSubtypes,
        ]);
        source.subtypes = [...merged];
      }
      removeCardFromCurrentZone(state, sourceId);
      state.runner.score.push(sourceId);
      source.zone = "runner:score";
      source.faceup = true;
      source.rezzed = true;
      if (state.run) {
        state.run.accessCandidates = state.run.accessCandidates.filter(
          (id) => id !== sourceId,
        );
        state.run.accessingCardId = null;
      }
      log(
        state,
        `Runner adds ${source.title} to the score area as a ${pts}-point agenda (CR ${CR.scoringAgenda.number}).`,
      );
      checkWinConditions(state);
      return { ok: true };
    }
    case "add_to_corp_score_as_agenda": {
      const pts = action.agendaPoints;
      source.agendaPoints = pts;
      if (action.cannotForfeit) source.cannotForfeit = true;
      removeCardFromCurrentZone(state, sourceId);
      state.corp.score.push(sourceId);
      source.zone = "corp:score";
      source.faceup = true;
      source.rezzed = true;
      state.turn.agendaPointsScoredThisTurn += pts;
      log(
        state,
        `Corp adds ${source.title} to the score area as a ${pts}-point agenda` +
          (action.cannotForfeit ? " (cannot forfeit)" : "") +
          ` (CR ${CR.scoringAgenda.number}).`,
      );
      checkWinConditions(state);
      return { ok: true };
    }
    case "may_pay_credits_for_core_damage": {
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      if (state.corp.credits >= action.amount) {
        options.push({
          id: "pay",
          label: `Pay ${action.amount}¢: do ${action.damage} core damage`,
          effect: {
            op: "seq",
            effects: [
              {
                op: "do",
                action: {
                  kind: "lose_credits",
                  side: "corp",
                  amount: action.amount,
                },
              },
              {
                op: "do",
                action: {
                  kind: "core_damage",
                  amount: action.damage,
                  interactive: true,
                  preventByLoseAllClicks: true,
                },
              },
            ],
          },
        });
      }
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options,
      };
      log(
        state,
        `${source.title} — may pay ${action.amount}¢ to do ${action.damage} core damage.`,
      );
      return { ok: true };
    }
    case "may_pay_credits_for_core_damage_per_advancement": {
      const damage = source.advancementTokens ?? 0;
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      if (damage > 0 && state.corp.credits >= action.amount) {
        options.push({
          id: "pay",
          label: `Pay ${action.amount}¢: do ${damage} core damage`,
          effect: {
            op: "seq",
            effects: [
              {
                op: "do",
                action: {
                  kind: "lose_credits",
                  side: "corp",
                  amount: action.amount,
                },
              },
              {
                op: "do",
                action: {
                  kind: "core_damage",
                  amount: damage,
                  interactive: true,
                  preventByLoseAllClicks: true,
                },
              },
            ],
          },
        });
      }
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options,
      };
      log(
        state,
        `${source.title} — may pay ${action.amount}¢ to do ${damage} core damage (per advancement).`,
      );
      return { ok: true };
    }
    case "may_pay_credits_for_net_damage_per_advancement": {
      const per = Math.max(1, action.per);
      const damage = per * (source.advancementTokens ?? 0);
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      if (damage > 0 && state.corp.credits >= action.amount) {
        options.push({
          id: "pay",
          label: `Pay ${action.amount}¢: do ${damage} net damage`,
          effect: {
            op: "seq",
            effects: [
              {
                op: "do",
                action: {
                  kind: "lose_credits",
                  side: "corp",
                  amount: action.amount,
                },
              },
              {
                op: "do",
                action: {
                  kind: "net_damage",
                  amount: damage,
                },
              },
            ],
          },
        });
      }
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options,
      };
      log(
        state,
        `${source.title} — may pay ${action.amount}¢ to do ${damage} net damage (${per} per advancement).`,
      );
      return { ok: true };
    }
    case "may_pay_credits_for_trash_programs_per_advancement": {
      const count = source.advancementTokens ?? 0;
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      if (count > 0 && state.corp.credits >= action.amount) {
        options.push({
          id: "pay",
          label: `Pay ${action.amount}¢: trash ${count} program(s)`,
          effect: {
            op: "seq",
            effects: [
              {
                op: "do",
                action: {
                  kind: "lose_credits",
                  side: "corp",
                  amount: action.amount,
                },
              },
              {
                op: "do",
                action: {
                  kind: "trash_n_programs_remaining",
                  remaining: count,
                },
              },
            ],
          },
        });
      }
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options,
      };
      log(
        state,
        `${source.title} — may pay ${action.amount}¢ to trash ${count} program(s) (1 per advancement).`,
      );
      return { ok: true };
    }
    case "trash_n_programs_remaining": {
      const remaining = Math.max(0, action.remaining ?? 0);
      if (remaining <= 0) return { ok: true };
      const programs = state.runner.rig.filter(
        (id) => state.cards[id]?.type === "program",
      );
      if (programs.length === 0) {
        log(
          state,
          `Trash programs — none installed (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      if (programs.length === 1) {
        const pick = programs[0]!;
        const title = state.cards[pick]!.title;
        trashToHeap(state, pick);
        log(
          state,
          `Trash installed program ${title} (CR ${CR.trashing.number}).`,
        );
        if (remaining > 1) {
          return applyPrimitive(ctx, {
            kind: "trash_n_programs_remaining",
            remaining: remaining - 1,
          });
        }
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: programs.map((id) => ({
          id: `trash-prog:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "seq" as const,
            effects: [
              {
                op: "do" as const,
                action: {
                  kind: "trash_runner_rig_card" as const,
                  cardId: id,
                },
              },
              {
                op: "do" as const,
                action: {
                  kind: "trash_n_programs_remaining" as const,
                  remaining: remaining - 1,
                },
              },
            ],
          },
        })),
      };
      log(
        state,
        `Trash programs — choose among ${programs.length} (${remaining} remaining; CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "may_pay_credits_for_shuffle_installed_runner_per_advancement": {
      const count = source.advancementTokens ?? 0;
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      if (count > 0 && state.corp.credits >= action.amount) {
        options.push({
          id: "pay",
          label: `Pay ${action.amount}¢: shuffle ${count} installed Runner card(s)`,
          effect: {
            op: "seq",
            effects: [
              {
                op: "do",
                action: {
                  kind: "lose_credits",
                  side: "corp",
                  amount: action.amount,
                },
              },
              {
                op: "do",
                action: {
                  kind: "shuffle_n_installed_runner_remaining",
                  remaining: count,
                },
              },
            ],
          },
        });
      }
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options,
      };
      log(
        state,
        `${source.title} — may pay ${action.amount}¢ to shuffle ${count} installed Runner card(s) (1 per advancement).`,
      );
      return { ok: true };
    }
    case "shuffle_n_installed_runner_remaining": {
      const remaining = Math.max(0, action.remaining ?? 0);
      if (remaining <= 0) return { ok: true };
      const installed: string[] = [];
      for (const id of state.runner.rig) {
        if (!state.cards[id]?.hostId) installed.push(id);
      }
      for (const card of Object.values(state.cards)) {
        if (
          card.side === "runner" &&
          card.hostId &&
          !installed.includes(card.id)
        ) {
          installed.push(card.id);
        }
      }
      if (installed.length === 0) {
        log(state, `Shuffle installed Runner cards — none installed.`);
        return { ok: true };
      }
      if (installed.length === 1) {
        const pick = installed[0]!;
        const r = applyPrimitive(ctx, {
          kind: "shuffle_runner_card_into_stack",
          cardId: pick,
        });
        if (!r.ok) return r;
        if (remaining > 1) {
          return applyPrimitive(ctx, {
            kind: "shuffle_n_installed_runner_remaining",
            remaining: remaining - 1,
          });
        }
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: installed.map((id) => ({
          id: `shuffle-n:${id}`,
          label: `Shuffle ${state.cards[id]!.title} into the stack`,
          effect: {
            op: "seq" as const,
            effects: [
              {
                op: "do" as const,
                action: {
                  kind: "shuffle_runner_card_into_stack" as const,
                  cardId: id,
                },
              },
              {
                op: "do" as const,
                action: {
                  kind: "shuffle_n_installed_runner_remaining" as const,
                  remaining: remaining - 1,
                },
              },
            ],
          },
        })),
      };
      log(
        state,
        `Shuffle installed Runner cards — choose among ${installed.length} (${remaining} remaining).`,
      );
      return { ok: true };
    }
    case "install_any_number_from_hq_ignore_costs": {
      const installable = state.corp.hand.filter((id) =>
        corpCardInstallable(state.cards[id]?.type ?? ""),
      );
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "done-hq-install",
          label: "Done",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const cardId of installable) {
        const card = state.cards[cardId]!;
        if (card.type === "ice") {
          for (const server of Object.values(state.servers)) {
            options.push({
              id: `hq-any:${cardId}:${server.id}`,
              label: `Install ${card.title} protecting ${server.id}`,
              effect: {
                op: "seq",
                effects: [
                  {
                    op: "do",
                    action: {
                      kind: "install_hq_card_ignore_costs",
                      cardId,
                      serverId: server.id,
                    },
                  },
                  {
                    op: "do",
                    action: { kind: "install_any_number_from_hq_ignore_costs" },
                  },
                ],
              },
            });
          }
        } else {
          for (const server of Object.values(state.servers)) {
            if (server.kind !== "remote") continue;
            options.push({
              id: `hq-any:${cardId}:${server.id}`,
              label: `Install ${card.title} on ${server.id}`,
              effect: {
                op: "seq",
                effects: [
                  {
                    op: "do",
                    action: {
                      kind: "install_hq_card_ignore_costs",
                      cardId,
                      serverId: server.id,
                    },
                  },
                  {
                    op: "do",
                    action: { kind: "install_any_number_from_hq_ignore_costs" },
                  },
                ],
              },
            });
          }
          options.push({
            id: `hq-any:${cardId}:new`,
            label: `Install ${card.title} on new remote`,
            effect: {
              op: "seq",
              effects: [
                {
                  op: "do",
                  action: {
                    kind: "install_hq_card_ignore_costs",
                    cardId,
                    serverId: "__new_remote__",
                  },
                },
                {
                  op: "do",
                  action: { kind: "install_any_number_from_hq_ignore_costs" },
                },
              ],
            },
          });
        }
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(
        state,
        `Install any number from HQ ignoring all costs (${installable.length} installable).`,
      );
      return { ok: true };
    }
    case "search_stack_subtype_may_install": {
      const want = action.subtype.toLowerCase();
      const matches = state.runner.deck.filter((id) =>
        (state.cards[id]?.subtypes ?? []).some(
          (s) => s.toLowerCase() === want,
        ),
      );
      if (matches.length === 0) {
        shuffleRunnerStack(state);
        log(
          state,
          `Search stack for ${action.subtype} — none found.`,
        );
        return { ok: true };
      }
      const id = matches[0]!;
      state.runner.deck = state.runner.deck.filter((x) => x !== id);
      state.runner.hand.push(id);
      state.cards[id]!.zone = "runner:grip";
      state.cards[id]!.faceup = true;
      shuffleRunnerStack(state);
      log(
        state,
        matches.length === 1
          ? `Search stack — add ${state.cards[id]!.title} to grip.`
          : `Search stack — add ${state.cards[id]!.title} to grip (${matches.length} matches; first selected).`,
      );
      const card = state.cards[id]!;
      const cost = gripInstallCostAfterDiscount(state, card, 0);
      const canInstall =
        ["program", "hardware", "resource"].includes(card.type) &&
        !(card.installOnIce || (card.subtypes ?? []).includes("trojan")) &&
        (card.type !== "program" ||
          usedMemory(state) + effectiveMemoryCost(state, id) <= memoryLimit(state)) &&
        creditsAvailableForInstall(state, "runner") >= cost;
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-install",
          label: "Decline install",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "runner", amount: 0 },
          },
        },
      ];
      if (canInstall) {
        options.unshift({
          id: `install:${id}`,
          label: `Install ${card.title} for ${cost}¢`,
          effect: {
            op: "do",
            action: {
              kind: "install_grip_card",
              cardId: id,
              discount: 0,
            },
          },
        });
      }
      state.pendingChoice = { sourceId, chooser: "runner", options };
      log(
        state,
        `${source.title} — may install ${card.title} from grip.`,
      );
      return { ok: true };
    }
    case "grant_chosen_ice_subtypes_until_end_of_turn": {
      const iceIds: string[] = [];
      for (const server of Object.values(state.servers)) {
        iceIds.push(...server.ice);
      }
      if (iceIds.length === 0) {
        log(state, `${source.title} — no ice to grant subtypes.`);
        return { ok: true };
      }
      const subtypes = action.subtypes ?? [];
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: iceIds.map((id) => ({
          id: `tinker:${id}`,
          label: `${state.cards[id]!.title} gains ${subtypes.join(", ")} until end of turn`,
          effect: {
            op: "do" as const,
            action: {
              kind: "grant_ice_subtypes_until_end_of_turn" as const,
              cardId: id,
              subtypes,
            },
          },
        })),
      };
      log(
        state,
        `${source.title} — choose ice to gain ${subtypes.join(", ")} until end of turn.`,
      );
      return { ok: true };
    }
    case "grant_ice_subtypes_until_end_of_turn": {
      const ice = state.cards[action.cardId];
      if (!ice) {
        log(state, `Grant subtypes — unknown ice ${action.cardId}.`);
        return { ok: true };
      }
      const granted = ice.grantedSubtypesUntilEndOfTurn ?? [];
      for (const s of action.subtypes ?? []) {
        if (!granted.includes(s)) granted.push(s);
      }
      ice.grantedSubtypesUntilEndOfTurn = granted;
      log(
        state,
        `${ice.title} gains ${action.subtypes.join(", ")} until end of turn.`,
      );
      return { ok: true };
    }
    case "queens_gambit_place_up_to": {
      const max = Math.max(0, action.max ?? 0);
      const creditsPer = Math.max(0, action.creditsPer ?? 0);
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        if (server.kind !== "remote") continue;
        for (const id of server.root) {
          const c = state.cards[id];
          if (!c || c.rezzed) continue;
          targets.push(id);
        }
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline",
          label: "Decline (place 0)",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "runner", amount: 0 },
          },
        },
      ];
      for (const cardId of targets) {
        const title = state.cards[cardId]!.title;
        for (let n = 1; n <= max; n++) {
          options.push({
            id: `qg:${cardId}:${n}`,
            label: `Place ${n} on ${title} (gain ${n * creditsPer}¢)`,
            effect: {
              op: "do",
              action: {
                kind: "queens_gambit_place_on",
                cardId,
                amount: n,
                creditsPer,
              },
            },
          });
        }
      }
      state.pendingChoice = { sourceId, chooser: "runner", options };
      log(
        state,
        `${source.title} — place up to ${max} advancements on an unrezzed remote-root card.`,
      );
      return { ok: true };
    }
    case "queens_gambit_place_on": {
      const target = state.cards[action.cardId];
      if (!target) {
        log(state, `Queen's Gambit — unknown card ${action.cardId}.`);
        return { ok: true };
      }
      const amount = Math.max(0, action.amount ?? 0);
      target.advancementTokens = (target.advancementTokens ?? 0) + amount;
      const gain = amount * Math.max(0, action.creditsPer ?? 0);
      if (gain > 0) {
        state.runner.credits += gain;
      }
      if (!state.turn.cannotAccessCardIdsThisTurn.includes(action.cardId)) {
        state.turn.cannotAccessCardIdsThisTurn.push(action.cardId);
      }
      log(
        state,
        `Place ${amount} advancement(s) on ${target.title}; Runner gains ${gain}¢; cannot access ${target.title} this turn.`,
      );
      return { ok: true };
    }
    case "may_return_rezzed_to_hq_gain_rez_cost": {
      const rezzed: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (c?.rezzed && c.side === "corp") rezzed.push(id);
        }
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const cardId of rezzed) {
        const card = state.cards[cardId]!;
        const rez = card.rezCost ?? 0;
        options.push({
          id: `blue-sun:${cardId}`,
          label: `Add ${card.title} to HQ (gain ${rez}¢)`,
          effect: {
            op: "do",
            action: {
              kind: "return_rezzed_to_hq_gain_rez_cost",
              cardId,
            },
          },
        });
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(
        state,
        `${source.title} — may add 1 rezzed card to HQ and gain its rez cost.`,
      );
      return { ok: true };
    }
    case "return_rezzed_to_hq_gain_rez_cost": {
      const card = state.cards[action.cardId];
      if (!card || !card.rezzed) {
        log(state, `Return rezzed to HQ — invalid target.`);
        return { ok: true };
      }
      const rez = card.rezCost ?? 0;
      removeCardFromCurrentZone(state, action.cardId);
      state.corp.hand.push(action.cardId);
      card.zone = "corp:hq";
      card.faceup = false;
      card.rezzed = false;
      card.advancementTokens = undefined;
      if (rez > 0) {
        state.corp.credits += rez;
      }
      log(
        state,
        `Add ${card.title} to HQ; Corp gains ${rez}¢ (rez cost).`,
      );
      return { ok: true };
    }
    case "may_take_any_hosted_credits_skip_breach": {
      const available = source.hostedCredits ?? 0;
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline",
          label: "Breach normally",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "runner", amount: 0 },
          },
        },
      ];
      for (let n = 1; n <= available; n++) {
        options.push({
          id: `take:${n}`,
          label: `Take ${n}¢ from ${source.title} (skip breach)`,
          effect: {
            op: "do",
            action: { kind: "take_hosted_credits_skip_breach", amount: n },
          },
        });
      }
      state.pendingChoice = { sourceId, chooser: "runner", options };
      log(
        state,
        `${source.title} — may take hosted credits instead of breaching.`,
      );
      return { ok: true };
    }
    case "take_hosted_credits_skip_breach": {
      const available = source.hostedCredits ?? 0;
      const taken = Math.min(action.amount, available);
      source.hostedCredits = available - taken;
      state.runner.credits += taken;
      if (state.run) state.run.skipBreach = true;
      log(
        state,
        `Take ${taken}¢ from ${source.title}; skip breach (hosted ${source.hostedCredits}).`,
      );
      if ((source.hostedCredits ?? 0) <= 0) {
        // Reuse empty-hosted trash path via take_hosted_credits amount 0 leftover.
        return applyPrimitive(ctx, { kind: "take_hosted_credits", amount: 0 });
      }
      return { ok: true };
    }
    case "may_add_archives_card_to_rd_top": {
      const archives = [...state.corp.discard];
      if (archives.length === 0) {
        log(state, `${source.title} — Archives empty.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
        ...archives.map((id) => ({
          id: `rd-top:${id}`,
          label: `Add ${state.cards[id]!.title} to top of R&D`,
          effect: {
            op: "do" as const,
            action: {
              kind: "add_archives_card_to_rd_top" as const,
              cardId: id,
            },
          },
        })),
      ];
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(state, `${source.title} — may add 1 Archives card to top of R&D.`);
      return { ok: true };
    }
    case "add_archives_card_to_rd_top": {
      const id = action.cardId;
      if (!state.corp.discard.includes(id)) {
        log(state, `Add Archives to R&D — card not in Archives.`);
        return { ok: true };
      }
      state.corp.discard = state.corp.discard.filter((x) => x !== id);
      state.corp.deck.unshift(id);
      const card = state.cards[id]!;
      card.zone = "corp:rd";
      card.faceup = false;
      log(state, `Add ${card.title} from Archives to top of R&D.`);
      return { ok: true };
    }
    case "oversight_ai_rez_and_host": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          const c = state.cards[id];
          if (c && !c.rezzed) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `${source.title} — no unrezzed ice to rez.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `oa:${id}`,
          label: `Rez ${state.cards[id]!.title} (ignore costs); host Oversight AI`,
          effect: {
            op: "do" as const,
            action: {
              kind: "oversight_ai_host_on_ice" as const,
              iceId: id,
            },
          },
        })),
      };
      log(state, `${source.title} — choose ice to rez ignoring costs.`);
      return { ok: true };
    }
    case "oversight_ai_host_on_ice": {
      const ice = state.cards[action.iceId];
      if (!ice || ice.type !== "ice") {
        log(state, `Oversight AI — invalid ice.`);
        return { ok: true };
      }
      ice.rezzed = true;
      ice.faceup = true;
      // Move source onto ice as hosted condition.
      removeCardFromCurrentZone(state, sourceId);
      source.hostId = action.iceId;
      source.zone = `hosted:${action.iceId}`;
      source.faceup = true;
      source.rezzed = true;
      if (!ice.hostedCardIds) ice.hostedCardIds = [];
      if (!ice.hostedCardIds.includes(sourceId)) ice.hostedCardIds.push(sourceId);
      log(
        state,
        `Rez ${ice.title} ignoring costs; host ${source.title} as condition counter.`,
      );
      return { ok: true };
    }
    case "ber_rez_bioroid_and_host": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          const c = state.cards[id];
          if (
            c &&
            !c.rezzed &&
            c.type === "ice" &&
            (c.subtypes ?? []).includes("bioroid")
          ) {
            targets.push(id);
          }
        }
      }
      if (targets.length === 0) {
        log(state, `${source.title} — no unrezzed bioroid ice to rez.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `ber:${id}`,
          label: `Rez ${state.cards[id]!.title} (ignore costs); host Bioroid Efficiency Research`,
          effect: {
            op: "do" as const,
            action: {
              kind: "ber_host_on_ice" as const,
              iceId: id,
            },
          },
        })),
      };
      log(state, `${source.title} — choose bioroid ice to rez ignoring costs.`);
      return { ok: true };
    }
    case "ber_host_on_ice": {
      const ice = state.cards[action.iceId];
      if (
        !ice ||
        ice.type !== "ice" ||
        !(ice.subtypes ?? []).includes("bioroid")
      ) {
        log(state, `Bioroid Efficiency Research — invalid bioroid ice.`);
        return { ok: true };
      }
      ice.rezzed = true;
      ice.faceup = true;
      removeCardFromCurrentZone(state, sourceId);
      source.hostId = action.iceId;
      source.zone = `hosted:${action.iceId}`;
      source.faceup = true;
      source.rezzed = true;
      if (!ice.hostedCardIds) ice.hostedCardIds = [];
      if (!ice.hostedCardIds.includes(sourceId)) ice.hostedCardIds.push(sourceId);
      log(
        state,
        `Rez ${ice.title} ignoring costs; host ${source.title} as condition counter.`,
      );
      return { ok: true };
    }
    case "gain_credits_base_plus_per_passed_ice": {
      const side = resolveSide(ctx, action.side);
      const passed = state.run?.passedIceIds?.length ?? 0;
      const amount = action.base + action.per * passed;
      const p = side === "corp" ? state.corp : state.runner;
      p.credits += amount;
      log(
        state,
        `${side} gains ${amount}¢ (${action.base} + ${action.per}×${passed} passed ice) (CR ${CR.gainCredits.number}).`,
      );
      if (amount > 0 && side === "corp") {
        maybeFireZwickyCreditsGained(state, sourceId);
      }
      return { ok: true };
    }
    case "score_agenda_card": {
      const card = state.cards[action.cardId];
      if (!card) {
        return {
          ok: false,
          error: "Unknown agenda to score.",
          cites: [CR.scoringAgenda],
        };
      }
      if (state.turn.cannotScoreAgendas) {
        log(
          state,
          `Cannot score agendas this turn — skip (CR ${CR.scoringAgenda.number}).`,
        );
        return { ok: true };
      }
      if (!canScoreAgenda(state, card)) {
        log(
          state,
          `${card.title} cannot be scored — skip (CR ${CR.scoringAgenda.number}).`,
        );
        return { ok: true };
      }
      scoreAgenda(state, action.cardId);
      state.turn.agendaPointsScoredThisTurn += card.agendaPoints ?? 0;
      return { ok: true };
    }
    case "trash_any_rezzed_give_tags": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.ice, ...server.root]) {
          const c = state.cards[id];
          if (!c || c.side !== "corp" || !c.rezzed) continue;
          targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(
          state,
          `Trash any rezzed — no rezzed Corp cards (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        targets.map((id) => {
          const title = state.cards[id]!.title;
          return {
            id: `trash-tag:${id}`,
            label: `Trash ${title} (give 1 tag)`,
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: { kind: "trash_corp_card" as const, cardId: id },
                },
                {
                  op: "do" as const,
                  action: { kind: "give_tags" as const, amount: 1 },
                },
                {
                  op: "do" as const,
                  action: { kind: "trash_any_rezzed_give_tags" as const },
                },
              ],
            },
          };
        });
      options.push({
        id: "done",
        label: "Done",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options,
      };
      log(
        state,
        `${source.title} — trash any number of rezzed cards, 1 tag each (CR ${CR.trashing.number}, ${CR.tags.number}).`,
      );
      return { ok: true };
    }
    case "deal_net_damage_per_power_counter": {
      const n = source.powerCounters ?? 0;
      if (n <= 0) {
        log(state, `${source.title} — no power counters for net damage.`);
        return { ok: true };
      }
      return applyPrimitive(ctx, { kind: "net_damage", amount: n });
    }
    case "trash_any_number_from_hq": {
      const hq = [...state.corp.hand];
      if (hq.length === 0) {
        log(state, `${source.title} — trash any from HQ: HQ empty.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        hq.map((id) => {
          const title = state.cards[id]!.title;
          return {
            id: `trash-hq:${id}`,
            label: `Trash ${title}`,
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: { kind: "trash_hq_card" as const, cardId: id },
                },
                {
                  op: "do" as const,
                  action: { kind: "trash_any_number_from_hq" as const },
                },
              ],
            },
          };
        });
      options.push({
        id: "done",
        label: "Done",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(
        state,
        `${source.title} — trash any number of cards from HQ (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "turn_all_archives_facedown": {
      let n = 0;
      for (const id of state.corp.discard) {
        const c = state.cards[id];
        if (c && c.faceup) {
          c.faceup = false;
          n += 1;
        }
      }
      log(
        state,
        `${source.title} — turn all Archives cards facedown (${n} flipped).`,
      );
      return { ok: true };
    }
    case "may_install_from_archives_in_remote_root_with_advancements": {
      const amount = Math.max(0, action.amount);
      const installable = state.corp.discard.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "agenda" || t === "asset" || t === "upgrade";
      });
      const affordable = installable.filter(
        (id) =>
          creditsAvailableForInstall(state, "corp") >=
          (state.cards[id]!.installCost ?? 0),
      );
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-kakurenbo-install",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const cardId of affordable) {
        const card = state.cards[cardId]!;
        const cost = card.installCost ?? 0;
        for (const server of Object.values(state.servers)) {
          if (server.kind !== "remote") continue;
          options.push({
            id: `kak:${cardId}:${server.id}`,
            label: `Install ${card.title} on ${server.id} (${cost}¢) +${amount} adv`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_archives_remote_root_with_advancements" as const,
                cardId,
                serverId: server.id,
                amount,
              },
            },
          });
        }
        options.push({
          id: `kak:${cardId}:new`,
          label: `Install ${card.title} on new remote (${cost}¢) +${amount} adv`,
          effect: {
            op: "do" as const,
            action: {
              kind: "install_archives_remote_root_with_advancements" as const,
              cardId,
              serverId: "__new_remote__",
              amount,
            },
          },
        });
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(
        state,
        `${source.title} — may install from Archives in remote root +${amount} advancements (paying).`,
      );
      return { ok: true };
    }
    case "install_archives_remote_root_with_advancements": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      const destId = resolveInstallServerId(state, action.serverId);
      const dest = destId ? state.servers[destId] : null;
      if (!card || !dest || dest.kind !== "remote") {
        log(state, `Kakurenbo install — invalid card or remote.`);
        return { ok: true };
      }
      if (!state.corp.discard.includes(cardId)) {
        log(state, `Kakurenbo install — card not in Archives.`);
        return { ok: true };
      }
      const cost = card.installCost ?? 0;
      if (creditsAvailableForInstall(state, "corp") < cost) {
        log(state, `Kakurenbo install — cannot afford ${cost}¢.`);
        return { ok: true };
      }
      spendCreditsForInstall(state, "corp", cost);
      state.corp.discard = state.corp.discard.filter((id) => id !== cardId);
      dest.root.push(cardId);
      card.zone = `server:${dest.id}:root`;
      card.rezzed = false;
      card.faceup = false;
      card.advancementTokens = (card.advancementTokens ?? 0) + action.amount;
      noteInstalledThisTurn(state, cardId);
      log(
        state,
        `Install ${card.title} from Archives onto ${dest.id} for ${cost}¢ with ${action.amount} advancement(s).`,
      );
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "gachapon_resolve": {
      const look = 6;
      const discount = 2;
      const aside: string[] = [];
      for (let i = 0; i < look && state.runner.deck.length > 0; i++) {
        const id = state.runner.deck.shift()!;
        aside.push(id);
        state.cards[id]!.faceup = true;
        state.cards[id]!.zone = "runner:set-aside";
      }
      state.runner.setAside = aside;
      log(
        state,
        `${source.title} — set aside top ${aside.length} card(s) of stack faceup.`,
      );
      const installable = aside.filter((id) => {
        const c = state.cards[id]!;
        if (c.type === "program") {
          const need = effectiveMemoryCost(state, id);
          if (usedMemory(state) + need > memoryLimit(state)) return false;
          return state.runner.credits >= Math.max(0, (c.installCost ?? 0) - discount);
        }
        return (
          c.type === "resource" &&
          (c.subtypes ?? []).includes("virtual") &&
          state.runner.credits >= Math.max(0, (c.installCost ?? 0) - discount)
        );
      });
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "gacha-decline",
            label: "Decline install",
            effect: {
              op: "do" as const,
              action: { kind: "gachapon_after_install_choice" as const },
            },
          },
          ...installable.map((id) => {
            const c = state.cards[id]!;
            const cost = Math.max(0, (c.installCost ?? 0) - discount);
            return {
              id: `gacha-install:${id}`,
              label: `Install ${c.title} for ${cost}¢`,
              effect: {
                op: "seq" as const,
                effects: [
                  {
                    op: "do" as const,
                    action: {
                      kind: "gachapon_install_set_aside" as const,
                      cardId: id,
                      discount,
                    },
                  },
                  {
                    op: "do" as const,
                    action: { kind: "gachapon_after_install_choice" as const },
                  },
                ],
              },
            };
          }),
        ],
      };
      log(
        state,
        `${source.title} — may install 1 program or virtual (−${discount}¢).`,
      );
      return { ok: true };
    }
    case "gachapon_install_set_aside": {
      return installSetAsideCardPayingNoShuffle(
        state,
        action.cardId,
        Math.max(0, action.discount),
      );
    }
    case "gachapon_after_install_choice": {
      const aside = [...(state.runner.setAside ?? [])];
      const need = 3;
      if (aside.length === 0) {
        log(state, `Gachapon — no remaining set-aside cards.`);
        return { ok: true };
      }
      if (aside.length <= need) {
        // Shuffle all remaining into stack; nothing to RFG.
        return applyPrimitive(ctx, {
          kind: "gachapon_shuffle_selected_rfg_rest",
          cardIds: aside,
        });
      }
      // Offer iterative selection until `need` picked (or use combinatorial).
      // Deterministic UX: choose exactly `need` via continue leaf.
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: aside.map((id) => ({
          id: `gacha-shuf:${id}`,
          label: `Shuffle ${state.cards[id]!.title} into stack (1/${need})`,
          effect: {
            op: "do" as const,
            action: {
              kind: "gachapon_shuffle_pick_continue" as const,
              need,
              selected: [id],
            },
          },
        })),
      };
      log(
        state,
        `${source.title} — shuffle exactly ${need} of ${aside.length} remaining into stack; RFG rest.`,
      );
      return { ok: true };
    }
    case "gachapon_shuffle_pick_continue": {
      const need = action.need;
      const selected = [...action.selected];
      const aside = state.runner.setAside ?? [];
      if (selected.length >= need) {
        return applyPrimitive(ctx, {
          kind: "gachapon_shuffle_selected_rfg_rest",
          cardIds: selected.slice(0, need),
        });
      }
      const remaining = aside.filter((id) => !selected.includes(id));
      const left = need - selected.length;
      if (remaining.length <= left) {
        return applyPrimitive(ctx, {
          kind: "gachapon_shuffle_selected_rfg_rest",
          cardIds: [...selected, ...remaining],
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: remaining.map((id) => ({
          id: `gacha-shuf:${id}`,
          label: `Shuffle ${state.cards[id]!.title} into stack (${selected.length + 1}/${need})`,
          effect: {
            op: "do" as const,
            action: {
              kind: "gachapon_shuffle_pick_continue" as const,
              need,
              selected: [...selected, id],
            },
          },
        })),
      };
      return { ok: true };
    }
    case "gachapon_shuffle_selected_rfg_rest": {
      const pick = new Set(action.cardIds);
      const aside = [...(state.runner.setAside ?? [])];
      const toStack: string[] = [];
      for (const id of aside) {
        if (pick.has(id)) toStack.push(id);
      }
      // Move selected to stack first, then RFG the rest still set-aside.
      state.runner.setAside = aside.filter((id) => !pick.has(id));
      for (const id of toStack) {
        state.runner.deck.push(id);
        state.cards[id]!.zone = "runner:stack";
        state.cards[id]!.faceup = false;
      }
      const rfgCount = (state.runner.setAside ?? []).length;
      rfgRunnerSetAside(state);
      if (toStack.length > 0) shuffleRunnerStack(state);
      log(
        state,
        `Gachapon — shuffle ${toStack.length} into stack; remove ${rfgCount} from the game.`,
      );
      return { ok: true };
    }
    case "shuffle_up_to_n_heap_cards_with_trash_abilities_into_stack": {
      const per = Math.max(0, action.nPerPowerCounter ?? 2);
      const power = source.powerCounters ?? 0;
      const max = per * power;
      if (max <= 0) {
        log(
          state,
          `${source.title} — no power counters; nothing to shuffle from heap.`,
        );
        return { ok: true };
      }
      const withTrash = heapCardsWithTrashAbilities(state);
      if (withTrash.length === 0) {
        log(state, `${source.title} — no heap cards with [trash] abilities.`);
        return { ok: true };
      }
      return applyPrimitive(ctx, {
        kind: "shuffle_up_to_n_heap_cards_with_trash_abilities_into_stack_continue",
        maxRemaining: max,
        selected: [],
      });
    }
    case "shuffle_up_to_n_heap_cards_with_trash_abilities_into_stack_continue": {
      const selected = [...action.selected];
      const withTrash = heapCardsWithTrashAbilities(state).filter(
        (id) => !selected.includes(id),
      );
      if (action.maxRemaining <= 0 || withTrash.length === 0) {
        for (const id of selected) {
          if (!state.runner.discard.includes(id)) continue;
          state.runner.discard = state.runner.discard.filter((x) => x !== id);
          state.runner.deck.push(id);
          state.cards[id]!.zone = "runner:stack";
          state.cards[id]!.faceup = false;
        }
        if (selected.length > 0) shuffleRunnerStack(state);
        log(
          state,
          `${source.title} — shuffle ${selected.length} heap card(s) with [trash] into stack.`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "heap-trash-done",
            label: "Done",
            effect: {
              op: "do" as const,
              action: {
                kind: "shuffle_up_to_n_heap_cards_with_trash_abilities_into_stack_continue" as const,
                maxRemaining: 0,
                selected,
              },
            },
          },
          ...withTrash.map((id) => ({
            id: `heap-trash:${id}`,
            label: `Shuffle ${state.cards[id]!.title} into stack`,
            effect: {
              op: "do" as const,
              action: {
                kind: "shuffle_up_to_n_heap_cards_with_trash_abilities_into_stack_continue" as const,
                maxRemaining: action.maxRemaining - 1,
                selected: [...selected, id],
              },
            },
          })),
        ],
      };
      log(
        state,
        `${source.title} — choose up to ${action.maxRemaining} more heap card(s) with [trash] to shuffle.`,
      );
      return { ok: true };
    }
    case "rfg_self": {
      removeCardFromCurrentZone(state, sourceId);
      source.zone = "removed-from-game";
      source.faceup = true;
      source.rezzed = false;
      if (!state.removedFromGame) state.removedFromGame = [];
      if (!state.removedFromGame.includes(sourceId)) {
        state.removedFromGame.push(sourceId);
      }
      log(
        state,
        `${source.title} is removed from the game (CR ${CR.playOperation.number}).`,
      );
      return { ok: true };
    }
    case "rfg_heap_card": {
      const heap = [...state.runner.discard];
      if (heap.length === 0) {
        log(state, `RFG heap card — heap empty.`);
        return { ok: true };
      }
      if (heap.length === 1) {
        return applyPrimitive(ctx, {
          kind: "rfg_specific_heap_card",
          cardId: heap[0]!,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: heap.map((id) => ({
          id: `rfg-heap:${id}`,
          label: `Remove ${state.cards[id]!.title} from the game`,
          effect: {
            op: "do" as const,
            action: {
              kind: "rfg_specific_heap_card" as const,
              cardId: id,
            },
          },
        })),
      };
      log(state, `${source.title} — choose a heap card to remove from the game.`);
      return { ok: true };
    }
    case "rfg_specific_heap_card": {
      const cardId = action.cardId;
      if (!state.runner.discard.includes(cardId)) {
        log(state, `RFG heap card — ${cardId} not in heap.`);
        return { ok: true };
      }
      const card = state.cards[cardId]!;
      state.runner.discard = state.runner.discard.filter((id) => id !== cardId);
      card.zone = "removed-from-game";
      card.faceup = true;
      if (!state.removedFromGame) state.removedFromGame = [];
      if (!state.removedFromGame.includes(cardId)) {
        state.removedFromGame.push(cardId);
      }
      log(
        state,
        `Remove ${card.title} in the heap from the game (CR ${CR.playOperation.number}).`,
      );
      return { ok: true };
    }
    case "rfg_installed_card": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.runner.rig.includes(cardId)) {
        log(state, `RFG installed — ${cardId} not in Runner rig.`);
        return { ok: true };
      }
      removeCardFromCurrentZone(state, cardId);
      card.zone = "removed-from-game";
      card.faceup = true;
      card.rezzed = false;
      if (!state.removedFromGame) state.removedFromGame = [];
      if (!state.removedFromGame.includes(cardId)) {
        state.removedFromGame.push(cardId);
      }
      log(
        state,
        `Remove ${card.title} from the game (CR ${CR.playOperation.number}).`,
      );
      return { ok: true };
    }
    case "rfg_installed_with_any_subtype": {
      const wanted = new Set(action.subtypes);
      const candidates = state.runner.rig.filter((id) => {
        const subs = state.cards[id]?.subtypes ?? [];
        return subs.some((s) => wanted.has(s));
      });
      if (candidates.length === 0) {
        log(
          state,
          `${source.title} — RFG installed (${action.subtypes.join("/")}): none.`,
        );
        return { ok: true };
      }
      if (action.pick === "first" || candidates.length === 1) {
        return applyPrimitive(ctx, {
          kind: "rfg_installed_card",
          cardId: candidates[0]!,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: candidates.map((id) => ({
          id: `rfg-installed:${id}`,
          label: `Remove ${state.cards[id]!.title} from the game`,
          effect: {
            op: "do" as const,
            action: {
              kind: "rfg_installed_card" as const,
              cardId: id,
            },
          },
        })),
      };
      log(
        state,
        `${source.title} — choose an installed ${action.subtypes.join("/")} to remove from the game.`,
      );
      return { ok: true };
    }
    case "shuffle_up_to_n_distinct_heap_titles_into_stack": {
      const max = Math.max(0, action.max);
      if (max <= 0 || state.runner.discard.length === 0) {
        log(
          state,
          `${source.title} — shuffle up to ${max} distinct heap titles: nothing to do.`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "heap-titles-done",
            label: "Done",
            effect: {
              op: "do" as const,
              action: {
                kind: "shuffle_up_to_n_distinct_heap_titles_into_stack_continue" as const,
                maxRemaining: 0,
                selected: [],
                usedTitles: [],
              },
            },
          },
          ...state.runner.discard.map((id) => {
            const title = state.cards[id]!.title;
            return {
              id: `heap-title:${id}`,
              label: `Shuffle ${title} into stack`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "shuffle_up_to_n_distinct_heap_titles_into_stack_continue" as const,
                  maxRemaining: max - 1,
                  selected: [id],
                  usedTitles: [title],
                },
              },
            };
          }),
        ],
      };
      log(
        state,
        `${source.title} — shuffle up to ${max} cards with distinct titles from heap into stack.`,
      );
      return { ok: true };
    }
    case "shuffle_up_to_n_distinct_heap_titles_into_stack_continue": {
      const selected = [...action.selected];
      const usedTitles = new Set(action.usedTitles);
      const offerMore = action.maxRemaining > 0;
      const candidates = offerMore
        ? state.runner.discard.filter((id) => {
            if (selected.includes(id)) return false;
            const title = state.cards[id]?.title;
            if (!title || usedTitles.has(title)) return false;
            return true;
          })
        : [];
      if (!offerMore || candidates.length === 0) {
        for (const id of selected) {
          if (!state.runner.discard.includes(id)) continue;
          state.runner.discard = state.runner.discard.filter((x) => x !== id);
          state.runner.deck.push(id);
          state.cards[id]!.zone = "runner:stack";
          state.cards[id]!.faceup = false;
        }
        if (selected.length > 0) shuffleRunnerStack(state);
        log(
          state,
          `Shuffle ${selected.length} distinct-title heap card(s) into stack.`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "heap-titles-done",
            label: "Done",
            effect: {
              op: "do" as const,
              action: {
                kind: "shuffle_up_to_n_distinct_heap_titles_into_stack_continue" as const,
                maxRemaining: 0,
                selected,
                usedTitles: [...usedTitles],
              },
            },
          },
          ...candidates.map((id) => {
            const title = state.cards[id]!.title;
            return {
              id: `heap-title:${id}`,
              label: `Shuffle ${title} into stack`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "shuffle_up_to_n_distinct_heap_titles_into_stack_continue" as const,
                  maxRemaining: action.maxRemaining - 1,
                  selected: [...selected, id],
                  usedTitles: [...usedTitles, title],
                },
              },
            };
          }),
        ],
      };
      return { ok: true };
    }
    case "rfg_self_then_derez_bypassed_ice": {
      const bypassed = state.run?.bypassedIceIds ?? [];
      const targetId = bypassed[bypassed.length - 1];
      const rfg = applyPrimitive(ctx, { kind: "rfg_self" });
      if (!rfg.ok) return rfg;
      if (!targetId) {
        log(state, `${source.title} — RFG; no bypassed ice to derez.`);
        return { ok: true };
      }
      const ice = state.cards[targetId];
      if (!ice?.rezzed) {
        log(
          state,
          `${source.title} — RFG; ${ice?.title ?? targetId} already unrezzed.`,
        );
        return { ok: true };
      }
      ice.rezzed = false;
      ice.faceup = false;
      log(
        state,
        `${source.title} — RFG and derez ${ice.title} (CR ${CR.derez.number}).`,
      );
      return { ok: true };
    }
    case "allotted_clicks_next_turn": {
      if (action.side === "runner") {
        state.runnerAllottedClicksDeltaNextTurn =
          (state.runnerAllottedClicksDeltaNextTurn ?? 0) + action.delta;
        log(
          state,
          `Runner allotted clicks next turn ${action.delta >= 0 ? "+" : ""}${action.delta} → pending ${state.runnerAllottedClicksDeltaNextTurn} (CR ${CR.runnerAllottedClicks.number}).`,
        );
        return { ok: true };
      }
      if (action.side === "corp") {
        state.corpAllottedClicksDeltaNextTurn =
          (state.corpAllottedClicksDeltaNextTurn ?? 0) + action.delta;
        log(
          state,
          `Corp allotted clicks next turn ${action.delta >= 0 ? "+" : ""}${action.delta} → pending ${state.corpAllottedClicksDeltaNextTurn} (CR ${CR.corpAllottedClicks.number}).`,
        );
        return { ok: true };
      }
      return {
        ok: false,
        error: "allotted_clicks_next_turn requires corp or runner side.",
        cites: [CR.runnerAllottedClicks],
      };
    }
    case "choose_forfeit_runner_scored_agenda": {
      const agendas = state.runner.score.filter(
        (id) => !state.cards[id]?.cannotForfeit,
      );
      if (agendas.length === 0) {
        return {
          ok: false,
          error: "Must forfeit a scored agenda.",
          cites: [CR.scoringAgenda],
        };
      }
      if (agendas.length === 1) {
        return applyPrimitive(ctx, {
          kind: "forfeit_runner_scored_agenda",
          cardId: agendas[0]!,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: agendas.map((agId) => ({
          id: `forfeit:${agId}`,
          label: `Forfeit ${state.cards[agId]!.title}`,
          effect: {
            op: "do",
            action: {
              kind: "forfeit_runner_scored_agenda" as const,
              cardId: agId,
            },
          },
        })),
      };
      log(state, `${source.title} — forfeit a scored agenda.`);
      return { ok: true };
    }
    case "forfeit_runner_scored_agenda": {
      const cardId = action.cardId;
      if (!state.runner.score.includes(cardId)) {
        return {
          ok: false,
          error: "Agenda not in Runner score area.",
          cites: [CR.scoringAgenda],
        };
      }
      state.runner.score = state.runner.score.filter((id) => id !== cardId);
      const card = state.cards[cardId]!;
      state.runner.hand = state.runner.hand.filter((id) => id !== cardId);
      state.runner.rig = state.runner.rig.filter((id) => id !== cardId);
      card.zone = "removed-from-game";
      card.faceup = true;
      if (!state.removedFromGame) state.removedFromGame = [];
      if (!state.removedFromGame.includes(cardId)) {
        state.removedFromGame.push(cardId);
      }
      log(state, `Forfeit ${card.title} (RFG).`);
      return { ok: true };
    }
    case "false_echo_trash_then_corp_rez_or_hq": {
      const iceId =
        state.run?.lastPassedUnrezzedIceId ??
        state.turn.currentRunPassedUnrezzedIceIds?.at(-1);
      if (!iceId) {
        log(state, `False Echo — no passed ice.`);
        return { ok: true };
      }
      trashToHeap(state, sourceId);
      const ice = state.cards[iceId];
      if (!ice || ice.type !== "ice") return { ok: true };
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "rez",
            label: `Rez ${ice.title}`,
            effect: {
              op: "do",
              action: { kind: "rez_ice_by_id" as const, iceId },
            },
          },
          {
            id: "hq",
            label: `Add ${ice.title} to HQ`,
            effect: {
              op: "do",
              action: { kind: "move_unrezzed_ice_to_hq" as const, iceId },
            },
          },
        ],
      };
      log(state, `False Echo — Corp must rez ${ice.title} or add to HQ.`);
      return { ok: true };
    }
    case "rez_ice_by_id": {
      const ice = state.cards[action.iceId];
      if (ice?.type === "ice") {
        ice.rezzed = true;
        log(state, `Corp rezzes ${ice.title}.`);
      }
      return { ok: true };
    }
    case "move_unrezzed_ice_to_hq": {
      const iceId = action.iceId;
      const ice = state.cards[iceId];
      if (!ice || ice.type !== "ice") return { ok: true };
      const sid = serverIdForIce(state, iceId);
      if (sid) {
        state.servers[sid].ice = state.servers[sid].ice.filter((id) => id !== iceId);
      }
      ice.rezzed = false;
      ice.zone = "corp:hq";
      ice.faceup = false;
      state.corp.hand.push(iceId);
      log(state, `Add ${ice.title} to HQ.`);
      return { ok: true };
    }
    case "caissa_pawn_host_outermost_central": {
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (const [sid, server] of Object.entries(state.servers)) {
        if (server.kind !== "central" || server.ice.length === 0) continue;
        const iceId = server.ice[0]!;
        options.push({
          id: `host:${iceId}`,
          label: `Host on ${state.cards[iceId]!.title} (${sid})`,
          effect: {
            op: "do",
            action: {
              kind: "host_program_on_ice",
              programId: sourceId,
              iceId,
            },
          },
        });
      }
      if (options.length === 0) {
        log(state, `${source.title} — no outermost ice on a central server.`);
        return { ok: true };
      }
      if (options.length === 1) return evalEffect(ctx, options[0]!.effect);
      state.pendingChoice = { sourceId, chooser: "runner", options };
      return { ok: true };
    }
    case "caissa_rook_host": {
      const isCaissa = (id: string) => {
        const subs = (state.cards[id]?.subtypes ?? []).map((s) => s.toLowerCase());
        return subs.includes("caïssa") || subs.includes("caissa");
      };
      const candidates: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const iceId of server.ice) {
          const taken = state.runner.rig.some(
            (rid) => state.cards[rid]?.hostId === iceId && isCaissa(rid),
          );
          if (!taken) candidates.push(iceId);
        }
      }
      if (candidates.length === 0) {
        log(state, `${source.title} — no valid host ice.`);
        return { ok: true };
      }
      const currentHost = source.hostId;
      const currentServer = currentHost ? serverIdForIce(state, currentHost) : null;
      const currentPos =
        currentHost && currentServer
          ? state.servers[currentServer].ice.indexOf(currentHost)
          : -1;
      const filtered = candidates.filter((iceId) => {
        if (!currentHost) return true;
        const sid = serverIdForIce(state, iceId);
        if (!sid) return false;
        const pos = state.servers[sid].ice.indexOf(iceId);
        return sid === currentServer || pos === currentPos;
      });
      const pickFrom = filtered.length > 0 ? filtered : candidates;
      if (pickFrom.length === 1) {
        return applyPrimitive(ctx, {
          kind: "host_program_on_ice",
          programId: sourceId,
          iceId: pickFrom[0]!,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: pickFrom.map((iceId) => ({
          id: `host:${iceId}`,
          label: `Host on ${state.cards[iceId]!.title}`,
          effect: {
            op: "do",
            action: {
              kind: "host_program_on_ice",
              programId: sourceId,
              iceId,
            },
          },
        })),
      };
      return { ok: true };
    }
    case "caissa_bishop_host": {
      const isCaissa = (id: string) => {
        const subs = (state.cards[id]?.subtypes ?? []).map((s) => s.toLowerCase());
        return subs.includes("caïssa") || subs.includes("caissa");
      };
      const hostId = source.hostId;
      let requireCentral: boolean | null = null;
      if (hostId) {
        const sid = serverIdForIce(state, hostId);
        if (sid) {
          requireCentral = state.servers[sid].kind === "central";
        }
      }
      const candidates: string[] = [];
      for (const server of Object.values(state.servers)) {
        if (requireCentral !== null) {
          const isCentral = server.kind === "central";
          if (requireCentral && isCentral) continue;
          if (!requireCentral && !isCentral) continue;
        }
        for (const iceId of server.ice) {
          const taken = state.runner.rig.some(
            (rid) => state.cards[rid]?.hostId === iceId && isCaissa(rid),
          );
          if (!taken) candidates.push(iceId);
        }
      }
      if (candidates.length === 0) {
        log(state, `${source.title} — no valid host ice.`);
        return { ok: true };
      }
      if (candidates.length === 1) {
        return applyPrimitive(ctx, {
          kind: "host_program_on_ice",
          programId: sourceId,
          iceId: candidates[0]!,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: candidates.map((iceId) => ({
          id: `host:${iceId}`,
          label: `Host on ${state.cards[iceId]!.title}`,
          effect: {
            op: "do",
            action: {
              kind: "host_program_on_ice",
              programId: sourceId,
              iceId,
            },
          },
        })),
      };
      return { ok: true };
    }
    case "eureka_reveal_install_or_trash": {
      const discount = Math.max(0, action.discount ?? 0);
      const top = state.runner.deck[0];
      if (!top) {
        log(state, `Eureka! — stack empty.`);
        return { ok: true };
      }
      const card = state.cards[top]!;
      card.faceup = true;
      log(state, `Eureka! — reveal ${card.title}.`);
      const canInstall =
        card.type === "program" ||
        card.type === "hardware" ||
        card.type === "resource";
      if (!canInstall) {
        trashToHeap(state, top);
        log(state, `Eureka! — trash ${card.title} (cannot install).`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "eureka-install",
            label: `Install ${card.title} (−${discount}¢)`,
            effect: {
              op: "do",
              action: {
                kind: "install_stack_card",
                cardId: top,
                discount,
              },
            },
          },
          {
            id: "eureka-trash",
            label: `Trash ${card.title}`,
            effect: {
              op: "do",
              action: { kind: "trash_top_of_stack" },
            },
          },
        ],
      };
      return { ok: true };
    }
    case "record_reconstructor_archives_instead_of_breach": {
      if (!state.run || state.run.attackedServerId !== "archives") {
        return { ok: true };
      }
      state.run.skipBreach = true;
      return applyPrimitive(ctx, { kind: "may_add_archives_card_to_rd_top" });
    }
    case "profiteering_on_score": {
      const options = [0, 1, 2, 3].map((n) => {
        const effects: Effect[] = [];
        if (n > 0) {
          effects.push({
            op: "do",
            action: { kind: "give_bad_publicity", amount: n },
          });
        }
        effects.push({
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: n * 5 },
        });
        return {
          id: `profiteering-${n}`,
          label:
            n === 0
              ? "Take no bad publicity"
              : `Take ${n} bad publicity — gain ${n * 5}¢`,
          effect: { op: "seq" as const, effects },
        };
      });
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(state, `${source.title} — choose bad publicity for credits.`);
      return { ok: true };
    }
    case "copycat_jump_to_rezzed_copy": {
      if (!state.run?.lastPassedRezzedIceId) {
        log(state, `Copycat — no passed ice.`);
        return { ok: true };
      }
      const passed = state.cards[state.run.lastPassedRezzedIceId];
      if (!passed) return { ok: true };
      const defId = passed.defId;
      const matches: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const iceId of server.ice) {
          if (iceId === state.run.lastPassedRezzedIceId) continue;
          const ice = state.cards[iceId];
          if (ice?.type === "ice" && ice.rezzed && ice.defId === defId) {
            matches.push(iceId);
          }
        }
      }
      state.runner.rig = state.runner.rig.filter((id) => id !== sourceId);
      trashToHeap(state, sourceId);
      log(state, `Trash ${source.title}.`);
      if (matches.length === 0) {
        log(state, `Copycat — no other rezzed copy to jump to.`);
        return { ok: true };
      }
      if (matches.length === 1) {
        return applyPrimitive(ctx, {
          kind: "copycat_continue_from_ice",
          iceId: matches[0]!,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: matches.map((iceId) => ({
          id: `copycat:${iceId}`,
          label: `Continue from ${state.cards[iceId]!.title}`,
          effect: {
            op: "do",
            action: { kind: "copycat_continue_from_ice", iceId },
          },
        })),
      };
      return { ok: true };
    }
    case "copycat_continue_from_ice": {
      if (!state.run) return { ok: true };
      const iceId = action.iceId;
      const ice = state.cards[iceId];
      if (!ice || ice.type !== "ice" || !ice.rezzed) {
        log(state, `Copycat — invalid ice.`);
        return { ok: true };
      }
      let hostServer: string | null = null;
      for (const [sid, server] of Object.entries(state.servers)) {
        if (server.ice.includes(iceId)) {
          hostServer = sid;
          break;
        }
      }
      if (!hostServer) return { ok: true };
      const serverId = hostServer as import("../state/types.js").ServerId;
      state.run.attackedServerId = serverId;
      const pos = state.servers[serverId].ice.indexOf(iceId);
      state.run.position = pos >= 0 ? pos : 0;
      state.run.passedIceIds = [...(state.run.passedIceIds ?? []), iceId];
      log(
        state,
        `Copycat — continue the run as if passing ${ice.title} on ${hostServer}.`,
      );
      return { ok: true };
    }
    case "caissa_advance_host_inward_or_install": {
      const hostId = source.hostId;
      if (!hostId) return { ok: true };
      const sid = serverIdForIce(state, hostId);
      if (!sid) return { ok: true };
      const iceList = state.servers[sid].ice;
      const pos = iceList.indexOf(hostId);
      const nextId = pos >= 0 && pos + 1 < iceList.length ? iceList[pos + 1]! : null;
      if (nextId) {
        return applyPrimitive(ctx, {
          kind: "host_program_on_ice",
          programId: sourceId,
          iceId: nextId,
        });
      }
      trashToHeap(state, sourceId);
      const isCaissa = (id: string) => {
        const c = state.cards[id];
        return (
          c?.type === "program" &&
          ((c.subtypes ?? []).some((s) => s.toLowerCase().includes("caissa")) ||
            (c.subtypes ?? []).some((s) => s.toLowerCase().includes("caïssa")))
        );
      };
      const caissaIds = [...state.runner.hand, ...state.runner.discard].filter(
        (id) => isCaissa(id) && id !== sourceId,
      );
      if (caissaIds.length === 0) return { ok: true };
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: caissaIds.map((cardId) => ({
          id: `install:${cardId}`,
          label: `Install ${state.cards[cardId]!.title} ignoring all costs`,
          effect: {
            op: "do",
            action: {
              kind: "install_caissa_from_zone_ignore_costs",
              cardId,
            },
          },
        })),
      };
      return { ok: true };
    }
    case "install_caissa_from_zone_ignore_costs": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || card.type !== "program") return { ok: true };
      if (state.runner.hand.includes(cardId)) {
        state.runner.hand = state.runner.hand.filter((id) => id !== cardId);
      } else if (state.runner.discard.includes(cardId)) {
        state.runner.discard = state.runner.discard.filter((id) => id !== cardId);
      } else return { ok: true };
      card.zone = "runner:rig";
      state.runner.rig.push(cardId);
      log(state, `Install ${card.title} ignoring all costs.`);
      return { ok: true };
    }
    case "project_ares_on_score": {
      const adv = source.advancementTokens ?? 0;
      const n = Math.max(0, adv - (action.past ?? 4));
      state.turn.projectAresTrashRemaining = n;
      state.turn.projectAresTrashedCount = 0;
      if (n <= 0) {
        log(state, `Project Ares — no overadvance trash.`);
        return { ok: true };
      }
      return applyPrimitive(ctx, { kind: "project_ares_trash_next" });
    }
    case "project_ares_trash_next": {
      const remaining = state.turn.projectAresTrashRemaining ?? 0;
      if (remaining <= 0) {
        if ((state.turn.projectAresTrashedCount ?? 0) > 0) {
          return applyPrimitive(ctx, { kind: "give_bad_publicity", amount: 1 });
        }
        return { ok: true };
      }
      const cands = [...state.runner.rig];
      if (cands.length === 0) {
        state.turn.projectAresTrashRemaining = 0;
        if ((state.turn.projectAresTrashedCount ?? 0) > 0) {
          return applyPrimitive(ctx, { kind: "give_bad_publicity", amount: 1 });
        }
        return { ok: true };
      }
      if (cands.length === 1) {
        const r1 = applyPrimitive(ctx, {
          kind: "trash_installed_runner_card",
          cardId: cands[0]!,
        });
        if (!r1.ok) return r1;
        return applyPrimitive(ctx, { kind: "project_ares_trash_next" });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: cands.map((cardId) => ({
          id: `trash:${cardId}`,
          label: `Trash ${state.cards[cardId]!.title}`,
          effect: {
            op: "seq" as const,
            effects: [
              {
                op: "do" as const,
                action: {
                  kind: "trash_installed_runner_card",
                  cardId,
                },
              },
              {
                op: "do" as const,
                action: { kind: "project_ares_trash_next" },
              },
            ],
          },
        })),
      };
      return { ok: true };
    }
    case "invasion_of_privacy": {
      return applyPrimitive(ctx, {
        kind: "trace",
        strength: action.traceStrength ?? 2,
        onSuccess: {
          op: "do",
          action: { kind: "invasion_of_privacy_success" },
        },
        onFailure: {
          op: "do",
          action: { kind: "give_bad_publicity", amount: 1 },
        },
      });
    }
    case "invasion_of_privacy_success": {
      const max = Math.max(0, state.turn.lastTraceExcess ?? 0);
      for (const id of state.runner.hand) state.cards[id]!.faceup = true;
      state.turn.invasionPrivacyTrashRemaining = max;
      if (max <= 0) return { ok: true };
      return applyPrimitive(ctx, { kind: "invasion_of_privacy_trash_next" });
    }
    case "invasion_of_privacy_trash_next": {
      const remaining = state.turn.invasionPrivacyTrashRemaining ?? 0;
      if (remaining <= 0) return { ok: true };
      const targets = state.runner.hand.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "resource" || t === "event";
      });
      if (targets.length === 0) {
        state.turn.invasionPrivacyTrashRemaining = 0;
        return { ok: true };
      }
      const invasionOpts: Array<{ id: string; label: string; effect: Effect }> =
        targets.map((cardId) => ({
          id: `trash:${cardId}`,
          label: `Trash ${state.cards[cardId]!.title}`,
          effect: {
            op: "seq",
            effects: [
              {
                op: "do",
                action: {
                  kind: "trash_from_grip" as const,
                  cardId,
                },
              },
              {
                op: "do",
                action: { kind: "invasion_of_privacy_trash_next" as const },
              },
            ],
          },
        }));
      invasionOpts.push({
        id: "done",
        label: "Done",
        effect: {
          op: "do",
          action: { kind: "invasion_of_privacy_finish" as const },
        },
      });
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: invasionOpts,
      };
      return { ok: true };
    }
    case "invasion_of_privacy_finish": {
      state.turn.invasionPrivacyTrashRemaining = 0;
      return { ok: true };
    }
    case "trash_from_grip": {
      const cardId = action.cardId;
      if (!state.runner.hand.includes(cardId)) return { ok: true };
      const rem = state.turn.invasionPrivacyTrashRemaining ?? 0;
      if (rem <= 0) return { ok: true };
      state.runner.hand = state.runner.hand.filter((id) => id !== cardId);
      trashToHeap(state, cardId);
      state.turn.invasionPrivacyTrashRemaining = rem - 1;
      return { ok: true };
    }
    case "trash_installed_runner_card": {
      const cardId = action.cardId;
      if (!state.runner.rig.includes(cardId)) return { ok: true };
      trashToHeap(state, cardId);
      state.turn.projectAresTrashedCount =
        (state.turn.projectAresTrashedCount ?? 0) + 1;
      state.turn.projectAresTrashRemaining = Math.max(
        0,
        (state.turn.projectAresTrashRemaining ?? 1) - 1,
      );
      log(state, `Trash installed ${state.cards[cardId]!.title}.`);
      return { ok: true };
    }
    case "purge_virus_counters": {
      purgeVirusCounters(state, sourceId);
      return { ok: true };
    }
    case "search_rd_ice_to_hq": {
      const id = state.corp.deck.find((cid) => state.cards[cid].type === "ice");
      if (!id) {
        log(state, `Search R&D for ice — none found.`);
        return { ok: true };
      }
      state.corp.deck = state.corp.deck.filter((x) => x !== id);
      state.corp.hand.push(id);
      state.cards[id].zone = "corp:hq";
      state.cards[id].faceup = true; // revealed
      state.corp.deck.reverse();
      log(
        state,
        `Search R&D — reveal ${state.cards[id].title} and add to HQ.`,
      );
      return { ok: true };
    }
    case "search_rd_up_to_one_each_subtype_to_hq": {
      const subtypes = action.subtypes ?? [];
      const found: string[] = [];
      for (const sub of subtypes) {
        const id = state.corp.deck.find((cid) => {
          if (found.includes(cid)) return false;
          const c = state.cards[cid];
          return (
            c.type === "ice" && (c.subtypes ?? []).includes(sub.toLowerCase())
          );
        });
        if (id) found.push(id);
      }
      if (found.length === 0) {
        log(state, `Search R&D for ${subtypes.join("/")} — none found.`);
        shuffleCorpRdAfterSearch(state);
        return { ok: true };
      }
      for (const id of found) {
        state.corp.deck = state.corp.deck.filter((x) => x !== id);
        state.corp.hand.push(id);
        state.cards[id].zone = "corp:hq";
        state.cards[id].faceup = true;
        log(
          state,
          `Search R&D — reveal ${state.cards[id].title} and add to HQ.`,
        );
      }
      shuffleCorpRdAfterSearch(state);
      return { ok: true };
    }
    case "search_rd_operation_to_hq": {
      const id = state.corp.deck.find(
        (cid) => state.cards[cid].type === "operation",
      );
      if (!id) {
        log(state, `Search R&D for operation — none found.`);
        return { ok: true };
      }
      state.corp.deck = state.corp.deck.filter((x) => x !== id);
      state.corp.hand.push(id);
      state.cards[id].zone = "corp:hq";
      state.cards[id].faceup = true;
      shuffleCorpRdAfterSearch(state);
      log(
        state,
        `Search R&D — reveal ${state.cards[id].title} and add to HQ.`,
      );
      return { ok: true };
    }
    case "search_rd_operation_to_top_rd": {
      const ops = state.corp.deck.filter(
        (cid) => state.cards[cid]?.type === "operation",
      );
      if (ops.length === 0) {
        log(state, `Search R&D for operation — none found.`);
        return { ok: true };
      }
      const pick = ops[0]!;
      state.corp.deck = state.corp.deck.filter((x) => x !== pick);
      state.cards[pick].faceup = true;
      log(state, `Search R&D — reveal ${state.cards[pick].title}.`);
      shuffleCorpRdAfterSearch(state);
      state.corp.deck.unshift(pick);
      state.cards[pick].zone = "corp:rd";
      state.cards[pick].faceup = true;
      log(state, `Put ${state.cards[pick].title} on top of R&D.`);
      return { ok: true };
    }
    case "search_rd_reveal_may_install_ignore_costs_else_hq": {
      const eligible = [...state.corp.deck];
      if (eligible.length === 0) {
        log(state, `Search R&D — deck empty.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-search-rd-reveal",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
        ...eligible.map((id) => ({
          id: `search-rd-reveal:${id}`,
          label: `Search for ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "search_rd_reveal_pick_install_or_hq" as const,
              cardId: id,
            },
          },
        })),
      ];
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(state, `May search R&D for 1 card, reveal, install or add to HQ.`);
      return { ok: true };
    }
    case "search_rd_reveal_pick_install_or_hq": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card) {
        log(state, `Search R&D reveal — invalid card.`);
        return { ok: true };
      }
      const deckIdx = state.corp.deck.indexOf(cardId);
      if (deckIdx < 0) {
        log(state, `Search R&D reveal — not in R&D.`);
        return { ok: true };
      }
      state.corp.deck.splice(deckIdx, 1);
      card.faceup = true;
      log(state, `Search R&D — reveal ${card.title}.`);
      shuffleCorpRdAfterSearch(state);
      state.corp.hand.push(cardId);
      card.zone = "corp:hq";
      const installOpts: Array<{ id: string; label: string; effect: Effect }> =
        [
          {
            id: "leave-in-hq",
            label: "Add to HQ",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
        ];
      if (card.type === "ice") {
        for (const server of Object.values(state.servers)) {
          installOpts.push({
            id: `install-hq:${cardId}:${server.id}`,
            label: `Install ${card.title} protecting ${server.id}`,
            effect: {
              op: "do",
              action: {
                kind: "install_hq_card_ignore_costs",
                cardId,
                serverId: server.id,
              },
            },
          });
        }
      } else if (corpCardInstallable(card.type)) {
        for (const server of Object.values(state.servers)) {
          if (server.kind !== "remote") continue;
          installOpts.push({
            id: `install-hq:${cardId}:${server.id}`,
            label: `Install ${card.title} on ${server.id}`,
            effect: {
              op: "do",
              action: {
                kind: "install_hq_card_ignore_costs",
                cardId,
                serverId: server.id,
              },
            },
          });
        }
        installOpts.push({
          id: `install-hq:${cardId}:new`,
          label: `Install ${card.title} on new remote`,
          effect: {
            op: "do",
            action: {
              kind: "install_hq_card_ignore_costs",
              cardId,
              serverId: "__new_remote__",
            },
          },
        });
      }
      state.pendingChoice = { sourceId, chooser: "corp", options: installOpts };
      log(state, `May install ${card.title} ignoring costs or leave in HQ.`);
      return { ok: true };
    }
    case "search_rd_operation_or_agenda_to_hq": {
      const id = state.corp.deck.find((cid) => {
        const t = state.cards[cid].type;
        return t === "operation" || t === "agenda";
      });
      if (!id) {
        log(state, `Search R&D for operation or agenda — none found.`);
        return { ok: true };
      }
      state.corp.deck = state.corp.deck.filter((x) => x !== id);
      state.corp.hand.push(id);
      state.cards[id].zone = "corp:hq";
      state.cards[id].faceup = true;
      shuffleCorpRdAfterSearch(state);
      log(
        state,
        `Search R&D — reveal ${state.cards[id].title} and add to HQ.`,
      );
      return { ok: true };
    }
    case "search_rd_agenda_to_hq": {
      const id = state.corp.deck.find(
        (cid) => state.cards[cid].type === "agenda",
      );
      if (!id) {
        log(state, `Search R&D for agenda — none found.`);
        return { ok: true };
      }
      state.corp.deck = state.corp.deck.filter((x) => x !== id);
      state.corp.hand.push(id);
      state.cards[id].zone = "corp:hq";
      state.cards[id].faceup = true;
      shuffleCorpRdAfterSearch(state);
      log(
        state,
        `Search R&D — reveal agenda ${state.cards[id].title} and add to HQ.`,
      );
      return { ok: true };
    }
    case "look_top_n_rd_may_install_one": {
      const n = action.n ?? 1;
      if (state.turn.rdLookedCards.length > 0) {
        return {
          ok: false,
          error: "R&D look already in progress.",
          cites: [],
        };
      }
      const taken = state.corp.deck.splice(
        0,
        Math.min(n, state.corp.deck.length),
      );
      state.turn.rdLookedCards = taken;
      for (const id of taken) {
        state.cards[id].faceup = true;
        log(state, `Look R&D — ${state.cards[id].title}.`);
      }
      const installable = taken.filter((id) => {
        const t = state.cards[id].type;
        if (action.excludeAgenda && t === "agenda") return false;
        return (
          t === "agenda" || t === "asset" || t === "ice" || t === "upgrade"
        );
      });
      const affordable = installable.filter(
        (id) =>
          creditsAvailableForInstall(state, "corp") >=
          (state.cards[id].installCost ?? 0),
      );
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline",
            label: "Decline to install",
            effect: {
              op: "do",
              action: { kind: "return_rd_looked_to_deck_top" },
            },
          },
          ...affordable.map((id) => ({
            id: `rd-look-install:${id}`,
            label: `Install ${state.cards[id].title} for ${state.cards[id].installCost ?? 0}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_rd_looked_card_paying_costs" as const,
                cardId: id,
              },
            },
          })),
        ],
      };
      log(state, `May install one looked R&D card paying install costs.`);
      return { ok: true };
    }
    case "look_top_n_rd_may_install_and_rez_ignore_costs": {
      const n = action.n ?? 1;
      if (state.turn.rdLookedCards.length > 0) {
        return {
          ok: false,
          error: "R&D look already in progress.",
          cites: [],
        };
      }
      const taken = state.corp.deck.splice(
        0,
        Math.min(n, state.corp.deck.length),
      );
      state.turn.rdLookedCards = taken;
      for (const id of taken) {
        state.cards[id].faceup = true;
        log(state, `Look R&D — ${state.cards[id].title}.`);
      }
      const installable = taken.filter((id) => {
        const t = state.cards[id].type;
        return (
          t === "agenda" || t === "asset" || t === "ice" || t === "upgrade"
        );
      });
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline",
            label: "Decline to install",
            effect: {
              op: "do",
              action: { kind: "return_rd_looked_to_deck_top" },
            },
          },
          ...installable.map((id) => {
            const t = state.cards[id]!.type;
            const rezBit = t === "agenda" ? "" : " and rez";
            return {
              id: `rd-look-install-rez:${id}`,
              label: `Install${rezBit} ${state.cards[id]!.title} ignoring costs`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "install_rez_rd_looked_card_ignore_costs" as const,
                  cardId: id,
                },
              },
            };
          }),
        ],
      };
      log(
        state,
        `May install and rez one looked R&D card ignoring all costs.`,
      );
      return { ok: true };
    }
    case "install_rez_rd_looked_card_ignore_costs": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.turn.rdLookedCards.includes(cardId)) {
        log(state, `Install looked R&D card — not in look zone.`);
        returnRdLookedToDeckTop(state);
        return { ok: true };
      }
      state.turn.rdLookedCards = state.turn.rdLookedCards.filter(
        (x) => x !== cardId,
      );
      returnRdLookedToDeckTop(state);
      const remoteNum = state.nextRemoteNumber++;
      const sid =
        `remote-${remoteNum}` as import("../state/types.js").ServerId;
      state.servers[sid] = { id: sid, kind: "remote", ice: [], root: [] };
      if (card.type === "ice") {
        state.servers[sid].ice.push(cardId);
        card.zone = `server:${sid}:ice`;
      } else {
        state.servers[sid].root.push(cardId);
        card.zone = `server:${sid}:root`;
      }
      const doRez = card.type !== "agenda";
      card.rezzed = doRez;
      card.faceup = true;
      if (card.type === "agenda" || card.type === "asset") {
        card.advancementTokens = card.advancementTokens ?? 0;
      }
      if (doRez && (card.hostedCreditsOnInstall ?? 0) > 0) {
        card.hostedCredits = card.hostedCreditsOnInstall;
      }
      if (doRez && (card.recurringCreditsMax ?? 0) > 0) {
        card.recurringCredits = card.recurringCreditsMax;
      }
      noteInstalledThisTurn(state, cardId);
      log(
        state,
        `Install${doRez ? " and rez" : ""} ${card.title} from looked R&D on ${sid} ignoring costs.`,
      );
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
        if (!r.ok) return r;
      }
      if (doRez && card.onRez) {
        const r = evalEffect({ state, sourceId: cardId }, card.onRez);
        if (!r.ok) return r;
      }
      if (doRez && card.type === "ice") {
        fireHostRezStateTriggers(state, cardId, "rez");
      }
      return { ok: true };
    }
    case "yagi_swap_hq_with_attacked_root_or_ice": {
      if (!state.run) {
        log(state, `Yagi swap — not during a run.`);
        return { ok: true };
      }
      const sid = state.run.attackedServerId;
      const server = state.servers[sid];
      if (!server) {
        log(state, `Yagi swap — attacked server missing.`);
        return { ok: true };
      }
      const hq = [...state.corp.hand];
      const targets = [...server.root, ...server.ice];
      if (hq.length === 0 || targets.length === 0) {
        log(state, `Yagi swap — need HQ card and attacked root/ice.`);
        return { ok: true };
      }
      const options: import("./ir.js").ChoiceOption[] = [];
      for (const hqId of hq) {
        for (const srvId of targets) {
          options.push({
            id: `yagi:${hqId}:${srvId}`,
            label: `Swap ${state.cards[hqId]!.title} (HQ) with ${state.cards[srvId]!.title}`,
            effect: {
              op: "do",
              action: {
                kind: "yagi_swap_hq_with_attacked_pick",
                hqCardId: hqId,
                serverCardId: srvId,
              },
            },
          });
        }
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(state, `${source.title} — swap HQ with attacked root/ice.`);
      return { ok: true };
    }
    case "yagi_swap_hq_with_attacked_pick": {
      if (!state.run) {
        log(state, `Yagi swap pick — not during a run.`);
        return { ok: true };
      }
      const hqId = action.hqCardId;
      const srvId = action.serverCardId;
      const hqCard = state.cards[hqId];
      const srvCard = state.cards[srvId];
      const sid = state.run.attackedServerId;
      const server = state.servers[sid];
      if (
        !hqCard ||
        !srvCard ||
        !server ||
        !state.corp.hand.includes(hqId) ||
        (!server.root.includes(srvId) && !server.ice.includes(srvId))
      ) {
        log(state, `Yagi swap pick — invalid targets.`);
        return { ok: true };
      }
      const wasIce = server.ice.includes(srvId);
      const iceIdx = wasIce ? server.ice.indexOf(srvId) : -1;
      const rootIdx = !wasIce ? server.root.indexOf(srvId) : -1;
      state.corp.hand = state.corp.hand.filter((id) => id !== hqId);
      if (wasIce) {
        server.ice[iceIdx] = hqId;
        hqCard.zone = `server:${sid}:ice`;
      } else {
        server.root[rootIdx] = hqId;
        hqCard.zone = `server:${sid}:root`;
      }
      hqCard.rezzed = false;
      hqCard.faceup = false;
      state.corp.hand.push(srvId);
      srvCard.zone = "corp:hq";
      srvCard.rezzed = false;
      srvCard.faceup = false;
      log(
        state,
        `Swap ${hqCard.title} from HQ with ${srvCard.title} on ${sid}.`,
      );
      return { ok: true };
    }
    case "daruma_swap_this_root_with_other_root_or_hq": {
      if (!state.run) {
        log(state, `Daruma swap — not during a run.`);
        return { ok: true };
      }
      const sid = state.run.attackedServerId;
      const server = state.servers[sid];
      if (!server) {
        log(state, `Daruma swap — approached server missing.`);
        return { ok: true };
      }
      const thisRoot = [...server.root];
      if (thisRoot.length === 0) {
        log(state, `Daruma swap — no cards in this server root.`);
        return { ok: true };
      }
      const otherTargets: string[] = [];
      for (const [oid, srv] of Object.entries(state.servers)) {
        if (oid === sid) continue;
        for (const id of srv.root) otherTargets.push(id);
      }
      for (const id of state.corp.hand) {
        const c = state.cards[id];
        if (!c) continue;
        if (c.type === "agenda" || c.type === "asset" || c.type === "upgrade") {
          otherTargets.push(id);
        }
      }
      if (otherTargets.length === 0) {
        log(state, `Daruma swap — no other root or HQ targets.`);
        return { ok: true };
      }
      const options: import("./ir.js").ChoiceOption[] = [];
      for (const rootId of thisRoot) {
        for (const otherId of otherTargets) {
          options.push({
            id: `daruma:${rootId}:${otherId}`,
            label: `Swap ${state.cards[rootId]!.title} with ${state.cards[otherId]!.title}`,
            effect: {
              op: "do",
              action: {
                kind: "daruma_swap_pick",
                thisRootCardId: rootId,
                otherCardId: otherId,
                ...(action.onSuccess ? { onSuccess: action.onSuccess } : {}),
              },
            },
          });
        }
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(state, `${source.title} — swap this root with other root or HQ.`);
      return { ok: true };
    }
    case "daruma_swap_pick": {
      if (!state.run) {
        log(state, `Daruma swap pick — not during a run.`);
        return { ok: true };
      }
      const thisId = action.thisRootCardId;
      const otherId = action.otherCardId;
      const thisCard = state.cards[thisId];
      const otherCard = state.cards[otherId];
      const sid = state.run.attackedServerId;
      const thisServer = state.servers[sid];
      if (
        !thisCard ||
        !otherCard ||
        !thisServer ||
        !thisServer.root.includes(thisId)
      ) {
        log(state, `Daruma swap pick — invalid this-root card.`);
        return { ok: true };
      }
      const thisRootIdx = thisServer.root.indexOf(thisId);
      const otherInHq = state.corp.hand.includes(otherId);
      let otherServerId: string | null = null;
      let otherRootIdx = -1;
      if (!otherInHq) {
        for (const [oid, srv] of Object.entries(state.servers)) {
          const idx = srv.root.indexOf(otherId);
          if (idx >= 0) {
            otherServerId = oid;
            otherRootIdx = idx;
            break;
          }
        }
        if (!otherServerId) {
          log(state, `Daruma swap pick — other card not in root or HQ.`);
          return { ok: true };
        }
      } else if (
        otherCard.type !== "agenda" &&
        otherCard.type !== "asset" &&
        otherCard.type !== "upgrade"
      ) {
        log(state, `Daruma swap pick — HQ target must be agenda/asset/upgrade.`);
        return { ok: true };
      }

      thisServer.root.splice(thisRootIdx, 1);
      if (otherInHq) {
        state.corp.hand = state.corp.hand.filter((id) => id !== otherId);
        thisServer.root.splice(thisRootIdx, 0, otherId);
        otherCard.zone = `server:${sid}:root`;
        otherCard.rezzed = false;
        otherCard.faceup = false;
        state.corp.hand.push(thisId);
        thisCard.zone = "corp:hq";
        thisCard.rezzed = false;
        thisCard.faceup = false;
        log(
          state,
          `Daruma swap ${thisCard.title} (root) with ${otherCard.title} (HQ).`,
        );
      } else {
        const otherSid = otherServerId as import("../state/types.js").ServerId;
        const otherSrv = state.servers[otherSid]!;
        otherSrv.root.splice(otherRootIdx, 1);
        thisServer.root.splice(thisRootIdx, 0, otherId);
        otherCard.zone = `server:${sid}:root`;
        otherSrv.root.splice(otherRootIdx, 0, thisId);
        thisCard.zone = `server:${otherSid}:root`;
        log(
          state,
          `Daruma swap ${thisCard.title} (${sid}) with ${otherCard.title} (${otherSid}).`,
        );
      }
      if (action.onSuccess) {
        return evalEffect({ state, sourceId }, action.onSuccess);
      }
      return { ok: true };
    }
    case "peeping_tom_choose_type_reveal_gain_etr_unless_tag_for_run": {
      if (!state.run?.encounter || state.run.encounter.iceId !== sourceId) {
        log(state, `Peeping Tom — no encounter on this ice.`);
        return { ok: true };
      }
      const types: Array<import("../state/types.js").CardType> = [
        "event",
        "hardware",
        "program",
        "resource",
      ];
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: types.map((t) => ({
          id: `peeping-type:${t}`,
          label: `Choose ${t}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "peeping_tom_apply_type" as const,
              cardType: t,
            },
          },
        })),
      };
      log(
        state,
        `${source.title} — choose a card type, reveal grip, gain ETR-unless-tag subs for the run.`,
      );
      return { ok: true };
    }
    case "peeping_tom_apply_type": {
      const ice = state.cards[sourceId];
      const run = state.run;
      if (!ice || !run?.encounter || run.encounter.iceId !== sourceId) {
        log(state, `Peeping Tom apply — no encounter.`);
        return { ok: true };
      }
      const grip = [...state.runner.hand];
      const titles = grip.map((id) => state.cards[id]?.title ?? id);
      log(
        state,
        `${ice.title} — reveal grip (${titles.length}): ${titles.join(", ") || "empty"}.`,
      );
      const n = grip.filter((id) => state.cards[id]?.type === action.cardType)
        .length;
      if (!ice.baseSubroutines) {
        ice.baseSubroutines = ice.subroutines
          ? structuredClone(ice.subroutines)
          : [];
      }
      const subEffect = {
        op: "do" as const,
        action: { kind: "end_the_run_unless_take_tags" as const, amount: 1 },
      };
      const gained = Array.from({ length: n }, (_, i) => ({
        id: `${ice.defId}-peeping-${i}`,
        text: "End the run unless the Runner takes 1 tag.",
        effect: structuredClone(subEffect),
      }));
      ice.subroutines = [...gained];
      run.encounter.broken = ice.subroutines.map(() => false);
      if (!run.peepingTomIceIds) run.peepingTomIceIds = [];
      if (!run.peepingTomIceIds.includes(sourceId)) {
        run.peepingTomIceIds.push(sourceId);
      }
      log(
        state,
        `${ice.title} — gains ${n} ETR-unless-tag subroutine(s) for the remainder of this run (${action.cardType}).`,
      );
      return { ok: true };
    }
    case "hangeki_choose_installed_runner_may_access": {
      const installed: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          installed.push(id);
        }
      }
      if (installed.length === 0) {
        log(state, `${source.title} — no installed Corp cards.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: installed.map((id) => ({
          id: `hangeki-pick:${id}`,
          label: `Choose ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "hangeki_runner_may_access" as const,
              cardId: id,
              onAccess: action.onAccess,
              onDecline: action.onDecline,
            },
          },
        })),
      };
      log(state, `${source.title} — choose 1 installed card.`);
      return { ok: true };
    }
    case "hangeki_runner_may_access": {
      const card = state.cards[action.cardId];
      if (!card) {
        log(state, `Hangeki — chosen card missing.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "hangeki-access",
            label: `Access ${card.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "hangeki_access_installed" as const,
                cardId: action.cardId,
                onAccess: action.onAccess,
              },
            },
          },
          {
            id: "hangeki-decline",
            label: "Decline",
            effect: action.onDecline,
          },
        ],
      };
      log(
        state,
        `${source.title} — Runner may access ${card.title}.`,
      );
      return { ok: true };
    }
    case "hangeki_access_installed": {
      const rfg = evalEffect({ state, sourceId }, action.onAccess);
      if (!rfg.ok) return rfg;
      const card = state.cards[action.cardId];
      if (!card) {
        log(state, `Hangeki access — card missing.`);
        return { ok: true };
      }
      let serverId: import("../state/types.js").ServerId | null = null;
      for (const [sid, server] of Object.entries(state.servers)) {
        if (
          server.root.includes(action.cardId) ||
          server.ice.includes(action.cardId)
        ) {
          serverId = sid as import("../state/types.js").ServerId;
          break;
        }
      }
      if (!serverId) {
        log(state, `Hangeki access — card no longer installed.`);
        return { ok: true };
      }
      if (state.run && !state.run.isPostRunBreach) {
        return applyPrimitive(ctx, {
          kind: "access_installed_card",
          cardId: action.cardId,
        });
      }
      state.pendingStandaloneCardAccess = {
        sourceId,
        cardId: action.cardId,
        serverId,
      };
      log(
        state,
        `${source.title} — pending out-of-run access of ${card.title}.`,
      );
      return { ok: true };
    }
    case "derez_encounter_ice": {
      const iceId = state.run?.encounter?.iceId;
      if (!iceId) {
        log(state, `Derez encounter ice — not encountering.`);
        return { ok: true };
      }
      const ice = state.cards[iceId];
      if (!ice?.rezzed) {
        log(state, `Derez encounter ice — already unrezzed.`);
        return { ok: true };
      }
      ice.rezzed = false;
      ice.faceup = false;
      if (state.run) state.run.iceDerezzedThisRun = true;
      log(state, `Derez ${ice.title} (encounter).`);
      fireHostRezStateTriggers(state, iceId, "derez");
      return { ok: true };
    }
    case "grant_approached_rezzed_bioroid_etr_subroutine_this_run": {
      const run = state.run;
      if (!run || run.position === null) {
        log(state, `${source.title} — no approached ice.`);
        return { ok: true };
      }
      const iceId = state.servers[run.attackedServerId]?.ice[run.position];
      const ice = iceId ? state.cards[iceId] : undefined;
      if (!ice || !ice.rezzed || !(ice.subtypes ?? []).includes("bioroid")) {
        log(state, `${source.title} — approached ice is not a rezzed bioroid.`);
        return { ok: true };
      }
      if (!ice.baseSubroutines) {
        ice.baseSubroutines = ice.subroutines
          ? structuredClone(ice.subroutines)
          : [];
      }
      const granted = {
        id: `${ice.defId}-wotan-etr-${iceId}`,
        text: "End the run.",
        effect: { op: "do" as const, action: { kind: "end_the_run" as const } },
      };
      ice.subroutines = [...(ice.subroutines ?? []), granted];
      if (!run.thunderboltGrantedIceIds) run.thunderboltGrantedIceIds = [];
      if (!run.thunderboltGrantedIceIds.includes(iceId!)) {
        run.thunderboltGrantedIceIds.push(iceId!);
      }
      if (run.encounter?.iceId === iceId) {
        run.encounter.broken.push(false);
      }
      log(
        state,
        `${source.title} — ${ice.title} gains an ETR subroutine for the remainder of this run.`,
      );
      return { ok: true };
    }
    case "install_rd_looked_card_paying_costs": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.turn.rdLookedCards.includes(cardId)) {
        log(state, `Install looked R&D card — not in look zone.`);
        returnRdLookedToDeckTop(state);
        return { ok: true };
      }
      const cost = card.installCost ?? 0;
      if (creditsAvailableForInstall(state, "corp") < cost) {
        log(state, `Install looked R&D card — cannot afford ${cost}¢.`);
        returnRdLookedToDeckTop(state);
        return { ok: true };
      }
      spendCreditsForInstall(state, "corp", cost);
      state.turn.rdLookedCards = state.turn.rdLookedCards.filter(
        (x) => x !== cardId,
      );
      state.corp.hand.push(cardId);
      card.zone = "corp:hq";
      card.faceup = true;
      const r = evalEffect(
        { state, sourceId },
        {
          op: "do",
          action: { kind: "install_hq_card_paying_costs", cardId },
        },
      );
      returnRdLookedToDeckTop(state);
      return r;
    }
    case "return_rd_looked_to_deck_top": {
      returnRdLookedToDeckTop(state);
      log(state, `Return looked R&D cards to top of deck.`);
      return { ok: true };
    }
    case "look_top_1_rd_choose_type_may_reveal_gain": {
      const credits = action.credits ?? 0;
      const types: Array<
        | "agenda"
        | "asset"
        | "ice"
        | "operation"
        | "upgrade"
        | "event"
      > = [
        "agenda",
        "asset",
        "ice",
        "operation",
        "upgrade",
        "event",
      ];
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: types.map((t) => ({
          id: `rd-type:${t}`,
          label: `Choose type: ${t}`,
          effect: {
            op: "do",
            action: {
              kind: "peek_rd_top_for_chosen_type_may_reveal_gain",
              cardType: t,
              credits,
            },
          },
        })),
      };
      log(state, `Choose a card type and look at the top card of R&D.`);
      return { ok: true };
    }
    case "peek_rd_top_for_chosen_type_may_reveal_gain": {
      const chosen = action.cardType;
      const credits = action.credits ?? 0;
      if (state.corp.deck.length === 0) {
        log(state, `Look top of R&D — deck empty.`);
        return { ok: true };
      }
      const topId = state.corp.deck[0]!;
      const top = state.cards[topId];
      log(
        state,
        `Look R&D top — ${top.title} (${top.type}); chosen type ${chosen}.`,
      );
      if (top.type !== chosen) {
        log(state, `Type does not match — leave card on top of R&D.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "reveal-gain",
            label: `Reveal ${top.title} and gain ${credits}¢`,
            effect: {
              op: "seq",
              effects: [
                {
                  op: "do",
                  action: {
                    kind: "gain_credits",
                    side: "corp",
                    amount: credits,
                  },
                },
              ],
            },
          },
          {
            id: "decline",
            label: "Decline to reveal",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
        ],
      };
      top.faceup = true;
      log(state, `May reveal ${top.title} and gain ${credits}¢.`);
      return { ok: true };
    }
    case "reveal_corp_hand_card": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.corp.hand.includes(cardId)) {
        log(state, `Reveal HQ card — not in HQ.`);
        return { ok: true };
      }
      card.faceup = true;
      log(state, `Reveal ${card.title} from HQ.`);
      return { ok: true };
    }
    case "corp_may_reveal_agenda_from_hq": {
      const agendas = state.corp.hand.filter(
        (id) => state.cards[id].type === "agenda",
      );
      const elseEff = action.else;
      const thenEff = action.then;
      if (agendas.length === 0) {
        log(state, `Reveal agenda from HQ — none in HQ.`);
        if (elseEff) return evalEffect(ctx, elseEff);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          ...agendas.map((id) => ({
            id: `reveal-hq:${id}`,
            label: `Reveal ${state.cards[id].title}`,
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: {
                    kind: "reveal_corp_hand_card" as const,
                    cardId: id,
                  },
                },
                ...(thenEff ? [structuredClone(thenEff)] : []),
              ],
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: elseEff
              ? structuredClone(elseEff)
              : {
                  op: "do" as const,
                  action: { kind: "gain_credits", side: "corp", amount: 0 },
                },
          },
        ],
      };
      log(state, `Corp may reveal an agenda from HQ.`);
      return { ok: true };
    }
    case "look_top_n_rd_peek": {
      const n = Math.max(0, action.n ?? 1);
      const taken = state.corp.deck.splice(
        0,
        Math.min(n, state.corp.deck.length),
      );
      for (const id of taken) {
        state.cards[id].faceup = true;
        log(state, `Runner looks at R&D — ${state.cards[id].title}.`);
      }
      for (let i = taken.length - 1; i >= 0; i--) {
        const id = taken[i]!;
        state.cards[id].faceup = false;
        state.corp.deck.unshift(id);
      }
      log(state, `Return ${taken.length} looked card(s) to top of R&D.`);
      return { ok: true };
    }
    case "search_rd_install_rez_ice_on_source_server": {
      const host = serverHostingCard(state, sourceId);
      if (!host) {
        log(state, `${source.title} — not installed on a server.`);
        return { ok: true };
      }
      const iceIds = state.corp.deck.filter(
        (id) => state.cards[id].type === "ice",
      );
      if (iceIds.length === 0) {
        log(state, `Search R&D for ice — none found.`);
        return { ok: true };
      }
      const discount = Math.max(0, action.totalDiscount ?? 0);
      if (iceIds.length === 1) {
        return evalEffect(
          { state, sourceId },
          {
            op: "do",
            action: {
              kind: "install_rez_rd_ice_on_source_server",
              cardId: iceIds[0]!,
              totalDiscount: discount,
            },
          },
        );
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          ...iceIds.map((id) => ({
            id: `tucana-ice:${id}`,
            label: `Install and rez ${state.cards[id].title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_rez_rd_ice_on_source_server" as const,
                cardId: id,
                totalDiscount: discount,
              },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
        ],
      };
      log(state, `Search R&D — choose ice to install on ${host.id}.`);
      return { ok: true };
    }
    case "install_rez_rd_ice_on_source_server": {
      const host = serverHostingCard(state, sourceId);
      if (!host) {
        log(state, `${source.title} — not installed on a server.`);
        return { ok: true };
      }
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || card.type !== "ice") {
        log(state, `Install ice from R&D — invalid ice.`);
        return { ok: true };
      }
      const deckIdx = state.corp.deck.indexOf(cardId);
      if (deckIdx < 0) {
        log(state, `Install ice from R&D — not in R&D.`);
        return { ok: true };
      }
      state.corp.deck.splice(deckIdx, 1);
      shuffleCorpRdAfterSearch(state);
      const installCost = card.installCost ?? 0;
      const rezCost = card.rezCost ?? 0;
      const total = Math.max(
        0,
        installCost + rezCost - (action.totalDiscount ?? 0),
      );
      if (state.corp.credits < total) {
        log(
          state,
          `Cannot afford to install and rez ${card.title} for ${total}¢ — leave in R&D.`,
        );
        state.corp.deck.unshift(cardId);
        card.zone = "corp:rd";
        card.faceup = false;
        return { ok: true };
      }
      state.corp.credits -= total;
      host.ice.unshift(cardId);
      card.zone = `server:${host.id}:ice`;
      card.rezzed = true;
      card.faceup = true;
      log(
        state,
        `Install and rez ${card.title} on ${host.id} for ${total}¢ (${action.totalDiscount ?? 0}¢ discount).`,
      );
      return { ok: true };
    }
    case "etr_subroutines_per_runner_tags_on_encounter": {
      const ice = state.cards[sourceId];
      const run = state.run;
      if (!ice || !run?.encounter || run.encounter.iceId !== sourceId) {
        return { ok: true };
      }
      const n = Math.max(0, effectiveRunnerTags(state));
      if (n === 0) {
        log(state, `${ice.title} — 0 tags, no extra ETR subroutines.`);
        return { ok: true };
      }
      if (!ice.baseSubroutines) {
        ice.baseSubroutines = ice.subroutines
          ? structuredClone(ice.subroutines)
          : [];
      }
      const etrEffect = {
        op: "do" as const,
        action: { kind: "end_the_run" as const },
      };
      const printed = structuredClone(ice.baseSubroutines);
      const etrSubs = Array.from({ length: n }, (_, i) => ({
        id: `${ice.defId}-etr-tags-${i}`,
        text: "End the run.",
        effect: structuredClone(etrEffect),
      }));
      ice.subroutines = [...printed, ...etrSubs];
      for (let i = 0; i < n; i++) {
        run.encounter.broken.push(false);
      }
      log(
        state,
        `${ice.title} — gain ${n} ETR subroutine(s) after printed (${state.runner.tags} tag(s)).`,
      );
      return { ok: true };
    }
    case "look_top_n_rd_arrange": {
      const n = action.n ?? 1;
      if (state.turn.rdLookedCards.length > 0) {
        return {
          ok: false,
          error: "R&D look already in progress.",
          cites: [],
        };
      }
      const taken = state.corp.deck.splice(
        0,
        Math.min(n, state.corp.deck.length),
      );
      state.turn.rdLookedCards = taken;
      state.turn.rdArrangePlaced = [];
      state.turn.rdArrangeThenMayDrawIfUnprotected = Boolean(
        action.thenMayDrawIfUnprotected,
      );
      for (const id of taken) {
        state.cards[id].faceup = true;
        log(state, `Look R&D — ${state.cards[id].title}.`);
      }
      return offerRdArrangeChoice(state, sourceId);
    }
    case "look_top_n_rd_trash_one_hq_one_arrange_rest": {
      const n = action.n ?? 1;
      if (state.turn.rdLookedCards.length > 0) {
        return {
          ok: false,
          error: "R&D look already in progress.",
          cites: [],
        };
      }
      const taken = state.corp.deck.splice(
        0,
        Math.min(n, state.corp.deck.length),
      );
      if (taken.length === 0) {
        log(state, `Cultivate — R&D empty.`);
        return { ok: true };
      }
      state.turn.rdLookedCards = taken;
      state.turn.rdArrangePlaced = [];
      state.turn.rdArrangeThenMayDrawIfUnprotected = false;
      for (const id of taken) {
        state.cards[id].faceup = true;
        log(state, `Cultivate look — ${state.cards[id].title}.`);
      }
      return offerCultivateTrashChoice(state, sourceId);
    }
    case "cultivate_trash_looked": {
      const cardId = action.cardId;
      const idx = state.turn.rdLookedCards.indexOf(cardId);
      if (idx < 0) {
        log(state, `Cultivate trash — card not in look zone.`);
        return { ok: true };
      }
      state.turn.rdLookedCards.splice(idx, 1);
      trashCorpCardToArchives(state, cardId);
      log(state, `Cultivate — trash ${state.cards[cardId]!.title}.`);
      if (state.turn.rdLookedCards.length === 0) {
        return { ok: true };
      }
      return offerCultivateHqChoice(state, sourceId);
    }
    case "cultivate_hq_looked": {
      const cardId = action.cardId;
      const idx = state.turn.rdLookedCards.indexOf(cardId);
      if (idx < 0) {
        log(state, `Cultivate HQ — card not in look zone.`);
        return { ok: true };
      }
      state.turn.rdLookedCards.splice(idx, 1);
      const card = state.cards[cardId]!;
      card.zone = "corp:hq";
      card.faceup = false;
      state.corp.hand.push(cardId);
      log(state, `Cultivate — add ${card.title} to HQ.`);
      if (state.turn.rdLookedCards.length === 0) {
        return { ok: true };
      }
      return offerRdArrangeChoice(state, sourceId);
    }
    case "rd_arrange_pick": {
      const cardId = action.cardId;
      const idx = state.turn.rdLookedCards.indexOf(cardId);
      if (idx < 0) {
        log(state, `Arrange R&D — card not in look zone.`);
        return { ok: true };
      }
      state.turn.rdLookedCards.splice(idx, 1);
      state.turn.rdArrangePlaced.push(cardId);
      return offerRdArrangeChoice(state, sourceId);
    }
    case "may_play_or_install_from_hq": {
      const installEligible = state.corp.hand.filter((id) => {
        const t = state.cards[id].type;
        return (
          t === "agenda" || t === "asset" || t === "ice" || t === "upgrade"
        );
      });
      const affordableInstall = installEligible.filter(
        (id) =>
          creditsAvailableForInstall(state, "corp") >=
          (state.cards[id].installCost ?? 0),
      );
      const playableOps = state.corp.hand.filter((id) => {
        const c = state.cards[id];
        return (
          c.type === "operation" &&
          state.corp.credits >= (c.playCost ?? 0)
        );
      });
      if (affordableInstall.length === 0 && playableOps.length === 0) {
        log(state, `Play or install from HQ — no eligible cards.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...affordableInstall.map((id) => ({
            id: `hq-install:${id}`,
            label: `Install ${state.cards[id].title} for ${state.cards[id].installCost ?? 0}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_hq_card_paying_costs" as const,
                cardId: id,
              },
            },
          })),
          ...playableOps.map((id) => ({
            id: `hq-play:${id}`,
            label: `Play ${state.cards[id].title} for ${state.cards[id].playCost ?? 0}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "play_hq_operation_paying_costs" as const,
                cardId: id,
              },
            },
          })),
        ],
      };
      log(state, `May play an operation or install from HQ.`);
      return { ok: true };
    }
    case "play_hq_operation_paying_costs": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || card.type !== "operation") {
        log(state, `Play from HQ — not an operation.`);
        return { ok: true };
      }
      if (!state.corp.hand.includes(cardId)) {
        log(state, `Play from HQ — operation not in HQ.`);
        return { ok: true };
      }
      const cost = card.playCost ?? 0;
      if (state.corp.credits < cost) {
        log(state, `Play from HQ — cannot afford ${cost}¢.`);
        return { ok: true };
      }
      state.corp.credits -= cost;
      state.corp.hand = state.corp.hand.filter((id) => id !== cardId);
      state.corp.discard.push(cardId);
      card.zone = "corp:archives";
      card.faceup = true;
      noteCorpCardAddedToArchives(state);
      log(state, `Corp plays ${card.title} from HQ for ${cost}¢.`);
      if (card.onPlay) {
        const r = evalEffect({ state, sourceId: cardId }, card.onPlay);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "gain_credits_per_rezzed_subtype": {
      const per = action.per ?? 1;
      let n = 0;
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          const c = state.cards[id];
          if (c?.rezzed && (c.subtypes ?? []).includes(action.subtype)) n += 1;
        }
      }
      const gained = n * per;
      state.corp.credits += gained;
      log(
        state,
        `Corp gains ${gained}¢ (${n} rezzed ${action.subtype} × ${per}) (CR ${CR.gainCredits.number}).`,
      );
      return { ok: true };
    }
    case "lose_credits_per_rezzed_subtype": {
      const per = action.per ?? 1;
      let n = 0;
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          const c = state.cards[id];
          if (c?.rezzed && (c.subtypes ?? []).includes(action.subtype)) n += 1;
        }
      }
      const side = resolveSide(ctx, action.side);
      const p = side === "corp" ? state.corp : state.runner;
      const loseAmt = Math.min(n * per, p.credits);
      p.credits -= loseAmt;
      log(
        state,
        `${side} loses ${loseAmt}¢ (${n} rezzed ${action.subtype} × ${per}) → ${p.credits} (CR ${CR.gainCredits.number}).`,
      );
      return { ok: true };
    }
    case "add_from_heap_to_grip": {
      const moveToGrip = (id: string): { ok: true } => {
        const idx = state.runner.discard.indexOf(id);
        if (idx < 0) {
          log(state, `Add from heap — ${id} not in heap.`);
          return { ok: true };
        }
        state.runner.discard.splice(idx, 1);
        state.runner.hand.push(id);
        state.cards[id].zone = "runner:grip";
        state.cards[id].faceup = false;
        log(state, `Add ${state.cards[id].title} from heap to grip.`);
        return { ok: true };
      };
      if (action.cardId) {
        return moveToGrip(action.cardId);
      }
      const idFaction = state.cards[state.runner.identityId]?.faction;
      const heap = state.runner.discard.filter((id) => {
        if (!action.matchingIdentityFaction) return true;
        return Boolean(idFaction) && state.cards[id]?.faction === idFaction;
      });
      if (heap.length === 0) {
        log(
          state,
          action.matchingIdentityFaction
            ? `Add from heap — no card matching identity faction.`
            : `Add from heap — heap empty.`,
        );
        return { ok: true };
      }
      if (action.pick === "choose" && heap.length > 1) {
        state.pendingChoice = {
          sourceId,
          chooser: "runner",
          options: heap.map((id) => ({
            id: `heap-grip:${id}`,
            label: `Add ${state.cards[id].title} to grip`,
            effect: {
              op: "do" as const,
              action: {
                kind: "add_from_heap_to_grip" as const,
                pick: "first" as const,
                cardId: id,
              },
            },
          })),
        };
        log(state, `Choose a card in the heap to add to grip.`);
        return { ok: true };
      }
      return moveToGrip(heap[0]!);
    }
    case "choose_rezzed_bioroid_forbid_runner_break": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          const c = state.cards[id];
          if (c?.rezzed && (c.subtypes ?? []).includes("bioroid")) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `Trieste — no rezzed bioroid ice to choose.`);
        return { ok: true };
      }
      if (targets.length === 1) {
        const id = targets[0]!;
        state.cards[id].cannotBreakWithRunnerCardAbilities = true;
        log(
          state,
          `${source.title} — choose ${state.cards[id].title}; Runner card abilities cannot break its subs.`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `trieste:${id}`,
          label: `Choose ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "trash_corp_card" as const, // placeholder replaced below
              cardId: id,
            },
          },
        })),
      };
      // Use a dedicated leaf via encoding in option effect as gain 0 then set flag in chooseOption — simpler: use custom option ids handled in chooseOption OR set via a new primitive set_flag.
      // Rebuild options with a seq that uses a new micro-primitive: encode as choose that evaluates a do with kind we handle specially.
      // Simpler approach: set flag synchronously on choose via option id prefix in chooseOption.
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          ...targets.map((id) => ({
            id: `forbid-runner-break:${id}`,
            label: `Choose ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "corp" as const,
                amount: 0,
              },
            },
          })),
        ],
      };
      log(
        state,
        `${source.title} — choose a rezzed bioroid ice (CR ${CR.paidAbility.number}).`,
      );
      return { ok: true };
    }
    case "score_facedown_agenda_from_archives_if_clean": {
      if (state.turn.corpCardsAddedToArchivesThisTurn > 0) {
        log(
          state,
          `Regenesis — Corp cards were added to Archives this turn; skip.`,
        );
        return { ok: true };
      }
      const facedown = state.corp.discard.find((id) => {
        const c = state.cards[id];
        return c?.type === "agenda" && !c.faceup;
      });
      if (!facedown) {
        log(state, `Regenesis — no facedown agenda in Archives.`);
        return { ok: true };
      }
      const card = state.cards[facedown];
      state.corp.discard = state.corp.discard.filter((id) => id !== facedown);
      state.corp.score.push(facedown);
      card.zone = "corp:score";
      card.faceup = true;
      card.rezzed = true;
      state.turn.agendaPointsScoredThisTurn += card.agendaPoints ?? 0;
      log(
        state,
        `Regenesis — score facedown ${card.title} from Archives for ${card.agendaPoints ?? 0} points (CR ${CR.scoringAgenda.number}).`,
      );
      checkWinConditions(state);
      return { ok: true };
    }

    case "remove_advancements": {
      const have = source.advancementTokens ?? 0;
      const removed = Math.min(action.amount, have);
      if (removed <= 0) {
        log(
          state,
          `Remove advancements — ${source.title} has none (CR ${CR.advancing.number}).`,
        );
        return { ok: true };
      }
      source.advancementTokens = have - removed;
      log(
        state,
        `Remove ${removed} advancement(s) from ${source.title} → ${source.advancementTokens} (CR ${CR.advancing.number}).`,
      );
      if (action.then) {
        return evalEffect(ctx, action.then);
      }
      return { ok: true };
    }
    case "meat_damage_per_advancement": {
      const amount = source.advancementTokens ?? 0;
      if (amount <= 0) {
        log(state, `Meat damage per advancement — 0 tokens.`);
        return { ok: true };
      }
      dealDamage(state, "meat", amount, sourceId);
      return { ok: true };
    }
    case "net_damage_per_advancement": {
      const amount = (action.base ?? 0) + (source.advancementTokens ?? 0);
      if (amount <= 0) {
        log(state, `Net damage per advancement — 0.`);
        return { ok: true };
      }
      dealDamage(state, "net", amount, sourceId);
      return { ok: true };
    }
    case "net_damage_and_tags_equal_runner_tags": {
      const x = state.runner.tags;
      if (x <= 0) {
        log(state, `Vicsek X — Runner has 0 tags; no net/tags.`);
        return { ok: true };
      }
      dealDamage(state, "net", x, sourceId);
      return evalEffect(ctx, {
        op: "do",
        action: { kind: "give_tags", amount: x },
      });
    }
    case "unleash_rez_may_resolve_sub": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          const c = state.cards[id];
          if (c?.type === "ice" && !c.rezzed) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `Unleash — no unrezzed installed ice.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `unleash-rez:${id}`,
          label: `Rez ${state.cards[id]!.title} ignoring costs`,
          effect: {
            op: "do" as const,
            action: {
              kind: "unleash_rez_ice_then_may_resolve_sub" as const,
              cardId: id,
            },
          },
        })),
      };
      log(state, `${source.title} — choose an installed ice to rez ignoring costs.`);
      return { ok: true };
    }
    case "unleash_rez_ice_then_may_resolve_sub": {
      const rez = applyPrimitive(ctx, {
        kind: "rez_ice_ignore_costs",
        cardId: action.cardId,
      });
      if (!rez.ok) return rez;
      const ice = state.cards[action.cardId];
      const subs = ice?.subroutines ?? [];
      if (!ice?.rezzed || subs.length === 0) {
        log(state, `Unleash — no subroutines to resolve on ${ice?.title ?? action.cardId}.`);
        return { ok: true };
      }
      const options: import("./ir.js").ChoiceOption[] = subs.map((sub, i) => ({
        id: `unleash-sub:${action.cardId}:${i}`,
        label: `Resolve "${sub.text}" on ${ice.title}`,
        effect: sub.effect,
      }));
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do" as const,
          action: {
            kind: "gain_credits" as const,
            side: "corp" as const,
            amount: 0,
          },
        },
      });
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(
        state,
        `${source.title} — may resolve 1 subroutine on ${ice.title}.`,
      );
      return { ok: true };
    }
    case "trash_self": {
      releaseHostedCardsOnTrash(state, sourceId);
      removeCardFromCurrentZone(state, sourceId);
      if (source.side === "runner") {
        state.runner.discard.push(sourceId);
        source.zone = "runner:heap";
      } else {
        state.corp.discard.push(sourceId);
        source.zone = "corp:archives";
      }
      source.faceup = true;
      log(
        state,
        `${source.title} trashed (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "trash_self_and_derez_host": {
      const hostId = source.hostId;
      const trashed = applyPrimitive(ctx, { kind: "trash_self" });
      if (!trashed.ok) return trashed;
      if (!hostId) {
        log(state, `${source.title} — trashed; no host ice to derez.`);
        return { ok: true };
      }
      const host = state.cards[hostId];
      if (!host || host.type !== "ice" || !host.rezzed) {
        log(
          state,
          `${source.title} — trashed; ${host?.title ?? hostId} not rezzed ice.`,
        );
        return { ok: true };
      }
      host.rezzed = false;
      host.faceup = false;
      log(
        state,
        `${source.title} — trashed and derez ${host.title} (CR ${CR.derez.number}).`,
      );
      if (state.run) state.run.iceDerezzedThisRun = true;
      fireHostRezStateTriggers(state, hostId, "derez");
      return { ok: true };
    }
    case "trash_attacked_server_root": {
      const sid = state.run?.attackedServerId;
      if (!sid) {
        log(state, `Trash attacked-server root — no run.`);
        return { ok: true };
      }
      const server = state.servers[sid];
      const rootIds = [...server.root];
      for (const id of rootIds) {
        const card = state.cards[id];
        removeCardFromCurrentZone(state, id);
        state.corp.discard.push(id);
        card.zone = "corp:archives";
        card.faceup = true;
        card.rezzed = false;
        log(
          state,
          `Trash ${card.title} from ${sid} root (CR ${CR.trashing.number}).`,
        );
      }
      if (rootIds.length === 0) {
        log(state, `Trash ${sid} root — empty.`);
      }
      return { ok: true };
    }
    case "archives_to_hq": {
      const n = Math.min(action.amount, state.corp.discard.length);
      for (let i = 0; i < n; i++) {
        const id = state.corp.discard.pop()!;
        state.corp.hand.push(id);
        state.cards[id].zone = "corp:hq";
        state.cards[id].faceup = false;
      }
      log(
        state,
        `Add ${n} card(s) from Archives to HQ (CR ${CR.drawing.number}).`,
      );
      return { ok: true };
    }
    case "trash_installed_runner": {
      const cands = [...state.runner.rig];
      if (action.pick === "choose" || cands.length > 1) {
        return pendingTrashAmong(state, sourceId, cands, "installed Runner card");
      }
      if (cands.length === 0) {
        log(state, `Trash installed Runner card — none installed.`);
        return { ok: true };
      }
      const id = cands[0]!;
      trashToHeap(state, id);
      log(
        state,
        `Trash installed ${state.cards[id].title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "trash_installed_runner_lte_last_trashed_rez": {
      const maxCost = state.turn.lastTrashedRezzedPrintedRezCost;
      if (maxCost === null || maxCost === undefined) {
        log(state, `Trash Runner ≤ rez — no last trashed rez cost.`);
        return { ok: true };
      }
      const cands = state.runner.rig.filter((id) => {
        const c = state.cards[id];
        const cost = c.installCost ?? 0;
        return cost <= maxCost;
      });
      if (cands.length === 0) {
        log(
          state,
          `Trash Runner ≤ ${maxCost}¢ install — none eligible.`,
        );
        return { ok: true };
      }
      if (action.pick === "choose" && cands.length > 1) {
        return pendingTrashAmong(
          state,
          sourceId,
          cands,
          `installed Runner card (≤${maxCost}¢)`,
        );
      }
      const id = cands[0]!;
      trashToHeap(state, id);
      log(
        state,
        `Trash installed ${state.cards[id].title} (≤${maxCost}¢) (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "forbid_steal_trash_this_run": {
      if (state.run) {
        state.run.cannotStealOrTrash = true;
        log(state, `Runner cannot steal or trash Corp cards for the remainder of this run.`);
      }
      return { ok: true };
    }
    case "access_one_root_other_server": {
      if (!state.run) {
        return {
          ok: false,
          error: "access_one_root_other_server requires an active run.",
          cites: [CR.breach],
        };
      }
      const attacked = state.run.attackedServerId;
      const cands: string[] = [];
      for (const [sid, server] of Object.entries(state.servers)) {
        if (sid === attacked) continue;
        for (const id of server.root) {
          cands.push(id);
        }
      }
      state.run.cannotStealOrTrash = true;
      state.run.accessCandidates = cands;
      state.run.accessRemaining = cands.length > 0 ? 1 : 0;
      state.run.accessCandidatesPreset = true;
      state.run.accessedCardIds = state.run.accessedCardIds ?? [];
      if (cands.length > 0) {
        // Enter breach instead of ending the run after skipBreach replace.
        state.run.skipBreach = false;
        log(
          state,
          `${source.title} — instead of breach, access 1 root card among ${cands.length} other-server candidate(s) (cannot steal/trash).`,
        );
      } else {
        log(
          state,
          `${source.title} — no other-server root cards to access.`,
        );
      }
      return { ok: true };
    }
    case "install_hq_new_remotes_with_advancements": {
      const max = Math.max(0, action.max);
      const adv = Math.max(0, action.advancements);
      const eligible = state.corp.hand.filter((id) => {
        const t = state.cards[id].type;
        return t === "agenda" || t === "asset" || t === "ice";
      });
      let installed = 0;
      for (const pick of eligible) {
        if (installed >= max) break;
        const card = state.cards[pick];
        const cost = card.installCost ?? 0;
        if (state.corp.credits < cost) {
          log(
            state,
            `Mitosis install — skip ${card.title} (need ${cost}¢, have ${state.corp.credits}).`,
          );
          continue;
        }
        state.corp.credits -= cost;
        state.corp.hand = state.corp.hand.filter((id) => id !== pick);
        const remoteNum = state.nextRemoteNumber++;
        const sid =
          `remote-${remoteNum}` as import("../state/types.js").ServerId;
        state.servers[sid] = { id: sid, kind: "remote", ice: [], root: [] };
        state.turn.remotesCreatedThisTurn += 1;
        if (card.type === "ice") {
          state.servers[sid].ice.push(pick);
          card.zone = `server:${sid}:ice`;
        } else {
          state.servers[sid].root.push(pick);
          card.zone = `server:${sid}:root`;
        }
        card.rezzed = false;
        card.faceup = false;
        card.advancementTokens = (card.advancementTokens ?? 0) + adv;
        noteInstalledThisTurn(state, pick);
        if (!state.turn.cannotScoreOrRezCardIds.includes(pick)) {
          state.turn.cannotScoreOrRezCardIds.push(pick);
        }
        installed += 1;
        log(
          state,
          `${source.title} — install ${card.title} on ${sid} with ${adv} advancement(s); cannot score/rez this turn.`,
        );
      }
        if (installed === 0) {
        log(state, `${source.title} — no HQ cards installed.`);
      }
      return { ok: true };
    }
    case "moon_pool_resolve": {
      // RFG self (typically after trashSelf cost left it in Archives).
      removeCardFromCurrentZone(state, sourceId);
      if (!state.removedFromGame) state.removedFromGame = [];
      if (!state.removedFromGame.includes(sourceId)) {
        state.removedFromGame.push(sourceId);
      }
      source.zone = "removed-from-game";
      source.faceup = true;
      source.rezzed = false;
      log(
        state,
        `${source.title} is removed from the game (Moon Pool).`,
      );

      const trashN = Math.min(
        Math.max(0, action.trashHqMax),
        state.corp.hand.length,
      );
      for (let i = 0; i < trashN; i++) {
        const id = state.corp.hand.pop()!;
        state.corp.discard.push(id);
        state.cards[id].zone = "corp:archives";
        state.cards[id].faceup = true;
        noteCorpCardAddedToArchives(state);
        log(
          state,
          `${source.title} — trash ${state.cards[id].title} from HQ.`,
        );
      }

      const facedown = state.corp.discard.filter(
        (id) => !state.cards[id].faceup,
      );
      const revealN = Math.min(
        Math.max(0, action.revealArchivesMax),
        facedown.length,
      );
      const revealed: string[] = [];
      for (let i = 0; i < revealN; i++) {
        const id = facedown[i]!;
        revealed.push(id);
        state.cards[id].faceup = true;
        state.corp.discard = state.corp.discard.filter((x) => x !== id);
        state.corp.deck.push(id);
        state.cards[id].zone = "corp:rd";
        state.cards[id].faceup = false; // facedown once shuffled into R&D
        log(
          state,
          `${source.title} — reveal ${state.cards[id].title} from Archives → R&D.`,
        );
      }
      if (revealN > 0) {
        state.corp.deck.reverse();
      }

      const agendaRevealed = revealed.filter(
        (id) => state.cards[id].type === "agenda",
      );
      for (const _agendaId of agendaRevealed) {
        let target: string | null = null;
        for (const server of Object.values(state.servers)) {
          for (const id of [...server.root, ...server.ice]) {
            const c = state.cards[id];
            if (c.type === "agenda" || c.canAdvance) {
              target = id;
              break;
            }
          }
          if (target) break;
        }
        if (!target) {
          log(
            state,
            `${source.title} — agenda revealed; no advanceable card for token.`,
          );
          continue;
        }
        const card = state.cards[target]!;
        card.advancementTokens = (card.advancementTokens ?? 0) + 1;
        log(
          state,
          `${source.title} — place 1 advancement on ${card.title} → ${card.advancementTokens}.`,
        );
      }
      return { ok: true };
    }
    case "simulation_reset_resolve": {
      const trashN = Math.min(
        Math.max(0, action.trashHqMax),
        state.corp.hand.length,
      );
      for (let i = 0; i < trashN; i++) {
        const id = state.corp.hand.pop()!;
        state.corp.discard.push(id);
        state.cards[id].zone = "corp:archives";
        state.cards[id].faceup = true;
        noteCorpCardAddedToArchives(state);
        log(
          state,
          `${source.title} — trash ${state.cards[id].title} from HQ.`,
        );
      }
      const shuffleN = Math.min(trashN, state.corp.discard.length);
      for (let i = 0; i < shuffleN; i++) {
        const id = state.corp.discard.pop()!;
        state.corp.deck.push(id);
        state.cards[id].zone = "corp:rd";
        state.cards[id].faceup = false;
      }
      if (shuffleN > 0) {
        // Deterministic "shuffle": reverse then leave (v0; same as moon pool).
        state.corp.deck.reverse();
        log(
          state,
          `${source.title} — shuffle ${shuffleN} from Archives into R&D.`,
        );
      }
      if (trashN > 0) {
        const drawn = drawCards(state, "corp", trashN);
        log(
          state,
          `${source.title} — Corp draws ${drawn} (requested ${trashN}).`,
        );
      }
      removeCardFromCurrentZone(state, sourceId);
      if (!state.removedFromGame) state.removedFromGame = [];
      if (!state.removedFromGame.includes(sourceId)) {
        state.removedFromGame.push(sourceId);
      }
      source.zone = "removed-from-game";
      source.faceup = true;
      source.rezzed = false;
      log(state, `${source.title} is removed from the game.`);
      return { ok: true };
    }
    case "search_rd_install_rez_by_printed_rez_cost": {
      const base = state.turn.lastTrashedRezzedPrintedRezCost;
      if (base === null) {
        log(
          state,
          `${source.title} — no trashed rezzed printed rez cost recorded.`,
        );
        return { ok: true };
      }
      const targetCost = base + action.delta;
      const pick = state.corp.deck.find((id) => {
        const c = state.cards[id];
        if (c.rezCost === undefined) return false;
        return c.rezCost === targetCost;
      });
      if (!pick) {
        log(
          state,
          `${source.title} — no R&D card with printed rez ${targetCost}¢.`,
        );
        return { ok: true };
      }
      state.corp.deck = state.corp.deck.filter((id) => id !== pick);
      const card = state.cards[pick]!;
      const remoteNum = state.nextRemoteNumber++;
      const sid =
        `remote-${remoteNum}` as import("../state/types.js").ServerId;
      state.servers[sid] = { id: sid, kind: "remote", ice: [], root: [] };
      state.turn.remotesCreatedThisTurn += 1;
      if (card.type === "ice") {
        state.servers[sid].ice.push(pick);
        card.zone = `server:${sid}:ice`;
      } else {
        state.servers[sid].root.push(pick);
        card.zone = `server:${sid}:root`;
      }
      card.rezzed = true;
      card.faceup = true;
      state.corp.deck.reverse();
      log(
        state,
        `${source.title} — install and rez ${card.title} from R&D on ${sid} (printed rez ${card.rezCost}¢; ignore credit costs).`,
      );
      return { ok: true };
    }
    case "deep_dive_resolve": {
      const setAsideN = Math.max(0, action.setAside ?? 8);
      const initial = Math.max(1, action.initialAccess ?? 1);
      const aside: string[] = [];
      for (let i = 0; i < setAsideN && state.corp.deck.length > 0; i++) {
        const id = state.corp.deck.shift()!;
        aside.push(id);
        state.cards[id].faceup = true;
        state.cards[id].zone = "corp:set-aside";
      }
      state.corp.corpSetAside = aside;
      log(
        state,
        `${source.title} — set aside top ${aside.length} of R&D faceup.`,
      );
      // Access 1, then may spend clicks for more (auto: spend available clicks).
      let accesses = Math.min(initial, aside.length);
      const extraClicks = Math.max(0, state.runner.clicks);
      const more = Math.min(extraClicks, Math.max(0, aside.length - accesses));
      if (more > 0) {
        state.runner.clicks -= more;
        accesses += more;
        log(
          state,
          `${source.title} — spend ${more} [click] for ${more} additional access(es).`,
        );
      }
      const accessed = aside.slice(0, accesses);
      const remainder = aside.slice(accesses);
      for (const id of accessed) {
        const card = state.cards[id]!;
        log(state, `${source.title} — access ${card.title} from set-aside.`);
        if (card.type === "agenda") {
          stealAgenda(state, id);
        }
      }
      // Shuffle remainder + any still in corpSetAside back into R&D.
      const back = [
        ...remainder,
        ...(state.corp.corpSetAside ?? []).filter(
          (id) => !accessed.includes(id) && !remainder.includes(id),
        ),
      ];
      // Also remove stolen agendas from set-aside tracking.
      const toShuffle = back.filter(
        (id) => state.cards[id]?.zone === "corp:set-aside",
      );
      for (const id of toShuffle) {
        state.corp.deck.push(id);
        state.cards[id].zone = "corp:rd";
        state.cards[id].faceup = false;
      }
      state.corp.deck.reverse();
      state.corp.corpSetAside = [];
      log(
        state,
        `${source.title} — shuffle ${toShuffle.length} set-aside card(s) into R&D.`,
      );
      return { ok: true };
    }
    case "install_from_hq_or_archives": {
      // May install 1 card from HQ or Archives (Ansel / Ablative). Auto: first from HQ, else Archives.
      const eligible = (id: string, allowOperation: boolean): boolean => {
        const t = state.cards[id].type;
        if (action.excludeAgenda && t === "agenda") return false;
        if (t === "operation") return allowOperation && !action.excludeAgenda;
        return (
          t === "agenda" || t === "asset" || t === "ice" || t === "upgrade"
        );
      };
      const pick =
        state.corp.hand.find((id) => eligible(id, true)) ??
        state.corp.discard.find((id) => eligible(id, false));
      if (!pick) {
        log(state, `Install from HQ/Archives — no eligible card.`);
        return { ok: true };
      }
      const fromArchives = state.corp.discard.includes(pick);
      const card = state.cards[pick];
      if (card.type === "operation") {
        log(state, `Install from HQ/Archives — operations are not installable.`);
        return { ok: true };
      }
      // Remove from current zone
      state.corp.hand = state.corp.hand.filter((id) => id !== pick);
      state.corp.discard = state.corp.discard.filter((id) => id !== pick);
      // New remote always differs from source server (Ablative excludeSourceServer).
      const remoteNum = state.nextRemoteNumber++;
      const sid = `remote-${remoteNum}` as import("../state/types.js").ServerId;
      state.servers[sid] = { id: sid, kind: "remote", ice: [], root: [] };
      if (card.type === "ice") {
        state.servers[sid].ice.push(pick);
        card.zone = `server:${sid}:ice`;
      } else {
        state.servers[sid].root.push(pick);
        card.zone = `server:${sid}:root`;
      }
      card.rezzed = false;
      card.faceup = false;
      log(
        state,
        `Install ${card.title} from HQ/Archives onto ${sid} (ignoring costs).`,
      );
      if (fromArchives && card.onInstallFromNonHq) {
        const r = evalEffect(
          { state, sourceId: pick },
          card.onInstallFromNonHq,
        );
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "may_install_facedown_from_archives": {
      const installable = state.corp.discard.filter((id) => {
        const t = state.cards[id].type;
        return (
          t === "agenda" ||
          t === "asset" ||
          t === "ice" ||
          t === "upgrade"
        );
      });
      if (installable.length === 0) {
        log(state, `Install facedown from Archives — no eligible card.`);
        return { ok: true };
      }
      if (installable.length > 1) {
        state.pendingChoice = {
          sourceId,
          chooser: "corp",
          options: installable.map((id) => ({
            id: `arch-install:${id}`,
            label: `Install ${state.cards[id].title} facedown`,
            effect: {
              op: "do" as const,
              action: {
                kind: "may_install_facedown_from_archives" as const,
                // handled below via single-card path after filtering
              },
            },
          })),
        };
        // Store pick via option evaluation: simplify — auto first for multi
        // by collapsing to first (deterministic v0). Clear choice.
        state.pendingChoice = null;
      }
      const pick = installable[0]!;
      state.corp.discard = state.corp.discard.filter((id) => id !== pick);
      const card = state.cards[pick]!;
      const remoteNum = state.nextRemoteNumber++;
      const sid = `remote-${remoteNum}` as import("../state/types.js").ServerId;
      state.servers[sid] = { id: sid, kind: "remote", ice: [], root: [] };
      if (card.type === "ice") {
        state.servers[sid].ice.push(pick);
        card.zone = `server:${sid}:ice`;
      } else {
        state.servers[sid].root.push(pick);
        card.zone = `server:${sid}:root`;
      }
      card.rezzed = false;
      card.faceup = false;
      log(
        state,
        `Install ${card.title} facedown from Archives onto ${sid}.`,
      );
      return { ok: true };
    }
    case "return_installed_corp_to_hq": {
      const moveToHq = (pick: string): { ok: true } => {
        const card = state.cards[pick];
        if (!card) {
          log(state, `Return to HQ — card missing.`);
          return { ok: true };
        }
        removeCardFromCurrentZone(state, pick);
        state.corp.hand.push(pick);
        card.zone = "corp:hq";
        card.faceup = false;
        card.rezzed = false;
        card.advancementTokens = undefined;
        log(state, `Add ${card.title} to HQ.`);
        return { ok: true };
      };
      if (action.cardId) {
        return moveToHq(action.cardId);
      }
      const installed: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          if (action.unrezzedOnly && state.cards[id]?.rezzed) continue;
          installed.push(id);
        }
      }
      if (installed.length === 0) {
        log(
          state,
          action.unrezzedOnly
            ? `Return installed Corp to HQ — no unrezzed cards.`
            : `Return installed Corp to HQ — none installed.`,
        );
        return { ok: true };
      }
      if (action.pick === "choose" && installed.length > 1) {
        state.pendingChoice = {
          sourceId,
          chooser: "runner",
          options: installed.map((id) => ({
            id: `corp-hq:${id}`,
            label: `Add ${state.cards[id].title} to HQ`,
            effect: {
              op: "do" as const,
              action: {
                kind: "return_installed_corp_to_hq" as const,
                pick: "first" as const,
                cardId: id,
                ...(action.unrezzedOnly ? { unrezzedOnly: true } : {}),
              },
            },
          })),
        };
        log(
          state,
          action.unrezzedOnly
            ? `Choose an unrezzed installed Corp card to add to HQ.`
            : `Choose an installed Corp card to add to HQ.`,
        );
        return { ok: true };
      }
      return moveToHq(installed[0]!);
    }
    case "may_trash_from_grip_to_draw": {
      const grip = [...state.runner.hand];
      if (grip.length === 0) {
        log(state, `May trash from grip to draw — grip empty.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          ...grip.map((id) => ({
            id: `trash-draw:${id}`,
            label: `Trash ${state.cards[id]!.title} to draw 1`,
            effect: {
              op: "do" as const,
              action: {
                kind: "trash_grip_card_draw" as const,
                cardId: id,
              },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "runner" as const,
                amount: 0,
              },
            },
          },
        ],
      };
      log(state, `May trash 1 from grip to draw 1.`);
      return { ok: true };
    }
    case "trash_grip_card_draw": {
      const id = action.cardId;
      if (!state.runner.hand.includes(id)) {
        log(state, `Trash grip to draw — card not in grip.`);
        return { ok: true };
      }
      moveRunnerCardToHeap(state, id);
      const drawn = drawCards(state, "runner", 1);
      log(
        state,
        `Trash ${state.cards[id]!.title} from grip; draw ${drawn}.`,
      );
      return { ok: true };
    }
    case "trash_n_from_grip": {
      const n = Math.max(0, action.amount ?? 0);
      for (let i = 0; i < n; i++) {
        const id = state.runner.hand[state.runner.hand.length - 1];
        if (!id) {
          return {
            ok: false,
            error: `Cannot trash ${n} from grip — only ${i} available.`,
            cites: [CR.playEvent],
          };
        }
        moveRunnerCardToHeap(state, id);
        log(state, `Trash ${state.cards[id]!.title} from grip as cost.`);
      }
      return { ok: true };
    }
    case "trash_up_to_grip_cards_gain_credits_each": {
      const remaining = Math.max(0, action.remaining);
      const typeFilter = action.types?.length ? new Set(action.types) : null;
      const candidates = state.runner.hand.filter((id) => {
        if (remaining <= 0) return false;
        const c = state.cards[id];
        if (!c) return false;
        if (!typeFilter) return true;
        return typeFilter.has(c.type as "program" | "hardware" | "resource");
      });
      if (candidates.length === 0) {
        log(
          state,
          `${source.title} — trash up to grip cards: none matching/remaining.`,
        );
        return { ok: true };
      }
      const side = source.side;
      const options: Array<{ id: string; label: string; effect: Effect }> =
        candidates.map((id) => {
          const title = state.cards[id]!.title;
          return {
            id: `trash-grip:${id}`,
            label: `Trash ${title} (+${action.per}¢)`,
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: { kind: "trash_grip_card" as const, cardId: id },
                },
                {
                  op: "do" as const,
                  action: {
                    kind: "gain_credits" as const,
                    side,
                    amount: action.per,
                  },
                },
                {
                  op: "do" as const,
                  action: {
                    kind: "trash_up_to_grip_cards_gain_credits_each" as const,
                    remaining: remaining - 1,
                    per: action.per,
                    ...(action.types ? { types: action.types } : {}),
                  },
                },
              ],
            },
          };
        });
      options.push({
        id: "done",
        label: "Done",
        effect: { op: "do", action: { kind: "gain_credits", side, amount: 0 } },
      });
      state.pendingChoice = { sourceId, chooser: side, options };
      log(
        state,
        `${source.title} — trash up to ${remaining} matching grip card(s) for ${action.per}¢ each (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "may_play_event_from_heap": {
      const candidates = state.runner.discard.filter((id) => {
        const c = state.cards[id];
        return c?.type === "event" && state.runner.credits >= (c.playCost ?? 0);
      });
      if (candidates.length === 0) {
        log(state, `${source.title} — may play event from heap: none affordable.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          ...candidates.map((id) => {
            const c = state.cards[id]!;
            return {
              id: `play-heap:${id}`,
              label: `Play ${c.title} (${c.playCost ?? 0}¢)`,
              effect: {
                op: "do" as const,
                action: { kind: "play_heap_event_card" as const, cardId: id },
              },
            };
          }),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: { kind: "gain_credits" as const, side: "runner" as const, amount: 0 },
            },
          },
        ],
      };
      log(state, `${source.title} — may play an event from the heap.`);
      return { ok: true };
    }
    case "play_heap_event_card": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || card.type !== "event" || !state.runner.discard.includes(cardId)) {
        log(state, `play_heap_event_card — ${cardId} not in heap.`);
        return { ok: true };
      }
      const cost = card.playCost ?? 0;
      if (state.runner.credits < cost) {
        return {
          ok: false,
          error: "Insufficient credits to play event from heap.",
          cites: [CR.playEvent],
        };
      }
      state.runner.credits -= cost;
      log(state, `Runner plays ${card.title} from heap for ${cost}¢ (CR ${CR.playEvent.number}).`);
      if (card.onPlay) {
        const r = evalEffect({ state, sourceId: cardId }, card.onPlay);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "may_trash_one_from_grip": {
      const grip = [...state.runner.hand];
      if (grip.length === 0) {
        log(state, `May trash from grip — grip empty.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          ...grip.map((id) => ({
            id: `trash-grip:${id}`,
            label: `Trash ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: { kind: "trash_grip_card" as const, cardId: id },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "corp" as const,
                amount: 0,
              },
            },
          },
        ],
      };
      log(state, `May trash 1 card from the grip.`);
      return { ok: true };
    }
    case "trash_grip_card": {
      const id = action.cardId;
      if (!state.runner.hand.includes(id)) {
        log(state, `Trash grip — card not in grip.`);
        return { ok: true };
      }
      moveRunnerCardToHeap(state, id);
      log(state, `Trash ${state.cards[id]!.title} from grip.`);
      return { ok: true };
    }
    case "may_trash_hardware_from_grip_place_hosted_credits": {
      const hardware = state.runner.hand.filter(
        (id) => state.cards[id]?.type === "hardware",
      );
      if (hardware.length === 0) {
        log(
          state,
          `${source.title} — may trash hardware from grip (none in grip).`,
        );
        return { ok: true };
      }
      const amount = action.amount;
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          ...hardware.map((id) => ({
            id: `trash-hw-grip:${id}`,
            label: `Trash ${state.cards[id]!.title}; place ${amount}¢ on ${source.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "trash_grip_hardware_place_hosted_credits" as const,
                cardId: id,
                amount,
              },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "runner" as const,
                amount: 0,
              },
            },
          },
        ],
      };
      log(
        state,
        `${source.title} — may trash 1 hardware from grip to place ${amount}¢.`,
      );
      return { ok: true };
    }
    case "trash_grip_hardware_place_hosted_credits": {
      const id = action.cardId;
      const card = state.cards[id];
      if (!state.runner.hand.includes(id) || card?.type !== "hardware") {
        log(state, `Trash grip hardware — not hardware in grip.`);
        return { ok: true };
      }
      moveRunnerCardToHeap(state, id);
      source.hostedCredits = (source.hostedCredits ?? 0) + action.amount;
      log(
        state,
        `Trash ${card.title} from grip; place ${action.amount}¢ on ${source.title} → ${source.hostedCredits}¢.`,
      );
      return { ok: true };
    }
    case "spend_power_for_bonus_access": {
      const have = source.powerCounters ?? 0;
      const n = Math.min(action.amount, have);
      if (n <= 0 || !state.run) return { ok: true };
      source.powerCounters = have - n;
      state.run.bonusAccess = (state.run.bonusAccess ?? 0) + n;
      log(
        state,
        `${source.title} — spend ${n} power → +${n} bonus access.`,
      );
      return { ok: true };
    }
    case "reveal_top_stack_to_grip_place_hosted_credits": {
      const top = state.runner.deck[0];
      if (!top) {
        log(state, `Reveal top of stack — empty.`);
        return { ok: true };
      }
      state.runner.deck.shift();
      const card = state.cards[top]!;
      const cost =
        card.playCost ?? card.installCost ?? 0;
      source.hostedCredits = (source.hostedCredits ?? 0) + cost;
      state.runner.hand.push(top);
      card.zone = "runner:grip";
      card.faceup = true;
      log(
        state,
        `Reveal ${card.title} — place ${cost}¢ on ${source.title}; add to grip.`,
      );
      return { ok: true };
    }
    case "forbid_runner_break_on_source": {
      source.cannotBreakWithRunnerCardAbilities = true;
      if (state.run?.encounter?.iceId === sourceId) {
        state.run.encounter.forbidRunnerBreakThisEncounter = true;
      }
      log(
        state,
        `${source.title} — Runner cannot break its printed subroutines with card abilities this encounter.`,
      );
      return { ok: true };
    }
    case "may_trash_hq_then": {
      const hq = [...state.corp.hand];
      if (hq.length === 0) {
        log(state, `${source.title} — may trash HQ: HQ empty.`);
        return { ok: true };
      }
      const chooseOpts: Array<{ id: string; label: string; effect: Effect }> =
        hq.map((id) => ({
          id: `trash-hq:${id}`,
          label: `Trash ${state.cards[id]!.title} from HQ`,
          effect: {
            op: "seq" as const,
            effects: [
              {
                op: "do" as const,
                action: { kind: "trash_hq_card" as const, cardId: id },
              },
              structuredClone(action.then),
            ],
          },
        }));
      chooseOpts.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do" as const,
          action: {
            kind: "gain_credits" as const,
            side: "corp" as const,
            amount: 0,
          },
        },
      });
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: chooseOpts,
      };
      log(state, `${source.title} — may trash 1 card from HQ.`);
      return { ok: true };
    }
    case "forbid_installed_runner_break_for_run": {
      const cands = [...state.runner.rig];
      if (cands.length === 0) {
        log(state, `${source.title} — no installed Runner cards to forbid.`);
        return { ok: true };
      }
      if (cands.length === 1) {
        const id = cands[0]!;
        state.cards[id]!.cannotBreakSubsThisRun = true;
        log(
          state,
          `${state.cards[id]!.title} — abilities cannot break subs this run.`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: cands.map((id) => ({
          id: `forbid-break:${id}`,
          label: `Forbid break with ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "forbid_runner_card_break_for_run" as const,
              cardId: id,
            },
          },
        })),
      };
      log(state, `${source.title} — choose installed Runner card to forbid break.`);
      return { ok: true };
    }
    case "forbid_runner_card_break_for_run": {
      const card = state.cards[action.cardId];
      if (!card || !state.runner.rig.includes(action.cardId)) {
        log(state, `Forbid break — card not installed.`);
        return { ok: true };
      }
      card.cannotBreakSubsThisRun = true;
      log(
        state,
        `${card.title} — abilities cannot break subroutines for the remainder of the run.`,
      );
      return { ok: true };
    }
    case "may_give_runner_credits_then": {
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "give-credits",
            label: `Runner gains ${action.amount}¢`,
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: {
                    kind: "gain_credits" as const,
                    side: "runner" as const,
                    amount: action.amount,
                  },
                },
                structuredClone(action.then),
              ],
            },
          },
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "corp" as const,
                amount: 0,
              },
            },
          },
        ],
      };
      log(
        state,
        `${source.title} — may have the Runner gain ${action.amount}¢.`,
      );
      return { ok: true };
    }
    case "blank_installed_resource_until_corp_turn_end": {
      const resources = state.runner.rig.filter(
        (id) => state.cards[id]?.type === "resource",
      );
      if (resources.length === 0) {
        log(state, `${source.title} — no installed resource to blank.`);
        return { ok: true };
      }
      if (resources.length === 1) {
        const id = resources[0]!;
        const card = state.cards[id]!;
        card.abilitiesBlanked = true;
        card.abilitiesBlankedCorpTurnsRemaining = 1;
        log(
          state,
          `${card.title} — abilities blanked until Corp turn ends.`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: resources.map((id) => ({
          id: `blank-res:${id}`,
          label: `Blank ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "blank_resource_until_corp_turn_end" as const,
              cardId: id,
            },
          },
        })),
      };
      log(state, `${source.title} — choose installed resource to blank.`);
      return { ok: true };
    }
    case "blank_resource_until_corp_turn_end": {
      const card = state.cards[action.cardId];
      if (!card || card.type !== "resource" || !state.runner.rig.includes(action.cardId)) {
        log(state, `Blank resource — not an installed resource.`);
        return { ok: true };
      }
      card.abilitiesBlanked = true;
      card.abilitiesBlankedCorpTurnsRemaining = 1;
      log(
        state,
        `${card.title} — abilities blanked until Corp turn ends.`,
      );
      return { ok: true };
    }
    case "limit_printed_breaks_on_source_for_run": {
      source.maxPrintedSubsBreakablePerEncounter = action.max;
      log(
        state,
        `${source.title} — Runner cannot break more than ${action.max} printed subroutine(s) per encounter this run.`,
      );
      return { ok: true };
    }
    case "install_ice_inward_free": {
      // Brân: may install ice from HQ protecting this server, inward of source.
      if (!state.run || source.type !== "ice") {
        log(state, `Install ice inward — not during encounter of ice.`);
        return { ok: true };
      }
      const iceFromHq = state.corp.hand.find(
        (id) => state.cards[id].type === "ice",
      );
      if (!iceFromHq) {
        log(state, `Install ice inward — no ice in HQ.`);
        return { ok: true };
      }
      const serverId = state.run.attackedServerId;
      const server = state.servers[serverId];
      const pos = server.ice.indexOf(sourceId);
      if (pos < 0) {
        log(state, `Install ice inward — source not protecting attacked server.`);
        return { ok: true };
      }
      state.corp.hand = state.corp.hand.filter((id) => id !== iceFromHq);
      const card = state.cards[iceFromHq];
      // Insert immediately inward (higher index) of source.
      server.ice.splice(pos + 1, 0, iceFromHq);
      card.zone = `server:${serverId}:ice`;
      card.rezzed = false;
      card.faceup = false;
      card.advancementTokens = card.advancementTokens ?? 0;
      log(
        state,
        `Install ${card.title} inward of ${source.title} on ${serverId} (ignoring costs).`,
      );
      return { ok: true };
    }
    case "howler_install_rez_bioroid_inward": {
      if (!state.run || source.type !== "ice") {
        log(state, `Howler — not during encounter of ice.`);
        return { ok: true };
      }
      const candidates = [...state.corp.hand, ...state.corp.discard].filter(
        (id) => {
          const c = state.cards[id];
          return (
            c && c.type === "ice" && (c.subtypes ?? []).includes("bioroid")
          );
        },
      );
      if (candidates.length === 0) {
        log(state, `Howler — no bioroid ice in HQ/Archives.`);
        return { ok: true };
      }
      const serverId = state.run.attackedServerId;
      const server = state.servers[serverId];
      const pos = server.ice.indexOf(sourceId);
      if (pos < 0) {
        log(state, `Howler — source not protecting attacked server.`);
        return { ok: true };
      }
      if (candidates.length === 1) {
        return applyPrimitive(ctx, {
          kind: "howler_install_rez_chosen",
          cardId: candidates[0]!,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: candidates.map((id) => ({
          id: `howler:${id}`,
          label: `Install and rez ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "howler_install_rez_chosen" as const,
              cardId: id,
            },
          },
        })),
      };
      log(state, `Howler — choose a bioroid ice to install and rez.`);
      return { ok: true };
    }
    case "howler_install_rez_chosen": {
      if (!state.run || source.type !== "ice") return { ok: true };
      const id = action.cardId;
      const card = state.cards[id];
      if (!card) return { ok: true };
      const serverId = state.run.attackedServerId;
      const server = state.servers[serverId];
      const pos = server.ice.indexOf(sourceId);
      if (pos < 0) return { ok: true };
      const fromHq = state.corp.hand.includes(id);
      if (fromHq) {
        state.corp.hand = state.corp.hand.filter((cid) => cid !== id);
      } else {
        state.corp.discard = state.corp.discard.filter((cid) => cid !== id);
      }
      server.ice.splice(pos + 1, 0, id);
      card.zone = `server:${serverId}:ice`;
      card.rezzed = true;
      card.faceup = true;
      card.advancementTokens = card.advancementTokens ?? 0;
      state.run.howlerId = sourceId;
      state.run.howlerInstalledIceId = id;
      log(
        state,
        `Install and rez ${card.title} inward of ${source.title} on ${serverId}, ignoring all costs (CR 10.1).`,
      );
      return { ok: true };
    }
    case "awakening_center_rez_hosted": {
      const ice = state.cards[action.cardId];
      if (
        !ice ||
        ice.type !== "ice" ||
        ice.hostId !== sourceId ||
        !(source.hostedCardIds ?? []).includes(action.cardId)
      ) {
        log(state, `${source.title} — invalid hosted ice.`);
        return { ok: true };
      }
      if (ice.rezzed) {
        log(state, `${ice.title} already rezzed.`);
        return { ok: true };
      }
      if (!state.run) {
        log(state, `${source.title} — no run.`);
        return { ok: true };
      }
      const discount = 7;
      const pay = Math.max(0, (ice.rezCost ?? 0) - discount);
      if (state.corp.credits < pay) {
        log(state, `${source.title} — cannot afford to rez ${ice.title}.`);
        return { ok: true };
      }
      state.corp.credits -= pay;
      ice.rezzed = true;
      ice.faceup = true;
      log(
        state,
        `Rez ${ice.title} for ${pay}¢ (${source.title}, −${discount}¢).`,
      );
      if (ice.onRez) {
        const r = evalEffect({ state, sourceId: action.cardId }, ice.onRez);
        if (!r.ok) return r;
      }
      fireHostRezStateTriggers(state, action.cardId, "rez");
      fireIceRezDuringRunHooks(state, action.cardId);
      state.run.awakeningCenterHostedIceIds = [
        ...(state.run.awakeningCenterHostedIceIds ?? []),
        action.cardId,
      ];
      // Force the Runner to encounter this ice (Konjin-class nested divert;
      // consumed by chooseOption's "Konjin-class" block in apply.ts).
      state.run.forceEncounterIceId = action.cardId;
      state.run.reencounterIceId = action.cardId;
      state.run.resumeEncounterIceId = sourceId;
      log(
        state,
        `Runner will encounter ${ice.title} (${source.title}); trashed when this run ends.`,
      );
      return { ok: true };
    }
    case "prevent_pending_subroutine_break": {
      const pending = state.pendingSubroutineBreak;
      if (!pending) {
        log(state, `${source.title} — no pending subroutine break to prevent.`);
        return { ok: true };
      }
      pending.prevented = true;
      log(
        state,
        `${source.title} — prevent 1 subroutine from being broken.`,
      );
      return { ok: true };
    }
    case "break_host_subroutine": {
      const hostId = source.hostId;
      const enc = state.run?.encounter;
      if (!hostId || !enc || enc.iceId !== hostId) {
        log(state, `Break host subroutine — not encountering host.`);
        return { ok: true };
      }
      if (
        action.requireSubtype &&
        !effectiveIceSubtypes(state, hostId).includes(action.requireSubtype)
      ) {
        log(
          state,
          `Break host subroutine — host is not ${action.requireSubtype}.`,
        );
        return { ok: true };
      }
      const maxSubs = Math.max(1, action.maxSubs ?? 1);
      let broken = 0;
      for (let n = 0; n < maxSubs; n++) {
        const idx = enc.broken.findIndex((b) => !b);
        if (idx < 0) break;
        enc.broken[idx] = true;
        broken += 1;
        const sub = state.cards[hostId].subroutines?.[idx];
        log(
          state,
          `${source.title} breaks "${sub?.text ?? `sub ${idx}`}" on host.`,
        );
      }
      if (broken === 0) {
        log(state, `Break host subroutine — no unbroken subs.`);
        return { ok: true };
      }
      if (!state.run!.breakersThatBroke) state.run!.breakersThatBroke = [];
      if (!state.run!.breakersThatBroke.includes(sourceId)) {
        state.run!.breakersThatBroke.push(sourceId);
      }
      maybeFireFluxFirstBreakCharge(state);
      return { ok: true };
    }
    case "break_encounter_subroutine": {
      if (state.run?.encounter) {
        const ice = state.cards[state.run.encounter.iceId];
        if (ice?.cannotBreakWithRunnerCardAbilities) {
          return {
            ok: false,
            error: "Runner card abilities cannot break subroutines on this ice (Trieste).",
            cites: [CR.encounterBreakPaw],
          };
        }
        if (
          ice?.cannotBreakExceptSubtype &&
          !(source.subtypes ?? []).includes(ice.cannotBreakExceptSubtype)
        ) {
          return {
            ok: false,
            error: `Subroutines on ${ice.title} can only be broken by a ${ice.cannotBreakExceptSubtype}.`,
            cites: [CR.encounterBreakPaw],
          };
        }
        if (
          cannotBreakExceptIcebreakerActive(state) &&
          !cardHasIcebreakerSubtype(source)
        ) {
          return {
            ok: false,
            error:
              "Cannot break subroutines with a non-icebreaker card while NEXT Activation Command is active.",
            cites: [CR.encounterBreakPaw, CR.lockdownOperation],
          };
        }
      }

      const enc = state.run?.encounter;
      if (!enc) {
        log(state, `Break encounter subroutine — no encounter.`);
        return { ok: true };
      }
      const ice = state.cards[enc.iceId];
      if (
        action.requireSubtype &&
        !effectiveIceSubtypes(state, enc.iceId).includes(action.requireSubtype)
      ) {
        log(
          state,
          `Break encounter subroutine — ice is not ${action.requireSubtype}.`,
        );
        return { ok: true };
      }
      if (
        typeof action.requireMinStrength === "number" &&
        (ice?.strength ?? 0) < action.requireMinStrength
      ) {
        log(
          state,
          `Break encounter subroutine — ice strength ${ice?.strength ?? 0} < ${action.requireMinStrength}.`,
        );
        return { ok: true };
      }
      const maxSubs = Math.max(1, action.maxSubs ?? 1);
      let broken = 0;
      for (let n = 0; n < maxSubs; n++) {
        const idx = enc.broken.findIndex((b) => !b);
        if (idx < 0) break;
        if (
          typeof action.payCreditsPerBrokenSub === "number" &&
          action.payCreditsPerBrokenSub > 0
        ) {
          const need = action.payCreditsPerBrokenSub;
          if (state.runner.credits < need) break;
          state.runner.credits -= need;
          log(
            state,
            `${source.title} pays ${need}¢ to break a subroutine → ${state.runner.credits}¢.`,
          );
        }
        enc.broken[idx] = true;
        broken += 1;
        const sub = ice.subroutines?.[idx];
        log(
          state,
          `${source.title} breaks "${sub?.text ?? `sub ${idx}`}" on ${ice.title}.`,
        );
      }
      if (broken === 0) {
        log(state, `Break encounter subroutine — no unbroken subs.`);
        return { ok: true };
      }
      if (!state.run!.breakersThatBroke) state.run!.breakersThatBroke = [];
      if (!state.run!.breakersThatBroke.includes(sourceId)) {
        state.run!.breakersThatBroke.push(sourceId);
      }
      if ((source.subtypes ?? []).includes("decoder")) {
        enc.brokePrintedSubWithDecoder = true;
      }
      maybeFireFluxFirstBreakCharge(state);
      // Tungsten Tailor: first break this turn on ice with strength ≤ N → +1¢.
      if (!state.turn.tungstenBreakCreditUsedThisTurn) {
        const iceStr = iceStrength(state, enc.iceId);
        for (const rid of state.runner.rig) {
          const rc = state.cards[rid];
          if (rc?.gainCreditOnBreakIceStrengthLteOncePerTurn === undefined) {
            continue;
          }
          if (iceStr <= rc.gainCreditOnBreakIceStrengthLteOncePerTurn) {
            state.turn.tungstenBreakCreditUsedThisTurn = true;
            state.runner.credits += 1;
            log(
              state,
              `${rc.title} — gain 1¢ (break on ice strength ${iceStr}).`,
            );
            break;
          }
        }
      }
      if (enc.broken.every(Boolean) && source.onFullyBreak) {
        const r = evalEffect({ state, sourceId }, source.onFullyBreak);
        if (!r.ok) return r;
        if (state.pendingChoice) return { ok: true };
      }
      if (enc.broken.every(Boolean)) {
        const iceCard = state.cards[enc.iceId];
        if (iceCard?.onFullyBreak) {
          const r = evalEffect(
            { state, sourceId: enc.iceId },
            iceCard.onFullyBreak,
          );
          if (!r.ok) return r;
          if (state.pendingChoice) return { ok: true };
        }
      }
      if (action.thenIfBroke) {
        const thenR = evalEffect({ state, sourceId }, action.thenIfBroke);
        if (!thenR.ok) return thenR;
        if (state.pendingChoice) return { ok: true };
      }
      fireAfterBreakSubroutineHooks(state, sourceId);
      return { ok: true };
    }
    case "offer_jack_out": {
      if (state.run && !state.run.cannotJackOut) {
        state.run.pendingJackOutOffer = true;
        state.pendingChoice = {
          sourceId,
          chooser: "runner",
          options: [
            {
              id: "jack_out",
              label: "Jack out",
              effect: { op: "do", action: { kind: "end_the_run" } },
            },
            {
              id: "continue",
              label: "Continue the run",
              effect: {
                op: "do",
                action: { kind: "gain_credits", side: "runner", amount: 0 },
              },
            },
          ],
        };
        // end_the_run via jack out should mark unsuccessful — handle in choose
        log(state, `Runner may jack out (Karunā).`);
      }
      return { ok: true };
    }
    case "search_stack_icebreaker": {
      const matches = state.runner.deck.filter((id) => {
        const c = state.cards[id];
        return (
          Boolean(c.breaker) || (c.subtypes ?? []).includes("icebreaker")
        );
      });
      if (matches.length === 0) {
        log(state, `Search stack for icebreaker — none found.`);
        return { ok: true };
      }
      // Auto-select first match (deterministic). Optionally install.
      const id = matches[0]!;
      state.runner.deck = state.runner.deck.filter((x) => x !== id);
      state.runner.hand.push(id);
      state.cards[id].zone = "runner:grip";
      state.cards[id].faceup = true;
      state.runner.deck.reverse();
      log(
        state,
        matches.length === 1
          ? `Search stack — add ${state.cards[id].title} to grip.`
          : `Search stack — add ${state.cards[id].title} to grip (${matches.length} matches; first selected).`,
      );
      if (
        action.mayInstallIfSuccessfulRunThisTurn &&
        state.turn.successfulRunThisTurn
      ) {
        const card = state.cards[id];
        const cost = card.installCost;
        if (state.runner.credits >= cost) {
          state.runner.credits -= cost;
          state.runner.hand = state.runner.hand.filter((x) => x !== id);
          state.runner.rig.push(id);
          card.zone = "runner:rig";
          log(state, `Install ${card.title} from Mutual Favor (${cost}¢).`);
          if (card.onInstall) {
            const r = evalEffect({ state, sourceId: id }, card.onInstall);
            if (!r.ok) return r;
          }
        }
      }
      return { ok: true };
    }
    case "search_rd_non_agenda": {
      const matches = state.corp.deck.filter(
        (id) => state.cards[id].type !== "agenda",
      );
      if (matches.length === 0) {
        log(state, `Search R&D for non-agenda — none found.`);
        return { ok: true };
      }
      const id = matches[0]!;
      state.corp.deck = state.corp.deck.filter((x) => x !== id);
      state.corp.hand.push(id);
      state.cards[id].zone = "corp:hq";
      state.cards[id].faceup = false;
      state.corp.deck.reverse();
      log(
        state,
        `Search R&D — add ${state.cards[id].title} to HQ (non-agenda).`,
      );
      return { ok: true };
    }
    case "search_rd_to_hq": {
      const n = Math.min(action.amount, state.corp.deck.length);
      for (let i = 0; i < n; i++) {
        const id = state.corp.deck[0]!;
        // Prefer first card; for multi-search take sequential tops after shuffle sense:
        // Deterministic: take first N distinct from current deck order.
        void id;
      }
      const taken: string[] = [];
      for (let i = 0; i < n; i++) {
        const id = state.corp.deck.shift();
        if (!id) break;
        taken.push(id);
        state.corp.hand.push(id);
        state.cards[id].zone = "corp:hq";
        state.cards[id].faceup = false;
      }
      state.corp.deck.reverse();
      log(
        state,
        `Search R&D — add ${taken.length} card(s) to HQ (${taken.map((id) => state.cards[id].title).join(", ") || "none"}).`,
      );
      return { ok: true };
    }
    case "swap_two_ice": {
      const allIce: string[] = [];
      for (const server of Object.values(state.servers)) {
        allIce.push(...server.ice);
      }
      if (allIce.length < 2) {
        log(state, `Swap ice — fewer than 2 ice installed.`);
        return { ok: true };
      }
      const options: Array<{
        id: string;
        label: string;
        effect: Effect;
      }> = [
        {
          id: "decline",
          label: "Decline to swap ice",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "runner", amount: 0 },
          },
        },
      ];
      // Offer swap of first with each other ice (bounded).
      const a = allIce[0]!;
      for (let i = 1; i < allIce.length; i++) {
        const b = allIce[i]!;
        options.push({
          id: `swap-${a}-${b}`,
          label: `Swap ${state.cards[a].title} with ${state.cards[b].title}`,
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "runner", amount: 0 },
          },
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options,
      };
      // Stash swap pairs: handled in chooseOption by parsing option id.
      log(state, `Tāo Salonga — may swap two ice.`);
      return { ok: true };
    }
    case "rez_ice_ignoring_costs": {
      const unrezzed: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (!state.cards[id].rezzed) unrezzed.push(id);
        }
      }
      if (unrezzed.length === 0) {
        log(state, `Rez ice ignoring costs — no unrezzed ice.`);
        return { ok: true };
      }
      const options = [
        {
          id: "decline",
          label: "Decline",
          effect: {
            op: "do" as const,
            action: {
              kind: "gain_credits" as const,
              side: "corp" as const,
              amount: 0,
            },
          },
        },
        ...unrezzed.map((id) => ({
          id,
          label: `Rez ${state.cards[id].title} (ignore costs)`,
          effect: {
            op: "do" as const,
            action: {
              kind: "gain_credits" as const,
              side: "corp" as const,
              amount: 0,
            },
          },
        })),
      ];
      state.pendingChoice = {
        sourceId,
        chooser: source.side === "runner" ? "corp" : "corp",
        options,
      };
      log(state, `Send a Message — may rez ice ignoring all costs.`);
      return { ok: true };
    }
    case "may_install_from_grip": {
      const discount = action.discount ?? 0;
      const typeFilter =
        action.types && action.types.length > 0
          ? new Set(action.types)
          : null;
      const subtypeFilter = action.subtype?.toLowerCase() ?? null;
      const installable = state.runner.hand.filter((id) => {
        const c = state.cards[id];
        if (!["program", "hardware", "resource"].includes(c.type)) {
          return false;
        }
        if (typeFilter && !typeFilter.has(c.type as "program" | "hardware" | "resource")) {
          return false;
        }
        if (
          subtypeFilter &&
          !(c.subtypes ?? []).some((s) => s.toLowerCase() === subtypeFilter)
        ) {
          return false;
        }
        if (c.installOnIce || (c.subtypes ?? []).includes("trojan")) {
          return false;
        }
        if (c.type === "program") {
          const need = effectiveMemoryCost(state, id);
          if (usedMemory(state) + need > memoryLimit(state)) return false;
        }
        const cost = gripInstallCostAfterDiscount(state, c, discount);
        return creditsAvailableForInstall(state, "runner") >= cost;
      });
      if (installable.length === 0) {
        log(state, `May install from grip — no installable affordable cards.`);
        return { ok: true };
      }
      const options = [
        {
          id: "decline",
          label: "Decline to install",
          effect: {
            op: "do" as const,
            action: {
              kind: "gain_credits" as const,
              side: "runner" as const,
              amount: 0,
            },
          },
        },
        ...installable.map((id) => {
          const c = state.cards[id];
          const cost = gripInstallCostAfterDiscount(state, c, discount);
          return {
            id,
            label: `Install ${c.title} for ${cost}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_grip_card" as const,
                cardId: id,
                discount,
              },
            },
          };
        }),
      ];
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options,
      };
      log(state, `May install a card from grip.`);
      return { ok: true };
    }
    case "draw": {
      const side = resolveSide(ctx, action.side);
      if (side === "runner" && state.turn.ccRunnerCannotDraw) {
        log(state, `Runner cannot draw (Lockdown).`);
        return { ok: true };
      }
      const n = drawCards(state, side, action.amount);
      log(
        state,
        `${side} draws ${n} (requested ${action.amount}) (CR ${CR.drawing.number}).`,
      );
      return { ok: true };
    }
    case "draw_up_to": {
      const side = resolveSide(ctx, action.side);
      const p = side === "corp" ? state.corp : state.runner;
      const want = Math.max(0, action.amount);
      const n = drawCards(state, side, want);
      log(
        state,
        `${side} draws up to ${want} (drew ${n}; hand ${p.hand.length}) (CR ${CR.drawing.number}).`,
      );
      return { ok: true };
    }
    case "may_add_hq_agenda_ap_lte_to_score": {
      const maxAp = Math.max(0, action.maxAgendaPoints);
      const candidates = state.corp.hand.filter((id) => {
        const c = state.cards[id];
        return (
          c?.type === "agenda" && (c.agendaPoints ?? 0) <= maxAp
        );
      });
      if (candidates.length === 0) {
        log(
          state,
          `${source.title} — no HQ agenda with ≤${maxAp} AP to add to score.`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...candidates.map((id) => ({
            id: `score-hq:${id}`,
            label: `Add ${state.cards[id]!.title} to score area`,
            effect: {
              op: "do" as const,
              action: {
                kind: "add_hq_agenda_to_score" as const,
                cardId: id,
              },
            },
          })),
        ],
      };
      log(
        state,
        `${source.title} — may add an HQ agenda (≤${maxAp} AP) to the score area.`,
      );
      return { ok: true };
    }
    case "add_hq_agenda_to_score": {
      const card = state.cards[action.cardId];
      if (!card || card.type !== "agenda" || !state.corp.hand.includes(action.cardId)) {
        log(state, `Add HQ agenda to score — card not an HQ agenda.`);
        return { ok: true };
      }
      state.corp.hand = state.corp.hand.filter((id) => id !== action.cardId);
      state.corp.score.push(action.cardId);
      card.zone = "corp:score";
      card.faceup = true;
      card.rezzed = true;
      state.turn.agendaPointsScoredThisTurn += card.agendaPoints ?? 0;
      log(
        state,
        `Add ${card.title} from HQ to Corp score area (${card.agendaPoints ?? 0} AP).`,
      );
      checkWinConditions(state);
      return { ok: true };
    }
    case "may_turn_facedown_archives_faceup_then": {
      const facedown = state.corp.discard.filter(
        (id) => state.cards[id] && !state.cards[id]!.faceup,
      );
      if (facedown.length === 0) {
        log(state, `${source.title} — no facedown Archives cards.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...facedown.map((id) => ({
            id: `faceup:${id}`,
            label: `Turn ${state.cards[id]!.title} faceup`,
            effect: {
              op: "do" as const,
              action: {
                kind: "turn_archives_card_faceup" as const,
                cardId: id,
                then: structuredClone(action.then),
              },
            },
          })),
        ],
      };
      log(state, `${source.title} — may turn a facedown Archives card faceup.`);
      return { ok: true };
    }
    case "turn_archives_card_faceup": {
      const card = state.cards[action.cardId];
      if (!card || !state.corp.discard.includes(action.cardId)) {
        log(state, `Turn Archives faceup — card not in Archives.`);
        return { ok: true };
      }
      card.faceup = true;
      log(state, `Turn ${card.title} in Archives faceup.`);
      if (action.then) return evalEffect(ctx, action.then);
      return { ok: true };
    }
    case "add_agenda_counter": {
      source.agendaCounters = (source.agendaCounters ?? 0) + action.amount;
      log(
        state,
        `Add ${action.amount} agenda counter(s) to ${source.title} → ${source.agendaCounters}.`,
      );
      return { ok: true };
    }
    case "add_agenda_counters_from_overadvance": {
      const past = action.past;
      const adv = source.advancementTokens ?? 0;
      const over = Math.max(0, adv - past);
      const n =
        action.countersPerExcess !== undefined
          ? over * action.countersPerExcess
          : Math.floor(over / (action.per ?? 1));
      source.agendaCounters = (source.agendaCounters ?? 0) + n;
      log(
        state,
        `Add ${n} agenda counter(s) from overadvance (${adv}−${past}) → ${source.agendaCounters}.`,
      );
      return { ok: true };
    }
    case "remove_agenda_counters": {
      const have = source.agendaCounters ?? 0;
      const removed = Math.min(action.amount, have);
      source.agendaCounters = have - removed;
      log(
        state,
        `Remove ${removed} agenda counter(s) from ${source.title} → ${source.agendaCounters}.`,
      );
      return { ok: true };
    }
    case "lose_clicks": {
      const side = resolveSide(ctx, action.side);
      const p = side === "corp" ? state.corp : state.runner;
      const lost = Math.min(action.amount, p.clicks);
      p.clicks -= lost;
      if (side === "runner" && lost > 0) {
        // Lazy import avoided — Seidr hook via turn flag + identity effect.
        if (state.run && !state.turn.seidrClickDuringRunFiredThisTurn) {
          const idCard = state.cards[state.corp.identityId];
          const seidrFx = idCard?.onFirstRunnerClickSpendOrLoseDuringRun;
          if (seidrFx) {
            state.turn.seidrClickDuringRunFiredThisTurn = true;
            const r = evalEffect({ state, sourceId: idCard.id }, seidrFx);
            if (!r.ok) {
              log(state, `Seidr click-during-run failed: ${r.error}`);
            }
          }
        }
        fireRunnerValTrigger(
          state,
          "valClickLossTriggerCount",
          (c) => c.onFirstClickLossEachTurnExceptPaidAbility,
          "onFirstClickLossEachTurnExceptPaidAbility",
        );
      }
      log(
        state,
        `${side} loses ${lost} click(s) (requested ${action.amount}) → ${p.clicks} (CR ${CR.spendClicks.number}).`,
      );
      return { ok: true };
    }
    case "gain_clicks": {
      const side = resolveSide(ctx, action.side);
      const p = side === "corp" ? state.corp : state.runner;
      p.clicks += action.amount;
      if (side === "runner" && state.run && action.amount > 0) {
        state.run.clicksGainedThisRun =
          (state.run.clicksGainedThisRun ?? 0) + action.amount;
      }
      log(
        state,
        `${side} gains ${action.amount} click(s) → ${p.clicks} (CR ${CR.spendClicks.number}).`,
      );
      return { ok: true };
    }
    case "trace": {
      if (action.interactive) {
        startTrace(
          state,
          sourceId,
          action.strength,
          action.onSuccess,
          action.onFailure,
        );
        return { ok: true };
      }
      const r = autoResolveTrace(
        state,
        sourceId,
        action.strength,
        action.onSuccess,
        action.onFailure,
      );
      if (!r.ok) return { ok: false, error: r.error, cites: [CR.trace] };
      return { ok: true };
    }
    case "remove_tags": {
      const removed = Math.min(action.amount, state.runner.tags);
      state.runner.tags -= removed;
      log(
        state,
        `Remove ${removed} tag(s) → ${state.runner.tags} (CR ${CR.tags.number}).`,
      );
      if (removed > 0) {
        const r = fireOnRemoveTags(state);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "remove_all_tags": {
      const removed = state.runner.tags;
      state.runner.tags = 0;
      log(
        state,
        `Remove all tags (${removed}) → 0 (CR ${CR.tags.number}).`,
      );
      if (removed > 0) {
        const r = fireOnRemoveTags(state);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "lose_credits_per_advancement": {
      const n = (source.advancementTokens ?? 0) * action.per;
      const lost = Math.min(n, state.runner.credits);
      state.runner.credits -= lost;
      log(
        state,
        `Runner loses ${lost}¢ (${action.per}×${source.advancementTokens ?? 0} advancements) (CR ${CR.gainCredits.number}).`,
      );
      return { ok: true };
    }
    case "gain_credits_per_advancement": {
      const n = source.advancementTokens ?? 0;
      const gained = n * action.per;
      const side = source.side;
      const p = side === "corp" ? state.corp : state.runner;
      p.credits += gained;
      log(
        state,
        `${side} gains ${gained}¢ (${n} advancement × ${action.per}) from ${source.title} (CR ${CR.gainCredits.number}).`,
      );
      return { ok: true };
    }
    case "gain_credits_per_power_counter": {
      const n = source.powerCounters ?? 0;
      const gained = n * action.per;
      const side = source.side;
      const p = side === "corp" ? state.corp : state.runner;
      p.credits += gained;
      log(
        state,
        `${side} gains ${gained}¢ (${n} power × ${action.per}) from ${source.title} (CR ${CR.gainCredits.number}).`,
      );
      return { ok: true };
    }
    case "gain_credits_per_hq_card": {
      const n = state.corp.hand.length;
      const gained = n * action.per;
      state.corp.credits += gained;
      log(
        state,
        `Corp gains ${gained}¢ (${n} HQ × ${action.per}) from ${source.title} (CR ${CR.gainCredits.number}).`,
      );
      return { ok: true };
    }
    case "gain_credits_per_runner_tags": {
      const n = state.runner.tags;
      const gained = n * action.per;
      state.corp.credits += gained;
      log(
        state,
        `Corp gains ${gained}¢ (${n} tag(s) × ${action.per}) from ${source.title} (CR ${CR.gainCredits.number}).`,
      );
      return { ok: true };
    }
    case "gain_credits_per_distinct_faceup_archive_type": {
      const types = new Set<string>();
      for (const id of state.corp.discard) {
        const c = state.cards[id];
        if (c?.faceup) types.add(c.type);
      }
      let gained = types.size;
      if (types.has("agenda")) gained += 2;
      state.corp.credits += gained;
      log(
        state,
        `Corp gains ${gained}¢ (${types.size} faceup Archives type(s)${
          types.has("agenda") ? " +2 agenda" : ""
        }) from ${source.title} (CR ${CR.gainCredits.number}).`,
      );
      return { ok: true };
    }
    case "swap_ice_with_hq": {
      let serverId: import("../state/types.js").ServerId | null = null;
      let iceIndex = -1;
      for (const server of Object.values(state.servers)) {
        const idx = server.ice.indexOf(sourceId);
        if (idx >= 0) {
          serverId = server.id;
          iceIndex = idx;
          break;
        }
      }
      if (!serverId || iceIndex < 0) {
        log(state, `Swap ice with HQ — ${source.title} not installed as ice.`);
        return { ok: true };
      }
      const hqIce = state.corp.hand.find(
        (id) => state.cards[id]?.type === "ice",
      );
      if (!hqIce) {
        log(state, `Swap ice with HQ — no ice in HQ.`);
        return { ok: true };
      }
      const incoming = state.cards[hqIce];
      const outgoingTitle = source.title;
      state.corp.hand = state.corp.hand.filter((id) => id !== hqIce);
      // Replace in-place so position is preserved; move outgoing to HQ.
      state.servers[serverId]!.ice[iceIndex] = hqIce;
      incoming.zone = `server:${serverId}:ice`;
      incoming.rezzed = false;
      incoming.faceup = false;
      state.corp.hand.push(sourceId);
      source.zone = "corp:hq";
      source.rezzed = false;
      source.faceup = false;
      const gain = action.gainCredits ?? 0;
      if (gain > 0) state.corp.credits += gain;
      log(
        state,
        `Swap ${outgoingTitle} with ${incoming.title} from HQ` +
          (gain > 0 ? `; Corp gains ${gain}¢` : "") +
          `.`,
      );
      return { ok: true };
    }
    case "hq_to_top_rd": {
      const hq = [...state.corp.hand];
      if (hq.length === 0) {
        log(state, `HQ to top of R&D — HQ empty.`);
        return { ok: true };
      }
      if (action.pick === "choose" && hq.length > 1) {
        state.pendingChoice = {
          sourceId,
          chooser: "corp",
          options: hq.map((id) => ({
            id,
            label: `Top R&D: ${state.cards[id]?.title ?? id}`,
            effect: {
              op: "do",
              action: { kind: "hq_card_to_top_rd", cardId: id },
            },
          })),
        };
        log(state, `HQ to top of R&D — Corp chooses among ${hq.length}.`);
        return { ok: true };
      }
      const id = action.pick === "first" ? hq[0]! : hq[hq.length - 1]!;
      removeCardFromCurrentZone(state, id);
      state.corp.deck.push(id);
      state.cards[id].zone = "corp:rd";
      state.cards[id].faceup = false;
      log(
        state,
        `${state.cards[id].title} moved from HQ to top of R&D.`,
      );
      return { ok: true };
    }
    case "hq_card_to_top_rd": {
      const id = action.cardId;
      if (!state.corp.hand.includes(id)) {
        return {
          ok: false,
          error: "Chosen card is not in HQ.",
          cites: [CR.gainCredits],
        };
      }
      removeCardFromCurrentZone(state, id);
      state.corp.deck.push(id);
      state.cards[id].zone = "corp:rd";
      state.cards[id].faceup = false;
      log(state, `${state.cards[id].title} moved from HQ to top of R&D.`);
      return { ok: true };
    }
    case "net_damage_up_to_tags": {
      const n = Math.min(state.runner.tags, action.max);
      if (n <= 0) {
        log(state, `Net damage up to tags — 0 (tags ${state.runner.tags}).`);
        return { ok: true };
      }
      return evalEffect(ctx, fx.netDamage(n));
    }
    case "bypass_current_ice": {
      if (!state.run?.encounter) {
        return {
          ok: false,
          error: "Bypass requires an encounter.",
          cites: [CR.encounterBreakPaw],
        };
      }
      const iceId = state.run.encounter.iceId;
      const ice = state.cards[iceId];
      if (
        action.requireSubtype &&
        !(ice.subtypes ?? []).includes(action.requireSubtype)
      ) {
        return {
          ok: false,
          error: `Bypass requires encountering ${action.requireSubtype}.`,
          cites: [CR.encounterBreakPaw],
        };
      }
      // Mark all subs broken and skip to movement via ended encounter.
      state.run.encounter.broken = (ice.subroutines ?? []).map(() => true);
      state.run.bypassedIceIds = [
        ...(state.run.bypassedIceIds ?? []),
        iceId,
      ];
      log(state, `Bypass ${ice.title} (encounter ends without resolving subs).`);
      fireOnBypassTriggers(state, iceId);
      if (ice.onEncounterEnd && ice.rezzed) {
        const r = evalEffect({ state, sourceId: iceId }, ice.onEncounterEnd);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "remove_power_counter": {
      const have = source.powerCounters ?? 0;
      const rem = Math.min(action.amount, have);
      source.powerCounters = have - rem;
      log(
        state,
        `Remove ${rem} power counter(s) from ${source.title} → ${source.powerCounters}.`,
      );
      syncEtrPerPowerCounterSubs(source);
      if (
        source.handSizePerPowerCounter ||
        source.runnerHandSizePenaltyPerPowerCounter
      ) {
        recomputeRunnerMaxHandSize(state);
      }
      if (
        source.trashWhenPowerEmpty &&
        (source.powerCounters ?? 0) <= 0
      ) {
        removeCardFromCurrentZone(state, sourceId);
        if (source.side === "runner") {
          state.runner.discard.push(sourceId);
          source.zone = "runner:heap";
        } else {
          state.corp.discard.push(sourceId);
          source.zone = "corp:archives";
        }
        source.faceup = true;
        log(
          state,
          `${source.title} trashed — power counters empty (CR ${CR.trashing.number}).`,
        );
        recomputeRunnerMaxHandSize(state);
      } else if (
        source.rfgWhenPowerEmpty &&
        (source.powerCounters ?? 0) <= 0
      ) {
        removeCardFromCurrentZone(state, sourceId);
        source.zone = "removed-from-game";
        source.faceup = true;
        if (!state.removedFromGame) state.removedFromGame = [];
        if (!state.removedFromGame.includes(sourceId)) {
          state.removedFromGame.push(sourceId);
        }
        log(
          state,
          `${source.title} removed from the game — power counters empty.`,
        );
        recomputeRunnerMaxHandSize(state);
      } else if (
        source.scoreWhenPowerEmpty &&
        (source.powerCounters ?? 0) <= 0
      ) {
        const pts = source.scoreWhenPowerEmpty.agendaPoints;
        return evalEffect(ctx, {
          op: "do",
          action: {
            kind: "add_to_corp_score_as_agenda",
            agendaPoints: pts,
          },
        });
      }
      return { ok: true };
    }
    case "remove_all_power_counters": {
      const have = source.powerCounters ?? 0;
      source.powerCounters = 0;
      log(
        state,
        `Remove all ${have} power counter(s) from ${source.title}.`,
      );
      syncEtrPerPowerCounterSubs(source);
      if (
        source.handSizePerPowerCounter ||
        source.runnerHandSizePenaltyPerPowerCounter
      ) {
        recomputeRunnerMaxHandSize(state);
      }
      if (source.trashWhenPowerEmpty && have > 0) {
        removeCardFromCurrentZone(state, sourceId);
        if (source.side === "runner") {
          state.runner.discard.push(sourceId);
          source.zone = "runner:heap";
        } else {
          state.corp.discard.push(sourceId);
          source.zone = "corp:archives";
        }
        source.faceup = true;
        log(
          state,
          `${source.title} trashed — power counters empty (CR ${CR.trashing.number}).`,
        );
        recomputeRunnerMaxHandSize(state);
      } else if (source.rfgWhenPowerEmpty && have > 0) {
        removeCardFromCurrentZone(state, sourceId);
        source.zone = "removed-from-game";
        source.faceup = true;
        if (!state.removedFromGame) state.removedFromGame = [];
        if (!state.removedFromGame.includes(sourceId)) {
          state.removedFromGame.push(sourceId);
        }
        log(
          state,
          `${source.title} removed from the game — power counters empty.`,
        );
        recomputeRunnerMaxHandSize(state);
      }
      return { ok: true };
    }
    case "rez_spend_credits_for_power_counters": {
      const amount = Math.max(0, action.amount);
      if (amount > 0) {
        if (state.corp.credits < amount) {
          log(state, `Rez spend for power — insufficient credits.`);
          return { ok: true };
        }
        state.corp.credits -= amount;
        source.powerCounters = (source.powerCounters ?? 0) + amount;
        log(
          state,
          `${source.title} — pay ${amount}¢ → ${amount} power counter(s) (now ${source.powerCounters}).`,
        );
        syncEtrPerPowerCounterSubs(source);
      } else {
        log(state, `${source.title} — place 0 power counters.`);
      }
      return { ok: true };
    }
    case "reveal_top_n_rd": {
      const n = Math.max(0, action.n ?? 1);
      const top = state.corp.deck.slice(0, Math.min(n, state.corp.deck.length));
      if (top.length === 0) {
        log(state, `${source.title} — R&D empty (reveal).`);
        return { ok: true };
      }
      for (const id of top) {
        log(state, `${source.title} reveals ${state.cards[id]!.title}.`);
      }
      return { ok: true };
    }
    case "gain_clicks_equal_to_runner_scored_agendas": {
      const n = state.runner.score.length;
      state.corp.clicks += n;
      log(
        state,
        `${source.title} — Corp gains ${n} click(s) (Runner scored agendas) → ${state.corp.clicks}.`,
      );
      return { ok: true };
    }
    case "reveal_top_n_rd_trash_one": {
      const n = action.n ?? 1;
      if (state.turn.rdLookedCards.length > 0) {
        return {
          ok: false,
          error: "R&D look already in progress.",
          cites: [],
        };
      }
      const taken = state.corp.deck.splice(
        0,
        Math.min(n, state.corp.deck.length),
      );
      if (taken.length === 0) {
        log(state, `${source.title} — R&D empty.`);
        return { ok: true };
      }
      state.turn.rdLookedCards = taken;
      state.turn.rdArrangePlaced = [];
      state.turn.rdArrangeThenMayDrawIfUnprotected = false;
      for (const id of taken) {
        state.cards[id].faceup = true;
        log(state, `${source.title} reveals ${state.cards[id].title}.`);
      }
      if (taken.length === 1) {
        return applyPrimitive(ctx, {
          kind: "reveal_top_n_rd_trash_picked",
          cardId: taken[0]!,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: taken.map((id) => ({
          id: `stargate-trash:${id}`,
          label: `Trash ${state.cards[id].title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "reveal_top_n_rd_trash_picked" as const,
              cardId: id,
            },
          },
        })),
      };
      log(state, `${source.title} — choose 1 revealed card to trash.`);
      return { ok: true };
    }
    case "reveal_top_n_rd_trash_picked": {
      const cardId = action.cardId;
      const idx = state.turn.rdLookedCards.indexOf(cardId);
      if (idx < 0) {
        log(state, `Stargate trash — card not in reveal zone.`);
        return { ok: true };
      }
      state.turn.rdLookedCards.splice(idx, 1);
      trashCorpCardToArchives(state, cardId);
      log(state, `${source.title} — trash ${state.cards[cardId]!.title}.`);
      // Remaining revealed cards return to top of R&D in relative order
      // (first revealed stays top).
      const rest = state.turn.rdLookedCards;
      state.turn.rdLookedCards = [];
      for (let i = rest.length - 1; i >= 0; i--) {
        const id = rest[i]!;
        state.cards[id]!.faceup = false;
        state.cards[id]!.zone = "corp:rd";
        state.corp.deck.unshift(id);
      }
      return { ok: true };
    }
    case "move_runner_to_outermost_attacked": {
      if (!state.run) {
        log(state, `Move to outermost attacked — no active run.`);
        return { ok: true };
      }
      const sid = state.run.attackedServerId;
      const server = state.servers[sid];
      if (!server) {
        log(state, `Move to outermost attacked — unknown server.`);
        return { ok: true };
      }
      if (server.ice.length > 0) {
        state.run.position = 0;
        state.log.push(
          `Runner moves to outermost ice protecting ${sid}.`,
        );
      } else {
        state.run.position = null;
        state.log.push(`Runner moves to ${sid} (no ice).`);
      }
      return { ok: true };
    }
    case "climactic_choose_server_corp_may_trash_ice_else_bonus_access": {
      const iced: string[] = [];
      for (const [sid, server] of Object.entries(state.servers)) {
        if (server.ice.length > 0) iced.push(sid);
      }
      if (iced.length === 0) {
        return applyPrimitive(ctx, {
          kind: "climactic_register_bonus_access",
          amount: 2,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: iced.map((sid) => ({
          id: `climactic-server:${sid}`,
          label: `Choose ${sid}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "climactic_corp_may_trash_ice" as const,
              serverId: sid,
            },
          },
        })),
      };
      log(state, `${source.title} — choose a server protected by ice.`);
      return { ok: true };
    }
    case "climactic_corp_may_trash_ice": {
      const sid = action.serverId as import("../state/types.js").ServerId;
      const server = state.servers[sid];
      const iceIds = server?.ice ?? [];
      if (iceIds.length === 0) {
        return applyPrimitive(ctx, {
          kind: "climactic_register_bonus_access",
          amount: 2,
        });
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        iceIds.map((id) => ({
          id: `climactic-trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "climactic_trash_ice" as const,
              cardId: id,
            },
          },
        }));
      options.push({
        id: "climactic-decline",
        label: "Decline — Runner gets +2 access on first HQ/R&D breach",
        effect: {
          op: "do" as const,
          action: {
            kind: "climactic_register_bonus_access" as const,
            amount: 2,
          },
        },
      });
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options,
      };
      log(
        state,
        `${source.title} — Corp may trash 1 ice protecting ${sid}.`,
      );
      return { ok: true };
    }
    case "climactic_trash_ice": {
      const ice = state.cards[action.cardId];
      if (!ice || ice.type !== "ice") {
        log(state, `Climactic trash ice — not ice.`);
        return { ok: true };
      }
      trashCorpCardToArchives(state, action.cardId);
      log(state, `Climactic Showdown — trash ${ice.title}.`);
      return { ok: true };
    }
    case "climactic_register_bonus_access": {
      const amount = Math.max(0, action.amount ?? 2);
      state.turn.climacticBonusAccessOnFirstHqRdBreach = amount;
      log(
        state,
        `${source.title} — first HQ or R&D breach this turn: access +${amount}.`,
      );
      return { ok: true };
    }
        case "prevent_pending_end_the_run_from_corp_card_ability": {
      const pending = state.pendingEndTheRun;
      if (!pending?.fromCorpCardAbility) {
        log(
          state,
          `${source.title} — no pending Corp-card-ability end the run to prevent.`,
        );
        return { ok: true };
      }
      state.pendingEndTheRun = null;
      log(
        state,
        `${source.title} — prevent Corp card ability from ending the run.`,
      );
      return { ok: true };
    }
    case "whistleblower_may_trash_name_agenda_steal_ignore_costs": {
      if (!state.run) {
        log(state, `${source.title} — no run for Whistleblower.`);
        return { ok: true };
      }
      // Collect unique agenda titles in play / R&D / HQ / Archives / score
      // as name candidates; also allow free-text via any catalog title present
      // on corp cards in the game. Fail-closed: offer titles from known cards.
      const titles = new Set<string>();
      for (const c of Object.values(state.cards)) {
        if (c.side === "corp") titles.add(c.title);
      }
      const titleList = [...titles].sort();
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "decline-wb",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
          ...titleList.map((title) => ({
            id: `wb-name:${title}`,
            label: `Trash Whistleblower — name ${title}`,
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: { kind: "trash_self" as const },
                },
                {
                  op: "do" as const,
                  action: {
                    kind: "whistleblower_name_agenda" as const,
                    title,
                  },
                },
              ],
            },
          })),
        ],
      };
      log(
        state,
        `${source.title} — may trash to name an agenda for steal-ignore-costs.`,
      );
      return { ok: true };
    }
    case "whistleblower_name_agenda": {
      if (!state.run) {
        log(state, `Whistleblower name — no run.`);
        return { ok: true };
      }
      state.run.whistleblowerNamedTitle = action.title;
      log(
        state,
        `${source.title} — name ${action.title}; next access of that agenda this run is stolen ignoring costs.`,
      );
      return { ok: true };
    }
    case "hyoubu_reveal_grip_random_or_stack_top": {
      const gripOk = state.runner.hand.length > 0;
      const stackOk = state.runner.deck.length > 0;
      if (!gripOk && !stackOk) {
        log(state, `${source.title} — nothing to reveal.`);
        return { ok: true };
      }
      const options: import("./ir.js").ChoiceOption[] = [];
      if (gripOk) {
        options.push({
          id: "reveal-grip",
          label: "Reveal 1 card from the grip at random",
          effect: {
            op: "do" as const,
            action: { kind: "hyoubu_reveal_grip_random" as const },
          },
        });
      }
      if (stackOk) {
        options.push({
          id: "reveal-stack",
          label: "Reveal the top card of the stack",
          effect: {
            op: "do" as const,
            action: { kind: "hyoubu_reveal_stack_top" as const },
          },
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options,
      };
      log(state, `${source.title} — choose grip-random or stack-top reveal.`);
      return { ok: true };
    }
    case "hyoubu_reveal_grip_random": {
      if (state.runner.hand.length === 0) {
        log(state, `${source.title} — grip empty.`);
        return { ok: true };
      }
      const pick =
        state.runner.hand[
          Math.floor(Math.random() * state.runner.hand.length)
        ]!;
      noteCardRevealed(state, pick, sourceId);
      log(
        state,
        `${source.title} — reveal ${state.cards[pick]!.title} from grip.`,
      );
      return { ok: true };
    }
    case "hyoubu_reveal_stack_top": {
      const top = state.runner.deck[0];
      if (!top) {
        log(state, `${source.title} — stack empty.`);
        return { ok: true };
      }
      noteCardRevealed(state, top, sourceId);
      log(
        state,
        `${source.title} — reveal ${state.cards[top]!.title} (stack top).`,
      );
      return { ok: true };
    }
    case "class_act_look_top_draw_amount_plus_one_bottom_one": {
      const amount = state.turn.pendingWouldDrawAmount ?? 0;
      const lookN = Math.max(0, amount + 1);
      const taken = state.runner.deck.splice(
        0,
        Math.min(lookN, state.runner.deck.length),
      );
      if (taken.length === 0) {
        log(state, `${source.title} — Class Act look: stack empty.`);
        state.turn.pendingWouldDrawAmount = null;
        return { ok: true };
      }
      for (const id of taken) {
        state.cards[id]!.faceup = true;
        log(state, `Class Act looks at ${state.cards[id]!.title}.`);
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: taken.map((id) => ({
          id: `class-act-bottom:${id}`,
          label: `Add ${state.cards[id]!.title} to bottom of stack`,
          effect: {
            op: "do" as const,
            action: {
              kind: "class_act_bottom_one_then_draw" as const,
              cardId: id,
            },
          },
        })),
      };
      // Stash looked ids on turn for the bottom leaf.
      state.turn.rdLookedCards = taken;
      log(
        state,
        `${source.title} — look at top ${taken.length}; bottom 1, then draw ${amount}.`,
      );
      return { ok: true };
    }
    case "class_act_bottom_one_then_draw": {
      const looked = state.turn.rdLookedCards ?? [];
      const bottomId = action.cardId;
      const keep: string[] = [];
      for (const id of looked) {
        if (id === bottomId) continue;
        keep.push(id);
      }
      for (let i = keep.length - 1; i >= 0; i--) {
        const id = keep[i]!;
        state.cards[id]!.faceup = false;
        state.runner.deck.unshift(id);
      }
      if (looked.includes(bottomId)) {
        state.cards[bottomId]!.faceup = false;
        state.runner.deck.push(bottomId);
        log(
          state,
          `Class Act — ${state.cards[bottomId]!.title} to bottom of stack.`,
        );
      }
      state.turn.rdLookedCards = [];
      const amount = state.turn.pendingWouldDrawAmount ?? 0;
      state.turn.pendingWouldDrawAmount = null;
      if (amount > 0) {
        const n = drawCards(state, "runner", amount);
        log(state, `Class Act — draw ${n} (requested ${amount}).`);
      }
      return { ok: true };
    }
    case "backup_plan_may_rerun_ignore_additional_costs_bypass_last_ice": {
      if (!state.run) {
        log(state, `${source.title} — no run for Backup Plan.`);
        return { ok: true };
      }
      const serverId = state.run.attackedServerId;
      const lastIce = state.run.lastEncounteredIceId;
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "decline-backup",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
          {
            id: "backup-rerun",
            label: `Run ${serverId} again (ignore additional costs; bypass last ice)`,
            effect: {
              op: "do" as const,
              action: { kind: "backup_plan_rerun" as const },
            },
          },
        ],
      };
      // Stash bypass target on the source for the rerun leaf.
      source.chosenIceId = lastIce;
      source.chosenServerId = serverId;
      log(
        state,
        `${source.title} — may rerun ${serverId} ignoring additional costs.`,
      );
      return { ok: true };
    }
    case "backup_plan_rerun": {
      const serverId = source.chosenServerId;
      if (!serverId || !state.servers[serverId]) {
        log(state, `${source.title} — Backup Plan rerun: no server.`);
        return { ok: true };
      }
      // Immediate fail-closed leaf: create a new run with the bypass/ignore flags.
      if (state.run) {
        log(state, `${source.title} — cannot start Backup Plan rerun while a run is active.`);
        return { ok: true };
      }
      // If run already closed, start a fresh run skeleton with flags.
      state.run = {
        attackedServerId: serverId,
        phase: "initiation",
        position: null,
        successful: null,
        accessedCardIds: [],
        accessCandidates: [],
        accessRemaining: null,
        endedTheRun: false,
        cannotJackOut: false,
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
        encounter: null,
        accessingCardId: null,
        runSourceId: sourceId,
        backupPlanIgnoreAdditionalCosts: true,
        backupPlanBypassIceId: source.chosenIceId,
      };
      log(
        state,
        `${source.title} — rerun ${serverId} (ignore additional costs` +
          (source.chosenIceId
            ? `; bypass ${state.cards[source.chosenIceId]?.title ?? source.chosenIceId}`
            : "") +
          `).`,
      );
      return { ok: true };
    }
    case "complete_image_name_net_damage_loop": {
      const titles = new Set<string>();
      for (const id of state.runner.hand) {
        titles.add(state.cards[id]!.title);
      }
      for (const id of state.runner.deck) {
        titles.add(state.cards[id]!.title);
      }
      for (const id of state.runner.discard) {
        titles.add(state.cards[id]!.title);
      }
      for (const id of state.runner.rig) {
        titles.add(state.cards[id]!.title);
      }
      const titleList = [...titles].sort();
      if (titleList.length === 0) {
        // Still allow naming via empty — no loop possible.
        log(state, `${source.title} — no known Runner card titles to name.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: titleList.map((title) => ({
          id: `ci-name:${title}`,
          label: `Name ${title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "complete_image_net_named" as const,
              title,
            },
          },
        })),
      };
      log(state, `${source.title} — choose a card name for net damage loop.`);
      return { ok: true };
    }
    case "complete_image_net_named": {
      const title = action.title;
      const before = new Set(state.runner.hand);
      const namedInGrip = state.runner.hand.filter(
        (id) => state.cards[id]?.title === title,
      );
      dealDamage(state, "net", 1, sourceId);
      // If interrupt pending, stash continuation to resume loop.
      if (state.pendingDamage) {
        state.pendingEffectContinuation = {
          sourceId,
          effects: [
            {
              op: "do" as const,
              action: { kind: "complete_image_net_named" as const, title },
            },
          ],
        };
        // Mark so after damage resolves we check trash — use a simpler immediate path:
        // clear continuation; instead check after non-interactive damage below.
        state.pendingEffectContinuation = null;
        log(
          state,
          `${source.title} — net damage pending; Complete Image loop pauses (fail-closed until accepted).`,
        );
        return { ok: true };
      }
      // Non-interactive: check whether a named card left grip into heap.
      const trashedNamed = [...before].some(
        (id) =>
          state.cards[id]?.title === title &&
          state.runner.discard.includes(id) &&
          !state.runner.hand.includes(id),
      );
      if (trashedNamed || namedInGrip.some((id) => state.runner.discard.includes(id))) {
        log(
          state,
          `${source.title} — trashed ${title}; repeat Complete Image.`,
        );
        return applyPrimitive(ctx, {
          kind: "complete_image_net_named",
          title,
        });
      }
      log(state, `${source.title} — no ${title} trashed; Complete Image ends.`);
      return { ok: true };
    }
    case "khusyuk_choose_install_cost_set_aside_access_shuffle": {
      const costs = new Set<number>();
      for (const id of state.runner.rig) {
        const c = state.cards[id];
        const cost = c?.installCost ?? 0;
        if (cost > 0) costs.add(cost);
      }
      const costList = [...costs].sort((a, b) => a - b);
      if (costList.length === 0) {
        log(
          state,
          `${source.title} — no installed cards with install cost >0; X=0.`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: costList.map((cost) => ({
          id: `khusyuk-cost:${cost}`,
          label: `Choose install cost ${cost}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "khusyuk_set_aside_access_shuffle" as const,
              installCost: cost,
            },
          },
        })),
      };
      log(state, `${source.title} — choose a printed install cost.`);
      return { ok: true };
    }
    case "khusyuk_set_aside_access_shuffle": {
      const cost = action.installCost;
      const matching = state.runner.rig.filter(
        (id) => (state.cards[id]?.installCost ?? 0) === cost,
      );
      const x = Math.min(6, matching.length);
      if (x === 0) {
        log(state, `${source.title} — X=0; no set-aside.`);
        return { ok: true };
      }
      const aside: string[] = [];
      for (let i = 0; i < x && state.corp.deck.length > 0; i++) {
        const id = state.corp.deck.shift()!;
        aside.push(id);
        state.cards[id]!.faceup = true;
        state.cards[id]!.zone = "corp:set-aside";
      }
      state.corp.corpSetAside = aside;
      if (aside.length === 0) {
        log(state, `${source.title} — R&D empty; nothing to access.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: aside.map((id) => ({
          id: `khusyuk-access:${id}`,
          label: `Access ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "khusyuk_access_set_aside" as const,
              cardId: id,
            },
          },
        })),
      };
      log(
        state,
        `${source.title} — set aside top ${aside.length} of R&D (cost ${cost}); access 1.`,
      );
      return { ok: true };
    }
    case "khusyuk_access_set_aside": {
      const aside = [...(state.corp.corpSetAside ?? [])];
      const pick = action.cardId;
      if (!aside.includes(pick)) {
        log(state, `${source.title} — Khusyuk access: card not set aside.`);
        return { ok: true };
      }
      const card = state.cards[pick]!;
      log(state, `${source.title} — access ${card.title} from set-aside.`);
      if (card.type === "agenda") {
        stealAgenda(state, pick);
      }
      // Shuffle remaining set-aside (and unstolen pick if still set-aside) into R&D.
      const remaining = aside.filter(
        (id) => id !== pick || state.cards[id]?.zone === "corp:set-aside",
      );
      for (const id of remaining) {
        if (state.cards[id]?.zone !== "corp:set-aside") continue;
        state.corp.deck.push(id);
        state.cards[id]!.zone = "corp:rd";
        state.cards[id]!.faceup = false;
      }
      state.corp.corpSetAside = [];
      shuffleCorpRdAfterSearch(state);
      log(state, `${source.title} — shuffle set-aside into R&D.`);
      return { ok: true };
    }
    case "mirrormorph_take_different_action_click_discount": {
      state.turn.mirrormorphClickDiscountPending = true;
      log(
        state,
        `${source.title} — next different Corp action pays [click] less.`,
      );
      return { ok: true };
    }
case "add_power_counter": {
      source.powerCounters = (source.powerCounters ?? 0) + action.amount;
      log(
        state,
        `Place ${action.amount} power counter(s) on ${source.title} → ${source.powerCounters}.`,
      );
      syncEtrPerPowerCounterSubs(source);
      if (
        source.handSizePerPowerCounter ||
        source.runnerHandSizePenaltyPerPowerCounter
      ) {
        recomputeRunnerMaxHandSize(state);
      }
      maybeFirePowerCountersGte(state, sourceId);
      return { ok: true };
    }
    case "draw_per_power_counter": {
      const side = resolveSide(ctx, action.side);
      const per = action.per ?? 1;
      const n = (source.powerCounters ?? 0) * per;
      const drawn = drawCards(state, side, n);
      log(
        state,
        `${side} draws ${drawn} (${n} from ${source.powerCounters ?? 0} power × ${per}) (CR ${CR.drawing.number}).`,
      );
      return { ok: true };
    }
    case "draw_per_clicks_remaining": {
      const side = resolveSide(ctx, action.side);
      const p = side === "corp" ? state.corp : state.runner;
      const n = Math.max(0, p.clicks);
      const drawn = drawCards(state, side, n);
      log(
        state,
        `${side} draws ${drawn} (${n} clicks remaining) (CR ${CR.drawing.number}).`,
      );
      return { ok: true };
    }
    case "may_host_bad_publicity_then": {
      const amount = action.amount;
      const have = state.corp.badPublicity ?? 0;
      if (have < amount) {
        log(state, `${source.title} — may host BP (have ${have} < ${amount}).`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "host-bp",
            label: `Host ${amount} bad publicity; gain 3¢ and draw 1`,
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: { kind: "host_bad_publicity" as const, amount },
                },
                action.then,
              ],
            },
          },
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "corp" as const,
                amount: 0,
              },
            },
          },
        ],
      };
      log(state, `${source.title} — may host ${amount} bad publicity.`);
      return { ok: true };
    }
    case "host_bad_publicity": {
      const take = Math.min(action.amount, state.corp.badPublicity ?? 0);
      if (take <= 0) return { ok: true };
      state.corp.badPublicity = (state.corp.badPublicity ?? 0) - take;
      source.badPublicityCounters = (source.badPublicityCounters ?? 0) + take;
      log(
        state,
        `Host ${take} bad publicity on ${source.title} → hosted ${source.badPublicityCounters}; player BP ${state.corp.badPublicity}.`,
      );
      return { ok: true };
    }
    case "may_search_hq_rd_archives_agenda_to_hq_or_rd_bottom": {
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          ...(["hq", "rd", "archives"] as const).map((zone) => ({
            id: `search-${zone}`,
            label: `Search ${zone.toUpperCase()} for an agenda`,
            effect: {
              op: "do" as const,
              action: {
                kind: "search_zone_agenda_to_hq_or_rd_bottom" as const,
                zone,
              },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "corp" as const,
                amount: 0,
              },
            },
          },
        ],
      };
      log(state, `${source.title} — may search HQ, R&D, or Archives for an agenda.`);
      return { ok: true };
    }
    case "search_zone_agenda_to_hq_or_rd_bottom": {
      const zone = action.zone;
      const pool: string[] =
        zone === "hq"
          ? [...state.corp.hand]
          : zone === "rd"
            ? [...state.corp.deck]
            : [...state.corp.discard];
      const agendas = pool.filter((id) => state.cards[id]?.type === "agenda");
      if (zone === "rd") {
        // shuffle after searching regardless
      }
      if (agendas.length === 0) {
        if (zone === "rd") {
          // shuffle noop
        }
        log(state, `${source.title} — no agenda in ${zone}.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: agendas.flatMap((id) => [
          {
            id: `agenda-hq:${id}`,
            label: `Reveal ${state.cards[id]!.title}; add to HQ`,
            effect: {
              op: "do" as const,
              action: {
                kind: "place_agenda_hq_or_rd_bottom" as const,
                cardId: id,
                destination: "hq" as const,
              },
            },
          },
          {
            id: `agenda-bottom:${id}`,
            label: `Reveal ${state.cards[id]!.title}; bottom of R&D`,
            effect: {
              op: "do" as const,
              action: {
                kind: "place_agenda_hq_or_rd_bottom" as const,
                cardId: id,
                destination: "rd_bottom" as const,
              },
            },
          },
        ]),
      };
      log(state, `${source.title} — choose agenda from ${zone}.`);
      return { ok: true };
    }
    case "place_agenda_hq_or_rd_bottom": {
      const id = action.cardId;
      const card = state.cards[id];
      if (!card || card.type !== "agenda") {
        log(state, `Place agenda — not an agenda.`);
        return { ok: true };
      }
      // remove from wherever
      state.corp.hand = state.corp.hand.filter((x) => x !== id);
      state.corp.deck = state.corp.deck.filter((x) => x !== id);
      state.corp.discard = state.corp.discard.filter((x) => x !== id);
      for (const server of Object.values(state.servers)) {
        server.root = server.root.filter((x) => x !== id);
      }
      if (action.destination === "hq") {
        state.corp.hand.push(id);
        card.zone = "corp:hq";
        card.faceup = false;
        log(state, `Reveal ${card.title} — add to HQ.`);
      } else {
        state.corp.deck.push(id);
        card.zone = "corp:rd";
        card.faceup = false;
        log(state, `Reveal ${card.title} — bottom of R&D.`);
      }
      // shuffle R&D after searching it (always safe)
      for (let i = state.corp.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = state.corp.deck[i]!;
        state.corp.deck[i] = state.corp.deck[j]!;
        state.corp.deck[j] = tmp;
      }
      return { ok: true };
    }

    case "search_stack_non_virus_program_install_ignore_costs_track": {
      const matches = state.runner.deck.filter((id) => {
        const c = state.cards[id];
        return (
          c?.type === "program" &&
          !(c.subtypes ?? []).includes("virus")
        );
      });
      if (matches.length === 0) {
        // shuffle
        for (let i = state.runner.deck.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = state.runner.deck[i]!;
          state.runner.deck[i] = state.runner.deck[j]!;
          state.runner.deck[j] = tmp;
        }
        log(state, `${source.title} — no non-virus program in stack.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: matches.map((id) => ({
          id: `install:${id}`,
          label: `Install ${state.cards[id]!.title} ignoring costs`,
          effect: {
            op: "do" as const,
            action: {
              kind: "install_stack_program_ignore_costs_track" as const,
              cardId: id,
            },
          },
        })),
      };
      log(state, `${source.title} — search stack for a non-virus program.`);
      return { ok: true };
    }
    case "install_stack_program_ignore_costs_track": {
      const id = action.cardId;
      if (!state.runner.deck.includes(id)) {
        log(state, `Install from stack — not in stack.`);
        return { ok: true };
      }
      state.runner.deck = state.runner.deck.filter((x) => x !== id);
      // shuffle rest
      for (let i = state.runner.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = state.runner.deck[i]!;
        state.runner.deck[i] = state.runner.deck[j]!;
        state.runner.deck[j] = tmp;
      }
      const card = state.cards[id]!;
      // console limit / install into rig ignoring costs
      if ((card.subtypes ?? []).includes("console")) {
        for (const rid of [...state.runner.rig]) {
          const other = state.cards[rid];
          if ((other?.subtypes ?? []).includes("console")) {
            moveRunnerCardToHeap(state, rid);
          }
        }
      }
      state.runner.rig.push(id);
      card.zone = "runner:rig";
      card.faceup = true;
      if ((card.powerCountersOnInstall ?? 0) > 0) {
        card.powerCounters = card.powerCountersOnInstall;
      }
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: id }, card.onInstall);
        if (!r.ok) return r;
      }
      noteProgramOrHardwareInstalled(state, id);
      if (state.run) {
        state.run.betaBuildTrackedInstallId = id;
      } else {
        // track on source until run starts
        (source as { betaBuildPendingTrackId?: string }).betaBuildPendingTrackId = id;
      }
      log(state, `Install ${card.title} from stack ignoring all costs.`);
      return { ok: true };
    }
    case "return_tracked_install_to_stack_top_if_installed": {
      const id =
        state.run?.betaBuildTrackedInstallId ??
        (source as { betaBuildPendingTrackId?: string }).betaBuildPendingTrackId;
      if (!id) {
        log(state, `${source.title} — no tracked program to return.`);
        return { ok: true };
      }
      if (!state.runner.rig.includes(id)) {
        log(state, `${source.title} — tracked program already uninstalled.`);
        return { ok: true };
      }
      state.runner.rig = state.runner.rig.filter((x) => x !== id);
      state.runner.deck.unshift(id);
      state.cards[id]!.zone = "runner:stack";
      state.cards[id]!.faceup = false;
      log(state, `Add ${state.cards[id]!.title} to the top of the stack.`);
      return { ok: true };
    }
    case "reveal_hq_forbid_steal_trash_copies_this_run": {
      if (!state.run) {
        log(state, `${source.title} — reveal HQ requires an active run.`);
        return { ok: true };
      }
      const hq = [...state.corp.hand];
      if (hq.length === 0) {
        log(state, `${source.title} — HQ empty.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: hq.map((id) => ({
          id: `reveal:${id}`,
          label: `Reveal ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "forbid_steal_trash_title_this_run" as const,
              title: state.cards[id]!.title,
            },
          },
        })),
      };
      log(state, `${source.title} — reveal 1 card in HQ.`);
      return { ok: true };
    }
    case "forbid_steal_trash_title_this_run": {
      if (!state.run) return { ok: true };
      const titles = state.run.forbidStealTrashTitles ?? [];
      if (!titles.includes(action.title)) titles.push(action.title);
      state.run.forbidStealTrashTitles = titles;
      log(
        state,
        `Runner cannot steal or trash copies of ${action.title} for the remainder of this run.`,
      );
      return { ok: true };
    }

    case "search_rd_take_card_to_hq": {
      const id = action.cardId;
      if (!state.corp.deck.includes(id)) {
        log(state, `Search R&D take — card not in R&D.`);
        return { ok: true };
      }
      state.corp.deck = state.corp.deck.filter((x) => x !== id);
      state.corp.hand.push(id);
      state.cards[id]!.zone = "corp:hq";
      state.cards[id]!.faceup = false;
      for (let i = state.corp.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = state.corp.deck[i]!;
        state.corp.deck[i] = state.corp.deck[j]!;
        state.corp.deck[j] = tmp;
      }
      log(state, `Search R&D — reveal ${state.cards[id]!.title} and add to HQ.`);
      return { ok: true };
    }
    case "may_search_rd_non_agenda_any_subtype_to_hq": {
      const subtypes = new Set(
        action.subtypes.map((s: string) => s.toLowerCase()),
      );
      const matches = state.corp.deck.filter((id) => {
        const c = state.cards[id];
        if (!c || c.type === "agenda") return false;
        return (c.subtypes ?? []).some((s) => subtypes.has(s.toLowerCase()));
      });
      if (matches.length === 0) {
        for (let i = state.corp.deck.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = state.corp.deck[i]!;
          state.corp.deck[i] = state.corp.deck[j]!;
          state.corp.deck[j] = tmp;
        }
        log(state, `${source.title} — no matching non-agenda in R&D.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          ...matches.map((id) => ({
            id: `take:${id}`,
            label: `Reveal ${state.cards[id]!.title}; add to HQ`,
            effect: {
              op: "do" as const,
              action: {
                kind: "search_rd_take_card_to_hq" as const,
                cardId: id,
              },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "corp" as const,
                amount: 0,
              },
            },
          },
        ],
      };
      log(
        state,
        `${source.title} — may search R&D for black ops / gray ops / liability.`,
      );
      return { ok: true };
    }
    case "take_hosted_bad_publicity": {
      const have = source.badPublicityCounters ?? 0;
      const take = Math.min(action.amount, have);
      source.badPublicityCounters = have - take;
      state.corp.badPublicity = (state.corp.badPublicity ?? 0) + take;
      log(
        state,
        `Take ${take} bad publicity from ${source.title} → player BP ${state.corp.badPublicity} (hosted ${source.badPublicityCounters}).`,
      );
      fireFirstBadPublicityTake(state, take);
      checkWinConditions(state);
      return { ok: true };
    }
    case "pay_credits_or_etr": {
      const side = resolveSide(ctx, action.side);
      const p = side === "corp" ? state.corp : state.runner;
      if (p.credits >= action.amount) {
        p.credits -= action.amount;
        log(
          state,
          `${side} pays ${action.amount}¢ (forced — able to pay) → ${p.credits}.`,
        );
        if (side === "runner" && action.amount > 0) {
          noteCorpAbilityCausedRunnerCreditLossOrSpend(
            state,
            action.amount,
            sourceId,
          );
        }
        return { ok: true };
      }
      log(
        state,
        `${side} cannot pay ${action.amount}¢ — end the run.`,
      );
      return applyPrimitive(ctx, { kind: "end_the_run" });
    }
    case "meat_damage_stolen_last_turn": {
      const n = state.turn.agendaPointsStolenLastTurn;
      if (n <= 0) {
        log(state, `Meat damage from stolen AP last turn — 0.`);
        return { ok: true };
      }
      return applyPrimitive(ctx, { kind: "meat_damage", amount: n });
    }
    case "derez_ice": {
      const iceIds: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (state.cards[id].rezzed) iceIds.push(id);
        }
      }
      if (iceIds.length === 0) {
        log(state, `Derez ice — no rezzed ice.`);
        return { ok: true };
      }
      if (action.pick === "choose" && iceIds.length > 1) {
        // Deterministic: derez first rezzed ice (multi-match auto-pick).
      }
      const target = iceIds[0]!;
      state.cards[target].rezzed = false;
      state.cards[target].faceup = false;
      log(
        state,
        iceIds.length > 1
          ? `Derez ${state.cards[target].title} (${iceIds.length} rezzed; first selected).`
          : `Derez ${state.cards[target].title}.`,
      );
      fireHostRezStateTriggers(state, target, "derez");
      return { ok: true };
    }
    case "derez_card": {
      const card = state.cards[action.cardId];
      if (!card || !card.rezzed) {
        log(
          state,
          `Derez card — ${card?.title ?? action.cardId} not rezzed (CR ${CR.derez.number}).`,
        );
        return { ok: true };
      }
      card.rezzed = false;
      card.faceup = false;
      log(
        state,
        `Derez ${card.title} (CR ${CR.derez.number}, ${CR.derezByAbility.number}).`,
      );
      if (card.type === "ice") {
        if (state.run) state.run.iceDerezzedThisRun = true;
        fireHostRezStateTriggers(state, action.cardId, "derez");
      }
      return { ok: true };
    }
    case "derez_source": {
      if (!source.rezzed) {
        log(
          state,
          `Derez source — ${source.title} not rezzed (CR ${CR.derez.number}).`,
        );
        return { ok: true };
      }
      source.rezzed = false;
      source.faceup = false;
      log(
        state,
        `Derez ${source.title} (CR ${CR.derez.number}, ${CR.derezByAbility.number}).`,
      );
      if (source.type === "ice") {
        if (state.run) state.run.iceDerezzedThisRun = true;
        fireHostRezStateTriggers(state, sourceId, "derez");
      }
      return { ok: true };
    }
    case "may_derez_installed": {
      const excludeSelf = action.excludeSelf !== false;
      const onlyIce = Boolean(action.onlyIce);
      const excludeAttacked = Boolean(action.excludeProtectingAttackedServer);
      const attacked = state.run?.attackedServerId;
      const targets: string[] = [];
      for (const [sid, server] of Object.entries(state.servers)) {
        if (excludeAttacked && attacked && sid === attacked) continue;
        for (const id of [...server.ice, ...server.root]) {
          const c = state.cards[id];
          if (!c?.rezzed) continue;
          if (onlyIce && c.type !== "ice") continue;
          if (excludeSelf && id === sourceId) continue;
          targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(
          state,
          `May derez installed — no other rezzed installed cards (CR ${CR.derez.number}).`,
        );
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        targets.map((id) => {
          const title = state.cards[id]!.title;
          const effects: Effect[] = [
            { op: "do", action: { kind: "derez_card", cardId: id } },
          ];
          if (action.then) {
            effects.push(structuredClone(action.then));
          }
          return {
            id: `derez:${id}`,
            label: `Derez ${title}`,
            effect:
              effects.length === 1
                ? effects[0]!
                : { op: "seq" as const, effects },
          };
        });
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options,
      };
      log(
        state,
        `${source.title} — may derez another installed card (CR ${CR.derez.number}).`,
      );
      return { ok: true };
    }
    case "trash_corp_card": {
      const card = state.cards[action.cardId];
      if (!card || card.side !== "corp") {
        log(
          state,
          `Trash corp card — ${card?.title ?? action.cardId} not a Corp card (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const installed =
        card.zone.endsWith(":ice") || card.zone.endsWith(":root");
      if (!installed) {
        log(
          state,
          `Trash corp card — ${card.title} not installed (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      trashCorpCardToArchives(state, action.cardId);
      log(
        state,
        `Trash ${card.title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "trash_installed": {
      const targets = trashInstalledLegalTargets(state, sourceId, action);
      if (targets.length === 0) {
        return {
          ok: false,
          error: "Must trash an installed Corp card — none available.",
          cites: [CR.trashing],
        };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        targets.map((id) => {
          const title = state.cards[id]!.title;
          const effects: Effect[] = [
            { op: "do", action: { kind: "trash_corp_card", cardId: id } },
          ];
          if (action.then) {
            effects.push(structuredClone(action.then));
          }
          return {
            id: `trash:${id}`,
            label: `Trash ${title}`,
            effect:
              effects.length === 1
                ? effects[0]!
                : { op: "seq" as const, effects },
          };
        });
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options,
      };
      log(
        state,
        `${source.title} — must trash an installed Corp card (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "trash_n_installed_corp": {
      const count = Math.max(1, action.count);
      const targets = trashInstalledLegalTargets(state, sourceId, {});
      if (targets.length < count) {
        return {
          ok: false,
          error: `Must trash ${count} installed Corp cards — only ${targets.length} available.`,
          cites: [CR.trashing],
        };
      }
      state.pendingChoice = {
        sourceId,
        chooser: action.chooser,
        options: targets.map((id) => ({
          id: `trash-n:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "trash_corp_card_then_trash_n" as const,
              cardId: id,
              remaining: count - 1,
              chooser: action.chooser,
            },
          },
        })),
      };
      log(
        state,
        `${source.title} — trash ${count} installed Corp card(s) (${action.chooser} chooses).`,
      );
      return { ok: true };
    }
    case "trash_corp_card_then_trash_n": {
      const trash = applyPrimitive(ctx, {
        kind: "trash_corp_card",
        cardId: action.cardId,
      });
      if (!trash.ok) return trash;
      if (action.remaining <= 0) return { ok: true };
      return applyPrimitive(ctx, {
        kind: "trash_n_installed_corp",
        count: action.remaining,
        chooser: action.chooser,
      });
    }
    case "realloc_two_rezzed_ice": {
      const rezzed: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (state.cards[id]?.rezzed) rezzed.push(id);
        }
      }
      if (rezzed.length < 2) {
        return {
          ok: false,
          error: "realloc() requires 2 rezzed ice.",
          cites: [CR.playOperation],
        };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: rezzed.map((id) => ({
          id: `realloc-first:${id}`,
          label: `Choose ${state.cards[id]!.title} (1 of 2)`,
          effect: {
            op: "do" as const,
            action: {
              kind: "realloc_pick_second" as const,
              firstIceId: id,
            },
          },
        })),
      };
      log(state, `${source.title} — choose first rezzed ice.`);
      return { ok: true };
    }
    case "realloc_pick_second": {
      const rezzed: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (id === action.firstIceId) continue;
          if (state.cards[id]?.rezzed) rezzed.push(id);
        }
      }
      if (rezzed.length === 0) {
        return {
          ok: false,
          error: "realloc() — no second rezzed ice.",
          cites: [CR.playOperation],
        };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: rezzed.map((id) => ({
          id: `realloc-second:${id}`,
          label: `Choose ${state.cards[id]!.title} (2 of 2)`,
          effect: {
            op: "do" as const,
            action: {
              kind: "realloc_resolve" as const,
              iceIds: [action.firstIceId, id] as [string, string],
            },
          },
        })),
      };
      log(state, `${source.title} — choose second rezzed ice.`);
      return { ok: true };
    }
    case "realloc_resolve": {
      for (const iceId of action.iceIds) {
        const ice = state.cards[iceId];
        if (!ice) continue;
        const gain = ice.rezCost ?? ice.installCost ?? 0;
        state.corp.credits += gain;
        if (ice.rezzed) {
          ice.rezzed = false;
          ice.faceup = false;
          fireHostRezStateTriggers(state, iceId, "derez");
        }
        log(
          state,
          `realloc() — gain ${gain}¢ from ${ice.title}, then derez.`,
        );
      }
      return { ok: true };
    }
    case "place_advancements_per_iced_rooted_remote": {
      let amount = 0;
      for (const server of Object.values(state.servers)) {
        if (server.kind !== "remote") continue;
        if (server.root.length > 0 && server.ice.length > 0) amount += 1;
      }
      const advanceable: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (c && (c.type === "agenda" || c.canAdvance)) {
            advanceable.push(id);
          }
        }
      }
      if (advanceable.length === 0) {
        log(
          state,
          `${source.title} — no advanceable installed card (0 iced rooted remotes counted: ${amount}).`,
        );
        return { ok: true };
      }
      if (advanceable.length === 1) {
        return evalEffect(ctx, {
          op: "do",
          action: {
            kind: "place_advancements_on",
            cardId: advanceable[0]!,
            amount,
          },
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: advanceable.map((id) => ({
          id: `adv-iced-remote:${id}`,
          label: `Place ${amount} advancement(s) on ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "place_advancements_on" as const,
              cardId: id,
              amount,
            },
          },
        })),
      };
      log(
        state,
        `${source.title} — choose advanceable card (${amount} iced rooted remote(s)).`,
      );
      return { ok: true };
    }
    case "may_add_archives_card_to_rd_top_or_bottom": {
      const archives = [...state.corp.discard];
      if (archives.length === 0) {
        log(state, `${source.title} — Archives empty.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-archives-rd",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const id of archives) {
        const title = state.cards[id]!.title;
        options.push({
          id: `arch-top:${id}`,
          label: `Add ${title} to top of R&D`,
          effect: {
            op: "do",
            action: {
              kind: "add_archives_card_to_rd",
              cardId: id,
              position: "top",
            },
          },
        });
        options.push({
          id: `arch-bottom:${id}`,
          label: `Add ${title} to bottom of R&D`,
          effect: {
            op: "do",
            action: {
              kind: "add_archives_card_to_rd",
              cardId: id,
              position: "bottom",
            },
          },
        });
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(state, `${source.title} — may move Archives card to R&D.`);
      return { ok: true };
    }
    case "add_archives_card_to_rd": {
      const cardId = action.cardId;
      if (!state.corp.discard.includes(cardId)) {
        log(state, `Archives→R&D — card not in Archives.`);
        return { ok: true };
      }
      const card = state.cards[cardId]!;
      state.corp.discard = state.corp.discard.filter((id) => id !== cardId);
      if (action.position === "top") {
        state.corp.deck.unshift(cardId);
      } else {
        state.corp.deck.push(cardId);
      }
      card.zone = "corp:rd";
      card.faceup = false;
      log(
        state,
        `Add ${card.title} to ${action.position} of R&D from Archives.`,
      );
      return { ok: true };
    }
    case "add_installed_runner_to_grip": {
      const targets = [...state.runner.rig];
      if (targets.length === 0) {
        log(state, `${source.title} — no installed Runner cards.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `grip:${id}`,
          label: `Add ${state.cards[id]!.title} to grip`,
          effect: {
            op: "do" as const,
            action: {
              kind: "add_installed_runner_card_to_grip" as const,
              cardId: id,
            },
          },
        })),
      };
      log(state, `${source.title} — choose installed Runner card for grip.`);
      return { ok: true };
    }
    case "add_installed_runner_card_to_grip": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.runner.rig.includes(cardId)) {
        log(state, `Add to grip — card not installed.`);
        return { ok: true };
      }
      state.runner.rig = state.runner.rig.filter((id) => id !== cardId);
      // Unhost hosted cards if any host relationship.
      for (const id of [...state.runner.rig]) {
        const c = state.cards[id];
        if (c?.hostId === cardId) {
          c.hostId = undefined;
        }
      }
      card.hostId = undefined;
      card.zone = "runner:grip";
      card.rezzed = false;
      state.runner.hand.push(cardId);
      log(state, `Add ${card.title} to the grip.`);
      return { ok: true };
    }
    case "install_and_rez_ice_from_archives": {
      const iceIds = state.corp.discard.filter(
        (id) => state.cards[id]?.type === "ice",
      );
      if (iceIds.length === 0) {
        log(state, `${source.title} — no ice in Archives.`);
        return { ok: true };
      }
      const discount = Math.max(0, action.totalDiscount ?? 0);
      const bpSubtype = action.badPublicityIfNotSubtype;
      const serverIds = Object.keys(state.servers) as import("../state/types.js").ServerId[];
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (const iceId of iceIds) {
        const ice = state.cards[iceId]!;
        const total = Math.max(
          0,
          (ice.installCost ?? 0) + (ice.rezCost ?? 0) - discount,
        );
        for (const sid of serverIds) {
          options.push({
            id: `reanim:${iceId}:${sid}`,
            label: `Install+rez ${ice.title} on ${sid} (${total}¢)`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_and_rez_archives_ice" as const,
                cardId: iceId,
                totalDiscount: discount,
                badPublicityIfNotSubtype: bpSubtype,
                serverId: sid,
              },
            },
          });
        }
        // Also offer new remote
        options.push({
          id: `reanim:${iceId}:new-remote`,
          label: `Install+rez ${ice.title} on new remote (${total}¢)`,
          effect: {
            op: "do" as const,
            action: {
              kind: "install_and_rez_archives_ice" as const,
              cardId: iceId,
              totalDiscount: discount,
              badPublicityIfNotSubtype: bpSubtype,
              serverId: "new-remote",
            },
          },
        });
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(
        state,
        `${source.title} — install and rez ice from Archives (−${discount}¢).`,
      );
      return { ok: true };
    }
    case "install_and_rez_archives_ice": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || card.type !== "ice" || !state.corp.discard.includes(cardId)) {
        log(state, `Reanimation — ice not in Archives.`);
        return { ok: true };
      }
      const discount = Math.max(0, action.totalDiscount ?? 0);
      const pay = Math.max(
        0,
        (card.installCost ?? 0) + (card.rezCost ?? 0) - discount,
      );
      if (state.corp.credits < pay) {
        return {
          ok: false,
          error: `Insufficient credits to install+rez ${card.title} (${pay}¢).`,
          cites: [CR.playOperation],
        };
      }
      state.corp.credits -= pay;
      state.corp.discard = state.corp.discard.filter((id) => id !== cardId);
      let destId = action.serverId as import("../state/types.js").ServerId | "new-remote";
      if (destId === "new-remote") {
        const remoteNum = state.nextRemoteNumber++;
        destId = `remote-${remoteNum}` as import("../state/types.js").ServerId;
        state.servers[destId] = {
          id: destId,
          kind: "remote",
          ice: [],
          root: [],
        };
      }
      const dest = state.servers[destId];
      if (!dest) {
        log(state, `Reanimation — invalid server.`);
        return { ok: true };
      }
      dest.ice.unshift(cardId);
      card.zone = `server:${destId}:ice`;
      card.rezzed = true;
      card.faceup = true;
      noteInstalledThisTurn(state, cardId);
      if (!(state.turn.rezzedThisTurnIds ?? []).includes(cardId)) {
        state.turn.rezzedThisTurnIds = [
          ...(state.turn.rezzedThisTurnIds ?? []),
          cardId,
        ];
      }
      log(
        state,
        `Install and rez ${card.title} from Archives on ${destId} for ${pay}¢ (−${discount}¢).`,
      );
      const needBp =
        action.badPublicityIfNotSubtype &&
        !(card.subtypes ?? []).includes(action.badPublicityIfNotSubtype);
      if (needBp) {
        const r = evalEffect(
          { state, sourceId },
          { op: "do", action: { kind: "give_bad_publicity", amount: 1 } },
        );
        if (!r.ok) return r;
      }
      if (card.onRez) {
        const r = evalEffect({ state, sourceId: cardId }, card.onRez);
        if (!r.ok) return r;
      }
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "may_trash_installed": {
      const excludeSelf = action.excludeSelf !== false;
      const rezzedOnly = Boolean(action.rezzedOnly);
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.ice, ...server.root]) {
          if (excludeSelf && id === sourceId) continue;
          const c = state.cards[id];
          if (!c || c.side !== "corp") continue;
          if (rezzedOnly && !c.rezzed) continue;
          targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(
          state,
          `May trash installed — no other installed Corp cards (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        targets.map((id) => {
          const title = state.cards[id]!.title;
          const effects: Effect[] = [
            { op: "do", action: { kind: "trash_corp_card", cardId: id } },
          ];
          if (action.then) {
            effects.push(structuredClone(action.then));
          }
          return {
            id: `trash:${id}`,
            label: `Trash ${title}`,
            effect:
              effects.length === 1
                ? effects[0]!
                : { op: "seq" as const, effects },
          };
        });
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options,
      };
      log(
        state,
        `${source.title} — may trash another installed card (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "must_trash_installed": {
      const excludeSelf = action.excludeSelf !== false;
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.ice, ...server.root]) {
          if (excludeSelf && id === sourceId) continue;
          const c = state.cards[id];
          if (!c || c.side !== "corp") continue;
          targets.push(id);
        }
      }
      if (targets.length === 0) {
        return {
          ok: false,
          error: "Must trash an installed Corp card — none available.",
          cites: [CR.trashing],
        };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        targets.map((id) => {
          const title = state.cards[id]!.title;
          return {
            id: `trash:${id}`,
            label: `Trash ${title}`,
            effect: {
              op: "do" as const,
              action: { kind: "trash_corp_card" as const, cardId: id },
            },
          };
        });
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options,
      };
      log(
        state,
        `${source.title} — must trash another installed card (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "forbid_bioroid_ice_paid_abilities_this_turn": {
      state.turn.bioroidIcePaidAbilitiesForbidden = true;
      log(
        state,
        `Runner cannot use paid abilities printed on bioroid ice for the remainder of this turn (CR ${CR.paidAbility.number}).`,
      );
      return { ok: true };
    }
    case "install_and_rez_asset_or_upgrade_free": {
      const pick =
        state.corp.hand.find((id) => {
          const t = state.cards[id].type;
          return t === "asset" || t === "upgrade";
        }) ??
        state.corp.discard.find((id) => {
          const t = state.cards[id].type;
          return t === "asset" || t === "upgrade";
        });
      if (!pick) {
        log(state, `Install+rez asset/upgrade — none in HQ/Archives.`);
        return { ok: true };
      }
      const card = state.cards[pick];
      state.corp.hand = state.corp.hand.filter((id) => id !== pick);
      state.corp.discard = state.corp.discard.filter((id) => id !== pick);
      let serverId: import("../state/types.js").ServerId;
      if (card.type === "upgrade") {
        // Prefer first remote, else create
        const remotes = Object.values(state.servers).filter(
          (s) => s.kind === "remote",
        );
        if (remotes.length > 0) {
          serverId = remotes[0]!.id;
        } else {
          const remoteNum = state.nextRemoteNumber++;
          serverId = `remote-${remoteNum}`;
          state.servers[serverId] = {
            id: serverId,
            kind: "remote",
            ice: [],
            root: [],
          };
        }
      } else {
        const remoteNum = state.nextRemoteNumber++;
        serverId = `remote-${remoteNum}`;
        state.servers[serverId] = {
          id: serverId,
          kind: "remote",
          ice: [],
          root: [],
        };
      }
      state.servers[serverId].root.push(pick);
      card.zone = `server:${serverId}:root`;
      card.rezzed = true;
      card.faceup = true;
      if ((card.hostedCreditsOnInstall ?? 0) > 0) {
        card.hostedCredits = card.hostedCreditsOnInstall;
      }
      if ((card.recurringCreditsMax ?? 0) > 0) {
        card.recurringCredits = card.recurringCreditsMax;
      }
      if ((card.badPublicityCountersOnRez ?? 0) > 0 && card.rezzed) {
        card.badPublicityCounters = card.badPublicityCountersOnRez;
      }
      log(
        state,
        `Install and rez ${card.title} on ${serverId} ignoring costs.`,
      );
      if (card.onRez) {
        const r = evalEffect({ state, sourceId: pick }, card.onRez);
        if (!r.ok) return r;
      }
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: pick }, card.onInstall);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "install_and_rez_from_archives_free": {
      const pick = state.corp.discard.find((id) => {
        const t = state.cards[id].type;
        return (
          t === "asset" || t === "upgrade" || t === "ice" || t === "agenda"
        );
      });
      if (!pick) {
        log(state, `Install+rez from Archives — none available.`);
        return { ok: true };
      }
      const card = state.cards[pick];
      state.corp.discard = state.corp.discard.filter((id) => id !== pick);
      const remoteNum = state.nextRemoteNumber++;
      const serverId =
        `remote-${remoteNum}` as import("../state/types.js").ServerId;
      state.servers[serverId] = {
        id: serverId,
        kind: "remote",
        ice: [],
        root: [],
      };
      if (card.type === "ice") {
        state.servers[serverId].ice.push(pick);
        card.zone = `server:${serverId}:ice`;
      } else {
        state.servers[serverId].root.push(pick);
        card.zone = `server:${serverId}:root`;
      }
      if (card.type !== "agenda") {
        card.rezzed = true;
      }
      card.faceup = true;
      if ((card.hostedCreditsOnInstall ?? 0) > 0) {
        card.hostedCredits = card.hostedCreditsOnInstall;
      }
      if ((card.recurringCreditsMax ?? 0) > 0) {
        card.recurringCredits = card.recurringCreditsMax;
      }
      log(
        state,
        `Install${card.type !== "agenda" ? " and rez" : ""} ${card.title} from Archives on ${serverId} ignoring costs.`,
      );
      if (card.onRez && card.rezzed) {
        const r = evalEffect({ state, sourceId: pick }, card.onRez);
        if (!r.ok) return r;
      }
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: pick }, card.onInstall);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "may_return_self_to_grip": {
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      if (state.runner.credits >= action.creditCost) {
        options.push({
          id: "return",
          label: `Pay ${action.creditCost}¢: add to grip`,
          effect: {
            op: "seq",
            effects: [
              {
                op: "do",
                action: {
                  kind: "lose_credits",
                  side: "runner",
                  amount: action.creditCost,
                },
              },
              { op: "do", action: { kind: "return_source_to_grip" } },
            ],
          },
        });
      }
      options.push({
        id: "decline",
        label: "Leave in heap",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "runner", amount: 0 },
        },
      });
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options,
      };
      log(
        state,
        `${source.title} — may pay ${action.creditCost}¢ to return to grip.`,
      );
      return { ok: true };
    }
    case "return_source_to_grip": {
      // Move source from heap to grip.
      state.runner.discard = state.runner.discard.filter((id) => id !== sourceId);
      if (!state.runner.hand.includes(sourceId)) {
        state.runner.hand.push(sourceId);
      }
      source.zone = "runner:grip";
      source.faceup = true;
      log(state, `Return ${source.title} to grip.`);
      return { ok: true };
    }
    case "return_source_to_hq": {
      if (source.side !== "corp") {
        return { ok: false, error: "return_source_to_hq requires Corp source", cites: [] };
      }
      removeCardFromCurrentZone(state, sourceId);
      state.corp.hand.push(sourceId);
      source.zone = "corp:hq";
      source.faceup = false;
      source.rezzed = false;
      log(state, `Add ${source.title} to HQ.`);
      return { ok: true };
    }

    case "install_resource_discount": {
      const matches = state.runner.hand.filter(
        (id) => state.cards[id].type === "resource",
      );
      if (matches.length === 0) {
        log(state, `Install resource discounted — none in grip.`);
        return { ok: true };
      }
      // Auto-first match, pay installCost - discount
      const id = matches[0]!;
      const card = state.cards[id];
      const cost = Math.max(0, card.installCost - action.discount);
      if (state.runner.credits < cost) {
        log(
          state,
          `Install ${card.title} discounted — cannot afford ${cost}¢.`,
        );
        return { ok: true };
      }
      state.runner.credits -= cost;
      state.runner.hand = state.runner.hand.filter((x) => x !== id);
      state.runner.rig.push(id);
      card.zone = "runner:rig";
      card.faceup = true;
      if ((card.recurringCreditsMax ?? 0) > 0) {
        card.recurringCredits = card.recurringCreditsMax;
      }
      if ((card.hostedCreditsOnInstall ?? 0) > 0) {
        card.hostedCredits = card.hostedCreditsOnInstall;
      }
      log(
        state,
        `Install ${card.title} for ${cost}¢ (${action.discount}¢ discount).`,
      );
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: id }, card.onInstall);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "install_grip_card": {
      return installGripCardDiscounted(
        state,
        action.cardId,
        action.discount,
        sourceId,
      );
    }
    case "may_charge_card": {
      return offerMayChargeCard(state, action.cardId, sourceId);
    }
    case "install_from_grip_discount": {
      const typeSet = new Set(action.types);
      const candidates = state.runner.hand.filter((id) => {
        const c = state.cards[id];
        if (!typeSet.has(c.type as "program" | "hardware" | "resource")) {
          return false;
        }
        if (c.installOnIce || (c.subtypes ?? []).includes("trojan")) {
          return false;
        }
        if (c.type === "program") {
          const need = effectiveMemoryCost(state, id);
          if (usedMemory(state) + need > memoryLimit(state)) return false;
        }
        const cost = gripInstallCostAfterDiscount(state, c, action.discount);
        return state.runner.credits >= cost;
      });
      if (candidates.length === 0) {
        log(
          state,
          `Install from grip discounted — no affordable ${action.types.join("/")}.`,
        );
        return { ok: true };
      }
      const buildEffect = (id: string): Effect => {
        const installFx: Effect = {
          op: "do",
          action: {
            kind: "install_grip_card",
            cardId: id,
            discount: action.discount,
          },
        };
        const tail: Effect[] = [];
        if (action.mayCharge) {
          tail.push({
            op: "do",
            action: { kind: "may_charge_card", cardId: id },
          });
        }
        if (action.thenOnInstall) {
          tail.push(action.thenOnInstall);
        }
        if (tail.length === 0) return installFx;
        return { op: "seq", effects: [installFx, ...tail] };
      };
      if (candidates.length === 1) {
        return evalEffect({ state, sourceId }, buildEffect(candidates[0]!));
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: candidates.map((id) => {
          const c = state.cards[id];
          const cost = gripInstallCostAfterDiscount(state, c, action.discount);
          return {
            id: `install-${id}`,
            label: `Install ${c.title} for ${cost}¢`,
            effect: buildEffect(id),
          };
        }),
      };
      log(
        state,
        `Install from grip — choose among ${candidates.length} cards (${action.discount}¢ discount).`,
      );
      return { ok: true };
    }
    case "give_bad_publicity": {
      state.corp.badPublicity = (state.corp.badPublicity ?? 0) + action.amount;
      log(
        state,
        `Corp takes ${action.amount} bad publicity → ${state.corp.badPublicity}.`,
      );
      fireFirstBadPublicityTake(state, action.amount);
      return { ok: true };
    }
    case "remove_bad_publicity": {
      const removed = Math.min(action.amount, state.corp.badPublicity ?? 0);
      state.corp.badPublicity = (state.corp.badPublicity ?? 0) - removed;
      log(
        state,
        `Corp removes ${removed} bad publicity → ${state.corp.badPublicity}.`,
      );
      return { ok: true };
    }
    case "shuffle_installed_runner_into_stack": {
      const installed: string[] = [];
      for (const id of state.runner.rig) {
        if (!state.cards[id]?.hostId) installed.push(id);
      }
      for (const card of Object.values(state.cards)) {
        if (
          card.side === "runner" &&
          card.hostId &&
          !installed.includes(card.id)
        ) {
          installed.push(card.id);
        }
      }
      if (installed.length === 0) {
        log(state, `Shuffle installed into stack — none installed.`);
        return { ok: true };
      }
      if (installed.length === 1) {
        return applyPrimitive(ctx, {
          kind: "shuffle_runner_card_into_stack",
          cardId: installed[0]!,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: installed.map((id) => ({
          id: `shuffle-stack:${id}`,
          label: `Shuffle ${state.cards[id]!.title} into the stack`,
          effect: {
            op: "do" as const,
            action: {
              kind: "shuffle_runner_card_into_stack" as const,
              cardId: id,
            },
          },
        })),
      };
      log(
        state,
        `${source.title} — choose an installed Runner card to shuffle into the stack.`,
      );
      return { ok: true };
    }
    case "shuffle_runner_card_into_stack": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || card.side !== "runner") {
        log(state, `Shuffle into stack — invalid card.`);
        return { ok: true };
      }
      removeCardFromCurrentZone(state, cardId);
      card.hostId = undefined;
      state.runner.deck.push(cardId);
      card.zone = "runner:stack";
      card.faceup = false;
      card.rezzed = false;
      // Shuffle the stack.
      for (let i = state.runner.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = state.runner.deck[i]!;
        state.runner.deck[i] = state.runner.deck[j]!;
        state.runner.deck[j] = tmp;
      }
      log(
        state,
        `Shuffle ${card.title} into the stack.`,
      );
      return { ok: true };
    }
    case "reveal_hq_gain_credits": {
      const n = Math.min(action.maxCards, state.corp.hand.length);
      const gain = n * action.creditsEach;
      state.corp.credits += gain;
      log(
        state,
        `Reveal ${n} card(s) from HQ → gain ${gain}¢ (${action.creditsEach}¢ each).`,
      );
      return { ok: true };
    }
    case "flip_identity": {
      if (source.type !== "identity") {
        log(state, `flip_identity — source is not an identity.`);
        return { ok: true };
      }
      const becomingFlipped = !source.identityFlipped;
      source.identityFlipped = becomingFlipped;
      log(
        state,
        `${source.title} flips to ${source.identityFlipped ? "back" : "front"} side` +
          (source.meliesChosenBackFace && becomingFlipped
            ? ` (${source.meliesChosenBackFace})`
            : "") +
          `.`,
      );
      if (becomingFlipped) {
        const fxHook = source.identityFlippedHooks?.onFlipToBackIfRunMatchesFace;
        const face = source.meliesChosenBackFace;
        const attacked = state.run?.attackedServerId;
        if (fxHook && face && attacked === face) {
          const r = evalEffect({ state, sourceId }, fxHook);
          if (!r.ok) return r;
        }
      }
      return { ok: true };
    }
    case "melies_secretly_set_face": {
      if (source.type !== "identity") {
        log(state, `melies_secretly_set_face — source is not an identity.`);
        return { ok: true };
      }
      // Always re-set on front; if already flipped, still allow choose for next cycle.
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: (
          [
            ["hq", "HQ"],
            ["rd", "R&D"],
            ["archives", "Archives"],
          ] as const
        ).map(([id, label]) => ({
          id: `melies-face:${id}`,
          label: `Secretly set Méliès U face: ${label}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "melies_set_face" as const,
              face: id,
            },
          },
        })),
      };
      log(state, `${source.title} — secretly set identity face.`);
      return { ok: true };
    }
    case "melies_set_face": {
      if (source.type !== "identity") {
        log(state, `melies_set_face — source is not an identity.`);
        return { ok: true };
      }
      source.meliesChosenBackFace = action.face;
      // Secret set always leaves Only the Brightest faceup.
      source.identityFlipped = false;
      log(
        state,
        `${source.title} secretly sets face to ${action.face} (front faceup).`,
      );
      return { ok: true };
    }
    case "look_top_rd_may_trash_if_do_archives_to_hq": {
      if (state.corp.deck.length === 0) {
        log(state, `Look at top of R&D — empty.`);
        return { ok: true };
      }
      const topId = state.corp.deck[0]!;
      const top = state.cards[topId]!;
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "leave-top",
            label: `Leave ${top.title} on top of R&D`,
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          {
            id: "trash-top-archives",
            label: `Trash ${top.title}; add 1 card from Archives to HQ`,
            effect: {
              op: "seq",
              effects: [
                { op: "do", action: { kind: "trash_top_of_rd" } },
                {
                  op: "do",
                  action: { kind: "archives_to_hq", amount: 1 },
                },
              ],
            },
          },
        ],
      };
      log(
        state,
        `Look at top of R&D (${top.title}) — may trash; if so, Archives → HQ.`,
      );
      return { ok: true };
    }
    case "may_host_one_from_grip_facedown_then_draw": {
      const max = source.maxHostedCards ?? Infinity;
      const have = source.hostedCardIds?.length ?? 0;
      if (have >= max) {
        log(state, `${source.title} — hosted card limit reached.`);
        return { ok: true };
      }
      const grip = [...state.runner.hand];
      if (grip.length === 0) {
        log(state, `${source.title} — grip empty; cannot host.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          ...grip.map((cardId) => ({
            id: `host-grip:${cardId}`,
            label: `Host ${state.cards[cardId]!.title} facedown: draw 1`,
            effect: {
              op: "do" as const,
              action: {
                kind: "host_grip_card_facedown_then_draw" as const,
                cardId,
              },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "runner" as const,
                amount: 0,
              },
            },
          },
        ],
      };
      log(state, `${source.title} — may host 1 from grip facedown to draw 1.`);
      return { ok: true };
    }
    case "host_grip_card_facedown_then_draw": {
      const max = source.maxHostedCards ?? Infinity;
      const have = source.hostedCardIds?.length ?? 0;
      if (have >= max) {
        log(state, `${source.title} — hosted card limit reached.`);
        return { ok: true };
      }
      if (!state.runner.hand.includes(action.cardId)) {
        log(state, `Host from grip — ${action.cardId} not in grip.`);
        return { ok: true };
      }
      state.runner.hand = state.runner.hand.filter((id) => id !== action.cardId);
      const card = state.cards[action.cardId]!;
      card.hostId = sourceId;
      card.faceup = false;
      card.zone = `hosted:${sourceId}`;
      if (!source.hostedCardIds) source.hostedCardIds = [];
      source.hostedCardIds.push(action.cardId);
      log(state, `${source.title} hosts a card facedown from grip.`);
      // Draw 1
      if (state.runner.deck.length === 0) {
        log(state, `Draw — stack empty.`);
        return { ok: true };
      }
      const drawn = state.runner.deck.shift()!;
      state.runner.hand.push(drawn);
      state.cards[drawn]!.zone = "runner:grip";
      log(state, `Runner draws 1 card.`);
      return { ok: true };
    }
    case "shuffle_hosted_cards_into_stack": {
      const hosted = [...(source.hostedCardIds ?? [])];
      source.hostedCardIds = [];
      for (const id of hosted) {
        const card = state.cards[id];
        if (!card) continue;
        card.hostId = undefined;
        card.faceup = false;
        card.zone = "runner:stack";
        state.runner.deck.push(id);
      }
      // Fisher-Yates shuffle stack
      for (let i = state.runner.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = state.runner.deck[i]!;
        state.runner.deck[i] = state.runner.deck[j]!;
        state.runner.deck[j] = tmp;
      }
      log(
        state,
        `${source.title} — shuffle ${hosted.length} hosted card(s) into stack.`,
      );
      return { ok: true };
    }
    case "look_top_stack_may_reveal_breaker_or_run_event": {
      const top = state.runner.deck[0];
      if (!top) {
        log(state, `Look top of stack — empty.`);
        return { ok: true };
      }
      const card = state.cards[top]!;
      const isBreaker = (card.subtypes ?? []).includes("icebreaker");
      const isRunEvent =
        card.type === "event" && (card.subtypes ?? []).includes("run");
      log(
        state,
        `Look top of stack — ${card.title}${isBreaker || isRunEvent ? "" : " (no reveal)"}.`,
      );
      if (!isBreaker && !isRunEvent) {
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "decline",
            label: "Leave on top of stack",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
          {
            id: `reveal-top:${top}`,
            label: `Reveal ${card.title} and add to grip`,
            effect: {
              op: "do",
              action: {
                kind: "reveal_runner_stack_top_to_grip",
                cardId: top,
              },
            },
          },
        ],
      };
      return { ok: true };
    }
    case "reveal_runner_stack_top_to_grip": {
      const cardId = action.cardId;
      if (state.runner.deck[0] !== cardId) {
        log(state, `Reveal stack top — card is no longer on top.`);
        return { ok: true };
      }
      state.runner.deck.shift();
      state.runner.hand.push(cardId);
      const card = state.cards[cardId]!;
      card.zone = "runner:grip";
      card.faceup = true;
      log(state, `Reveal ${card.title} from top of stack → grip.`);
      return { ok: true };
    }
    case "peer_review": {
      const hqLen = state.corp.hand.length;
      const revealN = Math.max(0, hqLen - 1);
      if (revealN > 0) {
        // Reveal all but 1: leave the last HQ card hidden for bookkeeping.
        for (const id of state.corp.hand.slice(0, revealN)) {
          state.cards[id]!.faceup = true;
        }
      }
      state.corp.credits += 7;
      log(
        state,
        `Peer Review — reveal ${revealN} HQ card(s); gain 7¢ → ${state.corp.credits}¢.`,
      );
      const hqCards = state.corp.hand.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "agenda" || t === "asset" || t === "upgrade";
      });
      const affordable = hqCards.filter(
        (id) =>
          creditsAvailableForInstall(state, "corp") >=
          (state.cards[id]!.installCost ?? 0),
      );
      if (affordable.length === 0) {
        log(state, `Peer Review — no affordable root install from HQ.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline",
            label: "Decline install",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...affordable.map((id) => ({
            id: `peer-install:${id}`,
            label: `Install ${state.cards[id]!.title} in a new remote root for ${state.cards[id]!.installCost ?? 0}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_hq_card_paying_costs" as const,
                cardId: id,
              },
            },
          })),
        ],
      };
      log(state, `Peer Review — may install 1 card from HQ in a remote root.`);
      return { ok: true };
    }
    case "bigger_picture_remove_tags": {
      const max = state.runner.tags;
      if (max <= 0) {
        log(state, `Bigger Picture — Runner has no tags to remove.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (let n = 0; n <= max; n++) {
        options.push({
          id: `remove-${n}`,
          label:
            n === 0
              ? "Remove 0 tags"
              : `Remove ${n} tag(s) (Runner loses ${n * 5}¢)`,
          effect: {
            op: "seq",
            effects: [
              {
                op: "do",
                action: { kind: "remove_tags", amount: n },
              },
              {
                op: "do",
                action: {
                  kind: "lose_credits",
                  side: "runner",
                  amount: n * 5,
                  gainPerCreditLost: { side: "corp", per: 1 },
                },
              },
            ],
          },
        });
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(state, `Bigger Picture — choose how many tags to remove.`);
      return { ok: true };
    }
    case "mitra_aman_approach_ice": {
      releaseHostedCardsOnTrash(state, sourceId);
      removeCardFromCurrentZone(state, sourceId);
      state.corp.discard.push(sourceId);
      source.zone = "corp:archives";
      source.faceup = true;
      state.corp.credits += 3;
      log(
        state,
        `Mitra Aman trashed → gain 3¢ (${state.corp.credits}¢).`,
      );
      const run = state.run;
      if (!run || run.position === null) {
        log(state, `Mitra Aman — no approached ice.`);
        return { ok: true };
      }
      const approachedId =
        state.servers[run.attackedServerId]?.ice[run.position];
      if (!approachedId) {
        log(state, `Mitra Aman — no approached ice.`);
        return { ok: true };
      }
      const candidates: string[] = [];
      for (const id of state.corp.hand) {
        if (state.cards[id]?.type === "ice") candidates.push(id);
      }
      for (const id of state.corp.discard) {
        if (state.cards[id]?.type === "ice") candidates.push(id);
      }
      if (candidates.length === 0) {
        log(state, `Mitra Aman — no ice in HQ or Archives to swap.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline",
          label: "Decline swap",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
        ...candidates.map((iceId) => ({
          id: iceId,
          label: `Swap with ${state.cards[iceId]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "swap_approached_ice_with_hq_or_archives" as const,
              replacementIceId: iceId,
            },
          },
        })),
      ];
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(state, `Mitra Aman — may swap approached ice.`);
      return { ok: true };
    }
    case "plutus_pay_rez_additional_cost": {
      const agendas = [...state.corp.score];
      const hqCount = state.corp.hand.length;
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      if (agendas.length > 0) {
        for (const agId of agendas) {
          if (state.cards[agId]?.cannotForfeit) continue;
          options.push({
            id: `forfeit:${agId}`,
            label: `Forfeit ${state.cards[agId]!.title}`,
            effect: {
              op: "do",
              action: { kind: "forfeit_scored_agenda", cardId: agId },
            },
          });
        }
      }
      if (hqCount >= 3) {
        options.push({
          id: "trash-hq-3",
          label: "Reveal and trash 3 cards from HQ",
          effect: {
            op: "do",
            action: {
              kind: "trash_hq",
              amount: 3,
              pick: "choose",
            },
          },
        });
      }
      if (options.length === 0) {
        return {
          ok: false,
          error: "Plutus rez cost: need a scored agenda or 3+ cards in HQ.",
          cites: [CR.rezProcedure],
        };
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(state, `Plutus — pay additional rez cost.`);
      return { ok: true };
    }
    case "forfeit_scored_agenda": {
      const cardId = action.cardId;
      if (!state.corp.score.includes(cardId)) {
        return {
          ok: false,
          error: "Agenda not in Corp score area.",
          cites: [CR.scoringAgenda],
        };
      }
      if (state.cards[cardId]?.cannotForfeit) {
        return {
          ok: false,
          error: "This agenda cannot be forfeited.",
          cites: [CR.scoringAgenda],
        };
      }
      state.corp.score = state.corp.score.filter((id) => id !== cardId);
      const card = state.cards[cardId]!;
      if (card.onForfeit) {
        const r = evalEffect({ state, sourceId: cardId }, card.onForfeit);
        if (!r.ok) return r;
      }
      state.corp.discard.push(cardId);
      card.zone = "corp:archives";
      card.faceup = true;
      log(state, `Forfeit ${card.title} (Plutus rez cost).`);
      return { ok: true };
    }
    case "forfeit_self": {
      const cardId = sourceId;
      if (!state.corp.score.includes(cardId)) {
        return {
          ok: false,
          error: "Source agenda not in Corp score area.",
          cites: [CR.scoringAgenda],
        };
      }
      if (state.cards[cardId]?.cannotForfeit) {
        return {
          ok: false,
          error: "This agenda cannot be forfeited.",
          cites: [CR.scoringAgenda],
        };
      }
      state.corp.score = state.corp.score.filter((id) => id !== cardId);
      const card = state.cards[cardId]!;
      if (card.onForfeit) {
        const r = evalEffect({ state, sourceId: cardId }, card.onForfeit);
        if (!r.ok) return r;
      }
      state.corp.discard.push(cardId);
      card.zone = "corp:archives";
      card.faceup = true;
      log(state, `Forfeit ${card.title}.`);
      return { ok: true };
    }
    case "plutus_may_play_transaction_from_archives": {
      const ops = state.corp.discard.filter((id) => {
        const c = state.cards[id];
        return (
          c?.type === "operation" &&
          (c.subtypes ?? []).includes("transaction")
        );
      });
      if (ops.length === 0) {
        log(state, `Plutus — no transaction operations in Archives.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...ops.map((cardId) => ({
            id: cardId,
            label: `Play ${state.cards[cardId]!.title} from Archives`,
            effect: {
              op: "do" as const,
              action: {
                kind: "play_archives_transaction_then_rfg" as const,
                cardId,
              },
            },
          })),
        ],
      };
      log(state, `Plutus — may play 1 transaction operation from Archives.`);
      return { ok: true };
    }
    case "play_archives_transaction_then_rfg": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (
        !card ||
        card.type !== "operation" ||
        !state.corp.discard.includes(cardId)
      ) {
        log(state, `play_archives_transaction_then_rfg — not in Archives.`);
        return { ok: true };
      }
      const cost = card.playCost ?? 0;
      if (state.corp.credits < cost) {
        return {
          ok: false,
          error: "Insufficient credits to play operation from Archives.",
          cites: [CR.playOperation],
        };
      }
      state.corp.credits -= cost;
      state.corp.discard = state.corp.discard.filter((id) => id !== cardId);
      card.zone = "corp:play-area";
      card.faceup = true;
      state.turn.corpActionTypeCounts.play_operation =
        (state.turn.corpActionTypeCounts.play_operation ?? 0) + 1;
      log(state, `Corp plays ${card.title} from Archives for ${cost}¢ (Plutus).`);
      if (card.onPlay) {
        const r = evalEffect({ state, sourceId: cardId }, card.onPlay);
        if (!r.ok) return r;
      }
      removeCardFromCurrentZone(state, cardId);
      card.zone = "removed-from-game";
      card.faceup = true;
      if (!state.removedFromGame.includes(cardId)) {
        state.removedFromGame.push(cardId);
      }
      log(state, `${card.title} removed from the game after resolving.`);
      return { ok: true };
    }
    case "ip_enforcement_remove_tags": {
      const max = state.runner.tags;
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (let n = 0; n <= max; n++) {
        options.push({
          id: `remove-${n}`,
          label: n === 0 ? "Remove 0 tags" : `Remove ${n} tag(s)`,
          effect: {
            op: "seq",
            effects: [
              {
                op: "do",
                action: { kind: "remove_tags", amount: n },
              },
              {
                op: "do",
                action: {
                  kind: "store_ip_enforcement_tags_removed",
                  amount: n,
                },
              },
            ],
          },
        });
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(state, `IP Enforcement — choose how many tags to remove.`);
      return { ok: true };
    }
    case "store_ip_enforcement_tags_removed": {
      state.turn.ipEnforcementTagsRemoved = action.amount;
      return { ok: true };
    }
    case "ip_enforcement_install_from_runner_score": {
      const x = state.turn.ipEnforcementTagsRemoved ?? 0;
      const candidates = state.runner.score.filter((id) => {
        const c = state.cards[id];
        return c?.type === "agenda" && (c.agendaPoints ?? 0) === x;
      });
      if (candidates.length === 0) {
        log(
          state,
          `IP Enforcement — no agenda in Runner score area with ${x} agenda point(s).`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: candidates.map((cardId) => ({
          id: cardId,
          label: `Install ${state.cards[cardId]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "install_runner_score_agenda_on_remote" as const,
              cardId,
              placeAdvancementIfRunnerTagged: true,
            },
          },
        })),
      };
      log(state, `IP Enforcement — install agenda (${x} point(s)) from Runner score.`);
      return { ok: true };
    }
    case "charm_offensive_trash_rezzed_accessed": {
      const run = state.run;
      if (!run) {
        log(state, `Charm Offensive — no run at run end.`);
        return { ok: true };
      }
      const titles = new Set<string>();
      for (const id of run.accessedCardIds ?? []) {
        const c = state.cards[id];
        if (c?.title) titles.add(c.title);
      }
      const candidates: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (!c?.rezzed || !titles.has(c.title)) continue;
          candidates.push(id);
        }
      }
      if (candidates.length === 0) {
        log(state, `Charm Offensive — no rezzed copy of an accessed card.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          ...candidates.map((cardId) => ({
            id: cardId,
            label: `Trash ${state.cards[cardId]!.title}`,
            effect: {
              op: "do" as const,
              action: { kind: "trash_corp_card" as const, cardId },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
      };
      log(state, `Charm Offensive — may trash 1 rezzed copy of an accessed card.`);
      return { ok: true };
    }
    case "host_all_programs_from_grip": {
      const programs = state.runner.hand.filter(
        (id) => state.cards[id]?.type === "program",
      );
      if (programs.length === 0) {
        log(state, `${source.title} — no programs in grip to host.`);
        return { ok: true };
      }
      if (!source.hostedCardIds) source.hostedCardIds = [];
      for (const id of programs) {
        state.runner.hand = state.runner.hand.filter((x) => x !== id);
        const card = state.cards[id]!;
        card.hostId = sourceId;
        card.faceup = true;
        card.zone = `hosted:${sourceId}`;
        source.hostedCardIds.push(id);
      }
      log(
        state,
        `${source.title} hosts ${programs.length} program(s) from grip.`,
      );
      return { ok: true };
    }
    case "may_install_one_hosted_program": {
      const hosted = (source.hostedCardIds ?? []).filter(
        (id) => state.cards[id]?.type === "program",
      );
      if (hosted.length === 0) {
        log(state, `${source.title} — no hosted programs to install.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          ...hosted.map((cardId) => ({
            id: cardId,
            label: `Install ${state.cards[cardId]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_hosted_program" as const,
                cardId,
              },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
      };
      log(state, `${source.title} — may install 1 hosted program.`);
      return { ok: true };
    }
    case "install_hosted_program": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (
        !card ||
        card.type !== "program" ||
        !(source.hostedCardIds ?? []).includes(cardId)
      ) {
        log(state, `install_hosted_program — invalid hosted program.`);
        return { ok: true };
      }
      const need = effectiveMemoryCost(state, cardId);
      if (usedMemory(state) + need > memoryLimit(state)) {
        log(state, `install_hosted_program — insufficient MU.`);
        return { ok: true };
      }
      const cost = Math.max(0, card.installCost ?? 0);
      if (state.runner.credits < cost) {
        log(state, `install_hosted_program — insufficient credits (${cost}¢).`);
        return { ok: true };
      }
      state.runner.credits -= cost;
      source.hostedCardIds = (source.hostedCardIds ?? []).filter(
        (id) => id !== cardId,
      );
      card.hostId = undefined;
      card.zone = "runner:rig";
      card.faceup = true;
      state.runner.rig.push(cardId);
      noteVirusProgramInstalled(state, cardId);
      noteProgramOrHardwareInstalled(state, cardId);
      log(state, `Install hosted ${card.title} for ${cost}¢.`);
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "may_host_one_program_or_hardware_from_grip_faceup": {
      const max = source.maxHostedCards ?? Infinity;
      const have = source.hostedCardIds?.length ?? 0;
      if (have >= max) {
        log(state, `${source.title} — hosted card limit reached.`);
        return { ok: true };
      }
      const grip = state.runner.hand.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "program" || t === "hardware";
      });
      if (grip.length === 0) {
        log(state, `${source.title} — no program/hardware in grip to host.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          ...grip.map((cardId) => ({
            id: `host-grip-faceup:${cardId}`,
            label: `Host ${state.cards[cardId]!.title} faceup`,
            effect: {
              op: "do" as const,
              action: {
                kind: "host_grip_program_or_hardware_faceup" as const,
                cardId,
              },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "runner" as const,
                amount: 0,
              },
            },
          },
        ],
      };
      log(
        state,
        `${source.title} — may host 1 program or hardware from grip faceup.`,
      );
      return { ok: true };
    }
    case "host_grip_program_or_hardware_faceup": {
      const max = source.maxHostedCards ?? Infinity;
      const have = source.hostedCardIds?.length ?? 0;
      if (have >= max) {
        log(state, `${source.title} — hosted card limit reached.`);
        return { ok: true };
      }
      if (!state.runner.hand.includes(action.cardId)) {
        log(state, `Host from grip — ${action.cardId} not in grip.`);
        return { ok: true };
      }
      const card = state.cards[action.cardId]!;
      if (card.type !== "program" && card.type !== "hardware") {
        log(state, `Host from grip — not a program or hardware.`);
        return { ok: true };
      }
      state.runner.hand = state.runner.hand.filter((id) => id !== action.cardId);
      card.hostId = sourceId;
      card.faceup = true;
      card.zone = `hosted:${sourceId}`;
      if (!source.hostedCardIds) source.hostedCardIds = [];
      source.hostedCardIds.push(action.cardId);
      log(state, `${source.title} hosts ${card.title} faceup from grip.`);
      return { ok: true };
    }
    case "may_install_one_hosted_card": {
      const hosted = (source.hostedCardIds ?? []).filter((id) => {
        const t = state.cards[id]?.type;
        return t === "program" || t === "hardware";
      });
      if (hosted.length === 0) {
        log(state, `${source.title} — no hosted program/hardware to install.`);
        return { ok: true };
      }
      const discountFlag = Boolean(
        action.firstThisTurnDiscountPerUniqueConnection,
      );
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          ...hosted.map((cardId) => ({
            id: cardId,
            label: `Install ${state.cards[cardId]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_hosted_card" as const,
                cardId,
                ...(discountFlag
                  ? { firstThisTurnDiscountPerUniqueConnection: true }
                  : {}),
              },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
      };
      log(state, `${source.title} — may install 1 hosted card.`);
      return { ok: true };
    }
    case "install_hosted_card": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (
        !card ||
        (card.type !== "program" && card.type !== "hardware") ||
        !(source.hostedCardIds ?? []).includes(cardId)
      ) {
        log(state, `install_hosted_card — invalid hosted card.`);
        return { ok: true };
      }
      if (card.type === "program") {
        const need = effectiveMemoryCost(state, cardId);
        if (usedMemory(state) + need > memoryLimit(state)) {
          log(state, `install_hosted_card — insufficient MU.`);
          return { ok: true };
        }
      }
      let cost = Math.max(0, card.installCost ?? 0);
      if (
        action.firstThisTurnDiscountPerUniqueConnection &&
        !state.turn.paulesCafeInstallUsedThisTurn
      ) {
        const uniqueConnections = state.runner.rig.filter((id) => {
          const c = state.cards[id];
          return (
            Boolean(c?.unique) && (c?.subtypes ?? []).includes("connection")
          );
        }).length;
        cost = Math.max(0, cost - uniqueConnections);
        state.turn.paulesCafeInstallUsedThisTurn = true;
      }
      if (state.runner.credits < cost) {
        log(state, `install_hosted_card — insufficient credits (${cost}¢).`);
        return { ok: true };
      }
      state.runner.credits -= cost;
      source.hostedCardIds = (source.hostedCardIds ?? []).filter(
        (id) => id !== cardId,
      );
      card.hostId = undefined;
      card.zone = "runner:rig";
      card.faceup = true;
      state.runner.rig.push(cardId);
      noteVirusProgramInstalled(state, cardId);
      noteProgramOrHardwareInstalled(state, cardId);
      log(state, `Install hosted ${card.title} for ${cost}¢.`);
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "gamedragon_may_host_on_icebreaker": {
      const allowAi = Boolean(action.allowAi);
      const requireHost = Boolean(action.requireHost);
      const breakers = state.runner.rig.filter((id) => {
        const c = state.cards[id];
        if (!c?.breaker && !(c?.subtypes ?? []).includes("icebreaker")) {
          return false;
        }
        if (!allowAi && (c.subtypes ?? []).includes("ai")) return false;
        return true;
      });
      if (breakers.length === 0) {
        log(
          state,
          allowAi
            ? `${source.title} — no icebreaker to host on.`
            : `${source.title} — no non-AI icebreaker to host on.`,
        );
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        breakers.map((icebreakerId) => ({
          id: icebreakerId,
          label: `Host on ${state.cards[icebreakerId]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "host_hardware_on_icebreaker" as const,
              icebreakerId,
            },
          },
        }));
      if (!requireHost) {
        options.push({
          id: "decline",
          label: "Decline",
          effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
        });
      }
      state.pendingChoice = { sourceId, chooser: "runner", options };
      log(
        state,
        requireHost
          ? `${source.title} — host on an icebreaker.`
          : `${source.title} — may host on a${allowAi ? "" : " non-AI"} icebreaker.`,
      );
      return { ok: true };
    }
    case "host_hardware_on_icebreaker": {
      const br = state.cards[action.icebreakerId];
      if (!br || !state.runner.rig.includes(action.icebreakerId)) {
        log(state, `host_hardware_on_icebreaker — invalid icebreaker.`);
        return { ok: true };
      }
      source.hostId = action.icebreakerId;
      log(state, `${source.title} hosted on ${br.title}.`);
      return { ok: true };
    }
    case "search_stack_same_title_may_install_paying": {
      const title = source.title;
      const matches = state.runner.deck.filter(
        (id) => state.cards[id]?.title === title,
      );
      if (matches.length === 0) {
        shuffleRunnerStack(state);
        log(state, `Search stack for ${title} — none found.`);
        return { ok: true };
      }
      const id = matches[0]!;
      state.runner.deck = state.runner.deck.filter((x) => x !== id);
      state.runner.hand.push(id);
      state.cards[id]!.zone = "runner:grip";
      state.cards[id]!.faceup = true;
      shuffleRunnerStack(state);
      log(state, `Search stack — reveal ${state.cards[id]!.title} and add to grip.`);
      const card = state.cards[id]!;
      const cost = gripInstallCostAfterDiscount(state, card, 0);
      const canInstall =
        ["program", "hardware", "resource"].includes(card.type) &&
        creditsAvailableForInstall(state, "runner", card) >= cost;
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-install",
          label: "Decline install",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "runner", amount: 0 },
          },
        },
      ];
      if (canInstall) {
        options.unshift({
          id: `install:${id}`,
          label: `Install ${card.title} for ${cost}¢`,
          effect: {
            op: "do",
            action: {
              kind: "install_grip_card",
              cardId: id,
              discount: 0,
            },
          },
        });
      }
      state.pendingChoice = { sourceId, chooser: "runner", options };
      log(state, `${source.title} — may install ${card.title} from grip.`);
      return { ok: true };
    }
    case "trash_rezzed_ice_gain_credits": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (state.cards[id]?.rezzed) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `${source.title} — no rezzed ice to trash.`);
        return { ok: true };
      }
      if (targets.length === 1) {
        return applyPrimitive(ctx, {
          kind: "trash_rezzed_ice_gain_credits_resolve",
          cardId: targets[0]!,
          amount: action.amount,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `trash-rezzed-ice:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "trash_rezzed_ice_gain_credits_resolve" as const,
              cardId: id,
              amount: action.amount,
            },
          },
        })),
      };
      log(state, `${source.title} — choose a rezzed ice to trash.`);
      return { ok: true };
    }
    case "trash_rezzed_ice_gain_credits_resolve": {
      const card = state.cards[action.cardId];
      if (!card?.rezzed || card.type !== "ice") {
        log(state, `Trash rezzed ice — invalid target.`);
        return { ok: true };
      }
      trashCorpCardToArchives(state, action.cardId);
      state.corp.credits += action.amount;
      log(
        state,
        `${source.title} — trash ${card.title}, gain ${action.amount}¢.`,
      );
      return { ok: true };
    }
    case "install_up_to_from_hq_paying_costs": {
      return applyPrimitive(ctx, {
        kind: "install_up_to_from_hq_paying_costs_continue",
        remaining: Math.max(0, action.max),
      });
    }
    case "install_up_to_from_hq_paying_costs_continue": {
      let remaining = Math.max(0, action.remaining);
      if (action.justInstalledId && action.serverId) {
        const id = action.justInstalledId;
        const card = state.cards[id];
        if (card && state.corp.hand.includes(id)) {
          const cost = card.installCost ?? 0;
          if (creditsAvailableForInstall(state, "corp") >= cost) {
            let serverId: import("../state/types.js").ServerId;
            if (action.serverId === "__new_remote__") {
              const remoteNum = state.nextRemoteNumber++;
              serverId =
                `remote-${remoteNum}` as import("../state/types.js").ServerId;
              state.servers[serverId] = {
                id: serverId,
                kind: "remote",
                ice: [],
                root: [],
              };
              log(state, `Create ${serverId} for HQ install.`);
            } else {
              serverId =
                action.serverId as import("../state/types.js").ServerId;
            }
            const dest = state.servers[serverId];
            if (dest) {
              spendCreditsForInstall(state, "corp", cost);
              state.corp.hand = state.corp.hand.filter((cid) => cid !== id);
              const asIce = Boolean(action.asIce) || card.type === "ice";
              if (asIce) {
                dest.ice.unshift(id);
                card.zone = `server:${serverId}:ice`;
              } else {
                dest.root.push(id);
                card.zone = `server:${serverId}:root`;
              }
              card.rezzed = false;
              card.faceup = false;
              if (card.type === "agenda" || card.type === "asset") {
                card.advancementTokens = card.advancementTokens ?? 0;
              }
              noteInstalledThisTurn(state, id);
              state.turn.corpInstalledFromHqThisTurn = true;
              remaining = Math.max(0, remaining - 1);
              log(
                state,
                `Install ${card.title} from HQ on ${serverId} for ${cost}¢ (${remaining} remaining).`,
              );
              if (card.onInstall) {
                const r = evalEffect({ state, sourceId: id }, card.onInstall);
                if (!r.ok) return r;
              }
            }
          }
        }
      }
      if (remaining <= 0) return { ok: true };
      const installable = state.corp.hand.filter((id) => {
        const t = state.cards[id]?.type;
        if (t !== "agenda" && t !== "asset" && t !== "upgrade" && t !== "ice") {
          return false;
        }
        return (
          creditsAvailableForInstall(state, "corp") >=
          (state.cards[id]!.installCost ?? 0)
        );
      });
      if (installable.length === 0) {
        log(state, `${source.title} — no affordable HQ cards to install.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "done-hq-installs",
          label: "Done",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const cardId of installable) {
        const card = state.cards[cardId]!;
        const cost = card.installCost ?? 0;
        if (card.type === "ice") {
          for (const server of Object.values(state.servers)) {
            options.push({
              id: `hq-ice:${cardId}:${server.id}`,
              label: `Install ${card.title} protecting ${server.id} (${cost}¢)`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "install_up_to_from_hq_paying_costs_continue" as const,
                  remaining,
                  justInstalledId: cardId,
                  serverId: server.id,
                  asIce: true,
                },
              },
            });
          }
          options.push({
            id: `hq-ice:${cardId}:new`,
            label: `Install ${card.title} protecting a new remote (${cost}¢)`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_up_to_from_hq_paying_costs_continue" as const,
                remaining,
                justInstalledId: cardId,
                serverId: "__new_remote__",
                asIce: true,
              },
            },
          });
        } else if (card.type === "upgrade") {
          for (const server of Object.values(state.servers)) {
            options.push({
              id: `hq-up:${cardId}:${server.id}`,
              label: `Install ${card.title} in ${server.id} root (${cost}¢)`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "install_up_to_from_hq_paying_costs_continue" as const,
                  remaining,
                  justInstalledId: cardId,
                  serverId: server.id,
                  asIce: false,
                },
              },
            });
          }
        } else {
          for (const server of Object.values(state.servers)) {
            if (server.kind !== "remote") continue;
            options.push({
              id: `hq-root:${cardId}:${server.id}`,
              label: `Install ${card.title} in ${server.id} root (${cost}¢)`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "install_up_to_from_hq_paying_costs_continue" as const,
                  remaining,
                  justInstalledId: cardId,
                  serverId: server.id,
                  asIce: false,
                },
              },
            });
          }
          options.push({
            id: `hq-root:${cardId}:new`,
            label: `Install ${card.title} in a new remote (${cost}¢)`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_up_to_from_hq_paying_costs_continue" as const,
                remaining,
                justInstalledId: cardId,
                serverId: "__new_remote__",
                asIce: false,
              },
            },
          });
        }
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(
        state,
        `${source.title} — install up to ${remaining} more from HQ paying costs.`,
      );
      return { ok: true };
    }
    case "deja_vu_from_heap": {
      const heap = [...state.runner.discard];
      if (heap.length === 0) {
        log(state, `${source.title} — heap empty.`);
        return { ok: true };
      }
      const viruses = heap.filter((id) =>
        (state.cards[id]?.subtypes ?? []).includes("virus"),
      );
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (const id of heap) {
        options.push({
          id: `deja1:${id}`,
          label: `Add ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "deja_vu_add_heap_cards" as const,
              cardIds: [id],
            },
          },
        });
      }
      for (let i = 0; i < viruses.length; i++) {
        for (let j = i + 1; j < viruses.length; j++) {
          const a = viruses[i]!;
          const b = viruses[j]!;
          options.push({
            id: `deja2:${a}:${b}`,
            label: `Add ${state.cards[a]!.title} and ${state.cards[b]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "deja_vu_add_heap_cards" as const,
                cardIds: [a, b],
              },
            },
          });
        }
      }
      state.pendingChoice = { sourceId, chooser: "runner", options };
      log(
        state,
        `${source.title} — add 1 card (or up to 2 virus cards) from heap to grip.`,
      );
      return { ok: true };
    }
    case "deja_vu_add_heap_cards": {
      for (const id of action.cardIds) {
        const idx = state.runner.discard.indexOf(id);
        if (idx < 0) continue;
        state.runner.discard.splice(idx, 1);
        state.runner.hand.push(id);
        state.cards[id]!.zone = "runner:grip";
        state.cards[id]!.faceup = false;
        log(state, `Add ${state.cards[id]!.title} from heap to grip.`);
      }
      return { ok: true };
    }
    case "search_stack_subtype_add_to_grip": {
      const want = action.subtype.toLowerCase();
      const wantType = action.type;
      const matches = state.runner.deck.filter((id) => {
        const c = state.cards[id];
        if (!c) return false;
        if (wantType && c.type !== wantType) return false;
        return (c.subtypes ?? []).some((s) => s.toLowerCase() === want);
      });
      if (matches.length === 0) {
        shuffleRunnerStack(state);
        log(
          state,
          `Search stack for ${wantType ?? "card"} (${action.subtype}) — none found.`,
        );
        return { ok: true };
      }
      const id =
        matches.length === 1
          ? matches[0]!
          : matches[0]!; // first match; choice UX optional
      if (matches.length > 1) {
        state.pendingChoice = {
          sourceId,
          chooser: "runner",
          options: matches.map((mid) => ({
            id: `stack-grip:${mid}`,
            label: `Reveal ${state.cards[mid]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "search_stack_subtype_add_to_grip_pick" as const,
                cardId: mid,
              },
            },
          })),
        };
        log(
          state,
          `Search stack — choose ${action.subtype} ${wantType ?? "card"} to reveal.`,
        );
        return { ok: true };
      }
      state.runner.deck = state.runner.deck.filter((x) => x !== id);
      state.runner.hand.push(id);
      state.cards[id]!.zone = "runner:grip";
      state.cards[id]!.faceup = true;
      shuffleRunnerStack(state);
      log(
        state,
        `Search stack — reveal ${state.cards[id]!.title} and add to grip.`,
      );
      return { ok: true };
    }
    case "search_stack_subtype_add_to_grip_pick": {
      const id = action.cardId;
      if (!state.runner.deck.includes(id)) {
        shuffleRunnerStack(state);
        log(state, `Search stack pick — card missing.`);
        return { ok: true };
      }
      state.runner.deck = state.runner.deck.filter((x) => x !== id);
      state.runner.hand.push(id);
      state.cards[id]!.zone = "runner:grip";
      state.cards[id]!.faceup = true;
      shuffleRunnerStack(state);
      log(
        state,
        `Search stack — reveal ${state.cards[id]!.title} and add to grip.`,
      );
      return { ok: true };
    }
    case "expose": {
      if (action.cardId) {
        beginExpose(state, action.cardId);
        return { ok: true };
      }
      const targets = exposeLegalTargets(state);
      if (targets.length === 0) {
        log(state, `${source.title} — no installed unrezzed Corp cards to expose.`);
        return { ok: true };
      }
      if (targets.length === 1) {
        beginExpose(state, targets[0]!);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: targets.map((id) => ({
          id: `expose:${id}`,
          label: `Expose ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "expose" as const,
              pick: "choose" as const,
              cardId: id,
            },
          },
        })),
      };
      log(state, `${source.title} — choose a card to expose.`);
      return { ok: true };
    }
    case "expose_up_to": {
      const remaining =
        typeof action.remaining === "number" ? action.remaining : action.max;
      if (remaining <= 0) return { ok: true };
      const targets = exposeLegalTargets(state);
      if (targets.length === 0) {
        log(state, `${source.title} — no cards left to expose.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        targets.map((id) => ({
          id: `expose-up:${id}`,
          label: `Expose ${state.cards[id]!.title}`,
          effect: {
            op: "seq" as const,
            effects: [
              {
                op: "do" as const,
                action: {
                  kind: "expose" as const,
                  pick: "choose" as const,
                  cardId: id,
                },
              },
              {
                op: "do" as const,
                action: {
                  kind: "expose_up_to" as const,
                  max: action.max,
                  remaining: remaining - 1,
                },
              },
            ],
          },
        }));
      options.push({
        id: "decline",
        label: "Decline further exposes",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "runner", amount: 0 },
        },
      });
      state.pendingChoice = { sourceId, chooser: "runner", options };
      log(
        state,
        `${source.title} — may expose up to ${remaining} more card(s).`,
      );
      return { ok: true };
    }
    case "prevent_pending_expose": {
      preventPendingExpose(state, action.amount);
      return { ok: true };
    }
    case "continue_expose_after_may_rez": {
      const pending = state.pendingExpose;
      if (!pending) return { ok: true };
      openExposeInterruptOrComplete(state, pending.cardId);
      return { ok: true };
    }
    case "rez_for_expose_interrupt": {
      const card = state.cards[action.cardId];
      if (!card || card.rezzed) {
        return applyPrimitive(ctx, { kind: "continue_expose_after_may_rez" });
      }
      const cost = card.rezCost ?? 0;
      if (state.corp.credits < cost) {
        log(
          state,
          `Cannot rez ${card.title} for expose interrupt — need ${cost}¢.`,
        );
        return applyPrimitive(ctx, { kind: "continue_expose_after_may_rez" });
      }
      state.corp.credits -= cost;
      card.rezzed = true;
      card.faceup = true;
      log(state, `Rez ${card.title} for ${cost}¢ (expose interrupt).`);
      return applyPrimitive(ctx, { kind: "continue_expose_after_may_rez" });
    }
    case "prevent_pending_installed_trash": {
      preventPendingInstalledTrash(state);
      return { ok: true };
    }
    case "accelerated_beta_test": {
      const n = action.n ?? 3;
      if (state.turn.rdLookedCards.length > 0) {
        return {
          ok: false,
          error: "R&D look already in progress.",
          cites: [],
        };
      }
      const taken = state.corp.deck.splice(
        0,
        Math.min(n, state.corp.deck.length),
      );
      state.turn.rdLookedCards = taken;
      for (const id of taken) {
        state.cards[id]!.faceup = true;
        log(state, `ABT look R&D — ${state.cards[id]!.title}.`);
      }
      return applyPrimitive(ctx, { kind: "accelerated_beta_test_continue" });
    }
    case "accelerated_beta_test_continue": {
      const iceLeft = state.turn.rdLookedCards.filter(
        (id) => state.cards[id]?.type === "ice",
      );
      if (iceLeft.length === 0) {
        for (const id of [...state.turn.rdLookedCards]) {
          state.turn.rdLookedCards = state.turn.rdLookedCards.filter(
            (x) => x !== id,
          );
          trashCorpCardToArchives(state, id);
          log(state, `ABT — trash ${state.cards[id]!.title}.`);
        }
        state.turn.rdLookedCards = [];
        return { ok: true };
      }
      const iceId = iceLeft[0]!;
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: `abt-skip:${iceId}`,
          label: `Decline ${state.cards[iceId]!.title} (will trash)`,
          effect: {
            op: "seq",
            effects: [
              {
                op: "do",
                action: {
                  kind: "accelerated_beta_test_trash_looked",
                  cardId: iceId,
                },
              },
              {
                op: "do",
                action: { kind: "accelerated_beta_test_continue" },
              },
            ],
          },
        },
      ];
      for (const server of Object.values(state.servers)) {
        options.push({
          id: `abt-ice:${iceId}:${server.id}`,
          label: `Install and rez ${state.cards[iceId]!.title} protecting ${server.id}`,
          effect: {
            op: "seq",
            effects: [
              {
                op: "do" as const,
                action: {
                  kind: "accelerated_beta_test_install_ice" as const,
                  cardId: iceId,
                  serverId: server.id,
                },
              },
              {
                op: "do" as const,
                action: { kind: "accelerated_beta_test_continue" as const },
              },
            ],
          },
        });
      }
      options.push({
        id: `abt-ice:${iceId}:new`,
        label: `Install and rez ${state.cards[iceId]!.title} protecting a new remote`,
        effect: {
          op: "seq",
          effects: [
            {
              op: "do" as const,
              action: {
                kind: "accelerated_beta_test_install_ice" as const,
                cardId: iceId,
                serverId: "__new_remote__",
              },
            },
            {
              op: "do" as const,
              action: { kind: "accelerated_beta_test_continue" as const },
            },
          ],
        },
      });
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(state, `ABT — may install and rez ${state.cards[iceId]!.title}.`);
      return { ok: true };
    }
    case "accelerated_beta_test_trash_looked": {
      const id = action.cardId;
      if (!state.turn.rdLookedCards.includes(id)) return { ok: true };
      state.turn.rdLookedCards = state.turn.rdLookedCards.filter(
        (x) => x !== id,
      );
      trashCorpCardToArchives(state, id);
      log(state, `ABT — trash ${state.cards[id]!.title}.`);
      return { ok: true };
    }
    case "accelerated_beta_test_install_ice": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.turn.rdLookedCards.includes(cardId)) {
        log(state, `ABT install — card not in look zone.`);
        return { ok: true };
      }
      state.turn.rdLookedCards = state.turn.rdLookedCards.filter(
        (x) => x !== cardId,
      );
      let serverId = action.serverId as import("../state/types.js").ServerId;
      if (action.serverId === "__new_remote__") {
        const remoteNum = state.nextRemoteNumber++;
        serverId =
          `remote-${remoteNum}` as import("../state/types.js").ServerId;
        state.servers[serverId] = {
          id: serverId,
          kind: "remote",
          ice: [],
          root: [],
        };
      }
      const dest = state.servers[serverId];
      if (!dest) {
        trashCorpCardToArchives(state, cardId);
        return { ok: true };
      }
      dest.ice.unshift(cardId);
      card.zone = `server:${serverId}:ice`;
      card.rezzed = true;
      card.faceup = true;
      noteInstalledThisTurn(state, cardId);
      log(
        state,
        `ABT — install and rez ${card.title} protecting ${serverId} ignoring costs.`,
      );
      if (card.onRez) {
        const r = evalEffect({ state, sourceId: cardId }, card.onRez);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "account_siphon_may_instead_of_breach": {
      if (!state.run || state.run.attackedServerId !== "hq") {
        log(state, `Account Siphon — not a successful HQ run.`);
        return { ok: true };
      }
      const maxLose = Math.min(5, state.corp.credits);
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "breach",
          label: "Breach HQ",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "runner", amount: 0 },
          },
        },
      ];
      for (let n = 0; n <= maxLose; n++) {
        options.push({
          id: `siphon:${n}`,
          label:
            n === 0
              ? "Siphon: Corp loses 0¢; take 2 tags"
              : `Siphon: Corp loses ${n}¢; gain ${n * 2}¢; take 2 tags`,
          effect: {
            op: "do" as const,
            action: {
              kind: "account_siphon_resolve" as const,
              loseAmount: n,
            },
          },
        });
      }
      state.pendingChoice = { sourceId, chooser: "runner", options };
      log(state, `Account Siphon — may instead of breaching HQ.`);
      return { ok: true };
    }
    case "account_siphon_resolve": {
      if (state.run) state.run.skipBreach = true;
      const lose = Math.min(action.loseAmount, state.corp.credits);
      state.corp.credits -= lose;
      const gain = lose * 2;
      state.runner.credits += gain;
      log(
        state,
        `Account Siphon — Corp loses ${lose}¢; Runner gains ${gain}¢.`,
      );
      return applyPrimitive(ctx, { kind: "give_tags", amount: 2 });
    }
    case "escher_may_instead_of_breach": {
      if (!state.run || state.run.attackedServerId !== "hq") {
        log(state, `Escher — not a successful HQ run.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "breach",
            label: "Breach HQ",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
          {
            id: "rearrange",
            label: "Instead of breaching: rearrange any ice on any servers",
            effect: {
              op: "do",
              action: { kind: "escher_rearrange_pick_server" as const },
            },
          },
        ],
      };
      log(state, `Escher — may instead of breaching HQ.`);
      return { ok: true };
    }
    case "escher_rearrange_pick_server": {
      if (state.run) state.run.skipBreach = true;
      const servers = Object.values(state.servers).filter(
        (s) => s.ice.length >= 2,
      );
      if (servers.length === 0) {
        log(state, `${source.title} — no server with 2+ ice to rearrange.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          ...servers.map((s) => ({
            id: `escher:${s.id}`,
            label: `Rearrange ice protecting ${s.id}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "escher_rearrange_server_ice" as const,
                serverId: s.id,
                order: [],
              },
            },
          })),
          {
            id: "escher:done",
            label: "Done rearranging",
            effect: {
              op: "do" as const,
              action: { kind: "gain_credits" as const, side: "runner" as const, amount: 0 },
            },
          },
        ],
      };
      log(state, `${source.title} — choose a server to rearrange ice, or finish.`);
      return { ok: true };
    }
    case "escher_rearrange_server_ice": {
      const serverId = action.serverId;
      const server = state.servers[serverId];
      if (!server) {
        log(state, `escher_rearrange_server_ice — unknown server.`);
        return applyPrimitive(ctx, { kind: "escher_rearrange_pick_server" });
      }
      const placed: string[] = [...(action.order ?? [])];
      const remaining: string[] = server.ice.filter(
        (id: string) => !placed.includes(id),
      );
      if (remaining.length === 0) {
        server.ice = placed;
        for (let i = 0; i < placed.length; i++) {
          const c = state.cards[placed[i]!];
          if (c) c.zone = `server:${serverId}:ice`;
        }
        log(
          state,
          `${source.title} — rearranged ice on ${serverId}: ${placed
            .map((id: string) => state.cards[id]?.title ?? id)
            .join(" → ")}.`,
        );
        return applyPrimitive(ctx, { kind: "escher_rearrange_pick_server" });
      }
      if (remaining.length === 1) {
        return applyPrimitive(ctx, {
          kind: "escher_rearrange_server_ice",
          serverId,
          order: [...placed, remaining[0]!],
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: remaining.map((iceId: string) => ({
          id: `escher-ice-order:${iceId}`,
          label: `Next (outer→inner): ${state.cards[iceId]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "escher_rearrange_server_ice" as const,
              serverId,
              order: [...placed, iceId],
            },
          },
        })),
      };
      log(
        state,
        `${source.title} — choose next ice position (${placed.length + 1}/${server.ice.length}).`,
      );
      return { ok: true };
    }
    case "exploratory_romp_may_instead_of_breach": {
      const server = state.run?.attackedServerId
        ? state.servers[state.run.attackedServerId]
        : undefined;
      if (!state.run || !server) {
        log(state, `Exploratory Romp — not a successful run.`);
        return { ok: true };
      }
      const advanceable = [...server.ice, ...(server.root ?? [])].filter(
        (id) => (state.cards[id]?.advancementTokens ?? 0) > 0,
      );
      const amount = action.amount;
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "breach",
            label: "Breach the server",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
          ...(advanceable.length > 0
            ? [
                {
                  id: "romp",
                  label: `Instead of breaching: remove up to ${amount} advancement tokens from 1 card`,
                  effect: {
                    op: "do" as const,
                    action: {
                      kind: "exploratory_romp_choose_card" as const,
                      amount,
                    },
                  },
                },
              ]
            : []),
        ],
      };
      log(state, `Exploratory Romp — may instead of breaching.`);
      return { ok: true };
    }
    case "exploratory_romp_choose_card": {
      if (state.run) state.run.skipBreach = true;
      const server = state.run?.attackedServerId
        ? state.servers[state.run.attackedServerId]
        : undefined;
      if (!server) return { ok: true };
      const candidates = [...server.ice, ...(server.root ?? [])].filter(
        (id) => (state.cards[id]?.advancementTokens ?? 0) > 0,
      );
      if (candidates.length === 0) return { ok: true };
      const amount = action.amount;
      if (candidates.length === 1) {
        return applyPrimitive(ctx, {
          kind: "exploratory_romp_remove_up_to",
          cardId: candidates[0]!,
          amount,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: candidates.map((id) => ({
          id: `romp-card:${id}`,
          label: `Remove advancements from ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "exploratory_romp_remove_up_to" as const,
              cardId: id,
              amount,
            },
          },
        })),
      };
      log(state, `Exploratory Romp — choose a card to remove advancements from.`);
      return { ok: true };
    }
    case "exploratory_romp_remove_up_to": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      const remove = Math.min(action.amount, card.advancementTokens ?? 0);
      card.advancementTokens = Math.max(0, (card.advancementTokens ?? 0) - remove);
      log(
        state,
        `Exploratory Romp — remove ${remove} advancement token(s) from ${card.title}.`,
      );
      return { ok: true };
    }
    case "vamp_may_instead_of_breach": {
      if (!state.run || state.run.attackedServerId !== "hq") {
        log(state, `Vamp — not a successful HQ run.`);
        return { ok: true };
      }
      const maxSpend = state.runner.credits;
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "breach",
          label: "Breach HQ",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "runner", amount: 0 },
          },
        },
      ];
      for (let n = 0; n <= maxSpend; n++) {
        options.push({
          id: `vamp:${n}`,
          label:
            n === 0
              ? "Vamp: spend 0¢; Corp loses 0¢"
              : `Vamp: spend ${n}¢; Corp loses ${n}¢; take 1 tag`,
          effect: {
            op: "do" as const,
            action: {
              kind: "vamp_resolve" as const,
              spendAmount: n,
            },
          },
        });
      }
      state.pendingChoice = { sourceId, chooser: "runner", options };
      log(state, `Vamp — may instead of breaching HQ.`);
      return { ok: true };
    }
    case "vamp_resolve": {
      if (state.run) state.run.skipBreach = true;
      const spend = Math.min(action.spendAmount, state.runner.credits);
      state.runner.credits -= spend;
      const lose = Math.min(spend, state.corp.credits);
      state.corp.credits -= lose;
      log(
        state,
        `Vamp — Runner spends ${spend}¢; Corp loses ${lose}¢.`,
      );
      if (spend > 0) {
        return applyPrimitive(ctx, { kind: "give_tags", amount: 1 });
      }
      return { ok: true };
    }
    case "set_skip_breach": {
      if (state.run) state.run.skipBreach = true;
      return { ok: true };
    }
    case "chum_register_next_ice": {
      if (!state.run) {
        log(state, `Chum — no run.`);
        return { ok: true };
      }
      state.run.chumNextIce = {
        strengthBonus: action.strengthBonus,
        netDamageIfNotFullyBroken: action.netDamageIfNotFullyBroken,
      };
      log(
        state,
        `${source.title} — next ice +${action.strengthBonus} strength; ${action.netDamageIfNotFullyBroken} net if not fully broken.`,
      );
      return { ok: true };
    }
    case "sensei_register_etr_on_other_ice_for_run": {
      if (!state.run) {
        log(state, `Sensei — no run.`);
        return { ok: true };
      }
      if (!state.run.senseiEtrSourceIds) state.run.senseiEtrSourceIds = [];
      if (!state.run.senseiEtrSourceIds.includes(sourceId)) {
        state.run.senseiEtrSourceIds.push(sourceId);
      }
      log(
        state,
        `${source.title} — other ice gains End the run after printed for remainder of run.`,
      );
      return { ok: true };
    }
    case "ryo_phoenix_on_successful_run": {
      if (!state.run?.subroutineResolvedThisRun) {
        return { ok: true };
      }
      if (state.turn.ryoPhoenixFiredThisTurn) {
        return { ok: true };
      }
      state.turn.ryoPhoenixFiredThisTurn = true;
      state.runner.credits += 1;
      log(state, `${source.title} — gain 1¢ (successful run after sub).`);
      return applyPrimitive(ctx, {
        kind: "trash_hq",
        pick: "random",
        amount: 1,
      });
    }
    case "host_top_of_stack_on_source": {
      const top = state.runner.deck[0];
      if (!top) {
        log(state, `${source.title} — stack empty; cannot host.`);
        return { ok: true };
      }
      state.runner.deck.shift();
      const card = state.cards[top]!;
      card.hostId = sourceId;
      card.faceup = true;
      card.zone = `hosted:${sourceId}`;
      if (!source.hostedCardIds) source.hostedCardIds = [];
      source.hostedCardIds.push(top);
      log(state, `${source.title} hosts ${card.title} from stack faceup.`);
      return { ok: true };
    }
    case "fenris_host_gmod_identity_from_outside_game": {
      const requireMismatch =
        action.requireFactionMismatchWithRunnerIdentity !== false;
      const candidates = legalFenrisHostIds(state, requireMismatch);
      if (candidates.length === 0) {
        return {
          ok: false,
          error:
            "DJ Fenris requires a legal g-mod identity in the outside-game pile that does not match your identity's faction.",
          cites: [
            CR.additionalIdentity,
            CR.additionalIdentitiesPile,
            CR.whenInstalled,
          ],
        };
      }
      if (candidates.length === 1) {
        hostFenrisIdentity(state, sourceId, candidates[0]!);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: candidates.map((cardId) => ({
          id: `fenris-host:${cardId}`,
          label: `Host ${state.cards[cardId]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "fenris_host_gmod_identity" as const,
              cardId,
              requireFactionMismatchWithRunnerIdentity: requireMismatch,
            },
          },
        })),
      };
      log(
        state,
        `${source.title} — choose a g-mod identity to host (CR 1.5.4a).`,
      );
      return { ok: true };
    }
    case "fenris_host_gmod_identity": {
      const requireMismatch =
        action.requireFactionMismatchWithRunnerIdentity !== false;
      const candidates = legalFenrisHostIds(state, requireMismatch);
      if (!candidates.includes(action.cardId)) {
        return {
          ok: false,
          error: `${action.cardId} is not a legal DJ Fenris host.`,
          cites: [CR.additionalIdentity, CR.additionalIdentitiesPile],
        };
      }
      hostFenrisIdentity(state, sourceId, action.cardId);
      return { ok: true };
    }
    case "trash_all_hosted_cards": {
      const hosted = [...(source.hostedCardIds ?? [])];
      source.hostedCardIds = [];
      for (const id of hosted) {
        const card = state.cards[id];
        if (!card) continue;
        card.hostId = undefined;
        if (card.side === "runner") {
          moveRunnerCardToHeap(state, id);
        } else {
          trashCorpCardToArchives(state, id);
        }
        log(state, `${source.title} — trash hosted ${card.title}.`);
      }
      return { ok: true };
    }
    case "detente_host_random_hq": {
      const hq = state.corp.hand;
      if (hq.length === 0) {
        log(state, `${source.title} — HQ empty.`);
        return { ok: true };
      }
      const cardId = hq[hq.length - 1]!;
      state.corp.hand = hq.filter((id) => id !== cardId);
      const card = state.cards[cardId]!;
      card.hostId = sourceId;
      card.faceup = true;
      card.rezzed = false;
      card.zone = `hosted:${sourceId}`;
      if (!source.hostedCardIds) source.hostedCardIds = [];
      source.hostedCardIds.push(cardId);
      log(state, `${source.title} hosts ${card.title} from HQ faceup.`);
      return { ok: true };
    }
    case "detente_return_two_hosted_may_access": {
      const hosted = [...(source.hostedCardIds ?? [])];
      if (hosted.length < 2) {
        log(state, `${source.title} — need 2 hosted cards.`);
        return { ok: true };
      }
      const take = hosted.slice(0, 2);
      source.hostedCardIds = hosted.filter((id) => !take.includes(id));
      for (const id of take) {
        const card = state.cards[id]!;
        card.hostId = undefined;
        card.zone = "corp:hq";
        card.faceup = false;
        state.corp.hand.push(id);
        log(state, `${card.title} returned to HQ from ${source.title}.`);
      }
      if (state.corp.hand.length === 0) {
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "access",
            label: "Access 1 card in HQ at random",
            effect: {
              op: "do" as const,
              action: { kind: "access_random_hq" as const },
            },
          },
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
      };
      log(state, `${source.title} — Runner may access 1 HQ at random.`);
      return { ok: true };
    }
    case "access_random_hq": {
      const hq = state.corp.hand;
      if (hq.length === 0) {
        log(state, `Access random HQ — HQ empty.`);
        return { ok: true };
      }
      const cardId = hq[hq.length - 1]!;
      const card = state.cards[cardId]!;
      card.faceup = true;
      log(state, `Accessed ${card.title} in HQ at random (Detente).`);
      if (card.onAccess) {
        const r = evalEffect({ state, sourceId: cardId }, card.onAccess);
        if (!r.ok) {
          log(state, `onAccess failed on ${card.title}: ${r.error}`);
        }
      }
      return { ok: true };
    }
    case "au_co_remove_2_look_rd": {
      if ((source.powerCounters ?? 0) < 2) {
        log(state, `${source.title} — need 2 power counters.`);
        return { ok: true };
      }
      source.powerCounters = (source.powerCounters ?? 0) - 2;
      const top = state.corp.deck.slice(0, 3);
      if (top.length === 0) {
        log(state, `${source.title} — R&D empty.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: top.map((cardId) => ({
          id: cardId,
          label: `Trash ${state.cards[cardId]!.title}; rest to HQ`,
          effect: {
            op: "do" as const,
            action: { kind: "au_co_trash_looked_rd_card" as const, cardId },
          },
        })),
      };
      log(
        state,
        `${source.title} — look at top ${top.length} of R&D; trash 1, rest to HQ.`,
      );
      return { ok: true };
    }
    case "au_co_trash_looked_rd_card": {
      const top = state.corp.deck.slice(0, 3);
      if (!top.includes(action.cardId)) {
        log(state, `au_co_trash_looked_rd_card — card not in looked set.`);
        return { ok: true };
      }
      state.corp.deck = state.corp.deck.filter((id) => !top.includes(id));
      for (const id of top) {
        const card = state.cards[id]!;
        if (id === action.cardId) {
          trashCorpCardToArchives(state, id);
          log(state, `${source.title} — trash ${card.title} from R&D.`);
        } else {
          card.zone = "corp:hq";
          card.faceup = false;
          state.corp.hand.push(id);
          log(state, `${card.title} added to HQ from R&D look.`);
        }
      }
      return { ok: true };
    }
    case "install_runner_score_agenda_on_remote": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.runner.score.includes(cardId)) {
        log(state, `install_runner_score_agenda — invalid agenda.`);
        return { ok: true };
      }
      const remotes = Object.entries(state.servers).filter(
        ([, s]) => s.kind === "remote",
      );
      if (remotes.length === 0) {
        return {
          ok: false,
          error: "No remote server to install agenda.",
          cites: [CR.playOperation],
        };
      }
      const installEffects: Effect[] = remotes.map(([serverId]) => ({
        op: "do" as const,
        action: {
          kind: "install_runner_score_agenda_on_server" as const,
          cardId,
          serverId,
          placeAdvancementIfRunnerTagged: action.placeAdvancementIfRunnerTagged,
        },
      }));
      if (installEffects.length === 1) {
        return evalEffect(ctx, installEffects[0]!);
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: remotes.map(([serverId], i) => ({
          id: serverId,
          label: `Install on ${serverId}`,
          effect: installEffects[i]!,
        })),
      };
      return { ok: true };
    }
    case "install_runner_score_agenda_on_server": {
      const { cardId, serverId } = action;
      const card = state.cards[cardId];
      if (!card || !state.runner.score.includes(cardId)) {
        log(state, `install_runner_score_agenda_on_server — invalid.`);
        return { ok: true };
      }
      state.runner.score = state.runner.score.filter((id) => id !== cardId);
      const server = state.servers[serverId as import("../state/types.js").ServerId];
      if (!server) {
        return {
          ok: false,
          error: "Invalid server.",
          cites: [CR.playOperation],
        };
      }
      server.root.push(cardId);
      card.zone = `server:${serverId}:root`;
      card.faceup = true;
      card.rezzed = false;
      log(state, `IP Enforcement — install ${card.title} on ${serverId}.`);
      if (
        action.placeAdvancementIfRunnerTagged &&
        state.runner.tags > 0
      ) {
        card.advancementTokens = (card.advancementTokens ?? 0) + 1;
        log(state, `Runner still tagged — place 1 advancement on ${card.title}.`);
      }
      return { ok: true };
    }
    case "swap_approached_ice_with_hq_or_archives": {
      const run = state.run;
      if (!run || run.position === null) {
        log(state, `Swap approached ice — no run.`);
        return { ok: true };
      }
      const serverId = run.attackedServerId;
      const approachedId = state.servers[serverId]?.ice[run.position];
      const replacementId = action.replacementIceId;
      const replacement = state.cards[replacementId];
      const approached = approachedId ? state.cards[approachedId] : undefined;
      if (
        !approachedId ||
        !approached ||
        !replacement ||
        replacement.type !== "ice"
      ) {
        log(state, `Swap approached ice — invalid ice.`);
        return { ok: true };
      }
      const fromHq = state.corp.hand.includes(replacementId);
      const fromArchives = state.corp.discard.includes(replacementId);
      if (!fromHq && !fromArchives) {
        log(state, `Swap approached ice — replacement not in HQ/Archives.`);
        return { ok: true };
      }
      if (fromHq) {
        state.corp.hand = state.corp.hand.filter((id) => id !== replacementId);
      } else {
        state.corp.discard = state.corp.discard.filter(
          (id) => id !== replacementId,
        );
      }
      state.servers[serverId]!.ice[run.position!] = replacementId;
      replacement.zone = `server:${serverId}:ice`;
      replacement.rezzed = false;
      replacement.faceup = false;
      if (fromHq) {
        state.corp.hand.push(approachedId);
        approached.zone = "corp:hq";
      } else {
        state.corp.discard.push(approachedId);
        approached.zone = "corp:archives";
      }
      approached.rezzed = false;
      approached.faceup = fromArchives ? false : approached.faceup;
      log(
        state,
        `Swap approached ${approached.title} with ${replacement.title}.`,
      );
      return { ok: true };
    }
    case "may_install_program_hardware_from_last_runner_discarded": {
      const ids = state.turn.runnerDiscardedToMaxHandIds.filter((id) => {
        const c = state.cards[id];
        return (
          c &&
          (c.type === "program" || c.type === "hardware") &&
          state.runner.discard.includes(id)
        );
      });
      if (ids.length === 0) {
        log(state, `Install from discarded — none eligible.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
          ...ids
            .filter((cardId) => canInstallHeapCard(state, cardId, 0))
            .map((cardId) => ({
              id: cardId,
              label: `Install ${state.cards[cardId]!.title} from heap`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "install_heap_card" as const,
                  cardId,
                  discount: 0,
                },
              },
            })),
        ],
      };
      if ((state.pendingChoice?.options.length ?? 0) <= 1) {
        state.pendingChoice = null;
        log(state, `Install from discarded — none affordable.`);
        return { ok: true };
      }
      log(state, `May install 1 program/hardware from cards just discarded.`);
      return { ok: true };
    }
    case "play_self_from_archives_then_rfg": {
      if (!state.corp.discard.includes(sourceId) || source.type !== "operation") {
        log(state, `play_self_from_archives_then_rfg — not in Archives.`);
        return { ok: true };
      }
      if (
        source.playRequiresNoCorpActionFinished &&
        (state.turn.corpActionsCompletedThisTurn ?? 0) > 0
      ) {
        log(state, `play_self_from_archives_then_rfg — Corp already acted.`);
        return { ok: true };
      }
      const cost = source.playCost ?? 0;
      if (state.corp.credits < cost) {
        return {
          ok: false,
          error: "Insufficient credits to play operation from Archives.",
          cites: [CR.playOperation],
        };
      }
      state.corp.credits -= cost;
      state.corp.discard = state.corp.discard.filter((id) => id !== sourceId);
      source.zone = "corp:play-area";
      source.faceup = true;
      state.turn.operationPlayedFromNonHq = true;
      state.turn.corpActionTypeCounts.play_operation =
        (state.turn.corpActionTypeCounts.play_operation ?? 0) + 1;
      log(
        state,
        `Corp plays ${source.title} from Archives for ${cost}¢.`,
      );
      if (source.onPlay) {
        const r = evalEffect({ state, sourceId }, source.onPlay);
        if (!r.ok) {
          state.turn.operationPlayedFromNonHq = false;
          return r;
        }
      }
      state.turn.operationPlayedFromNonHq = false;
      removeCardFromCurrentZone(state, sourceId);
      source.zone = "removed-from-game";
      source.faceup = true;
      source.rezzed = false;
      if (!state.removedFromGame) state.removedFromGame = [];
      if (!state.removedFromGame.includes(sourceId)) {
        state.removedFromGame.push(sourceId);
      }
      log(state, `${source.title} is removed from the game.`);
      fireCorpIdentityFlippedFirstOperationPlay(state);
      fireOnAfterOperationOrExpendable(state);
      return { ok: true };
    }
    case "move_advancements": {
      const sources = Object.values(state.cards).filter(
        (c) =>
          (c.advancementTokens ?? 0) > 0 &&
          (c.zone.endsWith(":root") || c.zone.endsWith(":ice")),
      );
      const dests = Object.values(state.cards).filter(
        (c) =>
          (c.type === "agenda" ||
            c.type === "asset" ||
            c.type === "ice" ||
            c.canAdvance) &&
          (c.zone.endsWith(":root") || c.zone.endsWith(":ice")),
      );
      if (sources.length === 0 || dests.length < 2) {
        log(state, `Move advancements — no valid source/dest.`);
        return { ok: true };
      }
      const from = sources[0]!;
      const to = dests.find((c) => c.id !== from.id);
      if (!to) {
        log(state, `Move advancements — no destination.`);
        return { ok: true };
      }
      const move = Math.min(action.amount, from.advancementTokens ?? 0);
      from.advancementTokens = (from.advancementTokens ?? 0) - move;
      to.advancementTokens = (to.advancementTokens ?? 0) + move;
      log(
        state,
        `Move ${move} advancement(s) from ${from.title} to ${to.title}.`,
      );
      return { ok: true };
    }
    case "trash_passed_unrezzed_ice": {
      const ids = (state.turn.lastRunPassedUnrezzedIceIds ?? []).filter(
        (id) => {
          const c = state.cards[id];
          return c && c.type === "ice" && !c.rezzed && c.zone.endsWith(":ice");
        },
      );
      if (ids.length === 0) {
        log(state, `Trash passed unrezzed ice — none available.`);
        return { ok: true };
      }
      const id = ids[0]!;
      const card = state.cards[id];
      trashCorpCardToArchives(state, id);
      log(state, `Trash unrezzed ${card.title} (passed last run).`);
      return { ok: true };
    }
    case "forged_activation_orders": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (!state.cards[id].rezzed) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `Forged Activation Orders — no unrezzed ice.`);
        return { ok: true };
      }
      const iceId = targets[0]!;
      const ice = state.cards[iceId];
      const rezCost = ice.rezCost ?? 0;
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      if (state.corp.credits >= rezCost) {
        options.push({
          id: "rez",
          label: `Rez ${ice.title} for ${rezCost}¢`,
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        });
      }
      options.push({
        id: "trash",
        label: `Trash ${ice.title}`,
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      // Resolve immediately with Corp preference: rez if able, else trash.
      // Honesty: auto-rez when affordable, otherwise trash.
      if (state.corp.credits >= rezCost) {
        state.corp.credits -= rezCost;
        ice.rezzed = true;
        ice.faceup = true;
        log(state, `Forged Activation Orders — Corp rezzes ${ice.title}.`);
        if (ice.onRez) {
          const r = evalEffect({ state, sourceId: iceId }, ice.onRez);
          if (!r.ok) return r;
        }
      } else {
        trashCorpCardToArchives(state, iceId);
        log(
          state,
          `Forged Activation Orders — Corp cannot rez; trash ${ice.title}.`,
        );
      }
      return { ok: true };
    }
    case "install_program_from_stack_or_heap_free": {
      const fromHeap = state.runner.discard.find(
        (id) => state.cards[id].type === "program",
      );
      const fromStack = state.runner.deck.find(
        (id) => state.cards[id].type === "program",
      );
      const id = fromHeap ?? fromStack;
      if (!id) {
        log(state, `Install program from stack/heap — none found.`);
        return { ok: true };
      }
      const card = state.cards[id];
      state.runner.discard = state.runner.discard.filter((x) => x !== id);
      state.runner.deck = state.runner.deck.filter((x) => x !== id);
      state.runner.rig.push(id);
      card.zone = "runner:rig";
      card.faceup = true;
      card.bounceToStackAtTurnEnd = true;
      if ((card.recurringCreditsMax ?? 0) > 0) {
        card.recurringCredits = card.recurringCreditsMax;
      }
      log(
        state,
        `Install ${card.title} ignoring costs (will bounce to stack at turn end).`,
      );
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: id }, card.onInstall);
        if (!r.ok) return r;
      }
      noteVirusProgramInstalled(state, id);
      noteProgramOrHardwareInstalled(state, id);
      return { ok: true };
    }
    case "place_advancements_x_from_tags": {
      const x = Math.min(state.corp.credits, state.runner.tags);
      if (x <= 0) {
        log(state, `Psychographics — X=0 (no tags or credits).`);
        return { ok: true };
      }
      state.corp.credits -= x;
      const targets = Object.values(state.cards).filter(
        (c) =>
          (c.type === "agenda" ||
            c.type === "asset" ||
            c.type === "ice" ||
            c.canAdvance) &&
          (c.zone.endsWith(":root") || c.zone.endsWith(":ice")),
      );
      if (targets.length === 0) {
        log(state, `Psychographics — spend ${x}¢ but no advanceable target.`);
        return { ok: true };
      }
      const t = targets[0]!;
      t.advancementTokens = (t.advancementTokens ?? 0) + x;
      log(
        state,
        `Psychographics — spend ${x}¢, place ${x} advancement(s) on ${t.title}.`,
      );
      return { ok: true };
    }
    case "troubleshooter_fortify": {
      const x = state.corp.credits;
      if (x <= 0) {
        log(state, `Corporate Troubleshooter — no credits to spend.`);
        // Still trash self via cost if paid ability includes trashSelf
        return { ok: true };
      }
      const iceTargets = Object.values(state.cards).filter(
        (c) => c.type === "ice" && c.zone.endsWith(":ice") && c.rezzed,
      );
      if (iceTargets.length === 0) {
        log(state, `Corporate Troubleshooter — no rezzed ice.`);
        return { ok: true };
      }
      state.corp.credits = 0;
      const ice = iceTargets[0]!;
      state.turn.iceStrengthBoostsThisTurn[ice.id] =
        (state.turn.iceStrengthBoostsThisTurn[ice.id] ?? 0) + x;
      log(
        state,
        `Corporate Troubleshooter — spend ${x}¢, ${ice.title} +${x} strength this turn.`,
      );
      return { ok: true };
    }
    case "resolve_bioroid_subroutine": {
      const others: Array<{ iceId: string; subIndex: number }> = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (id === sourceId) continue;
          const ice = state.cards[id];
          if (!ice.rezzed) continue;
          if (!(ice.subtypes ?? []).includes("bioroid")) continue;
          const subs = ice.subroutines ?? [];
          for (let i = 0; i < subs.length; i++) {
            others.push({ iceId: id, subIndex: i });
          }
        }
      }
      if (others.length === 0) {
        log(state, `Resolve bioroid sub — no other rezzed bioroid ice.`);
        return { ok: true };
      }
      const pick = others[0]!;
      const ice = state.cards[pick.iceId];
      const sub = ice.subroutines![pick.subIndex]!;
      log(
        state,
        `Resolve "${sub.text}" on ${ice.title} (via ${source.title}).`,
      );
      return evalEffect({ state, sourceId: pick.iceId }, sub.effect);
    }
    case "may_trash_other_installed_gain_printed_install_and_draw": {
      const targets = state.runner.rig.filter((id) => id !== sourceId);
      if (targets.length === 0) {
        log(state, `${source.title} — no other installed cards to trash.`);
        return { ok: true };
      }
      const options: import("./ir.js").ChoiceOption[] = targets.map((id) => {
        const c = state.cards[id]!;
        const printed = c.installCost ?? 0;
        return {
          id: `trash:${id}`,
          label: `Trash ${c.title} (gain ${printed}¢, draw 1)`,
          effect: {
            op: "seq" as const,
            effects: [
              {
                op: "do" as const,
                action: {
                  kind: "trash_runner_rig_card" as const,
                  cardId: id,
                },
              },
              {
                op: "do" as const,
                action: {
                  kind: "gain_credits" as const,
                  side: "runner" as const,
                  amount: printed,
                },
              },
              {
                op: "do" as const,
                action: {
                  kind: "draw" as const,
                  side: "runner" as const,
                  amount: 1,
                },
              },
            ],
          },
        };
      });
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do" as const,
          action: {
            kind: "gain_credits" as const,
            side: "runner" as const,
            amount: 0,
          },
        },
      });
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options,
      };
      log(
        state,
        `${source.title} — may trash another installed card for printed install cost.`,
      );
      return { ok: true };
    }
    case "touch_ups_choose_type_shuffle_grip": {
      const types = ["program", "hardware", "resource", "event"] as const;
      const options: import("./ir.js").ChoiceOption[] = types.map((t) => ({
        id: `type:${t}`,
        label: `Choose ${t}`,
        effect: {
          op: "do" as const,
          action: {
            kind: "touch_ups_shuffle_grip_of_type" as const,
            cardType: t,
            maxCards: action.maxCards,
          },
        },
      }));
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do" as const,
          action: {
            kind: "gain_credits" as const,
            side: "corp" as const,
            amount: 0,
          },
        },
      });
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options,
      };
      log(state, `${source.title} — choose a card type to shuffle from grip.`);
      return { ok: true };
    }
    case "touch_ups_shuffle_grip_of_type": {
      const cardType = action.cardType;
      const maxCards = action.maxCards;
      const matching = state.runner.hand.filter(
        (id) => state.cards[id]?.type === cardType,
      );
      if (matching.length === 0) {
        log(
          state,
          `Touch-ups — no ${cardType} cards in grip to shuffle.`,
        );
        return { ok: true };
      }
      log(
        state,
        `Touch-ups — reveal grip (${state.runner.hand.length} cards).`,
      );
      const pickOptions: import("./ir.js").ChoiceOption[] = matching.map((id) => {
        const c = state.cards[id]!;
        return {
          id: `shuffle:${id}`,
          label: `Shuffle ${c.title} into stack`,
          effect: {
            op: "do" as const,
            action: {
              kind: "shuffle_grip_card_into_stack" as const,
              cardId: id,
            },
          },
        };
      });
      void maxCards;
      pickOptions.push({
        id: "done",
        label: "Done shuffling",
        effect: {
          op: "do" as const,
          action: {
            kind: "gain_credits" as const,
            side: "runner" as const,
            amount: 0,
          },
        },
      });
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: pickOptions,
      };
      return { ok: true };
    }
    case "shuffle_grip_card_into_stack": {
      const idx = state.runner.hand.indexOf(action.cardId);
      if (idx < 0) {
        log(state, `Shuffle grip — card not in hand.`);
        return { ok: true };
      }
      state.runner.hand.splice(idx, 1);
      const insertAt = Math.floor(Math.random() * (state.runner.deck.length + 1));
      state.runner.deck.splice(insertAt, 0, action.cardId);
      state.cards[action.cardId]!.zone = "runner:stack";
      log(
        state,
        `Shuffle ${state.cards[action.cardId]!.title} into stack (Touch-ups).`,
      );
      return { ok: true };
    }
    case "move_runner_to_archives_outermost": {
      if (!state.run) {
        log(state, `Move to Archives outermost — no active run.`);
        return { ok: true };
      }
      state.run.attackedServerId = "archives";
      const arch = state.servers.archives;
      if (arch.ice.length > 0) {
        state.run.position = 0;
        state.log.push(
          `Runner moves to outermost Archives ice (Proprionegation).`,
        );
      } else {
        state.run.position = null;
        state.log.push(`Runner moves to Archives (no ice).`);
      }
      return { ok: true };
    }
    case "may_rez_installed_ice_discount": {
      const discount = Math.max(0, action.discount);
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          const ice = state.cards[id];
          if (ice && !ice.rezzed) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `May rez ice — no unrezzed installed ice.`);
        return { ok: true };
      }
      const options: import("./ir.js").ChoiceOption[] = targets.map((id) => {
        const ice = state.cards[id]!;
        const base = ice.rezCost ?? 0;
        const pay = Math.max(0, base - discount);
        return {
          id: `rez:${id}`,
          label: `Rez ${ice.title} for ${pay}¢ (−${discount})`,
          effect: {
            op: "do" as const,
            action: {
              kind: "rez_ice_with_discount" as const,
              cardId: id,
              discount,
            },
          },
        };
      });
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do" as const,
          action: {
            kind: "gain_credits" as const,
            side: "corp" as const,
            amount: 0,
          },
        },
      });
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(state, `${source.title} — may rez installed ice (−${discount}¢).`);
      return { ok: true };
    }
    case "rez_ice_with_discount": {
      const ice = state.cards[action.cardId];
      if (!ice || ice.type !== "ice" || ice.rezzed) {
        log(state, `Rez with discount — invalid or already rezzed.`);
        return { ok: true };
      }
      const pay = Math.max(0, (ice.rezCost ?? 0) - action.discount);
      if (state.corp.credits < pay) {
        log(state, `Rez ${ice.title} — insufficient credits (${pay}¢).`);
        return { ok: true };
      }
      state.corp.credits -= pay;
      ice.rezzed = true;
      ice.faceup = true;
      state.turn.iceRezzedThisTurn += 1;
      log(state, `Rez ${ice.title} for ${pay}¢ (−${action.discount}¢ discount).`);
      if (ice.onRez) {
        const r = evalEffect({ state, sourceId: action.cardId }, ice.onRez);
        if (!r.ok) return r;
      }
      fireIceRezDuringRunHooks(state, action.cardId);
      fireOnAnyIceRez(state, action.cardId);
      return { ok: true };
    }
    case "may_resolve_subroutine_on_rezzed_ice": {
      const subtype = action.subtype.toLowerCase();
      const picks: Array<{ iceId: string; subIndex: number }> = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (action.excludeSelf && id === sourceId) continue;
          const ice = state.cards[id];
          if (!ice?.rezzed) continue;
          if (!(ice.subtypes ?? []).some((s) => s.toLowerCase() === subtype)) {
            continue;
          }
          const subs = ice.subroutines ?? [];
          for (let i = 0; i < subs.length; i++) {
            picks.push({ iceId: id, subIndex: i });
          }
        }
      }
      if (picks.length === 0) {
        log(
          state,
          `Resolve ${subtype} sub — no rezzed ${subtype} ice with subroutines.`,
        );
        return { ok: true };
      }
      const options: import("./ir.js").ChoiceOption[] = picks.map((p) => {
        const ice = state.cards[p.iceId]!;
        const sub = ice.subroutines![p.subIndex]!;
        return {
          id: `sub:${p.iceId}:${p.subIndex}`,
          label: `Resolve "${sub.text}" on ${ice.title}`,
          effect: sub.effect,
        };
      });
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do" as const,
          action: {
            kind: "gain_credits" as const,
            side: "corp" as const,
            amount: 0,
          },
        },
      });
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(
        state,
        `${source.title} — may resolve a subroutine on rezzed ${subtype} ice.`,
      );
      return { ok: true };
    }
    case "may_flip_archives_ice_resolve_subroutine": {
      const facedownIce = state.corp.discard.filter((id) => {
        const c = state.cards[id];
        return c.type === "ice" && !c.faceup;
      });
      if (facedownIce.length === 0) {
        log(state, `${source.title} — no facedown ice in Archives.`);
        return { ok: true };
      }
      const options: Array<{
        id: string;
        label: string;
        effect: import("./ir.js").Effect;
      }> = [];
      for (const iceId of facedownIce) {
        const ice = state.cards[iceId]!;
        const subs = ice.subroutines ?? [];
        for (let i = 0; i < subs.length; i++) {
          const sub = subs[i]!;
          options.push({
            id: `flip:${iceId}:${i}`,
            label: `Turn ${ice.title} faceup, resolve "${sub.text}"`,
            effect: {
              op: "do",
              action: {
                kind: "flip_archives_ice_resolve_subroutine",
                iceId,
                subIndex: i,
              },
            },
          });
        }
      }
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options,
      };
      log(
        state,
        `${source.title} — may turn 1 facedown Archives ice faceup and resolve a subroutine.`,
      );
      return { ok: true };
    }
    case "flip_archives_ice_resolve_subroutine": {
      const ice = state.cards[action.iceId];
      if (!ice || ice.type !== "ice" || !state.corp.discard.includes(action.iceId)) {
        log(state, `Flip Archives ice — invalid target.`);
        return { ok: true };
      }
      ice.faceup = true;
      const sub = ice.subroutines?.[action.subIndex];
      if (!sub) {
        log(state, `Flip ${ice.title} faceup — no subroutine ${action.subIndex}.`);
        return { ok: true };
      }
      log(
        state,
        `Turn ${ice.title} faceup in Archives; resolve "${sub.text}".`,
      );
      return evalEffect({ state, sourceId: action.iceId }, sub.effect);
    }
    case "trash_encounter_ice_resolve_subroutine": {
      const enc = state.run?.encounter;
      if (!enc) {
        log(state, `Trash encounter ice — no encounter.`);
        return { ok: true };
      }
      const ice = state.cards[enc.iceId];
      if (!ice) {
        log(state, `Trash encounter ice — missing ice.`);
        return { ok: true };
      }
      const sub = ice.subroutines?.[action.subIndex];
      if (!sub) {
        log(state, `Trash encounter ice — no subroutine ${action.subIndex}.`);
        return { ok: true };
      }
      // Trash ice; mark all subs broken so the encounter does not keep firing.
      removeCardFromCurrentZone(state, enc.iceId);
      state.corp.discard.push(enc.iceId);
      ice.zone = "corp:archives";
      ice.faceup = true;
      ice.rezzed = false;
      enc.broken = (ice.subroutines ?? []).map(() => true);
      log(
        state,
        `Trash ${ice.title}; resolve "${sub.text}" (ZATO City Grid).`,
      );
      return evalEffect({ state, sourceId: enc.iceId }, sub.effect);
    }
    case "trash_encounter_ice_if_strength_lte": {
      const iceId = state.run?.encounter?.iceId;
      if (!iceId) {
        log(state, `Trash encounter ice — no encounter.`);
        return { ok: true };
      }
      const str = iceStrength(state, iceId);
      if (str > action.maxStrength) {
        log(
          state,
          `Trash encounter ice — strength ${str} > ${action.maxStrength}.`,
        );
        return { ok: true };
      }
      const ice = state.cards[iceId]!;
      trashCorpCardToArchives(state, iceId);
      if (state.run?.encounter) state.run.encounter = null;
      log(
        state,
        `Trash encountered ${ice.title} (strength ${str} ≤ ${action.maxStrength}) (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }

    case "may_choose_server": {
      const servers = Object.keys(state.servers);
      if (servers.length === 0) {
        log(state, `${source.title} — no servers to name.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          ...servers.map((serverId) => ({
            id: `server:${serverId}`,
            label: `Name ${serverId}`,
            effect: {
              op: "do" as const,
              action: { kind: "set_named_server" as const, serverId },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "runner" as const,
                amount: 0,
              },
            },
          },
        ],
      };
      log(state, `${source.title} — may choose a server.`);
      return { ok: true };
    }
    case "set_named_server": {
      source.namedServerId = action.serverId as import("../state/types.js").ServerId;
      log(state, `${source.title} names ${action.serverId}.`);
      return { ok: true };
    }
    case "choose_server": {
      const servers = Object.keys(state.servers);
      if (servers.length === 0) {
        log(state, `${source.title} — no servers to choose.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: servers.map((serverId) => ({
          id: `server:${serverId}`,
          label: `Choose ${serverId}`,
          effect: {
            op: "do" as const,
            action: { kind: "set_chosen_server" as const, serverId },
          },
        })),
      };
      log(state, `${source.title} — choose a server.`);
      return { ok: true };
    }
    case "choose_server_runner": {
      const servers = Object.keys(state.servers);
      if (servers.length === 0) {
        log(state, `${source.title} — no servers to choose.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: servers.map((serverId) => ({
          id: `server:${serverId}`,
          label: `Choose ${serverId}`,
          effect: {
            op: "do" as const,
            action: { kind: "set_chosen_server" as const, serverId },
          },
        })),
      };
      log(state, `${source.title} — choose a server.`);
      return { ok: true };
    }
    case "next_design_may_install_ice": {
      const remaining = Math.max(0, action.remaining);
      const usedServerIds = action.usedServerIds ?? [];
      const proceedToDraw = (): EvalResult =>
        evalEffect(ctx, {
          op: "do",
          action: { kind: "draw_until_hq_has", amount: action.thenDrawToHq },
        });
      if (remaining <= 0) return proceedToDraw();
      const iceCards = state.corp.hand.filter(
        (id) => state.cards[id]?.type === "ice",
      );
      if (iceCards.length === 0) return proceedToDraw();
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "next-design-done",
          label: "Done installing ice",
          effect: {
            op: "do" as const,
            action: { kind: "draw_until_hq_has" as const, amount: action.thenDrawToHq },
          },
        },
        ...iceCards.map((id) => ({
          id: `next-design-ice:${id}`,
          label: `Install ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "next_design_choose_server" as const,
              cardId: id,
              remaining,
              usedServerIds,
              thenDrawToHq: action.thenDrawToHq,
            },
          },
        })),
      ];
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(
        state,
        `${source.title} — may install up to ${remaining} more ice (≤1 per server, ignoring costs).`,
      );
      return { ok: true };
    }
    case "next_design_choose_server": {
      const remaining = Math.max(0, action.remaining);
      const usedServerIds = action.usedServerIds ?? [];
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.corp.hand.includes(cardId)) {
        return evalEffect(ctx, {
          op: "do",
          action: {
            kind: "next_design_may_install_ice",
            remaining,
            usedServerIds,
            thenDrawToHq: action.thenDrawToHq,
          },
        });
      }
      const availableServerIds = Object.keys(state.servers).filter(
        (sid) => !usedServerIds.includes(sid),
      );
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        ...availableServerIds.map((sid) => ({
          id: `next-design-server:${sid}`,
          label: `Protect ${sid}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "next_design_install_on_server" as const,
              cardId,
              serverId: sid,
              remaining,
              usedServerIds,
              thenDrawToHq: action.thenDrawToHq,
            },
          },
        })),
        {
          id: "next-design-server:new",
          label: "Protect a new remote",
          effect: {
            op: "do" as const,
            action: {
              kind: "next_design_install_on_server" as const,
              cardId,
              serverId: "__new_remote__",
              remaining,
              usedServerIds,
              thenDrawToHq: action.thenDrawToHq,
            },
          },
        },
      ];
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(state, `${source.title} — choose a server to protect with ${card.title}.`);
      return { ok: true };
    }
    case "next_design_install_on_server": {
      const remaining = Math.max(0, action.remaining);
      const usedServerIds = [...(action.usedServerIds ?? [])];
      const cardId = action.cardId;
      const card = state.cards[cardId];
      let serverId = action.serverId;
      if (serverId === "__new_remote__") {
        const remoteNum = state.nextRemoteNumber++;
        serverId = `remote-${remoteNum}`;
        state.servers[serverId as import("../state/types.js").ServerId] = {
          id: serverId as import("../state/types.js").ServerId,
          kind: "remote",
          ice: [],
          root: [],
        };
        log(state, `Create ${serverId} for NEXT Design ice install.`);
      }
      if (card && state.corp.hand.includes(cardId)) {
        const dest = state.servers[serverId as import("../state/types.js").ServerId];
        if (dest) {
          state.corp.hand = state.corp.hand.filter((id) => id !== cardId);
          dest.ice.unshift(cardId);
          card.zone = `server:${serverId}:ice`;
          card.rezzed = false;
          card.faceup = false;
          card.advancementTokens = card.advancementTokens ?? 0;
          noteInstalledThisTurn(state, cardId);
          state.turn.corpInstalledFromHqThisTurn = true;
          usedServerIds.push(serverId);
          log(
            state,
            `Install ${card.title} from HQ protecting ${serverId}, ignoring all costs (${remaining - 1} remaining).`,
          );
          if (card.onInstall) {
            const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
            if (!r.ok) return r;
          }
        }
      }
      return evalEffect(ctx, {
        op: "do",
        action: {
          kind: "next_design_may_install_ice",
          remaining: remaining - 1,
          usedServerIds,
          thenDrawToHq: action.thenDrawToHq,
        },
      });
    }
    case "draw_until_hq_has": {
      const target = Math.max(0, action.amount);
      const n = Math.max(0, target - state.corp.hand.length);
      const drawn = drawCards(state, "corp", n);
      log(
        state,
        `Corp draws ${drawn} until HQ has ${target} card(s) (HQ now ${state.corp.hand.length}).`,
      );
      return { ok: true };
    }
    case "set_chosen_server": {
      source.chosenServerId =
        action.serverId as import("../state/types.js").ServerId;
      log(state, `${source.title} chooses ${action.serverId}.`);
      return { ok: true };
    }
    case "search_stack_host_virus_or_weapon": {
      const max = Math.max(1, action.max);
      const eligible = state.runner.deck.filter((id) => {
        const c = state.cards[id];
        const subs = c.subtypes ?? [];
        return subs.includes("virus") || subs.includes("weapon");
      });
      const picks: string[] = [];
      const seenTitles = new Set<string>();
      for (const id of eligible) {
        if (picks.length >= max) break;
        const title = state.cards[id]!.title;
        if (seenTitles.has(title)) continue;
        seenTitles.add(title);
        picks.push(id);
      }
      if (picks.length === 0) {
        shuffleRunnerStack(state);
        log(
          state,
          `${source.title} — search stack for virus/weapon; none found.`,
        );
        return { ok: true };
      }
      if (!source.hostedCardIds) source.hostedCardIds = [];
      for (const id of picks) {
        state.runner.deck = state.runner.deck.filter((x) => x !== id);
        const card = state.cards[id]!;
        card.hostId = sourceId;
        card.faceup = true;
        card.zone = `hosted:${sourceId}`;
        source.hostedCardIds.push(id);
        log(
          state,
          `${source.title} hosts ${card.title} faceup (not installed).`,
        );
      }
      shuffleRunnerStack(state);
      return { ok: true };
    }
    case "host_stack_card_on_source": {
      if (!state.runner.deck.includes(action.cardId)) {
        log(state, `Host stack card — ${action.cardId} not in stack.`);
        return { ok: true };
      }
      state.runner.deck = state.runner.deck.filter((x) => x !== action.cardId);
      const card = state.cards[action.cardId]!;
      card.hostId = sourceId;
      card.faceup = true;
      card.zone = `hosted:${sourceId}`;
      if (!source.hostedCardIds) source.hostedCardIds = [];
      source.hostedCardIds.push(action.cardId);
      log(
        state,
        `${source.title} hosts ${card.title} faceup (not installed).`,
      );
      return { ok: true };
    }
    case "may_add_hosted_card_to_grip": {
      const hosted = source.hostedCardIds ?? [];
      if (hosted.length === 0) {
        if (source.trashWhenNoHostedCards) {
          moveRunnerCardToHeap(state, sourceId);
          log(state, `${source.title} trashed — no hosted cards.`);
        }
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          ...hosted.map((cardId) => ({
            id: `grip:${cardId}`,
            label: `Add ${state.cards[cardId]!.title} to grip`,
            effect: {
              op: "do" as const,
              action: { kind: "add_hosted_card_to_grip" as const, cardId },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "runner" as const,
                amount: 0,
              },
            },
          },
        ],
      };
      log(state, `${source.title} — may add 1 hosted card to grip.`);
      return { ok: true };
    }
    case "add_hosted_card_to_grip": {
      const hosted = source.hostedCardIds ?? [];
      if (!hosted.includes(action.cardId)) {
        log(state, `Add hosted to grip — ${action.cardId} not hosted.`);
        return { ok: true };
      }
      source.hostedCardIds = hosted.filter((id) => id !== action.cardId);
      const card = state.cards[action.cardId]!;
      card.hostId = undefined;
      card.zone = "runner:grip";
      card.faceup = true;
      state.runner.hand.push(action.cardId);
      log(state, `Add ${card.title} to grip from ${source.title}.`);
      if (
        (source.hostedCardIds?.length ?? 0) === 0 &&
        source.trashWhenNoHostedCards
      ) {
        moveRunnerCardToHeap(state, sourceId);
        log(state, `${source.title} trashed — no hosted cards remain.`);
      }
      return { ok: true };
    }
    case "turn_hosted_cards_faceup": {
      let n = 0;
      for (const id of source.hostedCardIds ?? []) {
        const c = state.cards[id];
        if (!c) continue;
        if (!c.faceup) {
          c.faceup = true;
          n += 1;
        }
      }
      log(
        state,
        n > 0
          ? `${source.title} — turn ${n} hosted card(s) faceup.`
          : `${source.title} — no facedown hosted cards.`,
      );
      return { ok: true };
    }
    case "host_copy_from_grip": {
      const match = state.runner.hand.find(
        (id) => state.cards[id]?.title === action.title,
      );
      if (!match) {
        log(
          state,
          `${source.title} — no ${action.title} in grip to host.`,
        );
        return { ok: true };
      }
      state.runner.hand = state.runner.hand.filter((id) => id !== match);
      const card = state.cards[match]!;
      card.hostId = sourceId;
      card.faceup = true;
      card.zone = `hosted:${sourceId}`;
      if (!source.hostedCardIds) source.hostedCardIds = [];
      source.hostedCardIds.push(match);
      log(
        state,
        `${source.title} hosts ${card.title} faceup (not installed).`,
      );
      return { ok: true };
    }
    case "matryoshka_break": {
      const enc = state.run?.encounter;
      if (!enc) {
        log(state, `Matryoshka break — no encounter.`);
        return { ok: true };
      }
      if (state.cards[enc.iceId]?.cannotBreakWithRunnerCardAbilities) {
        return {
          ok: false,
          error:
            "Runner card abilities cannot break subroutines on this ice (Trieste).",
          cites: [CR.encounterBreakPaw],
        };
      }
      const brStr = breakerStrength(state, sourceId);
      const iceStr = iceStrength(state, enc.iceId);
      if (brStr < iceStr) {
        log(
          state,
          `${source.title} — strength ${brStr} < ice ${iceStr}; cannot interface.`,
        );
        return { ok: true };
      }
      const faceupHosted = (source.hostedCardIds ?? []).filter((id) => {
        const c = state.cards[id];
        return c && c.faceup && c.title === source.title;
      });
      if (faceupHosted.length === 0) {
        log(state, `${source.title} — no faceup hosted copy to turn facedown.`);
        return { ok: true };
      }
      const unbroken = enc.broken.filter((b) => !b).length;
      if (unbroken === 0) {
        log(state, `${source.title} — no unbroken subroutines.`);
        return { ok: true };
      }
      const hostedId = faceupHosted[0]!;
      const maxX = Math.min(unbroken, state.runner.credits);
      if (maxX < 1) {
        log(state, `${source.title} — insufficient credits to break.`);
        return { ok: true };
      }
      if (maxX === 1) {
        return evalEffect(
          { state, sourceId },
          {
            op: "do",
            action: {
              kind: "matryoshka_break_resolve",
              amount: 1,
              hostedId,
            },
          },
        );
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: Array.from({ length: maxX }, (_, i) => {
          const amount = i + 1;
          return {
            id: `break:${amount}`,
            label: `Pay ${amount}¢, turn hosted facedown, break ${amount}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "matryoshka_break_resolve" as const,
                amount,
                hostedId,
              },
            },
          };
        }),
      };
      log(
        state,
        `${source.title} — choose how many subroutines to break (1–${maxX}).`,
      );
      return { ok: true };
    }
    case "matryoshka_break_resolve": {
      const enc = state.run?.encounter;
      if (!enc) {
        log(state, `Matryoshka break resolve — no encounter.`);
        return { ok: true };
      }
      const hosted = state.cards[action.hostedId];
      if (
        !hosted ||
        !(source.hostedCardIds ?? []).includes(action.hostedId) ||
        !hosted.faceup
      ) {
        log(state, `Matryoshka break resolve — invalid hosted copy.`);
        return { ok: true };
      }
      if (state.runner.credits < action.amount) {
        log(state, `Matryoshka break resolve — insufficient credits.`);
        return { ok: true };
      }
      state.runner.credits -= action.amount;
      hosted.faceup = false;
      log(
        state,
        `${source.title} spends ${action.amount}¢; turn hosted ${hosted.title} facedown.`,
      );
      for (let n = 0; n < action.amount; n++) {
        const idx = enc.broken.findIndex((b) => !b);
        if (idx < 0) break;
        enc.broken[idx] = true;
        const sub = state.cards[enc.iceId]?.subroutines?.[idx];
        log(
          state,
          `${source.title} breaks "${sub?.text ?? `sub ${idx}`}".`,
        );
      }
      if (!state.run!.breakersThatBroke) state.run!.breakersThatBroke = [];
      if (!state.run!.breakersThatBroke.includes(sourceId)) {
        state.run!.breakersThatBroke.push(sourceId);
      }
      return { ok: true };
    }
    case "host_ice_program_on_self": {
      // Magnet: host a program already hosted on another ice.
      const hosted: string[] = [];
      for (const id of Object.keys(state.cards)) {
        const c = state.cards[id];
        if (
          c.type === "program" &&
          c.hostId &&
          c.hostId !== sourceId &&
          state.runner.rig.includes(id)
        ) {
          hosted.push(id);
        }
      }
      if (hosted.length === 0) {
        log(state, `${source.title} — no hosted programs on other ice.`);
        return { ok: true };
      }
      const pid = hosted[0]!;
      const prog = state.cards[pid];
      prog.hostId = sourceId;
      prog.abilitiesBlanked = true;
      log(
        state,
        `${source.title} hosts ${prog.title} (abilities blanked).`,
      );
      return { ok: true };
    }
    case "rehost_on_other_ice": {
      const currentHost = source.hostId;
      const others: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const iceId of server.ice) {
          if (iceId !== currentHost) others.push(iceId);
        }
      }
      if (others.length === 0) {
        log(state, `${source.title} — no other installed ice to host on.`);
        return { ok: true };
      }
      if (others.length === 1) {
        const iceId = others[0]!;
        source.hostId = iceId;
        log(
          state,
          `${source.title} hosts on ${state.cards[iceId]!.title}.`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: others.map((iceId) => ({
          id: `rehost:${iceId}`,
          label: `Host on ${state.cards[iceId]!.title}`,
          effect: {
            op: "do" as const,
            action: { kind: "rehost_to_ice" as const, iceId },
          },
        })),
      };
      log(state, `${source.title} — choose another installed ice to host on.`);
      return { ok: true };
    }
    case "rehost_to_ice": {
      const ice = state.cards[action.iceId];
      if (!ice || ice.type !== "ice") {
        log(state, `Rehost — ${action.iceId} is not ice.`);
        return { ok: true };
      }
      let installed = false;
      for (const server of Object.values(state.servers)) {
        if (server.ice.includes(action.iceId)) {
          installed = true;
          break;
        }
      }
      if (!installed) {
        log(state, `Rehost — ${ice.title} is not installed.`);
        return { ok: true };
      }
      source.hostId = action.iceId;
      log(state, `${source.title} hosts on ${ice.title}.`);
      return { ok: true };
    }
    case "return_subliminal_from_archives": {
      // Handled at Corp turn begin when conditions met — this primitive
      // returns the source from Archives to HQ if present.
      if (!state.corp.discard.includes(sourceId)) {
        return { ok: true };
      }
      state.corp.discard = state.corp.discard.filter((id) => id !== sourceId);
      state.corp.hand.push(sourceId);
      source.zone = "corp:hq";
      source.faceup = false;
      log(state, `Return ${source.title} from Archives to HQ.`);
      return { ok: true };
    }
    case "aesop_trash_for_credits": {
      const owned = state.runner.rig.filter((id) => id !== sourceId);
      if (owned.length === 0) {
        log(state, `Aesop's Pawnshop — no other installed card.`);
        return { ok: true };
      }
      const id = owned[0]!;
      const card = state.cards[id];
      trashToHeap(state, id);
      state.runner.credits += action.amount;
      log(
        state,
        `Aesop's Pawnshop — trash ${card.title}, gain ${action.amount}¢.`,
      );
      return { ok: true };
    }
    case "ayla_set_aside_to_grip": {
      const setAside = state.runner.setAside ?? [];
      if (setAside.length === 0) {
        log(state, `Ayla — set-aside empty.`);
        return { ok: true };
      }
      const id = setAside[0]!;
      state.runner.setAside = setAside.filter((x) => x !== id);
      state.runner.hand.push(id);
      state.cards[id].zone = "runner:grip";
      state.cards[id].faceup = true;
      log(state, `Ayla — add ${state.cards[id].title} from set-aside to grip.`);
      return { ok: true };
    }
    case "sabotage": {
      if (action.interactive) {
        state.pendingSabotage = { sourceId, amount: action.amount };
        log(
          state,
          `Sabotage ${action.amount} pending — Corp chooses HQ cards (CR ${CR.sabotageResolution.number}).`,
        );
        return { ok: true };
      }
      return resolveSabotageAmount(state, sourceId, action.amount);
    }
    case "identify_mark": {
      identifyMark(state, sourceId);
      return { ok: true };
    }
    case "start_run_on_mark": {
      if (state.markServerId === null) {
        log(
          state,
          `Start run on mark — no mark designated (CR ${CR.mark.number}).`,
        );
        return { ok: true };
      }
      state.pendingStartRunOnMark = { sourceId };
      log(
        state,
        `Pending run on mark ${state.markServerId} (from ${source.title}; CR ${CR.mark.number}).`,
      );
      return { ok: true };
    }
    case "place_event_credits": {
      if (!state.run) {
        log(state, `place_event_credits — no active run.`);
        return { ok: true };
      }
      state.run.eventCredits = (state.run.eventCredits ?? 0) + action.amount;
      log(
        state,
        `Place ${action.amount}¢ on the run (event credits → ${state.run.eventCredits}).`,
      );
      return { ok: true };
    }
    case "may_start_run": {
      const servers: string[] = [];
      for (const [sid, server] of Object.entries(state.servers)) {
        if (action.servers === "remote" && server.kind !== "remote") continue;
        if (action.servers === "central" && server.kind !== "central") continue;
        if (action.servers === "hq" && sid !== "hq") continue;
        if (action.servers === "rd" && sid !== "rd") continue;
        if (action.servers === "archives" && sid !== "archives") continue;
        if (
          action.servers === "hq_rd" &&
          sid !== "hq" &&
          sid !== "rd"
        ) {
          continue;
        }
        servers.push(sid);
      }
      if (servers.length === 0) {
        log(state, `may_start_run — no matching servers.`);
        return { ok: true };
      }
      const bypassClicks = action.bypassFirstEncounterForClicks;
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          ...servers.map((sid) => ({
            id: `run:${sid}`,
            label: `Run ${sid}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "queue_start_run" as const,
                serverId: sid,
                ...(bypassClicks !== undefined
                  ? { bypassFirstEncounterForClicks: bypassClicks }
                  : {}),
              },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "runner" as const,
                amount: 0,
              },
            },
          },
        ],
      };
      log(state, `${source.title} — may start a run (${action.servers}).`);
      return { ok: true };
    }
    case "queue_start_run": {
      state.pendingStartRun = {
        sourceId,
        serverId: action.serverId as import("../state/types.js").ServerId,
        ...(action.bypassFirstEncounterForClicks !== undefined
          ? {
              bypassFirstEncounterForClicks:
                action.bypassFirstEncounterForClicks,
            }
          : {}),
      };
      log(
        state,
        `Pending run on ${action.serverId} (from ${source.title}).`,
      );
      return { ok: true };
    }
    case "may_install_from_heap": {
      const types = new Set(action.types);
      const discount = Math.max(0, action.discount ?? 0);
      const candidates = state.runner.discard.filter((id) => {
        const c = state.cards[id];
        return c && types.has(c.type as "program" | "hardware" | "resource") &&
          canInstallHeapCard(state, id, discount);
      });
      if (candidates.length === 0) {
        log(state, `${source.title} — may install from heap: none affordable.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          ...candidates.map((id) => {
            const c = state.cards[id]!;
            return {
              id: `install:${id}`,
              label: `Install ${c.title}`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "install_heap_card" as const,
                  cardId: id,
                  discount,
                },
              },
            };
          }),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "runner" as const,
                amount: 0,
              },
            },
          },
        ],
      };
      log(
        state,
        `${source.title} — may install from heap (${[...types].join("/")}).`,
      );
      return { ok: true };
    }
    case "haas_pet_project_setup": {
      const remaining = Math.max(0, action.remaining);
      if (remaining <= 0) return { ok: true };
      const remoteNum = state.nextRemoteNumber++;
      const sid = `remote-${remoteNum}` as import("../state/types.js").ServerId;
      state.servers[sid] = { id: sid, kind: "remote", ice: [], root: [] };
      log(state, `${source.title} — create ${sid} for Pet Project installs.`);
      return applyPrimitive(ctx, {
        kind: "haas_pet_project_install_continue",
        remaining,
        serverId: sid,
      });
    }
    case "haas_pet_project_install_continue": {
      let remaining = Math.max(0, action.remaining);
      const serverId = action.serverId as import("../state/types.js").ServerId;
      const dest = state.servers[serverId];
      if (!dest || dest.kind !== "remote") {
        log(state, `Pet Project install — invalid remote ${serverId}.`);
        return { ok: true };
      }
      if (action.justInstalledId) {
        const id = action.justInstalledId;
        const card = state.cards[id];
        const fromZone =
          action.justInstalledFrom === "archives"
            ? state.corp.discard
            : state.corp.hand;
        if (card && fromZone.includes(id)) {
          if (action.justInstalledFrom === "archives") {
            state.corp.discard = state.corp.discard.filter((cid) => cid !== id);
          } else {
            state.corp.hand = state.corp.hand.filter((cid) => cid !== id);
          }
          if (action.asIce || card.type === "ice") {
            dest.ice.unshift(id);
            card.zone = `server:${serverId}:ice`;
          } else {
            dest.root.push(id);
            card.zone = `server:${serverId}:root`;
          }
          card.rezzed = false;
          card.faceup = false;
          noteInstalledThisTurn(state, id);
          remaining = Math.max(0, remaining - 1);
          log(
            state,
            `Install ${card.title} from ${action.justInstalledFrom === "archives" ? "Archives" : "HQ"} on ${serverId}, ignoring all costs (${remaining} remaining).`,
          );
          if (card.onInstall) {
            const r = evalEffect({ state, sourceId: id }, card.onInstall);
            if (!r.ok) return r;
          }
        }
      }
      if (remaining <= 0) return { ok: true };
      const hqCandidates = state.corp.hand.filter((id) =>
        ["agenda", "asset", "upgrade", "ice"].includes(
          state.cards[id]?.type ?? "",
        ),
      );
      const archiveEligible = state.corp.discard.filter((id) =>
        ["agenda", "asset", "upgrade", "ice"].includes(
          state.cards[id]?.type ?? "",
        ),
      );
      if (hqCandidates.length === 0 && archiveEligible.length === 0) {
        log(state, `${source.title} — no more eligible cards in HQ/Archives.`);
        return { ok: true };
      }
      const buildOption = (id: string, from: "hq" | "archives") => {
        const card = state.cards[id]!;
        const asIce = card.type === "ice";
        return {
          id: `haas-${from}:${id}`,
          label: `Install ${card.title} from ${from === "hq" ? "HQ" : "Archives"} (ignore costs)`,
          effect: {
            op: "do" as const,
            action: {
              kind: "haas_pet_project_install_continue" as const,
              remaining,
              serverId,
              justInstalledId: id,
              justInstalledFrom: from,
              asIce,
            },
          },
        };
      };
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "done-haas-pet-project",
            label: "Done",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...hqCandidates.map((id) => buildOption(id, "hq")),
          ...archiveEligible.map((id) => buildOption(id, "archives")),
        ],
      };
      log(
        state,
        `${source.title} — install up to ${remaining} more from HQ/Archives into ${serverId}.`,
      );
      return { ok: true };
    }
    case "install_up_to_n_programs_from_grip_discount": {
      const remaining = Math.max(0, action.remaining);
      const discount = action.discount;
      if (remaining <= 0) return { ok: true };
      const candidates = state.runner.hand.filter((id) => {
        const c = state.cards[id];
        if (!c || c.type !== "program") return false;
        if (c.installOnIce || (c.subtypes ?? []).includes("trojan")) {
          return false;
        }
        const need = effectiveMemoryCost(state, id);
        if (usedMemory(state) + need > memoryLimit(state)) return false;
        const cost = gripInstallCostAfterDiscount(state, c, discount);
        return creditsAvailableForInstall(state, "runner") >= cost;
      });
      if (candidates.length === 0) {
        log(state, `${source.title} — no more affordable programs to install.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        candidates.map((id) => {
          const c = state.cards[id]!;
          return {
            id: `monolith:${id}`,
            label: `Install ${c.title} (${discount}¢ discount)`,
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: {
                    kind: "install_grip_card" as const,
                    cardId: id,
                    discount,
                  },
                },
                {
                  op: "do" as const,
                  action: {
                    kind: "install_up_to_n_programs_from_grip_discount" as const,
                    remaining: remaining - 1,
                    discount,
                  },
                },
              ],
            },
          };
        });
      options.push({
        id: "done",
        label: "Done installing",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "runner", amount: 0 },
        },
      });
      state.pendingChoice = { sourceId, chooser: "runner", options };
      log(
        state,
        `${source.title} — install up to ${remaining} program(s) from grip (${discount}¢ discount each; CR ${CR.runnerBasicInstall.number}).`,
      );
      return { ok: true };
    }
    case "scavenge_install_program": {
      const discount = Math.max(
        0,
        state.turn.lastTrashedOwnProgramInstallCost ?? 0,
      );
      const gripCandidates = state.runner.hand.filter((id) => {
        const c = state.cards[id];
        if (!c || c.type !== "program") return false;
        if (c.installOnIce || (c.subtypes ?? []).includes("trojan")) {
          return false;
        }
        const need = effectiveMemoryCost(state, id);
        if (usedMemory(state) + need > memoryLimit(state)) return false;
        const cost = gripInstallCostAfterDiscount(state, c, discount);
        return creditsAvailableForInstall(state, "runner") >= cost;
      });
      const heapCandidates = state.runner.discard.filter((id) => {
        const c = state.cards[id];
        return c && c.type === "program" && canInstallHeapCard(state, id, discount);
      });
      if (gripCandidates.length === 0 && heapCandidates.length === 0) {
        log(state, `${source.title} — no affordable program to install.`);
        return { ok: true };
      }
      const options = [
        ...gripCandidates.map((id) => {
          const c = state.cards[id]!;
          return {
            id: `scavenge-grip:${id}`,
            label: `Install ${c.title} (from grip)`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_grip_card" as const,
                cardId: id,
                discount,
              },
            },
          };
        }),
        ...heapCandidates.map((id) => {
          const c = state.cards[id]!;
          return {
            id: `scavenge-heap:${id}`,
            label: `Install ${c.title} (from heap)`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_heap_card" as const,
                cardId: id,
                discount,
              },
            },
          };
        }),
      ];
      if (options.length === 1) {
        return evalEffect(ctx, options[0]!.effect);
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options,
      };
      log(
        state,
        `${source.title} — choose a program to install (${discount}¢ discount; CR ${CR.runnerBasicInstall.number}).`,
      );
      return { ok: true };
    }
    case "install_from_heap": {
      const types = new Set(action.types);
      const discount = Math.max(0, action.discount ?? 0);
      const candidates = state.runner.discard.filter((id) => {
        const c = state.cards[id];
        return (
          c &&
          types.has(c.type as "program" | "hardware" | "resource") &&
          canInstallHeapCard(state, id, discount)
        );
      });
      if (candidates.length === 0) {
        log(state, `${source.title} — install from heap: none affordable.`);
        return { ok: true };
      }
      if (candidates.length === 1) {
        return evalEffect(ctx, {
          op: "do",
          action: {
            kind: "install_heap_card",
            cardId: candidates[0]!,
            discount,
          },
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: candidates.map((id) => {
          const c = state.cards[id]!;
          return {
            id: `install:${id}`,
            label: `Install ${c.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_heap_card" as const,
                cardId: id,
                discount,
              },
            },
          };
        }),
      };
      log(
        state,
        `${source.title} — install from heap (${[...types].join("/")}).`,
      );
      return { ok: true };
    }
    case "may_add_from_heap_to_stack_bottom": {
      const typeFilter = action.types?.length
        ? new Set(action.types)
        : null;
      const candidates = state.runner.discard.filter((id) => {
        const c = state.cards[id];
        if (!c) return false;
        if (!typeFilter) return true;
        return typeFilter.has(
          c.type as "program" | "hardware" | "resource" | "event",
        );
      });
      if (candidates.length === 0) {
        log(state, `${source.title} — may add from heap to stack: none.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          ...candidates.map((id) => ({
            id: `heap-stack:${id}`,
            label: `Add ${state.cards[id].title} to bottom of stack`,
            effect: {
              op: "do" as const,
              action: {
                kind: "add_from_heap_to_stack_bottom" as const,
                cardId: id,
              },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "runner" as const,
                amount: 0,
              },
            },
          },
        ],
      };
      log(state, `${source.title} — may add from heap to bottom of stack.`);
      return { ok: true };
    }
    case "add_from_heap_to_stack_bottom": {
      const id = action.cardId;
      const idx = state.runner.discard.indexOf(id);
      if (idx < 0) {
        log(state, `Add from heap — ${id} not in heap.`);
        return { ok: true };
      }
      state.runner.discard.splice(idx, 1);
      state.runner.deck.push(id);
      state.cards[id].zone = "runner:stack";
      state.cards[id].faceup = false;
      log(state, `Add ${state.cards[id].title} from heap to bottom of stack.`);
      return { ok: true };
    }
    case "may_add_from_heap_to_stack_top": {
      const candidates = [...state.runner.discard];
      if (candidates.length === 0) {
        log(state, `${source.title} — may add from heap to stack top: none.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          ...candidates.map((id) => ({
            id: `heap-stack-top:${id}`,
            label: `Add ${state.cards[id].title} to top of stack`,
            effect: {
              op: "do" as const,
              action: {
                kind: "add_from_heap_to_stack_top" as const,
                cardId: id,
              },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "runner" as const,
                amount: 0,
              },
            },
          },
        ],
      };
      log(state, `${source.title} — may add from heap to top of stack.`);
      return { ok: true };
    }
    case "add_from_heap_to_stack_top": {
      const id = action.cardId;
      const idx = state.runner.discard.indexOf(id);
      if (idx < 0) {
        log(state, `Add from heap to top — ${id} not in heap.`);
        return { ok: true };
      }
      state.runner.discard.splice(idx, 1);
      state.runner.deck.unshift(id);
      state.cards[id].zone = "runner:stack";
      state.cards[id].faceup = false;
      log(state, `Add ${state.cards[id].title} from heap to top of stack.`);
      return { ok: true };
    }
    case "may_add_one_of_card_ids_to_stack_bottom": {
      const ids = (
        action.cardIds ??
        state.turn.pendingGripOrStackTrashBatchIds ??
        []
      ).filter((id) => state.runner.discard.includes(id));
      if (ids.length === 0) {
        log(state, `${source.title} — no batch cards in heap to bottom.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          ...ids.map((id) => ({
            id: `batch-bottom:${id}`,
            label: `Add ${state.cards[id]!.title} to bottom of stack`,
            effect: {
              op: "do" as const,
              action: {
                kind: "add_card_id_to_stack_bottom" as const,
                cardId: id,
              },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "runner" as const,
                amount: 0,
              },
            },
          },
        ],
      };
      log(
        state,
        `${source.title} — may add 1 of the trashed cards to bottom of stack.`,
      );
      return { ok: true };
    }
    case "add_card_id_to_stack_bottom": {
      const id = action.cardId;
      const idx = state.runner.discard.indexOf(id);
      if (idx < 0) {
        log(state, `Add card to stack bottom — ${id} not in heap.`);
        return { ok: true };
      }
      state.runner.discard.splice(idx, 1);
      state.runner.deck.push(id);
      state.cards[id].zone = "runner:stack";
      state.cards[id].faceup = false;
      log(state, `Add ${state.cards[id].title} to bottom of stack.`);
      return { ok: true };
    }
    case "charge": {
      if (action.pick === "self") {
        return chargeCard(state, sourceId, sourceId);
      }
      if (action.pick === "card") {
        if (!action.cardId) {
          return {
            ok: false,
            error: "charge pick=card requires cardId.",
            cites: [CR.charge],
          };
        }
        return chargeCard(state, action.cardId, sourceId);
      }
      // choose among controller's installed chargeable cards
      const side = source.side;
      const cands = chargeableInstalledIds(state, side);
      if (cands.length === 0) {
        log(
          state,
          `Charge — no installed card with power counters (CR ${CR.chargeTargets.number}).`,
        );
        return { ok: true };
      }
      if (cands.length === 1) {
        return chargeCard(state, cands[0]!, sourceId);
      }
      state.pendingChoice = {
        sourceId,
        chooser: side,
        options: cands.map((id) => ({
          id: `charge-${id}`,
          label: `Charge ${state.cards[id].title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "charge" as const,
              pick: "card" as const,
              cardId: id,
            },
          },
        })),
      };
      log(
        state,
        `Charge — ${side} chooses among ${cands.length} cards (CR ${CR.chargeTargets.number}).`,
      );
      return { ok: true };
    }
    case "bonus_access": {
      if (!state.run) {
        return {
          ok: false,
          error: "bonus_access requires an active run.",
          cites: [CR.breach],
        };
      }
      const n = action.amount;
      if (n <= 0) return { ok: true };
      state.run.bonusAccess = (state.run.bonusAccess ?? 0) + n;
      log(
        state,
        `${source.title} — +${n} bonus access (CR ${CR.breach.number}).`,
      );
      return { ok: true };
    }
    case "breach_server_when_run_ends": {
      if (!state.run) {
        return {
          ok: false,
          error: "breach_server_when_run_ends requires an active run.",
          cites: [CR.breach],
        };
      }
      state.run.breachWhenRunEnds = action.server;
      log(
        state,
        `${source.title} — breach ${action.server} when the run ends (CR ${CR.breach.number}).`,
      );
      return { ok: true };
    }
    case "search_stack_program_install": {
      return searchStackProgramInstall(state, sourceId);
    }
    case "install_stack_program": {
      return installStackProgramPaying(state, action.cardId, sourceId);
    }
    case "spark_of_inspiration_resolve": {
      const discount = Math.max(0, action.discount ?? 10);
      const aside: string[] = [];
      let programId: string | null = null;
      while (state.runner.deck.length > 0) {
        const id = state.runner.deck.shift()!;
        aside.push(id);
        state.cards[id]!.faceup = true;
        state.cards[id]!.zone = "runner:set-aside";
        if (state.cards[id]!.type === "program") {
          programId = id;
          break;
        }
      }
      state.runner.setAside = aside;
      log(
        state,
        `${source.title} — set aside ${aside.length} card(s) from stack faceup.`,
      );
      if (!programId) {
        shuffleRunnerSetAsideIntoStack(state);
        return { ok: true };
      }
      const prog = state.cards[programId]!;
      if (!canInstallSetAsideProgram(state, programId, discount)) {
        log(
          state,
          `${source.title} — cannot install ${prog.title}; shuffle set-aside.`,
        );
        shuffleRunnerSetAsideIntoStack(state);
        return { ok: true };
      }
      const cost = stackCardInstallCost(state, prog, discount);
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "install",
            label: `Install ${prog.title} for ${cost}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_set_aside_program" as const,
                cardId: programId,
                discount,
              },
            },
          },
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: { kind: "shuffle_runner_set_aside_into_stack" as const },
            },
          },
        ],
      };
      log(
        state,
        `${source.title} — may install ${prog.title} (${discount}¢ discount).`,
      );
      return { ok: true };
    }
    case "install_set_aside_program": {
      return installSetAsideProgramPaying(
        state,
        action.cardId,
        action.discount,
        sourceId,
      );
    }
    case "shuffle_runner_set_aside_into_stack": {
      shuffleRunnerSetAsideIntoStack(state);
      return { ok: true };
    }
    case "trash_top_of_stack": {
      if (state.runner.deck.length === 0) {
        log(state, `${source.title} — trash top of stack: stack empty.`);
        return { ok: true };
      }
      const topId = state.runner.deck[0]!;
      moveRunnerCardToHeap(state, topId);
      log(
        state,
        `${source.title} — trash top of stack (${state.cards[topId]?.title ?? topId}).`,
      );
      return { ok: true };
    }
    case "trash_top_of_rd": {
      if (state.corp.deck.length === 0) {
        log(state, `${source.title} — trash top of R&D: R&D empty.`);
        return { ok: true };
      }
      const topId = state.corp.deck.shift()!;
      trashCorpCardFacedownToArchives(state, topId);
      log(
        state,
        `${source.title} — trash top of R&D (${state.cards[topId]?.title ?? topId}).`,
      );
      maybeFireNuvemFirstRdTrash(state);
      return { ok: true };
    }
    case "reveal_top_of_rd": {
      const topId = state.corp.deck[0];
      if (!topId) {
        log(state, `${source.title} — reveal top of R&D: empty.`);
        return { ok: true };
      }
      const top = state.cards[topId]!;
      top.faceup = true;
      log(state, `${source.title} — reveal top of R&D (${top.title}).`);
      // Reveal is informational; leave card on top (faceup flag cleared for
      // unrevealed deck convention after the pulse is logged).
      top.faceup = false;
      return { ok: true };
    }
    case "set_trace_base_strength": {
      if (!state.trace) {
        log(state, `${source.title} — set trace base: no trace in progress.`);
        return { ok: true };
      }
      const prev = state.trace.baseStrength;
      state.trace.baseStrength = Math.max(0, action.amount);
      log(
        state,
        `${source.title} — set trace base strength ${prev} → ${state.trace.baseStrength}.`,
      );
      return { ok: true };
    }
    case "forbid_runner_runs_this_turn": {
      state.turn.cannotMakeAnotherRunThisTurn = true;
      log(state, `${source.title} — Runner cannot make another run this turn.`);
      return { ok: true };
    }
    case "fully_operational_resolve": {
      let remotes = 0;
      for (const server of Object.values(state.servers)) {
        if (server.kind !== "remote") continue;
        if (server.root.length > 0 && server.ice.length > 0) remotes += 1;
      }
      const remaining = 1 + remotes;
      log(
        state,
        `${source.title} — resolve ${remaining} time(s) (1 + ${remotes} iced rooted remote(s)).`,
      );
      return applyPrimitive(ctx, {
        kind: "fully_operational_step",
        remaining,
      });
    }
    case "fully_operational_step": {
      const remaining = Math.max(0, action.remaining ?? 0);
      if (remaining <= 0) return { ok: true };
      const nextRemaining = remaining - 1;
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: `fo-gain:${remaining}`,
            label: "Gain 2¢",
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: {
                    kind: "gain_credits" as const,
                    side: "corp" as const,
                    amount: 2,
                  },
                },
                {
                  op: "do" as const,
                  action: {
                    kind: "fully_operational_step" as const,
                    remaining: nextRemaining,
                  },
                },
              ],
            },
          },
          {
            id: `fo-draw:${remaining}`,
            label: "Draw 2 cards",
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: {
                    kind: "draw" as const,
                    side: "corp" as const,
                    amount: 2,
                  },
                },
                {
                  op: "do" as const,
                  action: {
                    kind: "fully_operational_step" as const,
                    remaining: nextRemaining,
                  },
                },
              ],
            },
          },
        ],
      };
      log(
        state,
        `${source.title} — choose gain 2¢ or draw 2 (${remaining} remaining).`,
      );
      return { ok: true };
    }
    case "look_top_n_stack_may_bottom_one": {
      const n = Math.max(0, action.n ?? 0);
      const taken = state.runner.deck.splice(
        0,
        Math.min(n, state.runner.deck.length),
      );
      if (taken.length === 0) {
        log(state, `${source.title} — look at top of stack: empty.`);
        return { ok: true };
      }
      for (const id of taken) {
        state.cards[id]!.faceup = true;
        log(state, `Runner looks at stack — ${state.cards[id]!.title}.`);
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "leave-top",
            label: "Leave cards on top of stack",
            effect: {
              op: "do" as const,
              action: {
                kind: "look_top_n_stack_bottom_one" as const,
                lookedIds: taken,
              },
            },
          },
          ...taken.map((id) => ({
            id: `bottom:${id}`,
            label: `Add ${state.cards[id]!.title} to bottom of stack`,
            effect: {
              op: "do" as const,
              action: {
                kind: "look_top_n_stack_bottom_one" as const,
                cardId: id,
                lookedIds: taken,
              },
            },
          })),
        ],
      };
      log(
        state,
        `${source.title} — may add 1 of ${taken.length} looked card(s) to bottom.`,
      );
      return { ok: true };
    }
    case "look_top_n_stack_bottom_one": {
      const looked = action.lookedIds ?? [];
      const bottomId = action.cardId;
      const keep: string[] = [];
      for (const id of looked) {
        if (bottomId && id === bottomId) continue;
        keep.push(id);
      }
      for (let i = keep.length - 1; i >= 0; i--) {
        const id = keep[i]!;
        state.cards[id]!.faceup = false;
        state.runner.deck.unshift(id);
      }
      if (bottomId && looked.includes(bottomId)) {
        state.cards[bottomId]!.faceup = false;
        state.runner.deck.push(bottomId);
        log(
          state,
          `Add ${state.cards[bottomId]!.title} to bottom of stack.`,
        );
      } else {
        log(state, `Leave looked card(s) on top of stack.`);
      }
      return { ok: true };
    }
    case "choose_grant_encounter_ice_subtype": {
      if (!state.run?.encounter) {
        log(state, `${source.title} — grant subtype: no encounter.`);
        return { ok: true };
      }
      const options = ["barrier", "code gate", "sentry"];
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: options.map((subtype) => ({
          id: `pelangi:${subtype}`,
          label: `Encountered ice gains ${subtype}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "grant_encounter_ice_subtype" as const,
              subtype,
            },
          },
        })),
      };
      log(
        state,
        `${source.title} — choose an ice subtype for the encounter.`,
      );
      return { ok: true };
    }
    case "grant_encounter_ice_subtype": {
      const enc = state.run?.encounter;
      if (!enc) {
        log(state, `${source.title} — grant subtype: no encounter.`);
        return { ok: true };
      }
      if (!enc.grantedSubtypes) enc.grantedSubtypes = [];
      if (!enc.grantedSubtypes.includes(action.subtype)) {
        enc.grantedSubtypes.push(action.subtype);
      }
      const ice = state.cards[enc.iceId];
      log(
        state,
        `${ice?.title ?? enc.iceId} gains ${action.subtype} this encounter.`,
      );
      return { ok: true };
    }
    case "loot_box_reveal_top_n": {
      const n = Math.max(0, action.n ?? 0);
      const revealed = state.runner.deck.splice(
        0,
        Math.min(n, state.runner.deck.length),
      );
      if (revealed.length === 0) {
        log(state, `${source.title} — reveal top of stack: empty.`);
        return { ok: true };
      }
      for (const id of revealed) {
        state.cards[id]!.faceup = true;
        log(state, `Reveal stack — ${state.cards[id]!.title}.`);
      }
      if (revealed.length === 1) {
        return applyPrimitive(ctx, {
          kind: "loot_box_pick_revealed",
          cardId: revealed[0]!,
          revealedIds: revealed,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: revealed.map((id) => {
          const card = state.cards[id]!;
          const cost = card.playCost ?? card.installCost ?? 0;
          return {
            id: `loot:${id}`,
            label: `Add ${card.title} to grip (Corp gains ${cost}¢)`,
            effect: {
              op: "do" as const,
              action: {
                kind: "loot_box_pick_revealed" as const,
                cardId: id,
                revealedIds: revealed,
              },
            },
          };
        }),
      };
      log(
        state,
        `${source.title} — Corp chooses 1 of ${revealed.length} revealed card(s).`,
      );
      return { ok: true };
    }
    case "loot_box_pick_revealed": {
      const pick = action.cardId;
      const revealed = action.revealedIds ?? [];
      if (!revealed.includes(pick)) {
        log(state, `${source.title} — Loot Box pick not in revealed set.`);
        return { ok: true };
      }
      const card = state.cards[pick]!;
      const cost = card.playCost ?? card.installCost ?? 0;
      state.runner.hand.push(pick);
      card.zone = "runner:grip";
      card.faceup = true;
      state.corp.credits += cost;
      log(
        state,
        `Add ${card.title} to grip; Corp gains ${cost}¢ → ${state.corp.credits}.`,
      );
      const rest = revealed.filter((id) => id !== pick);
      for (const id of rest) {
        state.cards[id]!.faceup = false;
        state.runner.deck.push(id);
      }
      if (rest.length > 0) {
        shuffleRunnerStack(state);
        log(state, `Shuffle ${rest.length} remaining card(s) into stack.`);
      }
      return { ok: true };
    }
    case "search_rd_ice_install_central_discount": {
      const iceIds = state.corp.deck.filter(
        (id) => state.cards[id]?.type === "ice",
      );
      if (iceIds.length === 0) {
        log(state, `Search R&D for ice — none found.`);
        return { ok: true };
      }
      const discount = Math.max(0, action.discount ?? 0);
      const offerInstall = (cardId: string): EvalResult => {
        const card = state.cards[cardId]!;
        card.faceup = true;
        log(state, `Search R&D — reveal ${card.title}.`);
        const deckIdx = state.corp.deck.indexOf(cardId);
        if (deckIdx >= 0) state.corp.deck.splice(deckIdx, 1);
        shuffleCorpRdAfterSearch(state);
        const centrals = Object.values(state.servers).filter(
          (s) => s.kind === "central",
        );
        state.pendingChoice = {
          sourceId,
          chooser: "corp",
          options: centrals.map((server) => ({
            id: `sap:${cardId}:${server.id}`,
            label: `Install ${card.title} protecting ${server.id}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_rd_ice_protecting_central_discount" as const,
                cardId,
                serverId: server.id,
                discount,
              },
            },
          })),
        };
        log(
          state,
          `${source.title} — install revealed ice protecting a central (−${discount}¢).`,
        );
        return { ok: true };
      };
      if (iceIds.length === 1) return offerInstall(iceIds[0]!);
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: iceIds.map((id) => ({
          id: `sap-search:${id}`,
          label: `Reveal ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "search_rd_ice_install_central_discount_pick" as const,
              cardId: id,
              discount,
            },
          },
        })),
      };
      log(state, `Search R&D — choose ice to reveal and install.`);
      return { ok: true };
    }
    case "search_rd_ice_install_central_discount_pick": {
      const cardId = action.cardId;
      const discount = Math.max(0, action.discount ?? 0);
      const card = state.cards[cardId];
      if (!card || card.type !== "ice" || !state.corp.deck.includes(cardId)) {
        log(state, `Secure and Protect pick — invalid ice.`);
        return { ok: true };
      }
      card.faceup = true;
      log(state, `Search R&D — reveal ${card.title}.`);
      state.corp.deck = state.corp.deck.filter((x) => x !== cardId);
      shuffleCorpRdAfterSearch(state);
      const centrals = Object.values(state.servers).filter(
        (s) => s.kind === "central",
      );
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: centrals.map((server) => ({
          id: `sap:${cardId}:${server.id}`,
          label: `Install ${card.title} protecting ${server.id}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "install_rd_ice_protecting_central_discount" as const,
              cardId,
              serverId: server.id,
              discount,
            },
          },
        })),
      };
      log(
        state,
        `${source.title} — install revealed ice protecting a central (−${discount}¢).`,
      );
      return { ok: true };
    }
    case "install_rd_ice_protecting_central_discount": {
      const card = state.cards[action.cardId];
      const serverId = action.serverId as import("../state/types.js").ServerId;
      const server = state.servers[serverId];
      if (!card || !server || server.kind !== "central") {
        log(state, `Install R&D ice on central — missing card/server.`);
        return { ok: true };
      }
      // Card was removed from R&D at reveal time; ensure it's not still there.
      state.corp.deck = state.corp.deck.filter((id) => id !== action.cardId);
      const discount = Math.max(0, action.discount ?? 0);
      const pay = Math.max(0, (card.installCost ?? 0) - discount);
      if (creditsAvailableForInstall(state, "corp") < pay) {
        log(
          state,
          `Cannot afford to install ${card.title} for ${pay}¢ — return to R&D.`,
        );
        state.corp.deck.unshift(action.cardId);
        card.zone = "corp:rd";
        card.faceup = false;
        return { ok: true };
      }
      spendCreditsForInstall(state, "corp", pay);
      server.ice.unshift(action.cardId);
      card.zone = `server:${serverId}:ice`;
      card.rezzed = false;
      card.faceup = false;
      card.advancementTokens = card.advancementTokens ?? 0;
      log(
        state,
        `Install ${card.title} outermost on ${serverId} for ${pay}¢ (−${discount}¢).`,
      );
      return { ok: true };
    }
    case "return_rig_card_to_grip": {
      const id = action.cardId;
      const card = state.cards[id];
      if (!card || !state.runner.rig.includes(id)) {
        log(state, `${source.title} — return to grip: card not installed.`);
        return { ok: true };
      }
      removeCardFromCurrentZone(state, id);
      // Clear trojan host link when bouncing.
      card.hostId = undefined;
      state.runner.hand.push(id);
      card.zone = "runner:grip";
      card.faceup = true;
      log(state, `Return ${card.title} to grip.`);
      return { ok: true };
    }
    case "rejig_bounce_install": {
      const candidates = state.runner.rig.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "program" || t === "hardware";
      });
      if (candidates.length === 0) {
        log(state, `${source.title} — no installed program or hardware.`);
        return { ok: true };
      }
      const build = (cardId: string): Effect => {
        const printed = state.cards[cardId]!.installCost ?? 0;
        return {
          op: "seq" as const,
          effects: [
            {
              op: "do" as const,
              action: {
                kind: "return_rig_card_to_grip" as const,
                cardId,
              },
            },
            {
              op: "do" as const,
              action: {
                kind: "install_from_grip_discount" as const,
                types: ["program", "hardware"],
                discount: printed,
              },
            },
          ],
        };
      };
      if (candidates.length === 1) {
        return evalEffect({ state, sourceId }, build(candidates[0]!));
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: candidates.map((id) => {
          const c = state.cards[id]!;
          const printed = c.installCost ?? 0;
          return {
            id: `rejig:${id}`,
            label: `Add ${c.title} to grip (install −${printed}¢)`,
            effect: build(id),
          };
        }),
      };
      log(
        state,
        `${source.title} — choose installed program/hardware to add to grip.`,
      );
      return { ok: true };
    }
    case "may_return_non_virus_trojan_to_grip_place_hosted": {
      const hostedAmount = Math.max(0, action.hostedAmount);
      const candidates = state.runner.rig.filter((id) => {
        const c = state.cards[id];
        if (!c) return false;
        if (!(c.subtypes ?? []).includes("trojan")) return false;
        if ((c.subtypes ?? []).includes("virus")) return false;
        return true;
      });
      if (candidates.length === 0) {
        log(
          state,
          `${source.title} — no installed non-virus trojan to return.`,
        );
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        candidates.map((id) => {
          const c = state.cards[id]!;
          return {
            id: `return:${id}`,
            label: `Return ${c.title} to grip; place ${hostedAmount}¢`,
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: {
                    kind: "return_rig_card_to_grip" as const,
                    cardId: id,
                  },
                },
                {
                  op: "do" as const,
                  action: {
                    kind: "place_hosted_credits" as const,
                    amount: hostedAmount,
                  },
                },
              ],
            },
          };
        });
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do" as const,
          action: { kind: "gain_credits" as const, side: "runner", amount: 0 },
        },
      });
      state.pendingChoice = { sourceId, chooser: "runner", options };
      log(
        state,
        `${source.title} — may return a non-virus trojan to grip.`,
      );
      return { ok: true };
    }
    case "trash_top_n_may_install_discount": {
      const count = Math.max(0, action.count);
      const discount = Math.max(0, action.discount);
      const milled: string[] = [];
      for (let i = 0; i < count && state.runner.deck.length > 0; i++) {
        const id = state.runner.deck[0]!;
        moveRunnerCardToHeap(state, id);
        milled.push(id);
      }
      log(
        state,
        `${source.title} — trash top ${milled.length} of stack to heap.`,
      );
      const candidates = milled.filter((id) =>
        canInstallHeapCard(state, id, discount),
      );
      if (candidates.length === 0) {
        log(
          state,
          `${source.title} — no affordable install among milled cards.`,
        );
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        candidates.map((id) => {
          const c = state.cards[id]!;
          const cost = gripInstallCostAfterDiscount(state, c, discount);
          return {
            id: `install:${id}`,
            label: `Install ${c.title} for ${cost}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_heap_card" as const,
                cardId: id,
                discount,
              },
            },
          };
        });
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do" as const,
          action: { kind: "gain_credits" as const, side: "runner", amount: 0 },
        },
      });
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options,
      };
      log(
        state,
        `${source.title} — may install 1 of ${candidates.length} milled card(s) (${discount}¢ discount).`,
      );
      return { ok: true };
    }
    case "install_heap_card": {
      return installHeapCardDiscounted(
        state,
        action.cardId,
        action.discount,
        sourceId,
      );
    }
    case "may_trash_other_installed_search_stack_same_type_install": {
      const discount = Math.max(0, action.discount);
      const targets = state.runner.rig.filter((id) => id !== sourceId);
      if (targets.length === 0) {
        log(
          state,
          `${source.title} — may trash other installed: none available.`,
        );
        return { ok: true };
      }
      const installTypes = new Set(["program", "hardware", "resource"]);
      const options: Array<{ id: string; label: string; effect: Effect }> =
        targets
          .filter((id) => installTypes.has(state.cards[id]!.type))
          .map((id) => {
            const c = state.cards[id]!;
            const cardType = c.type as "program" | "hardware" | "resource";
            return {
              id: `trash:${id}`,
              label: `Trash ${c.title}; search for a ${cardType}`,
              effect: {
                op: "seq" as const,
                effects: [
                  {
                    op: "do" as const,
                    action: {
                      kind: "trash_runner_rig_card" as const,
                      cardId: id,
                    },
                  },
                  {
                    op: "do" as const,
                    action: {
                      kind: "search_stack_type_install" as const,
                      cardType,
                      discount,
                    },
                  },
                ],
              },
            };
          });
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do" as const,
          action: {
            kind: "gain_credits" as const,
            side: "runner" as const,
            amount: 0,
          },
        },
      });
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options,
      };
      log(
        state,
        `${source.title} — may trash another installed card to search stack.`,
      );
      return { ok: true };
    }
    case "trash_runner_rig_card": {
      if (!state.runner.rig.includes(action.cardId)) {
        log(state, `Trash runner card — ${action.cardId} not installed.`);
        return { ok: true };
      }
      const title = state.cards[action.cardId]!.title;
      trashToHeap(state, action.cardId);
      log(
        state,
        `Trash installed ${title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "trash_runner_rig_card_record_program_cost": {
      if (!state.runner.rig.includes(action.cardId)) {
        log(state, `Trash runner card — ${action.cardId} not installed.`);
        return { ok: true };
      }
      const title = state.cards[action.cardId]!.title;
      const cost = state.cards[action.cardId]!.installCost;
      trashToHeap(state, action.cardId);
      state.turn.lastTrashedOwnProgramInstallCost = cost;
      log(
        state,
        `Trash installed ${title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "search_stack_type_install": {
      return searchStackTypeInstall(
        state,
        sourceId,
        action.cardType,
        action.discount,
      );
    }
    case "install_stack_card": {
      return installStackCardPaying(
        state,
        action.cardId,
        action.discount,
        sourceId,
      );
    }
    case "exclusive_choices_per_passed_ice": {
      return startExclusiveChoicesPerPassedIce(
        state,
        sourceId,
        action.options,
      );
    }
    case "choose_exactly_n": {
      return startExclusiveChoicesExactlyN(
        state,
        sourceId,
        action.n,
        action.options,
        source.side === "corp" ? "corp" : "runner",
      );
    }
    case "gain_strength_this_turn": {
      const boostId = action.targetCardId ?? sourceId;
      const boostCard = state.cards[boostId] ?? source;
      state.turn.breakerStrengthBoostsThisTurn[boostId] =
        (state.turn.breakerStrengthBoostsThisTurn[boostId] ?? 0) +
        action.amount;
      log(
        state,
        `${boostCard.title} +${action.amount} strength this turn → ${breakerStrength(state, boostId)}.`,
      );
      return { ok: true };
    }
    case "choose_icebreaker_gain_strength_this_turn": {
      const targets = state.runner.rig.filter((id) => {
        const c = state.cards[id];
        if (!c || c.type !== "program") return false;
        return (
          Boolean(c.breaker) || (c.subtypes ?? []).includes("icebreaker")
        );
      });
      if (targets.length === 0) {
        log(state, `${source.title} — no icebreaker to boost.`);
        return { ok: true };
      }
      if (targets.length === 1) {
        const id = targets[0]!;
        state.turn.breakerStrengthBoostsThisTurn[id] =
          (state.turn.breakerStrengthBoostsThisTurn[id] ?? 0) + action.amount;
        log(
          state,
          `${state.cards[id]!.title} +${action.amount} strength this turn → ${breakerStrength(state, id)}.`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: targets.map((id) => ({
          id: `icebreaker-str:${id}`,
          label: `+${action.amount} strength to ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "gain_strength_this_turn" as const,
              amount: action.amount,
              targetCardId: id,
            },
          },
        })),
      };
      log(
        state,
        `${source.title} — choose an icebreaker for +${action.amount} strength this turn.`,
      );
      return { ok: true };
    }
    case "choose_ice_additional_rez_cost_this_turn": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (state.cards[id]) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `${source.title} — no ice to choose.`);
        return { ok: true };
      }
      if (targets.length === 1) {
        const id = targets[0]!;
        state.turn.iceAdditionalRezCostThisTurn[id] =
          (state.turn.iceAdditionalRezCostThisTurn[id] ?? 0) + action.amount;
        log(
          state,
          `${state.cards[id]!.title} costs +${action.amount}¢ to rez this turn.`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: targets.map((id) => ({
          id: `ice-rez-bump:${id}`,
          label: `+${action.amount}¢ rez to ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "add_ice_additional_rez_cost_this_turn" as const,
              cardId: id,
              amount: action.amount,
            },
          },
        })),
      };
      log(
        state,
        `${source.title} — choose ice for +${action.amount}¢ rez this turn.`,
      );
      return { ok: true };
    }
    case "add_ice_additional_rez_cost_this_turn": {
      const target = state.cards[action.cardId];
      if (!target) {
        log(
          state,
          `Add ice rez cost — unknown card ${action.cardId}.`,
        );
        return { ok: true };
      }
      state.turn.iceAdditionalRezCostThisTurn[action.cardId] =
        (state.turn.iceAdditionalRezCostThisTurn[action.cardId] ?? 0) +
        action.amount;
      log(
        state,
        `${target.title} costs +${action.amount}¢ to rez this turn.`,
      );
      return { ok: true };
    }
    case "shuffle_source_into_rd": {
      if (!state.runner.score.includes(sourceId)) {
        log(state, `Shuffle into R&D — source not in Runner score area.`);
        return { ok: true };
      }
      removeCardFromCurrentZone(state, sourceId);
      state.corp.deck.push(sourceId);
      source.zone = "corp:rd";
      source.faceup = false;
      source.rezzed = false;
      state.corp.deck.reverse();
      log(state, `${source.title} — shuffle from Runner score into R&D.`);
      return { ok: true };
    }
    case "enable_hosted_credits_spend_for": {
      source.hostedCreditsSpendFor = [...action.purposes];
      log(
        state,
        `${source.title} — hosted credits spendable for ${action.purposes.join(", ")}.`,
      );
      return { ok: true };
    }
    case "place_advancements_on": {
      const target = state.cards[action.cardId];
      if (!target) {
        log(state, `Place advancements — unknown card ${action.cardId}.`);
        if (action.then) return evalEffect(ctx, action.then);
        return { ok: true };
      }
      target.advancementTokens =
        (target.advancementTokens ?? 0) + action.amount;
      state.turn.lastAdvancementTargetId = action.cardId;
      if (action.cannotScoreTargetThisTurn) {
        if (!state.turn.cannotScoreOrRezCardIds.includes(action.cardId)) {
          state.turn.cannotScoreOrRezCardIds.push(action.cardId);
        }
      }
      log(
        state,
        `Place ${action.amount} advancement(s) on ${target.title} → ${target.advancementTokens}.`,
      );
      if (action.then) return evalEffect(ctx, action.then);
      return { ok: true };
    }
    case "may_install_from_hq_paying_costs": {
      const eligible = state.corp.hand.filter((id) => {
        const t = state.cards[id].type;
        if (action.excludeAgenda && t === "agenda") return false;
        return (
          t === "agenda" || t === "asset" || t === "ice" || t === "upgrade"
        );
      });
      const affordable = eligible.filter(
        (id) =>
          creditsAvailableForInstall(state, "corp") >=
          (state.cards[id].installCost ?? 0),
      );
      if (affordable.length === 0) {
        log(state, `Install from HQ paying costs — no eligible affordable card.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...affordable.map((id) => ({
            id: `hq-install:${id}`,
            label: `Install ${state.cards[id].title} for ${state.cards[id].installCost ?? 0}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_hq_card_paying_costs" as const,
                cardId: id,
                ...(action.thenMayRemoveTagToAdvance
                  ? { thenMayRemoveTagToAdvance: true }
                  : {}),
                ...(action.cannotScoreInstalledCardThisTurn
                  ? { cannotScoreInstalledCardThisTurn: true }
                  : {}),
              },
            },
          })),
        ],
      };
      log(state, `May install one card from HQ paying install costs.`);
      return { ok: true };
    }
    case "may_install_from_hq_in_remote_root_paying_costs": {
      const hqCards = state.corp.hand.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "agenda" || t === "asset" || t === "upgrade";
      });
      const affordable = hqCards.filter(
        (id) =>
          creditsAvailableForInstall(state, "corp") >=
          (state.cards[id]!.installCost ?? 0),
      );
      if (affordable.length === 0) {
        log(state, `May install from HQ in remote root — none affordable.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline",
            label: "Decline install",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...affordable.map((id) => ({
            id: `drm-install:${id}`,
            label: `Install ${state.cards[id]!.title} in a new remote root for ${state.cards[id]!.installCost ?? 0}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_hq_card_paying_costs" as const,
                cardId: id,
              },
            },
          })),
        ],
      };
      log(
        state,
        `May install 1 card from HQ in the root of a remote server paying costs.`,
      );
      return { ok: true };
    }
    case "install_hq_card_paying_costs": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.corp.hand.includes(cardId)) {
        log(state, `Install from HQ — card not in HQ.`);
        return { ok: true };
      }
      const cost = card.installCost ?? 0;
      if (creditsAvailableForInstall(state, "corp") < cost) {
        log(state, `Install from HQ — cannot afford ${cost}¢.`);
        return { ok: true };
      }
      spendCreditsForInstall(state, "corp", cost);
      state.corp.hand = state.corp.hand.filter((id) => id !== cardId);
      const remoteNum = state.nextRemoteNumber++;
      const sid = `remote-${remoteNum}` as import("../state/types.js").ServerId;
      state.servers[sid] = { id: sid, kind: "remote", ice: [], root: [] };
      if (card.type === "ice") {
        state.servers[sid].ice.push(cardId);
        card.zone = `server:${sid}:ice`;
      } else {
        state.servers[sid].root.push(cardId);
        card.zone = `server:${sid}:root`;
      }
      card.rezzed = false;
      card.faceup = false;
      if (card.type === "agenda" || card.type === "asset") {
        card.advancementTokens = card.advancementTokens ?? 0;
      }
      state.turn.lastInstalledFromEffectId = cardId;
      noteInstalledThisTurn(state, cardId);
      if (action.cannotScoreInstalledCardThisTurn) {
        if (!state.turn.cannotScoreOrRezCardIds.includes(cardId)) {
          state.turn.cannotScoreOrRezCardIds.push(cardId);
        }
      }
      // Paying-costs install is always from HQ.
      state.turn.corpInstalledFromHqThisTurn = true;
      log(
        state,
        `Install ${card.title} from HQ onto ${sid} for ${cost}¢.`,
      );
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
        if (!r.ok) return r;
      }
      if (
        action.thenMayRemoveTagToAdvance &&
        state.runner.tags >= 1 &&
        state.turn.lastInstalledFromEffectId
      ) {
        const installedId = state.turn.lastInstalledFromEffectId;
        const installed = state.cards[installedId];
        state.pendingChoice = {
          sourceId,
          chooser: "corp",
          options: [
            {
              id: "decline",
              label: "Decline",
              effect: {
                op: "do",
                action: { kind: "gain_credits", side: "corp", amount: 0 },
              },
            },
            {
              id: "tag-advance",
              label: `Remove 1 tag, place 1 advancement on ${installed?.title ?? installedId}`,
              effect: {
                op: "seq",
                effects: [
                  {
                    op: "do",
                    action: { kind: "remove_tags", amount: 1 },
                  },
                  {
                    op: "do",
                    action: {
                      kind: "place_advancements_on",
                      cardId: installedId,
                      amount: 1,
                    },
                  },
                ],
              },
            },
          ],
        };
        log(state, `May remove 1 tag to place 1 advancement on installed card.`);
      }
      return { ok: true };
    }
    case "may_move_source_upgrade_to_another_server_root": {
      if (source.type !== "upgrade") {
        log(state, `Move upgrade — source is not an upgrade.`);
        return { ok: true };
      }
      const zone = source.zone ?? "";
      if (!zone.endsWith(":root")) {
        log(state, `Move upgrade — source not in a server root.`);
        return { ok: true };
      }
      const currentSid = zone
        .replace(/^server:/, "")
        .replace(/:root$/, "") as import("../state/types.js").ServerId;
      const targets = (
        Object.keys(state.servers) as import("../state/types.js").ServerId[]
      ).filter((sid) => sid !== currentSid);
      if (targets.length === 0) {
        log(state, `Move upgrade — no other servers.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...targets.map((sid) => ({
            id: `move-root:${sid}`,
            label: `Move to ${sid} root`,
            effect: {
              op: "do" as const,
              action: {
                kind: "move_upgrade_to_server_root" as const,
                serverId: sid,
              },
            },
          })),
        ],
      };
      log(state, `May move ${source.title} to another server root.`);
      return { ok: true };
    }
    case "move_upgrade_to_server_root": {
      const destId = action.serverId as import("../state/types.js").ServerId;
      const dest = state.servers[destId];
      if (!dest || source.type !== "upgrade") {
        log(state, `Move upgrade — invalid destination.`);
        return { ok: true };
      }
      const zone = source.zone ?? "";
      if (!zone.endsWith(":root")) {
        log(state, `Move upgrade — source not in root.`);
        return { ok: true };
      }
      const fromSid = zone
        .replace(/^server:/, "")
        .replace(/:root$/, "") as import("../state/types.js").ServerId;
      const from = state.servers[fromSid];
      if (from) {
        from.root = from.root.filter((id) => id !== sourceId);
      }
      dest.root.push(sourceId);
      source.zone = `server:${destId}:root`;
      log(
        state,
        `Move ${source.title} from ${fromSid} to ${destId} root.`,
      );
      if (source.onMovedToServerRoot) {
        return evalEffect(ctx, source.onMovedToServerRoot);
      }
      return { ok: true };
    }
    case "may_move_rezzed_upgrade_to_another_server_root": {
      const upgrades: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.root) {
          const c = state.cards[id];
          if (c?.type === "upgrade" && c.rezzed) upgrades.push(id);
        }
      }
      if (upgrades.length === 0) {
        log(state, `${source.title} — no rezzed upgrades to move.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: upgrades.map((id) => ({
          id: `pick-upgrade:${id}`,
          label: `Move ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "may_move_picked_rezzed_upgrade" as const,
              cardId: id,
            },
          },
        })),
      };
      log(state, `${source.title} — choose a rezzed upgrade to move.`);
      return { ok: true };
    }
    case "may_move_picked_rezzed_upgrade": {
      const card = state.cards[action.cardId];
      if (!card || card.type !== "upgrade" || !card.rezzed) {
        log(state, `Move upgrade — target unavailable.`);
        return { ok: true };
      }
      const zone = card.zone ?? "";
      if (!zone.startsWith("server:") || !zone.endsWith(":root")) {
        log(state, `Move upgrade — not in a server root.`);
        return { ok: true };
      }
      const currentSid = zone
        .replace(/^server:/, "")
        .replace(/:root$/, "") as import("../state/types.js").ServerId;
      const targets = (
        Object.keys(state.servers) as import("../state/types.js").ServerId[]
      ).filter((sid) => sid !== currentSid);
      if (targets.length === 0) {
        log(state, `Move upgrade — no other servers.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: targets.map((sid) => ({
          id: `move-rezzed:${action.cardId}:${sid}`,
          label: `Move ${card.title} to ${sid} root`,
          effect: {
            op: "do" as const,
            action: {
              kind: "move_rezzed_upgrade_to_server_root" as const,
              cardId: action.cardId,
              serverId: sid,
            },
          },
        })),
      };
      log(state, `Choose destination for ${card.title}.`);
      return { ok: true };
    }
    case "move_rezzed_upgrade_to_server_root": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      const zone = card.zone ?? "";
      if (!zone.startsWith("server:") || !zone.endsWith(":root")) {
        return { ok: true };
      }
      const fromSid = zone
        .replace(/^server:/, "")
        .replace(/:root$/, "") as import("../state/types.js").ServerId;
      const from = state.servers[fromSid];
      const to = state.servers[action.serverId as import("../state/types.js").ServerId];
      if (!from || !to) return { ok: true };
      from.root = from.root.filter((id) => id !== action.cardId);
      to.root.push(action.cardId);
      card.zone = `server:${action.serverId}:root`;
      log(state, `Moved ${card.title} to ${action.serverId} root.`);
      return { ok: true };
    }
    case "add_random_grip_to_stack_bottom": {
      const n = Math.max(0, action.count);
      const moved: string[] = [];
      for (let i = 0; i < n && state.runner.hand.length > 0; i++) {
        moved.push(state.runner.hand.shift()!);
      }
      for (const id of moved) {
        state.runner.deck.push(id);
        state.cards[id].zone = "runner:stack";
        state.cards[id].faceup = false;
      }
      log(
        state,
        `Move ${moved.length} card(s) from grip to bottom of stack (v0: first ${n} in hand order).`,
      );
      return { ok: true };
    }
    case "add_random_grip_to_stack_top": {
      const n = Math.max(0, action.count);
      const moved: string[] = [];
      for (let i = 0; i < n && state.runner.hand.length > 0; i++) {
        moved.push(state.runner.hand.shift()!);
      }
      for (let i = moved.length - 1; i >= 0; i--) {
        const id = moved[i]!;
        state.runner.deck.unshift(id);
        state.cards[id].zone = "runner:stack";
        state.cards[id].faceup = false;
      }
      log(
        state,
        `Move ${moved.length} card(s) from grip to top of stack (v0: first ${n} in hand order).`,
      );
      return { ok: true };
    }
    case "shuffle_random_grip_into_stack": {
      const n = Math.max(0, action.count);
      const moved: string[] = [];
      for (let i = 0; i < n && state.runner.hand.length > 0; i++) {
        moved.push(state.runner.hand.shift()!);
      }
      for (const id of moved) {
        state.runner.deck.push(id);
        state.cards[id].zone = "runner:stack";
        state.cards[id].faceup = false;
      }
      shuffleRunnerStack(state);
      log(
        state,
        `Shuffle ${moved.length} card(s) from grip into stack (v0: first ${n} in hand order).`,
      );
      return { ok: true };
    }
    case "shuffle_grip_and_heap_into_stack": {
      const fromGrip = [...state.runner.hand];
      const fromHeap = [...state.runner.discard];
      state.runner.hand = [];
      state.runner.discard = [];
      for (const id of [...fromGrip, ...fromHeap]) {
        state.runner.deck.push(id);
        state.cards[id].zone = "runner:stack";
        state.cards[id].faceup = false;
      }
      shuffleRunnerStack(state);
      log(
        state,
        `Shuffle grip (${fromGrip.length}) and heap (${fromHeap.length}) into stack.`,
      );
      return { ok: true };
    }
    case "rfg_top_of_stack": {
      const n = Math.max(0, action.amount);
      const removed: string[] = [];
      for (let i = 0; i < n && state.runner.deck.length > 0; i++) {
        const id = state.runner.deck.shift()!;
        removed.push(id);
        state.cards[id].zone = "removed-from-game";
        state.cards[id].faceup = true;
        if (!state.removedFromGame) state.removedFromGame = [];
        if (!state.removedFromGame.includes(id)) {
          state.removedFromGame.push(id);
        }
      }
      log(
        state,
        `Remove top ${removed.length} of stack from the game.`,
      );
      return { ok: true };
    }
    case "may_play_operation_from_hq": {
      const ops = state.corp.hand.filter(
        (id) => state.cards[id]?.type === "operation",
      );
      if (ops.length === 0) {
        log(state, `May play operation from HQ — none in HQ.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          ...ops.map((id) => {
            const c = state.cards[id]!;
            return {
              id: `play:${id}`,
              label: `Play ${c.title}`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "play_hq_operation_card" as const,
                  cardId: id,
                },
              },
            };
          }),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "corp" as const,
                amount: 0,
              },
            },
          },
        ],
      };
      log(state, `${source.title} — may play an operation from HQ.`);
      return { ok: true };
    }
    case "may_play_nonterminal_operation_from_hq": {
      const ops = state.corp.hand.filter((id) => {
        const c = state.cards[id];
        return (
          c?.type === "operation" &&
          !(c.subtypes ?? []).includes("terminal") &&
          !c.endsActionPhase
        );
      });
      if (ops.length === 0) {
        log(state, `May play non-terminal operation — none in HQ.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          ...ops.map((id) => {
            const c = state.cards[id]!;
            return {
              id: `play:${id}`,
              label: `Play ${c.title}`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "play_hq_operation_card" as const,
                  cardId: id,
                },
              },
            };
          }),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "corp" as const,
                amount: 0,
              },
            },
          },
        ],
      };
      log(state, `${source.title} — may play a non-terminal operation from HQ.`);
      return { ok: true };
    }
    case "play_hq_operation_card": {
      // Minimal play: pay playCost from Corp credits and eval onPlay (no click).
      const cardId = action.cardId;
      const card = state.cards[cardId];
      const idx = state.corp.hand.indexOf(cardId);
      if (!card || idx < 0 || card.type !== "operation") {
        log(state, `play_hq_operation_card — invalid target.`);
        return { ok: true };
      }
      const cost = card.playCost ?? 0;
      if (state.corp.credits < cost) {
        return {
          ok: false,
          error: "Insufficient credits to play operation.",
          cites: [CR.playOperation],
        };
      }
      state.corp.credits -= cost;
      state.corp.hand.splice(idx, 1);
      state.corp.discard.push(cardId);
      card.zone = "corp:archives";
      card.faceup = true;
      if ((card.subtypes ?? []).includes("mandate")) {
        state.turn.mandatesPlayedThisTurn =
          (state.turn.mandatesPlayedThisTurn ?? 0) + 1;
      }
      log(
        state,
        `Corp plays ${card.title} for ${cost}¢ (from ${source.title}).`,
      );
      if (card.onPlay) {
        const r = evalEffect({ state, sourceId: cardId }, card.onPlay);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "add_installed_resource_to_stack_top": {
      const resources = state.runner.rig.filter(
        (id) => state.cards[id]?.type === "resource",
      );
      if (resources.length === 0) {
        log(state, `Add installed resource to stack top — none installed.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: resources.map((id) => {
          const c = state.cards[id]!;
          return {
            id: `res:${id}`,
            label: `Add ${c.title} to stack top`,
            effect: {
              op: "do" as const,
              action: {
                kind: "move_runner_card_to_stack_top" as const,
                cardId: id,
              },
            },
          };
        }),
      };
      log(state, `${source.title} — choose an installed resource for stack top.`);
      return { ok: true };
    }
    case "add_installed_program_to_stack_top": {
      const programs = state.runner.rig.filter(
        (id) => state.cards[id]?.type === "program",
      );
      if (programs.length === 0) {
        log(state, `Add installed program to stack top — none installed.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: programs.map((id) => {
          const c = state.cards[id]!;
          return {
            id: `prog:${id}`,
            label: `Add ${c.title} to stack top`,
            effect: {
              op: "do" as const,
              action: {
                kind: "move_runner_card_to_stack_top" as const,
                cardId: id,
              },
            },
          };
        }),
      };
      log(state, `${source.title} — choose an installed program for stack top.`);
      return { ok: true };
    }
    case "move_runner_card_to_stack_top": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.runner.rig.includes(cardId)) {
        log(state, `move_runner_card_to_stack_top — not installed.`);
        return { ok: true };
      }
      state.runner.rig = state.runner.rig.filter((id) => id !== cardId);
      state.runner.deck.unshift(cardId);
      card.zone = "runner:stack";
      card.faceup = false;
      log(state, `Add ${card.title} to the top of the stack.`);
      return { ok: true };
    }
    case "host_installed_trojan_on_attacked_ice": {
      if (!state.run) {
        log(state, `host trojan — no active run.`);
        return { ok: true };
      }
      const sid = state.run.attackedServerId;
      const iceIds = state.servers[sid]?.ice ?? [];
      const trojans = state.runner.rig.filter(
        (id) => (state.cards[id]?.subtypes ?? []).includes("trojan"),
      );
      if (iceIds.length === 0 || trojans.length === 0) {
        log(state, `host trojan — no ice or no installed trojan.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (const tid of trojans) {
        for (const iid of iceIds) {
          options.push({
            id: `host:${tid}:${iid}`,
            label: `Host ${state.cards[tid]!.title} on ${state.cards[iid]!.title}`,
            effect: {
              op: "do",
              action: {
                kind: "host_program_on_ice",
                programId: tid,
                iceId: iid,
              },
            },
          });
        }
      }
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "runner", amount: 0 },
        },
      });
      state.pendingChoice = { sourceId, chooser: "runner", options };
      log(state, `${source.title} — host an installed trojan on attacked ice.`);
      return { ok: true };
    }
    case "host_program_on_ice": {
      const prog = state.cards[action.programId];
      const ice = state.cards[action.iceId];
      if (!prog || !ice || !state.runner.rig.includes(action.programId)) {
        log(state, `host_program_on_ice — invalid targets.`);
        return { ok: true };
      }
      prog.hostId = action.iceId;
      log(state, `Host ${prog.title} on ${ice.title}.`);
      return { ok: true };
    }
    case "play_psi_game": {
      const noop = {
        op: "do",
        action: { kind: "gain_credits", side: "corp", amount: 0 },
      } as Effect;
      const matchFx = action.ifBidsMatch ?? noop;
      const differFx = action.ifBidsDiffer ?? noop;
      startPsiGame(
        state,
        sourceId,
        action.maxBid,
        differFx,
        matchFx,
      );
      return { ok: true };
    }
    case "restrict_run_access": {
      if (!state.run) {
        log(state, `restrict_run_access — no active run.`);
        return { ok: true };
      }
      const ids = action.cardIdsFromSource
        ? [sourceId]
        : action.cardIds ?? [];
      if (action.mode === "only_source") {
        state.run.accessOnlyCardIds = [
          ...(state.run.accessOnlyCardIds ?? []),
          ...ids,
        ];
      } else {
        state.run.forbiddenAccessCardIds = [
          ...(state.run.forbiddenAccessCardIds ?? []),
          ...ids,
        ];
      }
      applyRunAccessRestrictions(state);
      log(
        state,
        `Run access restricted (${action.mode}) for ${ids.join(", ")}.`,
      );
      return { ok: true };
    }
    case "may_install_from_hq_on_other_remote_ignore_costs": {
      const trigger = state.turn.triggerRemoteInstallServerId;
      const remotes = Object.values(state.servers).filter(
        (s) => s.kind === "remote" && s.id !== trigger,
      );
      const hqCards = state.corp.hand.filter((id) => {
        const t = state.cards[id].type;
        return (
          t === "agenda" || t === "asset" || t === "ice" || t === "upgrade"
        );
      });
      if (remotes.length === 0 || hqCards.length === 0) {
        log(state, `HQ chain install — no other remote or no HQ cards.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const cardId of hqCards) {
        for (const remote of remotes) {
          options.push({
            id: `teia:${cardId}:${remote.id}`,
            label: `Install ${state.cards[cardId].title} on ${remote.id} (ignore costs)`,
            effect: {
              op: "do",
              action: {
                kind: "install_hq_on_remote_ignore_costs",
                cardId,
                serverId: remote.id,
                cannotScoreInstalledCardThisTurn:
                  action.cannotScoreInstalledCardThisTurn,
              },
            },
          });
        }
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options,
      };
      log(state, `May install from HQ on another remote ignoring costs.`);
      return { ok: true };
    }
    case "install_hq_on_remote_ignore_costs": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      const destId = action.serverId as import("../state/types.js").ServerId;
      const dest = state.servers[destId];
      if (!card || !dest || dest.kind !== "remote") {
        log(state, `HQ remote install — invalid target.`);
        return { ok: true };
      }
      if (!state.corp.hand.includes(cardId)) {
        log(state, `HQ remote install — card not in HQ.`);
        return { ok: true };
      }
      if (destId === state.turn.triggerRemoteInstallServerId) {
        log(state, `HQ remote install — must be another remote.`);
        return { ok: true };
      }
      state.corp.hand = state.corp.hand.filter((id) => id !== cardId);
      if (card.type === "ice") {
        dest.ice.unshift(cardId);
        card.zone = `server:${destId}:ice`;
      } else {
        dest.root.push(cardId);
        card.zone = `server:${destId}:root`;
      }
      card.rezzed = false;
      card.faceup = false;
      if (card.type === "agenda" || card.type === "asset") {
        card.advancementTokens = card.advancementTokens ?? 0;
      }
      noteInstalledThisTurn(state, cardId);
      if (action.cannotScoreInstalledCardThisTurn) {
        if (!state.turn.cannotScoreOrRezCardIds.includes(cardId)) {
          state.turn.cannotScoreOrRezCardIds.push(cardId);
        }
      }
      log(
        state,
        `Install ${card.title} on ${destId} from HQ ignoring all costs.`,
      );
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "install_from_archives": {
      const allowed = new Set(action.types);
      const installable = state.corp.discard.filter((id) =>
        allowed.has(
          state.cards[id]?.type as "agenda" | "asset" | "ice" | "upgrade",
        ),
      );
      if (installable.length === 0) {
        return {
          ok: false,
          error: "Must install from Archives — no eligible card.",
          cites: [CR.corpBasicInstall],
        };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (const cardId of installable) {
        const card = state.cards[cardId]!;
        const cost = card.installCost ?? 0;
        if (state.corp.credits < cost) continue;
        if (card.type === "ice") {
          for (const server of Object.values(state.servers)) {
            options.push({
              id: `arch-pay:${cardId}:${server.id}`,
              label: `Install ${card.title} protecting ${server.id} (${cost}¢)`,
              effect: {
                op: "do",
                action: {
                  kind: "install_archives_card_paying",
                  cardId,
                  serverId: server.id,
                },
              },
            });
          }
        } else {
          for (const server of Object.values(state.servers)) {
            if (server.kind !== "remote") continue;
            options.push({
              id: `arch-pay:${cardId}:${server.id}`,
              label: `Install ${card.title} on ${server.id} (${cost}¢)`,
              effect: {
                op: "do",
                action: {
                  kind: "install_archives_card_paying",
                  cardId,
                  serverId: server.id,
                },
              },
            });
          }
          options.push({
            id: `arch-pay:${cardId}:new`,
            label: `Install ${card.title} on new remote (${cost}¢)`,
            effect: {
              op: "do",
              action: {
                kind: "install_archives_card_paying",
                cardId,
                serverId: "__new_remote__",
              },
            },
          });
        }
      }
      if (options.length === 0) {
        return {
          ok: false,
          error: "Cannot afford to install any eligible Archives card.",
          cites: [CR.corpBasicInstall],
        };
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(state, `Install 1 agenda, asset, or ice from Archives (paying).`);
      return { ok: true };
    }
    case "install_archives_card_paying": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      const destId = resolveInstallServerId(state, action.serverId);
      const dest = destId ? state.servers[destId] : null;
      if (!card || !dest) {
        log(state, `Archives install paying — invalid card or server.`);
        return { ok: true };
      }
      if (!state.corp.discard.includes(cardId)) {
        log(state, `Archives install paying — card not in Archives.`);
        return { ok: true };
      }
      const cost = card.installCost ?? 0;
      if (state.corp.credits < cost) {
        return {
          ok: false,
          error: `Insufficient credits to install ${card.title} (${cost}¢).`,
          cites: [CR.corpBasicInstall],
        };
      }
      state.corp.credits -= cost;
      state.corp.discard = state.corp.discard.filter((id) => id !== cardId);
      if (card.type === "ice") {
        dest.ice.unshift(cardId);
        card.zone = `server:${destId}:ice`;
      } else {
        dest.root.push(cardId);
        card.zone = `server:${destId}:root`;
      }
      card.rezzed = false;
      card.faceup = false;
      if (card.type === "agenda" || card.type === "asset") {
        card.advancementTokens = card.advancementTokens ?? 0;
      }
      noteInstalledThisTurn(state, cardId);
      log(
        state,
        `Install ${card.title} from Archives on ${destId} for ${cost}¢ (unrezzed).`,
      );
      if (card.onInstallFromNonHq) {
        const r = evalEffect(
          { state, sourceId: cardId },
          card.onInstallFromNonHq,
        );
        if (!r.ok) return r;
      }
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "may_install_from_archives_ignore_costs": {
      const installable = state.corp.discard.filter((id) =>
        corpCardInstallable(state.cards[id]?.type ?? ""),
      );
      if (installable.length === 0) {
        log(state, `Install from Archives — no installable card.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-arch-install",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const cardId of installable) {
        const card = state.cards[cardId]!;
        if (card.type === "ice") {
          for (const server of Object.values(state.servers)) {
            options.push({
              id: `arch:${cardId}:${server.id}`,
              label: `Install ${card.title} protecting ${server.id}`,
              effect: {
                op: "do",
                action: {
                  kind: "install_archives_card_ignore_costs",
                  cardId,
                  serverId: server.id,
                },
              },
            });
          }
        } else {
          for (const server of Object.values(state.servers)) {
            if (server.kind !== "remote") continue;
            options.push({
              id: `arch:${cardId}:${server.id}`,
              label: `Install ${card.title} on ${server.id}`,
              effect: {
                op: "do",
                action: {
                  kind: "install_archives_card_ignore_costs",
                  cardId,
                  serverId: server.id,
                },
              },
            });
          }
          options.push({
            id: `arch:${cardId}:new`,
            label: `Install ${card.title} on new remote`,
            effect: {
              op: "do",
              action: {
                kind: "install_archives_card_ignore_costs",
                cardId,
                serverId: "__new_remote__",
              },
            },
          });
        }
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(state, `May install from Archives ignoring all costs.`);
      return { ok: true };
    }
    case "may_install_from_hq_ignore_costs": {
      const installable = state.corp.hand.filter((id) =>
        corpCardInstallable(state.cards[id]?.type ?? ""),
      );
      if (installable.length === 0) {
        log(state, `Install from HQ — no installable card.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-hq-install",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const cardId of installable) {
        const card = state.cards[cardId]!;
        if (card.type === "ice") {
          for (const server of Object.values(state.servers)) {
            options.push({
              id: `hq-install:${cardId}:${server.id}`,
              label: `Install ${card.title} protecting ${server.id}`,
              effect: {
                op: "do",
                action: {
                  kind: "install_hq_card_ignore_costs",
                  cardId,
                  serverId: server.id,
                },
              },
            });
          }
        } else {
          for (const server of Object.values(state.servers)) {
            if (server.kind !== "remote") continue;
            options.push({
              id: `hq-install:${cardId}:${server.id}`,
              label: `Install ${card.title} on ${server.id}`,
              effect: {
                op: "do",
                action: {
                  kind: "install_hq_card_ignore_costs",
                  cardId,
                  serverId: server.id,
                },
              },
            });
          }
          options.push({
            id: `hq-install:${cardId}:new`,
            label: `Install ${card.title} on new remote`,
            effect: {
              op: "do",
              action: {
                kind: "install_hq_card_ignore_costs",
                cardId,
                serverId: "__new_remote__",
              },
            },
          });
        }
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(state, `May install from HQ ignoring all costs.`);
      return { ok: true };
    }
    case "may_install_from_hq_ignore_costs_exclude_source_server": {
      const excludeServerId = state.turn.onTrashSourceServerId;
      const installable = state.corp.hand.filter((id) =>
        corpCardInstallable(state.cards[id]?.type ?? ""),
      );
      if (installable.length === 0) {
        log(
          state,
          `Install from HQ (exclude source server root) — no installable card.`,
        );
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-hq-install",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const cardId of installable) {
        const card = state.cards[cardId]!;
        if (card.type === "ice") {
          for (const server of Object.values(state.servers)) {
            options.push({
              id: `hq-install:${cardId}:${server.id}`,
              label: `Install ${card.title} protecting ${server.id}`,
              effect: {
                op: "do",
                action: {
                  kind: "install_hq_card_ignore_costs",
                  cardId,
                  serverId: server.id,
                },
              },
            });
          }
        } else {
          for (const server of Object.values(state.servers)) {
            if (server.kind !== "remote") continue;
            if (excludeServerId && server.id === excludeServerId) continue;
            options.push({
              id: `hq-install:${cardId}:${server.id}`,
              label: `Install ${card.title} on ${server.id}`,
              effect: {
                op: "do",
                action: {
                  kind: "install_hq_card_ignore_costs",
                  cardId,
                  serverId: server.id,
                },
              },
            });
          }
          options.push({
            id: `hq-install:${cardId}:new`,
            label: `Install ${card.title} on new remote`,
            effect: {
              op: "do",
              action: {
                kind: "install_hq_card_ignore_costs",
                cardId,
                serverId: "__new_remote__",
              },
            },
          });
        }
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(
        state,
        `May install from HQ ignoring all costs (cannot install in root of ${excludeServerId ?? "source server"}).`,
      );
      return { ok: true };
    }
    case "wall_to_wall_turn_begin": {
      let otherRezzedAsset = false;
      for (const server of Object.values(state.servers)) {
        for (const id of server.root) {
          if (id === sourceId) continue;
          const c = state.cards[id];
          if (c?.type === "asset" && c.rezzed) {
            otherRezzedAsset = true;
            break;
          }
        }
        if (otherRezzedAsset) break;
      }
      return applyPrimitive(ctx, {
        kind: "wall_to_wall_turn_begin_continue",
        remaining: otherRezzedAsset ? 1 : 3,
        used: [],
        mustPick: otherRezzedAsset,
      });
    }
    case "wall_to_wall_turn_begin_continue": {
      if (action.remaining <= 0) return { ok: true };
      const used = new Set(action.used);
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      const afterPick = (optId: string, effect: Effect): Effect => ({
        op: "seq",
        effects: [
          effect,
          {
            op: "do",
            action: {
              kind: "wall_to_wall_turn_begin_continue",
              remaining: action.remaining - 1,
              used: [...action.used, optId],
              mustPick: false,
            },
          },
        ],
      });
      if (!used.has("draw")) {
        options.push({
          id: "w2w-draw",
          label: "Draw 1 card",
          effect: afterPick("draw", {
            op: "do",
            action: { kind: "draw", side: "corp", amount: 1 },
          }),
        });
      }
      if (!used.has("credits")) {
        options.push({
          id: "w2w-credits",
          label: "Gain 1¢",
          effect: afterPick("credits", {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 1 },
          }),
        });
      }
      if (!used.has("adv")) {
        const iceIds: string[] = [];
        for (const server of Object.values(state.servers)) {
          for (const id of server.ice) {
            if (state.cards[id]?.type === "ice") iceIds.push(id);
          }
        }
        for (const iceId of iceIds) {
          options.push({
            id: `w2w-adv:${iceId}`,
            label: `Place 1 advancement on ${state.cards[iceId]!.title}`,
            effect: {
              op: "do",
              action: {
                kind: "wall_to_wall_place_adv_on_ice",
                cardId: iceId,
                remaining: action.remaining - 1,
                used: [...action.used, "adv"],
                mustPick: false,
              },
            },
          });
        }
      }
      if (!used.has("hq")) {
        options.push({
          id: "w2w-hq",
          label: `Add ${source.title} to HQ`,
          effect: {
            op: "do",
            action: { kind: "return_source_to_hq" },
          },
        });
      }
      if (!action.mustPick) {
        options.push({
          id: "w2w-done",
          label: "Done",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        });
      }
      if (options.length === 0) return { ok: true };
      // Exactly-1 mandatory with only one live option: auto-resolve if single
      // non-ice choice; ice still needs a pick among ice ids.
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(
        state,
        `${source.title} — resolve ${action.mustPick ? "1" : `up to ${action.remaining}`} option(s).`,
      );
      return { ok: true };
    }
    case "wall_to_wall_place_adv_on_ice": {
      const target = state.cards[action.cardId];
      if (target?.type === "ice") {
        target.advancementTokens = (target.advancementTokens ?? 0) + 1;
        state.turn.lastAdvancementTargetId = action.cardId;
        log(
          state,
          `Place 1 advancement on ${target.title} → ${target.advancementTokens}.`,
        );
      }
      if (action.remaining <= 0) return { ok: true };
      return applyPrimitive(ctx, {
        kind: "wall_to_wall_turn_begin_continue",
        remaining: action.remaining,
        used: action.used,
        mustPick: action.mustPick,
      });
    }
    case "choose_card_type_for_encounter": {
      if (!state.run?.encounter) {
        log(state, `Choose card type — no encounter.`);
        return { ok: true };
      }
      const types: Array<import("../state/types.js").CardType> = [
        "event",
        "hardware",
        "program",
        "resource",
      ];
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: types.map((t) => ({
          id: `enc-type:${t}`,
          label: `Choose ${t}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "set_encounter_chosen_card_type" as const,
              cardType: t,
            },
          },
        })),
      };
      log(state, `${source.title} — choose a card type for this encounter.`);
      return { ok: true };
    }
    case "set_encounter_chosen_card_type": {
      if (!state.run?.encounter) {
        log(state, `Set encounter card type — no encounter.`);
        return { ok: true };
      }
      state.run.encounter.chosenCardType = action.cardType;
      log(
        state,
        `${source.title} — encounter card type set to ${action.cardType}.`,
      );
      return { ok: true };
    }
    case "reveal_grip_may_trash_chosen_encounter_type": {
      const grip = [...state.runner.hand];
      const titles = grip.map((id) => state.cards[id]?.title ?? id);
      log(
        state,
        `${source.title} — reveal grip (${titles.length}): ${titles.join(", ") || "empty"}.`,
      );
      const chosen = state.run?.encounter?.chosenCardType;
      if (!chosen) {
        log(state, `Reveal grip — no encounter card type chosen.`);
        return { ok: true };
      }
      const matches = grip.filter(
        (id) => state.cards[id]?.type === chosen,
      );
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-trash",
          label: "Decline to trash",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const id of matches) {
        options.push({
          id: `trash-grip:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "do",
            action: { kind: "trash_grip_card", cardId: id },
          },
        });
      }
      if (matches.length === 0) {
        log(
          state,
          `${source.title} — no revealed ${chosen} cards to trash.`,
        );
        return { ok: true };
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(
        state,
        `${source.title} — may trash 1 revealed ${chosen}.`,
      );
      return { ok: true };
    }
    case "focus_group_reveal_may_advance": {
      const types: Array<import("../state/types.js").CardType> = [
        "event",
        "hardware",
        "program",
        "resource",
      ];
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: types.map((t) => ({
          id: `fg-type:${t}`,
          label: `Choose ${t}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "focus_group_after_type" as const,
              cardType: t,
            },
          },
        })),
      };
      log(state, `${source.title} — choose a card type.`);
      return { ok: true };
    }
    case "focus_group_after_type": {
      const grip = [...state.runner.hand];
      const titles = grip.map((id) => state.cards[id]?.title ?? id);
      log(
        state,
        `${source.title} — reveal grip (${titles.length}): ${titles.join(", ") || "empty"}.`,
      );
      const count = grip.filter(
        (id) => state.cards[id]?.type === action.cardType,
      ).length;
      if (count <= 0) {
        log(
          state,
          `${source.title} — 0 revealed ${action.cardType} cards; X=0.`,
        );
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (let x = 0; x <= count; x++) {
        options.push({
          id: `fg-x:${x}`,
          label: `X=${x}`,
          effect: {
            op: "do",
            action: { kind: "focus_group_may_pay_place", amount: x },
          },
        });
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(
        state,
        `${source.title} — choose X ≤ ${count} revealed ${action.cardType}.`,
      );
      return { ok: true };
    }
    case "focus_group_may_pay_place": {
      const x = action.amount;
      if (x <= 0) {
        log(state, `${source.title} — X=0; decline place advancements.`);
        return { ok: true };
      }
      const canPay = state.corp.credits >= x;
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          ...(canPay
            ? [
                {
                  id: "pay-place",
                  label: `Pay ${x}¢ to place ${x} advancement(s)`,
                  effect: {
                    op: "seq" as const,
                    effects: [
                      {
                        op: "do" as const,
                        action: {
                          kind: "lose_credits" as const,
                          side: "corp" as const,
                          amount: x,
                        },
                      },
                      {
                        op: "do" as const,
                        action: {
                          kind: "place_advancements" as const,
                          amount: x,
                          pick: "choose" as const,
                        },
                      },
                    ],
                  },
                },
              ]
            : []),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
        ],
      };
      log(
        state,
        canPay
          ? `${source.title} — may pay ${x}¢ to place ${x} advancement(s).`
          : `${source.title} — cannot afford ${x}¢; only decline.`,
      );
      return { ok: true };
    }
    case "divested_trust_may_forfeit_return_stolen": {
      const stolenId = state.turn.lastStolenAgendaId;
      if (!stolenId || !state.runner.score.includes(stolenId)) {
        log(state, `${source.title} — no stolen agenda to return.`);
        return { ok: true };
      }
      if (!state.corp.score.includes(sourceId)) {
        log(state, `${source.title} — not in Corp score area.`);
        return { ok: true };
      }
      if (source.cannotForfeit) {
        log(state, `${source.title} — cannot be forfeited.`);
        return { ok: true };
      }
      const stolen = state.cards[stolenId]!;
      const gain = action.gainCredits;
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "forfeit-return",
            label: `Forfeit ${source.title}: gain ${gain}¢ and return ${stolen.title} to HQ`,
            effect: {
              op: "seq",
              effects: [
                {
                  op: "do",
                  action: {
                    kind: "forfeit_scored_agenda",
                    cardId: sourceId,
                  },
                },
                {
                  op: "do",
                  action: {
                    kind: "gain_credits",
                    side: "corp",
                    amount: gain,
                  },
                },
                {
                  op: "do",
                  action: {
                    kind: "return_stolen_agenda_to_hq",
                    cardId: stolenId,
                  },
                },
              ],
            },
          },
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
        ],
      };
      log(
        state,
        `${source.title} — may forfeit to gain ${gain}¢ and return ${stolen.title} to HQ.`,
      );
      return { ok: true };
    }
    case "return_stolen_agenda_to_hq": {
      const cardId = action.cardId;
      if (!state.runner.score.includes(cardId)) {
        log(state, `Return stolen agenda — not in Runner score.`);
        return { ok: true };
      }
      const card = state.cards[cardId]!;
      const pts =
        card.worthZeroAgendaPointsWhileHasAgendaCounters &&
        (card.agendaCounters ?? 0) >= 1
          ? 0
          : (card.agendaPoints ?? 0) +
            (card.agendaPointsPerAgendaCounter ?? 0) *
              (card.agendaCounters ?? 0);
      state.runner.score = state.runner.score.filter((id) => id !== cardId);
      state.turn.agendaPointsStolenThisTurn = Math.max(
        0,
        state.turn.agendaPointsStolenThisTurn - pts,
      );
      card.zone = "corp:hq";
      card.faceup = false;
      card.rezzed = false;
      card.advancementTokens = 0;
      state.corp.hand.push(cardId);
      log(
        state,
        `${card.title} returned to HQ from Runner score (${source.title}).`,
      );
      if (
        state.winner === "runner" &&
        state.winReason === "runner_agenda"
      ) {
        state.winner = null;
        state.winReason = null;
        state.done = false;
      }
      checkWinConditions(state);
      return { ok: true };
    }
    case "nihilist_may_remove_2_virus_draw_unless_corp_trash_top_rd": {
      const withVirus = state.runner.rig.filter(
        (id) => (state.cards[id]?.virusCounters ?? 0) > 0,
      );
      const total = withVirus.reduce(
        (sum, id) => sum + (state.cards[id]?.virusCounters ?? 0),
        0,
      );
      if (total < 2) {
        log(
          state,
          `${source.title} — fewer than 2 virus counters on installed cards; decline.`,
        );
        return { ok: true };
      }
      const removeOptions: Array<{
        id: string;
        label: string;
        effect: Effect;
      }> = [];
      for (const id of withVirus) {
        const card = state.cards[id]!;
        const have = card.virusCounters ?? 0;
        const maxTake = Math.min(2, have);
        for (let take = 1; take <= maxTake; take++) {
          removeOptions.push({
            id: `nihilist-rm:${id}:${take}`,
            label: `Remove ${take} virus from ${card.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "nihilist_remove_virus_from" as const,
                cardId: id,
                amount: take,
                remaining: 2 - take,
              },
            },
          });
        }
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
          ...removeOptions,
        ],
      };
      log(
        state,
        `${source.title} — may remove any 2 virus counters from installed cards.`,
      );
      return { ok: true };
    }
    case "nihilist_remove_virus_from": {
      const card = state.cards[action.cardId];
      if (!card) {
        log(state, `Nihilist remove virus — unknown card.`);
        return { ok: true };
      }
      const have = card.virusCounters ?? 0;
      const removed = Math.min(action.amount, have);
      card.virusCounters = have - removed;
      log(
        state,
        `${source.title} — remove ${removed} virus from ${card.title} → ${card.virusCounters}.`,
      );
      if (action.remaining <= 0) {
        return applyPrimitive(ctx, {
          kind: "nihilist_corp_trash_top_rd_or_runner_draws_2",
        });
      }
      const withVirus = state.runner.rig.filter(
        (id) => (state.cards[id]?.virusCounters ?? 0) > 0,
      );
      if (withVirus.length === 0) {
        log(state, `${source.title} — no more virus to remove.`);
        return { ok: true };
      }
      const contOptions: Array<{
        id: string;
        label: string;
        effect: Effect;
      }> = [];
      for (const id of withVirus) {
        const c = state.cards[id]!;
        const have = c.virusCounters ?? 0;
        const maxTake = Math.min(action.remaining, have);
        for (let take = 1; take <= maxTake; take++) {
          contOptions.push({
            id: `nihilist-rm:${id}:${take}`,
            label: `Remove ${take} virus from ${c.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "nihilist_remove_virus_from" as const,
                cardId: id,
                amount: take,
                remaining: action.remaining - take,
              },
            },
          });
        }
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: contOptions,
      };
      log(
        state,
        `${source.title} — remove ${action.remaining} more virus counter(s).`,
      );
      return { ok: true };
    }
    case "nihilist_corp_trash_top_rd_or_runner_draws_2": {
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "trash-top-rd",
            label: "Trash the top card of R&D",
            effect: {
              op: "do" as const,
              action: { kind: "trash_top_of_rd" as const },
            },
          },
          {
            id: "allow-draw",
            label: "Allow Runner to draw 2",
            effect: {
              op: "do" as const,
              action: {
                kind: "draw" as const,
                side: "runner" as const,
                amount: 2,
              },
            },
          },
        ],
      };
      log(
        state,
        `${source.title} — Corp may trash top of R&D or Runner draws 2.`,
      );
      return { ok: true };
    }
    case "game_over_trash_type_may_pay_3_prevent": {
      const types: Array<import("../state/types.js").CardType> = [
        "event",
        "hardware",
        "program",
        "resource",
      ];
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: types.map((t) => ({
          id: `go-type:${t}`,
          label: `Choose ${t}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "game_over_after_type" as const,
              cardType: t,
            },
          },
        })),
      };
      log(state, `${source.title} — choose a Runner card type.`);
      return { ok: true };
    }
    case "game_over_after_type": {
      const targets = state.runner.rig.filter((id) => {
        const c = state.cards[id];
        if (!c || c.type !== action.cardType) return false;
        if (c.breaker) return false;
        if ((c.subtypes ?? []).includes("icebreaker")) return false;
        return true;
      });
      if (targets.length === 0) {
        log(
          state,
          `${source.title} — no installed non-icebreaker ${action.cardType} cards.`,
        );
        return { ok: true };
      }
      return applyPrimitive(ctx, {
        kind: "game_over_continue",
        remaining: targets,
      });
    }
    case "game_over_continue": {
      const remaining = [...action.remaining];
      const next = remaining.shift();
      if (!next) {
        log(state, `${source.title} — Game Over trash queue complete.`);
        return { ok: true };
      }
      return applyPrimitive(ctx, {
        kind: "game_over_process_card",
        cardId: next,
        remaining,
      });
    }
    case "game_over_process_card": {
      const card = state.cards[action.cardId];
      if (!card || !state.runner.rig.includes(action.cardId)) {
        return applyPrimitive(ctx, {
          kind: "game_over_continue",
          remaining: action.remaining,
        });
      }
      const canPay = state.runner.credits >= 3;
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          ...(canPay
            ? [
                {
                  id: `go-prevent:${action.cardId}`,
                  label: `Pay 3¢ to prevent trashing ${card.title}`,
                  effect: {
                    op: "seq" as const,
                    effects: [
                      {
                        op: "do" as const,
                        action: {
                          kind: "lose_credits" as const,
                          side: "runner" as const,
                          amount: 3,
                        },
                      },
                      {
                        op: "do" as const,
                        action: {
                          kind: "game_over_continue" as const,
                          remaining: action.remaining,
                        },
                      },
                    ],
                  },
                },
              ]
            : []),
          {
            id: `go-trash:${action.cardId}`,
            label: `Trash ${card.title}`,
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: {
                    kind: "trash_runner_rig_card" as const,
                    cardId: action.cardId,
                  },
                },
                {
                  op: "do" as const,
                  action: {
                    kind: "game_over_continue" as const,
                    remaining: action.remaining,
                  },
                },
              ],
            },
          },
        ],
      };
      log(
        state,
        `${source.title} — Runner may pay 3¢ to prevent trashing ${card.title}.`,
      );
      return { ok: true };
    }
    case "install_archives_card_ignore_costs": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      const destId = resolveInstallServerId(state, action.serverId);
      const dest = destId ? state.servers[destId] : null;
      if (!card || !dest) {
        log(state, `Archives install — invalid card or server.`);
        return { ok: true };
      }
      if (!state.corp.discard.includes(cardId)) {
        log(state, `Archives install — card not in Archives.`);
        return { ok: true };
      }
      state.corp.discard = state.corp.discard.filter((id) => id !== cardId);
      if (card.type === "ice") {
        dest.ice.unshift(cardId);
        card.zone = `server:${destId}:ice`;
      } else {
        dest.root.push(cardId);
        card.zone = `server:${destId}:root`;
      }
      card.rezzed = false;
      card.faceup = false;
      if (card.type === "agenda" || card.type === "asset") {
        card.advancementTokens = card.advancementTokens ?? 0;
      }
      noteInstalledThisTurn(state, cardId);
      log(
        state,
        `Install ${card.title} from Archives on ${destId} ignoring costs (unrezzed).`,
      );
      if (card.onInstallFromNonHq) {
        const r = evalEffect(
          { state, sourceId: cardId },
          card.onInstallFromNonHq,
        );
        if (!r.ok) return r;
      }
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "install_hq_card_ignore_costs": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      const destId = resolveInstallServerId(state, action.serverId);
      const dest = destId ? state.servers[destId] : null;
      if (!card || !dest) {
        log(state, `HQ install — invalid card or server.`);
        return { ok: true };
      }
      if (!state.corp.hand.includes(cardId)) {
        log(state, `HQ install — card not in HQ.`);
        return { ok: true };
      }
      if (card.type !== "ice" && dest.kind !== "remote") {
        log(state, `HQ install — non-ice must target a remote server.`);
        return { ok: true };
      }
      state.corp.hand = state.corp.hand.filter((id) => id !== cardId);
      if (card.type === "ice") {
        dest.ice.unshift(cardId);
        card.zone = `server:${destId}:ice`;
      } else {
        dest.root.push(cardId);
        card.zone = `server:${destId}:root`;
      }
      card.rezzed = false;
      card.faceup = true;
      if (card.type === "agenda" || card.type === "asset") {
        card.advancementTokens = card.advancementTokens ?? 0;
      }
      noteInstalledThisTurn(state, cardId);
      log(
        state,
        `Install ${card.title} from HQ on ${destId} ignoring costs (unrezzed).`,
      );
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "install_program_from_grip_paying_cost": {
      const programs = state.runner.hand.filter((id) => {
        const c = state.cards[id];
        if (c.type !== "program") return false;
        if (c.installOnIce || (c.subtypes ?? []).includes("trojan")) {
          return false;
        }
        const need = effectiveMemoryCost(state, id);
        if (usedMemory(state) + need > memoryLimit(state)) return false;
        const cost = gripInstallCostAfterDiscount(state, c, 0);
        return creditsAvailableForInstall(state, "runner") >= cost;
      });
      if (programs.length === 0) {
        log(state, `Install program from grip — no affordable program.`);
        return { ok: true };
      }
      const trackSubtype = action.trackOnRunEndTrashUnlessSubtype;
      const finish = (pick: string): EvalResult => {
        const r = installGripCardDiscounted(state, pick, 0, sourceId);
        if (!r.ok) return r;
        if (state.run && trackSubtype !== undefined) {
          state.run.identityInstalledProgramId = pick;
          state.run.identityInstalledProgramTrashUnlessSubtype = trackSubtype;
        }
        return { ok: true };
      };
      if (action.cardId && programs.includes(action.cardId)) {
        return finish(action.cardId);
      }
      if (programs.length === 1) {
        return finish(programs[0]!);
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: programs.map((id) => ({
          id: `arissana-install:${id}`,
          label: `Install ${state.cards[id].title}`,
          effect: {
            op: "do",
            action: {
              kind: "install_program_from_grip_paying_cost",
              cardId: id,
              trackOnRunEndTrashUnlessSubtype: trackSubtype,
            },
          },
        })),
      };
      log(state, `Choose program from grip to install.`);
      return { ok: true };
    }
    case "prevent_pending_damage": {
      preventPendingDamage(state, action.amount);
      return { ok: true };
    }
    case "prevent_pending_tags": {
      const before = state.pendingTags?.remaining ?? 0;
      preventPendingTags(state, action.amount);
      const after = state.pendingTags?.remaining ?? 0;
      if (before > after) {
        const r = fireOnFirstAvoidOrRemoveTagThisTurn(state);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "prevent_current_ice_on_encounter": {
      const enc = state.run?.encounter;
      if (!enc) {
        log(state, `prevent_current_ice_on_encounter — no encounter.`);
        return { ok: true };
      }
      enc.onEncounterPrevented = true;
      enc.onEncounterPending = false;
      log(state, `Prevent when encountered ability on current ice.`);
      return { ok: true };
    }
    case "place_advancements_on_up_to": {
      const amountEach = Math.max(0, action.amountEach);
      const maxCards = Math.max(0, action.maxCards);
      if (amountEach <= 0 || maxCards <= 0) {
        log(state, `Place advancements on up to — nothing to place.`);
        return { ok: true };
      }
      const candidates: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (c && (c.type === "agenda" || c.canAdvance)) {
            candidates.push(id);
          }
        }
      }
      if (candidates.length === 0) {
        log(state, `Place advancements on up to ${maxCards} — no eligible cards.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "adv-up-to-done",
            label: "Done placing advancements",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...candidates.map((id) => ({
            id: `adv-up-to:${id}`,
            label: `Place ${amountEach} advancement(s) on ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "place_advancements_on_up_to_continue" as const,
                cardId: id,
                amountEach,
                remainingAfter: maxCards - 1,
                exclude: [id],
              },
            },
          })),
        ],
      };
      log(
        state,
        `Place ${amountEach} advancement(s) on each of up to ${maxCards} card(s).`,
      );
      return { ok: true };
    }
    case "place_advancements_on_up_to_continue": {
      // Internal follow-up for place_advancements_on_up_to (not in card IR).
      const target = state.cards[action.cardId];
      if (target) {
        target.advancementTokens =
          (target.advancementTokens ?? 0) + action.amountEach;
        state.turn.lastAdvancementTargetId = action.cardId;
        log(
          state,
          `Place ${action.amountEach} advancement(s) on ${target.title} → ${target.advancementTokens}.`,
        );
      }
      if (action.remainingAfter <= 0) return { ok: true };
      const candidates: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          if (action.exclude.includes(id)) continue;
          const c = state.cards[id];
          if (c && (c.type === "agenda" || c.canAdvance)) candidates.push(id);
        }
      }
      if (candidates.length === 0) return { ok: true };
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "adv-up-to-done",
            label: "Done placing advancements",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...candidates.map((id) => ({
            id: `adv-up-to:${id}`,
            label: `Place ${action.amountEach} advancement(s) on ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "place_advancements_on_up_to_continue" as const,
                cardId: id,
                amountEach: action.amountEach,
                remainingAfter: action.remainingAfter - 1,
                exclude: [...action.exclude, id],
              },
            },
          })),
        ],
      };
      return { ok: true };
    }
    case "remove_all_virus_from_one_installed": {
      const withVirus: string[] = [];
      for (const id of state.runner.rig) {
        if ((state.cards[id]?.virusCounters ?? 0) > 0) withVirus.push(id);
      }
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          if ((state.cards[id]?.virusCounters ?? 0) > 0) withVirus.push(id);
        }
      }
      if (withVirus.length === 0) {
        log(state, `Remove all virus — no installed card with virus counters.`);
        return { ok: true };
      }
      if (withVirus.length === 1) {
        return applyPrimitive(ctx, {
          kind: "remove_all_virus_from",
          cardId: withVirus[0]!,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: withVirus.map((id) => ({
          id: `rm-virus:${id}`,
          label: `Remove all virus from ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: { kind: "remove_all_virus_from" as const, cardId: id },
          },
        })),
      };
      log(state, `Remove all virus counters from 1 installed card.`);
      return { ok: true };
    }
    case "remove_all_virus_from": {
      const card = state.cards[action.cardId];
      if (!card) {
        log(state, `Remove all virus — unknown card.`);
        return { ok: true };
      }
      const had = card.virusCounters ?? 0;
      card.virusCounters = 0;
      log(
        state,
        `Remove all virus counters from ${card.title} (had ${had}).`,
      );
      return { ok: true };
    }
    case "move_source_ice_to_outermost_attacked": {
      if (!state.run || source.type !== "ice") {
        log(state, `Move ice outermost — no run or source is not ice.`);
        return { ok: true };
      }
      const attacked = state.run.attackedServerId;
      let fromServer: import("../state/types.js").Server | null = null;
      for (const server of Object.values(state.servers)) {
        if (server.ice.includes(sourceId)) {
          fromServer = server;
          break;
        }
      }
      if (!fromServer) {
        log(state, `Move ice outermost — source not installed as ice.`);
        return { ok: true };
      }
      const toServer = state.servers[attacked];
      if (!toServer) return { ok: true };
      fromServer.ice = fromServer.ice.filter((id) => id !== sourceId);
      toServer.ice.unshift(sourceId);
      source.zone = `server:${attacked}:ice`;
      state.run.position = 0;
      log(
        state,
        `Move ${source.title} to outermost protecting ${attacked}.`,
      );
      return { ok: true };
    }
    case "move_source_ice_to_outermost_another_server_continue_run": {
      if (!state.run || source.type !== "ice") {
        log(state, `Bullfrog move — no run or source is not ice.`);
        return { ok: true };
      }
      let fromSid: string | null = null;
      for (const [sid, server] of Object.entries(state.servers)) {
        if (server.ice.includes(sourceId)) {
          fromSid = sid;
          break;
        }
      }
      if (!fromSid) {
        log(state, `Bullfrog move — source not installed as ice.`);
        return { ok: true };
      }
      const targets = Object.keys(state.servers).filter((sid) => sid !== fromSid);
      if (targets.length === 0) {
        log(state, `Bullfrog move — no other servers.`);
        return { ok: true };
      }
      if (targets.length === 1) {
        return applyPrimitive(ctx, {
          kind: "move_source_ice_to_outermost_server_continue_run",
          serverId: targets[0]! as import("../state/types.js").ServerId,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: targets.map((sid) => ({
          id: `bullfrog:${sid}`,
          label: `Move to outermost protecting ${sid}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "move_source_ice_to_outermost_server_continue_run" as const,
              serverId: sid as import("../state/types.js").ServerId,
            },
          },
        })),
      };
      log(state, `${source.title} — choose another server to move to.`);
      return { ok: true };
    }
    case "move_source_ice_to_outermost_server_continue_run": {
      if (!state.run || source.type !== "ice") {
        log(state, `Bullfrog move leaf — no run or source is not ice.`);
        return { ok: true };
      }
      let fromServer: import("../state/types.js").Server | null = null;
      for (const server of Object.values(state.servers)) {
        if (server.ice.includes(sourceId)) {
          fromServer = server;
          break;
        }
      }
      if (!fromServer) {
        log(state, `Bullfrog move leaf — source not installed.`);
        return { ok: true };
      }
      const toSid = action.serverId as import("../state/types.js").ServerId;
      const toServer = state.servers[toSid];
      if (!toServer) {
        log(state, `Bullfrog move leaf — unknown server ${toSid}.`);
        return { ok: true };
      }
      fromServer.ice = fromServer.ice.filter((id) => id !== sourceId);
      toServer.ice.unshift(sourceId);
      source.zone = `server:${toSid}:ice`;
      state.run.attackedServerId =
        toSid as import("../state/types.js").ServerId;
      state.run.position = 0;
      log(
        state,
        `Move ${source.title} to outermost protecting ${toSid}; run continues.`,
      );
      return { ok: true };
    }
    case "formicary_rez_move_innermost": {
      // Formicary-class (CR 6.8.2c.ex1): rez (discount), move innermost;
      // encounter only when new timing structures are still allowed.
      if (!state.run || source.type !== "ice") {
        log(state, `Formicary response — no run or source is not ice.`);
        return { ok: true };
      }
      const discount = action.rezDiscount ?? 2;
      if (!source.rezzed) {
        const pay = Math.max(0, (source.rezCost ?? 0) - discount);
        if (state.corp.credits < pay) {
          log(
            state,
            `Formicary response — insufficient credits to rez ${source.title} (${pay}¢).`,
          );
          return { ok: true };
        }
        state.corp.credits -= pay;
        source.rezzed = true;
        source.faceup = true;
        state.turn.iceRezzedThisTurn += 1;
        if (!state.turn.rezzedThisTurnIds) state.turn.rezzedThisTurnIds = [];
        if (!state.turn.rezzedThisTurnIds.includes(sourceId)) {
          state.turn.rezzedThisTurnIds.push(sourceId);
        }
        log(
          state,
          `Rez ${source.title} for ${pay}¢ (−${discount}¢ Formicary discount).`,
        );
        if (source.onRez) {
          const r = evalEffect({ state, sourceId }, source.onRez);
          if (!r.ok) return r;
        }
      }
      const attacked = state.run.attackedServerId;
      let fromServer: import("../state/types.js").Server | null = null;
      for (const server of Object.values(state.servers)) {
        if (server.ice.includes(sourceId)) {
          fromServer = server;
          break;
        }
      }
      if (!fromServer) {
        log(state, `Formicary response — source not installed as ice.`);
        return { ok: true };
      }
      const toServer = state.servers[attacked];
      if (!toServer) return { ok: true };
      fromServer.ice = fromServer.ice.filter((id) => id !== sourceId);
      toServer.ice.push(sourceId);
      source.zone = `server:${attacked}:ice`;
      const innermostIdx = toServer.ice.length - 1;
      log(
        state,
        `Move ${source.title} to innermost protecting ${attacked}.`,
      );
      if (state.run.forbidNewTimingStructures || state.run.endedTheRun) {
        log(
          state,
          `Cannot move Runner position or initiate encounter after end the run (CR ${CR.runEndsOtherPriorityWindows.number}).`,
        );
        return { ok: true };
      }
      state.run.position = innermostIdx;
      state.run.reencounterIceId = sourceId;
      log(
        state,
        `Runner will encounter ${source.title} after Formicary response.`,
      );
      return { ok: true };
    }
    case "may_install_ice_from_hq_protecting_this_server_ignore_costs": {
      const serverId =
        serverIdForIce(state, sourceId) ??
        (() => {
          const m = /^server:([^:]+):ice$/.exec(source.zone);
          return m ? (m[1] as import("../state/types.js").ServerId) : null;
        })();
      if (!serverId) {
        log(
          state,
          `Install ice from HQ on this server — source not on server ice.`,
        );
        return { ok: true };
      }
      const iceInHq = state.corp.hand.filter(
        (id) => state.cards[id]?.type === "ice",
      );
      if (iceInHq.length === 0) {
        log(state, `Install ice from HQ on ${serverId} — no ice in HQ.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-hq-ice-this-server",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const iceId of iceInHq) {
        options.push({
          id: `hq-ice-this-server:${iceId}`,
          label: `Install ${state.cards[iceId]!.title} protecting ${serverId}`,
          effect: {
            op: "do",
            action: {
              kind: "install_hq_ice_protecting_server_ignore_costs",
              cardId: iceId,
              serverId,
            },
          },
        });
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(
        state,
        `May install 1 ice from HQ protecting ${serverId}, ignoring costs.`,
      );
      return { ok: true };
    }
    case "may_install_ice_from_hq_other_server_ignore_costs": {
      if (!state.run) {
        log(state, `Install ice from HQ — no run.`);
        return { ok: true };
      }
      const attacked = state.run.attackedServerId;
      const iceInHq = state.corp.hand.filter(
        (id) => state.cards[id]?.type === "ice",
      );
      const otherServers = Object.values(state.servers).filter(
        (s) => s.id !== attacked,
      );
      if (iceInHq.length === 0 || otherServers.length === 0) {
        log(
          state,
          `Install ice from HQ on another server — no ice or no other server.`,
        );
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-hq-ice",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const iceId of iceInHq) {
        for (const server of otherServers) {
          options.push({
            id: `hq-ice:${iceId}:${server.id}`,
            label: `Install ${state.cards[iceId]!.title} protecting ${server.id}`,
            effect: {
              op: "do",
              action: {
                kind: "install_hq_ice_protecting_server_ignore_costs",
                cardId: iceId,
                serverId: server.id,
              },
            },
          });
        }
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(
        state,
        `May install ice from HQ protecting another server, ignoring costs.`,
      );
      return { ok: true };
    }
    case "install_ice_from_hq_ignore_costs": {
      const iceInHq = state.corp.hand.filter(
        (id) => state.cards[id]?.type === "ice",
      );
      const servers = Object.values(state.servers);
      if (iceInHq.length === 0 || servers.length === 0) {
        log(state, `Install ice from HQ — no ice in HQ.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (const iceId of iceInHq) {
        for (const server of servers) {
          options.push({
            id: `hq-ice:${iceId}:${server.id}`,
            label: `Install ${state.cards[iceId]!.title} protecting ${server.id}`,
            effect: {
              op: "do",
              action: {
                kind: "install_hq_ice_protecting_server_ignore_costs",
                cardId: iceId,
                serverId: server.id,
              },
            },
          });
        }
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(state, `Install ice from HQ ignoring costs (any server).`);
      return { ok: true };
    }
    case "install_hq_ice_protecting_server_ignore_costs": {
      const card = state.cards[action.cardId];
      const serverId = action.serverId as import("../state/types.js").ServerId;
      const server = state.servers[serverId];
      if (!card || !server || !state.corp.hand.includes(action.cardId)) {
        log(state, `Install HQ ice — card or server missing.`);
        return { ok: true };
      }
      state.corp.hand = state.corp.hand.filter((id) => id !== action.cardId);
      server.ice.unshift(action.cardId);
      card.zone = `server:${serverId}:ice`;
      card.rezzed = false;
      card.faceup = false;
      card.advancementTokens = card.advancementTokens ?? 0;
      log(
        state,
        `Install ${card.title} outermost on ${serverId} (ignore costs).`,
      );
      return { ok: true };
    }
    case "may_install_ice_from_hq_discount_then_move_source": {
      const discount = action.discount ?? 0;
      const iceInHq = state.corp.hand.filter(
        (id) => state.cards[id]?.type === "ice",
      );
      const servers = Object.values(state.servers);
      if (iceInHq.length === 0 || servers.length === 0) {
        log(state, `Install ice from HQ — no ice or no server.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-hq-ice-discount",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const iceId of iceInHq) {
        const installCost = state.cards[iceId]!.installCost ?? 0;
        const pay = Math.max(0, installCost - discount);
        if (creditsAvailableForInstall(state, "corp") < pay) continue;
        for (const server of servers) {
          options.push({
            id: `hq-ice-disc:${iceId}:${server.id}`,
            label: `Install ${state.cards[iceId]!.title} on ${server.id} for ${pay}¢`,
            effect: {
              op: "do",
              action: {
                kind: "install_hq_ice_protecting_server_paying_costs",
                cardId: iceId,
                serverId: server.id,
                discount,
                thenMoveSourceToServerRoot: true,
              },
            },
          });
        }
      }
      if (options.length === 1) {
        log(state, `Install ice from HQ — no affordable ice.`);
        return { ok: true };
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(
        state,
        `May install ice from HQ paying ${discount}¢ less; move ${source.title} to that server root.`,
      );
      return { ok: true };
    }
    case "install_hq_ice_protecting_server_paying_costs": {
      const card = state.cards[action.cardId];
      const serverId = action.serverId as import("../state/types.js").ServerId;
      const server = state.servers[serverId];
      if (!card || !server || !state.corp.hand.includes(action.cardId)) {
        log(state, `Install HQ ice paying costs — card or server missing.`);
        return { ok: true };
      }
      const discount = action.discount ?? 0;
      const pay = Math.max(0, (card.installCost ?? 0) - discount);
      if (creditsAvailableForInstall(state, "corp") < pay) {
        log(state, `Install HQ ice — cannot afford ${pay}¢.`);
        return { ok: true };
      }
      spendCreditsForInstall(state, "corp", pay);
      state.corp.hand = state.corp.hand.filter((id) => id !== action.cardId);
      server.ice.unshift(action.cardId);
      card.zone = `server:${serverId}:ice`;
      card.rezzed = false;
      card.faceup = false;
      card.advancementTokens = card.advancementTokens ?? 0;
      log(
        state,
        `Install ${card.title} outermost on ${serverId} for ${pay}¢.`,
      );
      if (action.thenMoveSourceToServerRoot) {
        const move = evalEffect(ctx, {
          op: "do",
          action: { kind: "move_upgrade_to_server_root", serverId },
        });
        if (!move.ok) return move;
      }
      return { ok: true };
    }
    case "fortify_all_ice": {
      if (!state.run) {
        log(state, `Fortify all ice — no run.`);
        return { ok: true };
      }
      let n = 0;
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          state.run.iceStrengthBoosts[id] =
            (state.run.iceStrengthBoosts[id] ?? 0) + action.amount;
          n += 1;
        }
      }
      log(
        state,
        `Each ice gets +${action.amount} strength this run (${n} ice).`,
      );
      return { ok: true };
    }
    case "meeting_of_minds_resolve": {
      const subtype = action.subtype.toLowerCase();
      const matches = state.runner.deck.filter((id) => {
        const c = state.cards[id];
        return (
          c?.type === "resource" &&
          (c.subtypes ?? []).some((s) => s.toLowerCase() === subtype)
        );
      });
      const afterRevealGain = (): EvalResult => {
        const inGrip = state.runner.hand.filter((id) =>
          (state.cards[id]?.subtypes ?? []).some(
            (s) => s.toLowerCase() === subtype,
          ),
        );
        if (inGrip.length === 0) {
          log(
            state,
            `Meeting of Minds — no ${subtype} cards in grip to reveal.`,
          );
          return { ok: true };
        }
        // Reveal any number: offer each subset via sequential yes/no, or
        // gain 1¢ per matching grip card (deterministic full reveal).
        const gained = inGrip.length;
        state.runner.credits += gained;
        for (const id of inGrip) {
          state.cards[id]!.faceup = true;
        }
        log(
          state,
          `Meeting of Minds — reveal ${gained} ${subtype} card(s) in grip, gain ${gained}¢.`,
        );
        return { ok: true };
      };
      if (matches.length === 0) {
        shuffleRunnerStack(state);
        log(
          state,
          `Meeting of Minds — no ${subtype} resource in stack.`,
        );
        return afterRevealGain();
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "decline-search",
            label: "Decline to search",
            effect: {
              op: "do",
              action: {
                kind: "meeting_of_minds_reveal_gain",
                subtype: action.subtype,
              },
            },
          },
          ...matches.map((id) => ({
            id: `mom-fetch:${id}`,
            label: `Reveal ${state.cards[id]!.title} and add to grip`,
            effect: {
              op: "do" as const,
              action: {
                kind: "meeting_of_minds_fetch" as const,
                cardId: id,
                subtype: action.subtype,
              },
            },
          })),
        ],
      };
      log(
        state,
        `Meeting of Minds — may search stack for a ${subtype} resource.`,
      );
      return { ok: true };
    }
    case "meeting_of_minds_fetch": {
      const card = state.cards[action.cardId];
      if (!card || !state.runner.deck.includes(action.cardId)) {
        shuffleRunnerStack(state);
        return applyPrimitive(ctx, {
          kind: "meeting_of_minds_reveal_gain",
          subtype: action.subtype,
        });
      }
      state.runner.deck = state.runner.deck.filter((id) => id !== action.cardId);
      state.runner.hand.push(action.cardId);
      card.zone = "runner:grip";
      card.faceup = true;
      shuffleRunnerStack(state);
      log(
        state,
        `Meeting of Minds — reveal ${card.title} and add to grip.`,
      );
      return applyPrimitive(ctx, {
        kind: "meeting_of_minds_reveal_gain",
        subtype: action.subtype,
      });
    }
    case "meeting_of_minds_reveal_gain": {
      const subtype = action.subtype.toLowerCase();
      const inGrip = state.runner.hand.filter((id) =>
        (state.cards[id]?.subtypes ?? []).some(
          (s) => s.toLowerCase() === subtype,
        ),
      );
      if (inGrip.length === 0) {
        log(
          state,
          `Meeting of Minds — no ${subtype} cards in grip to reveal.`,
        );
        return { ok: true };
      }
      const gained = inGrip.length;
      state.runner.credits += gained;
      for (const id of inGrip) {
        state.cards[id]!.faceup = true;
      }
      log(
        state,
        `Meeting of Minds — reveal ${gained} ${subtype} card(s) in grip, gain ${gained}¢.`,
      );
      return { ok: true };
    }
    case "may_derez_protecting_attacked_ice": {
      if (!state.run) {
        log(state, `Derez protecting ice — no run.`);
        return { ok: true };
      }
      const server = state.servers[state.run.attackedServerId];
      const iceIds = server?.ice ?? [];
      if (iceIds.length === 0) {
        log(state, `Derez protecting ice — none protecting attacked server.`);
        return { ok: true };
      }
      // Prefer rezzed; allow any protecting ice (Window text: "derez 1 piece").
      const targets = iceIds.filter((id) => state.cards[id]?.rezzed);
      const pool = targets.length > 0 ? targets : iceIds;
      if (pool.length === 1) {
        return applyPrimitive(ctx, {
          kind: "derez_ice_protecting_attacked",
          cardId: pool[0]!,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: pool.map((id) => ({
          id: `window-derez:${id}`,
          label: `Derez ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "derez_ice_protecting_attacked" as const,
              cardId: id,
            },
          },
        })),
      };
      log(state, `Window — derez 1 ice protecting the attacked server.`);
      return { ok: true };
    }
    case "bp_unless_derez_protecting_attacked": {
      if (!state.run) {
        log(state, `BP unless derez — no run.`);
        return { ok: true };
      }
      const server = state.servers[state.run.attackedServerId];
      const rezzed = (server?.ice ?? []).filter(
        (id) => state.cards[id]?.rezzed,
      );
      const takeBp = {
        id: "take-bp",
        label: "Take 1 bad publicity",
        effect: {
          op: "do" as const,
          action: { kind: "give_bad_publicity" as const, amount: 1 },
        },
      };
      if (rezzed.length === 0) {
        return applyPrimitive(ctx, {
          kind: "give_bad_publicity",
          amount: 1,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          ...rezzed.map((id) => ({
            id: `kompromat-derez:${id}`,
            label: `Derez ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "derez_ice_protecting_attacked" as const,
                cardId: id,
              },
            },
          })),
          takeBp,
        ],
      };
      log(
        state,
        `${source.title} — Corp may derez protecting ice or take 1 bad publicity.`,
      );
      return { ok: true };
    }
    case "derez_ice_protecting_attacked": {
      const card = state.cards[action.cardId];
      if (!card || card.type !== "ice") {
        log(state, `Derez protecting ice — not ice.`);
        return { ok: true };
      }
      if (card.rezzed) {
        card.rezzed = false;
        card.faceup = false;
        if (state.run) state.run.iceDerezzedThisRun = true;
        fireHostRezStateTriggers(state, action.cardId, "derez");
      }
      if (state.run) {
        state.run.eventDerezzedIceId = action.cardId;
      }
      log(state, `Derez ${card.title} (Window of Opportunity).`);
      return { ok: true };
    }
    case "may_rez_event_derezzed_ice_ignore_costs": {
      const iceId = state.run?.eventDerezzedIceId;
      if (!iceId || !state.cards[iceId]) {
        log(state, `May rez event-derezzed ice — none recorded.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline-window-rez",
            label: "Decline to rez",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          {
            id: `window-rez:${iceId}`,
            label: `Rez ${state.cards[iceId]!.title} ignoring costs`,
            effect: {
              op: "do",
              action: { kind: "rez_ice_ignore_costs", cardId: iceId },
            },
          },
        ],
      };
      log(state, `Window — Corp may rez the derezzed ice ignoring costs.`);
      return { ok: true };
    }
    case "rez_ice_ignore_costs": {
      const card = state.cards[action.cardId];
      if (!card || card.type !== "ice") {
        log(state, `Rez ice ignore costs — not ice.`);
        return { ok: true };
      }
      card.rezzed = true;
      card.faceup = true;
      log(state, `Rez ${card.title} ignoring all costs.`);
      if (card.onRez) {
        const r = evalEffect({ state, sourceId: action.cardId }, card.onRez);
        if (!r.ok) return r;
      }
      fireHostRezStateTriggers(state, action.cardId, "rez");
      fireIceRezDuringRunHooks(state, action.cardId);
      return { ok: true };
    }
    case "may_reveal_shuffle_agendas_into_rd": {
      const max = Math.max(0, action.max);
      const creditsEach = action.creditsEach ?? 0;
      const agendas: string[] = [];
      for (const id of state.corp.hand) {
        if (state.cards[id]?.type === "agenda") agendas.push(id);
      }
      for (const id of state.corp.discard) {
        if (state.cards[id]?.type === "agenda") agendas.push(id);
      }
      if (agendas.length === 0 || max <= 0) {
        log(state, `Reveal/shuffle agendas into R&D — none available.`);
        return { ok: true };
      }
      // Offer sequential picks up to max (distinct).
      const offer = (remaining: number, exclude: string[]): EvalResult => {
        const left = agendas.filter((id) => !exclude.includes(id));
        if (remaining <= 0 || left.length === 0) {
          state.corp.deck.reverse();
          log(state, `Shuffle R&D after agenda reveal.`);
          return { ok: true };
        }
        state.pendingChoice = {
          sourceId,
          chooser: "corp",
          options: [
            {
              id: "done-agendas",
              label: "Done",
              effect: {
                op: "do",
                action: { kind: "gain_credits", side: "corp", amount: 0 },
              },
            },
            ...left.map((id) => ({
              id: `shuffle-agenda:${id}`,
              label: `Reveal ${state.cards[id]!.title} and shuffle into R&D`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "reveal_shuffle_agenda_into_rd" as const,
                  cardId: id,
                  remainingAfter: remaining - 1,
                  exclude: [...exclude, id],
                  creditsEach,
                },
              },
            })),
          ],
        };
        log(
          state,
          `Reveal up to ${remaining} agenda(s) in HQ/Archives and shuffle into R&D.`,
        );
        return { ok: true };
      };
      return offer(max, []);
    }
    case "reveal_shuffle_agenda_into_rd": {
      const card = state.cards[action.cardId];
      if (!card || card.type !== "agenda") {
        log(state, `Reveal/shuffle agenda — not an agenda.`);
        return { ok: true };
      }
      removeCardFromCurrentZone(state, action.cardId);
      state.corp.deck.push(action.cardId);
      card.zone = "corp:rd";
      card.faceup = false;
      card.rezzed = false;
      const creditsEach = action.creditsEach ?? 0;
      if (creditsEach > 0) {
        state.corp.credits += creditsEach;
        log(
          state,
          `Reveal ${card.title}, gain ${creditsEach}¢ → ${state.corp.credits}¢, shuffle into R&D.`,
        );
      } else {
        log(state, `Reveal ${card.title} and shuffle into R&D.`);
      }
      if (action.remainingAfter <= 0) {
        state.corp.deck.reverse();
        return { ok: true };
      }
      const agendas: string[] = [];
      for (const id of state.corp.hand) {
        if (action.exclude.includes(id)) continue;
        if (state.cards[id]?.type === "agenda") agendas.push(id);
      }
      for (const id of state.corp.discard) {
        if (action.exclude.includes(id)) continue;
        if (state.cards[id]?.type === "agenda") agendas.push(id);
      }
      if (agendas.length === 0) {
        state.corp.deck.reverse();
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "done-agendas",
            label: "Done",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...agendas.map((id) => ({
            id: `shuffle-agenda:${id}`,
            label: `Reveal ${state.cards[id]!.title} and shuffle into R&D`,
            effect: {
              op: "do" as const,
              action: {
                kind: "reveal_shuffle_agenda_into_rd" as const,
                cardId: id,
                remainingAfter: action.remainingAfter - 1,
                exclude: [...action.exclude, id],
                creditsEach,
              },
            },
          })),
        ],
      };
      return { ok: true };
    }
    case "reveal_hq_subtype_install_and_rez_ignore_costs": {
      const subtype = action.subtype.toLowerCase();
      const iceInHq = state.corp.hand.filter((id) => {
        const c = state.cards[id];
        return (
          c?.type === "ice" &&
          (c.subtypes ?? []).some((s) => s.toLowerCase() === subtype)
        );
      });
      const servers = Object.values(state.servers);
      if (iceInHq.length === 0 || servers.length === 0) {
        log(
          state,
          `Reveal HQ ${action.subtype} — none in HQ (or no server).`,
        );
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (const iceId of iceInHq) {
        for (const server of servers) {
          options.push({
            id: `bb-ice:${iceId}:${server.id}`,
            label: `Reveal, install and rez ${state.cards[iceId]!.title} protecting ${server.id}`,
            effect: {
              op: "do",
              action: {
                kind: "install_and_rez_hq_ice_protecting_server_ignore_costs",
                cardId: iceId,
                serverId: server.id,
              },
            },
          });
        }
        // Also allow creating a new remote.
        options.push({
          id: `bb-ice:${iceId}:new-remote`,
          label: `Reveal, install and rez ${state.cards[iceId]!.title} protecting a new remote`,
          effect: {
            op: "do",
            action: {
              kind: "install_and_rez_hq_ice_protecting_server_ignore_costs",
              cardId: iceId,
              serverId: "new-remote",
            },
          },
        });
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(
        state,
        `Reveal a ${action.subtype} from HQ; install and rez ignoring all costs.`,
      );
      return { ok: true };
    }
    case "install_and_rez_hq_ice_protecting_server_ignore_costs": {
      const card = state.cards[action.cardId];
      if (!card || !state.corp.hand.includes(action.cardId)) {
        log(state, `Install+rez HQ ice — card not in HQ.`);
        return { ok: true };
      }
      let serverId = action.serverId as import("../state/types.js").ServerId;
      if (action.serverId === "new-remote") {
        const remoteNum = state.nextRemoteNumber++;
        serverId = `remote-${remoteNum}` as import("../state/types.js").ServerId;
        state.servers[serverId] = {
          id: serverId,
          kind: "remote",
          ice: [],
          root: [],
        };
      }
      const server = state.servers[serverId];
      if (!server) {
        log(state, `Install+rez HQ ice — server missing.`);
        return { ok: true };
      }
      state.corp.hand = state.corp.hand.filter((id) => id !== action.cardId);
      server.ice.unshift(action.cardId);
      card.zone = `server:${serverId}:ice`;
      card.rezzed = true;
      card.faceup = true;
      card.advancementTokens = card.advancementTokens ?? 0;
      log(
        state,
        `Reveal ${card.title}; install and rez outermost on ${serverId} (ignore costs).`,
      );
      if (!state.turn.rezzedThisTurnIds) state.turn.rezzedThisTurnIds = [];
      if (!state.turn.rezzedThisTurnIds.includes(action.cardId)) {
        state.turn.rezzedThisTurnIds.push(action.cardId);
      }
      state.turn.lastInstalledFromEffectId = action.cardId;
      noteInstalledThisTurn(state, action.cardId);
      state.turn.corpInstalledFromHqThisTurn = true;
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: action.cardId }, card.onInstall);
        if (!r.ok) return r;
      }
      if (card.onRez) {
        const r = evalEffect({ state, sourceId: action.cardId }, card.onRez);
        if (!r.ok) return r;
      }
      fireHostRezStateTriggers(state, action.cardId, "rez");
      fireIceRezDuringRunHooks(state, action.cardId);
      return { ok: true };
    }
    case "may_remove_advancement_from_installed_gain_credits": {
      const credits = action.credits ?? 0;
      const advanced: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.ice, ...server.root]) {
          if ((state.cards[id]?.advancementTokens ?? 0) > 0) advanced.push(id);
        }
      }
      if (advanced.length === 0) {
        log(state, `${source.title} — no advanced installed cards.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline-remove-adv",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...advanced.map((id) => ({
            id: `remove-adv:${id}`,
            label: `Remove 1 advancement from ${state.cards[id]!.title}; gain ${credits}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "remove_advancement_from_installed_gain_credits" as const,
                cardId: id,
                credits,
              },
            },
          })),
        ],
      };
      log(
        state,
        `${source.title} — may remove 1 advancement from an installed card to gain ${credits}¢.`,
      );
      return { ok: true };
    }
    case "remove_advancement_from_installed_gain_credits": {
      const card = state.cards[action.cardId];
      if (!card || (card.advancementTokens ?? 0) <= 0) {
        log(state, `Remove advancement — card has none.`);
        return { ok: true };
      }
      card.advancementTokens = (card.advancementTokens ?? 0) - 1;
      state.corp.credits += action.credits;
      log(
        state,
        `Remove 1 advancement from ${card.title}; gain ${action.credits}¢ → ${state.corp.credits}¢.`,
      );
      return { ok: true };
    }
    case "look_top_rd_may_trash": {
      if (state.corp.deck.length === 0) {
        log(state, `Look at top of R&D — empty.`);
        return { ok: true };
      }
      const topId = state.corp.deck[0]!;
      const top = state.cards[topId]!;
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "leave-top",
            label: `Leave ${top.title} on top of R&D`,
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          {
            id: "trash-top",
            label: `Trash ${top.title} from R&D`,
            effect: {
              op: "do",
              action: { kind: "trash_top_of_rd" },
            },
          },
        ],
      };
      log(state, `Look at top of R&D (${top.title}) — may trash.`);
      return { ok: true };
    }
    case "look_top_rd_may_bottom": {
      if (state.corp.deck.length === 0) {
        log(state, `Look at top of R&D — empty.`);
        return { ok: true };
      }
      const topId = state.corp.deck[0]!;
      const top = state.cards[topId]!;
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "leave-top",
            label: `Leave ${top.title} on top of R&D`,
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          {
            id: "bottom-top",
            label: `Add ${top.title} to the bottom of R&D`,
            effect: {
              op: "do",
              action: { kind: "rd_top_to_bottom" },
            },
          },
        ],
      };
      log(state, `Look at top of R&D (${top.title}) — may bottom.`);
      return { ok: true };
    }
    case "look_top_rd_may_advance_may_bottom": {
      if (state.corp.deck.length === 0) {
        log(state, `Look at top of R&D — empty.`);
        return { ok: true };
      }
      const topId = state.corp.deck[0]!;
      const top = state.cards[topId]!;
      // Step 1: may place 1 advancement on the looked card.
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "advance-top",
            label: `Place 1 advancement on ${top.title}`,
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: {
                    kind: "place_advancements_on" as const,
                    cardId: topId,
                    amount: 1,
                  },
                },
                {
                  op: "do" as const,
                  action: {
                    kind: "look_top_rd_may_bottom" as const,
                  },
                },
              ],
            },
          },
          {
            id: "skip-advance",
            label: `Do not advance ${top.title}`,
            effect: {
              op: "do" as const,
              action: { kind: "look_top_rd_may_bottom" as const },
            },
          },
        ],
      };
      log(
        state,
        `Look at top of R&D (${top.title}) — may advance, then may bottom.`,
      );
      return { ok: true };
    }
    case "rd_top_to_bottom": {
      if (state.corp.deck.length === 0) {
        log(state, `R&D top to bottom — empty.`);
        return { ok: true };
      }
      const topId = state.corp.deck.shift()!;
      state.corp.deck.push(topId);
      log(
        state,
        `Add ${state.cards[topId]?.title ?? topId} to the bottom of R&D.`,
      );
      return { ok: true };
    }
    case "swap_source_ice_with_other": {
      let sourceServerId: import("../state/types.js").ServerId | null = null;
      let sourceIdx = -1;
      const others: string[] = [];
      for (const server of Object.values(state.servers)) {
        const idx = server.ice.indexOf(sourceId);
        if (idx >= 0) {
          sourceServerId = server.id;
          sourceIdx = idx;
        }
        for (const id of server.ice) {
          if (id !== sourceId) others.push(id);
        }
      }
      if (!sourceServerId || sourceIdx < 0) {
        log(state, `Swap source ice — ${source.title} not installed as ice.`);
        return { ok: true };
      }
      if (others.length === 0) {
        log(state, `Swap source ice — no other installed ice.`);
        return { ok: true };
      }
      if (others.length === 1) {
        return applyPrimitive(ctx, {
          kind: "swap_two_installed_ice",
          otherIceId: others[0]!,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: others.map((id) => ({
          id: `swap-ice:${id}`,
          label: `Swap with ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "swap_two_installed_ice" as const,
              otherIceId: id,
            },
          },
        })),
      };
      log(state, `${source.title} — choose another ice to swap with.`);
      return { ok: true };
    }
    case "may_swap_ice_with_other_installed": {
      const others: string[] = [];
      let installed = false;
      for (const server of Object.values(state.servers)) {
        if (server.ice.includes(sourceId)) installed = true;
        for (const id of server.ice) {
          if (id !== sourceId) others.push(id);
        }
      }
      if (!installed) {
        log(state, `May swap ice — source not installed as ice.`);
        return { ok: true };
      }
      if (others.length === 0) {
        log(state, `May swap ice — no other installed ice.`);
        return { ok: true };
      }
      const chooser = source.side === "corp" ? "corp" : "runner";
      state.pendingChoice = {
        sourceId,
        chooser,
        options: [
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: chooser,
                amount: 0,
              },
            },
          },
          ...others.map((id) => ({
            id: `swap-ice:${id}`,
            label: `Swap with ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "swap_two_installed_ice" as const,
                otherIceId: id,
              },
            },
          })),
        ],
      };
      log(state, `May swap ${source.title} with another installed ice.`);
      return { ok: true };
    }
    case "may_swap_protecting_attacked_ice_with_other_installed": {
      const sid = state.run?.attackedServerId;
      if (!sid) {
        log(state, `May swap protecting ice — no attacked server.`);
        return { ok: true };
      }
      const protecting = [...(state.servers[sid]?.ice ?? [])];
      const allIce: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) allIce.push(id);
      }
      const eligibleProtecting = protecting.filter((pid) =>
        allIce.some((oid) => oid !== pid),
      );
      if (eligibleProtecting.length === 0) {
        log(
          state,
          `May swap protecting ice — no eligible pair (protecting + other).`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "runner" as const,
                amount: 0,
              },
            },
          },
          ...eligibleProtecting.map((pid) => ({
            id: `swap-protecting:${pid}`,
            label: `Swap ${state.cards[pid]!.title} (protecting)`,
            effect: {
              op: "do" as const,
              action: {
                kind: "swap_protecting_attacked_ice_pick_other" as const,
                protectingIceId: pid,
              },
            },
          })),
        ],
      };
      log(
        state,
        `${source.title} — may swap ice protecting attacked server with another installed ice.`,
      );
      return { ok: true };
    }
    case "swap_protecting_attacked_ice_pick_other": {
      const protectingIceId = action.protectingIceId;
      const others: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (id !== protectingIceId) others.push(id);
        }
      }
      if (others.length === 0) {
        log(state, `Swap protecting ice — no other installed ice.`);
        return { ok: true };
      }
      if (others.length === 1) {
        return applyPrimitive(ctx, {
          kind: "swap_protecting_attacked_ice_with",
          protectingIceId,
          otherIceId: others[0]!,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: others.map((id) => ({
          id: `swap-other:${id}`,
          label: `Swap with ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "swap_protecting_attacked_ice_with" as const,
              protectingIceId,
              otherIceId: id,
            },
          },
        })),
      };
      log(
        state,
        `Choose another installed ice to swap with ${state.cards[protectingIceId]?.title ?? protectingIceId}.`,
      );
      return { ok: true };
    }
    case "swap_protecting_attacked_ice_with": {
      let aServer: import("../state/types.js").ServerId | null = null;
      let aIdx = -1;
      let bServer: import("../state/types.js").ServerId | null = null;
      let bIdx = -1;
      for (const server of Object.values(state.servers)) {
        const ia = server.ice.indexOf(action.protectingIceId);
        if (ia >= 0) {
          aServer = server.id;
          aIdx = ia;
        }
        const ib = server.ice.indexOf(action.otherIceId);
        if (ib >= 0) {
          bServer = server.id;
          bIdx = ib;
        }
      }
      if (!aServer || aIdx < 0 || !bServer || bIdx < 0) {
        log(state, `Swap protecting ice — one or both ice not installed.`);
        return { ok: true };
      }
      const a = state.cards[action.protectingIceId]!;
      const b = state.cards[action.otherIceId]!;
      state.servers[aServer]!.ice[aIdx] = action.otherIceId;
      state.servers[bServer]!.ice[bIdx] = action.protectingIceId;
      b.zone = `server:${aServer}:ice`;
      a.zone = `server:${bServer}:ice`;
      log(state, `Swap ${a.title} with ${b.title}.`);
      return { ok: true };
    }
    case "swap_two_installed_ice": {
      let aServer: import("../state/types.js").ServerId | null = null;
      let aIdx = -1;
      let bServer: import("../state/types.js").ServerId | null = null;
      let bIdx = -1;
      for (const server of Object.values(state.servers)) {
        const ia = server.ice.indexOf(sourceId);
        if (ia >= 0) {
          aServer = server.id;
          aIdx = ia;
        }
        const ib = server.ice.indexOf(action.otherIceId);
        if (ib >= 0) {
          bServer = server.id;
          bIdx = ib;
        }
      }
      if (!aServer || aIdx < 0 || !bServer || bIdx < 0) {
        log(state, `Swap ice — one or both ice not installed.`);
        return { ok: true };
      }
      const other = state.cards[action.otherIceId]!;
      state.servers[aServer]!.ice[aIdx] = action.otherIceId;
      state.servers[bServer]!.ice[bIdx] = sourceId;
      other.zone = `server:${aServer}:ice`;
      source.zone = `server:${bServer}:ice`;
      log(
        state,
        `Swap ${source.title} with ${other.title}.`,
      );
      return { ok: true };
    }
    case "pay_credits_reencounter_passed_ice": {
      if (!state.run?.pendingReencounterIceId) {
        log(state, `Reencounter — no pending ice.`);
        return { ok: true };
      }
      if (state.corp.credits < action.credits) {
        log(state, `Reencounter — cannot afford ${action.credits}¢.`);
        state.run.pendingReencounterIceId = undefined;
        return { ok: true };
      }
      state.corp.credits -= action.credits;
      state.run.reencounterIceId = state.run.pendingReencounterIceId;
      state.run.pendingReencounterIceId = undefined;
      log(
        state,
        `Pay ${action.credits}¢ — Runner will encounter ice again.`,
      );
      return { ok: true };
    }
    case "trash_hq_reencounter_passed_ice": {
      if (!state.run?.pendingReencounterIceId) {
        log(state, `Reencounter — no pending ice.`);
        return { ok: true };
      }
      if (state.corp.hand.length < 1) {
        log(state, `Reencounter — HQ empty.`);
        state.run.pendingReencounterIceId = undefined;
        return { ok: true };
      }
      const hqId = state.corp.hand[state.corp.hand.length - 1]!;
      const hqCard = state.cards[hqId]!;
      state.corp.hand.pop();
      state.corp.discard.push(hqId);
      hqCard.zone = "corp:archives";
      hqCard.faceup = true;
      noteCorpCardAddedToArchives(state);
      state.run.reencounterIceId = state.run.pendingReencounterIceId;
      state.run.pendingReencounterIceId = undefined;
      log(
        state,
        `Trash ${hqCard.title} from HQ — Runner will encounter ice again.`,
      );
      return { ok: true };
    }
    case "may_install_and_rez_from_hq": {
      const discount = Math.max(0, action.totalDiscount ?? 0);
      const eligible = state.corp.hand.filter((id) => {
        const t = state.cards[id]?.type;
        return (
          t === "agenda" || t === "asset" || t === "ice" || t === "upgrade"
        );
      });
      if (eligible.length === 0) {
        log(state, `Install and rez from HQ — no eligible cards.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline-eminent-hq",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...eligible.map((id) => {
            const c = state.cards[id]!;
            const install = c.installCost ?? 0;
            const rez = c.type === "agenda" ? 0 : (c.rezCost ?? 0);
            const total = Math.max(0, install + rez - discount);
            return {
              id: `eminent-hq:${id}`,
              label: `Install${c.type === "agenda" ? "" : " and rez"} ${c.title} (≤${total}¢ after ${discount}¢ discount)`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "install_and_rez_hq_card_with_discount" as const,
                  cardId: id,
                  totalDiscount: discount,
                },
              },
            };
          }),
        ],
      };
      log(
        state,
        `May install and rez 1 card from HQ paying ${discount}¢ less total.`,
      );
      return { ok: true };
    }
    case "install_and_rez_hq_card_with_discount": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.corp.hand.includes(cardId)) {
        log(state, `Install+rez from HQ — card not in HQ.`);
        return { ok: true };
      }
      const discount = Math.max(0, action.totalDiscount ?? 0);
      const installCost = card.installCost ?? 0;
      const rezCost = card.rezCost ?? 0;
      const isAgenda = card.type === "agenda";
      const canRez = !isAgenda;
      const fullTotal = Math.max(
        0,
        installCost + (canRez ? rezCost : 0) - discount,
      );
      const installOnly = Math.max(0, installCost - discount);
      const credits = creditsAvailableForInstall(state, "corp");
      const doRez = canRez && credits >= fullTotal;
      const pay = doRez ? fullTotal : installOnly;
      if (credits < pay) {
        log(
          state,
          `Install from HQ — cannot afford ${pay}¢ for ${card.title}.`,
        );
        return { ok: true };
      }
      spendCreditsForInstall(state, "corp", pay);
      state.corp.hand = state.corp.hand.filter((id) => id !== cardId);
      const remoteNum = state.nextRemoteNumber++;
      const sid =
        `remote-${remoteNum}` as import("../state/types.js").ServerId;
      state.servers[sid] = { id: sid, kind: "remote", ice: [], root: [] };
      if (card.type === "ice") {
        state.servers[sid].ice.push(cardId);
        card.zone = `server:${sid}:ice`;
      } else {
        state.servers[sid].root.push(cardId);
        card.zone = `server:${sid}:root`;
      }
      if (doRez) {
        card.rezzed = true;
        card.faceup = true;
      } else {
        card.rezzed = false;
        card.faceup = true; // revealed
      }
      if (card.type === "agenda" || card.type === "asset") {
        card.advancementTokens = card.advancementTokens ?? 0;
      }
      if (doRez && (card.hostedCreditsOnInstall ?? 0) > 0) {
        card.hostedCredits = card.hostedCreditsOnInstall;
      }
      if (doRez && (card.recurringCreditsMax ?? 0) > 0) {
        card.recurringCredits = card.recurringCreditsMax;
      }
      state.turn.lastInstalledFromEffectId = cardId;
      noteInstalledThisTurn(state, cardId);
      state.turn.corpInstalledFromHqThisTurn = true;
      log(
        state,
        doRez
          ? `Install and rez ${card.title} on ${sid} for ${pay}¢ (${discount}¢ discount).`
          : `Install ${card.title} unrezzed (revealed) on ${sid} for ${pay}¢ (${discount}¢ discount; cannot rez).`,
      );
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
        if (!r.ok) return r;
      }
      if (doRez && card.onRez) {
        const r = evalEffect({ state, sourceId: cardId }, card.onRez);
        if (!r.ok) return r;
      }
      if (doRez && card.type === "ice") {
        fireHostRezStateTriggers(state, cardId, "rez");
      }
      return { ok: true };
    }
    case "may_search_rd_install_rez_ignore_costs": {
      const eligible = state.corp.deck.filter((id) => {
        const t = state.cards[id]?.type;
        return (
          t === "agenda" || t === "asset" || t === "ice" || t === "upgrade"
        );
      });
      if (eligible.length === 0) {
        log(state, `Search R&D install+rez — none found.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline-search-rd",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...eligible.map((id) => ({
            id: `search-rd-install:${id}`,
            label: `Install${state.cards[id]!.type === "agenda" ? "" : " and rez"} ${state.cards[id]!.title} ignoring costs`,
            effect: {
              op: "do" as const,
              action: {
                kind: "search_rd_pick_install_rez_ignore_costs" as const,
                cardId: id,
              },
            },
          })),
        ],
      };
      log(state, `May search R&D for 1 card to install and rez ignoring costs.`);
      return { ok: true };
    }
    case "search_rd_pick_install_rez_ignore_costs": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card) {
        log(state, `Search R&D install — invalid card.`);
        return { ok: true };
      }
      const deckIdx = state.corp.deck.indexOf(cardId);
      if (deckIdx < 0) {
        log(state, `Search R&D install — not in R&D.`);
        return { ok: true };
      }
      state.corp.deck.splice(deckIdx, 1);
      shuffleCorpRdAfterSearch(state);
      const remoteNum = state.nextRemoteNumber++;
      const sid =
        `remote-${remoteNum}` as import("../state/types.js").ServerId;
      state.servers[sid] = { id: sid, kind: "remote", ice: [], root: [] };
      if (card.type === "ice") {
        state.servers[sid].ice.push(cardId);
        card.zone = `server:${sid}:ice`;
      } else {
        state.servers[sid].root.push(cardId);
        card.zone = `server:${sid}:root`;
      }
      const doRez = card.type !== "agenda";
      card.rezzed = doRez;
      card.faceup = true;
      if (card.type === "agenda" || card.type === "asset") {
        card.advancementTokens = card.advancementTokens ?? 0;
      }
      if (doRez && (card.hostedCreditsOnInstall ?? 0) > 0) {
        card.hostedCredits = card.hostedCreditsOnInstall;
      }
      if (doRez && (card.recurringCreditsMax ?? 0) > 0) {
        card.recurringCredits = card.recurringCreditsMax;
      }
      noteInstalledThisTurn(state, cardId);
      log(
        state,
        `Install${doRez ? " and rez" : ""} ${card.title} from R&D on ${sid} ignoring costs.`,
      );
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
        if (!r.ok) return r;
      }
      if (doRez && card.onRez) {
        const r = evalEffect({ state, sourceId: cardId }, card.onRez);
        if (!r.ok) return r;
      }
      if (doRez && card.type === "ice") {
        fireHostRezStateTriggers(state, cardId, "rez");
      }
      return { ok: true };
    }
    case "lycian_choose_subtypes": {
      const options = ["barrier", "code gate", "sentry"];
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: options.map((subtype) => ({
          id: `lycian:${subtype}`,
          label: `Gain ${subtype}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "lycian_gain_subtype" as const,
              subtype,
              remaining: options.filter((s) => s !== subtype),
            },
          },
        })),
      };
      log(
        state,
        `${source.title} — choose 1 or more subtypes (barrier / code gate / sentry).`,
      );
      return { ok: true };
    }
    case "lycian_gain_subtype": {
      const subtype = action.subtype;
      if (!(source.subtypes ?? []).includes(subtype)) {
        source.subtypes = [...(source.subtypes ?? []), subtype];
      }
      if (!source.lycianGainedSubtypes) source.lycianGainedSubtypes = [];
      if (!source.lycianGainedSubtypes.includes(subtype)) {
        source.lycianGainedSubtypes.push(subtype);
      }
      log(state, `${source.title} gains ${subtype} while rezzed.`);
      const remaining = action.remaining ?? [];
      if (remaining.length === 0) return { ok: true };
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "lycian-done",
            label: "Done",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...remaining.map((s) => ({
            id: `lycian:${s}`,
            label: `Gain ${s}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "lycian_gain_subtype" as const,
                subtype: s,
                remaining: remaining.filter((x) => x !== s),
              },
            },
          })),
        ],
      };
      return { ok: true };
    }
    case "lightning_spend_counter_rez_up_to_protecting_attacked": {
      if ((source.agendaCounters ?? 0) < 1) {
        log(state, `${source.title} — no agenda counters.`);
        return { ok: true };
      }
      source.agendaCounters = (source.agendaCounters ?? 0) - 1;
      const maxIce = Math.max(0, action.maxIce);
      const serverId = state.run?.attackedServerId;
      if (serverId) {
        state.turn.lightningPendingDerez = { serverId, maxIce };
      }
      log(
        state,
        `${source.title} — remove 1 agenda counter → ${source.agendaCounters}; rez up to ${maxIce} ice.`,
      );
      return applyPrimitive(ctx, {
        kind: "rez_up_to_ice_protecting_attacked_ignore_costs",
        maxIce,
      });
    }
    case "rez_up_to_ice_protecting_attacked_ignore_costs": {
      if (!state.run) {
        log(state, `Rez protecting ice — no run.`);
        return { ok: true };
      }
      const maxIce = Math.max(0, action.maxIce);
      if (maxIce <= 0) return { ok: true };
      const server = state.servers[state.run.attackedServerId];
      const unrezzed = (server?.ice ?? []).filter(
        (id) => state.cards[id]?.type === "ice" && !state.cards[id]!.rezzed,
      );
      if (unrezzed.length === 0) {
        log(state, `Rez protecting ice — none unrezzed.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "done-rez-protecting",
            label: "Done",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...unrezzed.map((id) => ({
            id: `rez-protecting:${id}`,
            label: `Rez ${state.cards[id]!.title} ignoring costs`,
            effect: {
              op: "do" as const,
              action: {
                kind: "rez_one_protecting_attacked_ignore_costs" as const,
                cardId: id,
                remaining: maxIce - 1,
              },
            },
          })),
        ],
      };
      log(
        state,
        `Rez up to ${maxIce} ice protecting the attacked server ignoring costs.`,
      );
      return { ok: true };
    }
    case "rez_one_protecting_attacked_ignore_costs": {
      const card = state.cards[action.cardId];
      if (!card || card.type !== "ice") {
        log(state, `Rez protecting ice — not ice.`);
        return { ok: true };
      }
      card.rezzed = true;
      card.faceup = true;
      log(state, `Rez ${card.title} ignoring all costs.`);
      if (card.onRez) {
        const r = evalEffect({ state, sourceId: action.cardId }, card.onRez);
        if (!r.ok) return r;
      }
      fireHostRezStateTriggers(state, action.cardId, "rez");
      // Brasília / Thunderbolt hooks (same as paid rez during run).
      fireIceRezDuringRunHooks(state, action.cardId);
      if (state.pendingChoice) return { ok: true };
      const remaining = Math.max(0, action.remaining ?? 0);
      if (remaining <= 0 || !state.run) return { ok: true };
      const server = state.servers[state.run.attackedServerId];
      const unrezzed = (server?.ice ?? []).filter(
        (id) =>
          id !== action.cardId &&
          state.cards[id]?.type === "ice" &&
          !state.cards[id]!.rezzed,
      );
      if (unrezzed.length === 0) return { ok: true };
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "done-rez-protecting",
            label: "Done",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...unrezzed.map((id) => ({
            id: `rez-protecting:${id}`,
            label: `Rez ${state.cards[id]!.title} ignoring costs`,
            effect: {
              op: "do" as const,
              action: {
                kind: "rez_one_protecting_attacked_ignore_costs" as const,
                cardId: id,
                remaining: remaining - 1,
              },
            },
          })),
        ],
      };
      return { ok: true };
    }
    case "derez_up_to_ice_protecting_server": {
      const maxIce = Math.max(0, action.maxIce);
      if (maxIce <= 0) return { ok: true };
      const serverId = action.serverId as import("../state/types.js").ServerId;
      const server = state.servers[serverId];
      const rezzed = (server?.ice ?? []).filter(
        (id) => state.cards[id]?.type === "ice" && state.cards[id]!.rezzed,
      );
      if (rezzed.length === 0) {
        log(state, `Derez ice protecting ${serverId} — none rezzed.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "done-derez-protecting",
            label: "Done",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...rezzed.map((id) => ({
            id: `derez-protecting:${id}`,
            label: `Derez ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "derez_one_protecting_server" as const,
                cardId: id,
                serverId,
                remaining: maxIce - 1,
              },
            },
          })),
        ],
      };
      log(
        state,
        `Derez up to ${maxIce} ice protecting ${serverId}.`,
      );
      return { ok: true };
    }
    case "derez_one_protecting_server": {
      const card = state.cards[action.cardId];
      if (!card || card.type !== "ice") {
        log(state, `Derez protecting ice — not ice.`);
        return { ok: true };
      }
      if (card.rezzed) {
        card.rezzed = false;
        card.faceup = false;
        if (state.run) state.run.iceDerezzedThisRun = true;
        fireHostRezStateTriggers(state, action.cardId, "derez");
      }
      log(state, `Derez ${card.title}.`);
      const remaining = Math.max(0, action.remaining ?? 0);
      if (remaining <= 0) return { ok: true };
      const serverId = action.serverId as import("../state/types.js").ServerId;
      const server = state.servers[serverId];
      const rezzed = (server?.ice ?? []).filter(
        (id) =>
          id !== action.cardId &&
          state.cards[id]?.type === "ice" &&
          state.cards[id]!.rezzed,
      );
      if (rezzed.length === 0) return { ok: true };
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "done-derez-protecting",
            label: "Done",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...rezzed.map((id) => ({
            id: `derez-protecting:${id}`,
            label: `Derez ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "derez_one_protecting_server" as const,
                cardId: id,
                serverId,
                remaining: remaining - 1,
              },
            },
          })),
        ],
      };
      return { ok: true };
    }
    case "brasilia_derez_other_ice_for_strength": {
      const other = state.cards[action.otherIceId];
      if (!other || other.type !== "ice" || !other.rezzed) {
        log(state, `Brasília — other ice not rezzed.`);
        return { ok: true };
      }
      other.rezzed = false;
      other.faceup = false;
      if (state.run) state.run.iceDerezzedThisRun = true;
      fireHostRezStateTriggers(state, action.otherIceId, "derez");
      if (state.run) {
        state.run.iceStrengthBoosts[action.rezzedIceId] =
          (state.run.iceStrengthBoosts[action.rezzedIceId] ?? 0) + action.bonus;
      }
      log(
        state,
        `Brasília — derez ${other.title}; ${state.cards[action.rezzedIceId]?.title ?? action.rezzedIceId} gets +${action.bonus} strength this run.`,
      );
      return { ok: true };
    }
    case "end_the_run_unless_trash_installed": {
      const installed = [...state.runner.rig];
      if (installed.length === 0) {
        return applyPrimitive(ctx, { kind: "end_the_run" });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "etr-thunderbolt",
            label: "End the run",
            effect: {
              op: "do",
              action: { kind: "end_the_run" },
            },
          },
          {
            id: "trash-installed-thunderbolt",
            label: "Trash 1 of your installed cards",
            effect: {
              op: "do",
              action: { kind: "trash_installed_runner", pick: "choose" },
            },
          },
        ],
      };
      log(
        state,
        `End the run unless the Runner trashes 1 of their installed cards.`,
      );
      return { ok: true };
    }
    case "end_the_run_unless_corp_pays": {
      const amount = Math.max(0, action.amount);
      if (amount <= 0) return { ok: true };
      if (state.corp.credits < amount) {
        log(
          state,
          `Corp cannot pay ${amount}¢ — end the run (CR ${CR.nestedCostUnless.number}).`,
        );
        return applyPrimitive(ctx, { kind: "end_the_run" });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "corp-pay-nested",
            label: `Pay ${amount}¢`,
            effect: {
              op: "do",
              action: {
                kind: "lose_credits",
                side: "corp",
                amount,
              },
            },
          },
          {
            id: "etr-unless-corp-pay",
            label: "End the run",
            effect: {
              op: "do",
              action: { kind: "end_the_run" },
            },
          },
        ],
      };
      log(
        state,
        `End the run unless the Corp pays ${amount}¢ (CR ${CR.nestedCostUnless.number}).`,
      );
      return { ok: true };
    }
    case "end_the_run_unless_pay_credits_per_runner_scored_agenda": {
      const per = Math.max(0, action.creditsPer);
      const agendas = state.runner.score.length;
      const amount = per * agendas;
      if (amount <= 0) return { ok: true };
      if (state.runner.credits < amount) {
        log(
          state,
          `Runner cannot pay ${amount}¢ (${per}×${agendas} agendas) — end the run (CR ${CR.nestedCostUnless.number}).`,
        );
        return applyPrimitive(ctx, { kind: "end_the_run" });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "pay-per-agenda",
            label: `Pay ${amount}¢ (${per}×${agendas} agendas)`,
            effect: {
              op: "do",
              action: {
                kind: "lose_credits",
                side: "runner",
                amount,
              },
            },
          },
          {
            id: "etr-unless-pay-agendas",
            label: "End the run",
            effect: {
              op: "do",
              action: { kind: "end_the_run" },
            },
          },
        ],
      };
      log(
        state,
        `End the run unless the Runner pays ${amount}¢ (${per}×${agendas} agendas) (CR ${CR.nestedCostUnless.number}).`,
      );
      return { ok: true };
    }
    case "may_take_bad_publicity_then_add_agenda_counters_equal_to_bad_publicity": {
      const amount = Math.max(0, action.amount);
      const continueFx: Effect = {
        op: "do",
        action: { kind: "add_agenda_counters_equal_to_bad_publicity" },
      };
      if (amount <= 0) return evalEffect(ctx, continueFx);
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "take-bp",
            label: `Take ${amount} bad publicity`,
            effect: {
              op: "seq",
              effects: [
                {
                  op: "do",
                  action: { kind: "give_bad_publicity", amount },
                },
                continueFx,
              ],
            },
          },
          {
            id: "decline-bp",
            label: "Decline",
            effect: continueFx,
          },
        ],
      };
      log(
        state,
        `${source.title} — may take ${amount} bad publicity, then place agenda counters equal to bad publicity.`,
      );
      return { ok: true };
    }
    case "add_agenda_counters_equal_to_bad_publicity": {
      const n = state.corp.badPublicity ?? 0;
      source.agendaCounters = (source.agendaCounters ?? 0) + n;
      log(
        state,
        `Place ${n} agenda counter(s) on ${source.title} (equal to bad publicity) → ${source.agendaCounters}.`,
      );
      return { ok: true };
    }
    case "may_pay_credits_gain_click_trash_at_turn_end_if_no_successful_run": {
      const credits = Math.max(0, action.credits);
      if (state.runner.credits < credits) {
        log(
          state,
          `${source.title} — cannot pay ${credits}¢ to gain [click].`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "pay-click",
            label: `Pay ${credits}¢ to gain [click]`,
            effect: {
              op: "do",
              action: {
                kind: "algernon_pay_gain_click",
                credits,
              },
            },
          },
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
        ],
      };
      log(
        state,
        `${source.title} — may pay ${credits}¢ to gain [click] (trash at turn end if no successful run).`,
      );
      return { ok: true };
    }
    case "algernon_pay_gain_click": {
      const credits = Math.max(0, action.credits);
      if (state.runner.credits < credits) {
        log(state, `${source.title} — cannot afford ${credits}¢.`);
        return { ok: true };
      }
      state.runner.credits -= credits;
      state.runner.clicks += 1;
      source.trashAtTurnEndUnlessSuccessfulRun = true;
      log(
        state,
        `${source.title} — pay ${credits}¢ → ${state.runner.credits}¢, gain [click] → ${state.runner.clicks} (trash at turn end unless successful run).`,
      );
      return { ok: true };
    }
    case "may_gain_click_then_tag_at_turn_end": {
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "gain-click",
            label: "Gain [click] (take 1 tag at turn end)",
            effect: {
              op: "do",
              action: { kind: "joshua_gain_click_tag_at_turn_end" },
            },
          },
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
        ],
      };
      log(
        state,
        `${source.title} — may gain [click] (tag at turn end if you do).`,
      );
      return { ok: true };
    }
    case "joshua_gain_click_tag_at_turn_end": {
      state.runner.clicks += 1;
      source.tagAtTurnEnd = true;
      log(
        state,
        `${source.title} — gain [click] → ${state.runner.clicks} (take 1 tag at turn end).`,
      );
      return { ok: true };
    }
    case "host_grip_program_or_hardware_with_power_equal_install_cost": {
      const grip = state.runner.hand.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "program" || t === "hardware";
      });
      if (grip.length === 0) {
        log(state, `${source.title} — no program/hardware in grip to host.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: grip.map((cardId) => ({
          id: `pw-host:${cardId}`,
          label: `Host ${state.cards[cardId]!.title} (power = install cost)`,
          effect: {
            op: "do" as const,
            action: {
              kind: "host_grip_pw_card_with_power_equal_install_cost" as const,
              cardId,
            },
          },
        })),
      };
      log(
        state,
        `${source.title} — host a program or hardware from grip with power = install cost.`,
      );
      return { ok: true };
    }
    case "host_grip_pw_card_with_power_equal_install_cost": {
      if (!state.runner.hand.includes(action.cardId)) {
        log(state, `Personal Workshop host — ${action.cardId} not in grip.`);
        return { ok: true };
      }
      const card = state.cards[action.cardId]!;
      if (card.type !== "program" && card.type !== "hardware") {
        log(state, `Personal Workshop host — not a program or hardware.`);
        return { ok: true };
      }
      state.runner.hand = state.runner.hand.filter((id) => id !== action.cardId);
      card.hostId = sourceId;
      card.faceup = true;
      card.zone = `hosted:${sourceId}`;
      card.powerCounters = Math.max(0, card.installCost ?? 0);
      if (!source.hostedCardIds) source.hostedCardIds = [];
      source.hostedCardIds.push(action.cardId);
      log(
        state,
        `${source.title} hosts ${card.title} with ${card.powerCounters} power (install cost).`,
      );
      if ((card.powerCounters ?? 0) <= 0) {
        return applyPrimitive(ctx, {
          kind: "install_hosted_card_ignore_costs",
          cardId: action.cardId,
        });
      }
      return { ok: true };
    }
    case "remove_power_from_hosted_card_install_at_zero_ignore_costs": {
      const hosted = (source.hostedCardIds ?? []).filter(
        (id) => (state.cards[id]?.powerCounters ?? 0) > 0,
      );
      if (hosted.length === 0) {
        log(state, `${source.title} — no hosted card with power counters.`);
        return { ok: true };
      }
      if (hosted.length === 1) {
        return applyPrimitive(ctx, {
          kind: "remove_power_from_hosted_card_id_install_at_zero",
          cardId: hosted[0]!,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: hosted.map((cardId) => ({
          id: `pw-remove:${cardId}`,
          label: `Remove 1 power from ${state.cards[cardId]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "remove_power_from_hosted_card_id_install_at_zero" as const,
              cardId,
            },
          },
        })),
      };
      log(state, `${source.title} — choose a hosted card to remove 1 power.`);
      return { ok: true };
    }
    case "remove_power_from_hosted_card_id_install_at_zero": {
      const card = state.cards[action.cardId];
      if (
        !card ||
        !(source.hostedCardIds ?? []).includes(action.cardId) ||
        (card.powerCounters ?? 0) < 1
      ) {
        log(state, `${source.title} — cannot remove power from that card.`);
        return { ok: true };
      }
      card.powerCounters = (card.powerCounters ?? 0) - 1;
      log(
        state,
        `Remove 1 power from ${card.title} → ${card.powerCounters}.`,
      );
      if ((card.powerCounters ?? 0) <= 0) {
        return applyPrimitive(ctx, {
          kind: "install_hosted_card_ignore_costs",
          cardId: action.cardId,
        });
      }
      return { ok: true };
    }
    case "install_hosted_card_ignore_costs": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (
        !card ||
        (card.type !== "program" && card.type !== "hardware") ||
        !(source.hostedCardIds ?? []).includes(cardId)
      ) {
        log(state, `install_hosted_card_ignore_costs — invalid hosted card.`);
        return { ok: true };
      }
      if (card.type === "program") {
        const need = effectiveMemoryCost(state, cardId);
        if (usedMemory(state) + need > memoryLimit(state)) {
          log(state, `install_hosted_card_ignore_costs — insufficient MU.`);
          return { ok: true };
        }
      }
      source.hostedCardIds = (source.hostedCardIds ?? []).filter(
        (id) => id !== cardId,
      );
      card.hostId = undefined;
      card.powerCounters = undefined;
      card.zone = "runner:rig";
      card.faceup = true;
      state.runner.rig.push(cardId);
      noteVirusProgramInstalled(state, cardId);
      noteProgramOrHardwareInstalled(state, cardId);
      log(state, `Install hosted ${card.title} ignoring all costs.`);
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "may_pay_credits_for_core_damage_per_ice_protecting_this_server": {
      const server = serverHostingCard(state, sourceId);
      const iceCount = server?.ice.length ?? 0;
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      if (iceCount > 0 && state.corp.credits >= action.amount) {
        options.push({
          id: "pay",
          label: `Pay ${action.amount}¢: do ${iceCount} core damage`,
          effect: {
            op: "seq",
            effects: [
              {
                op: "do",
                action: {
                  kind: "lose_credits",
                  side: "corp",
                  amount: action.amount,
                },
              },
              {
                op: "do",
                action: {
                  kind: "core_damage",
                  amount: iceCount,
                  interactive: true,
                  preventByLoseAllClicks: true,
                },
              },
            ],
          },
        });
      }
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(
        state,
        `${source.title} — may pay ${action.amount}¢ to do ${iceCount} core damage (ice protecting server).`,
      );
      return { ok: true };
    }
    case "choose_server_rearrange_ice": {
      const servers = Object.values(state.servers).filter(
        (s) => s.ice.length >= 2,
      );
      if (servers.length === 0) {
        log(state, `${source.title} — no server with 2+ ice to rearrange.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: servers.map((s) => ({
          id: `sunset:${s.id}`,
          label: `Rearrange ice protecting ${s.id}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "rearrange_server_ice" as const,
              serverId: s.id,
              order: [],
            },
          },
        })),
      };
      log(state, `${source.title} — choose a server to rearrange ice.`);
      return { ok: true };
    }
    case "rearrange_server_ice": {
      const serverId = action.serverId;
      const server = state.servers[serverId];
      if (!server) {
        log(state, `rearrange_server_ice — unknown server.`);
        return { ok: true };
      }
      const placed: string[] = [...(action.order ?? [])];
      const remaining: string[] = server.ice.filter(
        (id: string) => !placed.includes(id),
      );
      if (remaining.length === 0) {
        server.ice = placed;
        for (let i = 0; i < placed.length; i++) {
          const c = state.cards[placed[i]!];
          if (c) c.zone = `server:${serverId}:ice`;
        }
        log(
          state,
          `${source.title} — rearranged ice on ${serverId}: ${placed
            .map((id: string) => state.cards[id]?.title ?? id)
            .join(" → ")}.`,
        );
        return { ok: true };
      }
      if (remaining.length === 1) {
        return applyPrimitive(ctx, {
          kind: "rearrange_server_ice",
          serverId,
          order: [...placed, remaining[0]!],
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: remaining.map((iceId: string) => ({
          id: `ice-order:${iceId}`,
          label: `Next (outer→inner): ${state.cards[iceId]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "rearrange_server_ice" as const,
              serverId,
              order: [...placed, iceId],
            },
          },
        })),
      };
      log(
        state,
        `${source.title} — choose next ice position (${placed.length + 1}/${server.ice.length}).`,
      );
      return { ok: true };
    }
    case "choose_ice_gain_credits_per_advancement": {
      const iceIds: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) iceIds.push(id);
      }
      if (iceIds.length === 0) {
        log(state, `${source.title} — no installed ice.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: iceIds.map((iceId) => {
          const ice = state.cards[iceId]!;
          const n = ice.advancementTokens ?? 0;
          return {
            id: `comm:${iceId}`,
            label: `Gain ${n}¢ from ${ice.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits_from_ice_advancements" as const,
                iceId,
              },
            },
          };
        }),
      };
      log(
        state,
        `${source.title} — choose ice; gain ¢ equal to advancements.`,
      );
      return { ok: true };
    }
    case "gain_credits_from_ice_advancements": {
      const ice = state.cards[action.iceId];
      if (!ice || ice.type !== "ice") {
        log(state, `gain_credits_from_ice_advancements — invalid ice.`);
        return { ok: true };
      }
      const n = ice.advancementTokens ?? 0;
      state.corp.credits += n;
      log(
        state,
        `Corp gains ${n}¢ from advancements on ${ice.title} → ${state.corp.credits}.`,
      );
      return { ok: true };
    }
    case "choose_one_subtype_until_derez": {
      const options = ["barrier", "code gate", "sentry"];
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: options.map((subtype) => ({
          id: `chimera:${subtype}`,
          label: `Gain ${subtype}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "gain_one_subtype_until_derez" as const,
              subtype,
            },
          },
        })),
      };
      log(
        state,
        `${source.title} — choose sentry, code gate, or barrier until derezzed.`,
      );
      return { ok: true };
    }
    case "gain_one_subtype_until_derez": {
      const subtype = action.subtype;
      if (!(source.subtypes ?? []).includes(subtype)) {
        source.subtypes = [...(source.subtypes ?? []), subtype];
      }
      if (!source.lycianGainedSubtypes) source.lycianGainedSubtypes = [];
      if (!source.lycianGainedSubtypes.includes(subtype)) {
        source.lycianGainedSubtypes.push(subtype);
      }
      log(state, `${source.title} gains ${subtype} until derezzed.`);
      return { ok: true };
    }
    case "may_install_from_hq_ignore_costs_then_place_advancements": {
      const amount = Math.max(0, action.amount);
      const installable = state.corp.hand.filter((id) =>
        corpCardInstallable(state.cards[id]?.type ?? ""),
      );
      if (installable.length === 0) {
        log(state, `Install from HQ then advance — no installable card.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-hq-install",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const cardId of installable) {
        const card = state.cards[cardId]!;
        if (card.type === "ice") {
          for (const server of Object.values(state.servers)) {
            options.push({
              id: `hq-install-adv:${cardId}:${server.id}`,
              label: `Install ${card.title} protecting ${server.id}`,
              effect: {
                op: "do",
                action: {
                  kind: "install_hq_card_ignore_costs_then_place_advancements",
                  cardId,
                  serverId: server.id,
                  amount,
                },
              },
            });
          }
        } else {
          for (const server of Object.values(state.servers)) {
            if (server.kind !== "remote") continue;
            options.push({
              id: `hq-install-adv:${cardId}:${server.id}`,
              label: `Install ${card.title} on ${server.id}`,
              effect: {
                op: "do",
                action: {
                  kind: "install_hq_card_ignore_costs_then_place_advancements",
                  cardId,
                  serverId: server.id,
                  amount,
                },
              },
            });
          }
          options.push({
            id: `hq-install-adv:${cardId}:new`,
            label: `Install ${card.title} on new remote`,
            effect: {
              op: "do",
              action: {
                kind: "install_hq_card_ignore_costs_then_place_advancements",
                cardId,
                serverId: "__new_remote__",
                amount,
              },
            },
          });
        }
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(
        state,
        `May install from HQ ignoring costs, then place ${amount} advancement(s).`,
      );
      return { ok: true };
    }
    case "install_hq_card_ignore_costs_then_place_advancements": {
      const installR = applyPrimitive(ctx, {
        kind: "install_hq_card_ignore_costs",
        cardId: action.cardId,
        serverId: action.serverId,
      });
      if (!installR.ok) return installR;
      const amount = Math.max(0, action.amount);
      if (amount <= 0) return { ok: true };
      const installed = state.cards[action.cardId];
      if (!installed || !installed.zone.includes("server:")) {
        log(state, `Place advancements after HQ install — card not installed.`);
        return { ok: true };
      }
      return applyPrimitive(ctx, {
        kind: "place_advancements_on",
        cardId: action.cardId,
        amount,
      });
    }
    case "derez_any_number_then_may_rez_discount_per": {
      return applyPrimitive(ctx, {
        kind: "derez_any_number_continue",
        creditsPerDerezzed: action.creditsPerDerezzed,
        derezzed: 0,
      });
    }
    case "derez_any_number_continue": {
      const per = Math.max(0, action.creditsPerDerezzed);
      let derezzed = Math.max(0, action.derezzed);
      if (action.justDerezzedId) {
        const just = state.cards[action.justDerezzedId];
        if (just?.rezzed) {
          just.rezzed = false;
          just.faceup = false;
          if (just.type === "ice") {
            if (state.run) state.run.iceDerezzedThisRun = true;
            fireHostRezStateTriggers(state, action.justDerezzedId, "derez");
          }
          derezzed += 1;
          log(state, `Derez ${just.title} (${derezzed} total).`);
        }
      }
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.ice, ...server.root]) {
          const c = state.cards[id];
          if (c?.rezzed) targets.push(id);
        }
      }
      const doneFx: Effect = {
        op: "do",
        action: {
          kind: "may_rez_card_with_discount",
          discount: per * derezzed,
        },
      };
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "done-derez-any",
          label: `Done derezzing (${derezzed}; −${per * derezzed}¢ next rez)`,
          effect: doneFx,
        },
        ...targets.map((id) => ({
          id: `derez-any:${id}`,
          label: `Derez ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "derez_any_number_continue" as const,
              creditsPerDerezzed: per,
              derezzed,
              justDerezzedId: id,
            },
          },
        })),
      ];
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(
        state,
        `Divert Power — derez any number (current ${derezzed}), then may rez (−${per}¢ each).`,
      );
      return { ok: true };
    }
    case "may_rez_card_with_discount": {
      const discount = Math.max(0, action.discount);
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.ice, ...server.root]) {
          const c = state.cards[id];
          if (!c || c.rezzed) continue;
          if (c.type !== "ice" && c.type !== "asset" && c.type !== "upgrade") {
            continue;
          }
          targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `May rez with discount — no unrezzed installed cards.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-rez-discount",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
        ...targets.map((id) => {
          const c = state.cards[id]!;
          const pay = Math.max(0, (c.rezCost ?? 0) - discount);
          return {
            id: `rez-discount:${id}`,
            label: `Rez ${c.title} for ${pay}¢ (−${discount})`,
            effect: {
              op: "do" as const,
              action: {
                kind: "rez_card_with_discount" as const,
                cardId: id,
                discount,
              },
            },
          };
        }),
      ];
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(state, `May rez 1 card (−${discount}¢).`);
      return { ok: true };
    }
    case "rez_card_with_discount": {
      const card = state.cards[action.cardId];
      if (
        !card ||
        card.rezzed ||
        (card.type !== "ice" &&
          card.type !== "asset" &&
          card.type !== "upgrade")
      ) {
        log(state, `Rez with discount — invalid or already rezzed.`);
        return { ok: true };
      }
      const pay = Math.max(0, (card.rezCost ?? 0) - action.discount);
      if (state.corp.credits < pay) {
        log(state, `Rez ${card.title} — insufficient credits (${pay}¢).`);
        return { ok: true };
      }
      state.corp.credits -= pay;
      card.rezzed = true;
      card.faceup = true;
      if (card.type === "ice") {
        state.turn.iceRezzedThisTurn += 1;
      }
      if (!state.turn.rezzedThisTurnIds) state.turn.rezzedThisTurnIds = [];
      if (!state.turn.rezzedThisTurnIds.includes(action.cardId)) {
        state.turn.rezzedThisTurnIds.push(action.cardId);
      }
      log(
        state,
        `Rez ${card.title} for ${pay}¢ (−${action.discount}¢ discount).`,
      );
      fireHostRezStateTriggers(state, action.cardId, "rez");
      if (card.type === "ice") {
        fireIceRezDuringRunHooks(state, action.cardId);
        fireOnAnyIceRez(state, action.cardId);
      }
      if (card.onRez) {
        const r = evalEffect({ state, sourceId: action.cardId }, card.onRez);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "add_agenda_from_hq_to_score_worth_exact_hosted_power": {
      const pts = source.powerCounters ?? 0;
      const candidates = state.corp.hand.filter(
        (id) => state.cards[id]?.type === "agenda",
      );
      if (candidates.length === 0) {
        log(state, `${source.title} — no agenda in HQ to add to score.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: candidates.map((id) => ({
          id: `lady-liberty:${id}`,
          label: `Add ${state.cards[id]!.title} worth ${pts} AP`,
          effect: {
            op: "do" as const,
            action: {
              kind: "add_hq_agenda_to_score_with_agenda_points" as const,
              cardId: id,
              agendaPoints: pts,
            },
          },
        })),
      };
      log(
        state,
        `${source.title} — add an HQ agenda worth ${pts} AP (hosted power).`,
      );
      return { ok: true };
    }
    case "add_hq_agenda_to_score_with_agenda_points": {
      const card = state.cards[action.cardId];
      if (
        !card ||
        card.type !== "agenda" ||
        !state.corp.hand.includes(action.cardId)
      ) {
        log(state, `Add HQ agenda to score — card not an HQ agenda.`);
        return { ok: true };
      }
      const pts = Math.max(0, action.agendaPoints);
      state.corp.hand = state.corp.hand.filter((id) => id !== action.cardId);
      state.corp.score.push(action.cardId);
      card.zone = "corp:score";
      card.faceup = true;
      card.rezzed = true;
      card.agendaPoints = pts;
      state.turn.agendaPointsScoredThisTurn += pts;
      log(
        state,
        `Add ${card.title} from HQ to Corp score area (${pts} AP).`,
      );
      checkWinConditions(state);
      return { ok: true };
    }
    case "gain_credits_equal_to_rd_accesses_this_run": {
      const n = state.run?.accessedCardIds?.length ?? 0;
      if (n <= 0) {
        log(state, `${source.title} — no R&D accesses this run.`);
        return { ok: true };
      }
      state.runner.credits += n;
      log(
        state,
        `${source.title} — gain ${n}¢ (${n} R&D access(es)) → ${state.runner.credits}¢.`,
      );
      return { ok: true };
    }
    case "may_place_up_to_advancements_on_remote_root_then_access_unless_pay": {
      const maxAdv = Math.max(0, action.maxAdvancements);
      const credits = Math.max(0, action.credits);
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        if (server.kind !== "remote") continue;
        for (const id of server.root) targets.push(id);
      }
      if (targets.length === 0 || maxAdv <= 0) {
        log(state, `${source.title} — no remote-root card to advance.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-otoroshi",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const cardId of targets) {
        const title = state.cards[cardId]!.title;
        for (let n = 1; n <= maxAdv; n++) {
          options.push({
            id: `otoroshi:${cardId}:${n}`,
            label: `Place ${n} advancement(s) on ${title}`,
            effect: {
              op: "do",
              action: {
                kind: "place_advancements_then_access_unless_pay",
                cardId,
                amount: n,
                credits,
              },
            },
          });
        }
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(
        state,
        `${source.title} — may place up to ${maxAdv} advancements, then Runner accesses unless pays ${credits}¢.`,
      );
      return { ok: true };
    }
    case "place_advancements_then_access_unless_pay": {
      const placeR = applyPrimitive(ctx, {
        kind: "place_advancements_on",
        cardId: action.cardId,
        amount: action.amount,
      });
      if (!placeR.ok) return placeR;
      const credits = Math.max(0, action.credits);
      const title = state.cards[action.cardId]?.title ?? action.cardId;
      if (credits > 0 && state.runner.credits >= credits) {
        state.pendingChoice = {
          sourceId,
          chooser: "runner",
          options: [
            {
              id: "pay-avoid-access",
              label: `Pay ${credits}¢ (avoid access)`,
              effect: {
                op: "do",
                action: {
                  kind: "lose_credits",
                  side: "runner",
                  amount: credits,
                },
              },
            },
            {
              id: "access-card",
              label: `Access ${title}`,
              effect: {
                op: "do",
                action: {
                  kind: "access_installed_card",
                  cardId: action.cardId,
                },
              },
            },
          ],
        };
        log(
          state,
          `Runner accesses ${title} unless they pay ${credits}¢.`,
        );
        return { ok: true };
      }
      return applyPrimitive(ctx, {
        kind: "access_installed_card",
        cardId: action.cardId,
      });
    }
    case "access_installed_card": {
      if (!state.run) {
        log(state, `Access installed card — no active run.`);
        return { ok: true };
      }
      const card = state.cards[action.cardId];
      if (!card || !card.zone.includes(":root")) {
        log(state, `Access installed card — not in a server root.`);
        return { ok: true };
      }
      state.run.accessCandidates = [action.cardId];
      state.run.accessRemaining = 1;
      state.run.accessCandidatesPreset = true;
      state.run.skipBreach = false;
      log(
        state,
        `${source.title} — Runner accesses ${card.title}.`,
      );
      return { ok: true };
    }
    case "host_on_ice_as_condition": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (state.cards[id]?.type === "ice") targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `${source.title} — no ice to host on.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `host-cond:${id}`,
          label: `Host on ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "host_on_ice_as_condition_on" as const,
              iceId: id,
            },
          },
        })),
      };
      log(state, `${source.title} — choose ice to host as condition counter.`);
      return { ok: true };
    }
    case "host_on_ice_as_condition_on": {
      const ice = state.cards[action.iceId];
      if (!ice || ice.type !== "ice") {
        log(state, `Host as condition — invalid ice.`);
        return { ok: true };
      }
      removeCardFromCurrentZone(state, sourceId);
      source.hostId = action.iceId;
      source.zone = `hosted:${action.iceId}`;
      source.faceup = true;
      source.rezzed = true;
      if (!ice.hostedCardIds) ice.hostedCardIds = [];
      if (!ice.hostedCardIds.includes(sourceId)) ice.hostedCardIds.push(sourceId);
      log(
        state,
        `Host ${source.title} on ${ice.title} as a condition counter.`,
      );
      return { ok: true };
    }
    case "add_power_counter_equal_to_last_access_trash_cost": {
      const n = Math.max(0, state.turn.lastAccessTrashCost ?? 0);
      if (n <= 0) {
        log(state, `${source.title} — trash cost 0; no power placed.`);
        return { ok: true };
      }
      source.powerCounters = (source.powerCounters ?? 0) + n;
      log(
        state,
        `${source.title} — place ${n} power (access trash cost) → ${source.powerCounters}.`,
      );
      return { ok: true };
    }
    case "install_up_to_from_heap_facedown": {
      return applyPrimitive(ctx, {
        kind: "install_up_to_from_heap_facedown_continue",
        remaining: Math.max(0, action.max),
      });
    }
    case "install_up_to_from_heap_facedown_continue": {
      let remaining = Math.max(0, action.remaining);
      if (action.justInstalledId) {
        const id = action.justInstalledId;
        const idx = state.runner.discard.indexOf(id);
        if (idx >= 0) {
          state.runner.discard.splice(idx, 1);
          state.runner.rig.push(id);
          const card = state.cards[id]!;
          card.zone = "runner:rig";
          card.faceup = false;
          card.rezzed = false;
          noteInstalledThisTurn(state, id);
          remaining = Math.max(0, remaining - 1);
          log(
            state,
            `Install ${card.title} from heap facedown (${remaining} remaining).`,
          );
        }
      }
      if (remaining <= 0 || state.runner.discard.length === 0) {
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "done-heap-facedown",
            label: "Done",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
          ...state.runner.discard.map((id) => ({
            id: `heap-fd:${id}`,
            label: `Install ${state.cards[id]!.title} facedown`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_up_to_from_heap_facedown_continue" as const,
                remaining,
                justInstalledId: id,
              },
            },
          })),
        ],
      };
      log(
        state,
        `Install up to ${remaining} more from heap facedown.`,
      );
      return { ok: true };
    }
    case "fast_break_equal_to_runner_scored_agendas": {
      const x = state.runner.score.length;
      state.corp.credits += x;
      log(
        state,
        `${source.title} — gain ${x}¢ (X = Runner scored agendas).`,
      );
      const drew = applyPrimitive(ctx, {
        kind: "draw_up_to",
        side: "corp",
        amount: x,
      });
      if (!drew.ok) return drew;
      if (x <= 0) {
        log(state, `${source.title} — X is 0; no installs.`);
        return { ok: true };
      }
      return applyPrimitive(ctx, {
        kind: "fast_break_choose_remote",
        remaining: x,
      });
    }
    case "fast_break_choose_remote": {
      const remaining = Math.max(0, action.remaining);
      if (remaining <= 0) return { ok: true };
      const installable = state.corp.hand.filter((id) => {
        const t = state.cards[id]?.type;
        if (t !== "agenda" && t !== "asset" && t !== "upgrade" && t !== "ice") {
          return false;
        }
        return (
          creditsAvailableForInstall(state, "corp") >=
          (state.cards[id]!.installCost ?? 0)
        );
      });
      if (installable.length === 0) {
        log(state, `${source.title} — no affordable HQ cards to install.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "done-fast-break",
          label: "Done (no installs)",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const server of Object.values(state.servers)) {
        if (server.kind !== "remote") continue;
        options.push({
          id: `fb-remote:${server.id}`,
          label: `Install into/protecting ${server.id}`,
          effect: {
            op: "do",
            action: {
              kind: "fast_break_install_continue",
              remaining,
              serverId: server.id,
            },
          },
        });
      }
      options.push({
        id: "fb-remote:new",
        label: "Install into/protecting a new remote",
        effect: {
          op: "do",
          action: {
            kind: "fast_break_install_continue",
            remaining,
            serverId: "__new_remote__",
          },
        },
      });
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options,
      };
      log(
        state,
        `${source.title} — choose a single remote for up to ${remaining} install(s).`,
      );
      return { ok: true };
    }
    case "fast_break_install_continue": {
      let remaining = Math.max(0, action.remaining);
      let serverId = action.serverId;
      if (serverId === "__new_remote__" && !action.justInstalledId) {
        const remoteNum = state.nextRemoteNumber++;
        const sid = `remote-${remoteNum}` as import("../state/types.js").ServerId;
        serverId = sid;
        state.servers[sid] = {
          id: sid,
          kind: "remote",
          ice: [],
          root: [],
        };
        log(state, `Create ${sid} for Fast Break installs.`);
      }
      if (action.justInstalledId) {
        const id = action.justInstalledId;
        const card = state.cards[id];
        if (card && state.corp.hand.includes(id)) {
          const cost = card.installCost ?? 0;
          if (creditsAvailableForInstall(state, "corp") >= cost) {
            spendCreditsForInstall(state, "corp", cost);
            state.corp.hand = state.corp.hand.filter((cid) => cid !== id);
            const dest = state.servers[serverId as import("../state/types.js").ServerId];
            if (dest) {
              if (action.asIce || card.type === "ice") {
                dest.ice.unshift(id);
                card.zone = `server:${serverId}:ice`;
              } else {
                dest.root.push(id);
                card.zone = `server:${serverId}:root`;
              }
              card.rezzed = false;
              card.faceup = false;
              if (card.type === "agenda" || card.type === "asset") {
                card.advancementTokens = card.advancementTokens ?? 0;
              }
              noteInstalledThisTurn(state, id);
              state.turn.corpInstalledFromHqThisTurn = true;
              remaining = Math.max(0, remaining - 1);
              log(
                state,
                `Install ${card.title} from HQ on ${serverId} for ${cost}¢ (${remaining} remaining).`,
              );
              if (card.onInstall) {
                const r = evalEffect({ state, sourceId: id }, card.onInstall);
                if (!r.ok) return r;
              }
            }
          }
        }
      }
      if (remaining <= 0) return { ok: true };
      const dest = state.servers[serverId as import("../state/types.js").ServerId];
      if (!dest || dest.kind !== "remote") {
        log(state, `Fast Break install — invalid remote ${serverId}.`);
        return { ok: true };
      }
      const rootCards = state.corp.hand.filter((id) => {
        const t = state.cards[id]?.type;
        if (t !== "agenda" && t !== "asset" && t !== "upgrade") return false;
        return (
          creditsAvailableForInstall(state, "corp") >=
          (state.cards[id]!.installCost ?? 0)
        );
      });
      const iceCards = state.corp.hand.filter((id) => {
        if (state.cards[id]?.type !== "ice") return false;
        return (
          creditsAvailableForInstall(state, "corp") >=
          (state.cards[id]!.installCost ?? 0)
        );
      });
      if (rootCards.length === 0 && iceCards.length === 0) {
        log(state, `Fast Break — no more affordable HQ cards.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "done-fb-install",
            label: "Done",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...rootCards.map((id) => ({
            id: `fb-root:${id}`,
            label: `Install ${state.cards[id]!.title} in root for ${state.cards[id]!.installCost ?? 0}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "fast_break_install_continue" as const,
                remaining,
                serverId,
                justInstalledId: id,
                asIce: false,
              },
            },
          })),
          ...iceCards.map((id) => ({
            id: `fb-ice:${id}`,
            label: `Install ${state.cards[id]!.title} protecting for ${state.cards[id]!.installCost ?? 0}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "fast_break_install_continue" as const,
                remaining,
                serverId,
                justInstalledId: id,
                asIce: true,
              },
            },
          })),
        ],
      };
      log(
        state,
        `Fast Break — install up to ${remaining} more into/protecting ${serverId}.`,
      );
      return { ok: true };
    }
    case "install_from_hq_on_remote_root_place_advancement_cannot_score_or_rez_until_next_corp_turn": {
      const amount = Math.max(0, action.amount);
      const installable = state.corp.hand.filter((id) => {
        const t = state.cards[id]?.type;
        if (t !== "agenda" && t !== "asset" && t !== "upgrade") return false;
        return (
          creditsAvailableForInstall(state, "corp") >=
          (state.cards[id]!.installCost ?? 0)
        );
      });
      if (installable.length === 0) {
        log(state, `${source.title} — no affordable root card in HQ.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (const cardId of installable) {
        const card = state.cards[cardId]!;
        const cost = card.installCost ?? 0;
        for (const server of Object.values(state.servers)) {
          if (server.kind !== "remote") continue;
          options.push({
            id: `saraswati:${cardId}:${server.id}`,
            label: `Install ${card.title} on ${server.id} for ${cost}¢`,
            effect: {
              op: "do",
              action: {
                kind: "install_hq_remote_root_place_adv_lock_until_next_corp_turn",
                cardId,
                serverId: server.id,
                amount,
              },
            },
          });
        }
        options.push({
          id: `saraswati:${cardId}:new`,
          label: `Install ${card.title} on new remote for ${cost}¢`,
          effect: {
            op: "do",
            action: {
              kind: "install_hq_remote_root_place_adv_lock_until_next_corp_turn",
              cardId,
              serverId: "__new_remote__",
              amount,
            },
          },
        });
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(
        state,
        `${source.title} — install from HQ on a remote root (pay costs), place ${amount} advancement(s), lock until next Corp turn.`,
      );
      return { ok: true };
    }
    case "install_hq_remote_root_place_adv_lock_until_next_corp_turn": {
      const card = state.cards[action.cardId];
      if (!card || !state.corp.hand.includes(action.cardId)) {
        log(state, `Saraswati — card not in HQ.`);
        return { ok: true };
      }
      const cost = card.installCost ?? 0;
      if (creditsAvailableForInstall(state, "corp") < cost) {
        log(state, `Saraswati — cannot afford ${cost}¢.`);
        return { ok: true };
      }
      spendCreditsForInstall(state, "corp", cost);
      const destId = resolveInstallServerId(state, action.serverId);
      const dest = destId ? state.servers[destId] : null;
      if (!dest || dest.kind !== "remote") {
        log(state, `Saraswati — invalid remote.`);
        return { ok: true };
      }
      state.corp.hand = state.corp.hand.filter((id) => id !== action.cardId);
      dest.root.push(action.cardId);
      card.zone = `server:${destId}:root`;
      card.rezzed = false;
      card.faceup = false;
      if (card.type === "agenda" || card.type === "asset") {
        card.advancementTokens = card.advancementTokens ?? 0;
      }
      noteInstalledThisTurn(state, action.cardId);
      state.turn.corpInstalledFromHqThisTurn = true;
      log(
        state,
        `Install ${card.title} from HQ on ${destId} for ${cost}¢.`,
      );
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: action.cardId }, card.onInstall);
        if (!r.ok) return r;
      }
      const amount = Math.max(0, action.amount);
      if (amount > 0) {
        const placeR = applyPrimitive(ctx, {
          kind: "place_advancements_on",
          cardId: action.cardId,
          amount,
        });
        if (!placeR.ok) return placeR;
      }
      if (!state.cannotScoreOrRezUntilNextCorpTurnCardIds) {
        state.cannotScoreOrRezUntilNextCorpTurnCardIds = [];
      }
      if (
        !state.cannotScoreOrRezUntilNextCorpTurnCardIds.includes(action.cardId)
      ) {
        state.cannotScoreOrRezUntilNextCorpTurnCardIds.push(action.cardId);
      }
      log(
        state,
        `${card.title} cannot be scored or rezzed until Corp's next turn begins.`,
      );
      return { ok: true };
    }
    case "end_the_run_unless_runner_spends_clicks": {
      const amount = Math.max(0, action.amount);
      if (amount <= 0) return { ok: true };
      if (state.runner.clicks < amount) {
        log(
          state,
          `Runner cannot spend ${amount} [click] — end the run (CR ${CR.nestedCostUnless.number}).`,
        );
        return applyPrimitive(ctx, { kind: "end_the_run" });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "runner-spend-clicks-nested",
            label: `Spend ${amount} [click]`,
            effect: {
              op: "do",
              action: {
                kind: "lose_clicks",
                side: "runner",
                amount,
              },
            },
          },
          {
            id: "etr-unless-runner-clicks",
            label: "End the run",
            effect: {
              op: "do",
              action: { kind: "end_the_run" },
            },
          },
        ],
      };
      log(
        state,
        `End the run unless the Runner spends ${amount} [click] (CR ${CR.nestedCostUnless.number}).`,
      );
      return { ok: true };
    }
    case "end_the_run_unless_take_tags": {
      const amount = Math.max(0, action.amount);
      // Nested cost: take N tags. Unpayable when a static/mandatory interrupt
      // would prevent that payment (CR 1.16.1b / Funhouse×Jesminder).
      if (
        amount > 0 &&
        !canPayTakeTagsNestedCost(state, amount)
      ) {
        log(
          state,
          `Cannot take ${amount} tag(s) as nested cost — end the run (CR ${CR.costInterruptStaticMandatory.number} / ${CR.nestedCostUnless.number}).`,
        );
        return applyPrimitive(ctx, { kind: "end_the_run" });
      }
      if (amount <= 0) {
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "take-tags-nested",
            label: `Take ${amount} tag(s)`,
            effect: {
              op: "do",
              action: { kind: "give_tags", amount },
            },
          },
          {
            id: "etr-unless-tags",
            label: "End the run",
            effect: {
              op: "do",
              action: { kind: "end_the_run" },
            },
          },
        ],
      };
      log(
        state,
        `End the run unless the Runner takes ${amount} tag(s) (CR ${CR.nestedCostUnless.number}).`,
      );
      return { ok: true };
    }
    case "end_the_run_unless_net_damage": {
      const amount = Math.max(0, action.amount);
      if (amount <= 0) {
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "suffer-net",
            label: `Suffer ${amount} net damage`,
            effect: {
              op: "do",
              action: { kind: "net_damage", amount },
            },
          },
          {
            id: "etr-unless-net",
            label: "End the run",
            effect: {
              op: "do",
              action: { kind: "end_the_run" },
            },
          },
        ],
      };
      log(
        state,
        `End the run unless the Runner suffers ${amount} net damage (CR ${CR.nestedCostUnless.number}).`,
      );
      return { ok: true };
    }
    case "burner_resolve": {
      const revealN = Math.min(
        Math.max(0, action.reveal),
        state.corp.hand.length,
      );
      // v0 deterministic "random": first N cards in HQ order.
      const revealed = state.corp.hand.slice(0, revealN);
      for (const id of revealed) {
        state.cards[id]!.faceup = true;
        log(state, `Reveal ${state.cards[id]!.title} from HQ.`);
      }
      const moves = Math.min(Math.max(0, action.move), revealed.length);
      return offerBurnerMoves(state, sourceId, revealed, moves);
    }
    case "burner_place": {
      const id = action.cardId;
      if (!state.corp.hand.includes(id)) {
        log(state, `Burner place — card not in HQ.`);
        return offerBurnerMoves(
          state,
          sourceId,
          action.revealed,
          action.movesLeft,
        );
      }
      removeCardFromCurrentZone(state, id);
      state.cards[id]!.faceup = false;
      if (action.position === "top") {
        state.corp.deck.unshift(id);
      } else {
        state.corp.deck.push(id);
      }
      state.cards[id]!.zone = "corp:rd";
      log(
        state,
        `${state.cards[id]!.title} moved from HQ to ${action.position} of R&D.`,
      );
      return offerBurnerMoves(
        state,
        sourceId,
        action.revealed,
        action.movesLeft,
      );
    }
    case "set_run_skip_breach": {
      if (!state.run) {
        log(state, `set_run_skip_breach — no active run.`);
        return { ok: true };
      }
      state.run.skipBreach = true;
      log(state, `${source.title} — skip breach this run.`);
      return { ok: true };
    }
    case "breach_server_standalone": {
      const server = action.server as import("../state/types.js").ServerId;
      if (state.run && !state.run.isPostRunBreach) {
        state.run.breachWhenRunEnds = server;
        if (action.cannotAccessRoot) {
          state.run.cannotAccessRoot = true;
        }
        log(
          state,
          `${source.title} — breach ${server} when the run ends.`,
        );
        return { ok: true };
      }
      state.pendingStandaloneBreach = {
        sourceId,
        serverId: server,
        ...(action.cannotAccessRoot ? { cannotAccessRoot: true } : {}),
      };
      log(
        state,
        `${source.title} — pending standalone breach of ${server}.`,
      );
      return { ok: true };
    }
    case "queue_breaches_after_current": {
      if (!state.run) {
        log(state, `queue_breaches_after_current — no active run.`);
        return { ok: true };
      }
      if (!state.run.queuedBreachesAfterCurrent) {
        state.run.queuedBreachesAfterCurrent = [];
      }
      for (const server of action.servers) {
        state.run.queuedBreachesAfterCurrent.push({
          server: server as import("../state/types.js").ServerId,
          ...(action.cannotAccessRoot ? { cannotAccessRoot: true } : {}),
        });
      }
      log(
        state,
        `${source.title} — queue breaches after current: ${action.servers.join(
          ", ",
        )}${action.cannotAccessRoot ? " (cannot access root)" : ""}.`,
      );
      return { ok: true };
    }
    case "reveal_agenda_hq_or_archives_gain_ap_shuffle": {
      const agendas: string[] = [];
      for (const id of state.corp.hand) {
        if (state.cards[id]?.type === "agenda") agendas.push(id);
      }
      for (const id of state.corp.discard) {
        if (state.cards[id]?.type === "agenda") agendas.push(id);
      }
      if (agendas.length === 0) {
        log(state, `${source.title} — no agenda in HQ or Archives to reveal.`);
        return { ok: true };
      }
      const finish = (cardId: string): EvalResult => {
        const card = state.cards[cardId];
        if (!card || card.type !== "agenda") {
          log(state, `Reveal agenda — not an agenda.`);
          return { ok: true };
        }
        removeCardFromCurrentZone(state, cardId);
        state.corp.deck.push(cardId);
        card.zone = "corp:rd";
        card.faceup = false;
        card.rezzed = false;
        const ap = card.agendaPoints ?? 0;
        state.corp.credits += ap;
        state.corp.deck.reverse();
        log(
          state,
          `Reveal ${card.title}, gain ${ap}¢ → ${state.corp.credits}¢, shuffle into R&D.`,
        );
        return { ok: true };
      };
      if (agendas.length === 1) return finish(agendas[0]!);
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: agendas.map((id) => ({
          id: `drudge-agenda:${id}`,
          label: `Reveal ${state.cards[id]!.title} (gain ${state.cards[id]!.agendaPoints ?? 0}¢)`,
          effect: {
            op: "do" as const,
            action: {
              kind: "reveal_shuffle_agenda_into_rd" as const,
              cardId: id,
              remainingAfter: 0,
              exclude: [id],
              creditsEach: state.cards[id]!.agendaPoints ?? 0,
            },
          },
        })),
      };
      log(
        state,
        `${source.title} — choose an agenda in HQ or Archives to reveal.`,
      );
      return { ok: true };
    }
    case "muse_search_install_non_daemon": {
      const zones: Array<"stack" | "heap" | "grip"> = [
        "stack",
        "heap",
        "grip",
      ];
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (const zone of zones) {
        if (museEligiblePrograms(state, zone).length === 0) continue;
        options.push({
          id: `zone:${zone}`,
          label: `Search ${zone}`,
          effect: {
            op: "do",
            action: { kind: "muse_search_zone", zone },
          },
        });
      }
      if (options.length === 0) {
        log(state, `${source.title} — no non-daemon programs to search.`);
        return { ok: true };
      }
      if (options.length === 1) {
        return applyPrimitive(ctx, {
          kind: "muse_search_zone",
          zone: options[0]!.id.slice("zone:".length) as
            | "stack"
            | "heap"
            | "grip",
        });
      }
      state.pendingChoice = { sourceId, chooser: "runner", options };
      log(state, `${source.title} — choose zone to search.`);
      return { ok: true };
    }
    case "muse_search_zone": {
      const cands = museEligiblePrograms(state, action.zone);
      if (cands.length === 0) {
        log(state, `Muse — no non-daemon programs in ${action.zone}.`);
        if (action.zone === "stack") shuffleRunnerStack(state);
        return { ok: true };
      }
      if (cands.length === 1) {
        return applyPrimitive(ctx, {
          kind: "muse_install_picked",
          cardId: cands[0]!,
          from: action.zone,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: cands.map((id) => ({
          id: `muse-pick:${id}`,
          label: `Install ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "muse_install_picked" as const,
              cardId: id,
              from: action.zone,
            },
          },
        })),
      };
      log(
        state,
        `Muse — choose non-daemon program from ${action.zone} (${cands.length}).`,
      );
      return { ok: true };
    }
    case "muse_install_picked": {
      const card = state.cards[action.cardId];
      if (!card || !museZoneCards(state, action.from).includes(action.cardId)) {
        log(state, `Muse — picked card missing.`);
        if (action.from === "stack") shuffleRunnerStack(state);
        return { ok: true };
      }
      const isTrojan =
        (card.subtypes ?? []).includes("trojan") || Boolean(card.installOnIce);
      if (isTrojan) {
        const iceIds: string[] = [];
        for (const server of Object.values(state.servers)) {
          iceIds.push(...server.ice);
        }
        if (iceIds.length === 0) {
          log(state, `Muse — no ice to host trojan ${card.title}.`);
          if (action.from === "stack") shuffleRunnerStack(state);
          return { ok: true };
        }
        if (iceIds.length === 1) {
          return applyPrimitive(ctx, {
            kind: "muse_install_on_ice",
            cardId: action.cardId,
            iceId: iceIds[0]!,
            from: action.from,
          });
        }
        state.pendingChoice = {
          sourceId,
          chooser: "runner",
          options: iceIds.map((iceId) => ({
            id: `muse-ice:${iceId}`,
            label: `Host on ${state.cards[iceId]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "muse_install_on_ice" as const,
                cardId: action.cardId,
                iceId,
                from: action.from,
              },
            },
          })),
        };
        log(state, `Muse — choose ice to host ${card.title}.`);
        return { ok: true };
      }
      return applyPrimitive(ctx, {
        kind: "muse_install_on_daemon",
        cardId: action.cardId,
        from: action.from,
      });
    }
    case "muse_install_on_ice": {
      return finishMuseInstall(
        state,
        action.cardId,
        action.from,
        sourceId,
        action.iceId,
        true,
      );
    }
    case "muse_install_on_daemon": {
      return finishMuseInstall(
        state,
        action.cardId,
        action.from,
        sourceId,
        sourceId,
        false,
      );
    }
    case "wizard_chest_resolve": {
      const types: Array<"hardware" | "program" | "resource"> = [
        "hardware",
        "program",
        "resource",
      ];
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: types.map((cardType) => ({
          id: `wizard-type:${cardType}`,
          label: `Choose ${cardType}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "wizard_chest_for_type" as const,
              cardType,
              untilCount: action.untilCount,
              ignoreAllCosts: action.ignoreAllCosts,
            },
          },
        })),
      };
      log(state, `${source.title} — choose card type.`);
      return { ok: true };
    }
    case "wizard_chest_for_type": {
      const aside: string[] = [];
      const matches: string[] = [];
      while (
        state.runner.deck.length > 0 &&
        matches.length < action.untilCount
      ) {
        const id = state.runner.deck.shift()!;
        aside.push(id);
        state.cards[id]!.faceup = true;
        state.cards[id]!.zone = "runner:set-aside";
        if (state.cards[id]!.type === action.cardType) {
          matches.push(id);
        }
      }
      state.runner.setAside = aside;
      log(
        state,
        `${source.title} — set aside ${aside.length} card(s); ${matches.length} ${action.cardType}(s).`,
      );
      if (matches.length === 0) {
        shuffleRunnerSetAsideIntoStack(state);
        return { ok: true };
      }
      const installable = matches.filter((id) =>
        canInstallSetAsideIgnoringCosts(state, id),
      );
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        ...installable.map((id) => ({
          id: `wizard-install:${id}`,
          label: `Install ${state.cards[id]!.title} ignoring all costs`,
          effect: {
            op: "do" as const,
            action: {
              kind: "wizard_chest_install" as const,
              cardId: id,
            },
          },
        })),
        {
          id: "decline",
          label: "Decline",
          effect: {
            op: "do" as const,
            action: { kind: "shuffle_runner_set_aside_into_stack" as const },
          },
        },
      ];
      state.pendingChoice = { sourceId, chooser: "runner", options };
      log(
        state,
        `${source.title} — may install 1 of ${matches.length} ${action.cardType}(s) ignoring costs.`,
      );
      return { ok: true };
    }
    case "wizard_chest_install": {
      return installSetAsideIgnoringCosts(state, action.cardId, sourceId);
    }
    case "check_assassination_win": {
      const n = state.runner.score.filter((id) =>
        (state.cards[id]?.subtypes ?? []).includes("assassination"),
      ).length;
      if (n >= action.amount) {
        state.winner = "runner";
        state.winReason = "runner_alternate";
        state.done = true;
        log(
          state,
          `Runner wins — ${n} assassination agendas (need ${action.amount}).`,
        );
      } else {
        log(
          state,
          `Assassination win check — ${n}/${action.amount} assassination agendas.`,
        );
      }
      checkWinConditions(state);
      return { ok: true };
    }
    case "install_heap_paying_click": {
      const card = state.cards[action.cardId];
      if (!card || !state.runner.discard.includes(action.cardId)) {
        log(state, `install_heap_paying_click — card not in heap.`);
        return { ok: true };
      }
      if (state.runner.clicks < action.clickCost) {
        log(state, `install_heap_paying_click — not enough clicks.`);
        return { ok: true };
      }
      const cost = card.installCost ?? 0;
      if (creditsAvailableForInstall(state, "runner") < cost) {
        log(state, `install_heap_paying_click — cannot afford ${card.title}.`);
        return { ok: true };
      }
      state.runner.clicks -= action.clickCost;
      spendCreditsForInstall(state, "runner", cost);
      state.runner.discard = state.runner.discard.filter(
        (x) => x !== action.cardId,
      );
      state.runner.rig.push(action.cardId);
      card.zone = "runner:rig";
      card.faceup = true;
      if ((card.powerCountersOnInstall ?? 0) > 0) {
        card.powerCounters = card.powerCountersOnInstall;
      }
      noteInstalledThisTurn(state, action.cardId);
      log(
        state,
        `Install ${card.title} from heap for ${action.clickCost}[click] + ${cost}¢.`,
      );
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: action.cardId }, card.onInstall);
        if (!r.ok) return r;
      }
      noteProgramOrHardwareInstalled(state, action.cardId);
      return { ok: true };
    }
    case "trash_self_choose_rezzed_protecting_ice_encounter": {
      // Capture host server before trash (Ganked! leaves the root).
      const host = serverHostingCard(state, sourceId);
      const serverId = host?.id ?? state.run?.attackedServerId;
      releaseHostedCardsOnTrash(state, sourceId);
      removeCardFromCurrentZone(state, sourceId);
      if (source.side === "runner") {
        state.runner.discard.push(sourceId);
        source.zone = "runner:heap";
      } else {
        state.corp.discard.push(sourceId);
        source.zone = "corp:archives";
      }
      source.faceup = true;
      source.rezzed = false;
      log(state, `${source.title} trashed (CR ${CR.trashing.number}).`);
      if (!serverId || !state.run) {
        log(
          state,
          `${source.title} — no server to force encounter after trash.`,
        );
        return { ok: true };
      }
      const server = state.servers[serverId];
      const iceIds = (server?.ice ?? []).filter((id) => {
        const ice = state.cards[id];
        return ice?.type === "ice" && ice.rezzed;
      });
      if (iceIds.length === 0) {
        log(
          state,
          `${source.title} — no rezzed ice protecting ${serverId} to encounter.`,
        );
        return { ok: true };
      }
      if (iceIds.length === 1) {
        return applyPrimitive(ctx, {
          kind: "set_reencounter_ice",
          iceId: iceIds[0]!,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: iceIds.map((id) => ({
          id: `ganked-encounter:${id}`,
          label: `Runner encounters ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: { kind: "set_reencounter_ice" as const, iceId: id },
          },
        })),
      };
      log(
        state,
        `${source.title} — choose rezzed ice protecting ${serverId} for encounter.`,
      );
      return { ok: true };
    }
    case "set_reencounter_ice": {
      if (!state.run) {
        log(state, `set_reencounter_ice — no run.`);
        return { ok: true };
      }
      const ice = state.cards[action.iceId];
      if (!ice || ice.type !== "ice") {
        log(state, `set_reencounter_ice — not ice.`);
        return { ok: true };
      }
      const server = state.servers[state.run.attackedServerId];
      let pos = server?.ice.indexOf(action.iceId) ?? -1;
      // Ice may protect the access source server (same as attacked on central).
      if (pos < 0) {
        for (const s of Object.values(state.servers)) {
          const i = s.ice.indexOf(action.iceId);
          if (i >= 0) {
            pos = i;
            // Forced encounter uses attacked-server position bookkeeping.
            if (s.id === state.run.attackedServerId) break;
          }
        }
      }
      if (pos < 0 || !server?.ice.includes(action.iceId)) {
        // Ice protecting another server (upgrade's host) — still schedule by id.
        const hostServer = serverHostingCard(state, action.iceId);
        if (hostServer) {
          pos = hostServer.ice.indexOf(action.iceId);
        }
      }
      if (pos < 0) {
        log(state, `set_reencounter_ice — ice not installed.`);
        return { ok: true };
      }
      // Prefer attacked-server ice index when present.
      const attacked = state.servers[state.run.attackedServerId];
      const attackedPos = attacked?.ice.indexOf(action.iceId) ?? -1;
      state.run.position = attackedPos >= 0 ? attackedPos : pos;
      state.run.reencounterIceId = action.iceId;
      if (state.run.accessingCardId) {
        state.run.resumeAccessAfterReencounter = true;
      }
      log(
        state,
        `Runner will encounter ${ice.title} (Ganked!/reencounter).`,
      );
      return { ok: true };
    }
    case "may_choose_other_rezzed_ice_encounter_then_resume_source": {
      if (!state.run) {
        log(state, `${source.title} — no run for nested encounter.`);
        return { ok: true };
      }
      const iceIds = Object.values(state.servers).flatMap((s) =>
        s.ice.filter((id) => {
          if (id === sourceId) return false;
          const ice = state.cards[id];
          return ice?.type === "ice" && ice.rezzed;
        }),
      );
      if (iceIds.length === 0) {
        log(state, `${source.title} — no other rezzed ice to encounter.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...iceIds.map((id) => ({
            id: `konjin-encounter:${id}`,
            label: `Runner encounters ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "set_nested_encounter_then_resume_source" as const,
                iceId: id,
              },
            },
          })),
        ],
      };
      log(
        state,
        `${source.title} — may choose another rezzed ice to force encounter.`,
      );
      return { ok: true };
    }
    case "set_nested_encounter_then_resume_source": {
      if (!state.run) {
        log(state, `set_nested_encounter_then_resume_source — no run.`);
        return { ok: true };
      }
      const ice = state.cards[action.iceId];
      if (!ice || ice.type !== "ice" || !ice.rezzed) {
        log(state, `set_nested_encounter_then_resume_source — invalid ice.`);
        return { ok: true };
      }
      if (state.run.encounter) {
        state.run.suspendedEncounter = structuredClone(state.run.encounter);
      }
      state.run.resumeEncounterIceId = sourceId;
      state.run.forceEncounterIceId = action.iceId;
      state.run.reencounterIceId = action.iceId;
      state.run.encounter = null;
      const host = Object.values(state.servers).find((s) =>
        s.ice.includes(action.iceId),
      );
      if (host && host.id === state.run.attackedServerId) {
        state.run.position = host.ice.indexOf(action.iceId);
      }
      log(
        state,
        `Runner will encounter ${ice.title}, then resume ${source.title}.`,
      );
      return { ok: true };
    }
    case "trash_random_from_grip": {
      const n = Math.max(0, action.amount ?? 0);
      if (n <= 0 || state.runner.hand.length === 0) {
        log(state, `Trash random from grip — nothing to trash.`);
        return { ok: true };
      }
      const picks = pickRandomSubset(
        state.runner.hand,
        Math.min(n, state.runner.hand.length),
      );
      for (const id of picks) {
        const title = state.cards[id]!.title;
        trashToHeap(state, id);
        log(
          state,
          `Trash ${title} from grip at random (CR ${CR.trashing.number}).`,
        );
      }
      return { ok: true };
    }
    case "must_trash_own_installed": {
      const rig = [...state.runner.rig];
      if (rig.length === 0) {
        return {
          ok: false,
          error: "Must trash an installed card — none available.",
          cites: [CR.trashing],
        };
      }
      if (rig.length === 1) {
        const id = rig[0]!;
        const title = state.cards[id]!.title;
        trashToHeap(state, id);
        log(
          state,
          `Trash installed ${title} (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: rig.map((id) => ({
          id: `trash-own-installed:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: { kind: "trash_runner_rig_card" as const, cardId: id },
          },
        })),
      };
      log(
        state,
        `${source.title} — Runner must trash 1 installed card (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "look_top_n_stack_peek": {
      const n = Math.max(0, action.amount ?? 0);
      const taken = state.runner.deck.splice(
        0,
        Math.min(n, state.runner.deck.length),
      );
      for (const id of taken) {
        state.cards[id]!.faceup = true;
        log(state, `Runner looks at stack — ${state.cards[id]!.title}.`);
      }
      for (let i = taken.length - 1; i >= 0; i--) {
        const id = taken[i]!;
        state.cards[id]!.faceup = false;
        state.runner.deck.unshift(id);
      }
      log(state, `Return ${taken.length} looked card(s) to top of stack.`);
      return { ok: true };
    }
    case "reveal_top_stack_may_install_program_or_hardware": {
      const top = state.runner.deck[0];
      if (!top) {
        log(state, `Reveal top of stack — empty.`);
        return { ok: true };
      }
      const card = state.cards[top]!;
      card.faceup = true;
      log(state, `Reveal top of stack — ${card.title}.`);
      if (card.type !== "program" && card.type !== "hardware") {
        card.faceup = false;
        log(
          state,
          `${card.title} is not a program or hardware — leave on top.`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "decline-install",
            label: `Leave ${card.title} on top of stack`,
            effect: {
              op: "do" as const,
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
          {
            id: `install-top:${top}`,
            label: `Install ${card.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_stack_card" as const,
                cardId: top,
                discount: 0,
              },
            },
          },
        ],
      };
      log(
        state,
        `${source.title} — may install revealed ${card.title} from stack.`,
      );
      return { ok: true };
    }
    case "register_may_shuffle_title_from_heap_on_successful_run_end": {
      if (!state.run) {
        log(state, `Register heap shuffle — no run.`);
        return { ok: true };
      }
      if (!state.run.mayShuffleTitlesFromHeapOnSuccessfulRunEnd) {
        state.run.mayShuffleTitlesFromHeapOnSuccessfulRunEnd = [];
      }
      state.run.mayShuffleTitlesFromHeapOnSuccessfulRunEnd.push(action.title);
      log(
        state,
        `Register: if this run is successful, may shuffle ${action.title} from heap into stack.`,
      );
      return { ok: true };
    }
    case "may_shuffle_title_from_heap_into_stack": {
      const matches = state.runner.discard.filter(
        (id) => state.cards[id]?.title === action.title,
      );
      if (matches.length === 0) {
        log(
          state,
          `May shuffle ${action.title} from heap — none in heap.`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "decline-shuffle",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
          {
            id: `shuffle-heap:${matches[0]!}`,
            label: `Shuffle ${action.title} from heap into stack`,
            effect: {
              op: "do" as const,
              action: {
                kind: "shuffle_heap_card_into_stack" as const,
                cardId: matches[0]!,
              },
            },
          },
        ],
      };
      log(
        state,
        `May shuffle 1 copy of ${action.title} from heap into stack.`,
      );
      return { ok: true };
    }
    case "shuffle_heap_card_into_stack": {
      const id = action.cardId;
      if (!state.runner.discard.includes(id)) {
        log(state, `Shuffle heap card — not in heap.`);
        return { ok: true };
      }
      state.runner.discard = state.runner.discard.filter((x) => x !== id);
      state.runner.deck.push(id);
      state.cards[id]!.zone = "runner:stack";
      state.cards[id]!.faceup = false;
      shuffleRunnerStack(state);
      log(
        state,
        `Shuffle ${state.cards[id]!.title} from heap into stack.`,
      );
      return { ok: true };
    }
    case "expert_schedule_analyzer_may_instead_of_breach": {
      if (!state.run || state.run.attackedServerId !== "hq") {
        log(state, `${source.title} — no successful HQ run to replace.`);
        return { ok: true };
      }
      const titles = state.corp.hand.map((id) => state.cards[id]!.title);
      log(
        state,
        `${source.title} — reveal HQ (${titles.length}): ${titles.join(", ") || "empty"}; skip breach.`,
      );
      state.run.skipBreach = true;
      return { ok: true };
    }
    case "reveal_top_rd_corp_may_draw": {
      if (state.corp.deck.length === 0) {
        log(state, `${source.title} — R&D empty.`);
        return { ok: true };
      }
      const topId = state.corp.deck[state.corp.deck.length - 1]!;
      const top = state.cards[topId]!;
      top.faceup = true;
      log(state, `${source.title} — reveal top of R&D: ${top.title}.`);
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "draw",
            label: `Draw ${top.title}`,
            effect: {
              op: "do",
              action: { kind: "draw_top_rd_to_hand" as const },
            },
          },
          {
            id: "decline",
            label: "Leave on top",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
        ],
      };
      return { ok: true };
    }
    case "draw_top_rd_to_hand": {
      if (state.corp.deck.length === 0) return { ok: true };
      const id = state.corp.deck.pop()!;
      state.corp.hand.push(id);
      const card = state.cards[id]!;
      card.zone = "corp:hq";
      card.faceup = false;
      log(state, `Corp draws ${card.title}.`);
      return { ok: true };
    }
    case "raymond_flint_breach_hq_no_root": {
      return applyPrimitive(ctx, {
        kind: "begin_replace_breach_hq_hand_only",
      });
    }
    case "begin_replace_breach_hq_hand_only": {
      if (!state.run) {
        log(
          state,
          `${source.title} — breach HQ (hand only) deferred until a run begins.`,
        );
        state.turn.pendingRaymondFlintHandOnlyHqBreach = true;
        return { ok: true };
      }
      state.run.attackedServerId = "hq";
      state.run.skipBreach = false;
      state.run.accessCandidates = [...state.corp.hand];
      state.run.accessRemaining =
        state.run.accessCandidates.length > 0 ? 1 : 0;
      state.run.accessCandidatesPreset = true;
      state.run.forbiddenAccessCardIds = [
        ...(state.servers.hq?.root ?? []),
      ];
      log(
        state,
        `${source.title} — breach HQ (hand only; root inaccessible).`,
      );
      return { ok: true };
    }
    case "cap_run_access_remaining": {
      if (!state.run) return { ok: true };
      const max = action.max;
      if (state.run.accessRemaining === null) {
        state.run.accessRemaining = max;
      } else {
        state.run.accessRemaining = Math.min(state.run.accessRemaining, max);
      }
      log(
        state,
        `${source.title} — access capped at ${state.run.accessRemaining} card(s) this run.`,
      );
      return { ok: true };
    }
    case "break_subroutine_on_self": {
      if (!state.run?.encounter) {
        return { ok: false, error: "No ice encounter.", cites: [] };
      }
      const iceId = state.run.encounter.iceId;
      if (sourceId !== iceId) {
        return {
          ok: false,
          error: "Can only break subroutines on this ice.",
          cites: [],
        };
      }
      const broken = state.run.encounter.broken ?? [];
      const idx = broken.findIndex((b) => !b);
      if (idx < 0) {
        log(state, `${source.title} — no unbroken subroutines.`);
        return { ok: true };
      }
      broken[idx] = true;
      state.run.encounter.broken = broken;
      log(state, `${source.title} — Runner breaks 1 subroutine.`);
      return { ok: true };
    }
    case "accelerated_diagnostics": {
      const n = 3;
      const looked: string[] = [];
      for (let i = 0; i < n && state.corp.deck.length > 0; i++) {
        looked.push(state.corp.deck.pop()!);
      }
      for (const id of looked) {
        state.cards[id]!.faceup = true;
      }
      log(
        state,
        `Accelerated Diagnostics — look top ${looked.length}: ${looked.map((id) => state.cards[id]!.title).join(", ") || "none"}.`,
      );
      for (const id of [...looked]) {
        const card = state.cards[id]!;
        if (card.type === "operation") {
          log(state, `Play ${card.title} from looked cards (ignore additional costs).`);
          state.corp.hand.push(id);
          card.zone = "corp:hq";
          card.faceup = false;
          const r = applyPrimitive(ctx, {
            kind: "play_hq_operation_paying_costs",
            cardId: id,
          });
          if (!r.ok) return r;
          looked.splice(looked.indexOf(id), 1);
        }
      }
      for (const id of looked) {
        if (state.corp.deck.includes(id)) {
          state.corp.deck = state.corp.deck.filter((x) => x !== id);
        }
        trashCorpCardToArchives(state, id);
        log(state, `Trash looked ${state.cards[id]?.title ?? id}.`);
      }
      return { ok: true };
    }
    case "unorthodox_predictions_on_score": {
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: ["sentry", "code gate", "barrier"].map((subtype) => ({
          id: `unorthodox:${subtype}`,
          label: subtype,
          effect: {
            op: "do" as const,
            action: {
              kind: "unorthodox_predictions_lock_subtype" as const,
              subtype,
            },
          },
        })),
      };
      log(state, `${source.title} — choose ice subtype to lock breaks until your next turn.`);
      return { ok: true };
    }
    case "unorthodox_predictions_lock_subtype": {
      state.turn.forbidBreakIceSubtypesUntilCorpTurnEnd = [
        action.subtype,
      ];
      log(
        state,
        `Unorthodox Predictions — cannot break ${action.subtype} subroutines until start of Corp next turn.`,
      );
      return { ok: true };
    }
    case "reveal_grip": {
      const titles = state.runner.hand.map((id) => state.cards[id]!.title);
      log(
        state,
        `${source.title} — reveal grip (${titles.length}): ${titles.join(", ") || "empty"}.`,
      );
      return { ok: true };
    }
    case "reveal_grip_may_trash_one": {
      if (state.runner.hand.length === 0) {
        log(state, `${source.title} — grip empty.`);
        return { ok: true };
      }
      const titles = state.runner.hand.map((id) => state.cards[id]!.title);
      log(
        state,
        `${source.title} — reveal grip: ${titles.join(", ")}.`,
      );
      if (state.runner.hand.length === 1) {
        return applyPrimitive(ctx, {
          kind: "trash_from_grip",
          cardId: state.runner.hand[0]!,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: state.runner.hand.map((id) => ({
          id: `trash-grip:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: { kind: "trash_from_grip" as const, cardId: id },
          },
        })),
      };
      return { ok: true };
    }
    case "runner_lose_credits_equal_corp_bad_publicity": {
      const n = state.corp.badPublicity ?? 0;
      if (n <= 0) return { ok: true };
      const lose = Math.min(n, state.runner.credits);
      state.runner.credits -= lose;
      log(
        state,
        `Runner loses ${lose}¢ (${n} bad publicity) → ${state.runner.credits}¢.`,
      );
      return { ok: true };
    }
    case "power_shutdown": {
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "trash-0",
            label: "Trash 0 from top of R&D",
            effect: {
              op: "do" as const,
              action: { kind: "power_shutdown_trash_rd", amount: 0 },
            },
          },
          ...Array.from({ length: Math.min(5, state.corp.deck.length) }, (_, i) => {
            const amount = i + 1;
            return {
              id: `trash-${amount}`,
              label: `Trash ${amount} from top of R&D`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "power_shutdown_trash_rd" as const,
                  amount,
                },
              },
            };
          }),
        ],
      };
      log(state, `${source.title} — choose how many cards to trash from top of R&D.`);
      return { ok: true };
    }
    case "power_shutdown_trash_rd": {
      let trashed = 0;
      for (let i = 0; i < action.amount && state.corp.deck.length > 0; i++) {
        const id = state.corp.deck.pop()!;
        trashCorpCardToArchives(state, id);
        trashed++;
      }
      log(state, `Power Shutdown — trash ${trashed} from top of R&D.`);
      return applyPrimitive(ctx, {
        kind: "power_shutdown_trash_runner_install_lte",
        maxInstallCost: trashed,
      });
    }
    case "power_shutdown_trash_runner_install_lte": {
      const maxCost = action.maxInstallCost;
      const candidates = state.runner.rig.filter((id) => {
        const c = state.cards[id]!;
        if (c.type !== "program" && c.type !== "hardware") return false;
        return (c.installCost ?? 0) <= maxCost;
      });
      if (candidates.length === 0) {
        log(state, `Power Shutdown — no Runner install cost ≤ ${maxCost}.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: candidates.map((id) => ({
          id: `ps-trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "trash_installed_runner_card" as const,
              cardId: id,
            },
          },
        })),
      };
      return { ok: true };
    }
    case "blackat_break_barrier": {
      const stealthPaid = (state.turn.stealthCreditsOnLastPaidAbility ?? 0) > 0;
      const maxSubs = stealthPaid ? 3 : 1;
      return applyPrimitive(ctx, {
        kind: "break_encounter_subroutine",
        maxSubs,
        requireSubtype: "barrier",
      });
    }
    case "blackat_pump_strength": {
      const stealthPaid = (state.turn.stealthCreditsOnLastPaidAbility ?? 0) > 0;
      const amount = stealthPaid ? 2 : 1;
      return applyPrimitive(ctx, {
        kind: "pump_strength",
        amount,
      });
    }
    default: {
      const lunarTsb = applyLunarTsbPrimitive(ctx, action);
      if (lunarTsb) return lunarTsb;
      const lunarFc = applyLunarFcPrimitive(ctx, action);
      if (lunarFc) return lunarFc;
      const lunarUao = applyLunarUaoPrimitive(ctx, action);
      if (lunarUao) return lunarUao;
      const lunarAtr = applyLunarAtrPrimitive(ctx, action);
      if (lunarAtr) return lunarAtr;
      const lunarTs = applyLunarTsPrimitive(ctx, action);
      if (lunarTs) return lunarTs;
      const oac = applyOacPrimitive(ctx, action);
      if (oac) return oac;
      const val = applySansanValPrimitive(ctx, action);
      if (val) return val;
      const bb = applySansanBbPrimitive(ctx, action);
      if (bb) return bb;
      const cc = applySansanCcPrimitive(ctx, action);
      if (cc) return cc;
      const uw = applySansanUwPrimitive(ctx, action);
      if (uw) return uw;
      const oh = applySansanOhPrimitive(ctx, action);
      if (oh) return oh;
      const uot = applySansanUotPrimitive(ctx, action);
      if (uot) return uot;
      const dad = applyDadPrimitive(ctx, action);
      if (dad) return dad;
      const kg = applyMumbadKgPrimitive(ctx, action);
      if (kg) return kg;
      const bf = applyMumbadBfPrimitive(ctx, action);
      if (bf) return bf;
      const dag = applyMumbadDagPrimitive(ctx, action);
      if (dag) return dag;
      const si = applyMumbadSiPrimitive(ctx, action);
      if (si) return si;
      const tlm = applyMumbadTlmPrimitive(ctx, action);
      if (tlm) return tlm;
      const ftm = applyMumbadFtmPrimitive(ctx, action);
      if (ftm) return ftm;
      const lunar = applyLunarUpPrimitive(ctx, action);
      if (lunar) return lunar;
      const fal = applySpinFalDtPrimitive(ctx, action);
      if (fal) return fal;
      const hap = applySpinHapPrimitive(ctx, action);
      if (hap) return hap;
      const spin = applySpinTcPrimitive(ctx, action);
      if (spin) return spin;
      const _a = action;
      return {
        ok: false,
        error: `Unhandled primitive: ${JSON.stringify(_a)}`,
        cites: [],
      };
    }
  }
}

/** Resume a seq that paused on pendingDamage / pendingTags / pendingChoice. */
export function resumePendingEffectContinuation(state: GameState): void {
  const cont = state.pendingEffectContinuation;
  if (!cont) return;
  if (
    state.pendingChoice ||
    state.pendingTrashProgram ||
    state.pendingSabotage ||
    state.pendingDamage ||
    state.pendingTags ||
    state.pendingExpose ||
    state.pendingTrashPrevent ||
    state.trace ||
    state.psi
  ) {
    return;
  }
  state.pendingEffectContinuation = null;
  const r = evalEffect(
    { state, sourceId: cont.sourceId },
    { op: "seq", effects: cont.effects },
  );
  if (!r.ok) {
    log(state, `Effect continuation failed: ${r.error}`);
  }
}

/** Execute an effect tree against game state (mutates). */
export function evalEffect(ctx: EffectCtx, effect: Effect): EvalResult {
  switch (effect.op) {
    case "seq": {
      for (let i = 0; i < effect.effects.length; i++) {
        const e = effect.effects[i]!;
        // Damage/tag interrupt abilities may reduce an already-open pending
        // window (Prāna / AirbladeX-class) then continue with place/gain —
        // only pause when a *new* pendingDamage/Tags is opened mid-seq.
        const hadPendingDamage = Boolean(ctx.state.pendingDamage);
        const hadPendingTags = Boolean(ctx.state.pendingTags);
        const hadPendingExpose = Boolean(ctx.state.pendingExpose);
        const hadPendingTrashPrevent = Boolean(ctx.state.pendingTrashPrevent);
        const r = evalEffect(ctx, e);
        if (!r.ok) return r;
        const openedNewDamage =
          Boolean(ctx.state.pendingDamage) && !hadPendingDamage;
        const openedNewTags =
          Boolean(ctx.state.pendingTags) && !hadPendingTags;
        const openedNewExpose =
          Boolean(ctx.state.pendingExpose) && !hadPendingExpose;
        const openedNewTrashPrevent =
          Boolean(ctx.state.pendingTrashPrevent) && !hadPendingTrashPrevent;
        // Pause seq when a choice / pending target is opened.
        if (
          ctx.state.pendingChoice ||
          ctx.state.pendingTrashProgram ||
          ctx.state.pendingSabotage ||
          openedNewDamage ||
          openedNewTags ||
          openedNewExpose ||
          openedNewTrashPrevent ||
          ctx.state.trace ||
          ctx.state.psi
        ) {
          const rest = effect.effects.slice(i + 1);
          if (rest.length > 0) {
            ctx.state.pendingEffectContinuation = {
              sourceId: ctx.sourceId,
              effects: rest,
            };
          }
          return { ok: true };
        }
      }
      return { ok: true };
    }
    case "do":
      return applyPrimitive(ctx, effect.action);
    case "if": {
      if (evalCond(ctx, effect.cond)) {
        return evalEffect(ctx, effect.then);
      }
      if (effect.else) return evalEffect(ctx, effect.else);
      return { ok: true };
    }
    case "prevent": {
      if (effect.forbid === "jack_out") {
        if (ctx.state.run) ctx.state.run.cannotJackOut = true;
        addRestriction(
          ctx.state,
          "jack_out",
          CR.cannotPrecedence,
          ctx.sourceId,
        );
        return { ok: true };
      }
      return { ok: true };
    }
    case "choose": {
      ctx.state.pendingChoice = {
        sourceId: ctx.sourceId,
        chooser: effect.chooser,
        options: effect.options.map((o) => ({
          id: o.id,
          label: o.label,
          effect: structuredClone(o.effect),
        })),
      };
      log(
        ctx.state,
        `Choice pending for ${effect.chooser} (${effect.options.length} options) from ${ctx.state.cards[ctx.sourceId].title}.`,
      );
      return { ok: true };
    }
    default: {
      const _e: never = effect;
      return {
        ok: false,
        error: `Unhandled effect op: ${JSON.stringify(_e)}`,
        cites: [],
      };
    }
  }
}

/**
 * Preconditions for paying a paid ability whose effect is this tree.
 * Returns a failure result if illegal, otherwise null.
 */
export function validatePaidEffect(
  ctx: EffectCtx,
  effect: Effect,
): Extract<EvalResult, { ok: false }> | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  const walk = (e: Effect): Extract<EvalResult, { ok: false }> | null => {
    switch (e.op) {
      case "seq": {
        for (const child of e.effects) {
          const r = walk(child);
          if (r) return r;
        }
        return null;
      }
      case "if":
        return walk(e.then) ?? (e.else ? walk(e.else) : null);
      case "prevent":
        return null;
      case "choose":
        return null;
      case "do": {
        const a = e.action;
        if (a.kind === "pump_strength") {
          if (!state.run) {
            return {
              ok: false,
              error: "Pump requires an active run/encounter.",
              cites: [CR.icebreakerStrengthImplicit],
            };
          }
          if (!source.breaker) {
            return {
              ok: false,
              error: "Pump requires an icebreaker.",
              cites: [CR.programStrength],
            };
          }
        }
        if (a.kind === "fortify_ice") {
          if (!state.run || source.type !== "ice") {
            return {
              ok: false,
              error: "Fortify requires approached ice during a run.",
              cites: [CR.iceStrength],
            };
          }
        }
        if (a.kind === "weaken_ice") {
          if (!state.run?.encounter) {
            return {
              ok: false,
              error: "Weaken ice requires an encounter.",
              cites: [CR.iceStrength],
            };
          }
        }
        if (a.kind === "gain_credits_per_virus") {
          // Always legal; may gain 0.
        }
        return null;
      }
      default: {
        const _e: never = e;
        return _e;
      }
    }
  };
  return walk(effect);
}

// trashCorpCardToArchives used by trash_hq / shuffle paths.
