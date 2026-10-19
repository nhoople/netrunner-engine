/**
 * fear-the-masses play tests.
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

describe("fear-the-masses", () => {
  describe("ftm-v121-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.7");
  });

  describe("Fear the Masses v1.121.0 set-complete", () => {

    it("wires key FTM fields", () => {
      loadCardCatalog(true);
      expect(getCardDef("fear-the-masses").runEvent?.servers).toBe("hq");
      expect(getCardDef("fear-the-masses").runEvent?.skipBreach).toBe(true);
      expect(getCardDef("fear-the-masses").deckLimit).toBe(6);
      expect(
        getCardDef("aghora").breaker?.breakRequiresIceRezCostGte,
      ).toBe(5);
      expect(getCardDef("bhagat").onFirstSuccessfulHqRunThisTurn).toBeTruthy();
      expect(getCardDef("the-black-file").corpCannotWinExceptFlatline).toBe(true);
      expect(getCardDef("the-black-file").deckLimit).toBe(1);
      expect(getCardDef("the-price-of-freedom").rfgInsteadOfTrashing).toBe(true);
      expect(getCardDef("ankusa").onFullyBreak).toBeTruthy();
      expect(getCardDef("improved-protein-source").onScore).toBeTruthy();
      expect(getCardDef("improved-protein-source").onSteal).toBeTruthy();
      expect(
        getCardDef("voter-intimidation").playRequiresAgendaInRunnerScoreArea,
      ).toBe(true);
      expect(
        getCardDef("harishchandra-ent-where-youre-the-star")
          .revealGripWhileRunnerTagged,
      ).toBe(true);
      expect(getCardDef("full-immersion-recstudio").maxHostedCards).toBe(2);
      expect(getCardDef("full-immersion-recstudio").hostAssetsOrAgendas).toBe(
        true,
      );
      expect(
        getCardDef("full-immersion-recstudio").trashCostIncreasePerHostedCard,
      ).toBe(3);
      expect(
        getCardDef("ibrahim-salem").zeroInfluenceIfNonAllianceFactionCardsGte,
      ).toEqual({ faction: "nbn", threshold: 6 });
      expect(getCardDef("ibrahim-salem").rezAdditionalCostForfeitAgenda).toBe(
        true,
      );
      expect(getCardDef("navi-mumbai-city-grid").limitOnePerServer).toBe(true);
      expect(
        getCardDef("navi-mumbai-city-grid")
          .blockRunnerPaidAbilitiesExceptIcebreakersAndMidAccess,
      ).toBe(true);
      expect(getCardDef("zealous-judge").rezRequiresTagged).toBe(true);
      expect(getCardDef("subcontract").playRequiresTagged).toBe(true);
      expect(
        getCardDef("merger").agendaPointsModifierInRunnerScoreArea,
      ).toBe(1);
    });
  });
  });
});
