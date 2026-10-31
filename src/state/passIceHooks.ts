/**
 * Pass-ice conditionals (unrezzed / rezzed / ice onPass / host / protecting
 * this server). Notes MetPending for 10.3.1a (phase 3).
 */
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState } from "./types.js";

/** Runner onPassUnrezzedIce — queue for 10.3.1a. */
export function notePassUnrezzedIce(state: GameState): void {
  if (state.turn.passUnrezzedIceMetPending) return;
  const has = state.runner.installed.some((id) => {
    if (abilitiesSuppressed(state, id)) return false;
    return Boolean(state.cards[id]?.onPassUnrezzedIce);
  });
  if (!has) return;
  state.turn.passUnrezzedIceMetPending = true;
}

/** Runner onPassRezzedIce — queue for 10.3.1a. */
export function notePassRezzedIce(state: GameState): void {
  if (state.turn.passRezzedIceMetPending) return;
  const has = state.runner.installed.some((id) => {
    if (abilitiesSuppressed(state, id)) return false;
    return Boolean(state.cards[id]?.onPassRezzedIce);
  });
  if (!has) return;
  state.turn.passRezzedIceMetPending = true;
}

/** Ice onPass — queue the passed ice id for 10.3.1a. */
export function noteIceOnPass(state: GameState, iceId: string): void {
  if (!state.turn.passIceOnPassPendingIds) {
    state.turn.passIceOnPassPendingIds = [];
  }
  if (state.turn.passIceOnPassPendingIds.includes(iceId)) return;
  state.turn.passIceOnPassPendingIds.push(iceId);
}

/** Hosted onPassHost — queue the host ice id for 10.3.1a. */
export function notePassHost(state: GameState, iceId: string): void {
  const has = state.runner.installed.some((hid) => {
    if (abilitiesSuppressed(state, hid)) return false;
    const hostee = state.cards[hid];
    return Boolean(hostee?.onPassHost && hostee.hostId === iceId);
  });
  if (!has) return;
  if (!state.turn.passHostPendingIceIds) {
    state.turn.passHostPendingIceIds = [];
  }
  if (state.turn.passHostPendingIceIds.includes(iceId)) return;
  state.turn.passHostPendingIceIds.push(iceId);
}

/**
 * Upgrade onPassRezzedIceProtectingThisServer — queue the attacked server
 * for 10.3.1a.
 */
export function notePassRezzedIceProtectingServer(
  state: GameState,
  serverId: string,
): void {
  const server = state.servers[serverId as keyof typeof state.servers];
  const has = (server?.root ?? []).some((upId) => {
    if (abilitiesSuppressed(state, upId)) return false;
    const up = state.cards[upId];
    return Boolean(up?.rezzed && up.onPassRezzedIceProtectingThisServer);
  });
  if (!has) return;
  if (!state.turn.passProtectingServerPendingIds) {
    state.turn.passProtectingServerPendingIds = [];
  }
  if (state.turn.passProtectingServerPendingIds.includes(serverId)) return;
  state.turn.passProtectingServerPendingIds.push(serverId);
}
