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

/** Fire a card's onSteal when present. */
export function fireOnSteal(state: GameState, cardId: string): boolean {
  const card = state.cards[cardId];
  if (!card?.onSteal) return false;
  return fireCardConditional(
    state,
    cardId,
    "onSteal",
    "on-steal",
    `${card.title} becomes pending — stolen.`,
  );
}

/** Fire a card's onFullyBreak when present. */
export function fireOnFullyBreak(state: GameState, cardId: string): boolean {
  const card = state.cards[cardId];
  if (!card?.onFullyBreak) return false;
  return fireCardConditional(
    state,
    cardId,
    "onFullyBreak",
    "on-fully-break",
    `${card.title} becomes pending — ice fully broken.`,
  );
}

/** Fire a card's onEncounterEnd when present. */
export function fireOnEncounterEnd(state: GameState, cardId: string): boolean {
  const card = state.cards[cardId];
  if (!card?.onEncounterEnd) return false;
  return fireCardConditional(
    state,
    cardId,
    "onEncounterEnd",
    "on-encounter-end",
    `${card.title} becomes pending — encounter ends.`,
  );
}

/** Fire a card's onScore when present. */
export function fireOnScore(state: GameState, cardId: string): boolean {
  const card = state.cards[cardId];
  if (!card?.onScore) return false;
  return fireCardConditional(
    state,
    cardId,
    "onScore",
    "on-score",
    `${card.title} becomes pending — scored.`,
  );
}

/** Mystic Maemi / Freedom Through Equality / Divested Trust after a steal. */
export function fireAfterAgendaStolenHooks(
  state: GameState,
  stolenId: string,
): boolean {
  const items: StoredConditionalMark[] = [];
  for (const id of [...state.runner.installed]) {
    const card = state.cards[id];
    if (!card?.onStealAgenda) continue;
    items.push({
      abilityKey: "on-steal-agenda",
      sourceId: id,
      controller: "runner",
      mandatory: true,
      effectKey: "onStealAgenda",
      logLine: `${card.title} becomes pending — agenda stolen.`,
    });
  }
  for (const card of Object.values(state.cards)) {
    if (card.zone !== "runner:play-area" || !card.onStealAgenda) continue;
    items.push({
      abilityKey: "on-steal-agenda",
      sourceId: card.id,
      controller: "runner",
      mandatory: true,
      effectKey: "onStealAgenda",
      logLine: `${card.title} becomes pending — agenda stolen.`,
    });
  }
  const corpId = state.cards[state.corp.identityId];
  if (corpId?.onAgendaStolen) {
    items.push({
      abilityKey: "on-agenda-stolen",
      sourceId: corpId.id,
      controller: "corp",
      mandatory: true,
      effectKey: "onAgendaStolen",
      logLine: `${corpId.title} becomes pending — agenda stolen.`,
    });
  }
  for (const id of [...state.corp.scoreArea]) {
    if (id === stolenId) continue;
    const card = state.cards[id];
    if (!card?.onOtherAgendaStolen) continue;
    items.push({
      abilityKey: "on-other-agenda-stolen",
      sourceId: id,
      controller: "corp",
      mandatory: true,
      effectKey: "onOtherAgendaStolen",
      logLine: `${card.title} becomes pending — other agenda stolen.`,
    });
  }
  return fireStoredConditionals(state, items);
}
