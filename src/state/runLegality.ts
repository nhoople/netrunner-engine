/** Run target restrictions (Front Company first-run-not-remote, etc.). */

import type { GameState, ServerId } from "./types.js";

/** Any rezzed Corp root card forbids the first run of the turn against remotes. */
export function firstRunCannotTargetRemoteActive(state: GameState): boolean {
  for (const server of Object.values(state.servers)) {
    for (const id of server.root) {
      const card = state.cards[id];
      if (card?.rezzed && card.firstRunCannotTargetRemote) return true;
    }
  }
  return false;
}

export function isFirstRunRemoteForbidden(
  state: GameState,
  serverId: ServerId,
): boolean {
  if (state.turn.runnerMadeRunThisTurn) return false;
  const server = state.servers[serverId];
  if (!server || server.kind !== "remote") return false;
  return firstRunCannotTargetRemoteActive(state);
}

export function isRunTargetAllowed(
  state: GameState,
  serverId: ServerId,
): boolean {
  return !isFirstRunRemoteForbidden(state, serverId);
}
