/**
 * whispers-in-nalubaale play tests.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
  loadCardCatalog,
  CARD_WAVE_DIRS,
} from "../src/index.js";

describe("whispers-in-nalubaale", () => {
  describe("win-v140-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.17");
  });

  describe("Whispers in Nalubaale v1.140.0 set-complete", () => {

    it("wires whispers-in-nalubaale in CARD_WAVE_DIRS after the-devil-and-the-dragon", () => {
      const idx = CARD_WAVE_DIRS.indexOf("whispers-in-nalubaale");
      expect(idx).toBeGreaterThan(0);
      expect(CARD_WAVE_DIRS[idx - 1]).toBe("the-devil-and-the-dragon");
      expect(CARD_WAVE_DIRS[idx + 1]).toBe("kampala-ascendent");
    });

    it("wires key win fields (NRDB text)", () => {
      loadCardCatalog(true);
      expect(
        getCardDef("freedom-khumalo-crypto-anarchist")
          .accessTrashNonAgendaWithVirusEqualPrintedCost,
      ).toBe(true);
      expect(getCardDef("trypano").installOnIce).toBe(true);
      expect(getCardDef("trypano").trashHostAtVirus).toBe(5);
      expect(getCardDef("contaminate").onPlay).toBeTruthy();
      expect(getCardDef("embezzle").runEvent?.servers).toBe("hq");
      expect(getCardDef("embezzle").runEvent?.skipBreach).toBe(true);
      expect(getCardDef("slipstream").onPassRezzedIce).toBeTruthy();
      expect(getCardDef("laamb").breaker?.breaksSubtype).toBe("barrier");
      expect(getCardDef("laamb").breaker?.breakMaxSubs).toBe(99);
      expect(
        getCardDef("laamb").onEncounterMayPayCreditsGrantIceSubtype?.subtype,
      ).toBe("barrier");
      expect(getCardDef("gebrselassie").unique).toBe(true);
      expect(
        getCardDef("gebrselassie").hostIcebreakerStrengthIncreasesLastRemainderOfTurn,
      ).toBe(true);
      expect(getCardDef("compile").runEvent?.onFirstEncounterThisRun).toBeTruthy();
      expect(getCardDef("compile").runEvent?.onRunEnd).toBeTruthy();
      expect(getCardDef("logic-bomb").paidAbilities?.length).toBe(1);
      expect(getCardDef("jackpot").onTurnBegin).toBeTruthy();
      expect(getCardDef("jackpot").onAgendaAddedToRunnerScore).toBeTruthy();
      expect(getCardDef("remote-enforcement").onAgendaScored).toBeTruthy();
      expect(getCardDef("kamali-1-0").subroutines?.length).toBe(3);
      expect(
        getCardDef("warden-fatuma").continuousGainedSubDecls?.[0]?.kind,
      ).toBe("fatuma_lose_click");
      expect(getCardDef("viral-weaponization").onScoreTurnEnd).toBeTruthy();
      expect(getCardDef("envelope").subroutines?.length).toBe(2);
      expect(getCardDef("mwanza-city-grid").hqOrRdRootOnly).toBe(true);
      expect(getCardDef("mwanza-city-grid").bonusAccessOnHqBreach).toBe(3);
      expect(getCardDef("mwanza-city-grid").bonusAccessOnRdBreach).toBe(3);
      expect(
        getCardDef("mwanza-city-grid").gainCreditsPerCardAccessedDuringBreach,
      ).toBe(2);
      expect(getCardDef("standard-procedure").playRequiresSuccessfulRunLastTurn).toBe(
        true,
      );
      expect(getCardDef("intake").mustRevealWhenAccessedFromRd).toBe(true);
      expect(getCardDef("intake").skipOnAccessFromArchives).toBe(true);
      expect(getCardDef("masvingo").canAdvance).toBe(true);
      expect(getCardDef("masvingo").continuousGainedSubDecls?.some((d) => d.kind === "per_advancement")).toBe(true);
      expect(getCardDef("overseer-matrix").persistent).toBe(true);
      expect(
        getCardDef("overseer-matrix")
          .mayPayCreditsToTagWhenRunnerTrashesFromThisServerOrRoot?.credits,
      ).toBe(1);
    });
  });
  });
});
