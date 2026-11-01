/**
 * the-source play tests.
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

describe("the-source", () => {
  describe("ts-v107-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.14");
  });

  describe("The Source v1.107.0 set-complete", () => {

    it("wires key TS fields", () => {
      loadCardCatalog(true);
      expect(
        getCardDef("industrial-genomics-growing-solutions")
          .trashCostIncreasePerFacedownArchivesCard,
      ).toBe(1);
      expect(getCardDef("turtlebacks").gainCreditsOnCreateServer).toBe(1);
      expect(
        getCardDef("utopia-fragment").whileScoredStealAdditionalCreditsPerAdvancement,
      ).toBe(2);
      expect(getCardDef("ixodidae").trashOnVirusPurge).toBe(true);
      expect(getCardDef("ixodidae").gainCreditsWhenCorpLosesCredits).toBe(1);
      expect(getCardDef("collective-consciousness").drawWhenCorpRezzesIce).toBe(1);
      expect(getCardDef("sage").strengthBonusPerUnusedMu).toBe(1);
      expect(getCardDef("bribery").briberyPlayCostX).toBe(true);
      expect(getCardDef("au-revoir").gainCreditsOnJackOut).toBe(1);
      expect(getCardDef("self-destruct").remoteOnly).toBe(true);
      expect(getCardDef("shoot-the-moon").playAdditionalClick).toBe(true);
      expect(getCardDef("excalibur").subroutines?.[0]?.effect).toEqual({
        op: "do",
        action: { kind: "forbid_runner_runs_this_turn" },
      });
    });
  });
  });
});
