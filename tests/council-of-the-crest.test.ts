/**
 * council-of-the-crest play tests.
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

describe("council-of-the-crest", () => {
  describe("cotc-v138-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.17");
  });

  describe("Council of the Crest v1.138.0 set-complete", () => {

    it("wires key cotc fields (NRDB text)", () => {
      loadCardCatalog(true);
      expect(getCardDef("exer").onBreachRd).toBeTruthy();
      expect(getCardDef("exer").onVirusPurge).toBeTruthy();
      expect(getCardDef("friday-chip").mayPlaceVirusCounterWhenCorpCardTrashed).toBe(
        true,
      );
      expect(getCardDef("crypt").subtypes).toContain("virtual");
      expect(getCardDef("corporate-grant").lingerAsCurrent).toBe(true);
      expect(
        getCardDef("corporate-grant").corpLosesCreditsOnFirstRunnerInstallEachTurn,
      ).toBe(1);
      expect(getCardDef("no-one-home").paidAbilities?.length).toBeGreaterThanOrEqual(
        2,
      );
      expect(getCardDef("marathon").runEvent?.servers).toBe("remote");
      expect(getCardDef("gbahali").subtypes).toContain("virtual");
      expect(getCardDef("white-hat").playRequiresSuccessfulCentralRunThisTurn).toBe(
        true,
      );
      expect(getCardDef("kuwinda-k4h1u3").unique).toBe(true);
      expect(getCardDef("next-sapphire").subtypes).toContain("next");
      expect(getCardDef("anansi").onEncounterEndIfNotFullyBroken).toBeTruthy();
      expect(
        getCardDef("code-replicator").onPassRezzedIceProtectingThisServer,
      ).toBeTruthy();
      expect(getCardDef("reverse-infection").onPlay).toBeTruthy();
      expect(getCardDef("azmari-edtech-shaping-the-future").type).toBe("identity");
      expect(
        getCardDef("azmari-edtech-shaping-the-future")
          .gainCreditsOnFirstRunnerPlayOrInstallNamedType,
      ).toBe(2);
      expect(getCardDef("degree-mill").stealAdditionalCost).toBeTruthy();
      expect(getCardDef("personalized-portal").onTurnBegin).toBeTruthy();
      expect(getCardDef("armed-intimidation").onScore).toBeTruthy();
      expect(getCardDef("death-and-taxes").lingerAsCurrent).toBe(true);
      expect(
        getCardDef("death-and-taxes").mayGainCreditWhenRunnerInstallsOrTrashesInstalled,
      ).toBe(true);
      expect(
        getCardDef("trojan-horse").playRequiresRunnerAccessedCardLastTurn,
      ).toBe(true);
      expect(getCardDef("technoco").programInstallCostIncrease).toBe(1);
      expect(getCardDef("technoco").hardwareInstallCostIncrease).toBe(1);
      expect(getCardDef("technoco").virtualResourceInstallCostIncrease).toBe(1);
    });
  });
  });
});
