/** Shared ability-suppression checks via practical CR 9.12 blanking solver. */

import type { GameState } from "./types.js";
import { resolveBlankedCardIds } from "./continuousEffects.js";

/**
 * True when a card's abilities are suppressed for rules purposes.
 *
 * Resolves blanking-class continuous effects with CR **9.12.1d** / **9.12.1e**
 * dependency order (Hush × Magnet hosting loop, Magnet continuous hosted
 * blanks, Klevetnik temporary flags, Light the Fire root blank). Printed
 * subroutines on blanked ice still resolve — callers gate abilities only.
 */
export function abilitiesSuppressed(
  state: GameState,
  cardId: string,
): boolean {
  if (!state.cards[cardId]) return false;
  return resolveBlankedCardIds(state).has(cardId);
}
