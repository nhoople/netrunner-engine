/**
 * true-colors play tests.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
} from "../src/index.js";

describe("true-colors", () => {
  describe("tc-v198-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.11");
  });

  describe("True Colors v1.98.0 set-complete", () => {

    it("maps key TC fields and primitives", () => {
      expect(getCardDef("garrote").breaker?.breaksSubtype).toBe("sentry");
      expect(getCardDef("llds-processor").nonAiIcebreakerInstallStrengthBonusThisTurn).toBe(
        1,
      );
      expect(getCardDef("curtain-wall").strengthBonusIfOutermostOnServer).toBe(4);
      expect(getCardDef("leverage").playRequiresSuccessfulHqRunThisTurn).toBe(true);
    });
  });
  });
});
