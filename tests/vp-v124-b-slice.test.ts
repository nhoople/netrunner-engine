/**
 * Vantage Point v1.24.0 B-slice: Lethe / Reanimation Protocol / Tungsten Tailor → 39/66.
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

const CLEAR = ["lethe", "reanimation-protocol", "the-tungsten-tailor"] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.132.0");
});

describe("Vantage Point v1.24.0 B-slice", () => {
  it("declares at least 39 clear vantage-point cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["vantage-point"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["vantage-point"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(39);
  });

  it("loads three newly mapped cards clear", () => {
    for (const id of CLEAR) {
      expect(getCardDef(id).unsupported ?? [], id).toEqual([]);
      expect(getCardDef(id).wave).toBe("vantage-point");
    }
  });

  it("Lethe tags on bypass/full-break and has Archives/grip subs", () => {
    const def = getCardDef("lethe");
    expect(validateEffectTree(def.onBypass!)).toBeNull();
    expect(JSON.stringify(def.onBypass)).toContain("give_tags");
    expect(validateEffectTree(def.onFullyBreak!)).toBeNull();
    expect(JSON.stringify(def.subroutines)).toContain(
      "may_add_archives_card_to_rd_top_or_bottom",
    );
    expect(JSON.stringify(def.subroutines)).toContain(
      "add_installed_runner_to_grip",
    );
  });

  it("Reanimation Protocol install+rez ice from Archives with discount", () => {
    const def = getCardDef("reanimation-protocol");
    expect(validateEffectTree(def.onPlay!)).toBeNull();
    expect(JSON.stringify(def.onPlay)).toContain(
      "install_and_rez_ice_from_archives",
    );
    expect(JSON.stringify(def.onPlay)).toContain('"totalDiscount":10');
  });

  it("Tungsten Tailor penalizes ice strength and rewards low-str breaks", () => {
    const def = getCardDef("the-tungsten-tailor");
    expect(def.muBonus).toBe(1);
    expect(def.allIceStrengthPenalty).toBe(1);
    expect(def.gainCreditOnBreakIceStrengthLteOncePerTurn).toBe(0);
  });
});
