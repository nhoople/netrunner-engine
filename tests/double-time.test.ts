/**
 * double-time play tests.
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

describe("double-time", () => {
  describe("dt-v100-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.7");
  });

  describe("Double Time v1.100.0 set-complete", () => {

    it("wires key DT fields", () => {
      loadCardCatalog(true);
      expect(getCardDef("dyson-fractal-generator").recurringSpendFor).toEqual([
        "use_fracter",
      ]);
      expect(getCardDef("silencer").recurringSpendFor).toEqual(["use_killer"]);
      expect(getCardDef("napd-contract").stealAdditionalCredits).toBe(4);
      expect(
        getCardDef("napd-contract").advancementRequirementIncreasePerCorpBadPublicity,
      ).toBe(1);
      expect(getCardDef("hive").dynamicEtrSubroutineCountFromCorpAgendaPoints).toBe(
        true,
      );
      expect(getCardDef("savoir-faire").oncePerTurnPaidAbilities).toBe(true);
    });
  });
  });
});
