/** CR zone display names and ZoneId helpers (CR chapter 4). */

import type { Side, ZoneId } from "./types.js";

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
 * servers, Runner installed cards, and either side's play area.
 */
export function isPlayAreaZone(zone: ZoneId): boolean {
  if (zone === "runner:installed") return true;
  if (zone === "corp:play-area" || zone === "runner:play-area") return true;
  return zone.startsWith("server:");
}
