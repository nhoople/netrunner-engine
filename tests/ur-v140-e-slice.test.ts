/**
 * Uprising v1.42.0 E-slice: Cerebral Overwriter / Bravado / Scapenet /
 * Megaprix Qualifier / Harmony AR Therapy.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";

const CLEAR = [
  "cerebral-overwriter",
  "bravado",
  "scapenet",
  "megaprix-qualifier",
  "harmony-ar-therapy",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.100.0");
});

describe("Uprising v1.42.0 E-slice", () => {
  it("declares uprising supported with at least 33 clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["uprising"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["uprising"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(33);
  });

  it("loads five new clear cards", () => {
    for (const id of CLEAR) {
      const def = getCardDef(id);
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("uprising");
    }
  });

  it("Cerebral Overwriter may pay for core damage per advancement while installed", () => {
    const def = getCardDef("cerebral-overwriter");
    expect(def.canAdvance).toBe(true);
    expect(def.subtypes).toContain("ambush");
    expect(validateEffectTree(def.onAccess!)).toBeNull();
    expect(JSON.stringify(def.onAccess)).toContain(
      "may_pay_credits_for_core_damage_per_advancement",
    );
    expect(JSON.stringify(def.onAccess)).toContain("source_installed");
  });

  it("Bravado gains credits from base plus passed ice on run end", () => {
    const def = getCardDef("bravado");
    expect(def.runEvent?.requiresProtectingIce).toBe(true);
    expect(validateEffectTree(def.runEvent!.onRunEnd!)).toBeNull();
    expect(JSON.stringify(def.runEvent!.onRunEnd)).toContain(
      "gain_credits_base_plus_per_passed_ice",
    );
  });

  it("Scapenet traces then RFGs installed chip/virtual", () => {
    const def = getCardDef("scapenet");
    expect(def.playRequiresSuccessfulRunLastTurn).toBe(true);
    expect(validateEffectTree(def.onPlay!)).toBeNull();
    expect(JSON.stringify(def.onPlay)).toContain(
      "rfg_installed_with_any_subtype",
    );
  });

  it("Megaprix Qualifier adds an agenda counter when another copy is scored", () => {
    const def = getCardDef("megaprix-qualifier");
    expect(def.agendaPointsPerAgendaCounter).toBe(1);
    expect(validateEffectTree(def.onScore!)).toBeNull();
    expect(JSON.stringify(def.onScore)).toContain(
      "another_copy_of_source_title_in_either_score_area",
    );
  });

  it("Harmony AR Therapy shuffles distinct heap titles then RFGs self", () => {
    const def = getCardDef("harmony-ar-therapy");
    expect(validateEffectTree(def.onPlay!)).toBeNull();
    expect(JSON.stringify(def.onPlay)).toContain(
      "shuffle_up_to_n_distinct_heap_titles_into_stack",
    );
    expect(JSON.stringify(def.onPlay)).toContain("rfg_self");
  });
});
