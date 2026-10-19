/**
 * earths-scion play tests.
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

describe("earths-scion", () => {
  describe("eas-v131-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.7");
  });

  describe("Earth's Scion v1.131.0 set-complete", () => {

    it("wires key eas fields (NRDB text)", () => {
      loadCardCatalog(true);
      expect(
        getCardDef("berserker").strengthBonusPerSubroutineOnEncounteredBarrier,
      ).toBe(1);
      expect(getCardDef("berserker").breaker?.breakMaxSubs).toBe(2);
      expect(
        getCardDef("aeneas-informant").aeneasInformantRevealGainOnAccessWithoutTrash,
      ).toBe(true);
      expect(getCardDef("adjusted-matrix").hostGainsAiSubtype).toBe(true);
      expect(
        getCardDef("adjusted-matrix").hostGainsLoseClickBreakAnySubroutine,
      ).toBe(true);
      expect(getCardDef("dedicated-processor").hostGainsPumpAbility).toEqual({
        credits: 2,
        strength: 4,
      });
      expect(
        getCardDef("inversificator").inversificatorSwapIceAfterFullyBrokeOncePerTurn,
      ).toBe(true);
      expect(
        getCardDef("dadiana-chacon").trashSelfAndMeatDamageWhenCreditsZero,
      ).toBe(3);
      expect(
        getCardDef("next-opal").gainsSubroutinesPerRezzedIceWithSubtype?.subtype,
      ).toBe("next");
      expect(
        getCardDef("bioroid-work-crew").bioroidWorkCrewRequireAfterOperationPaidWindow,
      ).toBe(true);
      expect(getCardDef("bamboo-dome").installServers).toEqual(["rd"]);
      expect(getCardDef("ben-musashi").persistent).toBe(true);
      expect(getCardDef("henry-phillips").gainCreditsOnBreakSubThisServerIfTagged).toBe(
        2,
      );
      expect(getCardDef("audacity").playRequiresOtherCardsInHq).toBe(2);
      expect(getCardDef("red-planet-couriers").playAdditionalClicks).toBe(2);
      expect(
        getCardDef("aginfusion-new-miracles-for-a-new-world").type,
      ).toBe("identity");
    });
  });
  });
});
