/**
 * First Contact (fc) set-complete — floor v1.103.0 → v1.105.0.
 * 18/18 FC-only clears. CR pin v26.03.
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

const FC_CLEARS = [
  "iq",
  "elizas-toybox",
  "kitsune",
  "port-anson-grid",
  "the-news-now-hour",
  "manhunt",
  "wendigo",
  "chronos-project",
  "shattered-remains",
  "lancelot",
  "blackat",
  "duggars",
  "box-e",
  "the-supplier",
  "refractor",
  "order-of-sol",
  "hades-shard",
  "rachel-beckman",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.106.0");
});

describe("First Contact v1.105.0 set-complete", () => {
  it("declares first-contact supported after the-spaces-between with 18 cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["first-contact"].status).toBe("supported");
    expect(pool.waves["first-contact"].cards).toHaveLength(18);
    expect(pool.corpusOrder[16]).toBe("the-spaces-between");
    expect(pool.corpusOrder[17]).toBe("first-contact");
    expect(pool.corpusOrder[18]).toBe("up-and-over");
    expect(pool.corpusOrder[19]).toBe("all-that-remains");
    expect(pool.corpusOrder[20]).toBe("reign-and-reverie");
  });

  it("clears all 18 FC cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of FC_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("first-contact");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onEncounter) expect(validateEffectTree(def.onEncounter)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onAccess) expect(validateEffectTree(def.onAccess)).toBeNull();
      if (def.onFirstSuccessfulRunThisTurn) {
        expect(validateEffectTree(def.onFirstSuccessfulRunThisTurn)).toBeNull();
      }
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onFirstRunnerCreditPoolEmptyThisTurn) {
        expect(validateEffectTree(def.onFirstRunnerCreditPoolEmptyThisTurn)).toBeNull();
      }
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
    }
  });

  it("wires key FC fields", () => {
    loadCardCatalog(true);
    expect(getCardDef("iq").strengthPerCorpCardInHq).toBe(1);
    expect(getCardDef("rachel-beckman").allottedClicksBonus).toBe(1);
    expect(getCardDef("box-e").muBonus).toBe(2);
    expect(getCardDef("refractor").paidAbilitiesUseStealthCreditsOnly).toBe(true);
    expect(getCardDef("hades-shard").onGripArchivesSuccessInstallSelfIgnoringCosts).toBe(
      true,
    );
  });
});
