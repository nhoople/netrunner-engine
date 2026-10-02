/**
 * Crimson Dust (cd) set-complete — floor v1.133.0 → v1.135.0.
 * 20/20 Red Sand #6 clears (no reprints). CR pin v26.03.
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
  "mining-accident",
  "respirocytes",
  "salvaged-vanadis-armory",
  "aumakua",
  "caldera",
  "dianas-hunt",
  "reshape",
  "dummy-box",
  "corporate-defector",
  "cfc-excavation-contract",
  "mca-austerity-policy",
  "restore",
  "breached-dome",
  "sand-storm",
  "ar-enhanced-security",
  "rolling-brownout",
  "threat-level-alpha",
  "priority-construction",
  "fractal-threat-matrix",
  "conundrum",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.143.0");
});

describe("Crimson Dust v1.135.0 set-complete", () => {
  it("declares crimson-dust supported after free-mars with 20 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["crimson-dust"].status).toBe("supported");
    expect(pool.waves["crimson-dust"].cards).toHaveLength(20);
    expect(pool.corpusOrder[46]).toBe("free-mars");
    expect(pool.corpusOrder[47]).toBe("crimson-dust");
    expect(pool.corpusOrder[48]).toBe("revised-core");
    expect(pool.corpusOrder[49]).toBe("sovereign-sight");
    expect(pool.corpusOrder[50]).toBe("down-the-white-nile");
    expect(pool.corpusOrder[51]).toBe("council-of-the-crest");
    expect(pool.corpusOrder[52]).toBe("the-devil-and-the-dragon");
    expect(pool.corpusOrder[53]).toBe("whispers-in-nalubaale");
    expect(pool.corpusOrder[54]).toBe("kampala-ascendent");
    expect(pool.corpusOrder[55]).toBe("reign-and-reverie");
  });

  it("clears all 20 new cd cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("crimson-dust");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onRez) expect(validateEffectTree(def.onRez)).toBeNull();
      if (def.onInstall) expect(validateEffectTree(def.onInstall)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onSuccessfulRun) {
        expect(validateEffectTree(def.onSuccessfulRun)).toBeNull();
      }
      if (def.onEncounter) expect(validateEffectTree(def.onEncounter)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onAccess) expect(validateEffectTree(def.onAccess)).toBeNull();
      if (def.onFirstEmptyGripEachTurn) {
        expect(validateEffectTree(def.onFirstEmptyGripEachTurn)).toBeNull();
      }
      if (def.onFirstCorpCardTrashEachTurn) {
        expect(validateEffectTree(def.onFirstCorpCardTrashEachTurn)).toBeNull();
      }
      if (def.onPowerCountersGte?.effect) {
        expect(validateEffectTree(def.onPowerCountersGte.effect)).toBeNull();
      }
      if (def.runEvent?.onRunEnd) {
        expect(validateEffectTree(def.runEvent.onRunEnd)).toBeNull();
      }
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
    }
  });

  it("wires key cd fields (NRDB text)", () => {
    loadCardCatalog(true);
    expect(getCardDef("mining-accident").playRequiresSuccessfulCentralRunThisTurn).toBe(
      true,
    );
    expect(getCardDef("respirocytes").onFirstEmptyGripEachTurn).toBeTruthy();
    expect(getCardDef("respirocytes").onPowerCountersGte?.amount).toBe(3);
    expect(getCardDef("aumakua").strengthPerVirusCounter).toBe(1);
    expect(getCardDef("aumakua").placeVirusCounterOnExposeAnyCard).toBe(true);
    expect(
      getCardDef("aumakua").placeVirusCounterOnFinishBreachIfNoStealOrTrash,
    ).toBe(true);
    expect(getCardDef("aumakua").breaker?.breaksSubtype).toBe("*");
    expect(
      getCardDef("dianas-hunt").runEvent
        ?.onEncounterMayInstallProgramFromGripIgnoringCosts,
    ).toBe(true);
    expect(
      getCardDef("dianas-hunt").runEvent?.trashProgramsInstalledThisWayOnRunEnd,
    ).toBe(true);
    expect(getCardDef("corporate-defector").revealCorpBasicActionDraws).toBe(true);
    expect(getCardDef("breached-dome").mustRevealWhenAccessedFromRd).toBe(true);
    expect(getCardDef("rolling-brownout").lingerAsCurrent).toBe(true);
    expect(getCardDef("rolling-brownout").operationAndEventPlayCostIncrease).toBe(1);
    expect(
      getCardDef("rolling-brownout").corpGainsCreditsOnFirstRunnerEventEachTurn,
    ).toBe(1);
    expect(
      getCardDef("fractal-threat-matrix")
        .trashTopOfStackWhenAllSubsBrokenOnProtectingIce,
    ).toBe(2);
    expect(getCardDef("conundrum").strengthBonusIfInstalledSubtype).toEqual({
      subtype: "ai",
      bonus: 3,
    });
    expect(getCardDef("threat-level-alpha").playAdditionalClick).toBe(true);
    expect(getCardDef("priority-construction").playAdditionalClick).toBe(true);
  });
});
