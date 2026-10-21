/**
 * stalwart play tests.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
} from "../src/index.js";

describe("stalwart", () => {
  describe("st-v196-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.9");
  });

  describe("Stalwart v1.97.0 set-complete", () => {

    it("maps key ST fields and primitives", () => {
      expect(getCardDef("bishop").hostStrengthModifier).toBe(-2);
      expect(getCardDef("recon").runEvent?.mayJackOutOnFirstIceEncounter).toBe(
        true,
      );
      expect(getCardDef("the-cleaners").whileScoredMeatDamageIncrease).toBe(1);
      expect(getCardDef("off-the-grid").blocksRunnerRunsOnHostServer).toBe(true);
      expect(getCardDef("hellion-alpha-test").playRequiresRunnerInstalledResourceLastTurn).toBe(
        true,
      );
      expect(getCardDef("leviathan").breaker?.breakMaxSubs).toBe(3);
    });
  });
  });
});
