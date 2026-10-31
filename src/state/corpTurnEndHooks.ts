/**
 * Corp turn-end conditionals (onCorpTurnEnd). Notes queues for 10.3.1a
 * (phase 3).
 */
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState } from "./types.js";

/** Queue a card id whose onCorpTurnEnd met. */
export function noteOnCorpTurnEnd(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card?.onCorpTurnEnd) return;
  if (abilitiesSuppressed(state, cardId)) return;
  if (!state.turn.corpTurnEndPendingIds) {
    state.turn.corpTurnEndPendingIds = [];
  }
  if (state.turn.corpTurnEndPendingIds.includes(cardId)) return;
  state.turn.corpTurnEndPendingIds.push(cardId);
}
