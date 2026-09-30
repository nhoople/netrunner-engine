/**
 * Uprising v1.43.0 H-slice: Ganked! / Mystic Maemi / Paladin Poemu /
 * Prognostic Q-Loop / Boomerang.
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
  "ganked",
  "mystic-maemi",
  "paladin-poemu",
  "prognostic-q-loop",
  "boomerang",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.117.0");
});

describe("Uprising v1.43.0 H-slice", () => {
  it("declares uprising supported with at least 48 clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["uprising"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["uprising"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(48);
  });

  it("loads five new clear cards", () => {
    for (const id of CLEAR) {
      const def = getCardDef(id);
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("uprising");
    }
  });

  it("Ganked! is ambush with R&D reveal + trash-to-encounter onAccess", () => {
    const def = getCardDef("ganked");
    expect(def.subtypes).toContain("ambush");
    expect(def.mustRevealWhenAccessedFromRd).toBe(true);
    expect(validateEffectTree(def.onAccess!)).toBeNull();
    expect(JSON.stringify(def.onAccess)).toContain(
      "trash_self_choose_rezzed_protecting_ice_encounter",
    );
  });

  it("Mystic Maemi hosts credits for play_event + steal/turn hooks", () => {
    const def = getCardDef("mystic-maemi");
    expect(def.subtypes).toContain("companion");
    expect(def.hostedCreditsSpendFor).toEqual(["play_event"]);
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    expect(JSON.stringify(def.onTurnBegin)).toContain("place_hosted_credits");
    expect(validateEffectTree(def.onStealAgenda!)).toBeNull();
    expect(JSON.stringify(def.onStealAgenda)).toContain("place_hosted_credits");
    expect(validateEffectTree(def.onRunnerTurnEnd!)).toBeNull();
    expect(JSON.stringify(def.onRunnerTurnEnd)).toContain("hosted_credits_gte");
    expect(JSON.stringify(def.onRunnerTurnEnd)).toContain(
      "trash_random_from_grip",
    );
    expect(JSON.stringify(def.onRunnerTurnEnd)).toContain("trash_self");
  });

  it("Paladin Poemu excludes connection install spend + must trash installed", () => {
    const def = getCardDef("paladin-poemu");
    expect(def.subtypes).toContain("companion");
    expect(def.hostedCreditsSpendFor).toEqual(["install"]);
    expect(def.hostedCreditsSpendForInstallExcludeSubtypes).toEqual([
      "connection",
    ]);
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    expect(validateEffectTree(def.onStealAgenda!)).toBeNull();
    expect(validateEffectTree(def.onRunnerTurnEnd!)).toBeNull();
    expect(JSON.stringify(def.onRunnerTurnEnd)).toContain(
      "must_trash_own_installed",
    );
  });

  it("Prognostic Q-Loop first-run look + once/turn reveal/install", () => {
    const def = getCardDef("prognostic-q-loop");
    expect(validateEffectTree(def.onFirstRunBeginThisTurn!)).toBeNull();
    expect(JSON.stringify(def.onFirstRunBeginThisTurn)).toContain(
      "look_top_n_stack_peek",
    );
    const ab = def.paidAbilities?.[0];
    expect(ab?.oncePerTurn).toBe(true);
    expect(ab?.cost?.credits).toBe(1);
    expect(ab?.windows).toContain("runner_action_paw");
    expect(validateEffectTree(ab!.effect)).toBeNull();
    expect(JSON.stringify(ab!.effect)).toContain(
      "reveal_top_stack_may_install_program_or_hardware",
    );
  });

  it("Boomerang chooses ice on install; trash-breaks vs chosen ice + lingering shuffle", () => {
    const def = getCardDef("boomerang");
    expect(def.chooseIceOnInstall).toBe(true);
    const ab = def.paidAbilities?.[0];
    expect(ab?.cost?.trashSelf).toBe(true);
    expect(ab?.windows).toContain("encounter_paw");
    expect(ab?.requireEncounterChosenIce).toBe(true);
    expect(validateEffectTree(ab!.effect)).toBeNull();
    expect(JSON.stringify(ab!.effect)).toContain("break_encounter_subroutine");
    expect(JSON.stringify(ab!.effect)).toContain(
      "register_may_shuffle_title_from_heap_on_successful_run_end",
    );
  });
});
