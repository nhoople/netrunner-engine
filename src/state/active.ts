/**
 * Whether a card is active (CR 1.8.3, 1.8.4). The one place that answers it.
 *
 * - Active (CR 1.8.3a): installed faceup Runner cards, installed rezzed Corp
 *   cards, events and operations in the play area, agendas in the Corp's
 *   score area, and both identities.
 * - Inactive (CR 1.8.4a): cards in R&D, HQ, Archives, the heap, the grip,
 *   the stack and the Runner's score area, set aside or removed from the
 *   game, and facedown cards in the play area. A facedown installed Runner
 *   card has no characteristics and none of its abilities are active
 *   (CR 8.1.4a).
 *
 * `abilitiesSuppressed` (`abilities.ts`) reads `facedownInstalledRunnerCard`,
 * so every reader of an installed Runner card's abilities skips a facedown
 * one. Readers of a source that must be in play (Rumor Mill, the blanking
 * and subtype layers, Trieste Model Bioroids) ask `isCardActive`.
 */
import type { GameState } from "./types.js";

const SERVER_ZONE = /^server:[^:]+:(root|ice)$/;

/**
 * An installed Runner card that is facedown (CR 8.1.4a): inactive, with no
 * characteristics and no active abilities.
 */
export function facedownInstalledRunnerCard(
  state: GameState,
  cardId: string,
): boolean {
  const card = state.cards[cardId];
  if (!card || card.side !== "runner" || card.type === "identity") {
    return false;
  }
  return card.faceup === false && state.runner.installed.includes(cardId);
}

/**
 * Whether `cardId` is an installed card whose activity depends on its face:
 * an asset, upgrade or ice in a server (active while rezzed), or an
 * installed Runner card (active while faceup) (CR 1.8.3a, 8.1.4a). Returns
 * null for any other card.
 */
export function installedCardActive(
  state: GameState,
  cardId: string,
): boolean | null {
  const card = state.cards[cardId];
  if (!card) return null;
  if (
    SERVER_ZONE.test(card.zone ?? "") &&
    (card.type === "asset" || card.type === "upgrade" || card.type === "ice")
  ) {
    return Boolean(card.rezzed);
  }
  if (
    card.side === "runner" &&
    card.type !== "identity" &&
    state.runner.installed.includes(cardId)
  ) {
    return card.faceup !== false;
  }
  return null;
}

/** Whether `cardId` is active (CR 1.8.3a, 1.8.4a). */
export function isCardActive(state: GameState, cardId: string): boolean {
  const card = state.cards[cardId];
  if (!card) return false;
  if (cardId === state.corp.identityId || cardId === state.runner.identityId) {
    return true;
  }
  const installed = installedCardActive(state, cardId);
  if (installed !== null) return installed;
  if (state.corp.scoreArea.includes(cardId)) return card.type === "agenda";
  const zone = card.zone ?? "";
  if (zone === "corp:play-area" || zone === "runner:play-area") {
    return card.type === "operation" || card.type === "event";
  }
  // A card hosted without being installed, on a host in the play area: an
  // operation or event turned condition counter (Sub Boost) is active while
  // hosted (CR 1.9.5j, 1.13.6d); a Corp card counter only while rezzed. A
  // Runner card hosted without being installed is not installed, so it is
  // inactive (CR 1.13.2a, 1.8.3a; Madani).
  if (zone.startsWith("hosted:") && card.hostId) {
    if (!state.cards[card.hostId]) return false;
    // A facedown or unrezzed host is inactive, and so is what it hosts.
    const hostInPlay =
      installedCardActive(state, card.hostId) === true ||
      isCardActive(state, card.hostId);
    if (!hostInPlay) return false;
    if (card.type === "operation" || card.type === "event") return true;
    if (card.side === "runner") return false;
    return Boolean(card.rezzed);
  }
  return false;
}
