/**
 * Vantage Point v1.26.0 B-slice: Flagship / Cultivate / Touchstone → 45/66.
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

const CLEAR = ["flagship", "cultivate", "touchstone"] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.48.0");
});

describe("Vantage Point v1.26.0 B-slice", () => {
  it("declares at least 45 clear vantage-point cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["vantage-point"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["vantage-point"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(45);
  });

  it("loads three newly mapped cards clear", () => {
    for (const id of CLEAR) {
      expect(getCardDef(id).unsupported ?? [], id).toEqual([]);
      expect(getCardDef(id).wave).toBe("vantage-point");
    }
  });

  it("Flagship is HQ/R&D-only with Crisium-class + access cap", () => {
    const def = getCardDef("flagship");
    expect(def.installServers).toEqual(["hq", "rd"]);
    expect(def.runsCannotBeSuccessful).toBe(true);
    expect(def.maxAccessOtherThanSelf).toBe(1);
  });

  it("Cultivate looks, trashes one, HQs one, arranges rest", () => {
    const def = getCardDef("cultivate");
    expect(validateEffectTree(def.onPlay!)).toBeNull();
    expect(JSON.stringify(def.onPlay)).toContain(
      "look_top_n_rd_trash_one_hq_one_arrange_rest",
    );
  });

  it("Touchstone hosts credits on first event, spendable during runs", () => {
    const def = getCardDef("touchstone");
    expect(def.hostedCreditsOnFirstEventPlayOncePerTurn).toBe(1);
    expect(def.spendHostedCreditsDuringRuns).toBe(true);
  });
});
