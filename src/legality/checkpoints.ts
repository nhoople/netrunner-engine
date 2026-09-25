import type {
  CheckpointFrame,
  CheckpointKind,
  ForbiddenAction,
  GameState,
  Restriction,
  RuleCite,
} from "../state/types.js";
import { CR } from "../timing/labels.js";

let checkpointSeq = 0;

export function pushCheckpoint(
  state: GameState,
  kind: CheckpointKind,
  label: string,
  cites: RuleCite[],
  openedBy: string,
): CheckpointFrame {
  const frame: CheckpointFrame = {
    id: `cp-${++checkpointSeq}`,
    kind,
    label,
    cites,
    openedBy,
  };
  state.checkpoints.push(frame);
  state.log.push(
    `Checkpoint open [${kind}] ${label} (${cites.map((c) => c.number).join(", ")}) ← ${openedBy}`,
  );
  return frame;
}

export function popCheckpoint(state: GameState, expectedId?: string): CheckpointFrame | null {
  const frame = state.checkpoints.pop() ?? null;
  if (!frame) return null;
  if (expectedId && frame.id !== expectedId) {
    state.log.push(
      `Checkpoint mismatch: expected ${expectedId}, closed ${frame.id}`,
    );
  }
  state.log.push(
    `Checkpoint close [${frame.kind}] ${frame.label} (${frame.cites.map((c) => c.number).join(", ")})`,
  );
  return frame;
}

export function currentCheckpoint(state: GameState): CheckpointFrame | null {
  return state.checkpoints[state.checkpoints.length - 1] ?? null;
}

/** Run a paid cost inside a cost checkpoint (CR 1.16.3). */
export function withCostCheckpoint(
  state: GameState,
  openedBy: string,
  pay: () => void,
): void {
  const frame = pushCheckpoint(
    state,
    "cost",
    "Cost checkpoint",
    [CR.costCheckpoint],
    openedBy,
  );
  pay();
  popCheckpoint(state, frame.id);
}

/** Close a priority window with a timing/priority checkpoint stub (CR 9.2.4 / 9.11.1b). */
export function closePriorityWindow(
  state: GameState,
  stepKey: string,
): void {
  const frame = pushCheckpoint(
    state,
    "priority_window",
    "Priority window closes",
    [CR.priorityWindow, CR.timingCheckpoint],
    stepKey,
  );
  // Nested resolve stub: nothing pending in v0 beyond the log frame.
  popCheckpoint(state, frame.id);
}

export function addRestriction(
  state: GameState,
  forbid: ForbiddenAction,
  cite: RuleCite,
  source: string,
): void {
  state.restrictions.push({ forbid, cite, source });
  state.log.push(
    `Cannot ${forbid} (CR ${cite.number} / ${CR.cannotPrecedence.number}) from ${source}`,
  );
}

export function clearRestrictionsFrom(state: GameState, source: string): void {
  state.restrictions = state.restrictions.filter((r) => r.source !== source);
}

export function findRestriction(
  state: GameState,
  forbid: ForbiddenAction,
): Restriction | undefined {
  return state.restrictions.find((r) => r.forbid === forbid);
}

export function isForbidden(
  state: GameState,
  forbid: ForbiddenAction,
): Restriction | undefined {
  if (forbid === "jack_out" && state.run?.cannotJackOut) {
    return (
      findRestriction(state, "jack_out") ?? {
        forbid: "jack_out",
        cite: CR.cannotPrecedence,
        source: "run.cannotJackOut",
      }
    );
  }
  return findRestriction(state, forbid);
}
