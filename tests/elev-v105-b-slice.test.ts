/**
 * Elevation v1.05.0: Bumi / Ritual / Sang Kancil / Transfer of Wealth /
 * Public Access Plaza / Scrounge.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  fx,
  getCardDef,
  loadCardPool,
} from "../src/index.js";

const CLEAR = [
  "bumi-1-0",
  "ritual",
  "sang-kancil",
  "transfer-of-wealth",
  "public-access-plaza",
  "scrounge",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.55.0");
});

describe("Elevation v1.05.0 B-slice", () => {
  it("declares pool-wide clear elevation cards (includes later slices)", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["elevation"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["elevation"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    // Floor at this slice; later pins raise the pool-wide clear count.
    expect(clear).toBeGreaterThanOrEqual(35);
  });

  it("loads six newly mapped cards clear", () => {
    for (const id of CLEAR) {
      expect(getCardDef(id).unsupported ?? [], id).toEqual([]);
    }
  });

  it("Bumi 1.0 may trash trojan on rez; dual subs", () => {
    const c = getCardDef("bumi-1-0");
    expect(c.onRez).toBeDefined();
    expect(JSON.stringify(c.onRez)).toContain("includeSubtypes");
    expect(c.subroutines).toHaveLength(2);
  });

  it("Ritual draws per clicks remaining", () => {
    expect(getCardDef("ritual").onPlay).toEqual(
      fx.drawPerClicksRemaining("runner"),
    );
  });

  it("Sang Kancil discounts pump when run event active", () => {
    const c = getCardDef("sang-kancil");
    expect(c.breaker?.breaksSubtype).toBe("code gate");
    expect(c.paidAbilityCreditDiscountIfRunEventActive).toBe(2);
  });

  it("Transfer of Wealth runs HQ and scales gains from Corp credit loss", () => {
    const c = getCardDef("transfer-of-wealth");
    expect(c.runEvent?.servers).toBe("hq");
    expect(JSON.stringify(c.runEvent?.onSuccessfulRun)).toContain(
      "gainPerCreditLost",
    );
  });

  it("Public Access Plaza PAD + threat trash tags", () => {
    const c = getCardDef("public-access-plaza");
    expect(c.onTurnBegin).toEqual(fx.gainCredits("corp", 1));
    expect(c.threatGiveTagsOnRezzedTrash).toEqual({ level: 2, tags: 1 });
  });

  it("Scrounge is double: install from heap + may stack-bottom", () => {
    const c = getCardDef("scrounge");
    expect(c.playAdditionalClick).toBe(true);
    expect(JSON.stringify(c.onPlay)).toContain("install_from_heap");
    expect(JSON.stringify(c.onPlay)).toContain(
      "may_add_from_heap_to_stack_bottom",
    );
  });
});
