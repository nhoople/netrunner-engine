/** Shared ability-suppression checks (Magnet blanking, Light the Fire root blank). */

import type { GameState } from "./types.js";

/**
 * True when a card's abilities are suppressed for rules purposes.
 * - Magnet: `abilitiesBlanked` while hosted
 * - Light the Fire!: root of the attacked server during a blanking run
 */
export function abilitiesSuppressed(
  state: GameState,
  cardId: string,
): boolean {
  const card = state.cards[cardId];
  if (!card) return false;
  if (card.abilitiesBlanked) return true;
  const run = state.run;
  if (!run?.blankAttackedServerRoot) return false;
  const server = state.servers[run.attackedServerId];
  return server?.root.includes(cardId) ?? false;
}
