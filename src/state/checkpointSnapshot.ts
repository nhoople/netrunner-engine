/**
 * Checkpoint game-state facts for CR 10.3.1a / 9.6.6 / 9.6.6a.
 * Conditionals compare changes since the previous checkpoint's 10.3.1a.
 */
import type {
  CheckpointFacts,
  CheckpointSnapshot,
  GameState,
} from "./types.js";

/** Capture the current "had" facts at the start of 10.3.1a. */
export function captureCheckpointFacts(state: GameState): CheckpointFacts {
  const cardZones: Record<string, string> = {};
  const cardFaceup: Record<string, boolean> = {};
  const cardRezzed: Record<string, boolean> = {};
  for (const [id, card] of Object.entries(state.cards)) {
    cardZones[id] = card.zone;
    cardFaceup[id] = Boolean(card.faceup);
    cardRezzed[id] = Boolean(card.rezzed);
  }
  return {
    cardZones,
    cardFaceup,
    cardRezzed,
    corpCredits: state.corp.credits,
    runnerCredits: state.runner.credits,
    corpTags: state.corp.tags ?? 0,
    runnerTags: state.runner.tags ?? 0,
  };
}

export function captureCheckpointSnapshot(
  state: GameState,
  checkpointId: string | null,
): CheckpointSnapshot {
  return {
    checkpointId,
    facts: captureCheckpointFacts(state),
  };
}

export interface CheckpointDiff {
  zoneChangedIds: string[];
  faceupChangedIds: string[];
  rezzedChangedIds: string[];
  corpCreditsDelta: number;
  runnerCreditsDelta: number;
  corpTagsDelta: number;
  runnerTagsDelta: number;
}

/**
 * Diff current state against the previous checkpoint snapshot ("had").
 * When there is no previous snapshot (game start), every present card counts
 * as a zone change so early checkpoints still have a comparable baseline.
 */
export function diffAgainstPreviousCheckpoint(state: GameState): CheckpointDiff {
  const prev = state.previousCheckpointSnapshot?.facts;
  const now = captureCheckpointFacts(state);
  if (!prev) {
    return {
      zoneChangedIds: Object.keys(now.cardZones),
      faceupChangedIds: Object.keys(now.cardFaceup).filter((id) => now.cardFaceup[id]),
      rezzedChangedIds: Object.keys(now.cardRezzed).filter((id) => now.cardRezzed[id]),
      corpCreditsDelta: 0,
      runnerCreditsDelta: 0,
      corpTagsDelta: 0,
      runnerTagsDelta: 0,
    };
  }
  const ids = new Set([
    ...Object.keys(prev.cardZones),
    ...Object.keys(now.cardZones),
  ]);
  const zoneChangedIds: string[] = [];
  const faceupChangedIds: string[] = [];
  const rezzedChangedIds: string[] = [];
  for (const id of ids) {
    if (prev.cardZones[id] !== now.cardZones[id]) zoneChangedIds.push(id);
    if (Boolean(prev.cardFaceup[id]) !== Boolean(now.cardFaceup[id])) {
      faceupChangedIds.push(id);
    }
    if (Boolean(prev.cardRezzed[id]) !== Boolean(now.cardRezzed[id])) {
      rezzedChangedIds.push(id);
    }
  }
  return {
    zoneChangedIds,
    faceupChangedIds,
    rezzedChangedIds,
    corpCreditsDelta: now.corpCredits - prev.corpCredits,
    runnerCreditsDelta: now.runnerCredits - prev.runnerCredits,
    corpTagsDelta: now.corpTags - prev.corpTags,
    runnerTagsDelta: now.runnerTags - prev.runnerTags,
  };
}

/** Store the current facts as the baseline for the next checkpoint. */
export function commitCheckpointSnapshot(
  state: GameState,
  checkpointId: string | null,
): void {
  state.previousCheckpointSnapshot = captureCheckpointSnapshot(
    state,
    checkpointId,
  );
}
