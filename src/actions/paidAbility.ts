/**
 * Paid abilities on installed cards and identities.
 */
import { log } from "../state/createGame.js";
import { directHostedTakeFromEmpty } from "../state/hostedCredits.js";
import {
  currentWindow,
  effectiveIceSubtypes,
  iceShareServer,
} from "../cards/stubs.js";
import {
  evalEffect,
  fireOnAfterOperationOrExpendable,
  validatePaidEffect,
} from "../effects/eval.js";
import { fireSiAfterPaidAbilityClicks } from "../effects/mumbadSiPrimitives.js";
import { abilityCost, canPayCost, payCost } from "../state/costs.js";
import { noteCorpActionType } from "../state/corpActionHooks.js";
import { beginBreachAccess } from "../state/access.js";
import { runnerIsTagged } from "../state/tags.js";
import { agendaPointsFor } from "../state/scoring.js";
import {
  markAbilityUsed,
  markAbilityUsedThisEncounter,
  markAbilityUsedThisRun,
  wasAbilityUsed,
  wasAbilityUsedThisEncounter,
  wasAbilityUsedThisRun,
} from "../state/turn.js";
import {
  ensurePriorityWindow,
  nestPriorityAfterAbility,
} from "../legality/priority.js";
import { isServerAllowedForSpec, modifiersFromStartsRun } from "../state/runStart.js";
import { autoWalk, enterStep } from "../timing/machine.js";
import type { ApplyResult, GameState, PaidAbility, RuleCite, ServerId } from "../state/types.js";
import { CR } from "../timing/labels.js";
import { approachedIceId } from "./rez.js";
import {
  advanceRunUntilStop,
  finishRunReturnToAction,
  startRun,
} from "./run.js";

function fail(error: string, cites: RuleCite[]): ApplyResult {
  return { ok: false, error, cites };
}

function ok(state: GameState): ApplyResult {
  return { ok: true, state };
}

function cardProtectsOtherServer(
  state: GameState,
  cardId: string,
  attackedServerId: string,
): boolean {
  for (const [sid, server] of Object.entries(state.servers)) {
    if (sid === attackedServerId) continue;
    if (server.root.includes(cardId)) return true;
  }
  return false;
}

export function findPaidAbility(
  card: { paidAbilities?: PaidAbility[] },
  abilityId: string,
): PaidAbility | undefined {
  return card.paidAbilities?.find((a) => a.id === abilityId);
}

export function usePaidAbility(
  state: GameState,
  cardId: string,
  abilityId: string,
  serverId?: ServerId,
): ApplyResult {
  const card = state.cards[cardId];
  if (!card) {
    return fail("Unknown card.", [CR.paidAbility]);
  }
  const ability = findPaidAbility(card, abilityId);
  if (!ability) {
    return fail("Unknown paid ability.", [CR.paidAbility]);
  }

  // Damage / tag interrupt PAWs — open while pending awaits prevent/accept,
  // independent of graph timingKey (CR 9.9.3a / 9.9.5 / 9.1.2a).
  const damageInterruptOpen =
    Boolean(state.pendingDamage) &&
    ability.windows.includes("damage_interrupt_paw") &&
    (!ability.requireDuringRun || Boolean(state.run)) &&
    (!ability.requirePendingDamageTypes ||
      ability.requirePendingDamageTypes.includes(state.pendingDamage!.type));
  // Corp damage interrupts (Prāna) are once per pending instance (CR 9.12.2b).
  // Runner AirbladeX-class may fire multiple times by paying again.
  const corpDamageInterruptOnce =
    damageInterruptOpen && card.side === "corp";
  if (
    corpDamageInterruptOnce &&
    state.pendingDamage?.interruptUsedSourceIds?.includes(cardId)
  ) {
    return fail("Interrupt already used for this damage instance.", [
      CR.paidAbility,
      CR.preventDamage,
    ]);
  }
  if (
    damageInterruptOpen &&
    ability.oncePerPendingDamageInstance &&
    state.pendingDamage?.interruptUsedSourceIds?.includes(cardId)
  ) {
    return fail("Interrupt already used for this damage instance.", [
      CR.paidAbility,
      CR.preventDamage,
    ]);
  }
  const tagInterruptOpen =
    Boolean(state.pendingTags) &&
    ability.windows.includes("tag_interrupt_paw") &&
    (!ability.requireDuringRun || Boolean(state.run));
  const exposeInterruptOpen =
    Boolean(state.pendingExpose && state.pendingExpose.phase === "interrupt") &&
    ability.windows.includes("expose_interrupt_paw");
  const trashInterruptOpen =
    Boolean(state.pendingTrashPrevent) &&
    ability.windows.includes("trash_interrupt_paw");
  const traceInterruptOpen =
    Boolean(state.trace) &&
    ability.windows.includes("trace_interrupt_paw") &&
    (!ability.requireDuringRun || Boolean(state.run));
  const breakInterruptOpen =
    Boolean(state.pendingSubroutineBreak) &&
    ability.windows.includes("break_interrupt_paw");
  const interruptOpen =
    damageInterruptOpen ||
    tagInterruptOpen ||
    exposeInterruptOpen ||
    trashInterruptOpen ||
    traceInterruptOpen ||
    breakInterruptOpen;

  const window = currentWindow(state.timingKey);
  // startsRun click abilities are also legal at runner.takeAction
  const atTake = state.timingKey === "runner.takeAction";
  if (
    !interruptOpen &&
    !window &&
    !(atTake && ability.startsRun)
  ) {
    return fail("No paid-ability window open.", [
      CR.paidAbility,
      CR.triggerPaidAbilities,
    ]);
  }
  if (window && !interruptOpen) ensurePriorityWindow(state);
  if (
    !interruptOpen &&
    window &&
    !ability.windows.includes(window) &&
    !ability.startsRun
  ) {
    return fail(`Ability not usable in ${window}.`, [
      CR.paidAbility,
      CR.triggerPaidAbilities,
    ]);
  }
  if (
    ability.startsRun &&
    !atTake &&
    window !== "runner_action_paw"
  ) {
    return fail("Run ability only usable during Runner action window.", [
      CR.paidAbility,
    ]);
  }
  if (card.side === "runner" && !state.runner.rig.includes(cardId)) {
    if (
      cardId !== state.runner.identityId &&
      cardId !== state.run?.runSourceId
    ) {
      return fail("Breaker/program not installed.", [CR.paidAbility]);
    }
  }
  if (card.side === "corp") {
    const inHq = state.corp.hand.includes(cardId);
    if (inHq) {
      if (!ability.usableFromHq) {
        return fail("Ability not usable from HQ.", [CR.paidAbility]);
      }
      if (window !== "corp_action_paw") {
        return fail("HQ expendable ability only during Corp action window.", [
          CR.paidAbility,
        ]);
      }
    }
    const inArchives = state.corp.discard.includes(cardId);
    if (inArchives) {
      if (!ability.usableFromArchives) {
        return fail("Ability not usable from Archives.", [CR.paidAbility]);
      }
      if (window !== "corp_action_paw") {
        return fail(
          "Archives ability only during Corp action window.",
          [CR.paidAbility],
        );
      }
    }
    const inRunnerScore = state.runner.score.includes(cardId);
    if (inRunnerScore) {
      if (!ability.usableFromRunnerScoreArea) {
        return fail("Ability not usable from Runner score area.", [
          CR.paidAbility,
        ]);
      }
      if (window !== "corp_action_paw") {
        return fail(
          "Runner score area ability only during Corp action window.",
          [CR.paidAbility],
        );
      }
    }
  }
  if (card.side === "corp" && window === "approach_paw") {
    const approached = approachedIceId(state);
    const scored = state.corp.score.includes(cardId);
    const otherServerOk =
      ability.requireOtherServer &&
      card.rezzed &&
      !!state.run &&
      cardProtectsOtherServer(state, cardId, state.run.attackedServerId);
    if (approached !== cardId && !scored && !otherServerOk) {
      return fail("Paid ability source is not the approached ice.", [
        CR.paidAbility,
      ]);
    }
    if (approached === cardId && !card.rezzed) {
      return fail("Ice must be rezzed to use this ability.", [CR.paidAbility]);
    }
  }
  if (card.side === "corp" && window === "approach_server_paw") {
    const sid = state.run?.attackedServerId;
    const scored = state.corp.score.includes(cardId);
    const otherServerOk =
      ability.requireOtherServer &&
      card.rezzed &&
      !!sid &&
      cardProtectsOtherServer(state, cardId, sid);
    const formicaryOk =
      !!ability.formicaryApproachAnyServer &&
      !card.rezzed &&
      card.type === "ice";
    if (
      !scored &&
      !otherServerOk &&
      !formicaryOk &&
      (!sid || !state.servers[sid].root.includes(cardId) || !card.rezzed)
    ) {
      return fail(
        "Approach-server ability must be a rezzed upgrade on the attacked server.",
        [CR.paidAbility],
      );
    }
  }
  if (ability.requireOtherServer) {
    const sid = state.run?.attackedServerId;
    if (
      !sid ||
      !card.rezzed ||
      !cardProtectsOtherServer(state, cardId, sid)
    ) {
      return fail(
        "Ability requires a run against another server.",
        [CR.paidAbility],
      );
    }
  }
  if (
    card.side === "corp" &&
    window === "encounter_paw" &&
    !interruptOpen &&
    !state.corp.score.includes(cardId)
  ) {
    const encIce = state.run?.encounter?.iceId;
    const isEncounterIce = encIce === cardId && card.rezzed;
    const isRequireDuringRunIce =
      !!ability.requireDuringRun &&
      !!state.run &&
      card.rezzed &&
      (state.servers[state.run.attackedServerId]?.ice.includes(cardId) ??
        false);
    if (!isEncounterIce && !isRequireDuringRunIce) {
      // Encounter window corp abilities: scored agendas, encountered ice
      // (F2P / N-Pot), or requireDuringRun ice.
      return fail("Corp encounter ability must be a scored agenda.", [
        CR.paidAbility,
      ]);
    }
  }

  const cost = abilityCost(ability, state, card);
  if (card.paidAbilitiesUseStealthCreditsOnly && (cost.credits ?? 0) > 0) {
    cost.creditsFromStealthOnly = true;
  }
  const payer: "corp" | "runner" = ability.usableByAnyPlayer
    ? state.activeSide
    : card.side;
  if (!canPayCost(state, payer, cost, card)) {
    return fail("Cannot pay ability cost.", [CR.paidAbility, CR.costCheckpoint]);
  }
  if (ability.oncePerTurn && wasAbilityUsed(state, cardId, abilityId)) {
    return fail("Ability already used this turn.", [CR.paidAbility]);
  }
  if (
    card.paidAbilitiesOncePerTurn &&
    (card.paidAbilities ?? []).some((ab) =>
      wasAbilityUsed(state, cardId, ab.id),
    )
  ) {
    return fail("A paid ability on this card was already used this turn.", [
      CR.paidAbility,
    ]);
  }
  if (ability.oncePerRun && wasAbilityUsedThisRun(state, cardId, abilityId)) {
    return fail("Ability already used this run.", [CR.paidAbility]);
  }
  if (
    ability.oncePerEncounter &&
    wasAbilityUsedThisEncounter(state, cardId, abilityId)
  ) {
    return fail("Ability already used this encounter.", [CR.paidAbility]);
  }
  if (
    ability.requiresAdvancements !== undefined &&
    (card.advancementTokens ?? 0) < ability.requiresAdvancements
  ) {
    return fail(
      `Need ${ability.requiresAdvancements}+ advancements on ${card.title}.`,
      [CR.paidAbility],
    );
  }
  if (ability.requiresThreat !== undefined) {
    const threatPts = Math.max(
      agendaPointsFor(state, "corp"),
      agendaPointsFor(state, "runner"),
    );
    if (threatPts < ability.requiresThreat) {
      return fail(
        `Need Threat ${ability.requiresThreat} (have ${threatPts}).`,
        [CR.paidAbility],
      );
    }
  }
  if (
    typeof ability.requiresCorpCreditsGte === "number" &&
    state.corp.credits < ability.requiresCorpCreditsGte
  ) {
    return fail(
      `Need Corp to have at least ${ability.requiresCorpCreditsGte}¢.`,
      [CR.paidAbility],
    );
  }
  if (
    ability.requiresSuccessfulRdRunThisTurn &&
    !state.turn.successfulRdRunThisTurn
  ) {
    return fail("Ability requires a successful run on R&D this turn.", [
      CR.paidAbility,
    ]);
  }
  if (
    ability.requiresSuccessfulHqRunThisTurn &&
    !state.turn.successfulHqRunThisTurn
  ) {
    return fail("Ability requires a successful run on HQ this turn.", [
      CR.paidAbility,
    ]);
  }
  if (ability.requiresRezzedIce) {
    let has = false;
    for (const server of Object.values(state.servers)) {
      for (const id of server.ice) {
        if (state.cards[id]?.rezzed) {
          has = true;
          break;
        }
      }
      if (has) break;
    }
    if (!has) {
      return fail("Need a rezzed piece of ice.", [CR.paidAbility]);
    }
  }
  if (
    ability.requiresSuccessfulAllCentralsThisTurn &&
    !(
      state.turn.successfulHqRunThisTurn &&
      state.turn.successfulRdRunThisTurn &&
      state.turn.successfulArchivesRunThisTurn
    )
  ) {
    return fail(
      "Ability requires successful runs on HQ, R&D, and Archives this turn.",
      [CR.paidAbility],
    );
  }
  if (ability.requiresUntagged && runnerIsTagged(state)) {
    return fail("Ability requires the Runner to be untagged.", [CR.paidAbility]);
  }
  if (ability.requireEncounterSubtype) {
    const enc = state.run?.encounter;
    if (!enc) {
      return fail("Ability requires an encounter.", [CR.paidAbility]);
    }
    const subs = effectiveIceSubtypes(state, enc.iceId);
    if (!subs.includes(ability.requireEncounterSubtype)) {
      return fail(
        `Encountered ice must be ${ability.requireEncounterSubtype}.`,
        [CR.paidAbility],
      );
    }
  }
  if (ability.requireEncounterChosenIce) {
    const enc = state.run?.encounter;
    if (!enc) {
      return fail("Ability requires an encounter.", [CR.paidAbility]);
    }
    if (!card.chosenIceId || enc.iceId !== card.chosenIceId) {
      return fail(
        "Ability requires an encounter with the ice chosen on install.",
        [CR.paidAbility],
      );
    }
  }
  if (ability.requireAttackingMark) {
    const mark = state.markServerId;
    if (!mark || state.run?.attackedServerId !== mark) {
      return fail("Ability requires a run on the mark.", [CR.paidAbility]);
    }
  }
  if (ability.requireBrokenSubThisEncounter) {
    const enc = state.run?.encounter;
    if (!enc || !enc.broken.some((b) => b)) {
      return fail(
        "Ability requires a subroutine already broken this encounter.",
        [CR.paidAbility],
      );
    }
  }
  if (ability.requireFullyBrokenThisEncounter) {
    const enc = state.run?.encounter;
    if (!enc?.fullyBrokenByRunner) {
      return fail(
        "Ability requires the encountered ice to be fully broken.",
        [CR.paidAbility],
      );
    }
  }
  if (ability.requireSufferedCorpDamageThisTurn) {
    if (!state.turn.esSufferedCorpDamageThisTurn) {
      return fail(
        "Ability requires suffering damage from a Corp card this turn.",
        [CR.paidAbility],
      );
    }
  }
  if (ability.requireSufferedAnyDamageThisTurn) {
    if ((state.turn.damageSufferedThisTurn ?? 0) < 1) {
      return fail(
        "Ability requires suffering damage this turn.",
        [CR.paidAbility],
      );
    }
  }
  if (ability.requireNextPawAfterDamage) {
    if (!state.turn.vanadisNextPawArmed) {
      return fail(
        "Ability usable only during the next paid ability window after suffering damage.",
        [CR.paidAbility],
      );
    }
  }
  if (ability.requireProtectingHostServer) {
    const enc = state.run?.encounter;
    const hostId = card.hostId;
    if (!enc || !hostId) {
      return fail("Ability requires host ice on encountered server.", [
        CR.paidAbility,
      ]);
    }
    if (!iceShareServer(state, hostId, enc.iceId)) {
      return fail(
        "Host ice must protect the same server as encountered ice.",
        [CR.paidAbility],
      );
    }
  }

  if (directHostedTakeFromEmpty(card.hostedCredits, ability.effect)) {
    return fail("Not enough credits on this card.", [CR.paidAbility]);
  }

  const ctx = {
    state,
    sourceId: cardId,
    payerSide: card.side,
  };

  if (ability.startsRun) {
    if (!serverId) {
      return fail("Run ability requires a target server.", [CR.paidAbility]);
    }
    if (!isServerAllowedForSpec(state, ability.startsRun, serverId)) {
      return fail("Illegal run target for this ability.", [CR.paidAbility]);
    }
    payCost(state, payer, cost, `use_paid_ability:${abilityId}`, card);
    if (ability.oncePerTurn) {
      markAbilityUsed(state, cardId, abilityId);
    }
    if (state.done) {
      // Flatline (or other game end) while paying costs — do not start the run.
      return ok(state);
    }
    const applied = evalEffect(ctx, ability.effect);
    if (!applied.ok) return fail(applied.error, applied.cites);
    const mods = modifiersFromStartsRun(state, ability.startsRun, cardId);
    log(state, `${card.title} starts a run on ${serverId}.`);
    const walked = startRun(state, serverId, mods);
    if (!walked.ok) {
      state.run = null;
      return walked;
    }
    finishRunReturnToAction(walked.state);
    return walked;
  }

  const pre = validatePaidEffect(ctx, ability.effect);
  if (pre !== null) {
    return fail(pre.error, pre.cites);
  }

  payCost(state, payer, cost, `use_paid_ability:${abilityId}`, card);
  if (payer === "corp") {
    fireSiAfterPaidAbilityClicks(
      state,
      cost.clicks ?? ability.clickCost ?? 0,
    );
  }
  if (ability.oncePerTurn) {
    markAbilityUsed(state, cardId, abilityId);
  }
  if (ability.oncePerRun) {
    markAbilityUsedThisRun(state, cardId, abilityId);
  }
  if (ability.oncePerEncounter) {
    markAbilityUsedThisEncounter(state, cardId, abilityId);
  }

  const applied = evalEffect(ctx, ability.effect);
  if (!applied.ok) return fail(applied.error, applied.cites);

  if (
    damageInterruptOpen &&
    state.pendingDamage &&
    (card.side === "corp" || ability.oncePerPendingDamageInstance)
  ) {
    if (!state.pendingDamage.interruptUsedSourceIds) {
      state.pendingDamage.interruptUsedSourceIds = [];
    }
    if (!state.pendingDamage.interruptUsedSourceIds.includes(cardId)) {
      state.pendingDamage.interruptUsedSourceIds.push(cardId);
    }
  }

  // The Back: first hardware paid-ability use during a run each turn.
  if (
    card.type === "hardware" &&
    card.side === "runner" &&
    state.run &&
    !state.turn.hardwareUsedDuringRunThisTurn
  ) {
    state.turn.hardwareUsedDuringRunThisTurn = true;
    for (const id of state.runner.rig) {
      const trigger = state.cards[id]?.onFirstHardwareUseDuringRunEachTurn;
      if (!trigger) continue;
      const r = evalEffect({ state, sourceId: id }, trigger);
      if (!r.ok) return fail(r.error, r.cites);
    }
  }

  if (state.pendingStandaloneBreach) {
    const pending = state.pendingStandaloneBreach;
    state.pendingStandaloneBreach = null;
    const sid = pending.serverId;
    if (!state.servers[sid]) {
      return fail(`Unknown server for standalone breach: ${sid}`, [CR.breach]);
    }
    log(state, `Standalone breach of ${sid} begins (CR ${CR.breach.number}).`);
    state.run = {
      attackedServerId: sid,
      phase: "breach",
      position: null,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      isPostRunBreach: true,
      runSourceId: pending.sourceId,
      ...(pending.cannotAccessRoot ? { cannotAccessRoot: true } : {}),
    };
    enterStep(state, "breach.begin");
    beginBreachAccess(state);
    if (state.pendingChoice) return ok(state);
    autoWalk(state);
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }

  if (state.pendingStandaloneCardAccess) {
    const pending = state.pendingStandaloneCardAccess;
    state.pendingStandaloneCardAccess = null;
    const sid = pending.serverId;
    const card = state.cards[pending.cardId];
    if (!state.servers[sid] || !card) {
      return fail(
        `Unknown card/server for standalone access: ${pending.cardId}`,
        [CR.breach],
      );
    }
    log(
      state,
      `Standalone access of ${card.title} on ${sid} begins (CR ${CR.cardAccessed.number}).`,
    );
    state.run = {
      attackedServerId: sid,
      phase: "breach",
      position: null,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [pending.cardId],
      accessRemaining: 1,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      isPostRunBreach: true,
      accessCandidatesPreset: true,
      runSourceId: pending.sourceId,
    };
    enterStep(state, "breach.begin");
    beginBreachAccess(state);
    if (state.pendingChoice) return ok(state);
    autoWalk(state);
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }

  if (
    card.type === "resource" &&
    card.side === "runner" &&
    !state.turn.firstResourcePaidAbilityThisTurn
  ) {
    state.turn.firstResourcePaidAbilityThisTurn = true;
    for (const id of state.runner.rig) {
      const trigger = state.cards[id]?.onFirstResourcePaidAbilityEachTurn;
      if (!trigger) continue;
      const r = evalEffect({ state, sourceId: id }, trigger);
      if (!r.ok) return fail(r.error, r.cites);
    }
  }

  if (card.side === "corp") {
    noteCorpActionType(state, "use_paid_ability");
    if (
      ability.usableFromHq ||
      (card.subtypes ?? []).includes("expendable")
    ) {
      fireOnAfterOperationOrExpendable(state);
    }
  }
  // ETR from a paid ability (Nisei MK II) ends the current phase and opens
  // Run Ends — process open priority windows (CR 6.1.4 / 6.8.2 / 11.4_6_a).
  if (state.run?.endedTheRun) {
    enterStep(state, "run.closePriorityWindows");
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }
  nestPriorityAfterAbility(state, `use_paid_ability:${abilityId}`);
  return ok(state);
}
