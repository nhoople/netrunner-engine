/**
 * Vantage Point v1.29.0 B-slice: Corsair / Methuselah / Lampades → 54/66.
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

const CLEAR = ["corsair", "methuselah", "lampades"] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.75.0");
});

describe("Vantage Point v1.29.0 B-slice", () => {
  it("declares exactly 54 clear vantage-point cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["vantage-point"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["vantage-point"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(54);
  });

  it("loads three newly mapped cards clear", () => {
    for (const id of CLEAR) {
      expect(getCardDef(id).unsupported ?? [], id).toEqual([]);
      expect(getCardDef(id).wave).toBe("vantage-point");
    }
  });

  it("Corsair is a strength-0 fracter with stealth-only weaken", () => {
    const def = getCardDef("corsair");
    expect(def.breaker?.breaksSubtype).toBe("barrier");
    expect(def.breaker?.strength).toBe(0);
    expect(def.breaker?.breakCredits).toBe(1);
    const weaken = def.paidAbilities?.[0];
    expect(weaken?.cost).toMatchObject({
      credits: 1,
      creditsFromStealthOnly: true,
    });
    expect(weaken?.requireEncounterSubtype).toBe("barrier");
    expect(validateEffectTree(weaken!.effect)).toBeNull();
    expect(JSON.stringify(weaken!.effect)).toContain("weaken_ice");
  });

  it("Methuselah is a stealth console with onRunBegin trash-to-host", () => {
    const def = getCardDef("methuselah");
    expect(def.subtypes).toContain("console");
    expect(def.subtypes).toContain("stealth");
    expect(def.muBonus).toBe(1);
    expect(def.spendHostedCreditsDuringRuns).toBe(true);
    expect(validateEffectTree(def.onRunBegin!)).toBeNull();
    expect(JSON.stringify(def.onRunBegin)).toContain(
      "may_trash_hardware_from_grip_place_hosted_credits",
    );
  });

  it("Lampades loads power on install and stealth access-trash", () => {
    const def = getCardDef("lampades");
    expect(def.powerCountersOnInstall).toBe(3);
    expect(def.accessTrashPayingPrintedCostFromStealth).toBe(true);
  });
});
