/**
 * the-spaces-between play tests.
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

describe("the-spaces-between", () => {
  describe("tsb-v103-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  describe("The Spaces Between v1.103.0 set-complete", () => {

    it("wires key TSB fields", () => {
      loadCardCatalog(true);
      expect(getCardDef("d4v1d").powerCountersOnInstall).toBe(3);
      expect(getCardDef("ghost-runner").hostedCreditsOnInstall).toBe(3);
      expect(getCardDef("lag-time").allIceStrengthBonus).toBe(1);
      expect(getCardDef("enhanced-login-protocol").lingerAsCurrent).toBe(true);
    });
  });
  });
});
