/**
 * First-class lingering-effect registry (CR 9.10.1). Effects are independent
 * of their source once created and are removed at 10.3.1b when duration has
 * passed. Coexists with ad-hoc turn/run fields until those migrate here.
 */
import { CR } from "../timing/labels.js";
import {
  maybeGrantSystemSeizureRunDuration,
  noteHostDurationReplacement,
  resolveStrengthIncreaseDuration,
} from "./hostDuration.js";
import { cancelPendingIfSourceInactive } from "./pendingAbilities.js";
import type {
  GameState,
  LingeringDuration,
  LingeringEffect,
  Side,
} from "./types.js";

/** Mark server designation (CR 10.11.4). Payload: `{ serverId: ServerId }`. */
export const LINGERING_KIND_MARK = "mark";

/**
 * Ice subtypes granted until end of turn (CR 9.10.1).
 * Payload: `{ cardId: string; subtypes: string[] }`.
 */
export const LINGERING_KIND_GRANTED_SUBTYPES = "granted_subtypes";

/**
 * Runner memory-limit modifier until end of the Runner's turn (CR 9.10.1).
 * Payload: `{ delta: number }`. Cleared when the Runner's turn ends (matches
 * `runnerMuModifierUntilTurnEnd` dual-write).
 */
export const LINGERING_KIND_RUNNER_MU = "runner_mu";

/**
 * Icebreaker strength boost until end of turn (CR 9.10.1).
 * Payload: `{ breakerId: string; amount: number }`.
 */
export const LINGERING_KIND_BREAKER_STRENGTH = "breaker_strength_turn";

/**
 * Ice strength boost until end of turn (CR 9.10.1).
 * Payload: `{ iceId: string; amount: number }`.
 */
export const LINGERING_KIND_ICE_STRENGTH = "ice_strength_turn";

/**
 * Temporary ability blank until end of the Corp's turn (Klevetnik-class;
 * CR 9.10.1). Payload: `{ cardId: string }`. Dual-writes
 * `abilitiesBlanked` / `abilitiesBlankedCorpTurnsRemaining`.
 */
export const LINGERING_KIND_ABILITY_BLANK = "ability_blank";

/**
 * Icebreaker strength boost for the remainder of the run (CR 9.10.1).
 * Payload: `{ breakerId: string; amount: number }`.
 */
export const LINGERING_KIND_BREAKER_STRENGTH_RUN = "breaker_strength_run";

/**
 * Icebreaker strength boost for the remainder of the encounter (CR 9.10.1).
 * Payload: `{ breakerId: string; amount: number }`.
 */
export const LINGERING_KIND_BREAKER_STRENGTH_ENCOUNTER =
  "breaker_strength_encounter";

/**
 * Ice strength boost for the remainder of the encounter (CR 9.10.1).
 * Payload: `{ iceId: string; amount: number }`. Dual-writes
 * `run.iceStrengthBoosts`.
 */
export const LINGERING_KIND_ICE_STRENGTH_ENCOUNTER = "ice_strength_encounter";

/**
 * Icebreaker strength boost until the next checkpoint (CR 9.10.1 /
 * icebreaker strength outside an encounter). Payload:
 * `{ breakerId: string; amount: number }`. Dual-writes
 * `turn.checkpointBreakerBoosts`.
 */
export const LINGERING_KIND_BREAKER_STRENGTH_CHECKPOINT =
  "breaker_strength_checkpoint";

let lingeringSeq = 0;

export function resetLingeringSeqForTests(): void {
  lingeringSeq = 0;
}

export function addLingeringEffect(
  state: GameState,
  args: {
    createdBy: string;
    duration: LingeringDuration;
    kind: string;
    payload?: unknown;
  },
): LingeringEffect {
  const effect: LingeringEffect = {
    id: `le-${++lingeringSeq}`,
    createdBy: args.createdBy,
    independent: true,
    duration: args.duration,
    kind: args.kind,
    ...(args.payload !== undefined ? { payload: args.payload } : {}),
  };
  state.lingeringEffects.push(effect);
  state.log.push(
    `Lingering effect ${effect.kind} (${effect.id}) created (CR ${CR.lingeringEffect.number}).`,
  );
  return effect;
}

export function lingeringEffectsOfKind(
  state: GameState,
  kind: string,
): LingeringEffect[] {
  return state.lingeringEffects.filter((e) => !e.expired && e.kind === kind);
}

/** Drop active lingerings of `kind` immediately (not waiting for 10.3.1b). */
export function removeLingeringEffectsOfKind(
  state: GameState,
  kind: string,
): number {
  let removed = 0;
  for (const effect of state.lingeringEffects) {
    if (effect.expired || effect.kind !== kind) continue;
    effect.expired = true;
    removed += 1;
  }
  if (removed > 0) {
    state.lingeringEffects = state.lingeringEffects.filter((e) => !e.expired);
  }
  return removed;
}

/**
 * Dual-write a this-turn icebreaker strength boost onto the turn field and the
 * lingering registry (CR 9.10.1). Strength consumers still read the turn field.
 * Still counts as a strength increase for System Seizure's first-time grant.
 */
export function addBreakerStrengthBoostThisTurn(
  state: GameState,
  args: { createdBy: string; breakerId: string; amount: number },
): void {
  if (args.amount === 0) return;
  if (args.amount > 0) {
    maybeGrantSystemSeizureRunDuration(state, args.breakerId);
  }
  state.turn.breakerStrengthBoostsThisTurn[args.breakerId] =
    (state.turn.breakerStrengthBoostsThisTurn[args.breakerId] ?? 0) +
    args.amount;
  addLingeringEffect(state, {
    createdBy: args.createdBy,
    duration: { kind: "turn" },
    kind: LINGERING_KIND_BREAKER_STRENGTH,
    payload: { breakerId: args.breakerId, amount: args.amount },
  });
}

/**
 * Dual-write a this-turn ice strength boost onto the turn field and the
 * lingering registry (CR 9.10.1). Strength consumers still read the turn field.
 */
export function addIceStrengthBoostThisTurn(
  state: GameState,
  args: { createdBy: string; iceId: string; amount: number },
): void {
  if (args.amount === 0) return;
  state.turn.iceStrengthBoostsThisTurn[args.iceId] =
    (state.turn.iceStrengthBoostsThisTurn[args.iceId] ?? 0) + args.amount;
  addLingeringEffect(state, {
    createdBy: args.createdBy,
    duration: { kind: "turn" },
    kind: LINGERING_KIND_ICE_STRENGTH,
    payload: { iceId: args.iceId, amount: args.amount },
  });
}

/**
 * Dual-write a Corp-turn-scoped ability blank (CR 9.10.1). Blanking consumers
 * still read `abilitiesBlanked`; 10.3.1b expires the registry entry.
 */
export function blankAbilitiesUntilCorpTurnEnd(
  state: GameState,
  args: { createdBy: string; cardId: string },
): void {
  const card = state.cards[args.cardId];
  if (!card) return;
  card.abilitiesBlanked = true;
  card.abilitiesBlankedCorpTurnsRemaining = 1;
  addLingeringEffect(state, {
    createdBy: args.createdBy,
    duration: { kind: "turn", side: "corp" },
    kind: LINGERING_KIND_ABILITY_BLANK,
    payload: { cardId: args.cardId },
  });
  // Still-pending instances die when the ability is blanked (CR 9.6.10).
  cancelPendingIfSourceInactive(state, (inst) => inst.sourceId !== args.cardId);
}

/**
 * Dual-write a run-duration icebreaker strength boost (CR 9.10.1).
 * Requires an active run; no-ops otherwise. Active 9.9.9 replacements may
 * stretch the duration (Gebrselassie → turn).
 */
export function addBreakerStrengthBoostThisRun(
  state: GameState,
  args: { createdBy: string; breakerId: string; amount: number },
): void {
  if (args.amount === 0 || !state.run) return;
  if (args.amount > 0) {
    maybeGrantSystemSeizureRunDuration(state, args.breakerId);
    const resolved = resolveStrengthIncreaseDuration(
      state,
      args.breakerId,
      "run",
    );
    if (resolved.duration === "turn" && resolved.replacement) {
      addBreakerStrengthBoostThisTurn(state, args);
      if (
        resolved.replacement.trackWhileSourceActive &&
        resolved.original
      ) {
        noteHostDurationReplacement(state, {
          sourceId: resolved.replacement.sourceId,
          breakerId: args.breakerId,
          amount: args.amount,
          original: resolved.original,
          replacedTo: "turn",
        });
      }
      return;
    }
  }
  if (!state.run.strengthBoosts) state.run.strengthBoosts = {};
  state.run.strengthBoosts[args.breakerId] =
    (state.run.strengthBoosts[args.breakerId] ?? 0) + args.amount;
  addLingeringEffect(state, {
    createdBy: args.createdBy,
    duration: { kind: "run" },
    kind: LINGERING_KIND_BREAKER_STRENGTH_RUN,
    payload: { breakerId: args.breakerId, amount: args.amount },
  });
}

/**
 * Dual-write an encounter-duration icebreaker strength boost (CR 9.10.1).
 * Requires an active run; no-ops otherwise. Active 9.9.9 replacements may
 * stretch the duration (Gebrselassie → turn; System Seizure / Gamedragon → run).
 */
export function addBreakerStrengthBoostThisEncounter(
  state: GameState,
  args: { createdBy: string; breakerId: string; amount: number },
): void {
  if (args.amount === 0 || !state.run) return;
  if (args.amount > 0) {
    maybeGrantSystemSeizureRunDuration(state, args.breakerId);
    const resolved = resolveStrengthIncreaseDuration(
      state,
      args.breakerId,
      "encounter",
    );
    if (resolved.duration === "turn" && resolved.replacement) {
      addBreakerStrengthBoostThisTurn(state, args);
      if (
        resolved.replacement.trackWhileSourceActive &&
        resolved.original
      ) {
        noteHostDurationReplacement(state, {
          sourceId: resolved.replacement.sourceId,
          breakerId: args.breakerId,
          amount: args.amount,
          original: resolved.original,
          replacedTo: "turn",
        });
      }
      return;
    }
    if (resolved.duration === "run") {
      addBreakerStrengthBoostThisRun(state, args);
      if (
        resolved.replacement?.trackWhileSourceActive &&
        resolved.original
      ) {
        noteHostDurationReplacement(state, {
          sourceId: resolved.replacement.sourceId,
          breakerId: args.breakerId,
          amount: args.amount,
          original: resolved.original,
          replacedTo: "run",
        });
      }
      return;
    }
  }
  if (!state.run.encounterStrengthBoosts) state.run.encounterStrengthBoosts = {};
  state.run.encounterStrengthBoosts[args.breakerId] =
    (state.run.encounterStrengthBoosts[args.breakerId] ?? 0) + args.amount;
  addLingeringEffect(state, {
    createdBy: args.createdBy,
    duration: { kind: "encounter" },
    kind: LINGERING_KIND_BREAKER_STRENGTH_ENCOUNTER,
    payload: { breakerId: args.breakerId, amount: args.amount },
  });
}

/**
 * Dual-write an encounter-duration ice strength boost onto `run.iceStrengthBoosts`
 * (CR 9.10.1). Requires an active run; no-ops otherwise.
 */
export function addIceStrengthBoostThisEncounter(
  state: GameState,
  args: { createdBy: string; iceId: string; amount: number },
): void {
  if (args.amount === 0 || !state.run) return;
  if (!state.run.iceStrengthBoosts) state.run.iceStrengthBoosts = {};
  state.run.iceStrengthBoosts[args.iceId] =
    (state.run.iceStrengthBoosts[args.iceId] ?? 0) + args.amount;
  addLingeringEffect(state, {
    createdBy: args.createdBy,
    duration: { kind: "encounter" },
    kind: LINGERING_KIND_ICE_STRENGTH_ENCOUNTER,
    payload: { iceId: args.iceId, amount: args.amount },
  });
}

/**
 * Dual-write an until-next-checkpoint icebreaker strength boost
 * (CR 9.10.1). Used when a pump resolves outside an encounter.
 * Active 9.9.9 replacements may stretch the duration.
 */
export function addBreakerStrengthBoostUntilCheckpoint(
  state: GameState,
  args: { createdBy: string; breakerId: string; amount: number },
): void {
  if (args.amount === 0) return;
  if (args.amount > 0) {
    maybeGrantSystemSeizureRunDuration(state, args.breakerId);
    const resolved = resolveStrengthIncreaseDuration(
      state,
      args.breakerId,
      "checkpoint",
    );
    if (resolved.duration === "turn" && resolved.replacement) {
      addBreakerStrengthBoostThisTurn(state, args);
      if (
        resolved.replacement.trackWhileSourceActive &&
        resolved.original
      ) {
        noteHostDurationReplacement(state, {
          sourceId: resolved.replacement.sourceId,
          breakerId: args.breakerId,
          amount: args.amount,
          original: resolved.original,
          replacedTo: "turn",
        });
      }
      return;
    }
    if (resolved.duration === "run" && state.run) {
      addBreakerStrengthBoostThisRun(state, args);
      if (
        resolved.replacement?.trackWhileSourceActive &&
        resolved.original
      ) {
        noteHostDurationReplacement(state, {
          sourceId: resolved.replacement.sourceId,
          breakerId: args.breakerId,
          amount: args.amount,
          original: resolved.original,
          replacedTo: "run",
        });
      }
      return;
    }
  }
  const checkpointBoosts = (state.turn.checkpointBreakerBoosts ??= {});
  checkpointBoosts[args.breakerId] =
    (checkpointBoosts[args.breakerId] ?? 0) + args.amount;
  addLingeringEffect(state, {
    createdBy: args.createdBy,
    duration: { kind: "until_checkpoint" },
    kind: LINGERING_KIND_BREAKER_STRENGTH_CHECKPOINT,
    payload: { breakerId: args.breakerId, amount: args.amount },
  });
}

/**
 * Mark lingerings whose duration has passed. Call from 10.3.1b with the
 * durations that just ended (turn/run/encounter/until_checkpoint).
 */
export function expireLingeringEffects(
  state: GameState,
  ended: {
    turn?: Side;
    run?: boolean;
    encounter?: boolean;
    untilCheckpoint?: boolean;
  },
): number {
  let removed = 0;
  for (const effect of state.lingeringEffects) {
    if (effect.expired) continue;
    const d = effect.duration;
    let expire = false;
    if (d.kind === "until_checkpoint" && ended.untilCheckpoint) expire = true;
    if (d.kind === "run" && ended.run) expire = true;
    if (d.kind === "encounter" && ended.encounter) expire = true;
    if (d.kind === "turn" && ended.turn) {
      if (!d.side || d.side === ended.turn) expire = true;
    }
    if (!expire) continue;
    effect.expired = true;
    removed += 1;
  }
  if (removed > 0) {
    state.lingeringEffects = state.lingeringEffects.filter((e) => !e.expired);
    state.log.push(
      `Lingering effects removed: ${removed} (CR ${CR.lingeringEffect.number} / ${CR.checkpointDurationAbilities.number}).`,
    );
  }
  return removed;
}
