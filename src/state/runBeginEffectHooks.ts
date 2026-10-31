/**
 * onRunBegin Effect conditionals (rig + lockdowns). Notes queues for 10.3.1a
 * (phase 3). Distinct from first-* run-begin MetPending families.
 */
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState } from "./types.js";

/** Queue a card id whose onRunBegin met. */
export function noteOnRunBegin(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card?.onRunBegin) return;
  if (abilitiesSuppressed(state, cardId)) return;
  if (!state.turn.runBeginPendingIds) {
    state.turn.runBeginPendingIds = [];
  }
  if (state.turn.runBeginPendingIds.includes(cardId)) return;
  state.turn.runBeginPendingIds.push(cardId);
}
