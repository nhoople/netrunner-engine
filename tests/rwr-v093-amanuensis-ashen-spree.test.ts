/**
 * RWR v0.93: Amanuensis / Ashen Epilogue / Sudden Commandment / Working Prototype / Spree.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
  loadCardCatalog,
  validateEffectTree,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.117.0");
});

describe("RWR v0.93 Amanuensis / Ashen / Sudden / Working Prototype / Spree", () => {
  it("loads five clear cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of [
      "amanuensis",
      "ashen-epilogue",
      "sudden-commandment",
      "working-prototype",
      "spree",
    ]) {
      expect(catalog.get(id)!.unsupported ?? [], id).toEqual([]);
    }
  });

  it("Amanuensis places power when tagged at turn end", () => {
    const def = getCardDef("amanuensis");
    expect(def.muBonus).toBe(1);
    expect(validateEffectTree(def.onRunnerTurnEnd!)).toBeNull();
    expect(validateEffectTree(def.onRemoveTags!)).toBeNull();
  });

  it("Ashen Epilogue shuffles grip+heap and RFGs", () => {
    const def = getCardDef("ashen-epilogue");
    expect(validateEffectTree(def.onPlay!)).toBeNull();
    expect(JSON.stringify(def.onPlay)).toContain("shuffle_grip_and_heap_into_stack");
  });

  it("Sudden Commandment may play a non-terminal operation", () => {
    const def = getCardDef("sudden-commandment");
    expect(validateEffectTree(def.onPlay!)).toBeNull();
    expect(JSON.stringify(def.onPlay)).toContain(
      "may_play_nonterminal_operation_from_hq",
    );
  });

  it("Working Prototype gains power on any rez", () => {
    const def = getCardDef("working-prototype");
    expect(def.powerCounterOnAnyCardRez).toBe(1);
    expect(def.paidAbilities).toHaveLength(2);
  });

  it("Spree places power and hosts trojans during the run", () => {
    const def = getCardDef("spree");
    expect(def.powerCountersOnPlay).toBe(3);
    expect(def.runEvent?.servers).toBe("any");
    expect(def.paidAbilities?.[0]?.requireDuringRun).toBe(true);
  });
});
