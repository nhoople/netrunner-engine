/**
 * Priority windows, passing priority, and the discard phase.
 * Drawing one card is shared with the basic draw action.
 */
import { activePlayer, log } from "../state/createGame.js";
import { evalEffect } from "../effects/eval.js";
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
import { advanceRunUntilStop, finishRunReturnToAction } from "./run.js";

function fail(error: string, cites: RuleCite[]): ApplyResult {
  return { ok: false, error, cites };
}

function ok(state: GameState): ApplyResult {
  return { ok: true, state };
}

export function drawOne(state: GameState, side: "corp" | "runner"): boolean {
  if (side === "runner" && state.activeSide === "runner") {
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
      if (already >= limit) {
        log(
          state,
          `Genetics Pavilion — Runner cannot draw more this turn (limit ${limit}).`,
        );
        return false;
      }
    }
  }
  const p = side === "corp" ? state.corp : state.runner;
  const top = p.deck.shift();
  if (!top) return false;
  p.hand.push(top);
  const card = state.cards[top];
  card.zone = side === "corp" ? "corp:hq" : "runner:grip";
  card.faceup = side === "runner";
  if (side === "runner") {
    state.turn.uotRunnerCardsDrawnThisTurn =
      (state.turn.uotRunnerCardsDrawnThisTurn ?? 0) + 1;
  }
  return true;
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
    const dbs = Object.values(state.cards).find(
      (c) => c.rezzed && c.interruptFirstDrawBottomOne,
    );
    if (dbs) {
      const drew1 = drawOne(state, "corp");
      const drew2 = drawOne(state, "corp");
      if (drew1 && drew2 && state.corp.hand.length >= 2) {
        const bottom = state.corp.hand.pop()!;
        state.corp.deck.push(bottom);
        state.cards[bottom].zone = "corp:rd";
        state.cards[bottom].faceup = false;
        log(
          state,
          `Daily Business Show — draw 2, put ${state.cards[bottom].title} on bottom of R&D.`,
        );
      } else {
        log(
          state,
          drew1
            ? `Corp mandatory draw (CR ${CR.mandatoryDraw.number} / appendix ${step.stepNumber}).`
            : "Corp mandatory draw — R&D empty (not modeled further).",
        );
      }
    } else {
      const drew = drawOne(state, "corp");
      log(
        state,
        drew
          ? `Corp mandatory draw (CR ${CR.mandatoryDraw.number} / appendix ${step.stepNumber}).`
          : "Corp mandatory draw — R&D empty (not modeled further).",
      );
    }
    // Open Forum: after mandatory draw, while rezzed.
    for (const server of Object.values(state.servers)) {
      for (const id of server.root) {
        if (state.pendingChoice) break;
        const card = state.cards[id];
        if (!card?.rezzed || !card.afterMandatoryDraw) continue;
        const r = evalEffect(
          { state, sourceId: id },
          card.afterMandatoryDraw,
        );
        if (!r.ok) {
          log(state, `afterMandatoryDraw failed on ${card.title}: ${r.error}`);
        }
      }
    }
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
    const idCard = state.cards[state.corp.identityId];
    if (idCard?.handSizeEqualsCredits) {
      state.corp.maxHandSize = state.corp.credits;
      log(
        state,
        `${idCard.title}: Corp max hand size = credits (${state.corp.maxHandSize}) (CR ${CR.maxHandSize.number}).`,
      );
    }
    // Lewi Guilherme: Corp max hand size −N while installed.
    let lewiDelta = 0;
    for (const rid of state.runner.rig) {
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
      p.discard.push(id);
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
        const r = evalEffect(
          { state, sourceId: state.runner.identityId },
          idCard.onRunnerDiscardOverMaxHand,
        );
        if (!r.ok) {
          log(
            state,
            `onRunnerDiscardOverMaxHand failed on ${idCard.title}: ${r.error}`,
          );
        }
        if (state.pendingChoice) {
          return ok(state);
        }
      }
    }
  }
  if (p.side === "corp") {
    const walk: string[] = [];
    for (const id of state.corp.score) walk.push(id);
    for (const server of Object.values(state.servers)) {
      for (const id of server.root) {
        const c = state.cards[id];
        if (c?.rezzed) walk.push(id);
      }
    }
    walk.push(state.corp.identityId);
    for (const id of walk) {
      const card = state.cards[id];
      if (!card?.onDiscardPhaseEnd) continue;
      const r = evalEffect(
        { state, sourceId: id },
        card.onDiscardPhaseEnd,
      );
      if (!r.ok) {
        log(state, `onDiscardPhaseEnd error on ${card.title}: ${r.error}`);
      }
      if (state.pendingChoice) {
        return ok(state);
      }
    }
  } else if (p.side === "runner") {
    // Identity + installed rig (The Class Act and cousins).
    const walk = [state.runner.identityId, ...state.runner.rig];
    for (const id of walk) {
      const card = state.cards[id];
      if (!card?.onDiscardPhaseEnd) continue;
      const r = evalEffect(
        { state, sourceId: id },
        card.onDiscardPhaseEnd,
      );
      if (!r.ok) {
        log(state, `onDiscardPhaseEnd error on ${card.title}: ${r.error}`);
      }
      if (state.pendingChoice) {
        return ok(state);
      }
    }
    // Méliès U: while flipped, flip back when Runner discard phase ends.
    const corpId = state.cards[state.corp.identityId];
    if (
      corpId?.identityFlipped &&
      corpId.identityFlippedHooks?.onRunnerDiscardPhaseEnd
    ) {
      const r = evalEffect(
        { state, sourceId: state.corp.identityId },
        corpId.identityFlippedHooks.onRunnerDiscardPhaseEnd,
      );
      if (!r.ok) {
        log(
          state,
          `identityFlipped onRunnerDiscardPhaseEnd failed on ${corpId.title}: ${r.error}`,
        );
      }
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


