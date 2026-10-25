/**
 * fear-and-loathing play tests.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
} from "../src/index.js";

describe("fear-and-loathing", () => {
  describe("fal-v199-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.13");
  });

  describe("Fear and Loathing v1.99.0 set-complete", () => {

    it("maps key FAL fields and primitives", () => {
      expect(getCardDef("blackguard").blackguardForceRezOnExpose).toBe(true);
      expect(getCardDef("blackmail").playRequiresCorpBadPublicityGte).toBe(1);
      expect(getCardDef("alpha").breakerOnlyOutermostIce).toBe(true);
      expect(getCardDef("omega").breakerOnlyInnermostIce).toBe(true);
      expect(getCardDef("strongbox").stealAdditionalClicks).toBe(1);
    });
  });
  });
});
