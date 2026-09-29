/**
 * Vantage Point v1.14.0 B-slice: Vic / Lionsmane / Esca / Sleipnir → 8/66.
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
  "virtual-intelligence-p-i-you-can-call-me-vic",
  "lionsmane",
  "esca",
  "sleipnir",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.36.0");
});

describe("Vantage Point v1.14.0 B-slice", () => {
  it("declares at least 8 clear vantage-point cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["vantage-point"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["vantage-point"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(8);
  });

  it("loads four newly mapped cards clear", () => {
    for (const id of CLEAR) {
      expect(getCardDef(id).unsupported ?? [], id).toEqual([]);
      expect(getCardDef(id).wave).toBe("vantage-point");
    }
  });

  it("Vic is once/turn click+1¢ draw and remove tag", () => {
    const def = getCardDef("virtual-intelligence-p-i-you-can-call-me-vic");
    expect(def.paidAbilities).toHaveLength(1);
    const ab = def.paidAbilities![0]!;
    expect(ab.oncePerTurn).toBe(true);
    expect(ab.clickCost).toBe(1);
    expect(ab.creditCost).toBe(1);
    expect(validateEffectTree(ab.effect)).toBeNull();
    expect(JSON.stringify(ab.effect)).toContain("remove_tags");
  });

  it("Lionsmane has three net-damage subroutines", () => {
    const def = getCardDef("lionsmane");
    expect(def.subroutines).toHaveLength(3);
    for (const sub of def.subroutines ?? []) {
      expect(validateEffectTree(sub.effect)).toBeNull();
    }
  });

  it("Esca must-reveal from R&D and onAccess lose¢ / tagged net", () => {
    const def = getCardDef("esca");
    expect(def.mustRevealWhenAccessedFromRd).toBe(true);
    expect(validateEffectTree(def.onAccess!)).toBeNull();
    expect(JSON.stringify(def.onAccess)).toContain("lose_credits");
  });

  it("Sleipnir may-draw / may-shuffle / ETR", () => {
    const def = getCardDef("sleipnir");
    expect(def.subroutines).toHaveLength(3);
    for (const sub of def.subroutines ?? []) {
      expect(validateEffectTree(sub.effect)).toBeNull();
    }
    expect(JSON.stringify(def.subroutines![2]!.effect)).toContain(
      "end_the_run",
    );
  });
});
