/**
 * Elevation v1.04.0: Lie Low / Measured Response / Kessleroid /
 * Scatter Field / Semak-samun / Fransofia Ward.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  createGame,
  effectiveIceStrength,
  fx,
  getCardDef,
  instantiateCard,
  loadCardPool,
} from "../src/index.js";

const CLEAR = [
  "lie-low",
  "measured-response",
  "kessleroid",
  "scatter-field",
  "semak-samun",
  "fransofia-ward",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.69.0");
});

describe("Elevation v1.04.0 B-slice", () => {
  it("declares pool-wide clear elevation cards (includes later slices)", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["elevation"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["elevation"].cards) {
      const def = getCardDef(id);
      if ((def.unsupported ?? []).length === 0) clear++;
    }
    // Floor at this slice; later pins raise the pool-wide clear count.
    expect(clear).toBeGreaterThanOrEqual(29);
  });

  it("loads six newly mapped cards clear", () => {
    for (const id of CLEAR) {
      const def = getCardDef(id);
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("elevation");
    }
  });

  it("Lie Low is a double with draw/remove-tags choice", () => {
    const c = getCardDef("lie-low");
    expect(c.playAdditionalClick).toBe(true);
    expect(c.onPlay?.op).toBe("choose");
  });

  it("Measured Response requires Threat 4 + successful run last turn", () => {
    const c = getCardDef("measured-response");
    expect(c.playRequiresThreat).toBe(4);
    expect(c.playRequiresSuccessfulRunLastTurn).toBe(true);
    expect(c.onPlay?.op).toBe("choose");
  });

  it("Kessleroid cannot be trashed while rezzed; dual ETR", () => {
    const c = getCardDef("kessleroid");
    expect(c.cannotBeTrashedByRunnerWhileRezzed).toBe(true);
    expect(c.subroutines).toHaveLength(2);
  });

  it("Scatter Field gains +4 when sole ice", () => {
    const c = getCardDef("scatter-field");
    expect(c.strengthBonusIfSoleIceProtectingServer).toBe(4);
    const state = createGame({ seed: 1 });
    const ice = instantiateCard("scatter-field", "sf1", "server:hq:ice");
    state.cards[ice.id] = ice;
    state.servers.hq.ice = [ice.id];
    ice.rezzed = true;
    expect(effectiveIceStrength(state, ice.id)).toBe((c.strength ?? 0) + 4);
    const other = instantiateCard("ice-wall", "iw1", "server:hq:ice");
    state.cards[other.id] = other;
    state.servers.hq.ice.push(other.id);
    expect(effectiveIceStrength(state, ice.id)).toBe(c.strength ?? 0);
  });

  it("Semak-samun requires fracter to break", () => {
    const c = getCardDef("semak-samun");
    expect(c.cannotBreakExceptSubtype).toBe("fracter");
    expect(c.subroutines).toHaveLength(1);
  });

  it("Fransofia Ward bumps ice rez and trash-bypasses at Corp ≥15¢", () => {
    const c = getCardDef("fransofia-ward");
    expect(c.iceRezCostIncrease).toBe(1);
    const ab = c.paidAbilities?.[0];
    expect(ab?.requiresCorpCreditsGte).toBe(15);
    expect(ab?.cost?.trashSelf).toBe(true);
    expect(ab?.effect).toEqual(fx.do({ kind: "bypass_current_ice" }));
  });
});
