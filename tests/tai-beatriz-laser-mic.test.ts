/**
 * TAI v0.75: Beatriz, Laser Pointer, M.I.C. wiring.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
  validateEffectTree,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v0.81.0");
});

describe("TAI Beatriz / Laser Pointer / M.I.C.", () => {
  it("wires Beatriz HQ→RD redirect run; unsupported empty", () => {
    const def = getCardDef("beatriz-friere-gonzalez");
    expect(def.unsupported).toEqual([]);
    const ab = def.paidAbilities?.[0];
    expect(ab?.cost?.clicks).toBe(2);
    expect(ab?.startsRun).toEqual({
      servers: "hq",
      redirectSuccessTo: "rd",
      bonusAccess: 1,
    });
    expect(validateEffectTree(ab!.effect)).toBeNull();
  });

  it("wires Laser Pointer triple trash-bypass; unsupported empty", () => {
    const def = getCardDef("laser-pointer");
    expect(def.unsupported).toEqual([]);
    expect(def.paidAbilities).toHaveLength(3);
    for (const ab of def.paidAbilities ?? []) {
      expect(ab.cost?.trashSelf).toBe(true);
      expect(ab.requireEncounterSubtype).toBeTruthy();
      expect(validateEffectTree(ab.effect)).toBeNull();
    }
    const subs = (def.paidAbilities ?? []).map((a) => a.requireEncounterSubtype);
    expect(subs.sort()).toEqual(["ap", "destroyer", "observer"]);
  });

  it("wires M.I.C. approach trash + Enigma-like subs; unsupported empty", () => {
    const def = getCardDef("m-i-c");
    expect(def.unsupported).toEqual([]);
    const ab = def.paidAbilities?.[0];
    expect(ab?.cost?.trashSelf).toBe(true);
    expect(ab?.windows).toContain("approach_paw");
    expect(validateEffectTree(ab!.effect)).toBeNull();
    expect(def.subroutines).toHaveLength(3);
    for (const sub of def.subroutines ?? []) {
      expect(validateEffectTree(sub.effect)).toBeNull();
    }
  });
});
