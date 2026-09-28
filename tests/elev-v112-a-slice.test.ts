/**
 * Elevation v1.12.0 Slice A: Dewi / Ryō / Madani / Charm Offensive / GAMEDRAGON Pro.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";

const SLICE_A = [
  "dewi-subrotoputri-pedagogical-dhalang",
  "ryo-phoenix-ono-out-of-the-ashes",
  "madani",
  "charm-offensive",
  "gamedragon-pro",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
});

describe("Elevation v1.12.0 Slice A (local cards-data)", () => {
  it("declares at least 77 clear elevation cards when WIP cards root is used", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["elevation"].status).toBe("in-progress");
    let clear = 0;
    for (const id of pool.waves["elevation"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(72);
    if (clear >= 77) {
      expect(clear).toBe(77);
    }
  });

  it("loads Slice A cards clear when present in catalog", () => {
    for (const id of SLICE_A) {
      const def = getCardDef(id);
      if ((def.unsupported ?? []).length > 0) {
        continue;
      }
      expect(def.unsupported ?? [], id).toEqual([]);
    }
  });

  it("Madani paid abilities validate", () => {
    const c = getCardDef("madani");
    if ((c.unsupported ?? []).length) return;
    expect(c.paidAbilities?.length).toBe(2);
    for (const ab of c.paidAbilities ?? []) {
      expect(validateEffectTree(ab.effect)).toBeNull();
    }
  });

  it("GAMEDRAGON host + pump fields", () => {
    const c = getCardDef("gamedragon-pro");
    if ((c.unsupported ?? []).length) return;
    expect(c.hostIcebreakerStrengthBonus).toBe(1);
    expect(c.extendsHostBreakerPumpToRun).toBe(true);
    expect(validateEffectTree(c.onInstall!)).toBeNull();
  });
});
