import type { CardInstance } from "./types.js";

/**
 * The Corp can advance an installed agenda, or another installed card that
 * says it can be advanced (CR 1.18.3). A card that can be advanced only while
 * rezzed is skipped until then, and one that can be advanced only while
 * unrezzed is skipped once rezzed.
 */
export function mayAdvanceInstalledCard(card: CardInstance): boolean {
  if (card.type === "agenda") return true;
  if (card.canAdvanceOnlyWhenRezzed && !card.rezzed) return false;
  return printsCanBeAdvanced(card);
}

/**
 * The card's own text lets it be advanced now (CR 1.18.3): `canAdvance`
 * true, or "unrezzed" while it is unrezzed (Haas Arcology AI: "You can
 * advance this asset if it is unrezzed"). Readers that ask "a card that can
 * be advanced" use this, not the raw field.
 */
export function printsCanBeAdvanced(card: {
  canAdvance?: boolean | "unrezzed";
  rezzed?: boolean;
}): boolean {
  if (card.canAdvance === "unrezzed") return !card.rezzed;
  return card.canAdvance === true;
}
