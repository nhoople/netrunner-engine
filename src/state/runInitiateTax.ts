/** Earth Station / Reduced Service / Cold Site: additional cost to initiate a run. */

import type { GameState, ServerId } from "./types.js";

export interface RunInitiateTax {
  credits: number;
  clicks: number;
}

/**
 * Additional credits the Runner must pay to initiate a run on `serverId`,
 * based on Corp identity face (Earth Station; CR 1.16.1b / 4.6.8f).
 */
export function additionalRunInitiateCredits(
  state: GameState,
  serverId: ServerId,
): number {
  return additionalRunInitiateTax(state, serverId).credits;
}

/**
 * Additional credits + clicks to initiate a run on `serverId`.
 * Sums Earth Station identity tax with rezzed root upgrades that have
 * `additionalRunInitiatePerPowerCounter` × hosted power counters
 * (Reduced Service / Cold Site Server).
 */
export function additionalRunInitiateTax(
  state: GameState,
  serverId: ServerId,
): RunInitiateTax {
  // Always Have a Backup Plan: second run ignores additional costs to run.
  if (state.run?.backupPlanIgnoreAdditionalCosts) {
    return { credits: 0, clicks: 0 };
  }
  let credits = 0;
  let clicks = 0;

  const idCard = state.cards[state.corp.identityId];
  const tax = idCard?.additionalRunInitiateCredits;
  if (tax) {
    const flipped = Boolean(idCard?.identityFlipped);
    if (!flipped && serverId === "hq" && (tax.hqUnflipped ?? 0) > 0) {
      credits += tax.hqUnflipped ?? 0;
    } else if (
      flipped &&
      state.servers[serverId]?.kind === "remote" &&
      (tax.remoteFlipped ?? 0) > 0
    ) {
      credits += tax.remoteFlipped ?? 0;
    }
  }

  const server = state.servers[serverId];
  if (server) {
    for (const id of server.root) {
      const card = state.cards[id];
      if (!card?.rezzed || !card.additionalRunInitiatePerPowerCounter) continue;
      const n = card.powerCounters ?? 0;
      if (n <= 0) continue;
      const per = card.additionalRunInitiatePerPowerCounter;
      credits += (per.credits ?? 0) * n;
      clicks += (per.clicks ?? 0) * n;
    }
  }

  return { credits, clicks };
}
