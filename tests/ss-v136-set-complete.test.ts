/**
 * Sovereign Sight (ss) set-complete — floor v1.135.0 → v1.136.0.
 * 20/20 Kitara #1 clears (no reprints). CR pin v26.03.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
  loadCardCatalog,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";

const CLEARS = [
  "by-any-means",
  "yusuf",
  "zamba",
  "puffer",
  "lewi-guilherme",
  "cyberdelia",
  "upya",
  "assimilator",
  "asa-group-security-through-vigilance",
  "ikawah-project",
  "najja-1-0",
  "gene-splicer",
  "mganga",
  "genotyping",
  "echo-chamber",
  "self-growth-program",
  "calibration-testing",
  "urban-renewal",
  "wake-up-call",
  "reconstruction-contract",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.137.0");
});

describe("Sovereign Sight v1.136.0 set-complete", () => {
  it("declares sovereign-sight supported after revised-core with 20 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["sovereign-sight"].status).toBe("supported");
    expect(pool.waves["sovereign-sight"].cards).toHaveLength(20);
    expect(pool.corpusOrder[48]).toBe("revised-core");
    expect(pool.corpusOrder[49]).toBe("sovereign-sight");
    expect(pool.corpusOrder[50]).toBe("down-the-white-nile");
    expect(pool.corpusOrder[51]).toBe("reign-and-reverie");
  });

  it("clears all 20 new ss cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("sovereign-sight");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onRez) expect(validateEffectTree(def.onRez)).toBeNull();
      if (def.onInstall) expect(validateEffectTree(def.onInstall)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onSuccessfulRun) {
        expect(validateEffectTree(def.onSuccessfulRun)).toBeNull();
      }
      if (def.onSuccessfulRunOnRd) {
        expect(validateEffectTree(def.onSuccessfulRunOnRd)).toBeNull();
      }
      if (def.onEncounter) expect(validateEffectTree(def.onEncounter)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onAccess) expect(validateEffectTree(def.onAccess)).toBeNull();
      if (def.onFirstCorpCardInstallEachTurn) {
        expect(validateEffectTree(def.onFirstCorpCardInstallEachTurn)).toBeNull();
      }
      if (def.onPowerCountersEmpty) {
        expect(validateEffectTree(def.onPowerCountersEmpty)).toBeNull();
      }
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
    }
  });

  it("wires key ss fields (NRDB text)", () => {
    loadCardCatalog(true);
    expect(getCardDef("by-any-means").playRequiresFirstClick).toBe(true);
    expect(getCardDef("yusuf").breaker?.breaksSubtype).toBe("barrier");
    expect(getCardDef("yusuf").breaker?.breakViaPaidAbilityOnly).toBe(true);
    expect(getCardDef("zamba").muBonus).toBe(2);
    expect(getCardDef("zamba").mayGainCreditsOnCorpCardExposed).toBe(1);
    expect(getCardDef("puffer").strengthPerPowerCounter).toBe(true);
    expect(getCardDef("puffer").memoryCostPerPowerCounter).toBe(1);
    expect(getCardDef("lewi-guilherme").corpHandSizeBonusWhileInstalled).toBe(-1);
    expect(getCardDef("cyberdelia").gainCreditsOnFirstFullyBreakEachTurn).toBe(1);
    expect(getCardDef("upya").onSuccessfulRunOnRd).toBeTruthy();
    expect(getCardDef("asa-group-security-through-vigilance").onFirstCorpCardInstallEachTurn).toBeTruthy();
    expect(getCardDef("ikawah-project").stealAdditionalClicks).toBe(1);
    expect(getCardDef("ikawah-project").stealAdditionalCredits).toBe(2);
    expect(getCardDef("najja-1-0").subtypes).toContain("bioroid");
    expect(getCardDef("gene-splicer").canAdvance).toBe(true);
    expect(getCardDef("genotyping").rfgInsteadOfTrashing).toBe(true);
    expect(getCardDef("self-growth-program").playRequiresTagged).toBe(true);
    expect(getCardDef("calibration-testing").remoteOnly).toBe(true);
    expect(getCardDef("urban-renewal").powerCountersOnRez).toBe(3);
    expect(getCardDef("urban-renewal").trashWhenPowerEmpty).toBe(true);
    expect(
      getCardDef("wake-up-call").playRequiresRunnerTrashedCorpCardLastTurn,
    ).toBe(true);
    expect(
      getCardDef("wake-up-call")
        .playRequiresRunnerHasInstalledHardwareOrNonVirtualResource,
    ).toBe(true);
    expect(getCardDef("reconstruction-contract").placeAdvancementOnSufferMeatDamage).toBe(
      true,
    );
  });
});
