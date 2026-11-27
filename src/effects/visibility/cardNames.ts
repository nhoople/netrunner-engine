/**
 * Card names a player may choose when an ability says "choose a card name".
 *
 * Any card name may be chosen, not only the names of cards in this game, so
 * the list comes from the card catalog. Building it from the game's cards
 * would show the chooser what the other player holds in hidden zones
 * (CR 10.2.2a, 10.2.2b). Identities are left out: a name on a card that
 * cannot be in any zone the ability looks at does nothing.
 */
import { loadCardCatalog } from "../../cards/load.js";
import { type CardDef } from "../../cards/cardDef.js";

export function catalogCardNames(
  keep: (def: CardDef) => boolean = () => true,
): string[] {
  const names = new Set<string>();
  for (const def of loadCardCatalog().values()) {
    if (def.type === "identity" || !keep(def)) continue;
    names.add(def.title);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}
