/**
 * democracy-and-dogma play tests.
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

describe("democracy-and-dogma", () => {
  describe("dag-v118-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.17");
  });

  describe("Democracy and Dogma v1.118.0 set-complete", () => {

    it("wires key DAG fields", () => {
      loadCardCatalog(true);
      expect(getCardDef("political-graffiti").hostAgendaPointsModifier).toBe(-1);
      expect(getCardDef("political-graffiti").trashOnVirusPurge).toBe(true);
      expect(
        getCardDef("nero-severn-information-broker")
          .mayJackOutOnEncounterSentryOncePerTurn,
      ).toBe(true);
      expect(getCardDef("reflection").revealRandomHqOnJackOut).toBe(true);
      expect(getCardDef("reflection").muBonus).toBe(1);
      expect(getCardDef("reflection").maxConsole).toBe(1);
      expect(getCardDef("spy-camera").deckLimit).toBe(6);
      expect(
        getCardDef("political-operative").installRequiresSuccessfulHqRunThisTurn,
      ).toBe(true);
      expect(
        getCardDef("sadyojata").breaker?.breakRequiresIceSubtypeCountGte,
      ).toBe(3);
      expect(getCardDef("freedom-through-equality").lingerAsCurrent).toBe(true);
      expect(getCardDef("akshara-sareen").allottedClicksBonus).toBe(1);
      expect(
        getCardDef("akshara-sareen").corpAllottedClicksBonusWhileInstalled,
      ).toBe(1);
      expect(
        getCardDef("councilman")
          .onCorpRezAssetOrUpgradeMayPayRezCostTrashSelfDerez,
      ).toBe(true);
      expect(getCardDef("voting-machine-initiative").onScore).toBeTruthy();
      expect(
        getCardDef("voting-machine-initiative").onRunnerTurnBegin,
      ).toBeTruthy();
      expect(
        getCardDef("political-dealings").onDrawAgendaMayRevealAndInstall,
      ).toBe(true);
      expect(getCardDef("clones-are-not-people").lingerAsCurrent).toBe(true);
      expect(
        getCardDef("bailiff").gainCreditWheneverRunnerBreaksSubroutine,
      ).toBe(true);
      expect(
        getCardDef("surat-city-grid").onRezOtherCardInRootOrProtectingMayRezDiscount,
      ).toBe(2);
    });
  });
  });
});
