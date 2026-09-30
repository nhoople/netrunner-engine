/**
 * Vantage Point v1.13.0 kickoff: Flywheel / Vulture Fund / Paywall / Borrowed Goods.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  fx,
  getCardDef,
  loadCardCatalog,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";

const CLEAR = [
  "flywheel",
  "vulture-fund",
  "paywall",
  "borrowed-goods",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.96.0");
});

describe("Vantage Point v1.13.0 kickoff", () => {
  it("declares vantage-point in-progress with 66 cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["vantage-point"].status).toBe("supported");
    expect(pool.waves["vantage-point"].cards).toHaveLength(66);
    expect(pool.corpusOrder.at(-1)).toBe("vantage-point");
  });

  it("declares at least 4 clear vantage-point cards at kickoff", () => {
    const pool = loadCardPool(true);
    let clear = 0;
    for (const id of pool.waves["vantage-point"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(4);
  });

  it("loads four clear kickoff cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("vantage-point");
    }
  });

  it("Flywheel has two gain+may-draw subroutines", () => {
    const def = getCardDef("flywheel");
    expect(def.subroutines).toHaveLength(2);
    for (const sub of def.subroutines ?? []) {
      expect(validateEffectTree(sub.effect)).toBeNull();
      expect(JSON.stringify(sub.effect)).toContain("gain_credits");
    }
  });

  it("Vulture Fund gains 14¢ and takes 1 bad publicity", () => {
    const def = getCardDef("vulture-fund");
    expect(def.onPlay).toEqual(
      fx.seq(
        fx.gainCredits("corp", 14),
        fx.do({ kind: "give_bad_publicity", amount: 1 }),
      ),
    );
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });

  it("Paywall onEncounter drains 1¢ and offers ETR-unless-pay", () => {
    const def = getCardDef("paywall");
    expect(validateEffectTree(def.onEncounter!)).toBeNull();
    expect(def.subroutines).toHaveLength(1);
    expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
  });

  it("Borrowed Goods is +1 MU and may tag on install", () => {
    const def = getCardDef("borrowed-goods");
    expect(def.muBonus).toBe(1);
    expect(validateEffectTree(def.onInstall!)).toBeNull();
  });
});
