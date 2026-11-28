/**
 * A card definition with the fields card declarations write that `CardDef`
 * does not declare (yet): Comet and Turntable declare `maxConsole: 1`,
 * Utopia Fragment declares `deckLimitOne: true`. The loader copies each
 * declaration onto the definition, so the values are there at run time.
 * Filed as a type gap (E-types); tests read these fields through this type
 * until `CardDef` names them.
 */
import type { CardDef } from "../../src/cards/cardDef.js";

export type DeclaredCardDef = CardDef & {
  maxConsole?: number;
  deckLimitOne?: boolean;
};
