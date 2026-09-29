/**
 * Downfall v1.54.0 G-slice: Project Yagi-Uda / Architect Deployment Test /
 * Daily Quest / “Baklan” Bochkin / Masterwork (v37).
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
  "project-yagi-uda",
  "architect-deployment-test",
  "daily-quest",
  "baklan-bochkin",
  "masterwork-v37",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.54.0");
});

describe("Downfall v1.54.0 G-slice", () => {
  it("declares downfall in-progress with at least 40 clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["downfall"].status).toBe("in-progress");
    expect(pool.waves["downfall"].cards).toHaveLength(65);
    let clear = 0;
    for (const id of pool.waves["downfall"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(40);
  });

  it("loads five new clear G-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("downfall");
    }
  });

  it("Yagi-Uda overadvances on score and swaps HQ with attacked during run", () => {
    const def = getCardDef("project-yagi-uda");
    expect(def.onScore).toEqual(
      fx.do({ kind: "add_agenda_counters_from_overadvance", past: 3 }),
    );
    expect(validateEffectTree(def.onScore!)).toBeNull();
    expect(def.paidAbilities).toHaveLength(1);
    const ab = def.paidAbilities![0]!;
    expect(ab.cost?.agendaCounters).toBe(1);
    expect(ab.requireDuringRun).toBe(true);
    expect(JSON.stringify(ab.effect)).toContain(
      "yagi_swap_hq_with_attacked_root_or_ice",
    );
    expect(JSON.stringify(ab.effect)).toContain("offer_jack_out");
    expect(validateEffectTree(ab.effect)).toBeNull();
  });

  it("Architect Deployment Test looks top 5 and may install+rez ignore costs", () => {
    const def = getCardDef("architect-deployment-test");
    expect(def.onScore).toEqual(
      fx.do({
        kind: "look_top_n_rd_may_install_and_rez_ignore_costs",
        n: 5,
      }),
    );
    expect(validateEffectTree(def.onScore!)).toBeNull();
  });

  it("Daily Quest pays runner on success and corp if no success last turn", () => {
    const def = getCardDef("daily-quest");
    expect(def.rezOnlyDuringCorpTurn).toBe(true);
    expect(def.onSuccessfulRun).toEqual(
      fx.do({ kind: "gain_credits", side: "runner", amount: 2 }),
    );
    expect(JSON.stringify(def.onTurnBegin)).toContain(
      "no_successful_run_on_host_server_last_turn",
    );
    expect(JSON.stringify(def.onTurnBegin)).toContain('"amount":3');
    expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
  });

  it("Baklan places power on first encounter and may derez for tag", () => {
    const def = getCardDef("baklan-bochkin");
    expect(def.onFirstEncounterEachRun).toEqual(
      fx.do({ kind: "add_power_counter", amount: 1 }),
    );
    expect(validateEffectTree(def.onFirstEncounterEachRun!)).toBeNull();
    expect(def.paidAbilities).toHaveLength(1);
    const ab = def.paidAbilities![0]!;
    expect(ab.cost?.trashSelf).toBe(true);
    expect(ab.cost?.powerCountersEqualEncounterStrength).toBe(true);
    expect(JSON.stringify(ab.effect)).toContain("derez_encounter_ice");
    expect(JSON.stringify(ab.effect)).toContain("give_tags");
    expect(validateEffectTree(ab.effect)).toBeNull();
  });

  it("Masterwork is console +1mu, first HW draw, run-begin HW surcharge", () => {
    const def = getCardDef("masterwork-v37");
    expect(def.muBonus).toBe(1);
    expect(def.subtypes).toContain("console");
    expect(def.onFirstHardwareInstallEachTurn).toEqual(
      fx.draw("runner", 1),
    );
    expect(def.onRunBegin).toEqual(
      fx.do({
        kind: "may_install_from_grip",
        types: ["hardware"],
        discount: -1,
      }),
    );
    expect(validateEffectTree(def.onFirstHardwareInstallEachTurn!)).toBeNull();
    expect(validateEffectTree(def.onRunBegin!)).toBeNull();
  });
});
