/** Run target restrictions (Front Company first-run-not-remote, etc.). */

import { abilitiesSuppressed } from "./abilities.js";
import type { GameState, ServerId } from "./types.js";

/** Any rezzed Corp root card forbids the first run of the turn against remotes. */
export function firstRunCannotTargetRemoteActive(state: GameState): boolean {
  for (const server of Object.values(state.servers)) {
    for (const id of server.root) {
      if (abilitiesSuppressed(state, id)) continue;
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
  if (abilitiesSuppressed(state, state.corp.identityId)) return false;
  const idCard = state.cards[state.corp.identityId];
  return Boolean(idCard?.cannotRunRemotesUntilCentralRunThisTurn);
}

/** Off the Grid-class: rezzed root upgrade blocks runs on its server. */
export function offTheGridBlocksServer(
  state: GameState,
  serverId: ServerId,
): boolean {
  const server = state.servers[serverId];
  if (!server) return false;
  for (const id of server.root) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (
      card?.rezzed &&
      card.blocksRunnerRunsOnHostServer &&
      card.type === "upgrade"
    ) {
      return true;
    }
  }
  return false;
}

export function isRunTargetAllowed(
  state: GameState,
  serverId: ServerId,
): boolean {
  if (state.turn.cannotMakeAnotherRunThisTurn) return false;
  if (state.turn.cotcForbiddenServerIds?.includes(serverId)) return false;
  if (isFirstRunRemoteForbidden(state, serverId)) return false;
  if (replicatingPerfectionBlocksRemote(state, serverId)) return false;
  if (offTheGridBlocksServer(state, serverId)) return false;
  return true;
}
