/** Runner max hand size recompute (CR §5.5.3 / continuous modifiers). */

import type { GameState } from "./types.js";

/**
 * Base 5 − brain damage, plus installed Runner `handSizeBonus` /
 * `handSizePerPowerCounter` / Hackerspace-class hosting bonuses, minus rezzed
 * Corp `runnerHandSizePenaltyPerPowerCounter`.
 */
export function computeRunnerMaxHandSize(state: GameState): number {
  let n = 5 - (state.runner.brainDamage ?? 0);
  const defCounts = new Map<string, number>();
  for (const id of state.runner.rig) {
    const c = state.cards[id];
    if (!c) continue;
    const defId = c.defId;
    if (!defId) continue;
    defCounts.set(defId, (defCounts.get(defId) ?? 0) + 1);
  }
  for (const [defId, count] of defCounts) {
    const sample = state.runner.rig.find(
      (id) => state.cards[id]?.defId === defId,
    );
    if (!sample) continue;
    const per =
      state.cards[sample]?.handSizeBonusPerInstalledCopyWithSameDefId ?? 0;
    if (per > 0) n += per * count;
  }
  for (const id of state.runner.rig) {
    const c = state.cards[id];
    if (!c) continue;
    n += c.handSizeBonus ?? 0;
    const per = c.handSizePerPowerCounter ?? 0;
    if (per !== 0) n += (c.powerCounters ?? 0) * per;
    const hostBonus = c.handSizeBonusIfHostingCompanionAndConnection;
    if (hostBonus) {
      const hosted = state.runner.rig.filter(
        (hid) => state.cards[hid]?.hostId === id,
      );
      const hasCompanion = hosted.some((hid) =>
        (state.cards[hid]?.subtypes ?? []).includes("companion"),
      );
      const hasConnection = hosted.some((hid) =>
        (state.cards[hid]?.subtypes ?? []).includes("connection"),
      );
      if (hasCompanion && hasConnection) n += hostBonus;
    }
  }
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root, ...server.ice]) {
      const c = state.cards[id];
      if (!c?.rezzed) continue;
      n += c.runnerHandSizeBonus ?? 0;
      const per = c.runnerHandSizePenaltyPerPowerCounter ?? 0;
      if (per !== 0) n -= (c.powerCounters ?? 0) * per;
    }
  }
  for (const id of state.runner.rig) {
    if (state.cards[id]?.handSizeEqualsCredits) {
      n = state.runner.credits;
      break;
    }
  }
  return Math.max(0, n);
}

export function recomputeRunnerMaxHandSize(state: GameState): void {
  state.runner.maxHandSize = computeRunnerMaxHandSize(state);
}
