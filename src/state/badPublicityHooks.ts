/** Bad publicity take hooks (The Outfit; Editorial Division). */

import { abilitiesSuppressed } from "./abilities.js";
import { evalEffect } from "../effects/eval.js";
import { log } from "./createGame.js";
import type { GameState } from "./types.js";

/**
 * After Corp takes ≥1 bad publicity:
 * - The Outfit-class: gain credits every take (`gainCreditsOnEachBadPublicityTake`)
 * - Editorial Division-class: once-per-turn `onFirstBadPublicityTakeEachTurn`
 */
export function fireFirstBadPublicityTake(state: GameState, amount: number): void {
  if (amount <= 0) return;
  const identity = state.cards[state.corp.identityId];
  if (
    identity &&
    typeof identity.gainCreditsOnEachBadPublicityTake === "number" &&
    !abilitiesSuppressed(state, identity.id)
  ) {
    const n = identity.gainCreditsOnEachBadPublicityTake;
    state.corp.credits += n;
    log(
      state,
      `${identity.title} — gain ${n}¢ (took bad publicity) → ${state.corp.credits}¢.`,
    );
  }
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
