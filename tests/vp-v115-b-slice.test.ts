/**
 * Vantage Point v1.15.0 B-slice: Caveat Emptor / Grubber / Reverb / Vertigo → 12/66.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";

const CLEAR = [
  "caveat-emptor",
  "grubber",
  "reverb",
  "vertigo",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.104.0");
});

describe("Vantage Point v1.15.0 B-slice", () => {
  it("declares exactly 12 clear vantage-point cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["vantage-point"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["vantage-point"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(12);
  });

  it("loads four newly mapped cards clear", () => {
    for (const id of CLEAR) {
      expect(getCardDef(id).unsupported ?? [], id).toEqual([]);
      expect(getCardDef(id).wave).toBe("vantage-point");
    }
  });

  it("Caveat Emptor offers allotted-click choose", () => {
    const def = getCardDef("caveat-emptor");
    expect(validateEffectTree(def.onPlay!)).toBeNull();
    expect(JSON.stringify(def.onPlay)).toContain("allotted_clicks_next_turn");
  });

  it("Grubber onRez BP if protecting_central + dual ETR-unless-pay", () => {
    const def = getCardDef("grubber");
    expect(JSON.stringify(def.onRez)).toContain("protecting_central");
    expect(validateEffectTree(def.onRez!)).toBeNull();
    expect(def.subroutines).toHaveLength(2);
    for (const sub of def.subroutines ?? []) {
      expect(validateEffectTree(sub.effect)).toBeNull();
    }
  });

  it("Reverb discounts per other unrezzed ice + dual ETR", () => {
    const def = getCardDef("reverb");
    expect(def.rezCostDiscountPerOtherUnrezzedIce).toBe(1);
    expect(def.subroutines).toHaveLength(2);
    for (const sub of def.subroutines ?? []) {
      expect(validateEffectTree(sub.effect)).toBeNull();
    }
  });

  it("Vertigo onPass forbids steal/trash when no clicks", () => {
    const def = getCardDef("vertigo");
    expect(JSON.stringify(def.onPass)).toContain("forbid_steal_trash_this_run");
    expect(JSON.stringify(def.onPass)).toContain('"op":"not"');
    expect(validateEffectTree(def.onPass!)).toBeNull();
    expect(def.subroutines).toHaveLength(1);
    expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
  });
});
