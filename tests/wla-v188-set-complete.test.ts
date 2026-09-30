/**
 * What Lies Ahead (wla) Genesis set-complete — floor v1.87.0 → v1.88.0.
 * 14/14 WLA-only clears; 6 reprints absorbed. CR pin v26.03.
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

const WLA_CLEARS = [
  "whizzard-master-gamer",
  "spinal-modem",
  "morning-star",
  "cortez-chip",
  "peacock",
  "zu-13-key-master",
  "the-helpful-ai",
  "mandatory-upgrades",
  "janus-1-0",
  "braintrust",
  "snowflake",
  "restructured-datapool",
  "tmi",
  "draco",
] as const;

const WLA_REPRINTS = [
  "imp",
  "plascrete-carapace",
  "haas-bioroid-stronger-together",
  "ash-2x3zb9cy",
  "project-atlas",
  "caduceus",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.113.0");
});

describe("What Lies Ahead v1.88.0 set-complete", () => {
  it("declares what-lies-ahead supported after core with 20 cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["what-lies-ahead"].status).toBe("supported");
    expect(pool.waves["what-lies-ahead"].cards).toHaveLength(20);
    expect(pool.corpusOrder[0]).toBe("core");
    expect(pool.corpusOrder[1]).toBe("what-lies-ahead");
    expect(pool.corpusOrder[2]).toBe("trace-amount");
    expect(pool.corpusOrder[3]).toBe("cyber-exodus");
    expect(pool.corpusOrder[4]).toBe("a-study-in-static");
    expect(pool.waves.core.status).toBe("supported");
  });

  it("clears all 14 WLA-only cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of WLA_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("what-lies-ahead");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) validateEffectTree(def.onPlay);
      if (def.onRez) validateEffectTree(def.onRez);
      if (def.onScore) validateEffectTree(def.onScore);
      if (def.onSuccessfulTraceDuringRun) {
        validateEffectTree(def.onSuccessfulTraceDuringRun);
      }
      for (const ab of def.paidAbilities ?? []) {
        validateEffectTree(ab.effect);
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) validateEffectTree(sub.effect);
      }
    }
  });

  it("absorbs 6 reprints from earlier waves", () => {
    for (const id of WLA_REPRINTS) {
      const def = getCardDef(id);
      expect(def.wave).not.toBe("what-lies-ahead");
      expect(def.unsupported ?? []).toEqual([]);
    }
  });

  it("maps cloud / spinal / cortez / helpful / braintrust fields", () => {
    expect(getCardDef("zu-13-key-master").memoryCostZeroIfLinkGte).toBe(2);
    expect(getCardDef("spinal-modem").onSuccessfulTraceDuringRun).toBeDefined();
    expect(getCardDef("braintrust").iceRezCostReductionPerAgendaCounter).toBe(1);
    expect(getCardDef("mandatory-upgrades").allottedClicksBonus).toBe(1);
    const cortez = getCardDef("cortez-chip");
    expect(cortez.paidAbilities?.[0]?.effect).toMatchObject({
      op: "do",
      action: { kind: "choose_ice_additional_rez_cost_this_turn", amount: 2 },
    });
    const helpful = getCardDef("the-helpful-ai");
    expect(helpful.paidAbilities?.[0]?.effect).toMatchObject({
      op: "do",
      action: { kind: "choose_icebreaker_gain_strength_this_turn", amount: 2 },
    });
  });
});
