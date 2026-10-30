/** First agenda scored/stolen this turn (Phật Gioan-class). */

import { abilitiesSuppressed } from "./abilities.js";
import type { GameState } from "./types.js";

/**
 * Phật Gioan-class: first agenda scored or stolen this turn. Records the
 * condition for the next 10.3.1a scanner pass (phase 3). Does not mark
 * pending here.
 */
export function fireFirstAgendaScoredOrStolenThisTurn(state: GameState): void {
  if (state.turn.firstAgendaScoredOrStolenUsedThisTurn) return;
  if (state.turn.firstAgendaScoredOrStolenMetPending) return;
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root, ...server.ice]) {
      const card = state.cards[id];
      if (!card?.onFirstAgendaScoredOrStolenThisTurn) continue;
      if (!card.rezzed && !card.persistent) continue;
      if (abilitiesSuppressed(state, id)) continue;
      state.turn.firstAgendaScoredOrStolenMetPending = true;
      return;
    }
  }
}
