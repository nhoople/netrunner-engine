/**
 * Approach-server and pass-all-ice-protecting-server conditionals.
 * Notes queues for 10.3.1a (phase 3).
 */
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState } from "./types.js";

/** Nanisivik-class: queue a rezzed root onApproachServer card id. */
export function noteApproachServer(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card?.onApproachServer || !card.rezzed) return;
  if (abilitiesSuppressed(state, cardId)) return;
  if (!state.turn.approachServerPendingIds) {
    state.turn.approachServerPendingIds = [];
  }
  if (state.turn.approachServerPendingIds.includes(cardId)) return;
  state.turn.approachServerPendingIds.push(cardId);
}

/**
 * Queue the attacked server when all ice protecting it has been passed
 * (root onPassAllIceProtectingServer).
 */
export function notePassAllIceProtectingServer(
  state: GameState,
  serverId: string,
): void {
  const server = state.servers[serverId as keyof typeof state.servers];
  const has = (server?.root ?? []).some((id) => {
    if (abilitiesSuppressed(state, id)) return false;
    const card = state.cards[id];
    return Boolean(card?.rezzed && card.onPassAllIceProtectingServer);
  });
  if (!has) return;
  if (!state.turn.passAllIceProtectingServerPendingIds) {
    state.turn.passAllIceProtectingServerPendingIds = [];
  }
  if (state.turn.passAllIceProtectingServerPendingIds.includes(serverId)) {
    return;
  }
  state.turn.passAllIceProtectingServerPendingIds.push(serverId);
}
