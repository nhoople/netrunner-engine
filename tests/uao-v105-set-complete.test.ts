/**
 * Up and Over (uao) set-complete — floor v1.105.0 → v1.105.0.
 * 18/18 UAO-only clears. CR pin v26.03.
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

const UAO_CLEARS = [
  "architect",
  "peak-efficiency",
  "labyrinthine-servers",
  "ashigaru",
  "mamba",
  "universal-connectivity-fee",
  "changeling",
  "reuse",
  "hades-fragment",
  "docklands-crackdown",
  "inject",
  "origami",
  "fester",
  "autoscripter",
  "switchblade",
  "trade-in",
  "astrolabe",
  "angel-arena",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.105.0");
});

describe("Up and Over v1.105.0 set-complete", () => {
  it("declares up-and-over supported after first-contact with 18 clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["up-and-over"].status).toBe("supported");
    expect(pool.waves["up-and-over"].cards).toHaveLength(20);
    expect(pool.corpusOrder[17]).toBe("first-contact");
    expect(pool.corpusOrder[18]).toBe("up-and-over");
    expect(pool.corpusOrder[19]).toBe("reign-and-reverie");
  });

  it("clears all 18 UAO cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of UAO_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("up-and-over");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onEncounter) expect(validateEffectTree(def.onEncounter)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onInstall) expect(validateEffectTree(def.onInstall)).toBeNull();
      if (def.onVirusPurge) expect(validateEffectTree(def.onVirusPurge)).toBeNull();
      if (def.playAdditionalCost) {
        expect(validateEffectTree(def.playAdditionalCost)).toBeNull();
      }
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
    }
  });

  it("wires key UAO fields", () => {
    loadCardCatalog(true);
    expect(getCardDef("architect").playersCannotTrashThisIce).toBe(true);
    expect(getCardDef("ashigaru").dynamicEtrSubroutineCountFromCorpHandSize).toBe(
      true,
    );
    expect(getCardDef("switchblade").paidAbilitiesUseStealthCreditsOnly).toBe(
      true,
    );
    expect(getCardDef("origami").handSizeBonusPerInstalledCopyWithSameDefId).toBe(
      1,
    );
    expect(getCardDef("docklands-crackdown").runnerFirstInstallCostIncreasePerPowerCounterOnThis).toBe(
      1,
    );
  });
});
