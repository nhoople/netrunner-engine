/**
 * Vantage Point v1.20.0 B-slice: ezaM / Magistrate / Scapegoat → 27/66.
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

const CLEAR = ["ezam", "magistrate-revontulet", "scapegoat"] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.61.0");
});

describe("Vantage Point v1.20.0 B-slice", () => {
  it("declares at least 27 clear vantage-point cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["vantage-point"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["vantage-point"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(27);
  });

  it("loads three newly mapped cards clear", () => {
    for (const id of CLEAR) {
      expect(getCardDef(id).unsupported ?? [], id).toEqual([]);
      expect(getCardDef(id).wave).toBe("vantage-point");
    }
  });

  it("ezaM swaps ice, looks top R&D, and fortifies", () => {
    const def = getCardDef("ezam");
    expect(def.paidAbilities?.[0]?.cost).toEqual({ clicks: 1 });
    expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();
    expect(JSON.stringify(def.paidAbilities)).toContain(
      "swap_source_ice_with_other",
    );
    expect(def.subroutines).toHaveLength(2);
    for (const sub of def.subroutines ?? []) {
      expect(validateEffectTree(sub.effect), sub.id).toBeNull();
    }
    expect(JSON.stringify(def.subroutines)).toContain("look_top_rd_may_bottom");
    expect(JSON.stringify(def.subroutines)).toContain("fortify_all_ice");
  });

  it("Magistrate taxes steals and drains on score", () => {
    const def = getCardDef("magistrate-revontulet");
    expect(def.stealAdditionalCreditsWhileRezzed).toBe(3);
    expect(validateEffectTree(def.onAgendaScored!)).toBeNull();
    expect(JSON.stringify(def.onAgendaScored)).toContain("lose_credits");
  });

  it("Scapegoat offers remove BP or shuffle installed", () => {
    const def = getCardDef("scapegoat");
    expect(validateEffectTree(def.onPlay!)).toBeNull();
    expect(JSON.stringify(def.onPlay)).toContain("remove_bad_publicity");
    expect(JSON.stringify(def.onPlay)).toContain(
      "shuffle_installed_runner_into_stack",
    );
  });
});
