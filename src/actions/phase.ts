/**
 * Priority windows, passing priority, and the discard phase.
 * Drawing one card is shared with the basic draw action.
 */
import { commitDraw, holdCorpDrawForDbs } from "../effects/draw.js";
import { abilitiesSuppressed } from "../state/abilities.js";
import { activePlayer, log } from "../state/createGame.js";
import { geneticsPavilionDrawLimit } from "../state/staticFlags.js";
import { resolvePendingOnEncounter } from "../state/onEncounter.js";
import { legalActions as queryLegalActions } from "../legality/query.js";
import { collectCandidateActions } from "../legality/candidates.js";
import {
  actorSideForAction,
  ensurePriorityWindow,
  isWindowAct,
  recordPriorityPass,
} from "../legality/priority.js";
import {
  actionAllowedHere,
  autoWalk,
  canPass,
  enterStep,
  getStep,
  registerEmptyRunPawCloser,
  resolveAndAdvance,
} from "../timing/machine.js";
import type { ApplyResult, GameState, RuleCite, Side } from "../state/types.js";
import { CR } from "../timing/labels.js";
import {
  advanceRunUntilStop,
  dailyBusinessShowSource,
  finishRunReturnToAction,
} from "./run.js";
import {
  fireAfterMandatoryDraw,
  fireOnDiscardPhaseEnd,
  fireOnRunnerDiscardOverMaxHand,
  fireOnRunnerDiscardPhaseEndFlipped,
} from "../state/miscConditionalHooks.js";

function fail(error: string, cites: RuleCite[]): ApplyResult {
  return { ok: false, error, cites };
}

function ok(state: GameState): ApplyResult {
  return { ok: true, state };
}

export function drawOne(state: GameState, side: "corp" | "runner"): boolean {
  return drawN(state, side, 1) > 0;
}

/** Draw up to `amount` cards as one instruction (CR 8.4.5). */
export function drawN(
  state: GameState,
  side: "corp" | "runner",
  amount: number,
): number {
  if (amount <= 0) return 0;
  if (side === "runner" && state.activeSide === "runner") {
    const limit = geneticsPavilionDrawLimit(state);
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
  return commitDraw(state, side, amount).length;
}

/** Fisher–Yates shuffle (same Math.random pattern as effect primitives). */

function opponentHasPriorityActs(state: GameState): boolean {
  const pw = ensurePriorityWindow(state);
  const opponent: Side = pw.priorityHolder === "corp" ? "runner" : "corp";
  // Candidates, not the filtered legal list. The other player's rez or paid
  // ability is not legal until they receive priority (CR 9.2.7a).
  return collectCandidateActions(state).some((action) => {
    if (!isWindowAct(action)) return false;
    return actorSideForAction(action, state) === opponent;
  });
}



let closingEmptyRunPaw = false;

registerEmptyRunPawCloser((state) => {
  if (closingEmptyRunPaw) return false;
  if (
    state.timingKey !== "run.initiatePaw" &&
    state.timingKey !== "run.passIcePaw" &&
    state.timingKey !== "run.afterMovePaw"
  ) {
    return false;
  }
  const legal = queryLegalActions(state);
  const someoneCanAct = collectCandidateActions(state).some((action) => isWindowAct(action));
  if (someoneCanAct) return false;
  if (!legal.some((action) => action.type === "pass_window")) return false;
  closingEmptyRunPaw = true;
  try {
    return passWindow(state).ok;
  } finally {
    closingEmptyRunPaw = false;
  }
});

/** Forfeit the first scored agenda that can be forfeited. */

/** Auto-advance the run graph until a player window or the run ends. */
export function passWindow(state: GameState): ApplyResult {
  if (state.trace) {
    return fail("Resolve or continue the trace before passing.", [CR.trace]);
  }
  if (state.pendingDamage) {
    return fail("Accept or prevent pending damage before passing.", [
      CR.preventDamage,
    ]);
  }
  if (state.pendingEndTheRun) {
    return fail("Prevent or accept pending end the run before passing.", [
      CR.endTheRun,
    ]);
  }
  if (state.pendingTrashProgram) {
    return fail("Choose a program to trash before passing.", [CR.trashing]);
  }

  if (!canPass(state)) {
    if (state.timingKey === "breach.awaitAccess") {
      return fail(
        "Choose a card to access or finish is unavailable while candidates remain.",
        [CR.breach],
      );
    }
    return fail(
      `Cannot pass at step ${state.timingKey} (${state.timing.stepId}).`,
      [],
    );
  }

  const step = getStep(state);
  const inRunOrBreach =
    step.structure === "run" || step.structure === "breach";

  if (step.key === "corp.mandatoryDraw") {
    // Daily Business Show: first draw +1 then put 1 drawn on bottom of R&D.
    const dbsId = dailyBusinessShowSource(state);
    const dbs = dbsId ? state.cards[dbsId] : undefined;
    if (dbs) {
      const drawn = commitDraw(state, "corp", 2);
      if (state.done) return ok(state);
      if (state.pendingDrawSetAside) {
        state.turn.dbsBottomOneDrawn = true;
        log(
          state,
          `Daily Business Show — draw waits for the reaction window (CR ${CR.checkpointReaction.number}).`,
        );
      } else if (drawn.length > 0) {
        holdCorpDrawForDbs(state, drawn);
      }
    } else {
      drawOne(state, "corp");
      if (state.done) return ok(state);
      log(
        state,
        `Corp mandatory draw (CR ${CR.mandatoryDraw.number} / appendix ${step.stepNumber}).`,
      );
    }
    // Open Forum: after mandatory draw, while rezzed.
    for (const server of Object.values(state.servers)) {
      for (const id of server.root) {
        if (state.pendingChoice) break;
        if (abilitiesSuppressed(state, id)) continue;
        const card = state.cards[id];
        if (!card?.rezzed || !card.afterMandatoryDraw) continue;
        fireAfterMandatoryDraw(state, id);
      }
    }
    if (state.pendingChoice) return ok(state);
    const next = typeof step.next === "function" ? step.next(state) : step.next;
    enterStep(state, next);
    autoWalk(state);
    return ok(state);
  }

  // Non-PAW pass steps (gain clicks, turn complete, action phase end, etc.)
  const isPaw =
    step.key.endsWith("Paw") ||
    step.key === "run.jackOutWindow" ||
    step.key === "run.approachPaw" ||
    step.key === "run.approachServerPaw" ||
    step.key === "run.encounterPaw";

  if (step.key === "run.completeOtherPriorityWindows") {
    // CR 6.8.2c — complete one remaining non-PAW frame (Formicary-class).
    const pw = state.priorityStack.pop();
    if (pw) {
      log(
        state,
        `Complete open priority window @ ${pw.stepKey} without new structures (CR ${CR.runEndsOtherPriorityWindows.number} / appendix 11.4_6_a).`,
      );
    }
    if (state.priorityStack.length > 0) {
      return ok(state);
    }
    if (state.run) state.run.forbidNewTimingStructures = false;
    resolveAndAdvance(state);
    if (inRunOrBreach) {
      const cont = advanceRunUntilStop(state);
      if (!cont.ok) return cont;
      finishRunReturnToAction(cont.state);
      return cont;
    }
    return ok(state);
  }

  if (isPaw) {
    if (step.key === "run.jackOutWindow") {
      log(state, `Runner declines to jack out (appendix 11.4_4_c).`);
    }
    if (step.key === "run.approachPaw") {
      log(
        state,
        `Approach PAW closes without further paid abilities (appendix 11.4_2_b).`,
      );
    }
    if (step.key === "run.approachServerPaw") {
      log(state, `Approach-server PAW closes.`);
    }
    if (step.key === "run.encounterPaw") {
      resolvePendingOnEncounter(state);
      log(
        state,
        `Encounter break window closes (appendix 11.4_3_b / CR ${CR.encounterBreakPaw.number}).`,
      );
    }
    const status = recordPriorityPass(state, opponentHasPriorityActs(state));
    if (status === "still_open") {
      return ok(state);
    }
    if (state.run?.endAfterPaidAbilityWindow) {
      state.run.endAfterPaidAbilityWindow = false;
      state.run.endedTheRun = true;
      log(
        state,
        `Run ends because ${state.run.attackedServerId} ceased to exist (CR ${CR.remoteCease.number}).`,
      );
    }
  }

  resolveAndAdvance(state);

  if (inRunOrBreach) {
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }

  return ok(state);
}

export function discardPhase(state: GameState): ApplyResult {
  const allowed = actionAllowedHere(state, "discard_to_hand_size");
  if (!allowed.ok) {
    return fail("Not in discard step.", allowed.cites);
  }
  const p = activePlayer(state);
  if (p.side === "corp") {
    const identityId = state.corp.identityId;
    const idCard = state.cards[identityId];
    if (
      idCard?.handSizeEqualsCredits &&
      !abilitiesSuppressed(state, identityId)
    ) {
      state.corp.maxHandSize = state.corp.credits;
      log(
        state,
        `${idCard.title}: Corp max hand size = credits (${state.corp.maxHandSize}) (CR ${CR.maxHandSize.number}).`,
      );
    }
    // Lewi Guilherme: Corp max hand size −N while installed.
    let lewiDelta = 0;
    for (const rid of state.runner.installed) {
      if (abilitiesSuppressed(state, rid)) continue;
      lewiDelta += state.cards[rid]?.corpHandSizeBonusWhileInstalled ?? 0;
    }
    if (lewiDelta !== 0) {
      state.corp.maxHandSize = Math.max(0, state.corp.maxHandSize + lewiDelta);
      log(
        state,
        `Corp max hand size adjusted by installed Runner cards (${lewiDelta}) → ${state.corp.maxHandSize}.`,
      );
    }
  }
  if (state.turn.skipDiscardThisTurn) {
    state.turn.skipDiscardThisTurn = false;
    log(
      state,
      `${p.side} skips discard step (hand ${p.hand.length}, max ${p.maxHandSize}).`,
    );
  } else {
    state.turn.runnerDiscardedToMaxHandIds = [];
    while (p.hand.length > p.maxHandSize) {
      const id = p.hand.pop()!;
      p.discardPile.push(id);
      const card = state.cards[id];
      card.zone = p.side === "corp" ? "corp:archives" : "runner:heap";
      if (p.side === "corp") card.faceup = false;
      if (p.side === "runner") {
        state.turn.runnerDiscardedToMaxHandIds.push(id);
      }
    }
    log(
      state,
      `${p.side} discards to hand size ${p.maxHandSize} (CR ${CR.maxHandSize.number}).`,
    );
    if (p.side === "runner") {
      const idCard = state.cards[state.runner.identityId];
      if (
        idCard?.onRunnerDiscardOverMaxHand &&
        state.turn.runnerDiscardedToMaxHandIds.length > 0
      ) {
        fireOnRunnerDiscardOverMaxHand(state, state.runner.identityId);
        if (state.pendingChoice) {
          return ok(state);
        }
      }
    }
  }
  if (p.side === "corp") {
    const walk: string[] = [];
    for (const id of state.corp.scoreArea) walk.push(id);
    for (const server of Object.values(state.servers)) {
      for (const id of server.root) {
        const c = state.cards[id];
        if (c?.rezzed) walk.push(id);
      }
    }
    walk.push(state.corp.identityId);
    fireOnDiscardPhaseEnd(state, walk);
    if (state.pendingChoice) {
      return ok(state);
    }
  } else if (p.side === "runner") {
    // Identity + installed (The Class Act and cousins).
    const walk = [state.runner.identityId, ...state.runner.installed];
    fireOnDiscardPhaseEnd(state, walk);
    if (state.pendingChoice) {
      return ok(state);
    }
    // Méliès U: while flipped, flip back when Runner discard phase ends.
    const corpId = state.cards[state.corp.identityId];
    if (
      corpId?.identityFlipped &&
      corpId.identityFlippedHooks?.onRunnerDiscardPhaseEnd
    ) {
      fireOnRunnerDiscardPhaseEndFlipped(state, state.corp.identityId);
      if (state.pendingChoice) {
        return ok(state);
      }
    }
  }
  const next =
    typeof getStep(state).next === "function"
      ? (getStep(state).next as (s: GameState) => string)(state)
      : (getStep(state).next as string);
  enterStep(state, next);
  autoWalk(state);
  return ok(state);
}


