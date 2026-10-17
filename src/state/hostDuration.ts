/**
 * Gebrselassie replaces a host icebreaker's strength-increase duration with
 * "the remainder of the turn." If that card leaves the host, the replacement
 * ends. A duration that has already expired is removed at the next checkpoint
 * (CR 9.9.9a).
 */

import { log } from "./createGame.js";
import type { GameState } from "./types.js";
import { CR } from "../timing/labels.js";

export type HostDurationOriginal = "encounter" | "run";

export function noteHostDurationReplacement(
  state: GameState,
  rec: {
    sourceId: string;
    breakerId: string;
    amount: number;
    original: HostDurationOriginal;
  },
): void {
  if (rec.amount <= 0) return;
  state.turn.hostDurationReplacements = [
    ...(state.turn.hostDurationReplacements ?? []),
    rec,
  ];
}

function stillHosted(
  state: GameState,
  sourceId: string,
  breakerId: string,
): boolean {
  const src = state.cards[sourceId];
  if (!src || src.hostId !== breakerId) return false;
  return src.zone === "runner:installed" || state.runner.installed.includes(sourceId);
}

/** Drop replacements whose source is no longer hosted on that icebreaker. */
export function syncHostDurationReplacements(state: GameState): void {
  const list = state.turn.hostDurationReplacements;
  if (!list?.length) return;
  const keep = [];
  for (const rec of list) {
    if (stillHosted(state, rec.sourceId, rec.breakerId)) {
      keep.push(rec);
      continue;
    }
    const turn = state.turn.breakerStrengthBoostsThisTurn;
    const have = turn[rec.breakerId] ?? 0;
    const move = Math.min(have, rec.amount);
    if (move > 0) {
      const left = have - move;
      if (left <= 0) delete turn[rec.breakerId];
      else turn[rec.breakerId] = left;
    }
    const title = state.cards[rec.sourceId]?.title ?? rec.sourceId;
    const breaker = state.cards[rec.breakerId]?.title ?? rec.breakerId;
    if (rec.original === "encounter" && state.run?.encounter && move > 0) {
      const bucket = state.run.encounterStrengthBoosts;
      bucket[rec.breakerId] = (bucket[rec.breakerId] ?? 0) + move;
      log(
        state,
        `${title} no longer replaces ${breaker}'s strength duration, so it lasts for this encounter (CR ${CR.replacementStaticMustRemainActive.number}).`,
      );
    } else if (rec.original === "run" && state.run && move > 0) {
      state.run.strengthBoosts[rec.breakerId] =
        (state.run.strengthBoosts[rec.breakerId] ?? 0) + move;
      log(
        state,
        `${title} no longer replaces ${breaker}'s strength duration, so it lasts for this run (CR ${CR.replacementStaticMustRemainActive.number}).`,
      );
    } else if (move > 0) {
      turn[rec.breakerId] = (turn[rec.breakerId] ?? 0) + move;
      state.turn.revertedHostDurationBoosts = [
        ...(state.turn.revertedHostDurationBoosts ?? []),
        { breakerId: rec.breakerId, amount: move },
      ];
      log(
        state,
        `${title} no longer replaces ${breaker}'s strength duration. That duration has expired, so the effect ends at the next checkpoint (CR ${CR.replacementStaticMustRemainActive.number}).`,
      );
    }
  }
  state.turn.hostDurationReplacements = keep.length > 0 ? keep : undefined;
}

/** Remove host-duration boosts whose original duration already expired. */
export function removeRevertedHostDurations(state: GameState): number {
  syncHostDurationReplacements(state);
  const list = state.turn.revertedHostDurationBoosts;
  if (!list?.length) return 0;
  let removed = 0;
  const turn = state.turn.breakerStrengthBoostsThisTurn;
  for (const rec of list) {
    const have = turn[rec.breakerId] ?? 0;
    const drop = Math.min(have, rec.amount);
    if (drop <= 0) continue;
    const left = have - drop;
    if (left <= 0) delete turn[rec.breakerId];
    else turn[rec.breakerId] = left;
    removed += 1;
  }
  state.turn.revertedHostDurationBoosts = undefined;
  return removed;
}
