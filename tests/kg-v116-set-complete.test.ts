/**
 * Kala Ghoda (kg) set-complete — floor v1.115.0 → v1.116.0.
 * 18/18 KG-only clears (run-amok reprint). CR pin v26.03.
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

const KG_CLEARS = [
  "ramujan-reliant-550-bmi",
  "street-magic",
  "high-stakes-job",
  "mongoose",
  "jesminder-sareen-girl-behind-the-curtain",
  "maya",
  "panchatantra",
  "artist-colony",
  "chatterjee-university",
  "advanced-concept-hopper",
  "vikram-1-0",
  "heritage-committee",
  "mumbad-city-grid",
  "kala-ghoda-real-tv",
  "interrupt-0",
  "dedication-ceremony",
  "mumba-temple",
  "museum-of-history",
] as const;

const KG_REPRINTS = ["run-amok"] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.134.0");
});

describe("Kala Ghoda v1.116.0 set-complete", () => {
  it("declares kala-ghoda supported after data-and-destiny with 19 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["kala-ghoda"].status).toBe("supported");
    expect(pool.waves["kala-ghoda"].cards).toHaveLength(19);
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
    expect(pool.corpusOrder[48]).toBe("reign-and-reverie");
  });

  it("clears all 18 KG cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of KG_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("kala-ghoda");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onFirstRunBeginThisTurn) {
        expect(validateEffectTree(def.onFirstRunBeginThisTurn)).toBeNull();
      }
      if (def.onFinishAccessRdOncePerTurn) {
        expect(validateEffectTree(def.onFinishAccessRdOncePerTurn)).toBeNull();
      }
      if (def.onEncounterAnyIceOncePerTurn) {
        expect(validateEffectTree(def.onEncounterAnyIceOncePerTurn)).toBeNull();
      }
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
      if (def.runEvent?.onSuccessfulRun) {
        expect(validateEffectTree(def.runEvent.onSuccessfulRun)).toBeNull();
      }
    }
  });

  it("skips run-amok reprint", () => {
    loadCardCatalog(true);
    for (const id of KG_REPRINTS) {
      const def = getCardDef(id);
      expect(def.wave).not.toBe("kala-ghoda");
    }
  });

  it("wires key KG fields", () => {
    loadCardCatalog(true);
    expect(getCardDef("street-magic").runnerChoosesUnbrokenSubroutineOrder).toBe(
      true,
    );
    expect(getCardDef("high-stakes-job").runEvent?.requiresUnrezzedIce).toBe(true);
    expect(getCardDef("mongoose").breakOnAtMostOneIcePerRun).toBe(true);
    expect(getCardDef("mongoose").breaker?.breakMaxSubs).toBe(2);
    expect(
      getCardDef("jesminder-sareen-girl-behind-the-curtain").preventFirstTagThisTurn,
    ).toBe(true);
    expect(getCardDef("maya").muBonus).toBe(2);
    expect(getCardDef("maya").onFinishAccessRdOncePerTurn).toBeTruthy();
    expect(getCardDef("panchatantra").onEncounterAnyIceOncePerTurn).toBeTruthy();
    expect(getCardDef("artist-colony").paidAbilities?.[0]?.cost?.forfeitAgenda).toBe(
      true,
    );
    expect(getCardDef("advanced-concept-hopper").onFirstRunBeginThisTurn).toBeTruthy();
    expect(getCardDef("vikram-1-0").bioroidBreakMaxSubs).toBe(1);
    expect(
      getCardDef("mumbad-city-grid").onPassIceProtectingThisServerMaySwap,
    ).toBe(true);
    expect(getCardDef("mumba-temple").recurringCreditsMax).toBe(2);
    expect(getCardDef("mumba-temple").recurringSpendFor).toContain("rez");
    expect(getCardDef("museum-of-history").unique).toBe(true);
    expect(getCardDef("dedication-ceremony").onPlay).toBeTruthy();
  });
});
