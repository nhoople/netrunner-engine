/**
 * Vantage Point v1.21.0 B-slice: Tailgate / Chain Reaction / realloc() → 30/66.
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

const CLEAR = ["tailgate", "chain-reaction", "realloc"] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.130.0");
});

describe("Vantage Point v1.21.0 B-slice", () => {
  it("declares at least 30 clear vantage-point cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["vantage-point"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["vantage-point"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(30);
  });

  it("loads three newly mapped cards clear", () => {
    for (const id of CLEAR) {
      expect(getCardDef(id).unsupported ?? [], id).toEqual([]);
      expect(getCardDef(id).wave).toBe("vantage-point");
    }
  });

  it("Tailgate discounts by HQ ice and bonus-accesses HQ", () => {
    const def = getCardDef("tailgate");
    expect(def.playCostDiscountPerIceProtectingServer).toBe("hq");
    expect(def.runEvent?.servers).toBe("hq");
    expect(def.runEvent?.bonusAccess).toBe(2);
  });

  it("Chain Reaction requires all centrals then trashes", () => {
    const def = getCardDef("chain-reaction");
    expect(def.playRequiresSuccessfulAllCentralsThisTurn).toBe(true);
    expect(validateEffectTree(def.onPlay!)).toBeNull();
    expect(JSON.stringify(def.onPlay)).toContain("trash_n_installed_corp");
    expect(JSON.stringify(def.onPlay)).toContain("trash_installed_runner");
  });

  it("realloc() is a double that picks two rezzed ice", () => {
    const def = getCardDef("realloc");
    expect(def.playAdditionalClick).toBe(true);
    expect(validateEffectTree(def.onPlay!)).toBeNull();
    expect(JSON.stringify(def.onPlay)).toContain("realloc_two_rezzed_ice");
  });
});
