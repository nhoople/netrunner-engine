/**
 * Mala Tempora (mt) set-complete — floor v1.96.0 → v1.97.0.
 * 18/18 MT-only clears; 2 reprints absorbed. CR pin v26.03.
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

const MT_CLEARS = [
  "deep-red",
  "knight",
  "running-interference",
  "expert-schedule-analyzer",
  "grifter",
  "torch",
  "woman-in-the-red-dress",
  "raymond-flint",
  "isabel-mcguire",
  "hudson-1-0",
  "accelerated-diagnostics",
  "unorthodox-predictions",
  "city-surveillance",
  "snoop",
  "ireress",
  "power-shutdown",
  "paper-wall",
  "interns",
] as const;

const MT_REPRINTS = ["reina-roja-freedom-fighter", "sundew"] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.140.0");
});

describe("Mala Tempora v1.97.0 set-complete", () => {
  it("declares mala-tempora supported after stalwart with 20 cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["mala-tempora"].status).toBe("supported");
    expect(pool.waves["mala-tempora"].cards).toHaveLength(20);
    expect(pool.corpusOrder[9]).toBe("stalwart");
    expect(pool.corpusOrder[10]).toBe("mala-tempora");
    expect(pool.corpusOrder[11]).toBe("true-colors");
    expect(pool.corpusOrder[12]).toBe("fear-and-loathing");
    expect(pool.corpusOrder[13]).toBe("double-time");
  });

  it("clears all 18 MT-only cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of MT_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("mala-tempora");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onRunnerTurnEnd) {
        expect(validateEffectTree(def.onRunnerTurnEnd)).toBeNull();
      }
      if (def.onRunnerTurnBegin) {
        expect(validateEffectTree(def.onRunnerTurnBegin)).toBeNull();
      }
      if (def.onEachCorpBadPublicityTake) {
        expect(validateEffectTree(def.onEachCorpBadPublicityTake)).toBeNull();
      }
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onEncounter) expect(validateEffectTree(def.onEncounter)).toBeNull();
      if (def.runEvent) expect(def.runEvent.servers).toBeTruthy();
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
    }
  });

  it("absorbs 2 reprints from earlier waves", () => {
    for (const id of MT_REPRINTS) {
      const def = getCardDef(id);
      expect(def.wave).not.toBe("mala-tempora");
      expect(def.unsupported ?? []).toEqual([]);
    }
  });

  it("maps key MT fields and primitives", () => {
    expect(getCardDef("torch").breaker?.breaksSubtype).toBe("code gate");
    expect(getCardDef("running-interference").runEvent?.iceRezAdditionalCostEqualsPrintedRezCost).toBe(
      true,
    );
    expect(getCardDef("deep-red").muBonusOnlyForCaissaPrograms).toBe(true);
    expect(getCardDef("paper-wall").trashSelfWhenFullyBrokenByRunner).toBe(true);
    expect(getCardDef("power-shutdown").playRequiresRunnerMadeRunLastTurn).toBe(
      true,
    );
  });
});
