/**
 * Midnight Sun power-counter paid-ability cost cluster:
 * cost.powerCounters unlocks Revolver break + Propeller pump.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  effectiveBreakerStrength,
  fx,
  getCardDef,
  instantiateCard,
  queryLegality,
} from "../src/index.js";
import { canPayCost, payCost } from "../src/state/costs.js";
import type { ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v0.68.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

/** Place ice on HQ, put breaker in rig, run to encounter PAW. */
function encounterHq(
  iceDefId: string,
  breakerDefId: string,
  opts?: { powerCounters?: number; breakViaPaidOnly?: boolean },
) {
  let s = createInitialState();
  s = structuredClone(s);
  const ice = instantiateCard(iceDefId, "ice-1", "server:hq:ice");
  ice.rezzed = false;
  s.cards["ice-1"] = ice;
  s.servers.hq.ice = ["ice-1"];

  const br = instantiateCard(breakerDefId, "br-1", "runner:rig");
  if (opts?.powerCounters !== undefined) {
    br.powerCounters = opts.powerCounters;
  }
  if (opts?.breakViaPaidOnly && br.breaker) {
    br.breaker.breakViaPaidAbilityOnly = true;
  }
  s.cards["br-1"] = br;
  s.runner.rig = ["br-1"];
  s.runner.credits = 10;
  s.runner.clicks = 4;
  s.corp.credits = 20;
  s.activeSide = "runner";
  s.timingKey = "runner.takeAction";
  s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
  s = must(s, { type: "rez_ice", cardId: "ice-1" });
  s = must(s, { type: "pass_window" });
  expect(s.timingKey).toBe("run.encounterPaw");
  return s;
}

describe("MS cost.powerCounters IR (always)", () => {
  it("canPayCost / payCost spend hosted power counters", () => {
    const s = createInitialState();
    const card = instantiateCard("propeller", "p-1", "runner:rig");
    card.powerCounters = 3;
    s.cards["p-1"] = card;
    s.runner.rig.push("p-1");
    expect(canPayCost(s, "runner", { powerCounters: 1 }, card)).toBe(true);
    expect(canPayCost(s, "runner", { powerCounters: 4 }, card)).toBe(false);
    payCost(s, "runner", { powerCounters: 2 }, "test", card);
    expect(card.powerCounters).toBe(1);
    expect(s.log.some((l) => l.includes("power counter"))).toBe(true);
  });

  it("Revolver-shaped power-counter break spends counter and breaks sub", () => {
    let s = encounterHq("tithe", "revolver", {
      powerCounters: 6,
      breakViaPaidOnly: true,
    });
    const br = s.cards["br-1"]!;
    br.paidAbilities = [
      ...(br.paidAbilities ?? []).filter((a) => a.id !== "revolver-power-break"),
      {
        id: "revolver-power-break",
        label: "Spend 1 power counter: break 1 sentry subroutine",
        clickCost: 0,
        creditCost: 0,
        cost: { powerCounters: 1 },
        windows: ["encounter_paw"],
        effect: fx.do({
          kind: "break_encounter_subroutine",
          requireSubtype: "sentry",
        }),
      },
    ];
    if (br.breaker) br.breaker.breakViaPaidAbilityOnly = true;

    const before = br.powerCounters ?? 0;
    s = must(s, {
      type: "use_paid_ability",
      cardId: "br-1",
      abilityId: "revolver-power-break",
    });
    expect(s.cards["br-1"]!.powerCounters).toBe(before - 1);
    expect(s.run?.encounter?.broken.some(Boolean)).toBe(true);
  });

  it("breakViaPaidAbilityOnly blocks standard break_subroutine", () => {
    const s = encounterHq("tithe", "revolver", {
      powerCounters: 6,
      breakViaPaidOnly: true,
    });
    const view = queryLegality(s);
    expect(
      view.legal.some(
        (e) =>
          e.action.type === "break_subroutine" &&
          e.action.breakerId === "br-1",
      ),
    ).toBe(false);
    const bad = applyAction(s, {
      type: "break_subroutine",
      breakerId: "br-1",
      subIndex: 0,
    });
    expect(bad.ok).toBe(false);
  });

  it("Propeller-shaped power-counter pump spends counter and boosts strength", () => {
    let s = encounterHq("ping", "propeller", { powerCounters: 4 });
    const br = s.cards["br-1"]!;
    br.paidAbilities = [
      ...(br.paidAbilities ?? []).filter((a) => a.id !== "propeller-power-pump"),
      {
        id: "propeller-power-pump",
        label: "Spend 1 power counter: +2 strength",
        clickCost: 0,
        creditCost: 0,
        cost: { powerCounters: 1 },
        windows: ["encounter_paw"],
        effect: fx.do({ kind: "pump_strength", amount: 2 }),
      },
    ];
    const beforeStr = effectiveBreakerStrength(s, "br-1");
    const beforePc = br.powerCounters ?? 0;
    s = must(s, {
      type: "use_paid_ability",
      cardId: "br-1",
      abilityId: "propeller-power-pump",
    });
    expect(s.cards["br-1"]!.powerCounters).toBe(beforePc - 1);
    expect(effectiveBreakerStrength(s, "br-1")).toBe(beforeStr + 2);
  });

  it("cannot use power-counter ability with zero counters", () => {
    const s = encounterHq("ping", "propeller", { powerCounters: 0 });
    const br = s.cards["br-1"]!;
    br.paidAbilities = [
      {
        id: "propeller-power-pump",
        label: "Spend 1 power counter: +2 strength",
        clickCost: 0,
        creditCost: 0,
        cost: { powerCounters: 1 },
        windows: ["encounter_paw"],
        effect: fx.do({ kind: "pump_strength", amount: 2 }),
      },
    ];
    const r = applyAction(s, {
      type: "use_paid_ability",
      cardId: "br-1",
      abilityId: "propeller-power-pump",
    });
    expect(r.ok).toBe(false);
  });
});

describe("MS power-counter card JSON wiring (v0.31.0+)", () => {
  it("clears unsupported on Revolver + Propeller", () => {
    expect(getCardDef("revolver").unsupported).toEqual([]);
    expect(getCardDef("propeller").unsupported).toEqual([]);
    expect(getCardDef("revolver").breaker?.breakViaPaidAbilityOnly).toBe(true);
    expect(
      getCardDef("revolver").paidAbilities?.some(
        (a) => a.id === "revolver-power-break" && a.cost?.powerCounters === 1,
      ),
    ).toBe(true);
    expect(
      getCardDef("propeller").paidAbilities?.some(
        (a) => a.cost?.powerCounters === 1,
      ),
    ).toBe(true);
  });
});
