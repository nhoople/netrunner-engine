/**
 * Double Time (dt) set-complete — floor v1.99.0 → v1.100.0.
 * 19/19 DT-only clears; 1 reprint absorbed. CR pin v26.03.
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

const DT_CLEARS = [
  "singularity",
  "dyson-fractal-generator",
  "silencer",
  "savoir-faire",
  "fall-guy",
  "power-nap",
  "paintbrush",
  "lucky-find",
  "gyri-labyrinth",
  "reclamation-order",
  "broadcast-square",
  "corporate-shuffle",
  "caprice-nisei",
  "shinobi",
  "marker",
  "hive",
  "witness-tampering",
  "napd-contract",
  "quandary",
] as const;

const DT_REPRINTS = ["queens-gambit"] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.118.0");
});

describe("Double Time v1.100.0 set-complete", () => {
  it("declares double-time supported after fear-and-loathing with 20 cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["double-time"].status).toBe("supported");
    expect(pool.waves["double-time"].cards).toHaveLength(20);
    expect(pool.corpusOrder[12]).toBe("fear-and-loathing");
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
    expect(pool.corpusOrder[32]).toBe("reign-and-reverie");
  });

  it("clears all 19 DT-only cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of DT_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("double-time");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onRez) expect(validateEffectTree(def.onRez)).toBeNull();
      if (def.onWouldTakeBadPublicity) {
        expect(validateEffectTree(def.onWouldTakeBadPublicity)).toBeNull();
      }
      if (def.onPassAllIceProtectingServer) {
        expect(validateEffectTree(def.onPassAllIceProtectingServer)).toBeNull();
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

  it("does not duplicate DT reprints as double-time wave", () => {
    loadCardCatalog(true);
    for (const id of DT_REPRINTS) {
      const def = getCardDef(id);
      expect(def.wave).not.toBe("double-time");
    }
  });

  it("wires key DT fields", () => {
    loadCardCatalog(true);
    expect(getCardDef("dyson-fractal-generator").recurringSpendFor).toEqual([
      "use_fracter",
    ]);
    expect(getCardDef("silencer").recurringSpendFor).toEqual(["use_killer"]);
    expect(getCardDef("napd-contract").stealAdditionalCredits).toBe(4);
    expect(
      getCardDef("napd-contract").advancementRequirementIncreasePerCorpBadPublicity,
    ).toBe(1);
    expect(getCardDef("hive").dynamicEtrSubroutineCountFromCorpAgendaPoints).toBe(
      true,
    );
    expect(getCardDef("savoir-faire").oncePerTurnPaidAbilities).toBe(true);
  });
});
