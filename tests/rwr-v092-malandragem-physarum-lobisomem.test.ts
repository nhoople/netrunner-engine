/**
 * RWR v0.92: Malandragem / Physarum / Lobisomem / Trick Shot / Privileged Access.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
  loadCardCatalog,
  validateEffectTree,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.116.0");
});

describe("RWR v0.92 Malandragem / Physarum / Lobisomem / Trick Shot / Privileged Access", () => {
  it("loads five clear cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of [
      "malandragem",
      "physarum-entangler",
      "lobisomem",
      "trick-shot",
      "privileged-access",
    ]) {
      expect(catalog.get(id)!.unsupported ?? [], id).toEqual([]);
    }
  });

  it("Malandragem RFGs when empty and bypasses weak ice", () => {
    const def = getCardDef("malandragem");
    expect(def.powerCountersOnInstall).toBe(2);
    expect(def.rfgWhenPowerEmpty).toBe(true);
    expect(def.paidAbilities?.[0]?.requireEncounterStrengthLte).toBe(3);
  });

  it("Physarum installs on ice and bypasses non-barriers", () => {
    const def = getCardDef("physarum-entangler");
    expect(def.installOnIce).toBe(true);
    expect(def.trashOnVirusPurge).toBe(true);
    expect(def.paidAbilities?.[0]?.forbidEncounterSubtype).toBe("barrier");
    expect(def.paidAbilities?.[0]?.cost?.creditsPerEncounterSubroutine).toBe(1);
  });

  it("Lobisomem is a dual code gate / barrier breaker", () => {
    const def = getCardDef("lobisomem");
    expect(def.breaker?.breaksSubtype).toBe("code gate");
    expect(validateEffectTree(def.onFullyBreak!)).toBeNull();
    expect(def.paidAbilities?.length).toBeGreaterThanOrEqual(3);
  });

  it("Trick Shot places event credits and may run a remote", () => {
    const def = getCardDef("trick-shot");
    expect(def.runEvent?.placeEventCredits).toBe(4);
    expect(def.runEvent?.bonusAccess).toBe(1);
    expect(validateEffectTree(def.runEvent!.onSuccessfulRun!)).toBeNull();
    expect(validateEffectTree(def.runEvent!.onRunEnd!)).toBeNull();
  });

  it("Privileged Access requires untagged and installs from heap", () => {
    const def = getCardDef("privileged-access");
    expect(def.playRequiresUntagged).toBe(true);
    expect(def.runEvent?.skipBreach).toBe(true);
    expect(validateEffectTree(def.runEvent!.onSuccessfulRun!)).toBeNull();
  });
});
