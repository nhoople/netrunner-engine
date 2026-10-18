/**
 * all-that-remains play tests.
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

describe("all-that-remains", () => {
  describe("atr-v106-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("All That Remains v1.106.0 set-complete", () => {

    it("wires key ATR fields", () => {
      loadCardCatalog(true);
      expect(getCardDef("hostile-infrastructure").netDamageWheneverRunnerTrashesCorpCard).toBe(
        1,
      );
      expect(getCardDef("superior-cyberwalls").whileScoredIceSubtypeStrengthBonus).toEqual({
        subtype: "barrier",
        bonus: 1,
      });
      expect(getCardDef("lycan").morphOddAdvancementSubtypeSwap).toEqual({
        gain: "code gate",
        lose: "sentry",
      });
      expect(getCardDef("ekomind").memoryLimitEqualsGripSize).toBe(true);
      expect(getCardDef("shell-corporation").paidAbilitiesOncePerTurn).toBe(true);
      expect(getCardDef("zona-sul-shipping").trashSelfWhenRunnerTagged).toBe(true);
      expect(getCardDef("cybsoft-macrodrive").recurringSpendFor).toEqual([
        "install_program",
      ]);
      expect(getCardDef("utopia-shard").onGripHqSuccessInstallSelfIgnoringCosts).toBe(
        true,
      );
      expect(getCardDef("cerberus-cuj-0-h3").powerCountersOnInstall).toBe(4);
      expect(getCardDef("cerberus-rex-h2").powerCountersOnInstall).toBe(4);
      expect(getCardDef("cerberus-lady-h1").powerCountersOnInstall).toBe(4);
    });
  });
  });
});
