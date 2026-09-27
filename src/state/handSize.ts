/** Runner max hand size recompute (CR §5.5.3 / continuous modifiers). */

import type { GameState } from "./types.js";

/**
 * Base 5 − brain damage, plus installed Runner `handSizeBonus` /
 * `handSizePerPowerCounter`, minus rezzed Corp
 * `runnerHandSizePenaltyPerPowerCounter`.
 */
export function computeRunnerMaxHandSize(state: GameState): number {
  let n = 5 - (state.runner.brainDamage ?? 0);
  for (const id of state.runner.rig) {
    const c = state.cards[id];
    if (!c) continue;
    n += c.handSizeBonus ?? 0;
    const per = c.handSizePerPowerCounter ?? 0;
    if (per !== 0) n += (c.powerCounters ?? 0) * per;
  }
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root, ...server.ice]) {
      const c = state.cards[id];
      if (!c?.rezzed) continue;
      const per = c.runnerHandSizePenaltyPerPowerCounter ?? 0;
      if (per !== 0) n -= (c.powerCounters ?? 0) * per;
    }
  }
  return Math.max(0, n);
}

export function recomputeRunnerMaxHandSize(state: GameState): void {
  state.runner.maxHandSize = computeRunnerMaxHandSize(state);
}
