/**
 * Successful R&D run conditionals (Chakana). Notes queues for 10.3.1a (phase 3).
 */
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState } from "./types.js";

/** Queue a Runner-installed onSuccessfulRunOnRd card id. */
export function noteSuccessfulRunOnRd(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card?.onSuccessfulRunOnRd) return;
  if (abilitiesSuppressed(state, cardId)) return;
  if (!state.turn.successfulRunOnRdPendingIds) {
    state.turn.successfulRunOnRdPendingIds = [];
  }
  if (state.turn.successfulRunOnRdPendingIds.includes(cardId)) return;
  state.turn.successfulRunOnRdPendingIds.push(cardId);
}
