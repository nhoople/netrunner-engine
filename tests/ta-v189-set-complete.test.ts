/**
 * Trace Amount (ta) Genesis set-complete — floor v1.88.0 → v1.89.0.
 * 15/15 TA-only clears; 5 reprints absorbed. CR pin v26.03.
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

const TA_CLEARS = [
  "vamp",
  "satellite-uplink",
  "e3-feedback-implants",
  "compromised-employee",
  "snowball",
  "dyson-mem-chip",
  "encryption-protocol",
  "sherlock-1-0",
  "sensei",
  "big-brother",
  "chilo-city-grid",
  "power-grid-overload",
  "amazon-industrial-zone",
  "executive-retreat",
  "freelancer",
] as const;

const TA_REPRINTS = [
  "liberated-account",
  "notoriety",
  "jinteki-replicating-perfection",
  "fetal-ai",
  "trick-of-light",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.145.0");
});

describe("Trace Amount v1.89.0 set-complete", () => {
  it("declares trace-amount supported after what-lies-ahead with 20 cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["trace-amount"].status).toBe("supported");
    expect(pool.waves["trace-amount"].cards).toHaveLength(20);
    expect(pool.corpusOrder[0]).toBe("core");
    expect(pool.corpusOrder[1]).toBe("what-lies-ahead");
    expect(pool.corpusOrder[2]).toBe("trace-amount");
    expect(pool.corpusOrder[3]).toBe("cyber-exodus");
    expect(pool.corpusOrder[4]).toBe("a-study-in-static");
    expect(pool.waves["what-lies-ahead"].status).toBe("supported");
  });

  it("clears all 15 TA-only cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of TA_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("trace-amount");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) validateEffectTree(def.onPlay);
      if (def.onRez) validateEffectTree(def.onRez);
      if (def.onScore) validateEffectTree(def.onScore);
      if (def.onAnyIceRez) validateEffectTree(def.onAnyIceRez);
      if (def.onSuccessfulTraceDuringRun) {
        validateEffectTree(def.onSuccessfulTraceDuringRun);
      }
      for (const ab of def.paidAbilities ?? []) {
        validateEffectTree(ab.effect);
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) validateEffectTree(sub.effect);
      }
      if (def.runEvent?.onSuccessfulRun) {
        validateEffectTree(def.runEvent.onSuccessfulRun);
      }
    }
  });

  it("absorbs 5 reprints from earlier waves", () => {
    for (const id of TA_REPRINTS) {
      const def = getCardDef(id);
      expect(def.wave).not.toBe("trace-amount");
      expect(def.unsupported ?? []).toEqual([]);
    }
  });

  it("maps TA-specific fields and primitives", () => {
    expect(getCardDef("dyson-mem-chip").muBonus).toBe(1);
    expect(getCardDef("dyson-mem-chip").link).toBe(1);
    expect(getCardDef("encryption-protocol").installedCardsTrashCostBonus).toBe(
      1,
    );
    expect(getCardDef("snowball").strengthBonusOnBreakSubForRun).toBe(1);
    expect(
      getCardDef("e3-feedback-implants")
        .onBreakSubroutineMayPayCreditsBreakAnother,
    ).toEqual({ credits: 1 });
    expect(
      getCardDef("amazon-industrial-zone")
        .mayImmediatelyRezIceOnInstallProtectingThisServerDiscount,
    ).toBe(3);
    expect(getCardDef("compromised-employee").recurringSpendFor).toEqual([
      "trace",
    ]);
    expect(getCardDef("compromised-employee").link).toBe(1);
    expect(getCardDef("big-brother").playRequiresTagged).toBe(true);
    expect(getCardDef("freelancer").playRequiresTagged).toBe(true);
    expect(getCardDef("power-grid-overload").playRequiresSuccessfulRunLastTurn).toBe(
      true,
    );
    const vamp = getCardDef("vamp");
    expect(vamp.runEvent?.onSuccessfulRun).toMatchObject({
      op: "do",
      action: { kind: "vamp_may_instead_of_breach" },
    });
    const sat = getCardDef("satellite-uplink");
    expect(sat.onPlay).toMatchObject({
      op: "do",
      action: { kind: "expose_up_to", max: 2 },
    });
  });
});
