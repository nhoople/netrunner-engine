/** Shared helpers for starting runs from events / paid abilities. */

import type { Effect } from "../effects/ir.js";
import type {
  GameState,
  ServerId,
  StartsRunSpec,
} from "./types.js";

export function serversMatchingSpec(
  state: GameState,
  spec: StartsRunSpec,
): ServerId[] {
  const all = Object.keys(state.servers) as ServerId[];
  switch (spec.servers) {
    case "any":
      return all;
    case "central":
      return all.filter(
        (id) => id === "hq" || id === "rd" || id === "archives",
      );
    case "hq_rd":
      return all.filter((id) => id === "hq" || id === "rd");
    case "rd":
      return all.filter((id) => id === "rd");
    case "hq":
      return all.filter((id) => id === "hq");
    case "archives":
      return all.filter((id) => id === "archives");
    default:
      return all;
  }
}

export function isServerAllowedForSpec(
  state: GameState,
  spec: StartsRunSpec,
  serverId: ServerId,
): boolean {
  if (!serversMatchingSpec(state, spec).includes(serverId)) return false;
  if (spec.requireNotRunThisTurn) {
    if (state.turn.serversRunThisTurn.includes(serverId)) return false;
  }
  return true;
}

export interface RunModifiers {
  bonusAccess?: number;
  iceRezCostIncrease?: number;
  eventCredits?: number;
  runSourceId?: string;
  onSuccessfulRunEffect?: Effect;
  persistentTagsIfAgendaStolen?: number;
  bypassFirstEncounter?: boolean;
  redirectSuccessTo?: "hq" | "rd" | "archives";
  skipBreachInstallProgramFromHeap?: boolean;
}

export function modifiersFromStartsRun(
  state: GameState,
  spec: StartsRunSpec,
  sourceId: string,
): RunModifiers {
  const mods: RunModifiers = {
    runSourceId: sourceId,
    onSuccessfulRunEffect: spec.onSuccessfulRun
      ? structuredClone(spec.onSuccessfulRun)
      : undefined,
  };
  if (spec.bonusAccess) mods.bonusAccess = spec.bonusAccess;
  if (spec.bonusAccessFromVirus) {
    const virus = state.cards[sourceId]?.virusCounters ?? 0;
    mods.bonusAccess = (mods.bonusAccess ?? 0) + virus;
  }
  if (spec.iceRezCostIncrease) {
    mods.iceRezCostIncrease = spec.iceRezCostIncrease;
  }
  if (spec.placeEventCredits) {
    mods.eventCredits = spec.placeEventCredits;
  }
  if (spec.bypassFirstEncounter) {
    (mods as RunModifiers).bypassFirstEncounter = true;
  }
  if (spec.redirectSuccessTo) {
    (mods as RunModifiers).redirectSuccessTo = spec.redirectSuccessTo;
  }
  if (spec.skipBreachInstallProgramFromHeap) {
    mods.skipBreachInstallProgramFromHeap = true;
  }
  return mods;
}

/** Collect persistent Amaze-style effects when a run begins / upgrade is present. */
export function collectPersistentAmazeTags(state: GameState): number {
  let tags = 0;
  const sid = state.run?.attackedServerId;
  if (!sid) return 0;
  const server = state.servers[sid];
  for (const id of server.root) {
    const card = state.cards[id];
    if (card.rezzed && (card.tagsIfAgendaStolenThisRun ?? 0) > 0) {
      tags += card.tagsIfAgendaStolenThisRun ?? 0;
    }
  }
  return tags;
}
