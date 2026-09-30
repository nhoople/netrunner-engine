/**
 * Stalwart (st) set-complete — floor v1.95.0 → v1.97.0.
 * 17/17 ST-only clears; 3 reprints absorbed. CR pin v26.03.
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

const ST_CLEARS = [
  "bishop",
  "scheherazade",
  "hard-at-work",
  "recon",
  "copycat",
  "leviathan",
  "eureka",
  "record-reconstructor",
  "wotan",
  "hellion-alpha-test",
  "clone-retirement",
  "shipment-from-sansan",
  "muckraker",
  "the-cleaners",
  "off-the-grid",
  "profiteering",
  "restructure",
] as const;

const ST_REPRINTS = [
  "prepaid-voicepad",
  "swordsman",
  "elizabeth-mills",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.131.0");
});

describe("Stalwart v1.97.0 set-complete", () => {
  it("declares stalwart supported after opening-moves with 20 cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["stalwart"].status).toBe("supported");
    expect(pool.waves["stalwart"].cards).toHaveLength(20);
    expect(pool.corpusOrder[8]).toBe("opening-moves");
    expect(pool.corpusOrder[9]).toBe("stalwart");
    expect(pool.corpusOrder[10]).toBe("mala-tempora");
    expect(pool.corpusOrder[11]).toBe("true-colors");
    expect(pool.corpusOrder[12]).toBe("fear-and-loathing");
    expect(pool.corpusOrder[13]).toBe("double-time");
  });

  it("clears all 17 ST-only cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of ST_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("stalwart");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onRez) expect(validateEffectTree(def.onRez)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onSuccessfulRun) {
        expect(validateEffectTree(def.onSuccessfulRun)).toBeNull();
      }
      if (def.onPassRezzedIce) {
        expect(validateEffectTree(def.onPassRezzedIce)).toBeNull();
      }
      if (def.onSteal) expect(validateEffectTree(def.onSteal)).toBeNull();
      if (def.runEvent) expect(def.runEvent.servers).toBeTruthy();
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
    }
  });

  it("absorbs 3 reprints from earlier waves", () => {
    for (const id of ST_REPRINTS) {
      const def = getCardDef(id);
      expect(def.wave).not.toBe("stalwart");
      expect(def.unsupported ?? []).toEqual([]);
    }
  });

  it("maps key ST fields and primitives", () => {
    expect(getCardDef("bishop").hostStrengthModifier).toBe(-2);
    expect(getCardDef("recon").runEvent?.mayJackOutOnFirstIceEncounter).toBe(
      true,
    );
    expect(getCardDef("the-cleaners").whileScoredMeatDamageIncrease).toBe(1);
    expect(getCardDef("off-the-grid").blocksRunnerRunsOnHostServer).toBe(true);
    expect(getCardDef("hellion-alpha-test").playRequiresRunnerInstalledResourceLastTurn).toBe(
      true,
    );
    expect(getCardDef("leviathan").breaker?.breakMaxSubs).toBe(3);
  });
});
