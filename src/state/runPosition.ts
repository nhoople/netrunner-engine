/**
 * The Runner's position during a run (CR 6.2).
 *
 * `run.position` is an index into the attacked server's ice, but the rules
 * treat the position as an element of the sequence, not an index (CR 6.2.6).
 * Everything that removes ice from a server reports it here, so the index
 * keeps naming the same element, and an emptied position the Runner is in
 * continues to exist until they move (CR 6.2.4).
 */

import type { GameState, RunState, ServerId } from "./types.js";

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
  if (run && run.attackedServerId === serverId && typeof run.position === "number") {
    run.position += 1;
  }
}
