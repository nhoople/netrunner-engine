/**
 * Bypass conditionals (ice + Runner onBypass). Notes queues for 10.3.1a
 * (phase 3). Jeitinho heap-install-on-bypass stays a mid-hook offer.
 */
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState } from "./types.js";

/**
 * Queue ice and Runner-installed onBypass sources for the next 10.3.1a
 * checkpoint. Does not open Jeitinho (caller handles that).
 */
export function noteBypassTriggers(state: GameState, iceId: string): void {
  const bypassed = state.cards[iceId];
  if (!state.turn.bypassPendingSourceIds) {
    state.turn.bypassPendingSourceIds = [];
  }
  const queue = state.turn.bypassPendingSourceIds;
  if (bypassed?.onBypass && !abilitiesSuppressed(state, iceId)) {
    if (!queue.includes(iceId)) queue.push(iceId);
  }
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    if (!state.cards[id]?.onBypass) continue;
    if (!queue.includes(id)) queue.push(id);
  }
}
