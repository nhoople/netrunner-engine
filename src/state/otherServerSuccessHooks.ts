/**
 * Successful run on another server (Sacrifice Zone). Notes queues for 10.3.1a
 * (phase 3). Caller tracks once-per-turn used ids.
 */
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState } from "./types.js";

/**
 * Queue a faceup/rezzed root card whose onSuccessfulRunOtherServerOncePerTurn
 * met. Caller filters attacked server and once-per-turn used set.
 */
export function noteSuccessfulRunOtherServer(
  state: GameState,
  cardId: string,
): void {
  const card = state.cards[cardId];
  if (!card?.onSuccessfulRunOtherServerOncePerTurn) return;
  if (abilitiesSuppressed(state, cardId)) return;
  // Public faceup agendas are neither rezzed nor unrezzed.
  if (!card.faceup && !card.rezzed) return;
  if (!state.turn.otherServerSuccessPendingIds) {
    state.turn.otherServerSuccessPendingIds = [];
  }
  if (state.turn.otherServerSuccessPendingIds.includes(cardId)) return;
  state.turn.otherServerSuccessPendingIds.push(cardId);
}
