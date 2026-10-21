/**
 * station-one play tests.
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

describe("station-one", () => {
  describe("so-v129-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.8");
  });

  describe("Station One v1.129.0 set-complete", () => {

    it("wires key so fields (NRDB text)", () => {
      loadCardCatalog(true);
      expect(getCardDef("clan-vengeance").placePowerCounterOnSufferAnyDamage).toBe(
        true,
      );
      expect(
        getCardDef("seidr-adaptive-barrier").strengthBonusPerIceProtectingThisServer,
      ).toBe(1);
      expect(
        getCardDef("system-seizure").systemSeizureFirstPumpStrengthLastsRemainderOfRun,
      ).toBe(true);
      expect(getCardDef("system-seizure").lingerAsCurrent).toBe(true);
      expect(getCardDef("nerine-2-0").bioroidBreakMaxSubs).toBe(2);
      expect(
        getCardDef("cpc-generator").corpGainsOnFirstRunnerBasicGainCreditEachTurn,
      ).toBe(1);
      expect(getCardDef("mca-informant").endsActionPhase).toBe(true);
      expect(getCardDef("sacrifice").playAdditionalCostForfeitAgenda).toBe(true);
      expect(getCardDef("self-adapting-code-wall").strengthCannotBeLowered).toBe(
        true,
      );
      expect(getCardDef("replanting").playAdditionalClick).toBe(true);
      expect(getCardDef("los-data-hijacker").type).toBe("identity");
    });
  });
  });
});
