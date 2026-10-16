/** CR zone display names and ZoneId helpers (CR chapter 4). */

import type { CardInstance, GameState, Side, ZoneId } from "./types.js";

/** CR display name for a side's hand (HQ / Grip). */
export function handName(side: Side): "HQ" | "Grip" {
  return side === "corp" ? "HQ" : "Grip";
}

/** CR display name for a side's deck (R&D / Stack). */
export function deckName(side: Side): "R&D" | "Stack" {
  return side === "corp" ? "R&D" : "Stack";
}

/** CR display name for a side's discard pile (Archives / Heap). */
export function discardPileName(side: Side): "Archives" | "Heap" {
  return side === "corp" ? "Archives" : "Heap";
}

export function zoneIdForHand(side: Side): ZoneId {
  return side === "corp" ? "corp:hq" : "runner:grip";
}

export function zoneIdForDeck(side: Side): ZoneId {
  return side === "corp" ? "corp:rd" : "runner:stack";
}

export function zoneIdForDiscardPile(side: Side): ZoneId {
  return side === "corp" ? "corp:archives" : "runner:heap";
}

export function zoneIdForScoreArea(side: Side): ZoneId {
  return side === "corp" ? "corp:score" : "runner:score";
}

/**
 * True for zones that are part of the play area (CR 4.6):
 * servers, Runner installed cards, either side's lingering play area,
 * and cards hosted on a play-area card (CR 4.6.5g / 4.6.5h).
 */
export function isPlayAreaZone(zone: ZoneId): boolean {
  if (zone === "runner:installed") return true;
  if (zone === "corp:play-area" || zone === "runner:play-area") return true;
  if (zone.startsWith("hosted:")) return true;
  return zone.startsWith("server:");
}

/** True when the card's current zone is in the play area (CR 4.6). */
export function isInPlayArea(card: CardInstance | undefined): boolean {
  return card !== undefined && isPlayAreaZone(card.zone);
}

/**
 * All card ids in the play area for `side` (or both sides when omitted).
 * Includes installed partitions, lingering play-area bags, servers (corp),
 * and hosted cards under those hosts. Does not include set-aside (CR 4.8).
 */
export function playAreaCardIds(state: GameState, side?: Side): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };
  const addHosted = (hostId: string) => {
    const host = state.cards[hostId];
    for (const hid of host?.hostedCardIds ?? []) push(hid);
  };

  if (side === undefined || side === "runner") {
    for (const id of state.runner.installed) {
      push(id);
      addHosted(id);
    }
    for (const id of state.runner.playArea ?? []) {
      push(id);
      addHosted(id);
    }
  }
  if (side === undefined || side === "corp") {
    for (const id of state.corp.playArea ?? []) {
      push(id);
      addHosted(id);
    }
    for (const server of Object.values(state.servers)) {
      for (const id of server.ice) {
        push(id);
        addHosted(id);
      }
      for (const id of server.root) {
        push(id);
        addHosted(id);
      }
    }
  }
  return out;
}

/** Ids in the non-installed play-area partition (ops/events/currents/lockdowns). */
export function lingeringPlayAreaIds(
  state: GameState,
  side: Side,
): string[] {
  const bag = side === "corp" ? state.corp.playArea : state.runner.playArea;
  return [...(bag ?? [])];
}

/** Drop a card from both sides' lingering play-area bags. */
export function leaveLingeringPlayAreaBag(
  state: GameState,
  cardId: string,
): void {
  if (state.corp.playArea) {
    state.corp.playArea = state.corp.playArea.filter((id) => id !== cardId);
  }
  if (state.runner.playArea) {
    state.runner.playArea = state.runner.playArea.filter((id) => id !== cardId);
  }
}

/**
 * Place a card into the non-installed play-area partition (CR 8.6.7a).
 * Updates zone, faceup, and the side's `playArea` bag.
 */
export function enterLingeringPlayArea(
  state: GameState,
  cardId: string,
  side: Side,
): void {
  const card = state.cards[cardId];
  if (!card) return;
  leaveLingeringPlayAreaBag(state, cardId);
  const player = side === "corp" ? state.corp : state.runner;
  if (!player.playArea) player.playArea = [];
  card.zone = side === "corp" ? "corp:play-area" : "runner:play-area";
  card.faceup = true;
  if (!player.playArea.includes(cardId)) player.playArea.push(cardId);
}
