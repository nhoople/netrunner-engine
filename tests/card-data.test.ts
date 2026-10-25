import { describe, expect, it, beforeAll } from "vitest";
import {
  assertPinnedTag,
  assertCardsPinnedTag,
  crDataPresent,
  cardsDataPresent,
  getCardDef,
  instantiateCard,
  loadCardCatalog,
  supportedCardIds,
  validateEffectTree,
  fx,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.13");
});

describe("card data model", () => {
  it("loads catalog from vendor/cards-data and validates IR", () => {
    const catalog = loadCardCatalog(true);
    // Core +49; WLA +14; TA +15; CE +13; ASIS +15; HS +15; FP +13; RaR +56; SC19 +84; … (reprints absorbed, not double-counted).
    const corpus = 49 + 15 /*wla unique titles incl Plascrete (corpus card, not fixtures wave)*/ + 15 + 13 + 15 + 15 + 13 + 46 + 16 + 17 + 18 + 18 + 15 + 19 + 50 + 17 + 20 + 18 + 18 + 17 + 19 + 55 + 19 + 18 + 56 + 84 + 65 + 65 + 77 + 82 + 65 + 63 + 65 + 65 + 82 + 66 + 18 + 17 + 19 + 18 + 54 + 18 + 19 + 19 + 19 + 18 + 18 /*ftm*/ + 20 /*23s*/ + 20 /*bm*/ + 20 /*es*/ + 18 /*in*/ + 20 /*ml*/ + 20 /*qu*/ + 20 /*dc*/ + 20 /*so*/ + 43 /*td*/ + 20 /*eas*/ + 20 /*baw*/ + 20 /*fm*/ + 20 /*cd*/ + 20 /*ss*/ + 20 /*dtwn*/ + 20 /*cotc*/ + 20 /*tdatd*/ + 20 /*win*/ + 20 /*ka*/ + 8 /*mo*/;
    expect(catalog.size).toBe(corpus);
    expect(catalog.has("ice-wall")).toBe(true);
    expect(catalog.has("hedge-fund")).toBe(true);
    expect(catalog.has("marjanah")).toBe(true);
    expect(catalog.has("sure-gamble")).toBe(true);
    expect(catalog.has("gordian-blade")).toBe(true);
    expect(catalog.has("maskirovka")).toBe(true);
    expect(catalog.has("daily-casts")).toBe(true);
    expect(catalog.has("makler")).toBe(true);
    expect(catalog.has("crowbar")).toBe(true);
    expect(catalog.has("static-wall")).toBe(false);
  });

  it("fail-closed on unknown IR primitive", () => {
    const err = validateEffectTree({
      op: "do",
      action: { kind: "unknown_magic" },
    });
    expect(err).toMatch(/unknown primitive/);
  });

  it("fail-closed on unknown effect op", () => {
    const err = validateEffectTree({ op: "explode", effects: [] });
    expect(err).toMatch(/unknown op/);
  });

  it("instantiates Marjanah from data with pump ability", () => {
    const card = instantiateCard("marjanah", "c1", "runner:grip");
    expect(card.defId).toBe("marjanah");
    expect(card.breaker?.breaksSubtype).toBe("barrier");
    expect(card.paidAbilities?.[0]?.id).toBe("marjanah-pump");
  });

  it("getCardDef throws on unknown id", () => {
    expect(() => getCardDef("no-such-card")).toThrow(/Unknown card def/);
  });
});

describe("card corpus Gateway + SU21 + Midnight Sun", () => {

  it("every pool card exists in catalog with valid IR", () => {
    const catalog = loadCardCatalog();
    for (const id of supportedCardIds()) {
      expect(catalog.has(id), id).toBe(true);
      const def = catalog.get(id)!;
      if (def.onPlay) {
        expect(validateEffectTree(def.onPlay)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        expect(validateEffectTree(sub.effect)).toBeNull();
      }
    }
  });

  it("Hedge Fund / PAD / Aesop's stay fully supported", () => {
    const pad = getCardDef("pad-campaign");
    expect(pad.unsupported ?? []).toEqual([]);
    expect(pad.onTurnBegin).toBeDefined();
    const aesop = getCardDef("aesops-pawnshop");
    expect(aesop.unsupported ?? []).toEqual([]);
    expect(aesop.onTurnBegin).toBeDefined();
  });

  it("Hedge Fund onPlay is gain 9 credits", () => {
    const def = getCardDef("hedge-fund");
    expect(def.playCost).toBe(5);
    expect(def.onPlay).toEqual(fx.gainCredits("corp", 9));
  });
});
