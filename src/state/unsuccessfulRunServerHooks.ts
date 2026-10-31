/**
 * Corp root unsuccessful-run server abilities. Notes queues for 10.3.1a
 * (phase 3).
 */
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState } from "./types.js";

/** Queue rezzed-root onUnsuccessfulRunOnThisServer on the attacked server. */
export function noteUnsuccessfulRunServerAbilities(state: GameState): void {
  const run = state.run;
  if (!run) return;
  const server = state.servers[run.attackedServerId];
  if (!server) return;
  for (const id of [...server.root]) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.rezzed || !card.onUnsuccessfulRunOnThisServer) continue;
    if (!state.turn.unsuccessfulRunServerPendingIds) {
      state.turn.unsuccessfulRunServerPendingIds = [];
    }
    if (state.turn.unsuccessfulRunServerPendingIds.includes(id)) continue;
    state.turn.unsuccessfulRunServerPendingIds.push(id);
  }
}
