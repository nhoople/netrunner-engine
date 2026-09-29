/**
 * Downfall v1.53.0 F-slice: Secure and Protect / Lat: Ethical Freelancer /
 * Rejig / Chisel / Rime.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  fx,
  getCardDef,
  loadCardCatalog,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";

const CLEAR = [
  "secure-and-protect",
  "lat-ethical-freelancer",
  "rejig",
  "chisel",
  "rime",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.62.0");
});

describe("Downfall v1.53.0 F-slice", () => {
  it("declares downfall supported with at least 35 clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["downfall"].status).toBe("supported");
    expect(pool.waves["downfall"].cards).toHaveLength(65);
    let clear = 0;
    for (const id of pool.waves["downfall"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(35);
  });

  it("loads five new clear F-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("downfall");
    }
  });

  it("Secure and Protect is double + search-install central −3¢", () => {
    const def = getCardDef("secure-and-protect");
    expect(def.playAdditionalClick).toBe(true);
    expect(def.onPlay).toEqual(
      fx.do({
        kind: "search_rd_ice_install_central_discount",
        discount: 3,
      }),
    );
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });

  it("Lat may draw when grip equals HQ at discard phase end", () => {
    const def = getCardDef("lat-ethical-freelancer");
    expect(JSON.stringify(def.onDiscardPhaseEnd)).toContain("grip_count_eq_hq");
    expect(JSON.stringify(def.onDiscardPhaseEnd)).toContain('"kind":"draw"');
    expect(validateEffectTree(def.onDiscardPhaseEnd!)).toBeNull();
  });

  it("Rejig requires installed program/hardware and bounce-installs", () => {
    const def = getCardDef("rejig");
    expect(def.playRequiresInstalledProgramOrHardware).toBe(true);
    expect(def.onPlay).toEqual(fx.do({ kind: "rejig_bounce_install" }));
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });

  it("Chisel installs on ice, weakens host per virus, trashes at 0", () => {
    const def = getCardDef("chisel");
    expect(def.installOnIce).toBe(true);
    expect(def.hostStrengthPerVirusCounter).toBe(-1);
    expect(JSON.stringify(def.onHostEncounter)).toContain(
      "encounter_ice_strength_lte",
    );
    expect(JSON.stringify(def.onHostEncounter)).toContain(
      "trash_encounter_ice_if_strength_lte",
    );
    expect(JSON.stringify(def.onHostEncounter)).toContain("add_virus_counter");
    expect(validateEffectTree(def.onHostEncounter!)).toBeNull();
  });

  it("Rime rez-as-non-ice, +1 server ice strength, lose 1¢ sub", () => {
    const def = getCardDef("rime");
    expect(def.rezAsNonIceDuringRunsOnServer).toBe(true);
    expect(def.sameServerIceStrengthBonus).toBe(1);
    expect(def.subroutines).toHaveLength(1);
    expect(JSON.stringify(def.subroutines![0]!.effect)).toContain(
      "lose_credits",
    );
    expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
  });
});
