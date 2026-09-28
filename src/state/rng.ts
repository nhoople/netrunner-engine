/**
 * Seedable RNG for host procedures that CR requires to be random
 * (damage grip trash, etc.). Defaults to a deterministic mulberry32 stream
 * so tests are stable; override with `setRng` when needed.
 */

let seed = 0x9e3779b9;
let override: (() => number) | null = null;

/** Replace the RNG (return [0,1)). Pass `null` to restore seeded stream. */
export function setRng(fn: (() => number) | null): void {
  override = fn;
}

/** Reset the default mulberry32 stream to `s` (non-zero). */
export function setRngSeed(s: number): void {
  seed = s >>> 0 || 1;
  override = null;
}

/** Uniform float in [0, 1). */
export function random(): number {
  if (override) return override();
  // mulberry32
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Pick `count` distinct elements from `arr` uniformly at random
 * (Fisher–Yates partial shuffle). Order of returned picks is shuffled.
 */
export function pickRandomSubset<T>(arr: readonly T[], count: number): T[] {
  const n = Math.min(Math.max(0, count), arr.length);
  if (n === 0) return [];
  const copy = [...arr];
  for (let i = copy.length - 1; i > copy.length - 1 - n; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy.slice(copy.length - n);
}
