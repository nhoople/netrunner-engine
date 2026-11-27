import type {
  Action,
  GameState,
  TimingCursor,
  TurnPhase,
} from "../state/types.js";
import { resumePendingStoredConditionals } from "../state/triggers/storedTriggers.js";
import {
  turnBeginPaused,
  pendingTurnBeginIds,
  noteOpenTurnBeginWaiting,
  type StepKind,
} from "./graph/stepHelpers.js";
import { OPENING_STEP_DEFS } from "./graph/openingSteps.js";
import { CORP_TURN_STEP_DEFS } from "./graph/corpTurnSteps.js";
import { RUNNER_TURN_STEP_DEFS } from "./graph/runnerTurnSteps.js";
import { RUN_INITIATION_STEP_DEFS } from "./graph/runInitiationSteps.js";
import { APPROACH_ICE_STEP_DEFS } from "./graph/approachIceSteps.js";
import { ENCOUNTER_ICE_STEP_DEFS } from "./graph/encounterIceSteps.js";
import { MOVEMENT_STEP_DEFS } from "./graph/movementSteps.js";
import { SUCCESS_STEP_DEFS } from "./graph/successSteps.js";
import { RUN_ENDS_STEP_DEFS } from "./graph/runEndsSteps.js";
import { BREACH_STEP_DEFS } from "./graph/breachSteps.js";

/**
 * Resume still-pending Runner turn-begin instances left on the bag when an
 * earlier one opened an interrupt (CR 9.6.5d). Newly-marked checkpoint scoop
 * (CR 10.3.2) keeps nested checkpoints from stealing these leftovers.
 */
export function resumeRunnerTurnBeginAbilities(state: GameState): void {
  if (turnBeginPaused(state)) return;
  const turnBegin = new Set(pendingTurnBeginIds(state));
  if (turnBegin.size === 0) return;
  // Abilities that became pending while the turn-begin window was paused
  // are in a nested window and resolve first (CR 9.2.8a); then the
  // turn-begin window itself. Older windows are not this structure's.
  resumePendingStoredConditionals(state, (ids) =>
    ids.some((id) => turnBegin.has(id)),
  );
  noteOpenTurnBeginWaiting(state);
}

export interface TimingStepDef {
  key: string;
  structure: TimingCursor["structure"];
  /** Stable appendix / deep-link id from timing-structures.json */
  stepId: string;
  stepNumber: string;
  label: string;
  kind: StepKind;
  /** Derived turn phase while parked on this step (null during nested run). */
  turnPhase: TurnPhase | null;
  /** Extra action types legal here (pass/discard/access implied by kind). */
  allows?: ReadonlyArray<Action["type"]>;
  next: string | ((state: GameState) => string);
  onResolve?: (state: GameState) => void;
}

export function cursorFrom(step: TimingStepDef): TimingCursor {
  return {
    structure: step.structure,
    stepId: step.stepId,
    stepNumber: step.stepNumber,
    label: step.label,
  };
}

export const STEPS: Record<string, TimingStepDef> = {
  ...OPENING_STEP_DEFS,
  ...CORP_TURN_STEP_DEFS,
  ...RUNNER_TURN_STEP_DEFS,
  ...RUN_INITIATION_STEP_DEFS,
  ...APPROACH_ICE_STEP_DEFS,
  ...ENCOUNTER_ICE_STEP_DEFS,
  ...MOVEMENT_STEP_DEFS,
  ...SUCCESS_STEP_DEFS,
  ...RUN_ENDS_STEP_DEFS,
  ...BREACH_STEP_DEFS,
};

/** Game starts at Corp mulligan (CR 1.6.6a); first turn step remains corp.gainClicks. */
export const START_STEP = "opening.corpMulligan";

/** Convenience aliases used by older call sites / tests. */
export const CORP_STEPS = {
  gainClicks: STEPS["corp.gainClicks"],
  mandatoryDraw: STEPS["corp.mandatoryDraw"],
  actionPaw: STEPS["corp.actionPaw"],
  takeAction: STEPS["corp.takeAction"],
  actionPhaseEnd: STEPS["corp.actionPhaseEnd"],
  discard: STEPS["corp.discard"],
  turnComplete: STEPS["corp.turnComplete"],
} as const;

export const RUNNER_STEPS = {
  gainClicks: STEPS["runner.gainClicks"],
  actionPaw: STEPS["runner.actionPaw"],
  takeAction: STEPS["runner.takeAction"],
  actionPhaseEnd: STEPS["runner.actionPhaseEnd"],
  discard: STEPS["runner.discard"],
  turnComplete: STEPS["runner.turnComplete"],
} as const;

export const RUN_STEPS = {
  announce: STEPS["run.announce"],
  fillBpFund: STEPS["run.fillBpFund"],
  begin: STEPS["run.begin"],
  checkIce: STEPS["run.checkIce"],
  approachServer: STEPS["run.approachServer"],
  success: STEPS["run.success"],
  breach: STEPS["run.breachLink"],
  closePriorityWindows: STEPS["run.closePriorityWindows"],
  completeOtherPriorityWindows: STEPS["run.completeOtherPriorityWindows"],
  emptyBpFund: STEPS["run.emptyBpFund"],
  declareUnsuccessful: STEPS["run.declareUnsuccessful"],
  runEnds: STEPS["run.ends"],
} as const;

export const BREACH_STEPS = {
  begin: STEPS["breach.begin"],
  choose: STEPS["breach.choose"],
  access: STEPS["breach.access"],
  complete: STEPS["breach.complete"],
  awaitAccess: STEPS["breach.awaitAccess"],
  cardAccessed: STEPS["access.cardAccessed"],
  midAccess: STEPS["access.midAccess"],
  stealAgenda: STEPS["access.stealAgenda"],
  accessComplete: STEPS["access.complete"],
} as const;
