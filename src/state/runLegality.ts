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

/** Replicating Perfection: remotes forbidden until a central run this turn. */
export function replicatingPerfectionBlocksRemote(
  state: GameState,
  serverId: ServerId,
): boolean {
  const server = state.servers[serverId];
  if (!server || server.kind !== "remote") return false;
  if (state.turn.remotesUnlockedByCentralRunThisTurn) return false;
  const idCard = state.cards[state.corp.identityId];
  return Boolean(idCard?.cannotRunRemotesUntilCentralRunThisTurn);
}

export function isRunTargetAllowed(
  state: GameState,
  serverId: ServerId,
): boolean {
  if (isFirstRunRemoteForbidden(state, serverId)) return false;
  if (replicatingPerfectionBlocksRemote(state, serverId)) return false;
  return true;
}
