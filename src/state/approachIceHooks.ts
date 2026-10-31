/**
 * Approach-ice root conditionals (Midori / Mitra Aman) and first successful
 * R&D run-end (Psych Mike). Notes queues / MetPending for 10.3.1a (phase 3).
 */
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState } from "./types.js";

/** Queue a rezzed root onApproachIce card id for 10.3.1a. */
export function noteOnApproachIce(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card?.rezzed || !card.onApproachIce) return;
  if (abilitiesSuppressed(state, cardId)) return;
  if (!state.turn.approachIcePendingIds) {
    state.turn.approachIcePendingIds = [];
  }
  if (state.turn.approachIcePendingIds.includes(cardId)) return;
  state.turn.approachIcePendingIds.push(cardId);
}

/**
 * Psych Mike-class: first successful R&D run end this turn — note for
 * 10.3.1a. Used flag is set when marked pending.
 */
export function noteFirstSuccessfulRunOnRdEnds(state: GameState): void {
  if (state.turn.firstSuccessfulRdRunEndUsedThisTurn) return;
  if (state.turn.firstSuccessfulRdRunEndMetPending) return;
  const has = state.runner.installed.some((id) => {
    if (abilitiesSuppressed(state, id)) return false;
    return Boolean(state.cards[id]?.onFirstSuccessfulRunOnRdEndsThisTurn);
  });
  if (!has) return;
  state.turn.firstSuccessfulRdRunEndMetPending = true;
}
