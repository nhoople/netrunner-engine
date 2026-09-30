/**
 * Uprising v1.36.0 A-slice: La Costa Grid / Gold Farmer / Mantle / False Lead / Bellona.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  fx,
  getCardDef,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";

const CLEAR = [
  "la-costa-grid",
  "gold-farmer",
  "mantle",
  "false-lead",
  "bellona",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.103.0");
});

describe("Uprising v1.36.0 A-slice", () => {
  it("declares uprising supported with at least 8 clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["uprising"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["uprising"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(8);
  });

  it("loads five new clear cards", () => {
    for (const id of CLEAR) {
      const def = getCardDef(id);
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("uprising");
    }
  });

  it("La Costa Grid is remoteOnly and places advancement on turn begin", () => {
    const def = getCardDef("la-costa-grid");
    expect(def.remoteOnly).toBe(true);
    expect(def.onTurnBegin).toEqual({
      op: "do",
      action: {
        kind: "place_advancements",
        amount: 1,
        sameServerRootAsSource: true,
        pick: "choose",
      },
    });
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
  });

  it("Gold Farmer taxes breaks and has dual ETR-unless-pay-3", () => {
    const def = getCardDef("gold-farmer");
    expect(def.runnerLoseCreditsOnBreakPrintedSubroutine).toBe(1);
    expect(def.subroutines).toHaveLength(2);
    for (const sub of def.subroutines ?? []) {
      expect(validateEffectTree(sub.effect)).toBeNull();
      expect(JSON.stringify(sub.effect)).toContain("end_the_run");
    }
  });

  it("Mantle has 1 recurring credit for programs and hardware", () => {
    const def = getCardDef("mantle");
    expect(def.recurringCreditsMax).toBe(1);
    expect(def.recurringSpendFor).toEqual(["use_program", "use_hardware"]);
  });

  it("False Lead forfeits to strip Runner clicks when they have 2+", () => {
    const def = getCardDef("false-lead");
    expect(def.paidAbilities).toHaveLength(1);
    const ab = def.paidAbilities![0]!;
    expect(ab.cost).toEqual({ trashSelf: true });
    expect(ab.windows).toContain("corp_action_paw");
    expect(validateEffectTree(ab.effect)).toBeNull();
    expect(JSON.stringify(ab.effect)).toContain("clicks_gte");
    expect(JSON.stringify(ab.effect)).toContain("lose_clicks");
  });

  it("Bellona costs 5¢ to steal and gains 5¢ on score", () => {
    const def = getCardDef("bellona");
    expect(def.stealAdditionalCredits).toBe(5);
    expect(def.onScore).toEqual(fx.gainCredits("corp", 5));
    expect(validateEffectTree(def.onScore!)).toBeNull();
  });
});
