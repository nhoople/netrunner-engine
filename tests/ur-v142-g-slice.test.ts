/**
 * Uprising v1.42.0 G-slice: Týr / Vaporframe Fabricator / Mu Safecracker /
 * Wall to Wall / Engram Flush.
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
  "tyr",
  "vaporframe-fabricator",
  "mu-safecracker",
  "wall-to-wall",
  "engram-flush",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.86.0");
});

describe("Uprising v1.42.0 G-slice", () => {
  it("declares uprising supported with at least 43 clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["uprising"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["uprising"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(43);
  });

  it("loads five new clear cards", () => {
    for (const id of CLEAR) {
      const def = getCardDef(id);
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("uprising");
    }
  });

  it("Týr is bioroid ice with allotted-click break flag and three subs", () => {
    const def = getCardDef("tyr");
    expect(def.subtypes).toContain("bioroid");
    expect(def.bioroidBreakGivesCorpAllottedClickNextTurn).toBe(true);
    expect(def.subroutines).toHaveLength(3);
    const kinds = def.subroutines!.map((s) =>
      JSON.stringify(s.effect),
    );
    expect(kinds[0]).toContain("core_damage");
    expect(kinds[1]).toContain("trash_installed_runner");
    expect(kinds[1]).toContain("gain_credits");
    expect(kinds[2]).toContain("end_the_run");
    for (const s of def.subroutines!) {
      expect(validateEffectTree(s.effect)).toBeNull();
    }
  });

  it("Vaporframe Fabricator click-installs from HQ; onTrash excludes source server", () => {
    const def = getCardDef("vaporframe-fabricator");
    const ab = def.paidAbilities?.[0];
    expect(ab?.oncePerTurn).toBe(true);
    expect(ab?.cost?.clicks ?? ab?.clickCost).toBe(1);
    expect(validateEffectTree(ab!.effect)).toBeNull();
    expect(JSON.stringify(ab!.effect)).toContain(
      "may_install_from_hq_ignore_costs",
    );
    expect(validateEffectTree(def.onTrash!)).toBeNull();
    expect(JSON.stringify(def.onTrash)).toContain(
      "may_install_from_hq_ignore_costs_exclude_source_server",
    );
  });

  it("Mu Safecracker stealth-only + HQ/RD pay-for-bonus-access fields", () => {
    const def = getCardDef("mu-safecracker");
    expect(def.paidAbilitiesUseStealthCreditsOnly).toBe(true);
    expect(def.onSuccessfulHqRunMayPayForBonusAccess).toEqual({
      credits: 1,
      bonusAccess: 1,
    });
    expect(def.onSuccessfulRdRunMayPayForBonusAccess).toEqual({
      credits: 2,
      bonusAccess: 1,
    });
  });

  it("Wall to Wall wires wall_to_wall_turn_begin on turn begin", () => {
    const def = getCardDef("wall-to-wall");
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    expect(JSON.stringify(def.onTurnBegin)).toContain(
      "wall_to_wall_turn_begin",
    );
  });

  it("Engram Flush chooses card type on encounter; reveal/trash subs", () => {
    const def = getCardDef("engram-flush");
    expect(validateEffectTree(def.onEncounter!)).toBeNull();
    expect(JSON.stringify(def.onEncounter)).toContain(
      "choose_card_type_for_encounter",
    );
    expect(def.subroutines).toHaveLength(2);
    for (const s of def.subroutines!) {
      expect(validateEffectTree(s.effect)).toBeNull();
      expect(JSON.stringify(s.effect)).toContain(
        "reveal_grip_may_trash_chosen_encounter_type",
      );
    }
  });
});
