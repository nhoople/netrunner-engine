/**
 * mala-tempora play tests.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
} from "../src/index.js";

describe("mala-tempora", () => {
  describe("mt-v197-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.11");
  });

  describe("Mala Tempora v1.97.0 set-complete", () => {

    it("maps key MT fields and primitives", () => {
      expect(getCardDef("torch").breaker?.breaksSubtype).toBe("code gate");
      expect(getCardDef("running-interference").runEvent?.iceRezAdditionalCostEqualsPrintedRezCost).toBe(
        true,
      );
      expect(getCardDef("deep-red").muBonusOnlyForCaissaPrograms).toBe(true);
      expect(getCardDef("paper-wall").trashSelfWhenFullyBrokenByRunner).toBe(true);
      expect(getCardDef("power-shutdown").playRequiresRunnerMadeRunLastTurn).toBe(
        true,
      );
    });
  });
  });
});
