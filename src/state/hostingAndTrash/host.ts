/**
 * Hosting (CR 1.13). The one place that writes a host relationship.
 *
 * A host relationship has two ends: the hosted card's `hostId` and the host's
 * `hostedCardIds`. Only this module writes either, so they always agree
 * (CR 1.13.4: an object is hosted on one card at a time).
 *
 * - `hostCard` creates a relationship. A card hosted without being installed
 *   leaves its zone and moves to its host's zone, `hosted:<hostId>`
 *   (CR 1.13.2a, 1.13.12). A card installed onto a host (CR 8.5.16b) stays in
 *   its install zone: hosted and installed are distinct states (CR 1.13.2).
 * - `unhostCard` ends a relationship at both ends: the hosted card moved to
 *   another zone, was installed from a hosted state, or was hosted elsewhere
 *   (CR 1.13.12, 1.13.2c).
 *
 * When a host changes zones its hosted cards keep their link. The checkpoint
 * trashes them at CR 10.3.1g (CR 1.13.13), so no code clears `hostId` on a
 * host's behalf.
 */
import { removeCardFromCurrentZone } from "../turnAndActions/scoring.js";
import type { GameState } from "../types/game.js";

export interface HostOptions {
  /**
   * The card is installed onto the host (CR 8.5.16b, 1.13.7a). It keeps its
   * install zone; only the link is written. Without this, the card is hosted
   * without being installed and moves to `hosted:<hostId>` (CR 1.13.2a).
   */
  installed?: boolean;
  /** Faceup or facedown on the host (CR 1.13.7, 1.13.7b). Unchanged when omitted. */
  faceup?: boolean;
}

/**
 * Host `cardId` on `hostId` (CR 1.13.1). Ends any earlier host relationship
 * first (CR 1.13.4, 1.13.12).
 */
export function hostCard(
  state: GameState,
  cardId: string,
  hostId: string,
  options: HostOptions = {},
): void {
  const card = state.cards[cardId];
  const host = state.cards[hostId];
  if (!card || !host) return;
  if (card.hostId && card.hostId !== hostId) unhostCard(state, cardId);
  if (!options.installed) {
    removeCardFromCurrentZone(state, cardId);
    card.zone = `hosted:${hostId}`;
  }
  card.hostId = hostId;
  if (!host.hostedCardIds) host.hostedCardIds = [];
  if (!host.hostedCardIds.includes(cardId)) host.hostedCardIds.push(cardId);
  if (options.faceup !== undefined) card.faceup = options.faceup;
}

/**
 * End `cardId`'s host relationship at both ends (CR 1.13.12, 1.13.2c). Does
 * not move the card: the caller moves it. A card that is not hosted is left
 * as it is.
 */
export function unhostCard(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card) return;
  card.hostId = undefined;
  // Every list that names the card is cleaned, including one whose card lost
  // its `hostId` before this module owned the link (CR 1.13.4).
  for (const other of Object.values(state.cards)) {
    if (!other.hostedCardIds?.includes(cardId)) continue;
    other.hostedCardIds = other.hostedCardIds.filter((id) => id !== cardId);
  }
}

/**
 * Empty `hostId`'s hosted list, ending each relationship (CR 1.13.12). For an
 * ability that moves every hosted card somewhere else; the caller moves them.
 * Returns the ids that were hosted.
 */
export function unhostAllFrom(state: GameState, hostId: string): string[] {
  const host = state.cards[hostId];
  const ids = [...(host?.hostedCardIds ?? [])];
  for (const id of ids) unhostCard(state, id);
  return ids;
}
