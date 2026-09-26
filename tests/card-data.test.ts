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
  assertCardsPinnedTag("v0.5.0");
});

describe("card data model", () => {
  it("loads catalog from vendor/cards-data and validates IR", () => {
    const catalog = loadCardCatalog(true);
    expect(catalog.size).toBe(77 + 82 + 65);
    expect(catalog.has("ice-wall")).toBe(true);
    expect(catalog.has("hedge-fund")).toBe(true);
    expect(catalog.has("marjanah")).toBe(true);
    expect(catalog.has("sure-gamble")).toBe(true);
    expect(catalog.has("gordian-blade")).toBe(true);
    expect(catalog.has("maskirovka")).toBe(true);
    expect(catalog.has("crowbar")).toBe(false);
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
  it("declares pool with Midnight Sun in-progress after Gateway/SU21", () => {
    const pool = loadCardPool(true);
    expect(pool.corpusOrder).toEqual([
      "system-gateway",
      "system-update-2021",
      "midnight-sun",
    ]);
    expect(pool.waves.stubs).toBeUndefined();
    expect(pool.waves.wave1).toBeUndefined();
    expect(pool.waves.wave2).toBeUndefined();
    expect(pool.waves["system-gateway"].status).toBe("supported");
    expect(pool.waves["system-update-2021"].status).toBe("supported");
    expect(pool.waves["midnight-sun"].status).toBe("in-progress");
    const ids = supportedCardIds();
    expect(ids).toContain("marjanah");
    expect(ids).toContain("hedge-fund");
    expect(ids).toContain("ice-wall");
    expect(ids).toContain("sure-gamble");
    expect(ids).not.toContain("crowbar");
    expect(ids).not.toContain("data-raven");
    // in-progress wave is not in supportedCardIds
    expect(ids).not.toContain("maskirovka");
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
