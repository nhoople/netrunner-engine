import type { CardInstance } from "./types.js";

/**
 * The Corp can advance an installed agenda, or another installed card that
 * says it can be advanced (CR 1.18.3). A card that can be advanced only while
 * rezzed is skipped until then.
 */
export function mayAdvanceInstalledCard(card: CardInstance): boolean {
  if (card.type === "agenda") return true;
  if (card.canAdvanceOnlyWhenRezzed && !card.rezzed) return false;
  return card.canAdvance === true;
}
