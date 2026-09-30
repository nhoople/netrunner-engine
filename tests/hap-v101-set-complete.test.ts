/**
 * Honor and Profit (hap) set-complete — floor v1.101.0 → v1.101.0.
 * 50/50 HAP-only clears; 5 reprints absorbed. CR pin v26.03.
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

const HAP_CLEARS = [
  "harmony-medtech-biomedical-pioneer",
  "nisei-division-the-next-generation",
  "tennin-institute-the-secrets-within",
  "medical-breakthrough",
  "the-future-perfect",
  "chairman-hiro",
  "mental-health-clinic",
  "psychic-field",
  "shi-kyu",
  "tenma-line",
  "cerebral-cast",
  "medical-research-fundraiser",
  "mushin-no-shin",
  "inazuma",
  "komainu",
  "pup",
  "shiro",
  "susanoo-no-mikoto",
  "neotokyo-grid",
  "tori-hanzo",
  "plan-b",
  "guard",
  "rainbow",
  "diversified-portfolio",
  "fast-track",
  "iain-stirling-retired-spook",
  "silhouette-stealth-operative",
  "calling-in-favors",
  "early-bird",
  "express-delivery",
  "feint",
  "planned-assault",
  "logos",
  "public-terminal",
  "unregistered-s-w-35",
  "window",
  "alias",
  "breach",
  "bug",
  "gingerbread",
  "grappling-hook",
  "passport",
  "push-your-luck",
  "theophilius-bagbiter",
  "tri-maf-contact",
  "mass-install",
  "q-coherence-chip",
  "overmind",
  "oracle-may",
  "donut-taganes",
] as const;

const HAP_REPRINTS = [
  "house-of-knives",
  "philotic-entanglement",
  "ken-express-tenma-disappeared-clone",
  "legwork",
  "security-testing",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.119.0");
});

describe("Honor and Profit v1.101.0 set-complete", () => {
  it("declares honor-and-profit supported after double-time with 55 cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["honor-and-profit"].status).toBe("supported");
    expect(pool.waves["honor-and-profit"].cards).toHaveLength(55);
    expect(pool.corpusOrder[13]).toBe("double-time");
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
    expect(pool.corpusOrder[33]).toBe("reign-and-reverie");
  });

  it("clears all 50 HAP-only cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of HAP_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("honor-and-profit");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onInstall) expect(validateEffectTree(def.onInstall)).toBeNull();
      if (def.onAgendaScored) expect(validateEffectTree(def.onAgendaScored)).toBeNull();
      if (def.onAccessWhileUninstalled) {
        expect(validateEffectTree(def.onAccessWhileUninstalled)).toBeNull();
      }
      if (def.runEvent?.onSuccessfulRun) {
        expect(validateEffectTree(def.runEvent.onSuccessfulRun)).toBeNull();
      }
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
    }
  });

  it("does not duplicate HAP reprints as honor-and-profit wave", () => {
    loadCardCatalog(true);
    for (const id of HAP_REPRINTS) {
      const def = getCardDef(id);
      expect(def.wave).not.toBe("honor-and-profit");
    }
  });

  it("wires key HAP fields", () => {
    loadCardCatalog(true);
    expect(getCardDef("harmony-medtech-biomedical-pioneer").agendaPointsToWinModifierBoth).toBe(
      -1,
    );
    expect(getCardDef("guard").cannotBeBypassed).toBe(true);
    expect(getCardDef("overmind").powerCountersOnInstallFromUnusedMu).toBe(true);
    expect(getCardDef("feint").runEvent?.bypassEncountersRemaining).toBe(2);
    expect(getCardDef("feint").runEvent?.skipBreach).toBe(true);
  });
});
