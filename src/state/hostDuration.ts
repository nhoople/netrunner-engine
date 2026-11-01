/**
 * Strength-increase duration replacements (CR 9.9.9 / 9.9.9a).
 *
 * Gebrselassie-class: while hosted, rewrite shorter durations to "this turn";
 * when the source leaves the host, the modification ends (9.9.9a).
 *
 * Gamedragon Pro-class: while hosted, rewrite shorter durations to "this run";
 * same 9.9.9a host-leave tracking.
 *
 * System Seizure: first strength increase each turn grants the icebreaker
 * "increases last for the remainder of the run instead of any shorter
 * duration" for the rest of that run (lingering; independent of the current).
 */

import { log } from "./createGame.js";
import {
  addLingeringEffect,
  LINGERING_KIND_BREAKER_STRENGTH,
  LINGERING_KIND_BREAKER_STRENGTH_CHECKPOINT,
  LINGERING_KIND_BREAKER_STRENGTH_ENCOUNTER,
  LINGERING_KIND_BREAKER_STRENGTH_RUN,
} from "./lingeringEffects.js";
import { tryApplyReplacement } from "./replacements.js";
import type { GameState, LingeringDuration } from "./types.js";
import { CR } from "../timing/labels.js";

export type HostDurationOriginal = "encounter" | "run";

export type StrengthIncreaseDuration =
  | "encounter"
  | "run"
  | "turn"
  | "checkpoint";

/** Active replacement that stretches strength-increase durations. */
export type StrengthDurationReplacement = {
  /** Duration after replacement. */
  to: "turn" | "run";
  sourceId: string;
  /**
   * When true, track each rewritten boost and revert if the source stops
   * applying (hosted static; CR 9.9.9a).
   */
  trackWhileSourceActive: boolean;
};

function hostedTurnStrengthReplacementId(
  state: GameState,
  breakerId: string,
): string | undefined {
  for (const id of state.runner.installed) {
    const c = state.cards[id];
    if (
      c?.hostId === breakerId &&
      c.hostIcebreakerStrengthIncreasesLastRemainderOfTurn
    ) {
      return id;
    }
  }
  return undefined;
}

function hostedRunStrengthReplacementId(
  state: GameState,
  breakerId: string,
): string | undefined {
  for (const id of state.runner.installed) {
    const c = state.cards[id];
    if (c?.hostId === breakerId && c.extendsHostBreakerPumpToRun) {
      return id;
    }
  }
  return undefined;
}

function systemSeizureInPlay(state: GameState): string | undefined {
  for (const c of Object.values(state.cards)) {
    if (
      c?.zone === "runner:play-area" &&
      c.systemSeizureFirstPumpStrengthLastsRemainderOfRun
    ) {
      return c.id;
    }
  }
  return undefined;
}

/**
 * Resolve System Seizure's mandatory interrupt when a strength increase is
 * imminent (CR 9.9.5a / 9.9.10). Counts the first "would increase" each turn
 * even outside a run; the lasting grant attaches only during a run.
 */
export function maybeGrantSystemSeizureRunDuration(
  state: GameState,
  breakerId: string,
  effectId?: string,
): void {
  if (state.turn.systemSeizureFiredThisTurn) return;
  const seizureId = systemSeizureInPlay(state);
  if (!seizureId) return;
  if (effectId) {
    if (
      !tryApplyReplacement(state, effectId, `system-seizure:${seizureId}`)
    ) {
      return;
    }
  }
  state.turn.systemSeizureFiredThisTurn = true;
  const breaker = state.cards[breakerId]?.title ?? breakerId;
  if (!state.run) {
    log(
      state,
      `System Seizure — first time this turn ${breaker} would increase strength (no run; lasting grant does not attach) (CR ${CR.ordinalWould.number}).`,
    );
    return;
  }
  const grants = (state.run.strengthDurationRunInsteadBreakerIds ??= []);
  if (!grants.includes(breakerId)) grants.push(breakerId);
  log(
    state,
    `System Seizure — ${breaker} gains strength increases lasting for the remainder of the run (CR ${CR.ordinalWould.number}, ${CR.applyingReplacementEffects.number}).`,
  );
}

/** Active duration replacement for this icebreaker, if any (CR 9.9.9). */
export function activeStrengthDurationReplacement(
  state: GameState,
  breakerId: string,
): StrengthDurationReplacement | undefined {
  const gebId = hostedTurnStrengthReplacementId(state, breakerId);
  if (gebId) {
    return { to: "turn", sourceId: gebId, trackWhileSourceActive: true };
  }
  if (state.run?.strengthDurationRunInsteadBreakerIds?.includes(breakerId)) {
    const seizureId = systemSeizureInPlay(state);
    return {
      to: "run",
      // Grant is lingering for the run; cite the current if still in play.
      sourceId: seizureId ?? breakerId,
      trackWhileSourceActive: false,
    };
  }
  const runHostId = hostedRunStrengthReplacementId(state, breakerId);
  if (runHostId) {
    return { to: "run", sourceId: runHostId, trackWhileSourceActive: true };
  }
  return undefined;
}

function isShorterThan(
  requested: StrengthIncreaseDuration,
  replacementTo: "turn" | "run",
): boolean {
  if (replacementTo === "turn") {
    return requested !== "turn";
  }
  // Run replaces only shorter durations (encounter / checkpoint), not turn.
  return requested === "encounter" || requested === "checkpoint";
}

/**
 * Apply an active 9.9.9 duration replacement to a requested strength-increase
 * duration. Does not grant System Seizure — call maybeGrant first when the
 * increase is about to happen.
 */
export function resolveStrengthIncreaseDuration(
  state: GameState,
  breakerId: string,
  requested: StrengthIncreaseDuration,
): {
  duration: StrengthIncreaseDuration;
  replacement?: StrengthDurationReplacement;
  original?: HostDurationOriginal;
} {
  const replacement = activeStrengthDurationReplacement(state, breakerId);
  if (!replacement || !isShorterThan(requested, replacement.to)) {
    return { duration: requested };
  }
  const original: HostDurationOriginal | undefined =
    requested === "run"
      ? "run"
      : requested === "encounter" || requested === "checkpoint"
        ? "encounter"
        : undefined;
  return {
    duration: replacement.to,
    replacement,
    original,
  };
}

export function noteHostDurationReplacement(
  state: GameState,
  rec: {
    sourceId: string;
    breakerId: string;
    amount: number;
    original: HostDurationOriginal;
    replacedTo?: "turn" | "run";
  },
): void {
  if (rec.amount <= 0) return;
  state.turn.hostDurationReplacements = [
    ...(state.turn.hostDurationReplacements ?? []),
    { replacedTo: "turn", ...rec },
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

function takeBoost(
  bucket: Record<string, number> | undefined,
  breakerId: string,
  amount: number,
): number {
  if (!bucket) return 0;
  const have = bucket[breakerId] ?? 0;
  const move = Math.min(have, amount);
  if (move <= 0) return 0;
  const left = have - move;
  if (left <= 0) delete bucket[breakerId];
  else bucket[breakerId] = left;
  return move;
}

function rekindBreakerLingering(
  state: GameState,
  breakerId: string,
  amount: number,
  fromKind: string,
  toKind: string,
  toDuration: LingeringDuration,
): void {
  let remaining = amount;
  for (const e of state.lingeringEffects) {
    if (remaining <= 0) break;
    if (e.expired || e.kind !== fromKind) continue;
    const payload = e.payload as
      | { breakerId?: string; amount?: number }
      | undefined;
    if (!payload || payload.breakerId !== breakerId) continue;
    const have = payload.amount ?? 0;
    const take = Math.min(have, remaining);
    if (take <= 0) continue;
    const left = have - take;
    if (left <= 0) e.expired = true;
    else payload.amount = left;
    remaining -= take;
  }
  if (amount - remaining > 0) {
    addLingeringEffect(state, {
      createdBy: breakerId,
      duration: toDuration,
      kind: toKind,
      payload: { breakerId, amount: amount - remaining },
    });
  }
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
    const replacedTo = rec.replacedTo ?? "turn";
    const move =
      replacedTo === "run"
        ? takeBoost(state.run?.strengthBoosts, rec.breakerId, rec.amount)
        : takeBoost(state.turn.breakerStrengthBoostsThisTurn, rec.breakerId, rec.amount);
    const title = state.cards[rec.sourceId]?.title ?? rec.sourceId;
    const breaker = state.cards[rec.breakerId]?.title ?? rec.breakerId;
    if (move <= 0) continue;
    const fromKind =
      replacedTo === "run"
        ? LINGERING_KIND_BREAKER_STRENGTH_RUN
        : LINGERING_KIND_BREAKER_STRENGTH;
    if (rec.original === "encounter" && state.run?.encounter) {
      const bucket = state.run.encounterStrengthBoosts;
      bucket[rec.breakerId] = (bucket[rec.breakerId] ?? 0) + move;
      rekindBreakerLingering(
        state,
        rec.breakerId,
        move,
        fromKind,
        LINGERING_KIND_BREAKER_STRENGTH_ENCOUNTER,
        { kind: "encounter" },
      );
      log(
        state,
        `${title} no longer replaces ${breaker}'s strength duration, so it lasts for this encounter (CR ${CR.replacementStaticMustRemainActive.number}).`,
      );
    } else if (rec.original === "run" && state.run) {
      state.run.strengthBoosts[rec.breakerId] =
        (state.run.strengthBoosts[rec.breakerId] ?? 0) + move;
      rekindBreakerLingering(
        state,
        rec.breakerId,
        move,
        fromKind,
        LINGERING_KIND_BREAKER_STRENGTH_RUN,
        { kind: "run" },
      );
      log(
        state,
        `${title} no longer replaces ${breaker}'s strength duration, so it lasts for this run (CR ${CR.replacementStaticMustRemainActive.number}).`,
      );
    } else {
      // Original duration already expired — keep applying until the next
      // checkpoint (CR 9.9.9a.ex1). Hold on the turn bucket.
      state.turn.breakerStrengthBoostsThisTurn[rec.breakerId] =
        (state.turn.breakerStrengthBoostsThisTurn[rec.breakerId] ?? 0) + move;
      rekindBreakerLingering(
        state,
        rec.breakerId,
        move,
        fromKind,
        LINGERING_KIND_BREAKER_STRENGTH_CHECKPOINT,
        { kind: "until_checkpoint" },
      );
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
    // Expire matching checkpoint lingerings (S3 registry path).
    let leftLingering = drop;
    for (const e of state.lingeringEffects) {
      if (leftLingering <= 0) break;
      if (e.expired || e.kind !== LINGERING_KIND_BREAKER_STRENGTH_CHECKPOINT) {
        continue;
      }
      const payload = e.payload as
        | { breakerId?: string; amount?: number }
        | undefined;
      if (!payload || payload.breakerId !== rec.breakerId) continue;
      const take = Math.min(payload.amount ?? 0, leftLingering);
      const rem = (payload.amount ?? 0) - take;
      if (rem <= 0) e.expired = true;
      else payload.amount = rem;
      leftLingering -= take;
    }
    removed += 1;
  }
  state.turn.revertedHostDurationBoosts = undefined;
  return removed;
}
