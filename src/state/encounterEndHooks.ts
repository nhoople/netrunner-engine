/**
 * Encounter-end conditionals (rezzed / rezzed-this-turn / not-fully-broken /
 * printed-subroutine-broken). Notes queues for 10.3.1a (phase 3).
 */
import type { GameState } from "./types.js";

function pushPendingIceId(
  state: GameState,
  key:
    | "encounterEndPendingIds"
    | "encounterEndRezzedThisTurnPendingIds"
    | "encounterEndNotFullyBrokenPendingIds"
    | "encounterEndPrintedSubBrokenPendingIds",
  iceId: string,
): void {
  if (!state.turn[key]) {
    state.turn[key] = [];
  }
  if (state.turn[key]!.includes(iceId)) return;
  state.turn[key]!.push(iceId);
}

/** Knowledge Seeker-class: encounter with this rezzed ice ends. */
export function noteEncounterEndIfRezzed(
  state: GameState,
  iceId: string,
): void {
  const ice = state.cards[iceId];
  if (!ice?.onEncounterEnd || !ice.rezzed) return;
  pushPendingIceId(state, "encounterEndPendingIds", iceId);
}

/** Cloud Eater: encounter ends if this ice was rezzed this turn. */
export function noteEncounterEndIfRezzedThisTurn(
  state: GameState,
  iceId: string,
): void {
  const ice = state.cards[iceId];
  if (!ice?.onEncounterEndIfRezzedThisTurn) return;
  pushPendingIceId(state, "encounterEndRezzedThisTurnPendingIds", iceId);
}

/** Anansi: encounter ends without a full break. */
export function noteEncounterEndIfNotFullyBroken(
  state: GameState,
  iceId: string,
): void {
  const ice = state.cards[iceId];
  if (!ice?.onEncounterEndIfNotFullyBroken) return;
  pushPendingIceId(state, "encounterEndNotFullyBrokenPendingIds", iceId);
}

/** Mirāju: encounter ends after a printed subroutine was broken. */
export function noteEncounterEndIfPrintedSubroutineBroken(
  state: GameState,
  iceId: string,
): void {
  const ice = state.cards[iceId];
  if (!ice?.onEncounterEndIfPrintedSubroutineBroken) return;
  pushPendingIceId(state, "encounterEndPrintedSubBrokenPendingIds", iceId);
}
