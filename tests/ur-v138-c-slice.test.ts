/**
 * Uprising v1.38.1 C-slice: Afterimage / Penumbral / F2P / Transport Monopoly /
 * Akhet / Colossus.
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

const CLEAR = [
  "afterimage",
  "penumbral-toolkit",
  "f2p",
  "transport-monopoly",
  "akhet",
  "colossus",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.38.1");
});

describe("Uprising v1.38.1 C-slice", () => {
  it("declares uprising in-progress with at least 23 clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["uprising"].status).toBe("in-progress");
    let clear = 0;
    for (const id of pool.waves["uprising"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(23);
  });

  it("loads six new clear cards", () => {
    for (const id of CLEAR) {
      const def = getCardDef(id);
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("uprising");
    }
  });

  it("Afterimage is stealth sentry breaker with once-per-turn bypass", () => {
    const def = getCardDef("afterimage");
    expect(def.breaker?.breaksSubtype).toBe("sentry");
    const bypass = def.paidAbilities?.find((a) => a.id === "afterimage-bypass");
    expect(bypass?.oncePerTurn).toBe(true);
    expect(bypass?.cost?.creditsFromStealthOnly).toBe(true);
    expect(validateEffectTree(bypass!.effect)).toBeNull();
  });

  it("Penumbral Toolkit hosts run credits with HQ install discount", () => {
    const def = getCardDef("penumbral-toolkit");
    expect(def.hostedCreditsOnInstall).toBe(4);
    expect(def.spendHostedCreditsDuringRuns).toBe(true);
    expect(def.installCostDiscountIfSuccessfulHqRunThisTurn).toBe(2);
  });

  it("F2P lets untagged Runner break and has bounce/tag subs", () => {
    const def = getCardDef("f2p");
    const ab = def.paidAbilities?.[0];
    expect(ab?.usableByAnyPlayer).toBe(true);
    expect(ab?.requiresUntagged).toBe(true);
    expect(def.subroutines).toHaveLength(2);
    expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
  });

  it("Transport Monopoly places agenda counters and can block success", () => {
    const def = getCardDef("transport-monopoly");
    expect(validateEffectTree(def.onScore!)).toBeNull();
    const ab = def.paidAbilities?.[0];
    expect(ab?.cost?.agendaCounters).toBe(1);
    expect(ab?.requireDuringRun).toBe(true);
    expect(validateEffectTree(ab!.effect)).toBeNull();
  });

  it("Akhet advances for strength and printed-sub cap", () => {
    const def = getCardDef("akhet");
    expect(def.canAdvance).toBe(true);
    expect(def.strengthBonusAtAdvancements).toEqual({
      threshold: 3,
      bonus: 3,
    });
    expect(def.maxPrintedSubsBreakablePerEncounterAtAdvancements).toEqual({
      threshold: 3,
      max: 1,
    });
  });

  it("Colossus scales with advancements", () => {
    const def = getCardDef("colossus");
    expect(def.canAdvance).toBe(true);
    expect(def.strengthPerAdvancement).toBe(1);
    expect(def.subroutines).toHaveLength(2);
    for (const sub of def.subroutines ?? []) {
      expect(validateEffectTree(sub.effect)).toBeNull();
    }
  });
});
