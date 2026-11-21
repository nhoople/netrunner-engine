/**
 * Uninstalling (CR 8.5.1b, 8.5.10). The one procedure that moves an
 * installed card out of play to somewhere other than its owner's discard
 * pile. Trashing an installed card is `trashCard` (`procedures/trash.ts`).
 *
 * `uninstallCard(state, id, destination)`:
 *
 * - Ends the card's own host relationship (CR 1.13.12). Cards hosted on it
 *   keep their link, and the checkpoint trashes them at CR 10.3.1g
 *   (CR 1.13.13), including when the card goes to a score area.
 * - Removes it from its server or the rig. Ice leaving its position goes
 *   through `noteIceUninstalled` (`removeCardFromCurrentZone` calls it): the
 *   Runner's position stays an element of the sequence (CR 6.2.4, 6.2.6),
 *   and an approach or encounter of that ice ends once any open paid
 *   ability window closes (CR 6.2.7a, 6.2.7c, 8.5.10).
 * - Ends the pending instances whose source left play (CR 9.6.10).
 * - Makes it a new object (CR 1.12.1): unrezzed, with no counters. Hosted
 *   counters are trashed when their host changes zones (CR 1.13.13), and a
 *   scored or stolen agenda's advancement counters return to the bank
 *   (CR 1.17.5). A caller that needs a last-known count reads it first.
 * - Places it: the owner's hand or deck (top, bottom, or shuffled in), the
 *   removed-from-game zone (CR 4.9.2), or a score area.
 * - A card whose text removes it from the game when it is uninstalled
 *   (Nanuq, `rfgOnUninstall`) goes there: that ability stays active as the
 *   card leaves play (CR 9.1.8g, 4.9.2). A card's "when uninstalled"
 *   ability (Muertos Gang Member, `onUninstall`) stays active in its new
 *   zone until it resolves (CR 9.1.8g).
 *
 * Moving installed ice to another position is not an uninstall (CR 6.2.2);
 * that is `moveIce` in `procedures/rearrange.ts`.
 */
import { log } from "../createGame.js";
import { CR } from "../../timing/labels.js";
import type { CardInstance, GameState, ServerId } from "../types.js";
import { removeCardFromCurrentZone } from "../scoring.js";
import { endEffectsOnPreviousObject } from "../turn.js";
import { cancelPendingIfSourceInactive } from "../pendingAbilities.js";
import { fireOnUninstall, recomputeRunnerLink } from "../trashHooks.js";
import { recomputeRunnerMaxHandSize } from "../handSize.js";
import { shuffleInPlace } from "../rng.js";
import { notePositionsCeased } from "../runPosition.js";
import { unhostCard } from "./host.js";

/** Where an uninstalled card goes. */
export type UninstallDestination =
  /** The owner's HQ or grip. */
  | "hand"
  /** The top of the owner's R&D or stack. */
  | "deck-top"
  /** The bottom of the owner's R&D or stack. */
  | "deck-bottom"
  /** Shuffled into the owner's R&D or stack. */
  | "deck-shuffle"
  /** The removed-from-game zone (CR 4.9.2). */
  | "removed-from-game"
  /** A score area, as an agenda. `scoreSide` says whose. */
  | "score-area";

export interface UninstallOptions {
  /** For `"score-area"`: whose score area. Default: the card's owner. */
  scoreSide?: "corp" | "runner";
  /** Log line to write once the card has moved. */
  logLine?: string;
}

/**
 * The card is installed: protecting a server or in its root (CR 4.6.9a),
 * or in the Runner's rig.
 */
export function isInstalled(state: GameState, cardId: string): boolean {
  if (state.runner.installed.includes(cardId)) return true;
  return Object.values(state.servers).some(
    (server) => server.ice.includes(cardId) || server.root.includes(cardId),
  );
}

/**
 * Uninstall `cardId` and move it to `destination` (CR 8.5.1b). Returns false
 * and changes nothing when the card is not installed.
 */
export function uninstallCard(
  state: GameState,
  cardId: string,
  destination: UninstallDestination,
  options: UninstallOptions = {},
): boolean {
  const card = state.cards[cardId];
  if (!card || !isInstalled(state, cardId)) return false;
  const runnerCard = state.runner.installed.includes(cardId);
  const to: UninstallDestination = card.rfgOnUninstall
    ? "removed-from-game"
    : destination;
  // Leave the zone first: hosted ice is still installed while the run
  // notes that it left (CR 6.2.7c, 8.5.10). Then end its own host link.
  removeCardFromCurrentZone(state, cardId);
  endEffectsOnPreviousObject(state, cardId);
  unhostCard(state, cardId);
  // CR 9.6.10: pending instances from this source end when it leaves play.
  cancelPendingIfSourceInactive(state, (inst) => inst.sourceId !== cardId);
  card.rezzed = false;
  clearCounters(card);
  place(state, card, to, options.scoreSide ?? card.side);
  if (options.logLine) log(state, options.logLine);
  if (card.rfgOnUninstall) {
    log(
      state,
      `${card.title}'s ability remains active and removes it from the game (CR ${CR.abilityRemainsActive.number}, ${CR.removeFromGame.number}).`,
    );
  }
  if (runnerCard) {
    recomputeRunnerLink(state);
    recomputeRunnerMaxHandSize(state);
  }
  fireOnUninstall(state, card);
  return true;
}

/**
 * Remove `cardId` from the game (CR 4.9.2): it moves from its current zone to
 * the removed-from-game zone, faceup (CR 4.9.6). An installed card is
 * uninstalled as it goes (CR 8.5.1b).
 */
export function removeCardFromGame(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card) return;
  if (uninstallCard(state, cardId, "removed-from-game")) return;
  removeCardFromCurrentZone(state, cardId);
  endEffectsOnPreviousObject(state, cardId);
  unhostCard(state, cardId);
  card.rezzed = false;
  place(state, card, "removed-from-game", card.side);
}

function clearCounters(card: CardInstance): void {
  card.advancementCounters = undefined;
  card.virusCounters = undefined;
  card.powerCounters = undefined;
  card.agendaCounters = undefined;
  card.badPublicityCounters = undefined;
  card.hostedCredits = undefined;
  card.recurringCredits = undefined;
}

function place(
  state: GameState,
  card: CardInstance,
  to: UninstallDestination,
  scoreSide: "corp" | "runner",
): void {
  const owner = card.side === "runner" ? state.runner : state.corp;
  const id = card.id;
  switch (to) {
    case "hand":
      owner.hand.push(id);
      card.zone = card.side === "runner" ? "runner:grip" : "corp:hq";
      // The Runner's grip is shown to the Runner; HQ is facedown.
      card.faceup = card.side === "runner";
      return;
    case "deck-top":
    case "deck-bottom":
    case "deck-shuffle":
      if (to === "deck-top") owner.deck.unshift(id);
      else owner.deck.push(id);
      card.zone = card.side === "runner" ? "runner:stack" : "corp:rd";
      card.faceup = false;
      if (to === "deck-shuffle") shuffleInPlace(state, owner.deck);
      return;
    case "removed-from-game":
      state.removedFromGame ??= [];
      if (!state.removedFromGame.includes(id)) state.removedFromGame.push(id);
      card.zone = "removed-from-game";
      // Removed-from-game cards are open information (CR 4.9.6).
      card.faceup = true;
      return;
    case "score-area": {
      const player = scoreSide === "runner" ? state.runner : state.corp;
      player.scoreArea.push(id);
      card.zone = scoreSide === "runner" ? "runner:score" : "corp:score";
      card.faceup = true;
      return;
    }
  }
}

/**
 * Checkpoint step 10.3.1i: each position that no ice occupies ceases to
 * exist, unless it is the Runner's position (CR 6.2.4). The ice list holds
 * only card ids, so an empty position is an id that names no card. Ice in
 * the process of being installed is not tracked here. Returns how many
 * positions ceased.
 */
export function ceaseVacantPositions(state: GameState): number {
  let ceased = 0;
  for (const server of Object.values(state.servers)) {
    const onThisServer = state.run?.attackedServerId === server.id;
    const runnerPos = onThisServer ? (state.run?.position ?? null) : null;
    const gone: number[] = [];
    server.ice.forEach((id, index) => {
      if (state.cards[id] != null || runnerPos === index) return;
      gone.push(index);
      state.log.push(
        `Position ${index} on ${server.id} ceased to exist (CR ${CR.checkpointVacantPosition.number}).`,
      );
    });
    if (gone.length === 0) continue;
    server.ice = server.ice.filter((_, index) => !gone.includes(index));
    notePositionsCeased(state, server.id as ServerId, gone);
    ceased += gone.length;
  }
  return ceased;
}
