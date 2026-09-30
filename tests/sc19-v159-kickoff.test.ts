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
  assertCardsPinnedTag("v1.91.0");
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
    expect(pool.corpusOrder[5]).toBe("reign-and-reverie");
    expect(pool.corpusOrder[6]).toBe("system-core-2019");
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
