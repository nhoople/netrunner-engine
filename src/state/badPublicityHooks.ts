/** Bad publicity take hooks (The Outfit; Editorial Division). */

import { abilitiesSuppressed } from "./abilities.js";
import { log } from "./createGame.js";
import type { GameState } from "./types.js";

/**
 * After Corp takes ≥1 bad publicity:
 * - Runner onEachCorpBadPublicityTake: queue a take-event for the next 10.3.1a
 * - The Outfit-class: gain credits every take (immediate continuous gain)
 * - Editorial Division-class: once-per-turn flag for the next 10.3.1a
 *
 * Pending marks are owned by `markConditionalAbilities` (phase 3).
 */
export function fireFirstBadPublicityTake(state: GameState, amount: number): void {
  if (amount <= 0) return;

  let hasEachTake = false;
  for (const id of state.runner.installed) {
    const card = state.cards[id];
    if (!card?.onEachCorpBadPublicityTake) continue;
    if (abilitiesSuppressed(state, id)) continue;
    hasEachTake = true;
    break;
  }
  if (hasEachTake) {
    state.turn.corpBadPublicityTakeEventsPending += 1;
  }

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
  if (state.turn.firstBadPublicityMetPending) return;
  const candidates = [state.corp.identityId];
  for (const server of Object.values(state.servers)) {
    for (const id of server.root) candidates.push(id);
  }
  for (const id of candidates) {
    const card = state.cards[id];
    if (!card?.onFirstBadPublicityTakeEachTurn) continue;
    if (card.type !== "identity" && !card.rezzed) continue;
    if (abilitiesSuppressed(state, id)) continue;
    state.turn.firstBadPublicityMetPending = true;
    return;
  }
}
