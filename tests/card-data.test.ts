import { describe, expect, it, beforeAll } from "vitest";
import {
  assertPinnedTag,
  assertCardsPinnedTag,
  crDataPresent,
  cardsDataPresent,
  getCardDef,
  instantiateCard,
  loadCardCatalog,
  loadCardPool,
  supportedCardIds,
  validateEffectTree,
  fx,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.121.0");
});

describe("card data model", () => {
  it("loads catalog from vendor/cards-data and validates IR", () => {
    const catalog = loadCardCatalog(true);
    // Core +49; WLA +14; TA +15; CE +13; ASIS +15; HS +15; FP +13; RaR +56; SC19 +84; … (reprints absorbed, not double-counted).
    const corpus = 49 + 14 + 15 + 13 + 15 + 15 + 13 + 46 + 16 + 17 + 18 + 18 + 15 + 19 + 50 + 17 + 20 + 18 + 18 + 17 + 19 + 55 + 19 + 18 + 56 + 84 + 65 + 65 + 77 + 82 + 65 + 63 + 65 + 65 + 82 + 66 + 18 + 17 + 19 + 18 + 54 + 18 + 19 + 19 + 19 + 18 + 18 /*ftm*/;
    const fixtures = catalog.has("plascrete-carapace") ? 1 : 0;
    expect(catalog.size).toBe(corpus + fixtures);
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
  it("declares pool with Midnight Sun supported after Gateway/SU21", () => {
    const pool = loadCardPool(true);
    expect(pool.corpusOrder).toEqual([
      "core",
      "what-lies-ahead",
      "trace-amount",
      "cyber-exodus",
      "a-study-in-static",
      "humanitys-shadow",
      "future-proof",
      "creation-and-control",
      "opening-moves",
      "stalwart",
      "mala-tempora",
      "true-colors",
      "fear-and-loathing",
      "double-time",
      "honor-and-profit",
      "upstalk",
      "the-spaces-between",
      "first-contact",
      "up-and-over",
      "all-that-remains",
      "the-source",
      "order-and-chaos",
      "the-valley",
      "breaker-bay",
      "chrome-city",
      "the-underway",
      "old-hollywood",
      "the-universe-of-tomorrow",
      "data-and-destiny",
      "kala-ghoda",
      "business-first",
      "democracy-and-dogma",
      "salsette-island",
      "the-liberated-mind",
      "fear-the-masses",
      "reign-and-reverie",
      "system-core-2019",
      "downfall",
      "uprising",
      "system-gateway",
      "system-update-2021",
      "midnight-sun",
      "parhelion",
      "the-automata-initiative",
      "rebellion-without-rehearsal",
      "elevation",
      "vantage-point",
    ]);
    expect(pool.waves.stubs).toBeUndefined();
    expect(pool.waves.wave1).toBeUndefined();
    expect(pool.waves.wave2).toBeUndefined();
    expect(pool.waves["uprising"].status).toBe("supported");
    expect(pool.waves["uprising"].cards).toHaveLength(65);
    expect(pool.waves["system-gateway"].status).toBe("supported");
    expect(pool.waves["system-update-2021"].status).toBe("supported");
    expect(pool.waves["midnight-sun"].status).toBe("supported");
    expect(pool.waves["parhelion"].status).toBe("supported");
    expect(pool.waves["the-automata-initiative"].status).toBe("supported");
    expect(pool.waves["rebellion-without-rehearsal"].status).toBe("supported");
    expect(pool.waves["elevation"].status).toBe("supported");
    expect(pool.waves["vantage-point"].status).toBe("supported");
    const ids = supportedCardIds();
    expect(ids).toContain("marjanah");
    expect(ids).toContain("hedge-fund");
    expect(ids).toContain("ice-wall");
    expect(ids).toContain("sure-gamble");
    expect(ids).toContain("crowbar");
    // SC19 L-slice clear — now in supportedCardIds
    expect(ids).toContain("data-raven");
    // uprising is pool-supported (v1.46.0 set-complete); clears are in supportedCardIds
    expect(ids).toContain("daily-casts");
    expect(ids).toContain("makler");
    expect(ids).toContain("prana-condenser");
    expect(ids).toContain("gamenet-where-dreams-are-real");
    // supported MS wave is included in supportedCardIds
    expect(ids).toContain("maskirovka");
    expect(ids).toContain("deep-dive");
    expect(ids).toContain("matryoshka");
    expect(ids).toContain("hush");
    expect(ids).toContain("cupellation");
    expect(ids).toContain("heliamphora");
  });

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
