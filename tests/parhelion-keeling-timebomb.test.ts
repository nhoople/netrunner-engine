/**
 * Parhelion v0.55: Dr. Vientiane Keeling + Time Bomb.
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
import { recomputeRunnerMaxHandSize } from "../src/state/handSize.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.04.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("PH Dr. Vientiane Keeling", () => {
  it("wires onRez/onTurnBegin power + runner hand-size penalty", () => {
    const def = getCardDef("dr-vientiane-keeling");
    expect(def.unsupported).toEqual([]);
    expect(def.runnerHandSizePenaltyPerPowerCounter).toBe(1);
    expect(validateEffectTree(def.onRez!)).toBeNull();
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();

    let s = createInitialState();
    s = structuredClone(s);
    const keeling = instantiateCard(
      "pad-campaign",
      "keel-1",
      "server:remote1:root",
    );
    keeling.title = "Dr. Vientiane Keeling";
    keeling.rezCost = 0;
    keeling.runnerHandSizePenaltyPerPowerCounter = 1;
    keeling.onRez = def.onRez;
    keeling.onTurnBegin = def.onTurnBegin;
    keeling.unsupported = [];
    s.cards["keel-1"] = keeling;
    if (!s.servers.remote1) {
      s.servers.remote1 = { id: "remote1", kind: "remote", ice: [], root: [] };
    }
    s.servers.remote1.root = ["keel-1"];
    s.corp.credits = 5;
    s.activeSide = "corp";
    s.timingKey = "corp.actionPaw";
    const before = s.runner.maxHandSize;
    s = must(s, { type: "rez_asset", cardId: "keel-1" });
    expect(s.cards["keel-1"].powerCounters).toBe(1);
    recomputeRunnerMaxHandSize(s);
    expect(s.runner.maxHandSize).toBe(before - 1);
  });
});

describe("PH Time Bomb", () => {
  it("requires central success to install; detonates at ≥3 power", () => {
    const def = getCardDef("time-bomb");
    expect(def.unsupported).toEqual([]);
    expect(def.installRequiresSuccessfulCentralRunThisTurn).toBe(true);
    expect(def.powerCountersOnInstall).toBe(1);
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();

    let s = createInitialState();
    s = structuredClone(s);
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;
    s.runner.credits = 5;
    const bomb = instantiateCard("t400-memory-diamond", "bomb-1", "runner:grip");
    bomb.title = "Time Bomb";
    bomb.installCost = 0;
    bomb.handSizeBonus = undefined;
    bomb.muBonus = undefined;
    bomb.installRequiresSuccessfulCentralRunThisTurn = true;
    bomb.powerCountersOnInstall = 1;
    bomb.onTurnBegin = def.onTurnBegin;
    bomb.unsupported = [];
    s.cards["bomb-1"] = bomb;
    s.runner.hand.push("bomb-1");

    let r = applyAction(s, {
      type: "basic_install",
      cardId: "bomb-1",
      destination: { kind: "rig" },
    });
    expect(r.ok).toBe(false);

    s.turn.successfulHqRunThisTurn = true;
    s = must(s, {
      type: "basic_install",
      cardId: "bomb-1",
      destination: { kind: "rig" },
    });
    expect(s.cards["bomb-1"].powerCounters).toBe(1);

    // Simulate turn-begin resolve twice more → reaches 3 and detonates
    s.cards["bomb-1"].powerCounters = 2;
    const er = evalEffect(
      { state: s, sourceId: "bomb-1" },
      def.onTurnBegin!,
    );
    expect(er.ok).toBe(true);
    expect(s.runner.rig).not.toContain("bomb-1");
  });

  it("power_counters_gte cond validates", () => {
    expect(
      validateEffectTree(
        fx.if({ op: "power_counters_gte", amount: 3 }, fx.trashSelf()),
      ),
    ).toBeNull();
  });
});
