/**
 * Runner turn-end conditionals (onRunnerTurnEnd). Notes queues for 10.3.1a
 * (phase 3).
 */
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState } from "./types.js";

/** Queue a card id whose onRunnerTurnEnd met. */
export function noteOnRunnerTurnEnd(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card?.onRunnerTurnEnd) return;
  if (abilitiesSuppressed(state, cardId)) return;
  if (!state.turn.runnerTurnEndPendingIds) {
    state.turn.runnerTurnEndPendingIds = [];
  }
  if (state.turn.runnerTurnEndPendingIds.includes(cardId)) return;
  state.turn.runnerTurnEndPendingIds.push(cardId);
}
