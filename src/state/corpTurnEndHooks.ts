/**
 * Corp turn-end conditionals (onCorpTurnEnd / onScoreTurnEnd). Notes queues
 * for 10.3.1a (phase 3).
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

/**
 * Queue onScoreTurnEnd for an agenda scored this turn (Viral Weaponization).
 * Clears scoredThisTurn when noted so the condition is one-shot.
 */
export function noteOnScoreTurnEnd(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card?.scoredThisTurn || !card.onScoreTurnEnd) return;
  if (abilitiesSuppressed(state, cardId)) return;
  card.scoredThisTurn = false;
  if (!state.turn.scoreTurnEndPendingIds) {
    state.turn.scoreTurnEndPendingIds = [];
  }
  if (state.turn.scoreTurnEndPendingIds.includes(cardId)) return;
  state.turn.scoreTurnEndPendingIds.push(cardId);
}
