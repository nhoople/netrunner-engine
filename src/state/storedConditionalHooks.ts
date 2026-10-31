/**
 * Off-graph stored Effect-key conditionals. Notes for 10.3.1a (phase 3).
 */
import type { GameState, Side, StoredConditionalEffectKey } from "./types.js";
import type { StoredConditionalMark } from "./storedTriggers.js";

export type StoredConditionalPendingMark = {
  cardId: string;
  abilityKey: string;
  effectKey: StoredConditionalEffectKey;
  controller: Side;
  mandatory: boolean;
  logLine: string;
  /** Trash / delayed abilities that outlive the source (CR 9.6.13c). */
  independentOfSource?: boolean;
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

export type NoteStoredConditionalOptions = {
  /** Trash / delayed abilities that outlive the source (CR 9.6.13c). */
  independentOfSource?: boolean;
};

/** Queue many marks (StoredConditionalMark shape) for the next 10.3.1a. */
export function noteStoredConditionals(
  state: GameState,
  items: StoredConditionalMark[],
  options?: NoteStoredConditionalOptions,
): void {
  for (const item of items) {
    noteStoredConditional(state, {
      cardId: item.sourceId,
      abilityKey: item.abilityKey,
      effectKey: item.effectKey,
      controller: item.controller,
      mandatory: item.mandatory,
      logLine: item.logLine,
      independentOfSource: options?.independentOfSource,
    });
  }
}
