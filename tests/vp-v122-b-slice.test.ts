/**
 * Vantage Point v1.22.0 B-slice: Myōshu / Flood the Market / Synchrocyclotron → 33/66.
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

const CLEAR = ["myoshu", "flood-the-market", "synchrocyclotron"] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.99.0");
});

describe("Vantage Point v1.22.0 B-slice", () => {
  it("declares at least 33 clear vantage-point cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["vantage-point"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["vantage-point"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(33);
  });

  it("loads three newly mapped cards clear", () => {
    for (const id of CLEAR) {
      expect(getCardDef(id).unsupported ?? [], id).toEqual([]);
      expect(getCardDef(id).wave).toBe("vantage-point");
    }
  });

  it("Myōshu gates on scored-not-installed agenda and scores self", () => {
    const def = getCardDef("myoshu");
    expect(def.playRequiresScoredAgendaNotInstalledThisTurn).toBe(true);
    expect(def.agendaPoints).toBe(2);
    expect(validateEffectTree(def.onPlay!)).toBeNull();
    expect(JSON.stringify(def.onPlay)).toContain("score_self_as_agenda");
  });

  it("Flood the Market is a double that advances per iced rooted remote", () => {
    const def = getCardDef("flood-the-market");
    expect(def.playAdditionalClick).toBe(true);
    expect(validateEffectTree(def.onPlay!)).toBeNull();
    expect(JSON.stringify(def.onPlay)).toContain(
      "place_advancements_per_iced_rooted_remote",
    );
  });

  it("Synchrocyclotron discounts the first double each turn", () => {
    const def = getCardDef("synchrocyclotron");
    expect(def.firstDoubleOperationClickDiscount).toBe(1);
  });
});
