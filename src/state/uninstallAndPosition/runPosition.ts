/**
 * The Runner's position during a run (CR 6.2).
 *
 * `run.position` is an index into the attacked server's ice, but the rules
 * treat the position as an element of the sequence, not an index (CR 6.2.6).
 * Everything that removes ice from a server reports it here, so the index
 * keeps naming the same element, and an emptied position the Runner is in
 * continues to exist until they move (CR 6.2.4).
 */

import type { GameState } from "../types/game.js";
import type { RunState } from "../types/run.js";
import type { ServerId } from "../types/servers.js";

/**
 * The ice in the Runner's position. Null when the Runner has no position or
 * the ice that was there has been uninstalled (CR 6.2.4).
 */
export function iceAtRunnerPosition(state: GameState): string | null {
  const run = state.run;
  if (!run || run.position === null || run.positionVacated) return null;
  return state.servers[run.attackedServerId]?.ice[run.position] ?? null;
}

/** Move the Runner to the position at `index`, or to no position (CR 6.2.8). */
export function setRunnerPosition(run: RunState, index: number | null): void {
  run.position = index;
  run.positionVacated = false;
}

/**
 * The Runner can be moved to a position only while a run is in progress and
 * before its Success Phase (CR 6.2.5d, 6.2.8c). The run is declared
 * successful as the Success Phase begins (CR 6.9.5a). The engine's
 * `"success"` phase also covers approaching the server (CR 6.9.4g), which
 * is still the Movement Phase, so it does not stop a move.
 */
export function runnerCanMoveToPosition(state: GameState): boolean {
  const run = state.run;
  if (!run) return false;
  if (run.successful === true) return false;
  return !["breach", "access", "ends"].includes(run.phase);
}

/**
 * Change the attacked server without giving the Runner a position there:
 * breaching another server or a server the success redirects to
 * (CR 6.2.5d: the Runner has no position from the Success Phase on).
 * The Runner's position, if any, is left as it is.
 */
export function setAttackedServer(run: RunState, serverId: ServerId): void {
  run.attackedServerId = serverId;
}

/**
 * Move the Runner to "the outermost position" of `serverId` (CR 6.2.8b).
 * That server becomes the attacked server; the Runner's position becomes the
 * outermost ice's, or no position when the server has no ice. Does nothing
 * and returns false when the Runner cannot move to a position (CR 6.2.8c).
 * The caller moves the run to the step the ability names.
 */
export function moveRunnerToOutermost(
  state: GameState,
  serverId: ServerId,
): boolean {
  const run = state.run;
  const server = state.servers[serverId];
  if (!run || !server || !runnerCanMoveToPosition(state)) return false;
  run.attackedServerId = serverId;
  setRunnerPosition(run, server.ice.length > 0 ? 0 : null);
  return true;
}

/**
 * Move the Runner to the position of installed ice `iceId` (CR 6.2.8a). The
 * server it protects becomes the attacked server. Does nothing and returns
 * false when the ice protects no server or the Runner cannot move to a
 * position (CR 6.2.1a, 6.2.8c).
 */
export function moveRunnerToIce(state: GameState, iceId: string): boolean {
  const run = state.run;
  if (!run || !runnerCanMoveToPosition(state)) return false;
  for (const server of Object.values(state.servers)) {
    const at = server.ice.indexOf(iceId);
    if (at < 0) continue;
    run.attackedServerId = server.id;
    setRunnerPosition(run, at);
    return true;
  }
  return false;
}

/**
 * Positions at `indices` of `serverId` ceased to exist (CR 6.2.4, 10.3.1i).
 * The Runner keeps their own position, so each one outward of it lowers
 * the index (CR 6.2.6).
 */
export function notePositionsCeased(
  state: GameState,
  serverId: ServerId,
  indices: readonly number[],
): void {
  const run = state.run;
  if (!run || run.attackedServerId !== serverId || run.position === null) {
    return;
  }
  const position = run.position;
  run.position -= indices.filter((index) => index < position).length;
}

/**
 * Put the Runner in the position of `iceId`, wherever it now is, keeping
 * the encounter with it: the encountered ice moved to another position or
 * was swapped with installed ice in another position (CR 6.2.7d).
 */
export function followEncounteredIce(state: GameState, iceId: string): void {
  const run = state.run;
  if (!run || run.encounter?.iceId !== iceId) return;
  // An encounter during the breach (Ganked!) gives the Runner no position
  // (CR 6.2.5d).
  if (!runnerCanMoveToPosition(state)) return;
  for (const server of Object.values(state.servers)) {
    const at = server.ice.indexOf(iceId);
    if (at < 0) continue;
    run.attackedServerId = server.id;
    setRunnerPosition(run, at);
    return;
  }
}

/**
 * Move the Runner 1 position inward (CR 6.9.4d). From an emptied position
 * the next position inward is the one that now has its index.
 */
export function moveRunnerInward(state: GameState): void {
  const run = state.run;
  if (!run || run.position === null) return;
  const count = state.servers[run.attackedServerId]?.ice.length ?? 0;
  const next = run.positionVacated ? run.position : run.position + 1;
  setRunnerPosition(run, next < count ? next : null);
}

/**
 * Call before installed ice `cardId` is uninstalled.
 *
 * Ice outward of the Runner leaving does not move them (CR 6.2.6). When the
 * ice in their own position leaves, the position stays until they move
 * (CR 6.2.4), and an approach or encounter of that ice ends once any open
 * paid ability window is completed (CR 6.2.7a, 6.2.7c, 8.5.10).
 */
export function noteIceUninstalled(state: GameState, cardId: string): void {
  const run = state.run;
  if (!run) return;
  const installed =
    Boolean(state.cards[cardId]?.hostId) ||
    Object.values(state.servers).some((server) => server.ice.includes(cardId));
  if (!installed) return;
  if (run.encounter?.iceId === cardId) run.encounter.iceUninstalled = true;
  if (run.phase === "approach_ice" && run.forceEncounterIceId === cardId) {
    run.approachedIceUninstalled = true;
  }
  if (run.position === null) return;
  const at = state.servers[run.attackedServerId]?.ice.indexOf(cardId) ?? -1;
  if (at < 0 || at > run.position) return;
  if (at < run.position) {
    run.position -= 1;
    return;
  }
  if (run.positionVacated) return;
  run.positionVacated = true;
  if (run.phase === "approach_ice" && !run.forceEncounterIceId) {
    run.approachedIceUninstalled = true;
  }
}

/**
 * Put ice in a new outermost position protecting `serverId`, where an
 * install or move goes unless its text says otherwise (CR 6.2.2a). The
 * Runner keeps their position (CR 6.2.6a).
 */
export function addOutermostIce(
  state: GameState,
  serverId: ServerId,
  cardId: string,
): void {
  const server = state.servers[serverId];
  if (!server) return;
  server.ice.unshift(cardId);
  const run = state.run;
  if (
    run &&
    run.attackedServerId === serverId &&
    typeof run.position === "number"
  ) {
    run.position += 1;
  }
}
