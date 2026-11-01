/**
 * salsette-island play tests.
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

describe("salsette-island", () => {
  describe("si-v119-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.17");
  });

  describe("Salsette Island v1.119.0 set-complete", () => {

    it("wires key SI fields", () => {
      loadCardCatalog(true);
      expect(getCardDef("making-an-entrance").playRequiresFirstClick).toBe(true);
      expect(
        getCardDef("salsette-slums").accessPayTrashCostRemoveFromGameOncePerTurn,
      ).toBe(true);
      expect(getCardDef("exclusive-party").deckLimit).toBe(6);
      expect(
        getCardDef("vamadeva").breaker?.breakRequiresIceExactSubroutineCount,
      ).toBe(1);
      expect(
        getCardDef("brahman")
          .addInstalledNonVirusProgramToStackTopOnEncounterEndIfBroke,
      ).toBe(true);
      expect(getCardDef("patron").patronChooseServerDrawInsteadOfBreach).toBe(2);
      expect(getCardDef("sports-hopper").link).toBe(1);
      expect(
        getCardDef("bazaar").onInstallHardwareFromGripMayInstallAnotherCopy,
      ).toBe(true);
      expect(
        getCardDef("personality-profiles")
          .onRunnerSearchStackOrInstallFromHeapTrashRandomFromGrip,
      ).toBe(true);
      expect(
        getCardDef("jeeves-model-bioroids")
          .gainClickFirstTimeSpendClicksGteOnSameActionEachTurn,
      ).toBe(3);
      expect(
        getCardDef("raman-rai")
          .onDrawMayLoseClickRevealSwapArchivesSameTypeOncePerTurn,
      ).toBe(true);
      expect(
        getCardDef("aryabhata-tech").onAnySuccessfulTraceGainAndRunnerLose,
      ).toEqual({ gain: 1, lose: 1 });
      expect(getCardDef("salems-hospitality").id).toBe("salems-hospitality");
      expect(
        getCardDef("indian-union-stock-exchange")
          .onRezOrPlayOutOfFactionGainCredits,
      ).toBe(1);
      expect(getCardDef("mumbad-virtual-tour").zeroInfluenceIfAssetsInDeckGte).toBe(
        7,
      );
      expect(
        getCardDef("mumbad-virtual-tour").mustTrashWhenAccessedWhileInstalled,
      ).toBe(true);
    });
  });
  });
});
