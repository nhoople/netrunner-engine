/**
 * Vantage Point v1.19.0 B-slice: Ansel 2.0 / Kompromat / Retirement Plan → 24/66.
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

const CLEAR = ["ansel-2-0", "kompromat", "retirement-plan"] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.76.0");
});

describe("Vantage Point v1.19.0 B-slice", () => {
  it("declares at least 24 clear vantage-point cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["vantage-point"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["vantage-point"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(24);
  });

  it("loads three newly mapped cards clear", () => {
    for (const id of CLEAR) {
      expect(getCardDef(id).unsupported ?? [], id).toEqual([]);
      expect(getCardDef(id).wave).toBe("vantage-point");
    }
  });

  it("Ansel 2.0 subroutines trash / RFG heap / install / ETR", () => {
    const def = getCardDef("ansel-2-0");
    expect(def.subroutines).toHaveLength(4);
    expect(def.subtypes).toContain("bioroid");
    for (const sub of def.subroutines ?? []) {
      expect(validateEffectTree(sub.effect), sub.id).toBeNull();
    }
    expect(JSON.stringify(def.subroutines)).toContain("rfg_heap_card");
    expect(JSON.stringify(def.subroutines)).toContain(
      "install_from_hq_or_archives",
    );
  });

  it("Kompromat requires iced server and BP-unless-derez on success", () => {
    const def = getCardDef("kompromat");
    expect(def.runEvent?.requiresProtectingIce).toBe(true);
    expect(validateEffectTree(def.runEvent!.onRunEnd!)).toBeNull();
    expect(JSON.stringify(def.runEvent?.onRunEnd)).toContain("run_successful");
    expect(JSON.stringify(def.runEvent?.onRunEnd)).toContain(
      "bp_unless_derez_protecting_attacked",
    );
    expect(JSON.stringify(def.runEvent?.onRunEnd)).toContain("rfg_self");
  });

  it("Retirement Plan is a double that installs from Archives paying", () => {
    const def = getCardDef("retirement-plan");
    expect(def.playAdditionalClick).toBe(true);
    expect(validateEffectTree(def.onPlay!)).toBeNull();
    expect(JSON.stringify(def.onPlay)).toContain("install_from_archives");
  });
});
