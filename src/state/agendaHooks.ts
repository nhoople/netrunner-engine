/** First agenda scored/stolen this turn (Phật Gioan-class). */

import { evalEffect } from "../effects/eval.js";
import { log } from "./createGame.js";
import type { GameState } from "./types.js";

export function fireFirstAgendaScoredOrStolenThisTurn(state: GameState): void {
  if (state.turn.firstAgendaScoredOrStolenUsedThisTurn) return;
  state.turn.firstAgendaScoredOrStolenUsedThisTurn = true;
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root, ...server.ice]) {
      const card = state.cards[id];
      if (!card?.onFirstAgendaScoredOrStolenThisTurn) continue;
      if (!card.rezzed && !card.persistent) continue;
      log(
        state,
        `${card.title} — first agenda scored or stolen this turn.`,
      );
      const r = evalEffect(
        { state, sourceId: id },
        card.onFirstAgendaScoredOrStolenThisTurn,
      );
      if (!r.ok) {
        log(
          state,
          `onFirstAgendaScoredOrStolenThisTurn failed on ${card.title}: ${r.error}`,
        );
      }
    }
  }
}
