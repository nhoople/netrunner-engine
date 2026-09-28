/**
 * Parhelion cyber / power / run-event slice:
 * Zenit Chip (first successful central → draw), Nga (power → may sabotage),
 * Dr. Nuka Vrolyck (power → draw), Finality (core cost + R&D bonus access),
 * Ampère (deckbuilding-only identity clear).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
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
  assertCardsPinnedTag("v1.09.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

function fillGrip(
  s: ReturnType<typeof createInitialState>,
  n: number,
  prefix: string,
) {
  for (let i = 0; i < n; i++) {
    const id = `${prefix}-${i}`;
    s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    s.runner.hand.push(id);
  }
}

function finishToTakeAction(
  state: ReturnType<typeof createInitialState>,
): ReturnType<typeof createInitialState> {
  let s = state;
  while (s.run && s.timingKey === "breach.awaitAccess") {
    if (s.run.accessCandidates.length === 0) {
      s = must(s, { type: "finish_breach" });
    } else {
      s = must(s, { type: "access_card", cardId: s.run.accessCandidates[0]! });
    }
  }
  // Drain pending sabotage / choice if present
  if (s.pendingChoice) {
    const decline =
      s.pendingChoice.options.find((o) => o.id === "decline") ??
      s.pendingChoice.options[0]!;
    s = must(s, { type: "choose_option", optionId: decline.id });
  }
  if (s.pendingSabotage) {
    s = must(s, { type: "resolve_sabotage", hqCardIds: [] });
  }
  if (s.timingKey === "runner.actionPaw") {
    s = must(s, { type: "pass_window" });
  }
  return s;
}

describe("PH Zenit Chip first successful central draw", () => {
  it("draws on first successful central; not on remote; not twice", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const zen = instantiateCard("sure-gamble", "zen-1", "runner:rig");
    zen.title = "Zenit Chip JZ-2MJ";
    zen.type = "hardware";
    zen.onFirstSuccessfulCentralRunThisTurn = fx.draw("runner", 1);
    zen.unsupported = [];
    s.cards["zen-1"] = zen;
    s.runner.rig = ["zen-1"];
    // Stack cards to draw
    for (let i = 0; i < 3; i++) {
      const id = `stk-${i}`;
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:stack");
      s.runner.deck.push(id);
    }
    s.servers.hq.ice = [];
    s.servers.rd.ice = [];
    s.servers["remote-1"] = {
      id: "remote-1" as ServerId,
      kind: "remote",
      ice: [],
      root: [],
    };
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;

    const grip0 = s.runner.hand.length;
    s = must(s, { type: "basic_run", serverId: "remote-1" as ServerId });
    expect(s.runner.hand.length).toBe(grip0);
    s = finishToTakeAction(s);
    s.runner.clicks = 4;

    s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
    expect(s.runner.hand.length).toBe(grip0 + 1);
    s = finishToTakeAction(s);
    s.runner.clicks = 4;

    const grip1 = s.runner.hand.length;
    s = must(s, { type: "basic_run", serverId: "rd" as ServerId });
    expect(s.runner.hand.length).toBe(grip1);
  });
});

describe("PH Nga first successful run may sabotage", () => {
  it("offers choice; sabotage path removes power and pending sabotage", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const nga = instantiateCard("sure-gamble", "nga-1", "runner:rig");
    nga.title = "Nga";
    nga.type = "program";
    nga.powerCounters = 3;
    nga.trashWhenPowerEmpty = true;
    nga.onSuccessfulRunOncePerTurn = true;
    nga.onSuccessfulRun = fx.choose("runner", [
      {
        id: "sabotage",
        label: "Remove 1 power counter to sabotage 1",
        effect: fx.seq(fx.removePowerCounter(1), fx.sabotage(1, true)),
      },
      {
        id: "decline",
        label: "Decline",
        effect: fx.gainCredits("runner", 0),
      },
    ]);
    nga.unsupported = [];
    s.cards["nga-1"] = nga;
    s.runner.rig = ["nga-1"];
    s.servers.hq.ice = [];
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;

    s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
    expect(s.pendingChoice?.sourceId).toBe("nga-1");
    s = must(s, { type: "choose_option", optionId: "sabotage" });
    expect(s.cards["nga-1"]!.powerCounters).toBe(2);
    expect(s.pendingSabotage?.amount).toBe(1);
  });
});

describe("PH Dr. Nuka Vrolyck power draw", () => {
  it("pays click + power to draw 3; trashes when empty", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const nuka = instantiateCard("sure-gamble", "nuka-1", "runner:rig");
    nuka.title = "Dr. Nuka Vrolyck";
    nuka.type = "resource";
    nuka.powerCounters = 2;
    nuka.trashWhenPowerEmpty = true;
    nuka.paidAbilities = [
      {
        id: "nuka-draw",
        label: "[click], hosted power counter: Draw 3 cards",
        clickCost: 1,
        creditCost: 0,
        cost: { clicks: 1, powerCounters: 1 },
        windows: ["runner_action_paw"],
        effect: fx.draw("runner", 3),
      },
    ];
    nuka.unsupported = [];
    s.cards["nuka-1"] = nuka;
    s.runner.rig = ["nuka-1"];
    for (let i = 0; i < 6; i++) {
      const id = `stk-n-${i}`;
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:stack");
      s.runner.deck.push(id);
    }
    s.activeSide = "runner";
    s.timingKey = "runner.actionPaw";
    s.runner.clicks = 4;
    const grip0 = s.runner.hand.length;

    s = must(s, {
      type: "use_paid_ability",
      cardId: "nuka-1",
      abilityId: "nuka-draw",
    });
    expect(s.runner.hand.length).toBe(grip0 + 3);
    expect(s.cards["nuka-1"]!.powerCounters).toBe(1);
    expect(s.runner.rig).toContain("nuka-1");

    s.timingKey = "runner.actionPaw";
    s = must(s, {
      type: "use_paid_ability",
      cardId: "nuka-1",
      abilityId: "nuka-draw",
    });
    expect(s.cards["nuka-1"]!.powerCounters).toBe(0);
    expect(s.runner.rig).not.toContain("nuka-1");
    expect(s.runner.discard).toContain("nuka-1");
  });
});

describe("PH Finality playAdditionalCost + R&D bonus access", () => {
  it("pays core damage and starts R&D run with bonusAccess 3", () => {
    let s = createInitialState();
    s = structuredClone(s);
    fillGrip(s, 4, "fill");
    const ev = instantiateCard("jailbreak", "fin-1", "runner:grip");
    ev.title = "Finality";
    ev.playCost = 2;
    ev.playAdditionalCost = fx.coreDamage(1);
    ev.runEvent = { servers: "rd", bonusAccess: 3 };
    ev.unsupported = [];
    s.cards["fin-1"] = ev;
    s.runner.hand.push("fin-1");
    s.runner.credits = 5;
    s.runner.clicks = 4;
    s.servers.rd.ice = [];
    for (let i = 0; i < 5; i++) {
      const id = `rd-${i}`;
      s.cards[id] = instantiateCard("hedge-fund", id, "corp:rd");
      s.corp.deck.push(id);
    }
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "play_event", cardId: "fin-1", serverId: "rd" });
    expect(s.runner.brainDamage).toBe(1);
    expect(s.run?.attackedServerId).toBe("rd");
    expect(s.run?.bonusAccess).toBe(3);
    expect(s.turn.successfulRunThisTurn).toBe(true);
  });
});

describe("PH cyber/power card wiring (pin v0.49.0)", () => {
  it("wires Ampère / Zenit / Nga / Nuka / Finality with empty unsupported", () => {
    const ampere = getCardDef("ampere-cybernetics-for-anyone");
    expect(ampere.unsupported).toEqual([]);
    expect(ampere.type).toBe("identity");

    const zenit = getCardDef("zenit-chip-jz-2mj");
    expect(zenit.unsupported).toEqual([]);
    expect(zenit.onInstall).toEqual(fx.coreDamage(1));
    expect(zenit.onFirstSuccessfulCentralRunThisTurn).toEqual(
      fx.draw("runner", 1),
    );

    const nga = getCardDef("nga");
    expect(nga.unsupported).toEqual([]);
    expect(nga.powerCountersOnInstall).toBe(3);
    expect(nga.trashWhenPowerEmpty).toBe(true);
    expect(nga.onSuccessfulRunOncePerTurn).toBe(true);
    expect(nga.onSuccessfulRun).toBeTruthy();
    expect(validateEffectTree(nga.onSuccessfulRun!)).toBeNull();

    const nuka = getCardDef("dr-nuka-vrolyck");
    expect(nuka.unsupported).toEqual([]);
    expect(nuka.powerCountersOnInstall).toBe(2);
    expect(nuka.trashWhenPowerEmpty).toBe(true);
    expect(nuka.paidAbilities?.[0]?.cost).toEqual({
      clicks: 1,
      powerCounters: 1,
    });

    const finality = getCardDef("finality");
    expect(finality.unsupported).toEqual([]);
    expect(finality.playAdditionalCost).toEqual(fx.coreDamage(1));
    expect(finality.runEvent).toEqual({ servers: "rd", bonusAccess: 3 });
  });
});
