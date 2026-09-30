/**
 * Upstalk (up) set-complete — floor v1.101.0 → v1.103.0.
 * 17/17 UP-only clears; 3 reprints absorbed. CR pin v26.03.
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

const UP_CLEARS = [
  "domestic-sleepers",
  "next-silver",
  "mutate",
  "primary-transmission-dish",
  "midway-station-grid",
  "the-root",
  "taurus",
  "mother-goddess",
  "galahad",
  "bad-times",
  "cyber-threat",
  "paper-tripping",
  "power-tap",
  "nasir-meidan-cyber-explorer",
  "social-engineering",
  "leprechaun",
  "eden-shard",
] as const;

const UP_REPRINTS = [
  "lotus-field",
  "near-earth-hub-broadcast-center",
  "lamprey",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.136.0");
});

describe("Upstalk v1.103.0 set-complete", () => {
  it("declares upstalk supported after honor-and-profit with 20 cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves.upstalk.status).toBe("supported");
    expect(pool.waves.upstalk.cards).toHaveLength(20);
    expect(pool.corpusOrder[14]).toBe("honor-and-profit");
    expect(pool.corpusOrder[15]).toBe("upstalk");
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
    expect(pool.corpusOrder[50]).toBe("reign-and-reverie");
  });

  it("clears all 17 UP-only cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of UP_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("upstalk");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onEncounter) expect(validateEffectTree(def.onEncounter)).toBeNull();
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
    }
  });

  it("does not duplicate UP reprints as upstalk wave", () => {
    loadCardCatalog(true);
    for (const id of UP_REPRINTS) {
      const def = getCardDef(id);
      expect(def.wave).not.toBe("upstalk");
    }
  });

  it("wires key UP fields", () => {
    loadCardCatalog(true);
    expect(getCardDef("next-silver").dynamicEtrSubroutineCountFromRezzedIceSubtype).toBe(
      "next",
    );
    expect(getCardDef("mother-goddess").hostGainsAllIceSubtypes).toBe(true);
    expect(getCardDef("leprechaun").daemonHost).toBe(true);
    expect(getCardDef("eden-shard").onGripRdSuccessInstallSelfIgnoringCosts).toBe(
      true,
    );
  });
});
