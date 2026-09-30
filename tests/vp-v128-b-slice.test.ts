/**
 * Vantage Point v1.28.0 B-slice: Sacrifice Zone / Shackleton / Tocsin → 51/66.
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
  "sacrifice-zone-expansion",
  "shackleton-grid",
  "tocsin",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.105.0");
});

describe("Vantage Point v1.28.0 B-slice", () => {
  it("declares exactly 51 clear vantage-point cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["vantage-point"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["vantage-point"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(51);
  });

  it("loads three newly mapped cards clear", () => {
    for (const id of CLEAR) {
      expect(getCardDef(id).unsupported ?? [], id).toEqual([]);
      expect(getCardDef(id).wave).toBe("vantage-point");
    }
  });

  it("Sacrifice Zone is faceup with first-advance credits + other-server meat", () => {
    const def = getCardDef("sacrifice-zone-expansion");
    expect(def.installFaceup).toBe(true);
    expect(def.creditsOnFirstAdvanceThisTurn).toBe(3);
    expect(validateEffectTree(def.onSuccessfulRunOtherServerOncePerTurn!)).toBeNull();
  });

  it("Shackleton fires on outside-pool spend during run", () => {
    const def = getCardDef("shackleton-grid");
    expect(validateEffectTree(def.onSpendCreditsOutsidePoolDuringRunOncePerTurn!)).toBeNull();
    expect(JSON.stringify(def.onSpendCreditsOutsidePoolDuringRunOncePerTurn)).toContain("meat_damage");
  });

  it("Tocsin searches R&D from HQ for barrier + sentry", () => {
    const def = getCardDef("tocsin");
    expect(def.paidAbilities?.[0]?.usableFromHq).toBe(true);
    expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();
    expect(JSON.stringify(def.paidAbilities![0]!.effect)).toContain(
      "search_rd_up_to_one_each_subtype_to_hq",
    );
    expect(def.subroutines?.length).toBe(3);
  });
});
