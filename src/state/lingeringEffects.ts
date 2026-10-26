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
