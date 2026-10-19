/**
 * up-and-over play tests.
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

describe("up-and-over", () => {
  describe("uao-v105-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.7");
  });

  describe("Up and Over v1.105.0 set-complete", () => {

    it("wires key UAO fields", () => {
      loadCardCatalog(true);
      expect(getCardDef("architect").playersCannotTrashThisIce).toBe(true);
      expect(getCardDef("ashigaru").dynamicEtrSubroutineCountFromCorpHandSize).toBe(
        true,
      );
      expect(getCardDef("switchblade").paidAbilitiesUseStealthCreditsOnly).toBe(
        true,
      );
      expect(getCardDef("origami").handSizeBonusPerInstalledCopyWithSameDefId).toBe(
        1,
      );
      expect(getCardDef("docklands-crackdown").runnerFirstInstallCostIncreasePerPowerCounterOnThis).toBe(
        1,
      );
    });
  });
  });
});
