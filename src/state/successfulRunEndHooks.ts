/**
 * Successful-run-end conditionals (Doppelgänger / Dedicated Response Team).
 * Notes queues for 10.3.1a (phase 3).
 */
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState } from "./types.js";

/**
 * Queue a Runner-installed onSuccessfulRunEndOncePerTurn card id.
 * Caller tracks once-per-turn fired ids.
 */
export function noteSuccessfulRunEndOncePerTurn(
  state: GameState,
  cardId: string,
): void {
  const card = state.cards[cardId];
  if (!card?.onSuccessfulRunEndOncePerTurn) return;
  if (abilitiesSuppressed(state, cardId)) return;
  if (!state.turn.successfulRunEndOncePendingIds) {
    state.turn.successfulRunEndOncePendingIds = [];
  }
  if (state.turn.successfulRunEndOncePendingIds.includes(cardId)) return;
  state.turn.successfulRunEndOncePendingIds.push(cardId);
}

/** Queue a rezzed Corp onSuccessfulRunEnd card id. */
export function noteSuccessfulRunEnd(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card?.rezzed || !card.onSuccessfulRunEnd) return;
  if (abilitiesSuppressed(state, cardId)) return;
  if (!state.turn.successfulRunEndPendingIds) {
    state.turn.successfulRunEndPendingIds = [];
  }
  if (state.turn.successfulRunEndPendingIds.includes(cardId)) return;
  state.turn.successfulRunEndPendingIds.push(cardId);
}
