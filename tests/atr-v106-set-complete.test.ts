/**
 * All That Remains (atr) set-complete — floor v1.105.0 → v1.106.0.
 * 17/17 ATR-only clears. CR pin v26.03.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
  loadCardCatalog,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";

const ATR_CLEARS = [
  "bifrost-array",
  "sagittarius",
  "hostile-infrastructure",
  "gemini",
  "superior-cyberwalls",
  "executive-boot-camp",
  "lycan",
  "snatch-and-grab",
  "merlin",
  "shell-corporation",
  "ekomind",
  "cerberus-cuj-0-h3",
  "cerberus-rex-h2",
  "zona-sul-shipping",
  "cybsoft-macrodrive",
  "cerberus-lady-h1",
  "utopia-shard",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.123.0");
});

describe("All That Remains v1.106.0 set-complete", () => {
  it("declares all-that-remains supported after up-and-over with 17 clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["all-that-remains"].status).toBe("supported");
    expect(pool.waves["all-that-remains"].cards).toHaveLength(20);
    expect(pool.corpusOrder[18]).toBe("up-and-over");
    expect(pool.corpusOrder[19]).toBe("all-that-remains");
    expect(pool.corpusOrder[20]).toBe("the-source");
    expect(pool.corpusOrder[21]).toBe("order-and-chaos");
    expect(pool.corpusOrder[22]).toBe("the-valley");
    expect(pool.corpusOrder[23]).toBe("breaker-bay");
    expect(pool.corpusOrder[24]).toBe("chrome-city");
    expect(pool.corpusOrder[25]).toBe("the-underway");
    expect(pool.corpusOrder[26]).toBe("old-hollywood");
    expect(pool.corpusOrder[28]).toBe("data-and-destiny");
    expect(pool.corpusOrder[29]).toBe("kala-ghoda");
    expect(pool.corpusOrder[30]).toBe("business-first");
    expect(pool.corpusOrder[31]).toBe("democracy-and-dogma");
    expect(pool.corpusOrder[32]).toBe("salsette-island");
    expect(pool.corpusOrder[33]).toBe("the-liberated-mind");
    expect(pool.corpusOrder[34]).toBe("fear-the-masses");
    expect(pool.corpusOrder[37]).toBe("reign-and-reverie");
  });

  it("clears all 17 ATR cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of ATR_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("all-that-remains");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onEncounter) expect(validateEffectTree(def.onEncounter)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onInstall) expect(validateEffectTree(def.onInstall)).toBeNull();
      if (def.onTrash) expect(validateEffectTree(def.onTrash)).toBeNull();
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
    }
  });

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
