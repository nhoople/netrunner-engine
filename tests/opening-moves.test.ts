/**
 * opening-moves play tests.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
} from "../src/index.js";

describe("opening-moves", () => {
  describe("om-v195-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.13");
  });

  describe("Opening Moves v1.95.0 set-complete", () => {

    it("maps key OM fields and primitives", () => {
      expect(getCardDef("lockpick").recurringSpendFor).toEqual(["use_decoder"]);
      expect(getCardDef("next-bronze").strengthBonusPerRezzedIceWithSubtype).toEqual(
        { subtype: "next", bonus: 1 },
      );
      expect(getCardDef("rook").iceRezCostIncreaseProtectingHostedServer).toBe(2);
      expect(getCardDef("pawn").caissaAdvanceOnSuccessfulRun).toBe(true);
      expect(JSON.stringify(getCardDef("cyberdex-trial").onPlay)).toContain(
        "purge_virus_counters",
      );
      expect(getCardDef("swarm").canAdvance).toBe(true);
      expect(getCardDef("jackson-howard").paidAbilities?.length).toBe(2);
    });
  });
  });
});
