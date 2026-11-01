/**
 * Card lifecycle conditionals (install / rez / play / access / forfeit /
 * break-subroutine) marked onto the pending bag (CR 9.6.2).
 */
import { playEffectFromCard } from "../effects/abilityRecord.js";
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState } from "./types.js";
import {
  fireCardConditional,
  resumePendingStoredConditionals,
  type StoredConditionalMark,
} from "./storedTriggers.js";
import {
  noteStoredConditional,
  noteStoredConditionals,
} from "./storedConditionalHooks.js";
import {
  checkpointAfterInstruction,
  occurCheckpoint,
} from "../legality/checkpoints.js";
import { log } from "./createGame.js";
import { CR } from "../timing/labels.js";

function noteAndCheckpointStored(
  state: GameState,
  items: StoredConditionalMark[],
  openedBy: string,
): boolean {
  noteStoredConditionals(state, items);
  if ((state.turn.storedConditionalPending ?? []).length === 0) return false;
  checkpointAfterInstruction(state, openedBy);
  return Boolean(
    state.pendingChoice ||
      state.pendingTags ||
      state.pendingDamage ||
      state.psi ||
      state.trace ||
      state.done,
  );
}

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

/**
 * Note a card's play ability for the CR 8.6.7e play checkpoint (CR 9.3.7d /
 * 10.3.1a). Caller must open that checkpoint next; on-play marks there and
 * resolves at 8.6.7f (see resolveNotedPlayAbilities / play.ts).
 * The play record is the source. Resume reads effectKey "onPlay" through
 * playEffectFromCard.
 */
export function fireOnPlay(state: GameState, cardId: string): boolean {
  const card = state.cards[cardId];
  if (!card) return false;
  const effect = playEffectFromCard(card);
  if (!effect) return false;
  // Play abilities may resolve after the card is trashed (8.6.7g) or from
  // effect-path shortcuts that archive first — keep the mark (CR 9.6.13c).
  noteStoredConditional(state, {
    cardId,
    abilityKey: "on-play",
    effectKey: "onPlay",
    controller: card.side === "corp" ? "corp" : "runner",
    mandatory: true,
    logLine: `${card.title} becomes pending — played.`,
    independentOfSource: true,
  });
  return true;
}

/**
 * Nested / effect-path plays (e.g. Accelerated Diagnostics): note onPlay,
 * open the 8.6.7e play checkpoint, then resolve at 8.6.7f.
 */
export function noteCheckpointAndResolvePlay(
  state: GameState,
  cardId: string,
  openedBy: string,
): boolean {
  const noted = fireOnPlay(state, cardId);
  occurCheckpoint(
    state,
    "play",
    "Play checkpoint",
    [CR.playCheckpoint, CR.playPause],
    openedBy,
  );
  const card = state.cards[cardId];
  if (card) {
    log(
      state,
      `Resolve play abilities of ${card.title} (CR ${CR.playAbilities.number}).`,
    );
  }
  resumePendingStoredConditionals(state);
  return noted;
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
    if (abilitiesSuppressed(state, id)) continue;
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
  return noteAndCheckpointStored(state, items, "lifecycle.breakSubroutine");
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

/** Fire a card's onMovedToServerRoot when present. */
export function fireOnMovedToServerRoot(
  state: GameState,
  cardId: string,
): boolean {
  const card = state.cards[cardId];
  if (!card?.onMovedToServerRoot) return false;
  return fireCardConditional(
    state,
    cardId,
    "onMovedToServerRoot",
    "on-moved-to-server-root",
    `${card.title} becomes pending — moved to a server root.`,
  );
}

/** Mystic Maemi / Freedom Through Equality / Divested Trust after a steal. */
export function fireAfterAgendaStolenHooks(
  state: GameState,
  stolenId: string,
): boolean {
  const items: StoredConditionalMark[] = [];
  for (const id of [...state.runner.installed]) {
    if (abilitiesSuppressed(state, id)) continue;
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
    if (abilitiesSuppressed(state, card.id)) continue;
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
    if (abilitiesSuppressed(state, id)) continue;
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
  return noteAndCheckpointStored(state, items, "lifecycle.afterAgendaStolen");
}
