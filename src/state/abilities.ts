/** Shared ability-suppression checks (Magnet blanking, Hush, Light the Fire). */

import type { GameState } from "./types.js";

/**
 * True when a card's abilities are suppressed for rules purposes.
 * - Magnet: `abilitiesBlanked` while hosted
 * - Hush: continuous blank of host ice abilities (printed subs still resolve)
 * - Light the Fire!: root of the attacked server during a blanking run
 */
export function abilitiesSuppressed(
  state: GameState,
  cardId: string,
): boolean {
  const card = state.cards[cardId];
  if (!card) return false;
  if (card.abilitiesBlanked) return true;
  if (card.type === "ice") {
    for (const id of state.runner.rig) {
      const host = state.cards[id];
      if (host?.blanksHostAbilities && host.hostId === cardId) return true;
    }
  }
  const run = state.run;
  if (!run?.blankAttackedServerRoot) return false;
  const server = state.servers[run.attackedServerId];
  return server?.root.includes(cardId) ?? false;
}
