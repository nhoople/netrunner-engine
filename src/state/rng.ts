/**
 * Seeded random stream for every procedure the rules make random
 * (shuffles, random trashes, random reveals).
 *
 * The stream position lives on the game state (`rngState`), so a state and
 * the intents applied to it always produce the same result. A host seeds a
 * match once with `seedRng` and can then replay its intent log exactly.
 * Nothing in `src/` may call `Math.random`.
 */

import type { GameState } from "./types.js";

/** Stream position used when a state was never seeded. */
export const DEFAULT_RNG_SEED = 0x9e3779b9;

let override: (() => number) | null = null;

/**
 * Test hook: replace the stream with `fn` (returns [0, 1)) for every state.
 * Pass `null` to go back to each state's own seeded stream.
 */
export function setRng(fn: (() => number) | null): void {
  override = fn;
}

/** Start this state's random stream at `seed`. */
export function seedRng(state: GameState, seed: number): void {
  state.rngState = seed >>> 0 || 1;
}

/** Uniform float in [0, 1), advancing this state's stream (mulberry32). */
export function random(state: GameState): number {
  if (override) return override();
  let a = (state.rngState ?? DEFAULT_RNG_SEED) | 0;
  a = (a + 0x6d2b79f5) | 0;
  state.rngState = a >>> 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Uniform integer in [0, bound). Returns 0 when `bound` is 0 or less. */
export function randomInt(state: GameState, bound: number): number {
  if (bound <= 0) return 0;
  return Math.floor(random(state) * bound);
}

/** Shuffle `arr` in place (Fisher–Yates). */
export function shuffleInPlace<T>(state: GameState, arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

/**
 * Pick `count` distinct elements from `arr` uniformly at random
 * (Fisher–Yates partial shuffle). Order of returned picks is shuffled.
 */
export function pickRandomSubset<T>(
  state: GameState,
  arr: readonly T[],
  count: number,
): T[] {
  const n = Math.min(Math.max(0, count), arr.length);
  if (n === 0) return [];
  const copy = [...arr];
  for (let i = copy.length - 1; i > copy.length - 1 - n; i--) {
    const j = Math.floor(random(state) * (i + 1));
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy.slice(copy.length - n);
}
