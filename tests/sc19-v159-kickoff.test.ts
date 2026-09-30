/**
 * System Core 2019 v1.59.0 kickoff: Easy Mark / Beanstalk Royalties /
 * Wall of Static / Akamatsu Mem Chip / Spiderweb.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  createGame,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  loadCardCatalog,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";

const CLEAR = [
  "easy-mark",
  "beanstalk-royalties",
  "wall-of-static",
  "akamatsu-mem-chip",
  "spiderweb",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.125.0");
});

describe("System Core 2019 v1.59.0 kickoff", () => {
  it("declares system-core-2019 supported with 147 cards after reign-and-reverie", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["system-core-2019"].status).toBe("supported");
    expect(pool.waves["system-core-2019"].cards).toHaveLength(147);
    expect(pool.corpusOrder[0]).toBe("core");
    expect(pool.corpusOrder[1]).toBe("what-lies-ahead");
    expect(pool.corpusOrder[2]).toBe("trace-amount");
    expect(pool.corpusOrder[3]).toBe("cyber-exodus");
    expect(pool.corpusOrder[4]).toBe("a-study-in-static");
    expect(pool.corpusOrder[7]).toBe("creation-and-control");
    expect(pool.corpusOrder[8]).toBe("opening-moves");
    expect(pool.corpusOrder[9]).toBe("stalwart");
    expect(pool.corpusOrder[10]).toBe("mala-tempora");
    expect(pool.corpusOrder[11]).toBe("true-colors");
    expect(pool.corpusOrder[12]).toBe("fear-and-loathing");
    expect(pool.corpusOrder[13]).toBe("double-time");
    expect(pool.corpusOrder[14]).toBe("honor-and-profit");
    expect(pool.corpusOrder[15]).toBe("upstalk");
    expect(pool.corpusOrder[16]).toBe("the-spaces-between");
    expect(pool.corpusOrder[17]).toBe("first-contact");
    expect(pool.corpusOrder[18]).toBe("up-and-over");
    expect(pool.corpusOrder[19]).toBe("all-that-remains");
    expect(pool.corpusOrder[20]).toBe("the-source");
    expect(pool.corpusOrder[21]).toBe("order-and-chaos");
    expect(pool.corpusOrder[22]).toBe("the-valley");
    expect(pool.corpusOrder[23]).toBe("breaker-bay");
    expect(pool.corpusOrder[24]).toBe("chrome-city");
    expect(pool.corpusOrder[25]).toBe("the-underway");
    expect(pool.corpusOrder[26]).toBe("old-hollywood");
    expect(pool.corpusOrder[27]).toBe("the-universe-of-tomorrow");
    expect(pool.corpusOrder[28]).toBe("data-and-destiny");
    expect(pool.corpusOrder[29]).toBe("kala-ghoda");
    expect(pool.corpusOrder[30]).toBe("business-first");
    expect(pool.corpusOrder[31]).toBe("democracy-and-dogma");
    expect(pool.corpusOrder[32]).toBe("salsette-island");
    expect(pool.corpusOrder[33]).toBe("the-liberated-mind");
    expect(pool.corpusOrder[34]).toBe("fear-the-masses");
    expect(pool.corpusOrder[35]).toBe("twenty-three-seconds");
    expect(pool.corpusOrder[36]).toBe("blood-money");
    expect(pool.corpusOrder[37]).toBe("escalation");
    expect(pool.corpusOrder[38]).toBe("intervention");
    expect(pool.corpusOrder[39]).toBe("reign-and-reverie");
    expect(pool.corpusOrder[40]).toBe("system-core-2019");
    expect(pool.corpusOrder.at(-1)).toBe("vantage-point");
  });

  it("declares at least 5 clear system-core-2019 wave files at kickoff", () => {
    const pool = loadCardPool(true);
    let clear = 0;
    for (const id of pool.waves["system-core-2019"].cards) {
      const def = getCardDef(id);
      if ((def.unsupported ?? []).length === 0 && def.wave === "system-core-2019") {
        clear++;
      }
    }
    expect(clear).toBeGreaterThanOrEqual(5);
  });

  it("loads five clear kickoff cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("system-core-2019");
    }
  });

  it("Easy Mark gains 3¢ on play", () => {
    const def = getCardDef("easy-mark");
    expect(def.playCost).toBe(0);
    expect(def.onPlay).toEqual(fx.gainCredits("runner", 3));
    expect(validateEffectTree(def.onPlay!)).toBeNull();

    const state = createGame({ seed: 1 });
    const card = instantiateCard("easy-mark", "em1", "runner:grip");
    state.cards[card.id] = card;
    const before = state.runner.credits;
    const gain = evalEffect(
      { state, sourceId: card.id },
      fx.gainCredits("runner", 3),
    );
    expect(gain.ok).toBe(true);
    expect(state.runner.credits).toBe(before + 3);
  });

  it("Beanstalk Royalties gains 3¢ on play", () => {
    const def = getCardDef("beanstalk-royalties");
    expect(def.playCost).toBe(0);
    expect(def.onPlay).toEqual(fx.gainCredits("corp", 3));
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });

  it("Wall of Static is a barrier with one ETR subroutine", () => {
    const def = getCardDef("wall-of-static");
    expect(def.subtypes).toContain("barrier");
    expect(def.strength).toBe(3);
    expect(def.subroutines).toHaveLength(1);
    expect(def.subroutines![0].effect).toEqual(fx.etr());
    expect(validateEffectTree(def.subroutines![0].effect)).toBeNull();
  });

  it("Akamatsu Mem Chip grants +1 MU", () => {
    const def = getCardDef("akamatsu-mem-chip");
    expect(def.muBonus).toBe(1);
    expect(def.installCost).toBe(1);
    expect(def.subtypes).toContain("chip");
  });

  it("Spiderweb is a barrier with three ETR subroutines", () => {
    const def = getCardDef("spiderweb");
    expect(def.subtypes).toContain("barrier");
    expect(def.strength).toBe(2);
    expect(def.subroutines).toHaveLength(3);
    for (const sub of def.subroutines!) {
      expect(sub.effect).toEqual(fx.etr());
      expect(validateEffectTree(sub.effect)).toBeNull();
    }
  });
});
