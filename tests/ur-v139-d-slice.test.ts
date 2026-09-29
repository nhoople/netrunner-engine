/**
 * Uprising v1.39.0 D-slice: Drafter / Aniccam / Cybertrooper Talut /
 * Tranquility Home Grid / Winchester.
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
  "drafter",
  "aniccam",
  "cybertrooper-talut",
  "tranquility-home-grid",
  "winchester",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.48.0");
});

describe("Uprising v1.39.0 D-slice", () => {
  it("declares uprising supported with at least 28 clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["uprising"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["uprising"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(28);
  });

  it("loads five new clear cards", () => {
    for (const id of CLEAR) {
      const def = getCardDef(id);
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("uprising");
    }
  });

  it("Drafter may retrieve from Archives and install ignoring costs", () => {
    const def = getCardDef("drafter");
    expect(def.subroutines).toHaveLength(2);
    for (const sub of def.subroutines ?? []) {
      expect(validateEffectTree(sub.effect)).toBeNull();
    }
  });

  it("Aniccam is a console that draws on first event trash", () => {
    const def = getCardDef("aniccam");
    expect(def.muBonus).toBe(1);
    expect(def.subtypes).toContain("console");
    expect(validateEffectTree(def.onFirstEventTrashedThisTurn!)).toBeNull();
  });

  it("Cybertrooper Talut grants link and icebreaker strength", () => {
    const def = getCardDef("cybertrooper-talut");
    expect(def.link).toBe(1);
    expect(def.nonAiIcebreakerInstallStrengthBonusThisTurn).toBe(2);
  });

  it("Tranquility Home Grid is remoteOnly with first-root-install choice", () => {
    const def = getCardDef("tranquility-home-grid");
    expect(def.remoteOnly).toBe(true);
    expect(
      validateEffectTree(def.onFirstInstallInThisServerRootThisTurn!),
    ).toBeNull();
  });

  it("Winchester traces and gains an HQ ETR sub", () => {
    const def = getCardDef("winchester");
    expect(def.subroutines).toHaveLength(2);
    expect(def.gainsSubroutinesWhileProtectingHq).toHaveLength(1);
    expect(
      validateEffectTree(def.gainsSubroutinesWhileProtectingHq![0]!.effect),
    ).toBeNull();
  });
});
