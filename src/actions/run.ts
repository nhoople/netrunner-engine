/**
 * Run initiation, automatic advance, jack out, and return to the action phase.
 * Approaching ice and encounters are driven by the timing machine.
 */
import { log } from "../state/createGame.js";
import { evalEffect } from "../effects/eval.js";
import { isForbidden } from "../legality/checkpoints.js";
import { ensurePriorityWindow } from "../legality/priority.js";
import { dealDamage } from "../state/damage.js";
import { additionalRunInitiateTax } from "../state/runInitiateTax.js";
import {
  collectPersistentAmazeTags,
  type RunModifiers,
} from "../state/runStart.js";
import { afterBasicAction, enterStep, getStep } from "../timing/machine.js";
import type { ApplyResult, GameState, RuleCite, ServerId } from "../state/types.js";
import { CR } from "../timing/labels.js";

function fail(error: string, cites: RuleCite[]): ApplyResult {
  return { ok: false, error, cites };
}

function ok(state: GameState): ApplyResult {
  return { ok: true, state };
}

export function advanceRunUntilStop(state: GameState): ApplyResult {
  for (let guard = 0; guard < 64; guard++) {
    if (
      state.pendingTrashProgram ||
      state.pendingChoice ||
      state.trace ||
      state.psi ||
      state.pendingDamage
    ) {
      return ok(state);
    }

    const step = getStep(state);

    if (step.key === "run.begin") {
      log(state, `Run begins (appendix ${step.stepNumber}).`);
    }

    if (
      step.kind === "pass" ||
      step.kind === "access" ||
      step.kind === "action" ||
      step.kind === "discard"
    ) {
      // Formicary-class 6.8.2c: other frames already on the stack from
      // closePriorityWindows — do not open a duplicate PAW frame.
      if (
        step.kind === "pass" &&
        step.key !== "run.completeOtherPriorityWindows"
      ) {
        ensurePriorityWindow(state);
      }
      return ok(state);
    }

    if (step.structure === "runner_turn") {
      return ok(state);
    }

    if (step.kind === "auto" || step.kind === "branch") {
      step.onResolve?.(state);
      if (
        state.pendingTrashProgram ||
        state.pendingChoice ||
        state.trace ||
        state.psi ||
        state.pendingDamage
      ) {
        return ok(state);
      }
      const nextKey =
        typeof step.next === "function" ? step.next(state) : step.next;
      enterStep(state, nextKey);
      continue;
    }

    return fail(`Unexpected stop during run walk at ${step.key}`, [
      CR.runnerBasicRun,
    ]);
  }
  return fail("Run walk exceeded step budget.", [CR.runnerBasicRun]);
}

export function finishRunReturnToAction(state: GameState): void {
  if (!state.run) {
    // Hired Help-class: waiting on agenda forfeit before the run begins.
    if (state.pendingChoice || state.pendingStartRun) return;
    state.restrictions = state.restrictions.filter((r) => r.forbid !== "jack_out");
    afterBasicAction(state);
  }
}

export function startRun(
  state: GameState,
  serverId: ServerId,
  mods: RunModifiers = {},
): ApplyResult {
  if (state.turn.cannotMakeAnotherRunThisTurn) {
    return fail("Runner cannot make another run this turn.", [
      CR.runnerBasicRun,
    ]);
  }
  const server = state.servers[serverId];
  if (!server) {
    return fail("Unknown attacked server.", [CR.announceServer]);
  }
  const initiateTax = additionalRunInitiateTax(state, serverId);
  if (initiateTax.requireForfeitAgenda && !mods.hiredHelpAgendaTaxPaid) {
    const agendas = state.runner.score.filter(
      (id) => !state.cards[id]?.cannotForfeit,
    );
    if (agendas.length === 0) {
      return fail(
        "Must forfeit a scored agenda to initiate a run on this server (Hired Help).",
        [CR.runnerBasicRun],
      );
    }
    if (agendas.length === 1) {
      const r = evalEffect(
        { state, sourceId: agendas[0]! },
        {
          op: "do",
          action: {
            kind: "forfeit_runner_scored_agenda",
            cardId: agendas[0]!,
          },
        },
      );
      if (!r.ok) return fail(r.error, r.cites);
      log(
        state,
        `Hired Help — forfeit ${state.cards[agendas[0]!]!.title} as additional cost to run.`,
      );
    } else {
      state.pendingChoice = {
        sourceId: state.corp.identityId,
        chooser: "runner",
        options: agendas.map((agId) => ({
          id: `hired-help-forfeit:${agId}`,
          label: `Forfeit ${state.cards[agId]!.title} to run`,
          effect: {
            op: "do",
            action: {
              kind: "forfeit_runner_scored_agenda" as const,
              cardId: agId,
            },
          },
        })),
      };
      state.pendingStartRun = {
        sourceId: mods.runSourceId ?? state.runner.identityId,
        serverId,
        hiredHelpAgendaTaxPaid: true,
        bonusAccess: mods.bonusAccess,
        skipBreach: mods.skipBreach,
        onSuccessfulRunEffect: mods.onSuccessfulRunEffect,
        onRunEndEffect: mods.onRunEndEffect,
        bypassFirstEncounterForClicks: mods.bypassFirstEncounterForClicks,
        rfgFirstNonAgendaAccess: mods.rfgFirstNonAgendaAccess,
        lastingRfgCopiesOnAccess: mods.lastingRfgCopiesOnAccess,
      };
      log(
        state,
        `Hired Help — forfeit a scored agenda as additional cost to run ${serverId}.`,
      );
      return ok(state);
    }
  }
  if (initiateTax.clicks > 0) {
    if (state.runner.clicks < initiateTax.clicks) {
      return fail(
        `Cannot pay additional ${initiateTax.clicks} [click] to initiate this run.`,
        [CR.runnerBasicRun, CR.costCheckpoint],
      );
    }
  }
  if (initiateTax.credits > 0) {
    if (state.runner.credits < initiateTax.credits) {
      return fail(
        `Cannot pay additional ${initiateTax.credits}¢ to initiate this run.`,
        [CR.runnerBasicRun, CR.costCheckpoint],
      );
    }
  }
  if (initiateTax.clicks > 0) {
    state.runner.clicks -= initiateTax.clicks;
    state.turn.runnerClicksSpentThisTurn += initiateTax.clicks;
    log(
      state,
      `Runner spends ${initiateTax.clicks} [click] additional cost to initiate run on ${serverId}.`,
    );
  }
  if (initiateTax.credits > 0) {
    state.runner.credits -= initiateTax.credits;
    log(
      state,
      `Runner pays ${initiateTax.credits}¢ additional cost to initiate run on ${serverId}.`,
    );
    // Not GameNET: spend is the cost to initiate, not "during a run" (1.16.2b).
  }
  if (!state.turn.serversRunThisTurn.includes(serverId)) {
    state.turn.serversRunThisTurn.push(serverId);
  }
  // Replicating Perfection: running a central unlocks remotes until EOT.
  if (
    server.kind === "central" &&
    state.cards[state.corp.identityId]?.cannotRunRemotesUntilCentralRunThisTurn
  ) {
    state.turn.remotesUnlockedByCentralRunThisTurn = true;
  }
  // Sundew: if first click-spend action starts a run on watched server, refund.
  if (state.turn.sundewRefundServerIdsThisAction.includes(serverId)) {
    for (const id of state.servers[serverId]?.root ?? []) {
      const card = state.cards[id];
      const refund = card?.refundCreditsIfRunBeginsOnThisServerDuringClickAction;
      if (!card?.rezzed || !refund) continue;
      const pay = Math.min(refund, state.corp.credits);
      state.corp.credits -= pay;
      log(
        state,
        `${card.title} — pay ${pay}¢ (run began on this server during click action).`,
      );
    }
    state.turn.sundewRefundServerIdsThisAction = [];
  }
  state.run = {
    attackedServerId: serverId,
    phase: "initiation",
    position: server.ice.length > 0 ? 0 : null,
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
    bonusAccess: mods.bonusAccess,
    iceRezCostIncrease: mods.iceRezCostIncrease,
    iceRezAdditionalCostEqualsPrintedRezCost:
      mods.iceRezAdditionalCostEqualsPrintedRezCost,
    firstApproachedIceAdditionalRezCost:
      mods.firstApproachedIceAdditionalRezCost,
    briberyFirstIceRezConsumed: false,
    eventCredits: mods.eventCredits,
    runSourceId: mods.runSourceId,
    onSuccessfulRunEffect: mods.onSuccessfulRunEffect,
    addPowerCounterOnSubroutineResolve: mods.addPowerCounterOnSubroutineResolve,
    onRunEndEffect: mods.onRunEndEffect,
    agendasStolenThisRun: 0,
    persistentTagsIfAgendaStolen: mods.persistentTagsIfAgendaStolen ?? 0,
    bypassFirstEncounter: mods.bypassFirstEncounter,
    bypassEncountersRemaining: mods.bypassEncountersRemaining,
    mayJackOutOnFirstIceEncounter: mods.mayJackOutOnFirstIceEncounter,
    bypassInnermostEncounter: mods.bypassInnermostEncounter,
    bypassSecondEncounterForClick: mods.bypassSecondEncounterForClick,
    bypassFirstEncounterForClicks: mods.bypassFirstEncounterForClicks,
    mayRezEventDerezzedIceOnRunEndIgnoreCosts:
      mods.mayRezEventDerezzedIceOnRunEndIgnoreCosts,
    derezProtectingIceOnRunBegin: mods.derezProtectingIceOnRunBegin,
    iceEncounteredCount: 0,
    redirectSuccessTo: mods.redirectSuccessTo,
    redirectSuccessChooseHqOrRd: mods.redirectSuccessChooseHqOrRd,
    redirectApproachArchivesToHq: mods.redirectApproachArchivesToHq,
    archivesApproachRedirectUsed: false,
    mayRedirectApproachArchivesToHqOrRdPayingStealthCredits:
      mods.mayRedirectApproachArchivesToHqOrRdPayingStealthCredits,
    blockCreditPoolSpendAndLose: mods.blockCreditPoolSpendAndLose,
    forbidCorpRezIceDuringRun: mods.forbidCorpRezIceDuringRun,
    icebreakerStrengthBonusIfInstalledProgramsLte:
      mods.icebreakerStrengthBonusIfInstalledProgramsLte,
    onEncounterMayInstallProgramFromGripIgnoringCosts:
      mods.onEncounterMayInstallProgramFromGripIgnoringCosts,
    trashProgramsInstalledThisWayOnRunEnd:
      mods.trashProgramsInstalledThisWayOnRunEnd,
    dianaInstalledProgramIds: [],
    iceRezzedThisRunIds: [],
    shredPreventFirstEndTheRun: mods.shredPreventFirstEndTheRun,
    shredFirstEndTheRunUsed: false,
    bypassedIceIds: [],
    passedIceIds: [],
    skipBreachInstallProgramFromHeap: mods.skipBreachInstallProgramFromHeap,
    skipBreach: mods.skipBreach ?? false,
    preventAllDamageThisRun: mods.preventAllDamageThisRun ?? false,
    immolationScriptAccessReplace: mods.immolationScriptAccessReplace ?? false,
    accessTrashFree: mods.accessTrashFree ?? false,
    trashFirstNonAgendaAccessCorpMayPayRezOrPlayCostToPrevent:
      mods.trashFirstNonAgendaAccessCorpMayPayRezOrPlayCostToPrevent ?? false,
    rfgFirstNonAgendaAccess: mods.rfgFirstNonAgendaAccess ?? false,
    lastingRfgCopiesOnAccess: mods.lastingRfgCopiesOnAccess ?? false,
    rfgFirstNonAgendaAccessUsed: false,
    accessFromBottomOfRd: mods.accessFromBottomOfRd ?? false,
    trashFirstFullyBrokenSubtype: mods.trashFirstFullyBrokenSubtype,
    blankAttackedServerRoot: mods.blankAttackedServerRoot,
    blankIdentities: mods.blankIdentities,
    approachServerTriggersFiredIds: [],
    approachIceTriggersFiredIds: [],
  };
  const src = mods.runSourceId ? state.cards[mods.runSourceId] : undefined;
  if (src?.blankIdentitiesWhileResolving) {
    state.run.blankIdentities = true;
  }
  const pending = (src as { betaBuildPendingTrackId?: string } | undefined)
    ?.betaBuildPendingTrackId;
  if (pending) {
    state.run.betaBuildTrackedInstallId = pending;
    delete (src as { betaBuildPendingTrackId?: string }).betaBuildPendingTrackId;
  }
  state.turn.runnerMadeRunThisTurn = true;
  state.turn.currentRunPassedUnrezzedIceIds = [];
  // Capture Amaze (and similar) already rezzed on the attacked server.
  const amaze = collectPersistentAmazeTags(state);
  if (amaze > 0) {
    state.run.persistentTagsIfAgendaStolen = Math.max(
      state.run.persistentTagsIfAgendaStolen ?? 0,
      amaze,
    );
  }
  // Drone Screen: if Runner tagged, when they initiate a run on this server.
  if (state.runner.tags > 0) {
    for (const rid of server.root) {
      const up = state.cards[rid];
      if (!up?.rezzed || !up.onRunDeclaredOnThisServerIfTagged) continue;
      const r = evalEffect(
        { state, sourceId: rid },
        up.onRunDeclaredOnThisServerIfTagged,
      );
      if (!r.ok) {
        log(state, `onRunDeclaredOnThisServerIfTagged failed on ${up.title}: ${r.error}`);
      }
    }
  }
  enterStep(state, "run.announce");
  log(
    state,
    `Runner announces run on ${serverId} (CR ${CR.runnerBasicRun.number}, ${CR.announceServer.number}).`,
  );
  // Lean and Mean / Pushing the Envelope–class: icebreaker strength for the run.
  if (state.run.icebreakerStrengthBonusIfInstalledProgramsLte) {
    const spec = state.run.icebreakerStrengthBonusIfInstalledProgramsLte;
    const progCount = state.runner.rig.filter(
      (id) => state.cards[id]?.type === "program",
    ).length;
    if (progCount <= spec.programsMax) {
      for (const id of state.runner.rig) {
        const c = state.cards[id];
        if (!c) continue;
        const isBreaker =
          Boolean(c.breaker) || (c.subtypes ?? []).includes("icebreaker");
        if (!isBreaker) continue;
        state.run.strengthBoosts[id] =
          (state.run.strengthBoosts[id] ?? 0) + spec.bonus;
      }
      log(
        state,
        `Icebreakers +${spec.bonus} strength (≤${spec.programsMax} programs installed).`,
      );
    }
  }
  if (mods.icebreakerStrengthBonusIfGripLte) {
    const spec = mods.icebreakerStrengthBonusIfGripLte;
    if (state.runner.hand.length <= spec.gripMax) {
      for (const id of state.runner.rig) {
        const c = state.cards[id];
        if (!c) continue;
        const isBreaker =
          Boolean(c.breaker) || (c.subtypes ?? []).includes("icebreaker");
        if (!isBreaker) continue;
        state.run.strengthBoosts[id] =
          (state.run.strengthBoosts[id] ?? 0) + spec.bonus;
      }
      log(
        state,
        `Icebreakers +${spec.bonus} strength (grip ≤${spec.gripMax}).`,
      );
    }
  }
  return advanceRunUntilStop(state);
}


export function jackOut(state: GameState): ApplyResult {
  if (state.timingKey !== "run.jackOutWindow") {
    return fail("Jack out is only legal during the movement jack-out step.", [
      CR.jackOutMovement,
      CR.jackOutAfterPass,
    ]);
  }
  const blocked = isForbidden(state, "jack_out");
  if (blocked) {
    return fail(`Cannot jack out: forbidden by ${blocked.source}.`, [
      blocked.cite,
      CR.cannotPrecedence,
    ]);
  }
  const run = state.run!;
  run.successful = false;
  log(
    state,
    `Runner jacks out (CR ${CR.jackingOut.number}, ${CR.jackOutMovement.number}).`,
  );
  // Au Revoir-class: gain credits on jack out.
  for (const rid of state.runner.rig) {
    const card = state.cards[rid];
    const n = card?.gainCreditsOnJackOut;
    if (typeof n === "number" && n > 0) {
      state.runner.credits += n;
      log(state, `${card!.title} — gain ${n}¢ on jack out → ${state.runner.credits}¢.`);
    }
    // Reflection: reveal 1 random HQ card on jack out.
    if (card?.revealRandomHqOnJackOut && state.corp.hand.length > 0) {
      const idx = Math.floor(Math.random() * state.corp.hand.length);
      const hqId = state.corp.hand[idx]!;
      const hqCard = state.cards[hqId]!;
      log(
        state,
        `${card.title} — Corp reveals ${hqCard.title} from HQ (jack out).`,
      );
    }
  }
  // Ancestral Imager: net damage on jack out (scored agenda).
  for (const id of state.corp.score) {
    const card = state.cards[id];
    const n = card?.netDamageOnJackOut;
    if (typeof n !== "number" || n <= 0) continue;
    const r = dealDamage(state, "net", n, id);
    log(state, `${card!.title} — ${n} net damage on jack out (${r}).`);
  }
  enterStep(state, "run.closePriorityWindows");
  const cont = advanceRunUntilStop(state);
  if (!cont.ok) return cont;
  finishRunReturnToAction(cont.state);
  return cont;
}

