/**
 * Vantage Point v1.27.0 B-slice: Stick and Poke / Rotary / Sipa → 48/66.
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

const CLEAR = ["stick-and-poke", "rotary", "sipa"] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.44.0");
});

describe("Vantage Point v1.27.0 B-slice", () => {
  it("declares at least 48 clear vantage-point cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["vantage-point"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["vantage-point"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(48);
  });

  it("loads three newly mapped cards clear", () => {
    for (const id of CLEAR) {
      expect(getCardDef(id).unsupported ?? [], id).toEqual([]);
      expect(getCardDef(id).wave).toBe("vantage-point");
    }
  });

  it("Stick and Poke gains a net+draw subroutine on first encounter", () => {
    const def = getCardDef("stick-and-poke");
    expect(def.firstEncounterGainsSubroutine?.text).toContain("net damage");
    expect(validateEffectTree(def.firstEncounterGainsSubroutine!.effect)).toBeNull();
  });

  it("Rotary is a console with tag-for-access and Corp trash", () => {
    const def = getCardDef("rotary");
    expect(def.muBonus).toBe(1);
    expect(def.mayTakeTagForBonusAccessOnHqRdBreach).toBe(1);
    expect(def.paidAbilities?.[0]?.requireRunnerTagged).toBe(true);
    expect(def.paidAbilities?.[0]?.usableByAnyPlayer).toBe(true);
    expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();
  });

  it("Sipa may swap outermost after full break", () => {
    const def = getCardDef("sipa");
    expect(def.maySwapOutermostIceOnPassAfterFullyBreakOncePerTurn).toBe(true);
  });
});
