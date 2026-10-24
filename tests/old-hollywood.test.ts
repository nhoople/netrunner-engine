/**
 * old-hollywood play tests.
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

describe("old-hollywood", () => {
  describe("oh-v113-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.12");
  });

  describe("Old Hollywood v1.113.0 set-complete", () => {

    it("wires key OH fields", () => {
      loadCardCatalog(true);
      expect(getCardDef("trope").onTurnBegin).toBeTruthy();
      expect(getCardDef("trope").paidAbilities?.[0]?.cost?.rfgSelf).toBe(true);
      expect(getCardDef("spoilers").onAgendaScored).toBeTruthy();
      expect(getCardDef("drug-dealer").onCorpTurnBegin).toBeTruthy();
      expect(getCardDef("rolodex").onInstall).toBeTruthy();
      expect(getCardDef("rolodex").onTrash).toBeTruthy();
      expect(getCardDef("fan-site").onAgendaScored).toBeTruthy();
      expect(getCardDef("film-critic").hostAgendaCapacity).toBe(1);
      expect(getCardDef("film-critic").mayHostAccessedAgenda).toBe(true);
      expect(getCardDef("paparazzi").countsAsTagged).toBe(true);
      expect(getCardDef("paparazzi").preventAllMeatDamage).toBe(true);
      expect(getCardDef("ronald-five").runnerLosesClickWhenTrashesCorpCard).toBe(
        true,
      );
      expect(getCardDef("enforcer-1-0").rezAdditionalCostForfeitAgenda).toBe(true);
      expect(getCardDef("enforcer-1-0").bioroidBreakMaxSubs).toBe(1);
      expect(getCardDef("enforcer-1-0").subroutines).toHaveLength(4);
      expect(getCardDef("its-a-trap").onExposeWhileInstalled).toBeTruthy();
      expect(getCardDef("an-offer-you-cant-refuse").onPlay).toBeTruthy();
      expect(
        getCardDef("haarpsichord-studios-entertainment-unleashed")
          .cannotStealMoreThanOneAgendaPerTurn,
      ).toBe(true);
      expect(getCardDef("award-bait").mustRevealWhenAccessedFromRd).toBe(true);
      expect(getCardDef("early-premiere").onTurnBegin).toBeTruthy();
      expect(getCardDef("casting-call").onPlay).toBeTruthy();
      expect(getCardDef("old-hollywood-grid").persistent).toBe(true);
      expect(getCardDef("old-hollywood-grid").cannotStealUnlessCopyInRunnerScore).toBe(
        true,
      );
      expect(getCardDef("hollywood-renovation").installFaceup).toBe(true);
      expect(
        getCardDef("hollywood-renovation").placeAdvancementOnAnotherOnAdvance
          ?.default,
      ).toBe(1);
      expect(getCardDef("back-channels").onPlay).toBeTruthy();
      expect(getCardDef("vanity-project").advancementRequirement).toBe(6);
      expect(getCardDef("vanity-project").agendaPoints).toBe(4);
    });
  });
  });
});
