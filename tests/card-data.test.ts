import { describe, expect, it, beforeAll } from "vitest";
import {
  assertPinnedTag,
  crDataPresent,
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
  assertPinnedTag("v26.03");
});

describe("card data model (Phase 2)", () => {
  it("loads catalog from data/cards and validates IR", () => {
    const catalog = loadCardCatalog(true);
    expect(catalog.size).toBeGreaterThanOrEqual(14);
    expect(catalog.has("static-wall")).toBe(true);
    expect(catalog.has("hedge-fund")).toBe(true);
    expect(catalog.has("data-raven")).toBe(true);
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

  it("instantiates Crowbar from data with pump ability", () => {
    const card = instantiateCard("crowbar", "c1", "runner:grip");
    expect(card.defId).toBe("crowbar");
    expect(card.breaker?.breaksSubtype).toBe("barrier");
    expect(card.paidAbilities?.[0]?.id).toBe("crowbar-pump");
  });

  it("getCardDef throws on unknown id", () => {
    expect(() => getCardDef("no-such-card")).toThrow(/Unknown card def/);
  });
});

describe("card corpus wave1 (Phase 3)", () => {
  it("declares supported pool covering stubs + wave1", () => {
    const pool = loadCardPool(true);
    expect(pool.waves.stubs.status).toBe("supported");
    expect(pool.waves.wave1.status).toBe("supported");
    const ids = supportedCardIds();
    expect(ids).toContain("crowbar");
    expect(ids).toContain("hedge-fund");
    expect(ids).toContain("data-raven");
    expect(ids).toContain("priority-requisition");
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

  it("marks unsupported clauses explicitly on partial cards", () => {
    const raven = getCardDef("data-raven");
    expect(raven.unsupported?.length).toBeGreaterThan(0);
    const pr = getCardDef("priority-requisition");
    expect(pr.unsupported?.some((u) => /rez/i.test(u))).toBe(true);
    const aesop = getCardDef("aesops-pawnshop");
    expect(aesop.unsupported?.length).toBeGreaterThan(0);
  });

  it("Hedge Fund onPlay is gain 9 credits", () => {
    const def = getCardDef("hedge-fund");
    expect(def.playCost).toBe(5);
    expect(def.onPlay).toEqual(fx.gainCredits("corp", 9));
  });
});
