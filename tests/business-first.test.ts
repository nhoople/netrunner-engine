/**
 * business-first play tests.
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

describe("business-first", () => {
  describe("bf-v117-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.14");
  });

  describe("Business First v1.117.0 set-complete", () => {

    it("wires key BF fields", () => {
      loadCardCatalog(true);
      expect(getCardDef("diwan").chooseServerOnInstall).toBe(true);
      expect(getCardDef("diwan").trashOnVirusPurge).toBe(true);
      expect(getCardDef("diwan").additionalCreditCostToInstallInChosenServer).toBe(
        1,
      );
      expect(getCardDef("tech-trader").gainCreditOnTrashAbilityUse).toBe(true);
      expect(getCardDef("netchip").daemonHost).toBe(true);
      expect(getCardDef("netchip").daemonHostMaxMuFromInstalledCopiesOfSelf).toBe(
        true,
      );
      expect(getCardDef("netchip").hostedProgramMemoryDoesNotCount).toBe(true);
      expect(getCardDef("corporate-scandal").lingerAsCurrent).toBe(true);
      expect(getCardDef("corporate-scandal").corpAdditionalBadPublicity).toBe(1);
      expect(getCardDef("populist-rally").playRequiresInstalledSubtype).toBe(
        "seedy",
      );
      expect(
        getCardDef("palana-foods-sustainable-growth")
          .gainCreditOnFirstRunnerDrawEachTurn,
      ).toBe(true);
      expect(getCardDef("remote-data-farm").handSizeBonus).toBe(2);
      expect(getCardDef("new-construction").installFaceup).toBe(true);
      expect(getCardDef("new-construction").onAdvance).toBeTruthy();
      expect(getCardDef("corporate-sales-team").onScore).toBeTruthy();
      expect(getCardDef("corporate-sales-team").onRunnerTurnBegin).toBeTruthy();
      expect(getCardDef("pad-factory").zeroInfluenceIfCardCopiesGte).toEqual({
        cardId: "pad-campaign",
        threshold: 3,
      });
      expect(getCardDef("lakshmi-smartfabrics").placePowerCounterOnAnyCardRez).toBe(
        true,
      );
      expect(getCardDef("disposable-hq").mustRevealWhenAccessedFromRd).toBe(true);
      expect(getCardDef("cbi-raid").runEvent?.servers).toBe("hq");
    });
  });
  });
});
