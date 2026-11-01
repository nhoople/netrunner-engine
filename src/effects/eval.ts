import { addRestriction, occurCheckpoint } from "../legality/checkpoints.js";

import { abilitiesSuppressed } from "../state/abilities.js";
import {
  diffAgainstPreviousCheckpoint,
} from "../state/checkpointSnapshot.js";

import { log } from "../state/createGame.js";
import {
  addBreakerStrengthBoostThisRun,
  addIceStrengthBoostThisEncounter,
} from "../state/lingeringEffects.js";
import {
  currentMark,
} from "../state/msKeywords.js";
import { noteVirusProgramInstalled } from "../state/virusInstall.js";
import {
  exposeLegalTargets,
} from "../state/expose.js";

import { noteInstalledThisTurn, noteProgramOrHardwareInstalled } from "../state/programHardwareInstall.js";

import { syncGainsSubroutinesPerAdvancement } from "../state/powerCounters.js";
import { effectiveRunnerTags, runnerIsTagged } from "../state/tags.js";

import {
  creditsAvailableForInstall,
  installAndRezPaid,
  spendCreditsForInstall,
} from "../state/costs.js";
import { removeCardFromCurrentZone, canScoreAgenda, agendaPointsFor, effectiveAdvancementRequirement } from "../state/scoring.js";
import { enterSetAside } from "../state/zones.js";
import { memoryLimit, usedMemory, effectiveMemoryCost } from "../state/turn.js";
import type { GameState, RuleCite, Side } from "../state/types.js";
import { CR } from "../timing/labels.js";
import {
  fx,
  type Cond,
  type Effect,
  type Primitive,
  type SideRef,
} from "./ir.js";
import { applyCoreKinds } from "./kinds/index.js";
import { applySpinFalDtPrimitive } from "./primitives/trashGiveSwap.js";
import { applySpinHapPrimitive } from "./primitives/spendInstallAdd.js";
import { applyLunarUpPrimitive } from "./primitives/trashResolveTrace.js";
import { applyLunarTsbPrimitive } from "./primitives/searchScoreName.js";
import { applyLunarFcPrimitive } from "./primitives/breachResolveRfg.js";
import { applyLunarUaoPrimitive } from "./primitives/preventSpendTrash.js";
import { applyLunarAtrPrimitive } from "./primitives/scoreTraceOffer.js";
import { applyLunarTsPrimitive } from "./primitives/boostRezTrace.js";
import { applyOacPrimitive } from "./primitives/gainMoveMark.js";
import { applySansanValPrimitive } from "./primitives/searchRevealTrash.js";
import { applySansanBbPrimitive } from "./primitives/preventInstallDraw.js";
import { applySansanCcPrimitive } from "./primitives/swapNetBreach.js";
import { applySansanUwPrimitive } from "./primitives/hostInstallExpose.js";
import { applySansanOhPrimitive } from "./primitives/shuffleLookPick.js";
import { applySansanUotPrimitive } from "./primitives/gainCannotSwap.js";
import { applyDadPrimitive } from "./primitives/playDrawSearch.js";
import { applyMumbadKgPrimitive } from "./primitives/preventMoveChoose.js";
import { applyMumbadBfPrimitive } from "./primitives/rezBreachPlace.js";
import { applyMumbadDagPrimitive } from "./primitives/hostResolveLook.js";
import {
  applyMumbadSiPrimitive,
  trashRandomGripForPersonalityProfiles,
} from "./primitives/lookTrashAdd.js";
import {
  closeReactionWindow,
  completePendingAbility,
  createPendingAbilityInstance,
  findPendingAbility,
  markPendingAbilityResolving,
  openReactionWindow,
  pruneSettledPendingAbilities,
} from "../state/pendingAbilities.js";
import { applyMumbadTlmPrimitive } from "./primitives/trashPlaceAccess.js";
import { applyMumbadFtmPrimitive } from "./primitives/revealTrashCannot.js";
import { applyFlashpoint23sPrimitive } from "./primitives/trashForceGain.js";
import { applyFlashpointBmPrimitive } from "./primitives/spendMoveTrash.js";
import { applyFlashpointEsPrimitive } from "./primitives/redirectSpendName.js";
import { applyFlashpointInPrimitive } from "./primitives/lookInstallTrash.js";
import { applyFlashpointMlPrimitive } from "./primitives/spendHostPrevent.js";
import { applyFlashpointQuPrimitive } from "./primitives/preventGainSpend.js";
import { applyRedsandDcPrimitive } from "./primitives/derezExposePrevent.js";
import { applyRedsandSoPrimitive } from "./primitives/trashChooseAccess.js";
import { applyRedsandTdPrimitive } from "./primitives/derezDrawChoose.js";
import { applyRedsandEasPrimitive } from "./primitives/trashResolveDerez.js";
import { applyRedsandBawPrimitive } from "./primitives/chooseGainShuffle.js";
import { applyRedsandFmPrimitive } from "./primitives/derezRfgTrash.js";
import { applyRedsandCdPrimitive } from "./primitives/givePayTrash.js";
import { applyKitaraSsPrimitive } from "./primitives/addResolveInstall.js";
import { applyKitaraDtwnPrimitive } from "./primitives/gainExposeSearch.js";
import { applyKitaraCotcPrimitive } from "./primitives/moveSearchInstall.js";
import { applyKitaraTdatdPrimitive } from "./primitives/resolveExposePay.js";
import { applyKitaraWinPrimitive } from "./primitives/resolveMoveInstall.js";
import { applyKitaraKaPrimitive } from "./primitives/breachResolveInstall.js";
import { applyMagnumOpusPrimitive } from "./primitives/shuffleInstall.js";
import { applyHostedCreditPrimitive } from "./hostedCreditPrimitives.js";
import { applyDamagePrimitive } from "./damagePrimitives.js";
import { applyChooseCard } from "./chooseCard.js";
import { applyRunPrimitive } from "./runPrimitives.js";
import {
  applyTagPrimitive,
  canPayTakeTagsNestedCost,
} from "./tagPrimitives.js";
import { applyDrawPrimitive, drawCards } from "./draw.js";
import { applyCreditPrimitive } from "./creditPrimitives.js";
import {
  deferContinuationAfter,
  effectResolutionBlocked,
} from "./continuation.js";
import { applyTracePrimitive } from "./tracePrimitives.js";
import { applyClickPrimitive } from "./clickPrimitives.js";
import { applyPsiPrimitive } from "./psiPrimitives.js";
import { applyBadPublicityPrimitive } from "./badPublicityPrimitives.js";
import {
  trashCorpCardToArchives,
  trashToHeap,
} from "./corpTrash.js";
import {
  applyCorpInstallPrimitive,
} from "./corpInstall.js";
import { applyCounterPrimitive } from "./counterPrimitives.js";
import { applyEncounterPrimitive } from "./encounterPrimitives.js";
import { iceStrength } from "./iceStrength.js";
import {
  gripInstallCostAfterDiscount,
  shuffleRunnerStack,
} from "./runnerInstall.js";
import { applySpinTcPrimitive } from "./primitives/breachTrashTurn.js";
import {
  fireOnAfterOperationOrExpendable as markOnAfterOperationOrExpendable,
  fireOnCreditsGainedFromAgendaOrOperationAbility,
  fireOnFirstRevealEachTurn,
  fireOnGrayOrBlackOpsTrashedAfterResolve,
} from "../state/miscConditionalHooks.js";
import { openPendingChoose } from "../state/pendingChoice.js";

export interface EffectCtx {
  state: GameState;
  /** Card whose ability/sub is firing. */
  sourceId: string;
  /** Who paid (paid abilities); defaults to source.side. */
  payerSide?: Side;
  /**
   * The printed instruction tells the Runner to suffer the damage, so the
   * Runner is responsible for it (CR 10.4.1).
   */
  runnerSuffers?: boolean;
}

export type EvalResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

import {
  fireOnBypassTriggers,
  fireHostRezStateTriggers,
  fireOnAnyIceRez,
} from "../state/iceRezHooks.js";
import {
  fireOnAccess,
  fireOnBreakSubroutineTriggers,
  fireOnForfeit,
  fireOnFullyBreak,
  fireOnInstall,
  fireOnMovedToServerRoot,
  fireOnPlay,
  noteCheckpointAndResolvePlay,
  fireOnRez,
} from "../state/cardLifecycleHooks.js";
export {
  fireOnBypassTriggers,
  fireHostRezStateTriggers,
  fireOnAnyIceRez,
  fireOnAccess,
  fireOnBreakSubroutineTriggers,
  fireOnForfeit,
  fireOnFullyBreak,
  fireOnInstall,
  fireOnMovedToServerRoot,
  fireOnPlay,
  noteCheckpointAndResolvePlay,
  fireOnRez,
};

/**
 * Dadiana Chacon: whenever Runner has 0 credits, trash self and take N meat.
 */

export function maybeFireKerosMcintyreOnDerez(state: GameState): void {
  if (state.turn.kerosMcintyreDerezGainUsedThisTurn) return;
  for (const rid of [...state.runner.installed]) {
    if (abilitiesSuppressed(state, rid)) continue;
    const card = state.cards[rid];
    const n = card?.gainCreditsOnFirstDerezIceEachTurn;
    if (typeof n !== "number" || n <= 0) continue;
    state.turn.kerosMcintyreDerezGainUsedThisTurn = true;
    state.runner.credits += n;
    log(
      state,
      `${card!.title} — gain ${n}¢ (first ice derez this turn) → ${state.runner.credits}¢.`,
    );
    break;
  }
}

function maybeFireDadianaChaconZeroCredits(state: GameState): void {
  if (state.runner.credits !== 0) return;
  for (const rid of [...state.runner.installed]) {
    const card = state.cards[rid];
    const n = card?.trashSelfAndMeatDamageWhenCreditsZero;
    if (typeof n !== "number" || n <= 0) continue;
    removeCardFromCurrentZone(state, rid);
    card!.zone = "runner:heap";
    card!.hostId = undefined;
    state.runner.discardPile.push(rid);
    log(state, `${card!.title} trashed (0 credits).`);
    const r = evalEffect(
      { state, sourceId: rid },
      { op: "do", action: { kind: "meat_damage", amount: n } },
    );
    if (!r.ok) {
      log(state, `${card!.title} meat damage failed: ${r.error}`);
    }
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
  // Cyberdelia: first time each turn you fully break ice, gain N¢.
  if (enc.broken.every(Boolean) && !state.turn.ssFirstFullyBreakCreditsFired) {
    for (const rid of state.runner.installed) {
      if (abilitiesSuppressed(state, rid)) continue;
      const hw = state.cards[rid];
      const n = hw?.gainCreditsOnFirstFullyBreakEachTurn;
      if (!hw || typeof n !== "number" || n <= 0) continue;
      state.turn.ssFirstFullyBreakCreditsFired = true;
      state.runner.credits += n;
      log(
        state,
        `${hw.title} — gain ${n}¢ (first full break this turn) → ${state.runner.credits}¢.`,
      );
      break;
    }
  }
  const ice = state.cards[enc.iceId];
  if (ice?.gainCreditWheneverRunnerBreaksSubroutine) {
    state.corp.credits += 1;
    log(
      state,
      `${ice.title} — gain 1¢ (subroutine broken) → ${state.corp.credits}¢.`,
    );
  }
  // Henry Phillips: gain N¢ on break during run on this server if Runner tagged.
  if (state.run?.attackedServerId && effectiveRunnerTags(state) > 0) {
    const root = state.servers[state.run.attackedServerId]?.root ?? [];
    for (const sid of root) {
      const up = state.cards[sid];
      const amt = up?.gainCreditsOnBreakSubThisServerIfTagged;
      if (!up || (!up.rezzed && !up.persistent) || typeof amt !== "number") {
        continue;
      }
      state.corp.credits += amt;
      log(
        state,
        `${up.title} — gain ${amt}¢ (break while tagged) → ${state.corp.credits}¢.`,
      );
    }
  }
  if (breakerId && state.runner.installed.includes(breakerId)) {
    const breaker = state.cards[breakerId];
    const bonus = breaker?.strengthBonusOnBreakSubForRun;
    if (typeof bonus === "number" && bonus !== 0 && state.run) {
      addBreakerStrengthBoostThisRun(state, {
        createdBy: breakerId,
        breakerId,
        amount: bonus,
      });
      log(
        state,
        `${breaker!.title} — +${bonus} strength for the remainder of the run.`,
      );
    }
  }
  if (state.pendingChoice) return;
  const unbroken = enc.broken.some((b) => !b);
  fireOnBreakSubroutineTriggers(state);
  for (const id of state.runner.installed) {
    if (state.pendingChoice) return;
    const card = state.cards[id];
    if (!card) continue;
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
        openPendingChoose(state, { sourceId: id, chooser: "runner", options,
logLine: `${card.title} — may pay ${credits}¢ to break another subroutine.`,
});
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
      addIceStrengthBoostThisEncounter(state, {
        createdBy: state.corp.identityId,
        iceId,
        amount: tb.strengthBonus,
      });
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
            action: {
              kind: "unless" as const,
              payer: "runner" as const,
              cost: {
                op: "do" as const,
                action: {
                  kind: "trash_installed_runner" as const,
                  pick: "choose" as const,
                },
              },
              instruction: {
                op: "do" as const,
                action: { kind: "end_the_run" as const },
              },
            },
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
    openPendingChoose(state, {
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
              kind: "derez_brasilia_other_ice_for_strength" as const,
              otherIceId: oid,
              rezzedIceId: iceId,
              bonus,
              brasiliaId: uid,
            },
          },
        })),
      ],
    });
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
  for (const id of state.runner.installed) {
    const card = state.cards[id];
    if (!card?.onGrayOrBlackOpsTrashedAfterResolve) continue;
    fireOnGrayOrBlackOpsTrashedAfterResolve(state, id);
  }
}

/** Nuvem: after operation or expendable card action. */
export function fireOnAfterOperationOrExpendable(
  state: GameState,
): void {
  const idCard = state.cards[state.corp.identityId];
  if (!idCard?.onAfterOperationOrExpendable) return;
  markOnAfterOperationOrExpendable(state, idCard.id);
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
  fireOnCreditsGainedFromAgendaOrOperationAbility(state, idCard.id);
}

export function resolveSide(ctx: EffectCtx, ref: SideRef): Side {
  if (ref === "corp" || ref === "runner") return ref;
  if (ref === "payer") {
    return ctx.payerSide ?? ctx.state.cards[ctx.sourceId].side;
  }
  return ctx.state.cards[ctx.sourceId].side;
}

/** Install cost after card-level discounts, then effect discount. */

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
  for (const id of state.runner.installed) {
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

export function offerMayChargeCard(
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
  openPendingChoose(state, {
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
logLine: `May charge ${card.title} (CR ${CR.charge.number}).`,
});
  return { ok: true };
}

/** Deterministic stack shuffle used after searches (v0). */

/** CR 8.7.5. A search trigger becomes pending after the shuffle, before a found card is acted on. */
export function noteSearchConditionalAbilities(state: GameState): void {
  const createdIds: string[] = [];
  for (const id of state.corp.scoreArea) {
    const card = state.cards[id];
    if (!card?.onRunnerSearchStackOrInstallFromHeapTrashRandomFromGrip) continue;
    const inst = createPendingAbilityInstance(state, {
      abilityKey: "personality-profiles:trash-random-grip",
      sourceId: id,
      controller: "corp",
      mandatory: true,
      payload: { kind: "trash_random_from_grip" },
    });
    createdIds.push(inst.id);
    log(
      state,
      `${card.title} becomes pending (CR ${CR.searchCondition.number}).`,
    );
  }
  if (createdIds.length === 0) return;
  // Nested reaction for search conditionals before found cards are acted on.
  const frame = openReactionWindow(state, createdIds, null);
  for (const pendingId of createdIds) {
    markPendingAbilityResolving(state, pendingId);
    const inst = findPendingAbility(state, pendingId);
    if (inst) {
      trashRandomGripForPersonalityProfiles(state, inst.sourceId);
    }
    completePendingAbility(state, pendingId, "done");
  }
  closeReactionWindow(state, frame.id);
  pruneSettledPendingAbilities(state);
}

/**
 * A stack search sets the found card aside and shuffles before the next
 * instruction adds it to the grip (CR 9.11.4d).
 */
export function addFoundStackCardAfterSearch(state: GameState, id: string): void {
  const card = state.cards[id];
  if (!card || !state.runner.deck.includes(id)) {
    shuffleRunnerStack(state);
    log(state, `Search stack pick — card missing.`);
    noteSearchConditionalAbilities(state);
    return;
  }
  state.runner.deck = state.runner.deck.filter((x) => x !== id);
  enterSetAside(state, [id], { side: "runner", faceup: false });
  log(state, `${card.title} found and set aside (CR ${CR.find.number}).`);
  shuffleRunnerStack(state);
  log(state, `Stack shuffled (CR ${CR.shuffleDeckAfterSearch.number}).`);
  noteSearchConditionalAbilities(state);
  state.runner.setAside = (state.runner.setAside ?? []).filter((x) => x !== id);
  card.setAsideGroupId = undefined;
  card.faceup = true;
  state.runner.hand.push(id);
  card.zone = "runner:grip";
  log(state, `Search stack — add ${card.title} to grip.`);
}

export function heapCardsWithTrashAbilities(state: GameState): string[] {
  return state.runner.discardPile.filter((id) => {
    const card = state.cards[id];
    if (!card) return false;
    if (card.trashCost !== undefined) return true;
    return (card.paidAbilities ?? []).some((a) => Boolean(a.cost?.trashSelf));
  });
}

export function rfgRunnerSetAside(state: GameState): void {
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

export function offerBurnerMoves(
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
  openPendingChoose(state, { sourceId, chooser: "runner", options,
logLine: `Burner — choose ${movesLeft} more card(s) to move to R&D top/bottom.`,
});
  return { ok: true };
}

export function museZoneCards(
  state: GameState,
  zone: "stack" | "heap" | "grip",
): string[] {
  if (zone === "stack") return state.runner.deck;
  if (zone === "heap") return state.runner.discardPile;
  return state.runner.hand;
}

export function museEligiblePrograms(
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
    state.runner.discardPile = state.runner.discardPile.filter((x) => x !== cardId);
  } else {
    state.runner.hand = state.runner.hand.filter((x) => x !== cardId);
  }
}

export function finishMuseInstall(
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
  state.runner.installed.push(cardId);
  card.zone = "runner:installed";
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
  const hostTitle = hostId ? state.cards[hostId]?.title ?? hostId : "installed";
  log(
    state,
    `Muse (${state.cards[sourceId]?.title ?? sourceId}) — install ${card.title} for ${cost}¢ hosted on ${hostTitle}.`,
  );
  fireOnInstall(state, cardId);
  noteVirusProgramInstalled(state, cardId);
  noteProgramOrHardwareInstalled(state, cardId);
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
  openPendingChoose(state, {
    sourceId: pend.sourceId,
    chooser: pend.chooser,
    options: available.map((o) => ({
      id: o.id,
      label: o.label,
      effect: structuredClone(o.effect),
    })),
logLine: `Exclusive choices — ${pend.remaining} remaining among ${available.length} options (from ${state.cards[pend.sourceId]?.title ?? pend.sourceId}).`,
});
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

export function startExclusiveChoicesExactlyN(
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

export function startExclusiveChoicesPerPassedIce(
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

export function serverHostingCard(
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

export function returnRdLookedToDeckTop(state: GameState): void {
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

function hiddenCopy(state: GameState, oldId: string): string {
  const old = state.cards[oldId];
  if (!old) return oldId;
  const serial = (state.turn.hiddenObjectSerial ?? 0) + 1;
  state.turn.hiddenObjectSerial = serial;
  const newId = `${old.defId ?? "card"}-hidden-${serial}`;
  const copy = structuredClone(old);
  copy.id = newId;
  copy.faceup = false;
  state.cards[newId] = copy;
  delete state.cards[oldId];
  return newId;
}

function finishRdArrange(state: GameState, sourceId: string): EvalResult {
  const placed = state.turn.rdArrangePlaced.map((id) => hiddenCopy(state, id));
  for (const id of placed) {
    state.cards[id]!.zone = "corp:rd";
  }
  state.corp.deck = [...placed, ...state.corp.deck];
  state.turn.rdArrangePlaced = [];
  state.turn.rdLookedCards = [];
  const maybeDraw = state.turn.rdArrangeThenMayDrawIfUnprotected;
  state.turn.rdArrangeThenMayDrawIfUnprotected = false;
  log(
    state,
    `R&D rearranged (${placed.length} cards). They are new objects (CR ${CR.objectMoveLocation.number}).`,
  );
  if (maybeDraw && hostServerUnprotectedByIce(state, sourceId)) {
    openPendingChoose(state, {
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
    });
    log(state, `Federal — host server unprotected; may draw 1.`);
  }
  return { ok: true };
}

export function offerRdArrangeChoice(
  state: GameState,
  sourceId: string,
): EvalResult {
  const remaining = state.turn.rdLookedCards;
  if (remaining.length === 0) {
    return finishRdArrange(state, sourceId);
  }
  openPendingChoose(state, {
    sourceId,
    chooser: state.cards[sourceId]?.side === "runner" ? "runner" : "corp",
    options: remaining.map((id) => ({
      id: `rd-arrange:${id}`,
      label: `Place ${state.cards[id].title} on top next`,
      effect: {
        op: "do" as const,
        action: { kind: "pick_rd_arrange" as const, cardId: id },
      },
    })),
logLine: `Arrange R&D — choose next card for top (${remaining.length} remaining).`,
});
  return { ok: true };
}

export function offerCultivateTrashChoice(
  state: GameState,
  sourceId: string,
): EvalResult {
  const remaining = state.turn.rdLookedCards;
  openPendingChoose(state, {
    sourceId,
    chooser: "corp",
    options: remaining.map((id) => ({
      id: `cultivate-trash:${id}`,
      label: `Trash ${state.cards[id].title}`,
      effect: {
        op: "do" as const,
        action: { kind: "trash_cultivate_looked" as const, cardId: id },
      },
    })),
logLine: `Cultivate — choose 1 to trash.`,
});
  return { ok: true };
}

export function offerCultivateHqChoice(
  state: GameState,
  sourceId: string,
): EvalResult {
  const remaining = state.turn.rdLookedCards;
  openPendingChoose(state, {
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
logLine: `Cultivate — choose 1 to add to HQ.`,
});
  return { ok: true };
}

export function shuffleCorpRdAfterSearch(state: GameState): void {
  state.corp.deck.reverse();
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

export function finishPlaceAdvancementsOnTarget(
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
  const prior = target.advancementCounters ?? 0;
  target.advancementCounters = prior + amount;
  state.turn.lastAdvancementTargetId = targetId;
  syncGainsSubroutinesPerAdvancement(target);
  if (action.cannotScoreTargetThisTurn) {
    if (!state.turn.cannotScoreOrRezCardIds.includes(targetId)) {
      state.turn.cannotScoreOrRezCardIds.push(targetId);
    }
  }
  log(
    state,
    `Place ${amount} advancement(s) on ${target.title} → ${target.advancementCounters}.`,
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
    openPendingChoose(state, {
      sourceId,
      chooser: "corp",
      options,
logLine: `${source.title} — may score ${target.title} (CR ${CR.scoringAgenda.number}).`,
});
    return { ok: true };
  }
  if (after) return evalEffect(ctx, after);
  return { ok: true };
}

function evalCond(ctx: EffectCtx, cond: Cond): boolean {
  if (
    cond === null ||
    typeof cond !== "object" ||
    typeof (cond as { op?: unknown }).op !== "string"
  ) {
    return false;
  }
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
      return state.runner.installed.some((id) => state.cards[id].type === "program");
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
      return state.runner.installed.some((id) => state.cards[id].type === "resource");
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
      // Daily Quest pays only when this card's server had no successful run.
      if (!host) return false;
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
      return (source.advancementCounters ?? 0) >= cond.amount;
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
      return currentMark(state) !== null;
    case "attacking_mark":
      return (
        currentMark(state) !== null &&
        state.run?.attackedServerId === currentMark(state)
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
      for (const id of [...state.corp.scoreArea, ...state.runner.scoreArea]) {
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
      void _c;
      return false;
    }
  }
}

export function pendingTrashAmong(
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

/** Record Hyoubu-class first-reveal-each-turn for the next 10.3.1a (phase 3). */
export function noteCardRevealed(
  state: GameState,
  _cardId: string,
  _revealerSourceId: string,
): void {
  fireOnFirstRevealEachTurn(state, state.corp.identityId);
}

/**
 * Pay a card-ability credit gain through `gain_credits`.
 * A "for each" that only gains credits is one aggregated instruction
 * (CR 9.12.2b, 9.12.2c): pass the total. A non-aggregated instruction
 * (realloc(), which also derezzes) calls this once per instance.
 * A total of 0 or less does not happen (CR 9.12.2b).
 */
export function grantAbilityCredits(
  ctx: EffectCtx,
  side: SideRef,
  amount: number,
): EvalResult {
  if (amount <= 0) return { ok: true };
  return applyPrimitive(ctx, { kind: "gain_credits", side, amount });
}

/** Corp divides a total install-and-rez discount before the costs are calculated (CR 1.16.2f). */
export function offerInstallRezSplit(
  state: GameState,
  sourceId: string,
  discount: number,
  installCost: number,
  rezCost: number,
  chosenInstallDiscount: number | undefined,
  effectFor: (installDiscount: number) => Effect,
): { offered: true } | { offered: false; pay: number } {
  if (discount > 0 && chosenInstallDiscount === undefined) {
    openPendingChoose(state, {
      sourceId,
      chooser: "corp",
      options: Array.from({ length: discount + 1 }, (_, installDiscount) => {
        const rezDiscount = discount - installDiscount;
        const pay = installAndRezPaid(
          installCost,
          rezCost,
          installDiscount,
          rezDiscount,
        );
        return {
          id: `split-install:${installDiscount}`,
          label: `−${installDiscount}¢ install, −${rezDiscount}¢ rez (pay ${pay}¢)`,
          effect: effectFor(installDiscount),
        };
      }),
logLine: `Divide ${discount}¢ between the install cost and the rez cost (CR ${CR.totalInstallRez.number}).`,
});
    return { offered: true };
  }
  const installDiscount = chosenInstallDiscount ?? 0;
  return {
    offered: false,
    pay: installAndRezPaid(
      installCost,
      rezCost,
      installDiscount,
      Math.max(0, discount - installDiscount),
    ),
  };
}

/** Trashing this card must leave a scoring restriction still met (CR 1.16.1c). */
export function trashingKeepsScoreRestriction(
  state: GameState,
  agenda: import("../state/types.js").CardInstance,
  trashId: string,
): boolean {
  if (agenda.type !== "agenda") return true;
  const up = state.cards[trashId];
  const reduction =
    up?.rezzed || up?.persistent ? (up.advancementRequirementReduction ?? 0) : 0;
  if (reduction <= 0) return true;
  const req = effectiveAdvancementRequirement(state, agenda) + reduction;
  return (agenda.advancementCounters ?? 0) >= req;
}

export function applyPrimitive(ctx: EffectCtx, action: Primitive): EvalResult {
  const chosen = applyChooseCard(ctx, action);
  if (chosen) return chosen;
  const hostedCredits = applyHostedCreditPrimitive(ctx, action, drawCards);
  if (hostedCredits) return hostedCredits;
  const damage = applyDamagePrimitive(
    ctx,
    action,
    evalEffect,
    serverHostingCard,
  );
  if (damage) return damage;
  const run = applyRunPrimitive(
    ctx,
    action,
    trashCorpCardToArchives,
    canPayTakeTagsNestedCost,
  );
  if (run) return run;
  const tags = applyTagPrimitive(ctx, action, evalEffect);
  if (tags) return tags;
  const drawn = applyDrawPrimitive(ctx, action, resolveSide);
  if (drawn) return drawn;
  const credits = applyCreditPrimitive(
    ctx,
    action,
    resolveSide,
    evalEffect,
    maybeFireZwickyCreditsGained,
    maybeFireDadianaChaconZeroCredits,
  );
  if (credits) return credits;
  const trace = applyTracePrimitive(ctx, action);
  if (trace) return trace;
  const clicks = applyClickPrimitive(ctx, action, resolveSide, evalEffect);
  if (clicks) return clicks;
  const psi = applyPsiPrimitive(ctx, action);
  if (psi) return psi;
  const badPublicity = applyBadPublicityPrimitive(ctx, action);
  if (badPublicity) return badPublicity;
  const corpInstall = applyCorpInstallPrimitive(ctx, action);
  if (corpInstall) return corpInstall;
  const counters = applyCounterPrimitive(ctx, action);
  if (counters) return counters;
  const encounter = applyEncounterPrimitive(ctx, action);
  if (encounter) return encounter;

  const core = applyCoreKinds(ctx, action);
  if (core) return core;

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
  const flash23s = applyFlashpoint23sPrimitive(ctx, action);
  if (flash23s) return flash23s;
  const flashBm = applyFlashpointBmPrimitive(ctx, action);
  if (flashBm) return flashBm;
  const flashEs = applyFlashpointEsPrimitive(ctx, action);
  if (flashEs) return flashEs;
  const flashIn = applyFlashpointInPrimitive(ctx, action);
  if (flashIn) return flashIn;
  const flashMl = applyFlashpointMlPrimitive(ctx, action);
  if (flashMl) return flashMl;
  const flashQu = applyFlashpointQuPrimitive(ctx, action);
  if (flashQu) return flashQu;
  const redsandDc = applyRedsandDcPrimitive(ctx, action);
  if (redsandDc) return redsandDc;
  const redsandSo = applyRedsandSoPrimitive(ctx, action);
  if (redsandSo) return redsandSo;
  const redsandTd = applyRedsandTdPrimitive(ctx, action);
  if (redsandTd) return redsandTd;
  const redsandEas = applyRedsandEasPrimitive(ctx, action);
  if (redsandEas) return redsandEas;
  const redsandBaw = applyRedsandBawPrimitive(ctx, action);
  if (redsandBaw) return redsandBaw;
  const redsandFm = applyRedsandFmPrimitive(ctx, action);
  if (redsandFm) return redsandFm;
  const redsandCd = applyRedsandCdPrimitive(ctx, action);
  if (redsandCd) return redsandCd;
  const kitaraSs = applyKitaraSsPrimitive(ctx, action);
  if (kitaraSs) return kitaraSs;
  const kitaraDtwn = applyKitaraDtwnPrimitive(ctx, action);
  if (kitaraDtwn) return kitaraDtwn;
  const kitaraCotc = applyKitaraCotcPrimitive(ctx, action);
  if (kitaraCotc) return kitaraCotc;
  const kitaraTdatd = applyKitaraTdatdPrimitive(ctx, action);
  if (kitaraTdatd) return kitaraTdatd;
  const kitaraWin = applyKitaraWinPrimitive(ctx, action);
  if (kitaraWin) return kitaraWin;
  const kitaraKa = applyKitaraKaPrimitive(ctx, action);
  if (kitaraKa) return kitaraKa;
  const magnumOpus = applyMagnumOpusPrimitive(ctx, action);
  if (magnumOpus) return magnumOpus;
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

/** Pay a swap's remaining credit gain once its install trigger has resolved (CR 8.8.4b). */
export function payPendingSwapContinuation(state: GameState): void {
  const gain = state.turn.pendingSwapContinuationCredits ?? 0;
  if (gain <= 0 || state.pendingChoice) return;
  state.turn.pendingSwapContinuationCredits = undefined;
  state.corp.credits += gain;
  log(state, `Corp gains ${gain}¢.`);
}

/** One expose-up-to instruction: both cards are exposed before its checkpoint (CR 9.6.4b). */
export function openExposeUpTo(
  state: GameState,
  sourceId: string,
  max: number,
  remaining: number,
): void {
  state.turn.deferBlackguardCheckpoint = true;
  if (remaining <= 0) {
    finishExposeUpTo(state, sourceId);
    return;
  }
  const targets = exposeLegalTargets(state);
  const source = state.cards[sourceId];
  if (targets.length === 0) {
    log(state, `${source?.title ?? "Expose"} — no cards left to expose.`);
    finishExposeUpTo(state, sourceId);
    return;
  }
  const options: Array<{ id: string; label: string; effect: Effect }> =
    targets.map((id) => ({
      id: `expose-up:${id}`,
      label: `Expose ${state.cards[id]!.title}`,
      effect: {
        op: "do" as const,
        action: {
          kind: "expose_one_of_up_to" as const,
          cardId: id,
          max,
          remaining: remaining - 1,
        },
      },
    }));
  options.push({
    id: "decline",
    label: "Decline further exposes",
    effect: {
      op: "do" as const,
      action: { kind: "end_expose_up_to" as const },
    },
  });
  openPendingChoose(state, { sourceId, chooser: "runner", options });
  log(
    state,
    `${source?.title ?? "Expose"} — may expose up to ${remaining} more card(s).`,
  );
}

export function finishExposeUpTo(state: GameState, sourceId: string): void {
  state.turn.deferBlackguardCheckpoint = false;
  state.turn.exposeUpToAfter = undefined;
  const hasBlackguard = state.runner.installed.some(
    (id) =>
      state.cards[id]?.blackguardForceRezOnExpose &&
      !abilitiesSuppressed(state, id),
  );
  if (!hasBlackguard) return;
  const exposed = diffAgainstPreviousCheckpoint(state).exposedIds;
  if (exposed.length === 0) return;
  occurCheckpoint(
    state,
    "instruction",
    "Exposed cards",
    [CR.conditionMetMultipleTimes],
    sourceId,
  );
}

/** Continue an expose-up-to instruction once its current expose has finished. */
export function resumeExposeUpTo(state: GameState): void {
  const after = state.turn.exposeUpToAfter;
  if (!after) return;
  if (
    state.pendingChoice ||
    state.pendingExpose ||
    state.pendingDamage ||
    state.pendingTrashPrevent
  ) {
    return;
  }
  state.turn.exposeUpToAfter = undefined;
  openExposeUpTo(state, after.sourceId, after.max, after.remaining);
}

/** Resume a seq that paused on pendingDamage / pendingTags / pendingChoice. */
export function resumePendingEffectContinuation(state: GameState): void {
  const cont = state.pendingEffectContinuation;
  if (!cont) return;
  if (effectResolutionBlocked(state)) return;
  state.pendingEffectContinuation = cont.followedBy ?? null;
  const r = evalEffect(
    { state, sourceId: cont.sourceId },
    { op: "seq", effects: cont.effects },
  );
  if (!r.ok) {
    log(state, `Effect continuation failed: ${r.error}`);
  }
  if (!effectResolutionBlocked(state)) {
    resumePendingEffectContinuation(state);
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
            deferContinuationAfter(ctx.state, {
              sourceId: ctx.sourceId,
              effects: rest,
            });
          }
          return { ok: true };
        }
        // The current instruction has finished. The next one is not yet
        // imminent (CR 9.1.2).
        if (i + 1 < effect.effects.length) {
          occurCheckpoint(
            ctx.state,
            "instruction",
            "Between instructions",
            [CR.resolveAbility],
            ctx.sourceId,
          );
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
      openPendingChoose(ctx.state, {
        sourceId: ctx.sourceId,
        chooser: effect.chooser,
        options: effect.options.map((o) => ({
          id: o.id,
          label: o.label,
          effect: structuredClone(o.effect),
        })),
logLine: `Choice pending for ${effect.chooser} (${effect.options.length} options) from ${ctx.state.cards[ctx.sourceId].title}.`,
});
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
