/**
 * True Colors (tc) set-complete — floor v1.97.0 → v1.98.0.
 * 18/18 TC-only clears; 2 reprints absorbed. CR pin v26.03.
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

const TC_CLEARS = [
  "keyhole",
  "activist-support",
  "lawyer-up",
  "leverage",
  "garrote",
  "llds-processor",
  "sharpshooter",
  "capstone",
  "starlight-crusade-funding",
  "rex-campaign",
  "fenris",
  "panic-button",
  "shock",
  "tgtbt",
  "sweeps-week",
  "rsvp",
  "curtain-wall",
  "veterans-program",
] as const;

const TC_REPRINTS = ["tsurugi", "punitive-counterstrike"] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.129.0");
});

describe("True Colors v1.98.0 set-complete", () => {
  it("declares true-colors supported after mala-tempora with 20 cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["true-colors"].status).toBe("supported");
    expect(pool.waves["true-colors"].cards).toHaveLength(20);
    expect(pool.corpusOrder[10]).toBe("mala-tempora");
    expect(pool.corpusOrder[11]).toBe("true-colors");
    expect(pool.corpusOrder[12]).toBe("fear-and-loathing");
    expect(pool.corpusOrder[13]).toBe("double-time");
  });

  it("clears all 18 TC-only cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of TC_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("true-colors");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onRez) expect(validateEffectTree(def.onRez)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onAccess) expect(validateEffectTree(def.onAccess)).toBeNull();
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
    }
  });

  it("absorbs 2 reprints from earlier waves", () => {
    for (const id of TC_REPRINTS) {
      const def = getCardDef(id);
      expect(def.wave).not.toBe("true-colors");
      expect(def.unsupported ?? []).toEqual([]);
    }
  });

  it("maps key TC fields and primitives", () => {
    expect(getCardDef("garrote").breaker?.breaksSubtype).toBe("sentry");
    expect(getCardDef("llds-processor").nonAiIcebreakerInstallStrengthBonusThisTurn).toBe(
      1,
    );
    expect(getCardDef("curtain-wall").strengthBonusIfOutermostOnServer).toBe(4);
    expect(getCardDef("leverage").playRequiresSuccessfulHqRunThisTurn).toBe(true);
  });
});
