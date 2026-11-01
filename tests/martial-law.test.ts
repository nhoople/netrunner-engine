/**
 * martial-law play tests.
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

describe("martial-law", () => {
  describe("ml-v126-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.18");
  });

  describe("Martial Law v1.126.0 set-complete", () => {

    it("wires key ml fields (NRDB text)", () => {
      loadCardCatalog(true);
      expect(getCardDef("mkultra").mayInstallSelfFromHeapOnEncounterSentry).toBe(
        true,
      );
      expect(getCardDef("mkultra").breaker?.breaksSubtype).toBe("sentry");
      expect(getCardDef("cold-read").runEvent?.placeEventCredits).toBe(4);
      expect(getCardDef("reaver").drawOnFirstTrashInstalledEachTurn).toBe(true);
      expect(getCardDef("interdiction").cannotRezNonIceDuringRunnerTurn).toBe(
        true,
      );
      expect(getCardDef("interdiction").lingerAsCurrent).toBe(true);
      expect(getCardDef("baba-yaga").hostNonAiIcebreaker).toBe(true);
      expect(getCardDef("baba-yaga").gainsPaidAbilitiesOfHostedIcebreakers).toBe(
        true,
      );
      expect(getCardDef("fairchild").bioroidBreakMaxSubs).toBe(4);
      expect(getCardDef("friends-in-high-places").endsActionPhase).toBe(true);
      expect(
        getCardDef("manta-grid")
          .additionalClickNextTurnOnSuccessfulRunEndIfRunnerLt6cOrNoClicks,
      ).toBe(true);
      expect(getCardDef("sapper").mustRevealWhenAccessedFromRd).toBe(true);
      expect(getCardDef("mausolus").canAdvance).toBe(true);
      expect(
        getCardDef("anson-rose").mayMoveAnyAdvancementsFromSelfToRezzedIce,
      ).toBe(true);
      expect(getCardDef("enforced-curfew").runnerHandSizeBonus).toBe(-1);
      expect(getCardDef("enforced-curfew").lingerAsCurrent).toBe(true);
    });
  });
  });
});
