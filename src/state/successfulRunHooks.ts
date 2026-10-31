/**
 * Successful-run conditionals (onSuccessfulRun). Notes queues for 10.3.1a
 * (phase 3). Caller tracks once-per-turn fired ids.
 */
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState } from "./types.js";

/** Queue a card id whose onSuccessfulRun met. */
export function noteOnSuccessfulRun(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card?.onSuccessfulRun) return;
  if (abilitiesSuppressed(state, cardId)) return;
  if (!state.turn.successfulRunPendingIds) {
    state.turn.successfulRunPendingIds = [];
  }
  if (state.turn.successfulRunPendingIds.includes(cardId)) return;
  state.turn.successfulRunPendingIds.push(cardId);
}
