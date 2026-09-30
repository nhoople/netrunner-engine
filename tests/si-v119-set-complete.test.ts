/**
 * Salsette Island (si) set-complete — floor v1.118.0 → v1.119.0.
 * 19/19 SI clears (no reprints). CR pin v26.03.
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

const SI_CLEARS = [
  "making-an-entrance",
  "salsette-slums",
  "exclusive-party",
  "vamadeva",
  "brahman",
  "patron",
  "sports-hopper",
  "bazaar",
  "personality-profiles",
  "jeeves-model-bioroids",
  "raman-rai",
  "upayoga",
  "aryabhata-tech",
  "salems-hospitality",
  "executive-search-firm",
  "indian-union-stock-exchange",
  "cobra",
  "localized-product-line",
  "mumbad-virtual-tour",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.133.0");
});

describe("Salsette Island v1.119.0 set-complete", () => {
  it("declares salsette-island supported after democracy-and-dogma with 19 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["salsette-island"].status).toBe("supported");
    expect(pool.waves["salsette-island"].cards).toHaveLength(19);
    expect(pool.corpusOrder[31]).toBe("democracy-and-dogma");
    expect(pool.corpusOrder[32]).toBe("salsette-island");
    expect(pool.corpusOrder[33]).toBe("the-liberated-mind");
    expect(pool.corpusOrder[34]).toBe("fear-the-masses");
    expect(pool.corpusOrder[43]).toBe("terminal-directive");
    expect(pool.corpusOrder[44]).toBe("earths-scion");
    expect(pool.corpusOrder[45]).toBe("blood-and-water");
    expect(pool.corpusOrder[46]).toBe("free-mars");
    expect(pool.corpusOrder[47]).toBe("reign-and-reverie");
  });

  it("clears all 19 SI cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of SI_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("salsette-island");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onRez) expect(validateEffectTree(def.onRez)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
    }
  });

  it("wires key SI fields", () => {
    loadCardCatalog(true);
    expect(getCardDef("making-an-entrance").playRequiresFirstClick).toBe(true);
    expect(
      getCardDef("salsette-slums").accessPayTrashCostRemoveFromGameOncePerTurn,
    ).toBe(true);
    expect(getCardDef("exclusive-party").deckLimit).toBe(6);
    expect(
      getCardDef("vamadeva").breaker?.breakRequiresIceExactSubroutineCount,
    ).toBe(1);
    expect(
      getCardDef("brahman")
        .addInstalledNonVirusProgramToStackTopOnEncounterEndIfBroke,
    ).toBe(true);
    expect(getCardDef("patron").patronChooseServerDrawInsteadOfBreach).toBe(2);
    expect(getCardDef("sports-hopper").link).toBe(1);
    expect(
      getCardDef("bazaar").onInstallHardwareFromGripMayInstallAnotherCopy,
    ).toBe(true);
    expect(
      getCardDef("personality-profiles")
        .onRunnerSearchStackOrInstallFromHeapTrashRandomFromGrip,
    ).toBe(true);
    expect(
      getCardDef("jeeves-model-bioroids")
        .gainClickFirstTimeSpendClicksGteOnSameActionEachTurn,
    ).toBe(3);
    expect(
      getCardDef("raman-rai")
        .onDrawMayLoseClickRevealSwapArchivesSameTypeOncePerTurn,
    ).toBe(true);
    expect(
      getCardDef("aryabhata-tech").onAnySuccessfulTraceGainAndRunnerLose,
    ).toEqual({ gain: 1, lose: 1 });
    expect(getCardDef("salems-hospitality").id).toBe("salems-hospitality");
    expect(
      getCardDef("indian-union-stock-exchange")
        .onRezOrPlayOutOfFactionGainCredits,
    ).toBe(1);
    expect(getCardDef("mumbad-virtual-tour").zeroInfluenceIfAssetsInDeckGte).toBe(
      7,
    );
    expect(
      getCardDef("mumbad-virtual-tour").mustTrashWhenAccessedWhileInstalled,
    ).toBe(true);
  });
});
