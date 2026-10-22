/**
 * breaker-bay play tests.
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

describe("breaker-bay", () => {
  describe("bb-v110-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.11");
  });

  describe("Breaker Bay v1.110.0 set-complete", () => {

    it("wires key BB fields", () => {
      loadCardCatalog(true);
      expect(getCardDef("hacktivist-meeting").lingerAsCurrent).toBe(true);
      expect(getCardDef("hacktivist-meeting").rezNonIceAdditionalCostRandomTrashHq).toBe(
        true,
      );
      expect(getCardDef("off-campus-apartment").hostsConnectionResources).toBe(true);
      expect(getCardDef("off-campus-apartment").drawOnHostConnectionInstall).toBe(1);
      expect(getCardDef("dorm-computer").powerCountersOnInstall).toBe(4);
      expect(getCardDef("game-day").playAdditionalClick).toBe(true);
      expect(getCardDef("comet").muBonus).toBe(1);
      expect(getCardDef("comet").maxConsole).toBe(1);
      expect(getCardDef("comet").onFirstEventEachTurnMayPlayAnother).toBe(true);
      expect(getCardDef("study-guide").strengthPerPowerCounter).toBe(true);
      expect(getCardDef("london-library").trashHostedProgramsOnTurnEnd).toBe(true);
      expect(getCardDef("beach-party").handSizeBonus).toBe(5);
      expect(getCardDef("crick").strengthBonusProtectingArchives).toBe(3);
      expect(getCardDef("recruiting-trip").playCostX).toBe(true);
      expect(getCardDef("blacklist").cardsCannotLeaveRunnerHeap).toBe(true);
      expect(getCardDef("gutenberg").strengthBonusProtectingRd).toBe(3);
      expect(getCardDef("student-loans").eventPlayExtraCostIfCopyInHeap).toBe(2);
      expect(getCardDef("meru-mati").strengthBonusProtectingHq).toBe(3);
      expect(getCardDef("breaker-bay-grid").rootRezCostReductionThisServer).toBe(5);
      expect(getCardDef("hayley-kaplan-universal-scholar").onFirstInstallEachTurn).toBeTruthy();
    });
  });
  });
});
