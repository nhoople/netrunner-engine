/**
 * the-underway play tests.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
  loadCardCatalog,
} from "../src/index.js";

describe("the-underway", () => {
  describe("uw-v112-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.14");
  });

  describe("The Underway v1.112.0 set-complete", () => {

    it("wires key UW fields", () => {
      loadCardCatalog(true);
      expect(getCardDef("faust").breaker?.breakViaPaidAbilityOnly).toBe(true);
      expect(getCardDef("faust").paidAbilities?.[0]?.cost?.trashFromGrip).toBe(1);
      expect(getCardDef("street-peddler").onInstall).toBeTruthy();
      expect(getCardDef("armand-geist-walker-tech-lord").drawOnUseTrashAbility).toBe(
        1,
      );
      expect(getCardDef("drive-by").playAdditionalClick).toBe(true);
      expect(getCardDef("forger").link).toBe(1);
      expect(getCardDef("forger").maxConsole).toBe(1);
      expect(getCardDef("shiv").memoryCostZeroIfLinkGte).toBe(2);
      expect(getCardDef("shiv").strengthBonusPerIcebreaker).toBe(1);
      expect(getCardDef("gang-sign").onAgendaScored).toBeTruthy();
      expect(getCardDef("muertos-gang-member").onInstall).toBeTruthy();
      expect(getCardDef("muertos-gang-member").onUninstall).toBeTruthy();
      expect(getCardDef("hyperdriver").onTurnBegin).toBeTruthy();
      expect(getCardDef("test-ground").canAdvance).toBe(true);
      expect(getCardDef("defective-brainchips").increaseFirstCoreDamagePerTurn).toBe(
        1,
      );
      expect(getCardDef("allele-repression").canAdvance).toBe(true);
      expect(getCardDef("marcus-batty").paidAbilities?.[0]?.requireThisServer).toBe(
        true,
      );
      expect(getCardDef("expose").canAdvance).toBe(true);
      expect(getCardDef("pachinko").subroutines).toHaveLength(2);
      expect(getCardDef("underway-renovation").installFaceup).toBe(true);
      expect(getCardDef("underway-renovation").trashTopOfStackOnAdvance?.default).toBe(
        1,
      );
      expect(getCardDef("underway-grid").iceCannotBeBypassedThisServer).toBe(true);
      expect(getCardDef("underway-grid").cardsCannotBeExposedThisServer).toBe(true);
    });
  });
  });
});
