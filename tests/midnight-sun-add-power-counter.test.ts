/**
 * Midnight Sun add_power_counter cluster:
 * place power counters (Hyperbaric paid ability) + Endurance success/break.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  validateEffectTree,
} from "../src/index.js";
import type { ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v0.16.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("MS add_power_counter IR (always)", () => {
  it("accepts add_power_counter Effect IR", () => {
    expect(validateEffectTree(fx.addPowerCounter(1))).toBeNull();
  });

  it("add_power_counter places counters on source (no charge ≥1 gate)", () => {
    const s = createInitialState();
    const card = instantiateCard("hyperbaric", "h-1", "runner:rig");
    card.powerCounters = 0;
    s.cards["h-1"] = card;
    s.runner.rig.push("h-1");
    const r = evalEffect({ state: s, sourceId: "h-1" }, fx.addPowerCounter(2));
    expect(r.ok).toBe(true);
    expect(card.powerCounters).toBe(2);
    expect(s.log.some((l) => l.includes("power counter"))).toBe(true);
  });

  it("Hyperbaric-shaped paid ability spends 2¢ and places a power counter", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const h = instantiateCard("hyperbaric", "h-1", "runner:rig");
    h.powerCounters = 1;
    h.paidAbilities = [
      {
        id: "hyperbaric-place-power",
        label: "2¢: Place 1 power counter on Hyperbaric",
        clickCost: 0,
        creditCost: 2,
        cost: { credits: 2 },
        windows: ["runner_action_paw"],
        effect: fx.addPowerCounter(1),
      },
    ];
    s.cards["h-1"] = h;
    s.runner.rig = ["h-1"];
    s.runner.credits = 5;
    s.activeSide = "runner";
    s.timingKey = "runner.actionPaw";

    const before = h.powerCounters ?? 0;
    s = must(s, {
      type: "use_paid_ability",
      cardId: "h-1",
      abilityId: "hyperbaric-place-power",
    });
    expect(s.runner.credits).toBe(3);
    expect(s.cards["h-1"]!.powerCounters).toBe(before + 1);
  });

  it("Endurance-shaped onSuccessfulRunOncePerTurn places a power counter", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const end = instantiateCard("endurance", "end-1", "runner:rig");
    end.powerCounters = 3;
    end.onSuccessfulRunOncePerTurn = true;
    end.onSuccessfulRun = fx.addPowerCounter(1);
    s.cards["end-1"] = end;
    s.runner.rig = ["end-1"];
    s.servers.hq.ice = [];
    s.servers.hq.root = [];
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;

    s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
    expect(s.run).toBeNull();
    expect(s.turn.successfulRunThisTurn).toBe(true);
    expect(s.cards["end-1"]!.powerCounters).toBe(4);
    expect(s.turn.onSuccessfulRunFiredIds).toContain("end-1");

    // Second success same turn: no second place
    if (s.timingKey === "runner.actionPaw") {
      s = must(s, { type: "pass_window" });
    }
    expect(s.timingKey).toBe("runner.takeAction");
    s.runner.clicks = 4;
    s = must(s, { type: "basic_run", serverId: "rd" as ServerId });
    expect(s.cards["end-1"]!.powerCounters).toBe(4);
  });

  it("Endurance-shaped 2-counter break ability breaks up to 2 subs", () => {
    let s = createInitialState();
    s = structuredClone(s);
    // Ice with 2 ETR subs (Maskirovka)
    const ice = instantiateCard("maskirovka", "ice-1", "server:hq:ice");
    ice.rezzed = false;
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];

    const end = instantiateCard("endurance", "end-1", "runner:rig");
    end.powerCounters = 4;
    end.paidAbilities = [
      {
        id: "endurance-power-break",
        label: "Spend 2 power counters: break up to 2 subroutines",
        clickCost: 0,
        creditCost: 0,
        cost: { powerCounters: 2 },
        windows: ["encounter_paw"],
        effect: fx.seq(
          fx.do({ kind: "break_encounter_subroutine" }),
          fx.do({ kind: "break_encounter_subroutine" }),
        ),
      },
    ];
    s.cards["end-1"] = end;
    s.runner.rig = ["end-1"];
    s.runner.credits = 10;
    s.runner.clicks = 4;
    s.corp.credits = 20;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
    s = must(s, { type: "rez_ice", cardId: "ice-1" });
    s = must(s, { type: "pass_window" });
    expect(s.timingKey).toBe("run.encounterPaw");

    const before = s.cards["end-1"]!.powerCounters ?? 0;
    s = must(s, {
      type: "use_paid_ability",
      cardId: "end-1",
      abilityId: "endurance-power-break",
    });
    expect(s.cards["end-1"]!.powerCounters).toBe(before - 2);
    expect(s.run?.encounter?.broken.every(Boolean)).toBe(true);
  });
});

describe("MS Hyperbaric / Endurance card wiring (v0.16.0+)", () => {
  it("Hyperbaric fully wired onto add_power_counter", () => {
    const h = getCardDef("hyperbaric");
    expect(h.unsupported).toEqual([]);
    expect(h.strengthPerPowerCounter).toBe(true);
    expect(h.powerCountersOnInstall).toBe(1);
    const place = h.paidAbilities?.find((a) => a.id === "hyperbaric-place-power");
    expect(place?.cost?.credits).toBe(2);
    expect(place?.effect?.op).toBe("do");
    expect((place?.effect as { action?: { kind?: string } })?.action?.kind).toBe(
      "add_power_counter",
    );
  });

  it("Endurance fully wired; console note cleared", () => {
    const e = getCardDef("endurance");
    expect(e.unsupported).toEqual([]);
    expect(e.onSuccessfulRunOncePerTurn).toBe(true);
    expect(e.powerCountersOnInstall).toBe(3);
    expect(e.muBonus).toBe(2);
    expect(e.onSuccessfulRun).toBeTruthy();
    expect(
      e.paidAbilities?.some(
        (a) => a.id === "endurance-power-break" && a.cost?.powerCounters === 2,
      ),
    ).toBe(true);
  });

  it("live Hyperbaric paid ability from card def places a counter", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const h = instantiateCard("hyperbaric", "h-live", "runner:rig");
    s.cards["h-live"] = h;
    s.runner.rig = ["h-live"];
    s.runner.credits = 5;
    s.activeSide = "runner";
    s.timingKey = "runner.actionPaw";
    const before = h.powerCounters ?? 0;
    s = must(s, {
      type: "use_paid_ability",
      cardId: "h-live",
      abilityId: "hyperbaric-place-power",
    });
    expect(s.cards["h-live"]!.powerCounters).toBe(before + 1);
    expect(s.runner.credits).toBe(3);
  });

  it("live Endurance places on first successful run", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const end = instantiateCard("endurance", "end-live", "runner:rig");
    s.cards["end-live"] = end;
    s.runner.rig = ["end-live"];
    s.servers.archives.ice = [];
    s.servers.archives.root = [];
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;
    const before = end.powerCounters ?? 0;
    s = must(s, { type: "basic_run", serverId: "archives" as ServerId });
    expect(s.cards["end-live"]!.powerCounters).toBe(before + 1);
  });
});
