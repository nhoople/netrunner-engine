/**
 * twenty-three-seconds play tests.
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

describe("twenty-three-seconds", () => {
  describe("23s-v122-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.13");
  });

  describe("23 Seconds v1.122.0 set-complete", () => {

    it("wires key 23s fields (NRDB text)", () => {
      loadCardCatalog(true);
      expect(getCardDef("system-outage").lingerAsCurrent).toBe(true);
      expect(getCardDef("system-outage").corpLosesCreditsOnNonFirstDrawThisTurn).toBe(
        1,
      );
      expect(getCardDef("null-whistleblower").onEncounterAnyIceOncePerTurn).toBeTruthy();
      expect(
        getCardDef("gpi-net-tap").mayExposeApproachedIceThenMayTrashSelfToJackOut,
      ).toBe(true);
      expect(
        getCardDef("hernando-cortez")
          .additionalIceRezCostEqualToSubroutineCountWhenCorpCreditsGte,
      ).toBe(10);
      expect(getCardDef("mirror").muBonus).toBe(2);
      expect(getCardDef("mirror").maxConsole).toBe(1);
      expect(
        getCardDef("mirror").onSuccessfulRdRunMayReplaceSpentRecurringCredit,
      ).toBe(true);
      expect(getCardDef("dai-v").breaker?.breakMaxSubs).toBe(99);
      expect(getCardDef("another-day-another-paycheck").lingerAsCurrent).toBe(
        true,
      );
      expect(getCardDef("another-day-another-paycheck").onStealAgenda).toBeTruthy();
      expect(getCardDef("fairchild-1-0").bioroidBreakMaxSubs).toBe(1);
      expect(getCardDef("sherlock-2-0").bioroidBreakMaxSubs).toBe(2);
      expect(
        getCardDef("hyoubu-research-facility")
          .firstRevealSecretlySpentCreditsGainThatManyEachTurn,
      ).toBe(true);
      expect(getCardDef("chrysalis").mustRevealWhenAccessedFromRd).toBe(true);
      expect(getCardDef("georgia-emelyov").onUnsuccessfulRunOnThisServer).toBeTruthy();
      expect(getCardDef("watchdog").firstIceRezCostReductionPerRunnerTag).toBe(
        true,
      );
      expect(getCardDef("hard-hitting-news").endsActionPhase).toBe(true);
      expect(
        getCardDef("hard-hitting-news").playRequiresRunnerMadeRunLastTurn,
      ).toBe(true);
      expect(
        getCardDef("nbn-controlling-the-message").onFirstCorpCardTrashEachTurn,
      ).toBeTruthy();
      expect(getCardDef("crisis-management").onTurnBeginIfRunnerTagged).toBeTruthy();
      expect(getCardDef("stock-buy-back").endsActionPhase).toBe(true);
      expect(
        getCardDef("sandburg").iceStrengthBonusPerFiveCorpCreditsWhenCorpCreditsGte,
      ).toEqual({ threshold: 10, perCredits: 5, bonus: 1 });
    });
  });
  });
});
