/**
 * Vantage Point v1.23.0 B-slice: Knowledge Seeker / Lotus Haze / Hype Machine → 36/66.
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

const CLEAR = ["knowledge-seeker", "lotus-haze", "hype-machine"] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.65.0");
});

describe("Vantage Point v1.23.0 B-slice", () => {
  it("declares at least 36 clear vantage-point cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["vantage-point"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["vantage-point"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(36);
  });

  it("loads three newly mapped cards clear", () => {
    for (const id of CLEAR) {
      expect(getCardDef(id).unsupported ?? [], id).toEqual([]);
      expect(getCardDef(id).wave).toBe("vantage-point");
    }
  });

  it("Knowledge Seeker arranges R&D and purges on encounter end", () => {
    const def = getCardDef("knowledge-seeker");
    expect(def.subroutines?.length).toBe(3);
    expect(JSON.stringify(def.subroutines)).toContain("look_top_n_rd_arrange");
    expect(validateEffectTree(def.onEncounterEnd!)).toBeNull();
    expect(JSON.stringify(def.onEncounterEnd)).toContain("virus_counters_gte");
    expect(JSON.stringify(def.onEncounterEnd)).toContain("purge_virus_counters");
    expect(JSON.stringify(def.onEncounterEnd)).toContain("derez_source");
  });

  it("Lotus Haze scores agenda counters and moves rezzed upgrades", () => {
    const def = getCardDef("lotus-haze");
    expect(JSON.stringify(def.onScore)).toContain("add_agenda_counter");
    expect(def.paidAbilities?.[0]?.cost?.agendaCounters).toBe(1);
    expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();
    expect(JSON.stringify(def.paidAbilities![0]!.effect)).toContain(
      "may_move_rezzed_upgrade_to_another_server_root",
    );
  });

  it("Hype Machine discounts rez after agenda score/steal", () => {
    const def = getCardDef("hype-machine");
    expect(def.rezCostDiscountIfAgendaScoredOrStolenThisTurn).toBe(6);
    expect(def.paidAbilities?.[0]?.cost?.trashSelf).toBe(true);
    expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();
  });
});
