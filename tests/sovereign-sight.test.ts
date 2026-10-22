/**
 * sovereign-sight play tests.
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

describe("sovereign-sight", () => {
  describe("ss-v136-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.10");
  });

  describe("Sovereign Sight v1.136.0 set-complete", () => {

    it("wires key ss fields (NRDB text)", () => {
      loadCardCatalog(true);
      expect(getCardDef("by-any-means").playRequiresFirstClick).toBe(true);
      expect(getCardDef("yusuf").breaker?.breaksSubtype).toBe("barrier");
      expect(getCardDef("yusuf").breaker?.breakViaPaidAbilityOnly).toBe(true);
      expect(getCardDef("zamba").muBonus).toBe(2);
      expect(getCardDef("zamba").mayGainCreditsOnCorpCardExposed).toBe(1);
      expect(getCardDef("puffer").strengthPerPowerCounter).toBe(true);
      expect(getCardDef("puffer").memoryCostPerPowerCounter).toBe(1);
      expect(getCardDef("lewi-guilherme").corpHandSizeBonusWhileInstalled).toBe(-1);
      expect(getCardDef("cyberdelia").gainCreditsOnFirstFullyBreakEachTurn).toBe(1);
      expect(getCardDef("upya").onSuccessfulRunOnRd).toBeTruthy();
      expect(getCardDef("asa-group-security-through-vigilance").onFirstCorpCardInstallEachTurn).toBeTruthy();
      expect(getCardDef("ikawah-project").stealAdditionalClicks).toBe(1);
      expect(getCardDef("ikawah-project").stealAdditionalCredits).toBe(2);
      expect(getCardDef("najja-1-0").subtypes).toContain("bioroid");
      expect(getCardDef("gene-splicer").canAdvance).toBe(true);
      expect(getCardDef("genotyping").rfgInsteadOfTrashing).toBe(true);
      expect(getCardDef("self-growth-program").playRequiresTagged).toBe(true);
      expect(getCardDef("calibration-testing").remoteOnly).toBe(true);
      expect(getCardDef("urban-renewal").powerCountersOnRez).toBe(3);
      expect(getCardDef("urban-renewal").trashWhenPowerEmpty).toBe(true);
      expect(
        getCardDef("wake-up-call").playRequiresRunnerTrashedCorpCardLastTurn,
      ).toBe(true);
      expect(
        getCardDef("wake-up-call")
          .playRequiresRunnerHasInstalledHardwareOrNonVirtualResource,
      ).toBe(true);
      expect(getCardDef("reconstruction-contract").placeAdvancementOnSufferMeatDamage).toBe(
        true,
      );
    });
  });
  });
});
