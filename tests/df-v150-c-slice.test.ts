/**
 * Downfall v1.51.0 C-slice: Increased Drop Rates / Red Level Clearance /
 * Afshar / Hagen / SDS Drone Deployment.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  effectiveIceStrength,
  fx,
  getCardDef,
  instantiateCard,
  loadCardCatalog,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";
import type { GameState } from "../src/state/types.js";
import { createInitialState } from "../src/index.js";

const CLEAR = [
  "increased-drop-rates",
  "red-level-clearance",
  "afshar",
  "hagen",
  "sds-drone-deployment",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.82.0");
});

describe("Downfall v1.51.0 C-slice", () => {
  it("declares downfall supported with at least 20 clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["downfall"].status).toBe("supported");
    expect(pool.waves["downfall"].cards).toHaveLength(65);
    let clear = 0;
    for (const id of pool.waves["downfall"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(20);
  });

  it("loads five new clear C-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("downfall");
    }
  });

  it("Increased Drop Rates must-reveal from R&D with onAccess tag-or-BP", () => {
    const def = getCardDef("increased-drop-rates");
    expect(def.mustRevealWhenAccessedFromRd).toBe(true);
    expect(def.onAccess).toEqual(
      fx.choose("runner", [
        {
          id: "take-tag",
          label: "Take 1 tag",
          effect: fx.do({ kind: "give_tags", amount: 1 }),
        },
        {
          id: "allow-remove-bp",
          label: "Allow Corp to remove 1 bad publicity",
          effect: fx.do({ kind: "remove_bad_publicity", amount: 1 }),
        },
      ]),
    );
    expect(validateEffectTree(def.onAccess!)).toBeNull();
  });

  it("Red Level Clearance is choose_exactly_n of four options", () => {
    const def = getCardDef("red-level-clearance");
    expect(def.onPlay).toBeDefined();
    expect(JSON.stringify(def.onPlay)).toContain("choose_exactly_n");
    expect(JSON.stringify(def.onPlay)).toContain("may_install_from_hq_paying_costs");
    expect(JSON.stringify(def.onPlay)).toContain("gain_clicks");
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });

  it("Afshar limits printed breaks on HQ and has lose¢ + ETR subs", () => {
    const def = getCardDef("afshar");
    expect(def.onEncounter).toEqual(
      fx.if({ op: "attacking_hq" }, fx.do({
        kind: "limit_printed_breaks_on_source_for_run",
        max: 1,
      })),
    );
    expect(validateEffectTree(def.onEncounter!)).toBeNull();
    expect(def.subroutines).toHaveLength(2);
    expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
    expect(validateEffectTree(def.subroutines![1]!.effect)).toBeNull();
    expect(JSON.stringify(def.subroutines![0]!.effect)).toContain("lose_credits");
    expect(JSON.stringify(def.subroutines![1]!.effect)).toContain("end_the_run");
  });

  it("Hagen loses strength per icebreaker and trashes non-breakers", () => {
    const def = getCardDef("hagen");
    expect(def.strengthBonusPerIcebreaker).toBe(-1);
    expect(def.subroutines).toHaveLength(2);
    expect(JSON.stringify(def.subroutines![0]!.effect)).toContain(
      "excludeSubtypes",
    );
    expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
    expect(validateEffectTree(def.subroutines![1]!.effect)).toBeNull();

    let s: GameState = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("hagen", "hagen-1", "server:hq:ice");
    s.cards["hagen-1"] = ice;
    s.servers.hq.ice = ["hagen-1"];
    expect(effectiveIceStrength(s, "hagen-1")).toBe(6);

    const breaker = instantiateCard("bukhgalter", "brk-1", "runner:rig");
    s.cards["brk-1"] = breaker;
    s.runner.rig = ["brk-1"];
    expect(effectiveIceStrength(s, "hagen-1")).toBe(5);
  });

  it("SDS Drone Deployment has stealAdditionalCost + onScore trash program", () => {
    const def = getCardDef("sds-drone-deployment");
    expect(def.stealAdditionalCost).toEqual(
      fx.do({ kind: "trash_own_program" }),
    );
    expect(validateEffectTree(def.stealAdditionalCost!)).toBeNull();
    expect(def.onScore).toEqual(
      fx.do({ kind: "trash_program", pick: "choose" }),
    );
    expect(validateEffectTree(def.onScore!)).toBeNull();
  });
});
