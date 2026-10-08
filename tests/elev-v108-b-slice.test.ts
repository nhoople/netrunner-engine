/**
 * Elevation v1.08.0: Humanoid / Next Big Thing / Poétrï / Phật Gioan /
 * Biawak / Cacophony / Mercia B4LL4RD.
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
  "humanoid-resources",
  "next-big-thing",
  "poetri-luxury-brands-all-the-rage",
  "phat-gioan-baotixita",
  "biawak",
  "cacophony",
  "mercia-b4ll4rd",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.145.0");
});

describe("Elevation v1.08.0 B-slice", () => {
  it("declares 54 clear elevation cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["elevation"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["elevation"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(54);
  });

  it("loads seven newly mapped cards clear", () => {
    for (const id of CLEAR) {
      expect(getCardDef(id).unsupported ?? [], id).toEqual([]);
    }
  });

  it("Humanoid Resources paid seq: gain, draw, HQ installs, play operation", () => {
    const ab = getCardDef("humanoid-resources").paidAbilities?.[0];
    const s = JSON.stringify(ab?.effect);
    expect(s).toContain("gain_credits");
    expect(s).toContain("may_install_from_hq_paying_costs");
    expect(s).toContain("may_play_operation_from_hq");
    expect(ab?.effect).toBeDefined();
    expect(validateEffectTree(ab!.effect)).toBeNull();
  });

  it("Next Big Thing agenda counter ability + shuffle any HQ", () => {
    const c = getCardDef("next-big-thing");
    expect(JSON.stringify(c.onScore)).toContain("add_agenda_counter");
    expect(c.paidAbilities?.[0]?.usableFromRunnerScoreArea).toBe(true);
    expect(JSON.stringify(c.paidAbilities?.[0]?.effect)).toContain(
      "shuffle_any_number_hq_to_rd",
    );
  });

  it("Poétrï scores look R&D install non-agenda; stolen HQ install", () => {
    const c = getCardDef("poetri-luxury-brands-all-the-rage");
    expect(JSON.stringify(c.onAgendaScored)).toContain(
      "look_top_n_rd_may_install_one",
    );
    expect(JSON.stringify(c.onAgendaScored)).toContain("excludeAgenda");
    expect(JSON.stringify(c.onAgendaStolen)).toContain(
      "may_install_from_hq_paying_costs",
    );
    expect(JSON.stringify(c.onAgendaStolen)).toContain("excludeAgenda");
  });

  it("Phật Gioan discard power + first agenda scored/stolen net", () => {
    const c = getCardDef("phat-gioan-baotixita");
    expect(JSON.stringify(c.onDiscardPhaseEnd)).toContain("add_power_counter");
    expect(JSON.stringify(c.onFirstAgendaScoredOrStolenThisTurn)).toContain(
      "may_remove_power_counters_then_net_damage",
    );
  });

  it("Biawak optional forfeit rez discount + destroyer subs", () => {
    const c = getCardDef("biawak");
    expect(c.rezCostCreditDiscountOnForfeitAgenda).toBe(10);
    expect(c.subroutines?.length).toBe(3);
  });

  it("Cacophony first steal/trash power + action phase end sabotage", () => {
    const c = getCardDef("cacophony");
    expect(c.onFirstRunnerStoleOrTrashedCorpCardThisTurn).toBeDefined();
    expect(JSON.stringify(c.onRunnerActionPhaseEnd)).toContain("sabotage");
    expect(JSON.stringify(c.onRunnerActionPhaseEnd)).toContain(
      "remove_power_counter",
    );
  });

  it("Mercia Corp action phase end ice install discount + move", () => {
    const c = getCardDef("mercia-b4ll4rd");
    expect(JSON.stringify(c.onCorpActionPhaseEnd)).toContain(
      "may_install_ice_from_hq_discount_then_move_source",
    );
    expect(validateEffectTree(c.onCorpActionPhaseEnd!)).toBeNull();
  });
});
