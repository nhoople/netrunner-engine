/**
 * Vantage Point v1.17.0 B-slice: Sell Out / Underdome Irregulars / Unleash → 18/66.
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

const CLEAR = ["sell-out", "underdome-irregulars", "unleash"] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.144.0");
});

describe("Vantage Point v1.17.0 B-slice", () => {
  it("declares at least 18 clear vantage-point cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["vantage-point"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["vantage-point"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(18);
  });

  it("loads three newly mapped cards clear", () => {
    for (const id of CLEAR) {
      expect(getCardDef(id).unsupported ?? [], id).toEqual([]);
      expect(getCardDef(id).wave).toBe("vantage-point");
    }
  });

  it("Sell Out trashes own resource then gains 4¢ and draws 2", () => {
    const def = getCardDef("sell-out");
    expect(def.playRequiresInstalledResource).toBe(true);
    expect(validateEffectTree(def.playAdditionalCost!)).toBeNull();
    expect(JSON.stringify(def.playAdditionalCost)).toContain("trash_own_resource");
    expect(validateEffectTree(def.onPlay!)).toBeNull();
    expect(JSON.stringify(def.onPlay)).toContain("gain_credits");
    expect(JSON.stringify(def.onPlay)).toContain('"amount":2');
  });

  it("Underdome Irregulars gates on ice_rezzed_this_turn", () => {
    const def = getCardDef("underdome-irregulars");
    expect(validateEffectTree(def.onRunnerActionPhaseEnd!)).toBeNull();
    expect(JSON.stringify(def.onRunnerActionPhaseEnd)).toContain(
      "ice_rezzed_this_turn",
    );
    expect(JSON.stringify(def.onRunnerActionPhaseEnd)).toContain("trash_self");
    expect(JSON.stringify(def.onRunnerActionPhaseEnd)).toContain("remove_tags");
  });

  it("Unleash removes a tag then rez-may-resolve", () => {
    const def = getCardDef("unleash");
    expect(def.playRequiresTagged).toBe(true);
    expect(validateEffectTree(def.playAdditionalCost!)).toBeNull();
    expect(JSON.stringify(def.playAdditionalCost)).toContain("remove_tags");
    expect(validateEffectTree(def.onPlay!)).toBeNull();
    expect(JSON.stringify(def.onPlay)).toContain("unleash_rez_may_resolve_sub");
  });
});
