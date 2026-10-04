import type { Action, GameState } from "../state/types.js";
import { currentWindow } from "../cards/stubs.js";
import { getStep } from "../timing/machine.js";
import { isForbidden } from "./checkpoints.js";
import { collectPendingCandidates } from "./candidatePending.js";
import {
  addApproachIceCandidates,
  addBreachAccessCandidates,
  addPaidWindowCandidates,
} from "./candidateRun.js";
import {
  addClickActionCandidates,
  addFreeScoreCandidates,
} from "./candidateClicks.js";

export function collectCandidateActions(state: GameState): Action[] {
  if (state.done) return [];

  const pending = collectPendingCandidates(state);
  if (pending) return pending;

  const actions: Action[] = [];
  const step = getStep(state);
  const paw = currentWindow(state.timingKey);

  // CR 1.6.6a opening mulligan: only keep or mulligan (no click actions / pass).
  if (
    step.key === "opening.corpMulligan" ||
    step.key === "opening.runnerMulligan"
  ) {
    return [{ type: "keep_starting_hand" }, { type: "mulligan" }];
  }

  if (step.kind === "pass") {
    actions.push({ type: "pass_window" });
  }

  addApproachIceCandidates(state, actions, step);
  addPaidWindowCandidates(state, actions, step, paw);

  if (step.key === "run.jackOutWindow") {
    if (!isForbidden(state, "jack_out")) {
      actions.push({ type: "jack_out" });
    }
    actions.push({ type: "continue_run" });
  }

  if (step.kind === "discard") {
    actions.push({ type: "discard_to_hand_size" });
  }

  if (step.kind === "access") {
    addBreachAccessCandidates(state, actions);
    return actions;
  }

  if (step.kind === "action" && !state.run) {
    addClickActionCandidates(state, actions, step);
  }

  addFreeScoreCandidates(state, actions);
  return actions;
}
