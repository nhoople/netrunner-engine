/**
 * Parhelion v0.66: Raindrops Cut Stone + Superdeep Borehole.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  checkWinConditions,
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
  assertCardsPinnedTag("v1.41.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("PH Raindrops Cut Stone", () => {
  it("wires runEvent power-on-sub + onRunEnd draw/gain", () => {
    const def = getCardDef("raindrops-cut-stone");
    expect(def.unsupported ?? []).toEqual([]);
    expect(def.runEvent?.servers).toBe("any");
    expect(def.runEvent?.addPowerCounterOnSubroutineResolve).toBe(1);
    expect(def.runEvent?.onRunEnd).toEqual(
      fx.seq(fx.drawPerPowerCounter("runner", 1), fx.gainCredits("runner", 3)),
    );
    expect(validateEffectTree(def.runEvent!.onRunEnd!)).toBeNull();
  });

  it("places power on sub resolve (incl. ETR) then draws + gains on run end", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 1;
    s.runner.credits = 5;
    s.runner.hand = ["rain-1"];
    s.runner.deck = [];
    for (let i = 0; i < 5; i++) {
      const id = `deck-${i}`;
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:stack");
      s.runner.deck.push(id);
    }
    const ev = instantiateCard("raindrops-cut-stone", "rain-1", "runner:grip");
    ev.runEvent = {
      servers: "any",
      addPowerCounterOnSubroutineResolve: 1,
      onRunEnd: fx.seq(
        fx.drawPerPowerCounter("runner", 1),
        fx.gainCredits("runner", 3),
      ),
    };
    s.cards["rain-1"] = ev;

    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    ice.subroutines = [
      {
        id: "etr",
        text: "End the run.",
        effect: fx.etr(),
      },
    ];
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];

    const creditsBefore = s.runner.credits;
    s = must(s, {
      type: "play_event",
      cardId: "rain-1",
      serverId: "hq" as ServerId,
    });
    // Walk approach / encounter PAWs until ETR ends the run.
    for (let i = 0; i < 16 && s.run; i++) {
      const r = applyAction(s, { type: "pass_window" });
      if (!r.ok) break;
      s = r.state;
    }
    expect(s.run).toBeNull();
    expect(s.cards["rain-1"]!.powerCounters).toBe(1);
    // Played from hand (empty) then drew 1 for the power counter.
    expect(s.runner.hand.length).toBe(1);
    expect(s.runner.credits).toBe(creditsBefore - 1 + 3); // playCost 1, gain 3
    expect(s.log.some((l) => l.includes("power counter"))).toBe(true);
  });

  it("draw_per_power_counter draws N × hosted power", () => {
    let s = createInitialState();
    s = structuredClone(s);
    for (let i = 0; i < 4; i++) {
      const id = `d-${i}`;
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:stack");
      s.runner.deck.push(id);
    }
    const src = instantiateCard("raindrops-cut-stone", "r-1", "runner:heap");
    src.powerCounters = 2;
    s.cards["r-1"] = src;
    const before = s.runner.hand.length;
    const r = evalEffect(
      { state: s, sourceId: "r-1" },
      fx.drawPerPowerCounter("runner", 1),
    );
    expect(r.ok).toBe(true);
    expect(s.runner.hand.length).toBe(before + 2);
  });
});

describe("PH Superdeep Borehole", () => {
  it("wires hosted BP on rez + take on turn begin + win-when-empty", () => {
    const def = getCardDef("superdeep-borehole");
    expect(def.unsupported ?? []).toEqual([]);
    expect(def.badPublicityCountersOnRez).toBe(6);
    expect(def.winWhenBadPublicityCountersEmpty).toBe(true);
    expect(def.onTurnBegin).toEqual(fx.takeHostedBadPublicity(1));
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
  });

  it("rez loads hosted BP that is not player BP; take moves to player BP", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.activeSide = "corp";
    s.timingKey = "corp.actionPaw";
    s.corp.clicks = 1;
    s.corp.credits = 10;
    s.corp.badPublicity = 0;
    const hole = instantiateCard("superdeep-borehole", "bh-1", "server:remote-1:root");
    hole.badPublicityCountersOnRez = 6;
    hole.winWhenBadPublicityCountersEmpty = true;
    hole.onTurnBegin = fx.takeHostedBadPublicity(1);
    hole.rezCost = 6;
    s.cards["bh-1"] = hole;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["bh-1"],
    };

    s = must(s, { type: "rez_asset", cardId: "bh-1" });
    expect(s.cards["bh-1"]!.rezzed).toBe(true);
    expect(s.cards["bh-1"]!.badPublicityCounters).toBe(6);
    expect(s.corp.badPublicity).toBe(0); // hosted ≠ player BP

    const r = evalEffect(
      { state: s, sourceId: "bh-1" },
      fx.takeHostedBadPublicity(1),
    );
    expect(r.ok).toBe(true);
    expect(s.cards["bh-1"]!.badPublicityCounters).toBe(5);
    expect(s.corp.badPublicity).toBe(1);
    expect(s.winner).toBeNull();
  });

  it("Corp wins when hosted BP counters empty", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const hole = instantiateCard("superdeep-borehole", "bh-2", "server:remote-1:root");
    hole.rezzed = true;
    hole.badPublicityCounters = 1;
    hole.winWhenBadPublicityCountersEmpty = true;
    s.cards["bh-2"] = hole;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["bh-2"],
    };
    const r = evalEffect(
      { state: s, sourceId: "bh-2" },
      fx.takeHostedBadPublicity(1),
    );
    expect(r.ok).toBe(true);
    expect(s.cards["bh-2"]!.badPublicityCounters).toBe(0);
    expect(s.corp.badPublicity).toBe(1);
    expect(s.winner).toBe("corp");
    expect(s.winReason).toBe("corp_alternate");
    expect(s.done).toBe(true);
  });

  it("checkWinConditions sees empty rezzed borehole", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const hole = instantiateCard("superdeep-borehole", "bh-3", "server:remote-1:root");
    hole.rezzed = true;
    hole.badPublicityCounters = 0;
    hole.winWhenBadPublicityCountersEmpty = true;
    s.cards["bh-3"] = hole;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["bh-3"],
    };
    checkWinConditions(s);
    expect(s.winner).toBe("corp");
    expect(s.winReason).toBe("corp_alternate");
  });
});
