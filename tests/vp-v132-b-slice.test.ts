/**
 * Vantage Point v1.32.0 B-slice: Nurse / Beta Build / Perfect Recall → 62/66.
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

const CLEAR = ["nurse-hanh", "beta-build", "perfect-recall"] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.88.0");
});

describe("Vantage Point v1.32.0 B-slice", () => {
  it("declares exactly 62 clear vantage-point cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["vantage-point"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["vantage-point"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(62);
  });

  it("loads three newly mapped cards clear", () => {
    for (const id of CLEAR) {
      expect(getCardDef(id).unsupported ?? [], id).toEqual([]);
    }
  });

  it("Nurse Hạnh draws when Archives facedown cards turn faceup", () => {
    const def = getCardDef("nurse-hanh");
    expect(def.onArchivesFacedownTurnedFaceupGte?.min).toBe(2);
    expect(validateEffectTree(def.onArchivesFacedownTurnedFaceupGte!.effect)).toBeNull();
  });

  it("Beta Build searches non-virus program then may return on run end", () => {
    const def = getCardDef("beta-build");
    expect(validateEffectTree(def.onPlay!)).toBeNull();
    expect(JSON.stringify(def.onPlay)).toContain(
      "search_stack_non_virus_program_install_ignore_costs_track",
    );
    expect(validateEffectTree(def.runEvent!.onRunEnd!)).toBeNull();
  });

  it("Perfect Recall loads power and forbids steal/trash copies", () => {
    const def = getCardDef("perfect-recall");
    expect(def.powerCountersOnRez).toBe(1);
    expect(def.powerCounterOnAgendaScoredOrStolenFromThisServer).toBe(1);
    expect(def.paidAbilities?.[0]?.requiresActiveRun).toBe(true);
    expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();
  });
});
