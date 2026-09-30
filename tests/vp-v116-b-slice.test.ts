/**
 * Vantage Point v1.17.0 B-slice: Take a Dive / Event Horizon / Vicsek → 15/66.
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

const CLEAR = ["take-a-dive", "event-horizon", "vicsek"] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.91.0");
});

describe("Vantage Point v1.17.0 B-slice", () => {
  it("declares at least 15 clear vantage-point cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["vantage-point"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["vantage-point"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(15);
  });

  it("loads three newly mapped cards clear", () => {
    for (const id of CLEAR) {
      expect(getCardDef(id).unsupported ?? [], id).toEqual([]);
      expect(getCardDef(id).wave).toBe("vantage-point");
    }
  });

  it("Take a Dive is hq_rd run with subroutine BP and RFG on run end", () => {
    const def = getCardDef("take-a-dive");
    expect(def.runEvent?.servers).toBe("hq_rd");
    expect(validateEffectTree(def.runEvent!.onSuccessfulRun!)).toBeNull();
    expect(JSON.stringify(def.runEvent!.onSuccessfulRun)).toContain(
      "subroutine_resolved_this_run",
    );
    expect(JSON.stringify(def.runEvent!.onSuccessfulRun)).toContain(
      "give_bad_publicity",
    );
    expect(validateEffectTree(def.runEvent!.onRunEnd!)).toBeNull();
    expect(JSON.stringify(def.runEvent!.onRunEnd)).toContain("rfg_self");
  });

  it("Event Horizon has trashSelf ETR paid ability and two unless-pay subs", () => {
    const def = getCardDef("event-horizon");
    expect(def.paidAbilities).toHaveLength(1);
    expect(def.paidAbilities![0]!.cost?.trashSelf).toBe(true);
    expect(def.paidAbilities![0]!.requireDuringRun).toBe(true);
    expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();
    expect(def.subroutines).toHaveLength(2);
    for (const sub of def.subroutines ?? []) {
      expect(validateEffectTree(sub.effect)).toBeNull();
    }
  });

  it("Vicsek does X net+tags equal to Runner tags then tag+trash_self", () => {
    const def = getCardDef("vicsek");
    expect(def.subroutines).toHaveLength(2);
    expect(JSON.stringify(def.subroutines![0]!.effect)).toContain(
      "net_damage_and_tags_equal_runner_tags",
    );
    expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
    expect(validateEffectTree(def.subroutines![1]!.effect)).toBeNull();
    expect(JSON.stringify(def.subroutines![1]!.effect)).toContain("trash_self");
  });
});
