/**
 * crimson-dust play tests.
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

describe("crimson-dust", () => {
  describe("cd-v134-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("Crimson Dust v1.135.0 set-complete", () => {

    it("wires key cd fields (NRDB text)", () => {
      loadCardCatalog(true);
      expect(getCardDef("mining-accident").playRequiresSuccessfulCentralRunThisTurn).toBe(
        true,
      );
      expect(getCardDef("respirocytes").onFirstEmptyGripEachTurn).toBeTruthy();
      expect(getCardDef("respirocytes").onPowerCountersGte?.amount).toBe(3);
      expect(getCardDef("aumakua").strengthPerVirusCounter).toBe(1);
      expect(getCardDef("aumakua").placeVirusCounterOnExposeAnyCard).toBe(true);
      expect(
        getCardDef("aumakua").placeVirusCounterOnFinishBreachIfNoStealOrTrash,
      ).toBe(true);
      expect(getCardDef("aumakua").breaker?.breaksSubtype).toBe("*");
      expect(
        getCardDef("dianas-hunt").runEvent
          ?.onEncounterMayInstallProgramFromGripIgnoringCosts,
      ).toBe(true);
      expect(
        getCardDef("dianas-hunt").runEvent?.trashProgramsInstalledThisWayOnRunEnd,
      ).toBe(true);
      expect(getCardDef("corporate-defector").revealCorpBasicActionDraws).toBe(true);
      expect(getCardDef("breached-dome").mustRevealWhenAccessedFromRd).toBe(true);
      expect(getCardDef("rolling-brownout").lingerAsCurrent).toBe(true);
      expect(getCardDef("rolling-brownout").operationAndEventPlayCostIncrease).toBe(1);
      expect(
        getCardDef("rolling-brownout").corpGainsCreditsOnFirstRunnerEventEachTurn,
      ).toBe(1);
      expect(
        getCardDef("fractal-threat-matrix")
          .trashTopOfStackWhenAllSubsBrokenOnProtectingIce,
      ).toBe(2);
      expect(getCardDef("conundrum").strengthBonusIfInstalledSubtype).toEqual({
        subtype: "ai",
        bonus: 3,
      });
      expect(getCardDef("threat-level-alpha").playAdditionalClick).toBe(true);
      expect(getCardDef("priority-construction").playAdditionalClick).toBe(true);
    });
  });
  });
});
