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
  assertCardsPinnedTag("v1.142.1");
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
    expect(pool.corpusOrder[49]).toBe("sovereign-sight");
    expect(pool.corpusOrder[50]).toBe("down-the-white-nile");
    expect(pool.corpusOrder[51]).toBe("council-of-the-crest");
    expect(pool.corpusOrder[52]).toBe("the-devil-and-the-dragon");
    expect(pool.corpusOrder[53]).toBe("whispers-in-nalubaale");
    expect(pool.corpusOrder[54]).toBe("kampala-ascendent");
    expect(pool.corpusOrder[55]).toBe("reign-and-reverie");
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
