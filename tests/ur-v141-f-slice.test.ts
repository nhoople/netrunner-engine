/**
 * Uprising v1.42.0 F-slice: Devil Charm / Simulchip / Cordyceps / Keiko /
 * Flower Sermon.
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
  "devil-charm",
  "simulchip",
  "cordyceps",
  "keiko",
  "flower-sermon",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.112.0");
});

describe("Uprising v1.42.0 F-slice", () => {
  it("declares uprising supported with at least 38 clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["uprising"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["uprising"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(38);
  });

  it("loads five new clear cards", () => {
    for (const id of CLEAR) {
      const def = getCardDef(id);
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("uprising");
    }
  });

  it("Devil Charm RFGs self then weakens encountered ice with empty cost", () => {
    const def = getCardDef("devil-charm");
    const ab = def.paidAbilities?.[0];
    expect(ab?.windows).toContain("encounter_paw");
    expect(ab?.cost).toEqual({});
    expect(validateEffectTree(ab!.effect)).toBeNull();
    expect(JSON.stringify(ab!.effect)).toContain("rfg_self");
    expect(JSON.stringify(ab!.effect)).toContain("weaken_ice");
  });

  it("Simulchip trashes self + program (waivable) to install from heap", () => {
    const def = getCardDef("simulchip");
    const ab = def.paidAbilities?.[0];
    expect(ab?.cost?.trashSelf).toBe(true);
    expect(
      ab?.cost?.trashInstalledProgramUnlessOwnInstalledTrashedThisTurn,
    ).toBe(true);
    expect(validateEffectTree(ab!.effect)).toBeNull();
    expect(JSON.stringify(ab!.effect)).toContain("install_from_heap");
  });

  it("Cordyceps installs virus, then may remove + swap on successful central", () => {
    const def = getCardDef("cordyceps");
    expect(def.onSuccessfulRunOncePerTurn).toBe(true);
    expect(validateEffectTree(def.onInstall!)).toBeNull();
    expect(JSON.stringify(def.onInstall)).toContain("add_virus_counter");
    expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
    expect(JSON.stringify(def.onSuccessfulRun)).toContain(
      "remove_virus_counters",
    );
    expect(JSON.stringify(def.onSuccessfulRun)).toContain(
      "may_swap_protecting_attacked_ice_with_other_installed",
    );
    expect(JSON.stringify(def.onSuccessfulRun)).toContain("attacking_central");
  });

  it("Keiko grants MU and companion install/spend credits", () => {
    const def = getCardDef("keiko");
    expect(def.muBonus).toBe(2);
    expect(def.gainCreditsOnFirstCompanionInstallOrSpendThisTurn).toBe(1);
    expect(def.subtypes).toContain("console");
    expect(def.subtypes).toContain("companion");
  });

  it("Flower Sermon scores counters then looks/advances/bottoms R&D", () => {
    const def = getCardDef("flower-sermon");
    expect(validateEffectTree(def.onScore!)).toBeNull();
    expect(JSON.stringify(def.onScore)).toContain("add_agenda_counter");
    const ab = def.paidAbilities?.[0];
    expect(ab?.cost?.agendaCounters).toBe(1);
    expect(ab?.windows).toContain("corp_action_paw");
    expect(validateEffectTree(ab!.effect)).toBeNull();
    expect(JSON.stringify(ab!.effect)).toContain(
      "look_top_rd_may_advance_may_bottom",
    );
  });
});
