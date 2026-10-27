/**
 * First-class lingering-effect registry (CR 9.10.1). Effects are independent
 * of their source once created and are removed at 10.3.1b when duration has
 * passed. Coexists with ad-hoc turn/run fields until those migrate here.
 */
import { CR } from "../timing/labels.js";
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
