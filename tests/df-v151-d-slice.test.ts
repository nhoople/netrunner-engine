/**
 * Downfall v1.51.0 D-slice: Supercorridor / Public Health Portal /
 * Demolisher / Flip Switch / Fully Operational.
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
  runnerTrashCostForCard,
  validateEffectTree,
} from "../src/index.js";
import type { GameState } from "../src/state/types.js";
import { createInitialState, instantiateCard } from "../src/index.js";

const CLEAR = [
  "supercorridor",
  "public-health-portal",
  "demolisher",
  "flip-switch",
  "fully-operational",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.123.0");
});

describe("Downfall v1.51.0 D-slice", () => {
  it("declares downfall supported with at least 25 clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["downfall"].status).toBe("supported");
    expect(pool.waves["downfall"].cards).toHaveLength(65);
    let clear = 0;
    for (const id of pool.waves["downfall"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(25);
  });

  it("loads five new clear D-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("downfall");
    }
  });

  it("Supercorridor is console with MU, hand size, equal-credits onTurnEnd", () => {
    const def = getCardDef("supercorridor");
    expect(def.subtypes).toContain("console");
    expect(def.muBonus).toBe(2);
    expect(def.handSizeBonus).toBe(1);
    expect(def.onRunnerTurnEnd).toEqual(
      fx.if({ op: "credits_eq_other_side", side: "runner" }, fx.choose("runner", [
        {
          id: "gain",
          label: "Gain 2¢",
          effect: fx.gainCredits("runner", 2),
        },
        {
          id: "decline",
          label: "Decline",
          effect: fx.gainCredits("runner", 0),
        },
      ])),
    );
    expect(validateEffectTree(def.onRunnerTurnEnd!)).toBeNull();
  });

  it("Public Health Portal reveals top of R&D then gains 2¢", () => {
    const def = getCardDef("public-health-portal");
    expect(def.onTurnBegin).toEqual(
      fx.seq(fx.do({ kind: "reveal_top_of_rd" }), fx.gainCredits("corp", 2)),
    );
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
  });

  it("Demolisher lowers Corp trash costs and gains on first trash", () => {
    const def = getCardDef("demolisher");
    expect(def.subtypes).toContain("console");
    expect(def.muBonus).toBe(1);
    expect(def.corpCardTrashCostReduction).toBe(1);
    expect(def.onFirstCorpCardTrashEachTurn).toEqual(
      fx.gainCredits("runner", 1),
    );
    expect(validateEffectTree(def.onFirstCorpCardTrashEachTurn!)).toBeNull();

    let s: GameState = createInitialState();
    s = structuredClone(s);
    const demo = instantiateCard("demolisher", "demo-1", "runner:rig");
    s.cards["demo-1"] = demo;
    s.runner.rig = ["demo-1"];
    const asset = instantiateCard("csr-campaign", "asset-1", "server:remote-1:root");
    s.cards["asset-1"] = asset;
    expect(asset.trashCost).toBe(2);
    expect(runnerTrashCostForCard(s, "asset-1")).toBe(1);
  });

  it("Flip Switch has trashSelf jack-out, remove-tag, and trace interrupt", () => {
    const def = getCardDef("flip-switch");
    expect(def.paidAbilities).toHaveLength(3);
    const jack = def.paidAbilities!.find((a) => a.id === "flip-switch-jack-out")!;
    expect(jack.cost?.trashSelf).toBe(true);
    expect(jack.requireDuringRun).toBe(true);
    expect(JSON.stringify(jack.effect)).toContain("end_the_run");
    expect(validateEffectTree(jack.effect)).toBeNull();

    const tag = def.paidAbilities!.find(
      (a) => a.id === "flip-switch-remove-tag",
    )!;
    expect(tag.cost?.trashSelf).toBe(true);
    expect(JSON.stringify(tag.effect)).toContain("remove_tags");
    expect(validateEffectTree(tag.effect)).toBeNull();

    const trace = def.paidAbilities!.find((a) => a.id === "flip-switch-trace")!;
    expect(trace.windows).toContain("trace_interrupt_paw");
    expect(trace.cost?.trashSelf).toBe(true);
    expect(trace.effect).toEqual(
      fx.do({ kind: "set_trace_base_strength", amount: 0 }),
    );
    expect(validateEffectTree(trace.effect)).toBeNull();
  });

  it("Fully Operational resolves gain-or-draw per iced rooted remote", () => {
    const def = getCardDef("fully-operational");
    expect(def.onPlay).toEqual(
      fx.do({ kind: "fully_operational_resolve" }),
    );
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });
});
