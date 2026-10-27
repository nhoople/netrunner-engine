/**
 * Card lifecycle conditionals (install / rez / play / access / forfeit /
 * break-subroutine) marked onto the pending bag (CR 9.6.2).
 */
import type { GameState } from "./types.js";
import {
  fireCardConditional,
  fireStoredConditionals,
  type StoredConditionalMark,
} from "./storedTriggers.js";

/** Fire a card's onInstall when present. */
export function fireOnInstall(state: GameState, cardId: string): boolean {
  const card = state.cards[cardId];
  if (!card?.onInstall) return false;
  return fireCardConditional(
    state,
    cardId,
    "onInstall",
    "on-install",
    `${card.title} becomes pending — installed.`,
  );
}

/** Fire a card's onRez when present. */
export function fireOnRez(state: GameState, cardId: string): boolean {
  const card = state.cards[cardId];
  if (!card?.onRez) return false;
  return fireCardConditional(
    state,
    cardId,
    "onRez",
    "on-rez",
    `${card.title} becomes pending — rezzed.`,
  );
}

/** Fire a card's onPlay when present. */
export function fireOnPlay(state: GameState, cardId: string): boolean {
  const card = state.cards[cardId];
  if (!card?.onPlay) return false;
  return fireCardConditional(
    state,
    cardId,
    "onPlay",
    "on-play",
    `${card.title} becomes pending — played.`,
  );
}

/** Fire a card's onAccess when present (caller applies skip guards). */
export function fireOnAccess(state: GameState, cardId: string): boolean {
  const card = state.cards[cardId];
  if (!card?.onAccess) return false;
  return fireCardConditional(
    state,
    cardId,
    "onAccess",
    "on-access",
    `${card.title} becomes pending — accessed.`,
  );
}

/** Fire a card's onForfeit when present. */
export function fireOnForfeit(state: GameState, cardId: string): boolean {
  const card = state.cards[cardId];
  if (!card?.onForfeit) return false;
  return fireCardConditional(
    state,
    cardId,
    "onForfeit",
    "on-forfeit",
    `${card.title} becomes pending — forfeited.`,
  );
}

/** e3 Feedback Implants / Snowball: installed Runner onBreakSubroutine. */
export function fireOnBreakSubroutineTriggers(state: GameState): boolean {
  const items: StoredConditionalMark[] = [];
  for (const id of state.runner.installed) {
    const card = state.cards[id];
    if (!card?.onBreakSubroutine) continue;
    items.push({
      abilityKey: "on-break-subroutine",
      sourceId: id,
      controller: "runner",
      mandatory: true,
      effectKey: "onBreakSubroutine",
      logLine: `${card.title} becomes pending — subroutine broken.`,
    });
  }
  return fireStoredConditionals(state, items);
}
