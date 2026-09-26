import type { Action, GameState, RuleCite } from "../state/types.js";
import {
  CORP_STEPS,
  RUNNER_STEPS,
  STEPS,
  cursorFrom,
  type TimingStepDef,
} from "./graph.js";
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
  const step = STEPS[key];
  if (!step) throw new Error(`Unknown timing key: ${key}`);
  state.timingKey = key;
  state.timing = cursorFrom(step);
  if (step.turnPhase) {
    state.turnPhase = step.turnPhase;
  }
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
    const step = getStep(state);
    if (step.kind === "auto") {
      step.onResolve?.(state);
      enterStep(state, resolveNext(step, state));
      continue;
    }
    if (step.kind === "branch") {
      step.onResolve?.(state);
      enterStep(state, resolveNext(step, state));
      continue;
    }
    return;
  }
  throw new Error(`autoWalk exceeded ${MAX_AUTO} steps at ${state.timingKey}`);
}

export function afterBasicAction(state: GameState): void {
  const p = state.activeSide === "corp" ? state.corp : state.runner;
  if (p.clicks > 0) {
    enterStep(
      state,
      state.activeSide === "corp" ? "corp.actionPaw" : "runner.actionPaw",
    );
  } else {
    enterStep(
      state,
      state.activeSide === "corp"
        ? "corp.actionPhaseEnd"
        : "runner.actionPhaseEnd",
    );
  }
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
      type === "basic_run"
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
    if (step.kind !== "access" && state.timingKey !== "breach.awaitAccess") {
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

  if (type === "break_subroutine") {
    if (state.timingKey !== "run.encounterPaw") {
      return { ok: false, cites: [CR.encounterBreakPaw] };
    }
    return { ok: true };
  }

  if (type === "use_paid_ability") {
    if (
      state.timingKey !== "run.approachPaw" &&
      state.timingKey !== "run.encounterPaw" &&
      state.timingKey !== "corp.actionPaw" &&
      state.timingKey !== "runner.actionPaw"
    ) {
      return { ok: false, cites: [CR.paidAbility, CR.triggerPaidAbilities] };
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
  corpActionPaw: CORP_STEPS.actionWindow,
  runnerActionPaw: RUNNER_STEPS.actionWindow,
  corpTakeAction: CORP_STEPS.takeAction,
  runnerTakeAction: RUNNER_STEPS.takeAction,
} as const;
