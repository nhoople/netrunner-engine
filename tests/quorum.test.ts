/**
 * quorum play tests.
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

describe("quorum", () => {
  describe("qu-v127-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.12");
  });

  describe("Quorum v1.128.0 set-complete", () => {

    it("wires key qu fields (NRDB text)", () => {
      loadCardCatalog(true);
      expect(getCardDef("sifr").muBonus).toBe(2);
      expect(getCardDef("sifr").sifrMayZeroEncounterIceStrengthOncePerTurn).toBe(
        true,
      );
      expect(getCardDef("sunya").strengthPerPowerCounter).toBe(true);
      expect(getCardDef("sunya").breaker?.breaksSubtype).toBe("sentry");
      expect(
        getCardDef("tapwrm").installRequiresSuccessfulCentralRunThisTurn,
      ).toBe(true);
      expect(getCardDef("tapwrm").trashOnVirusPurge).toBe(true);
      expect(getCardDef("encore").playRequiresSuccessfulAllCentralsThisTurn).toBe(
        true,
      );
      expect(getCardDef("encore").rfgInsteadOfTrashing).toBe(true);
      expect(getCardDef("peace-in-our-time").playRequiresFirstClick).toBe(true);
      expect(
        getCardDef("peace-in-our-time").playRequiresCorpScoredNoAgendasLastTurn,
      ).toBe(true);
      expect(getCardDef("violet-level-clearance").endsActionPhase).toBe(true);
      expect(getCardDef("chiyashi").trashTopOfStackOnBreakSubIfRunnerHasAi).toBe(
        2,
      );
      expect(getCardDef("herald").mustRevealWhenAccessedFromRd).toBe(true);
      expect(
        getCardDef("net-quarantine").firstTraceEachTurnRunnerLinkTreatedAs0,
      ).toBe(true);
      expect(
        getCardDef("bryan-stinson").bryanStinsonPlayArchivesTransactionWhileRunnerLt6c,
      ).toBe(true);
      expect(
        getCardDef("nasx").nasxMaySpendUpTo2OnAbilityCreditGainToPlacePower,
      ).toBe(true);
    });
  });
  });
});
