/**
 * First-class lingering-effect registry (CR 9.10.1). Effects are independent
 * of their source once created and are removed at 10.3.1b when duration has
 * passed. Coexists with ad-hoc turn/run fields until those migrate here.
 */
import { CR } from "../timing/labels.js";
import { cancelPendingIfSourceInactive } from "./pendingAbilities.js";
import { applyBreakerStrengthIncrease } from "./strengthIncrease.js";
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
 * Payload: `{ delta: number }`. Cleared when the Runner's turn ends.
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
 * CR 9.10.1). Payload: `{ cardId: string }`. Also sets
 * `abilitiesBlanked` / `abilitiesBlankedCorpTurnsRemaining` for consumers.
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
 * Ice strength boost for the remainder of the encounter / open run
 * (CR 9.10.1; Stavka-class fortify before encounter begins).
 * Payload: `{ iceId: string; amount: number }`.
 */
export const LINGERING_KIND_ICE_STRENGTH_ENCOUNTER = "ice_strength_encounter";

/**
 * Icebreaker strength boost until the next checkpoint (CR 9.10.1 /
 * icebreaker strength outside an encounter). Payload:
 * `{ breakerId: string; amount: number }`.
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

const BREAKER_STRENGTH_KINDS = new Set([
  LINGERING_KIND_BREAKER_STRENGTH,
  LINGERING_KIND_BREAKER_STRENGTH_RUN,
  LINGERING_KIND_BREAKER_STRENGTH_ENCOUNTER,
  LINGERING_KIND_BREAKER_STRENGTH_CHECKPOINT,
]);

/** True when the registry has a non-expired pump for this breaker. */
export function hasLingeringBreakerStrength(
  state: GameState,
  breakerId: string,
): boolean {
  for (const e of state.lingeringEffects) {
    if (e.expired) continue;
    if (!BREAKER_STRENGTH_KINDS.has(e.kind)) continue;
    if (e.kind === LINGERING_KIND_BREAKER_STRENGTH_RUN && !state.run) continue;
    if (
      e.kind === LINGERING_KIND_BREAKER_STRENGTH_ENCOUNTER &&
      !state.run?.encounter
    ) {
      continue;
    }
    const payload = e.payload as { breakerId?: string } | undefined;
    if (payload?.breakerId === breakerId) return true;
  }
  return false;
}

/**
 * Temporary breaker strength from the lingering registry (CR 9.10.1).
 * Registry is authoritative after framework migration M2.
 */
export function lingeringBreakerStrengthBoost(
  state: GameState,
  breakerId: string,
): number {
  let n = 0;
  for (const e of state.lingeringEffects) {
    if (e.expired) continue;
    if (!BREAKER_STRENGTH_KINDS.has(e.kind)) continue;
    // Run/encounter lingerings only apply while that duration is open.
    if (e.kind === LINGERING_KIND_BREAKER_STRENGTH_RUN && !state.run) continue;
    if (
      e.kind === LINGERING_KIND_BREAKER_STRENGTH_ENCOUNTER &&
      !state.run?.encounter
    ) {
      continue;
    }
    const payload = e.payload as
      | { breakerId?: string; amount?: number }
      | undefined;
    if (!payload || payload.breakerId !== breakerId) continue;
    n += payload.amount ?? 0;
  }
  return n;
}

/** Temporary ice strength from turn + encounter lingerings (CR 9.10.1). */
export function lingeringIceStrengthBoost(
  state: GameState,
  iceId: string,
): number {
  let n = 0;
  for (const e of state.lingeringEffects) {
    if (e.expired) continue;
    if (
      e.kind !== LINGERING_KIND_ICE_STRENGTH &&
      e.kind !== LINGERING_KIND_ICE_STRENGTH_ENCOUNTER
    ) {
      continue;
    }
    // Encounter-kind ice boosts live on the run object historically; apply
    // whenever a run is open (Stavka fortify at rez before encounter begins).
    if (e.kind === LINGERING_KIND_ICE_STRENGTH_ENCOUNTER && !state.run) {
      continue;
    }
    const payload = e.payload as
      | { iceId?: string; amount?: number }
      | undefined;
    if (!payload || payload.iceId !== iceId) continue;
    n += payload.amount ?? 0;
  }
  return n;
}

/** Runner MU modifier from lingerings until Runner turn end (CR 9.10.1). */
export function lingeringRunnerMuModifier(state: GameState): number {
  let n = 0;
  for (const e of state.lingeringEffects) {
    if (e.expired || e.kind !== LINGERING_KIND_RUNNER_MU) continue;
    const payload = e.payload as { delta?: number } | undefined;
    n += payload?.delta ?? 0;
  }
  return n;
}

/** Sum of active breaker strength lingerings of one kind (tests / debug). */
export function lingeringBreakerStrengthOfKind(
  state: GameState,
  breakerId: string,
  kind: string,
): number {
  let n = 0;
  for (const e of state.lingeringEffects) {
    if (e.expired || e.kind !== kind) continue;
    const payload = e.payload as
      | { breakerId?: string; amount?: number }
      | undefined;
    if (!payload || payload.breakerId !== breakerId) continue;
    n += payload.amount ?? 0;
  }
  return n;
}

/** Sum of active ice strength lingerings of one kind (tests / debug). */
export function lingeringIceStrengthOfKind(
  state: GameState,
  iceId: string,
  kind: string,
): number {
  let n = 0;
  for (const e of state.lingeringEffects) {
    if (e.expired || e.kind !== kind) continue;
    const payload = e.payload as
      | { iceId?: string; amount?: number }
      | undefined;
    if (!payload || payload.iceId !== iceId) continue;
    n += payload.amount ?? 0;
  }
  return n;
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
 * Register a this-turn icebreaker strength boost (CR 9.10.1). Opens the
 * strength-increase interrupt window.
 */
export function addBreakerStrengthBoostThisTurn(
  state: GameState,
  args: { createdBy: string; breakerId: string; amount: number },
): void {
  applyBreakerStrengthIncrease(state, {
    ...args,
    requestedDuration: "turn",
  });
}

/**
 * Register a this-turn ice strength boost (CR 9.10.1).
 */
export function addIceStrengthBoostThisTurn(
  state: GameState,
  args: { createdBy: string; iceId: string; amount: number },
): void {
  if (args.amount === 0) return;
  addLingeringEffect(state, {
    createdBy: args.createdBy,
    duration: { kind: "turn" },
    kind: LINGERING_KIND_ICE_STRENGTH,
    payload: { iceId: args.iceId, amount: args.amount },
  });
}

/**
 * Blank abilities until Corp turn end (CR 9.10.1). Sets card blank flags for
 * consumers; 10.3.1b expires the registry entry.
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
 * Register a run-duration icebreaker strength boost (CR 9.10.1).
 * Opens the strength-increase interrupt window; 9.9.9 may stretch duration.
 */
export function addBreakerStrengthBoostThisRun(
  state: GameState,
  args: { createdBy: string; breakerId: string; amount: number },
): void {
  applyBreakerStrengthIncrease(state, {
    ...args,
    requestedDuration: "run",
  });
}

/**
 * Register an encounter-duration icebreaker strength boost (CR 9.10.1).
 * Opens the strength-increase interrupt window; 9.9.9 may stretch duration.
 */
export function addBreakerStrengthBoostThisEncounter(
  state: GameState,
  args: { createdBy: string; breakerId: string; amount: number },
): void {
  applyBreakerStrengthIncrease(state, {
    ...args,
    requestedDuration: "encounter",
  });
}

/**
 * Register an encounter-duration ice strength boost (CR 9.10.1). Requires an
 * active run; no-ops otherwise. Applies while the run is open.
 */
export function addIceStrengthBoostThisEncounter(
  state: GameState,
  args: { createdBy: string; iceId: string; amount: number },
): void {
  if (args.amount === 0 || !state.run) return;
  addLingeringEffect(state, {
    createdBy: args.createdBy,
    duration: { kind: "encounter" },
    kind: LINGERING_KIND_ICE_STRENGTH_ENCOUNTER,
    payload: { iceId: args.iceId, amount: args.amount },
  });
}

/**
 * Register an until-next-checkpoint icebreaker strength boost (CR 9.10.1).
 * Opens the strength-increase interrupt window; 9.9.9 may stretch duration.
 */
export function addBreakerStrengthBoostUntilCheckpoint(
  state: GameState,
  args: { createdBy: string; breakerId: string; amount: number },
): void {
  applyBreakerStrengthIncrease(state, {
    ...args,
    requestedDuration: "checkpoint",
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
