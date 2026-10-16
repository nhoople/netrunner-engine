import type { Action, GameState, RuleCite } from "../state/types.js";
import { maybeFireFirstEmptyGripTriggers } from "../state/damage.js";
import {
  CORP_STEPS,
  RUNNER_STEPS,
  STEPS,
  cursorFrom,
  type TimingStepDef,
} from "./graph.js";
import { currentWindow } from "../cards/stubs.js";
import {
  checkpointAfterAccess,
  checkpointAfterApproachIcePhase,
  checkpointAfterActionPhase,
  checkpointAfterBreach,
  checkpointAfterCorpTurn,
  checkpointAfterCorpDiscardPhase,
  checkpointAfterDrawPhase,
  checkpointAfterEncounterPhase,
  checkpointAfterInitiationPhase,
  checkpointAfterInstruction,
  checkpointAfterMovementPhase,
  checkpointAfterRun,
  checkpointAfterRunEndsPhase,
  checkpointAfterRunnerActionPhase,
  checkpointAfterRunnerDiscardPhase,
  checkpointAfterRunnerTurn,
  checkpointAfterSuccessPhase,
} from "../legality/checkpoints.js";
import { ensurePriorityWindow } from "../legality/priority.js";
import { CR } from "./labels.js";

const MAX_AUTO = 64;

export function getStep(state: GameState): TimingStepDef {
  const key = state.timingKey;
  const step = STEPS[key];
  if (!step) {
    throw new Error(`Unknown timing key: ${key}`);
  }
  return step;
}

export function enterStep(state: GameState, key: string): void {
  const previousKey = state.timingKey;
  const step = STEPS[key];
  if (!step) throw new Error(`Unknown timing key: ${key}`);
  state.timingKey = key;
  state.timing = cursorFrom(step);
  if (step.turnPhase) {
    state.turnPhase = step.turnPhase;
  }
  // CR 10.3.6 / 6.9.1f: the checkpoint after initiation is outside that phase,
  // while the run is still open, before the Runner approaches the server.
  if (previousKey === "run.checkIce" && state.run !== null) {
    checkpointAfterInitiationPhase(state);
  }
  // CR 10.3.6 / 6.9.2c: the checkpoint after Approach Ice is outside that
  // phase, while the run is still open, before the Runner passes the ice.
  if (previousKey === "run.iceRezzed" && state.run !== null) {
    checkpointAfterApproachIcePhase(state);
  }
  // CR 10.3.6 / 6.9.3e: the checkpoint after Encounter Ice is outside that
  // phase. The engine reaches that completion when 11.4_3_c goes to movement.
  if (
    previousKey === "run.checkSubs" &&
    key === "run.movement" &&
    state.run !== null
  ) {
    checkpointAfterEncounterPhase(state);
  }
  // CR 10.3.6 / 6.9.4h: the checkpoint after Movement is outside that phase.
  // The engine reaches that completion when 11.4_4_g continues to 11.4_5_a.
  if (
    previousKey === "run.approachServer" &&
    key === "run.success" &&
    state.run !== null
  ) {
    checkpointAfterMovementPhase(state);
  }
  // CR 10.3.6 / 5.1.2: the checkpoint after the draw phase is outside that
  // phase, on the action window, before the Corp receives priority.
  if (previousKey === "corp.mandatoryDraw" && key === "corp.actionPaw") {
    checkpointAfterDrawPhase(state);
  }
  // CR 10.3.6 / 5.1.2: the checkpoint after the action phase is outside that
  // phase, on the discard step, before the Corp discards.
  if (previousKey === "corp.actionPhaseEnd" && key === "corp.discard") {
    checkpointAfterActionPhase(state);
  }
  // CR 10.3.6 / 5.1.3: the checkpoint after the Runner's action phase is
  // outside that phase, on the discard step, before the Runner discards.
  if (previousKey === "runner.actionPhaseEnd" && key === "runner.discard") {
    checkpointAfterRunnerActionPhase(state);
  }
  // CR 10.3.6 / 5.6.3e: the discard phase and the Corp's turn finish together.
  // The phase checkpoint is outside the discard phase, before the checkpoint
  // outside the Corp's turn.
  if (previousKey === "corp.turnComplete" && step.structure === "runner_turn") {
    checkpointAfterCorpDiscardPhase(state);
    checkpointAfterCorpTurn(state);
  }
  // CR 10.3.6 / 5.7.2e: the discard phase and the Runner's turn finish together.
  // The phase checkpoint is outside the Runner's discard phase, before the
  // checkpoint outside the Runner's turn. Encore stays on the Runner's turn.
  if (previousKey === "runner.turnComplete" && step.structure === "corp_turn") {
    checkpointAfterRunnerDiscardPhase(state);
    checkpointAfterRunnerTurn(state);
  }
  // CR 10.3.6: the checkpoint after an access's last step is outside that
  // access, back on the breach, before the breach itself finishes.
  if (
    previousKey === "access.complete" &&
    step.structure === "breach" &&
    state.run !== null
  ) {
    checkpointAfterAccess(state);
  }
  // CR 10.3.6: the checkpoint after the breach's last step is outside the
  // breach, back on the run, before the run itself finishes.
  if (
    previousKey === "breach.complete" &&
    step.structure === "run" &&
    state.run !== null
  ) {
    checkpointAfterBreach(state);
  }
  // CR 10.3.6 / 6.9.5c: the checkpoint after Success is outside that phase.
  // The engine reaches that completion when the breach continues to 11.4_6_a.
  if (
    previousKey === "breach.complete" &&
    key === "run.closePriorityWindows" &&
    state.run !== null
  ) {
    checkpointAfterSuccessPhase(state);
  }
  // CR 10.3.6 / 6.9.6d: Run Ends and the run finish on the same step.
  // The phase checkpoint is outside Run Ends, before the checkpoint outside the run.
  if (
    previousKey === "run.ends" &&
    step.structure === "runner_turn" &&
    state.run === null
  ) {
    checkpointAfterRunEndsPhase(state);
    checkpointAfterRun(state);
  }
  // CR 10.3.3 / 9.2.4e: the player who receives this window checkpoints first.
  if (currentWindow(key)) ensurePriorityWindow(state);
}

function resolveNext(step: TimingStepDef, state: GameState): string {
  return typeof step.next === "function" ? step.next(state) : step.next;
}

/**
 * Run onResolve for the current step (if any), then follow next,
 * auto-walking through auto/branch steps until a player stop.
 */
export function resolveAndAdvance(state: GameState): void {
  const current = getStep(state);
  current.onResolve?.(state);
  const nextKey = resolveNext(current, state);
  enterStep(state, nextKey);
  autoWalk(state);
}

/** Advance through auto and branch nodes without player input. */
export function autoWalk(state: GameState): void {
  for (let i = 0; i < MAX_AUTO; i++) {
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
    const step = getStep(state);
    if (step.kind === "auto") {
      step.onResolve?.(state);
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
      enterStep(state, resolveNext(step, state));
      continue;
    }
    if (step.kind === "branch") {
      step.onResolve?.(state);
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
      enterStep(state, resolveNext(step, state));
      continue;
    }
    if (tryCloseEmptyRunPaw(state)) continue;
    return;
  }
  throw new Error(`autoWalk exceeded ${MAX_AUTO} steps at ${state.timingKey}`);
}

/**
 * Empty 11.4_1_e / 11.4_4_b / 11.4_4_e windows both players would only pass.
 * Registered from the pass handler so this module does not import it.
 */
let tryCloseEmptyRunPaw: (state: GameState) => boolean = () => false;

export function registerEmptyRunPawCloser(
  closer: (state: GameState) => boolean,
): void {
  tryCloseEmptyRunPaw = closer;
}

export function closeEmptyRunPaw(state: GameState): boolean {
  return tryCloseEmptyRunPaw(state);
}

export function afterBasicAction(state: GameState): void {
  if (state.activeSide === "runner") {
    maybeFireFirstEmptyGripTriggers(state);
  }
  if (state.activeSide === "corp") {
    state.turn.corpActionsCompletedThisTurn += 1;
  }
  // CR 10.3.5 / 9.11.2: the take-action step has finished. Checkpoint before
  // the paid ability window, whose own checkpoint runs when priority is given.
  checkpointAfterInstruction(state, state.timingKey);
  // Appendix 11.2_2_c / 11.3_1_g: every action returns to the paid ability
  // window. The click check there ends the phase when none remain (11.2_2_b_i,
  // 11.3_1_f_i). CR 5.2.1 / 5.4.1: the click is spent at "takes an action."
  enterStep(
    state,
    state.activeSide === "corp" ? "corp.actionPaw" : "runner.actionPaw",
  );
}

/** True if basic turn actions are legal at the current graph node. */
export function atActionStep(state: GameState): boolean {
  const step = getStep(state);
  return step.kind === "action";
}

export function actionAllowedHere(
  state: GameState,
  type: Action["type"],
): { ok: true } | { ok: false; cites: RuleCite[] } {
  if (state.run && type !== "access_card" && type !== "finish_breach") {
    if (
      type === "basic_gain_credit" ||
      type === "basic_draw" ||
      type === "basic_install" ||
      type === "basic_trash_resource" ||
      type === "basic_run" ||
      type === "basic_remove_tag"
    ) {
      return {
        ok: false,
        cites: [CR.runnerBasicRun, CR.actionPhase],
      };
    }
  }

  const step = getStep(state);

  if (
    type === "basic_gain_credit" ||
    type === "basic_draw" ||
    type === "basic_install" ||
    type === "basic_run" ||
    type === "basic_trash_resource" ||
    type === "basic_remove_tag" ||
    type === "basic_purge_virus" ||
    type === "play_operation" ||
    type === "play_event" ||
    type === "advance"
  ) {
    if (step.kind !== "action" || !step.allows?.includes(type)) {
      return { ok: false, cites: [CR.actionPhase, CR.basicActions] };
    }
    return { ok: true };
  }

  if (type === "discard_to_hand_size") {
    if (step.kind !== "discard") {
      return { ok: false, cites: [CR.maxHandSize] };
    }
    return { ok: true };
  }

  if (type === "access_card" || type === "finish_breach") {
    // Candidate choice is only on breach.awaitAccess (11.5_4_a), not during
    // the nested access-a-card steps (11.6_*).
    if (state.timingKey !== "breach.awaitAccess") {
      return { ok: false, cites: [CR.breach] };
    }
    return { ok: true };
  }

  if (type === "pass_window") {
    if (step.kind !== "pass") {
      return { ok: false, cites: [] };
    }
    return { ok: true };
  }

  if (type === "rez_ice") {
    if (state.timingKey !== "run.approachPaw") {
      return { ok: false, cites: [CR.rezInPaw, CR.rezIceRestriction] };
    }
    return { ok: true };
  }

  if (type === "break_subroutine" || type === "break_bioroid_subroutine") {
    if (state.timingKey !== "run.encounterPaw") {
      return { ok: false, cites: [CR.encounterBreakPaw] };
    }
    return { ok: true };
  }

  if (type === "rez_asset") {
    if (state.timingKey !== "corp.actionPaw") {
      return { ok: false, cites: [CR.rezInPaw] };
    }
    return { ok: true };
  }

  if (type === "use_paid_ability") {
    if (
      state.timingKey !== "run.approachPaw" &&
      state.timingKey !== "run.approachServerPaw" &&
      state.timingKey !== "run.encounterPaw" &&
      state.timingKey !== "corp.actionPaw" &&
      state.timingKey !== "runner.actionPaw" &&
      state.timingKey !== "run.completeOtherPriorityWindows"
    ) {
      if (!state.pendingDamage && !state.pendingTags) {
        return { ok: false, cites: [CR.paidAbility, CR.triggerPaidAbilities] };
      }
    }
    return { ok: true };
  }

  if (type === "jack_out" || type === "continue_run") {
    if (state.timingKey !== "run.jackOutWindow") {
      return { ok: false, cites: [CR.jackOutMovement] };
    }
    return { ok: true };
  }

  return { ok: true };
}

export function canPass(state: GameState): boolean {
  return getStep(state).kind === "pass";
}

/** Convenience for tests / describe: appendix ids for key windows. */
export const WINDOW_CITES = {
  corpActionPaw: CORP_STEPS.actionPaw,
  runnerActionPaw: RUNNER_STEPS.actionPaw,
  corpTakeAction: CORP_STEPS.takeAction,
  runnerTakeAction: RUNNER_STEPS.takeAction,
} as const;
