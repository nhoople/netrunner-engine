/** Earth Station-class: additional credit cost to initiate a run. */

import type { GameState, ServerId } from "./types.js";

/**
 * Additional credits the Runner must pay to initiate a run on `serverId`,
 * based on Corp identity face (Earth Station; CR 1.16.1b / 4.6.8f).
 */
export function additionalRunInitiateCredits(
  state: GameState,
  serverId: ServerId,
): number {
  const idCard = state.cards[state.corp.identityId];
  const tax = idCard?.additionalRunInitiateCredits;
  if (!tax) return 0;
  const flipped = Boolean(idCard?.identityFlipped);
  if (!flipped && serverId === "hq" && (tax.hqUnflipped ?? 0) > 0) {
    return tax.hqUnflipped ?? 0;
  }
  const server = state.servers[serverId];
  if (
    flipped &&
    server?.kind === "remote" &&
    (tax.remoteFlipped ?? 0) > 0
  ) {
    return tax.remoteFlipped ?? 0;
  }
  return 0;
}
