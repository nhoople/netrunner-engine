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
  assertCardsPinnedTag("v1.135.0");
});

describe("Up and Over v1.105.0 set-complete", () => {
  it("declares up-and-over supported after first-contact with 18 clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["up-and-over"].status).toBe("supported");
    expect(pool.waves["up-and-over"].cards).toHaveLength(20);
    expect(pool.corpusOrder[17]).toBe("first-contact");
    expect(pool.corpusOrder[18]).toBe("up-and-over");
    expect(pool.corpusOrder[19]).toBe("all-that-remains");
    expect(pool.corpusOrder[20]).toBe("the-source");
    expect(pool.corpusOrder[21]).toBe("order-and-chaos");
    expect(pool.corpusOrder[22]).toBe("the-valley");
    expect(pool.corpusOrder[23]).toBe("breaker-bay");
    expect(pool.corpusOrder[24]).toBe("chrome-city");
    expect(pool.corpusOrder[25]).toBe("the-underway");
    expect(pool.corpusOrder[26]).toBe("old-hollywood");
    expect(pool.corpusOrder[28]).toBe("data-and-destiny");
    expect(pool.corpusOrder[29]).toBe("kala-ghoda");
    expect(pool.corpusOrder[30]).toBe("business-first");
    expect(pool.corpusOrder[31]).toBe("democracy-and-dogma");
    expect(pool.corpusOrder[32]).toBe("salsette-island");
    expect(pool.corpusOrder[33]).toBe("the-liberated-mind");
    expect(pool.corpusOrder[34]).toBe("fear-the-masses");
    expect(pool.corpusOrder[43]).toBe("terminal-directive");
    expect(pool.corpusOrder[44]).toBe("earths-scion");
    expect(pool.corpusOrder[45]).toBe("blood-and-water");
    expect(pool.corpusOrder[46]).toBe("free-mars");
    expect(pool.corpusOrder[47]).toBe("crimson-dust");
    expect(pool.corpusOrder[48]).toBe("revised-core");
    expect(pool.corpusOrder[49]).toBe("reign-and-reverie");
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
