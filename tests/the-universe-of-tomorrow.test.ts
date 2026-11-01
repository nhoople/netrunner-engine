/**
 * the-universe-of-tomorrow play tests.
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

describe("the-universe-of-tomorrow", () => {
  describe("uot-v114-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.17");
  });

  describe("The Universe of Tomorrow v1.114.0 set-complete", () => {

    it("wires key UOT fields", () => {
      loadCardCatalog(true);
      expect(getCardDef("power-to-the-people").playRequiresFirstClick).toBe(true);
      expect(getCardDef("power-to-the-people").onPlay).toBeTruthy();
      expect(getCardDef("surfer").paidAbilities?.[0]?.requireEncounterSubtype).toBe(
        "barrier",
      );
      expect(getCardDef("ddos").paidAbilities?.[0]?.cost?.trashSelf).toBe(true);
      expect(
        getCardDef("laramy-fisk-savvy-investor").onFirstSuccessfulCentralRunThisTurn,
      ).toBeTruthy();
      expect(getCardDef("fisk-investment-seminar").playRequiresFirstClick).toBe(
        true,
      );
      expect(getCardDef("bookmark").maxHostedCards).toBe(3);
      expect(getCardDef("davinci").onSuccessfulRun).toBeTruthy();
      expect(
        getCardDef("wireless-net-pavilion").basicTrashResourceAdditionalCostCredits,
      ).toBe(2);
      expect(getCardDef("cybernetics-court").handSizeBonus).toBe(4);
      expect(getCardDef("team-sponsorship").onAgendaScored).toBeTruthy();
      expect(
        getCardDef("chronos-protocol-selective-mind-mapping")
          .corpChoosesFirstNetDamageCardEachTurn,
      ).toBe(true);
      expect(getCardDef("ancestral-imager").netDamageOnJackOut).toBe(1);
      expect(getCardDef("genetics-pavilion").runnerCannotDrawMoreThanPerTurn).toBe(
        2,
      );
      expect(getCardDef("franchise-city").mustRevealAgendasAccessedFromRd).toBe(
        true,
      );
      expect(
        getCardDef("franchise-city").addSelfToCorpScoreOnAgendaAccess?.agendaPoints,
      ).toBe(1);
      expect(getCardDef("worlds-plaza").maxHostedCards).toBe(3);
      expect(getCardDef("worlds-plaza").hostAssetsOnly).toBe(true);
      expect(getCardDef("tour-guide").continuousGainedSubDecls?.some((d) => d.kind === "etr_per_rezzed_asset")).toBe(true);
      expect(getCardDef("expo-grid").onTurnBegin).toBeTruthy();
      expect(getCardDef("the-future-is-now").onScore).toBeTruthy();
    });
  });
  });
});
