/**
 * Opening Moves (om) set-complete — floor v1.95.0 → v1.95.0.
 * 16/16 OM-only clears; 4 reprints absorbed. CR pin v26.03.
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

const OM_CLEARS = [
  "frame-job",
  "pawn",
  "rook",
  "gorman-drip-v1",
  "lockpick",
  "false-echo",
  "motivation",
  "project-ares",
  "next-bronze",
  "character-assassination",
  "jackson-howard",
  "invasion-of-privacy",
  "geothermal-fracking",
  "swarm",
  "cyberdex-trial",
  "grim",
] as const;

const OM_REPRINTS = [
  "hostage",
  "john-masanori",
  "himitsu-bako",
  "celebrity-gift",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.111.0");
});

describe("Opening Moves v1.95.0 set-complete", () => {
  it("declares opening-moves supported after creation-and-control with 20 cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["opening-moves"].status).toBe("supported");
    expect(pool.waves["opening-moves"].cards).toHaveLength(20);
    expect(pool.corpusOrder[7]).toBe("creation-and-control");
    expect(pool.corpusOrder[8]).toBe("opening-moves");
    expect(pool.corpusOrder[9]).toBe("stalwart")
    expect(pool.corpusOrder[10]).toBe("mala-tempora");
    expect(pool.corpusOrder[11]).toBe("true-colors");
    expect(pool.corpusOrder[12]).toBe("fear-and-loathing");
    expect(pool.corpusOrder[13]).toBe("double-time");
  });

  it("clears all 16 OM-only cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of OM_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("opening-moves");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onRez) expect(validateEffectTree(def.onRez)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onPassUnrezzedIce) {
        expect(validateEffectTree(def.onPassUnrezzedIce)).toBeNull();
      }
      if (def.onCorpBasicClickForCreditOrDraw) {
        expect(validateEffectTree(def.onCorpBasicClickForCreditOrDraw)).toBeNull();
      }
      if (def.playAdditionalCost) {
        expect(validateEffectTree(def.playAdditionalCost)).toBeNull();
      }
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
    }
  });

  it("absorbs 4 reprints from earlier waves", () => {
    for (const id of OM_REPRINTS) {
      const def = getCardDef(id);
      expect(def.wave).not.toBe("opening-moves");
      expect(def.unsupported ?? []).toEqual([]);
    }
  });

  it("maps key OM fields and primitives", () => {
    expect(getCardDef("lockpick").recurringSpendFor).toEqual(["use_decoder"]);
    expect(getCardDef("next-bronze").strengthBonusPerRezzedIceWithSubtype).toEqual(
      { subtype: "next", bonus: 1 },
    );
    expect(getCardDef("rook").iceRezCostIncreaseProtectingHostedServer).toBe(2);
    expect(getCardDef("pawn").caissaAdvanceOnSuccessfulRun).toBe(true);
    expect(JSON.stringify(getCardDef("cyberdex-trial").onPlay)).toContain(
      "purge_virus_counters",
    );
    expect(getCardDef("swarm").canAdvance).toBe(true);
    expect(getCardDef("jackson-howard").paidAbilities?.length).toBe(2);
  });
});
