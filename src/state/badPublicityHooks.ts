/** Editorial Division-class: first bad publicity take each turn. */

import { abilitiesSuppressed } from "./abilities.js";
import { evalEffect } from "../effects/eval.js";
import { log } from "./createGame.js";
import type { GameState } from "./types.js";

/**
 * After Corp takes ≥1 bad publicity, fire once-per-turn identity (or other)
 * `onFirstBadPublicityTakeEachTurn` effects.
 */
export function fireFirstBadPublicityTake(state: GameState, amount: number): void {
  if (amount <= 0) return;
  if (state.turn.firstBadPublicityTakeUsedThisTurn) return;
  const candidates = [state.corp.identityId];
  for (const server of Object.values(state.servers)) {
    for (const id of server.root) candidates.push(id);
  }
  for (const id of candidates) {
    const card = state.cards[id];
    if (!card?.onFirstBadPublicityTakeEachTurn) continue;
    if (card.type !== "identity" && !card.rezzed) continue;
    if (abilitiesSuppressed(state, id)) continue;
    state.turn.firstBadPublicityTakeUsedThisTurn = true;
    const r = evalEffect(
      { state, sourceId: id },
      card.onFirstBadPublicityTakeEachTurn,
    );
    if (!r.ok) {
      log(
        state,
        `onFirstBadPublicityTakeEachTurn failed on ${card.title}: ${r.error}`,
      );
    }
    return;
  }
}
