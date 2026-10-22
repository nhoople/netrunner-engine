/**
 * kala-ghoda play tests.
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

describe("kala-ghoda", () => {
  describe("kg-v116-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.10");
  });

  describe("Kala Ghoda v1.116.0 set-complete", () => {

    it("wires key KG fields", () => {
      loadCardCatalog(true);
      expect(getCardDef("street-magic").runnerChoosesUnbrokenSubroutineOrder).toBe(
        true,
      );
      expect(getCardDef("high-stakes-job").runEvent?.requiresUnrezzedIce).toBe(true);
      expect(getCardDef("mongoose").breakOnAtMostOneIcePerRun).toBe(true);
      expect(getCardDef("mongoose").breaker?.breakMaxSubs).toBe(2);
      expect(
        getCardDef("jesminder-sareen-girl-behind-the-curtain").preventFirstTagThisTurn,
      ).toBe(true);
      expect(getCardDef("maya").muBonus).toBe(2);
      expect(getCardDef("maya").onFinishAccessRdOncePerTurn).toBeTruthy();
      expect(getCardDef("panchatantra").onEncounterAnyIceOncePerTurn).toBeTruthy();
      expect(getCardDef("artist-colony").paidAbilities?.[0]?.cost?.forfeitAgenda).toBe(
        true,
      );
      expect(getCardDef("advanced-concept-hopper").onFirstRunBeginThisTurn).toBeTruthy();
      expect(getCardDef("vikram-1-0").bioroidBreakMaxSubs).toBe(1);
      expect(
        getCardDef("mumbad-city-grid").onPassIceProtectingThisServerMaySwap,
      ).toBe(true);
      expect(getCardDef("mumba-temple").recurringCreditsMax).toBe(2);
      expect(getCardDef("mumba-temple").recurringSpendFor).toContain("rez");
      expect(getCardDef("museum-of-history").unique).toBe(true);
      expect(getCardDef("dedication-ceremony").onPlay).toBeTruthy();
    });
  });
  });
});
