/** First agenda scored/stolen this turn (Phật Gioan-class). */

import type { GameState } from "./types.js";
import {
  fireStoredConditionals,
  type StoredConditionalMark,
} from "./storedTriggers.js";

export function fireFirstAgendaScoredOrStolenThisTurn(state: GameState): void {
  if (state.turn.firstAgendaScoredOrStolenUsedThisTurn) return;
  state.turn.firstAgendaScoredOrStolenUsedThisTurn = true;
  const items: StoredConditionalMark[] = [];
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root, ...server.ice]) {
      const card = state.cards[id];
      if (!card?.onFirstAgendaScoredOrStolenThisTurn) continue;
      if (!card.rezzed && !card.persistent) continue;
      items.push({
        abilityKey: "on-first-agenda-scored-or-stolen",
        sourceId: id,
        controller: "corp",
        mandatory: true,
        effectKey: "onFirstAgendaScoredOrStolenThisTurn",
        logLine: `${card.title} becomes pending — first agenda scored or stolen this turn.`,
      });
    }
  }
  fireStoredConditionals(state, items);
}
