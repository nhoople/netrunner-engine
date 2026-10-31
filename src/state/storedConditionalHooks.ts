/**
 * Off-graph stored Effect-key conditionals. Notes for 10.3.1a (phase 3).
 */
import type { GameState, Side, StoredConditionalEffectKey } from "./types.js";

export type StoredConditionalPendingMark = {
  cardId: string;
  abilityKey: string;
  effectKey: StoredConditionalEffectKey;
  controller: Side;
  mandatory: boolean;
  logLine: string;
};

/** Queue a stored Effect-key conditional for the next 10.3.1a checkpoint. */
export function noteStoredConditional(
  state: GameState,
  mark: StoredConditionalPendingMark,
): void {
  if (!state.turn.storedConditionalPending) {
    state.turn.storedConditionalPending = [];
  }
  const q = state.turn.storedConditionalPending;
  if (
    q.some(
      (m) =>
        m.cardId === mark.cardId &&
        m.abilityKey === mark.abilityKey &&
        m.effectKey === mark.effectKey &&
        m.logLine === mark.logLine,
    )
  ) {
    return;
  }
  q.push(mark);
}
