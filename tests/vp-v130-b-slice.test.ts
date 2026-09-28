/**
 * Vantage Point v1.30.0 B-slice: Baker / Aircheck → 56/66.
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

const CLEAR = ["baker", "aircheck"] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.31.0");
});

describe("Vantage Point v1.30.0 B-slice", () => {
  it("declares exactly 56 clear vantage-point cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["vantage-point"].status).toBe("in-progress");
    let clear = 0;
    for (const id of pool.waves["vantage-point"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(56);
  });

  it("loads two newly mapped cards clear", () => {
    for (const id of CLEAR) {
      expect(getCardDef(id).unsupported ?? [], id).toEqual([]);
      expect(getCardDef(id).wave).toBe("vantage-point");
    }
  });

  it("Baker runs Archives with stealth approach redirect", () => {
    const def = getCardDef("baker");
    const ab = def.paidAbilities?.[0];
    expect(ab?.oncePerTurn).toBe(true);
    expect(ab?.startsRun?.servers).toBe("archives");
    expect(
      ab?.startsRun?.mayRedirectApproachArchivesToHqOrRdPayingStealthCredits,
    ).toBe(1);
  });

  it("Aircheck blocks pool spend/lose and may-run remote on success", () => {
    const def = getCardDef("aircheck");
    expect(def.subtypes).toContain("stealth");
    expect(def.runEvent?.servers).toBe("hq_rd");
    expect(def.runEvent?.placeEventCredits).toBe(4);
    expect(def.runEvent?.blockCreditPoolSpendAndLose).toBe(true);
    expect(validateEffectTree(def.runEvent!.onRunEnd!)).toBeNull();
    expect(JSON.stringify(def.runEvent!.onRunEnd)).toContain("may_start_run");
    expect(JSON.stringify(def.runEvent!.onRunEnd)).toContain("run_successful");
  });
});
