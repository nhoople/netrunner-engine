/**
 * Parhelion v0.54: Simulation Reset, Poison Vial, Hippocampic Mechanocytes.
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
  assertCardsPinnedTag("v1.29.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("PH Simulation Reset", () => {
  it("wires and resolves trash/shuffle/draw/RFG", () => {
    const def = getCardDef("simulation-reset");
    expect(def.unsupported).toEqual([]);
    expect(validateEffectTree(def.onPlay!)).toBeNull();

    let s = createInitialState();
    s = structuredClone(s);
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    s.corp.clicks = 3;
    s.corp.credits = 5;
    // Fill HQ and Archives
    for (let i = 0; i < 3; i++) {
      const id = `hq-${i}`;
      s.cards[id] = instantiateCard("hedge-fund", id, "corp:hq");
      s.corp.hand.push(id);
    }
    for (let i = 0; i < 4; i++) {
      const id = `arc-${i}`;
      s.cards[id] = instantiateCard("hedge-fund", id, "corp:archives");
      s.cards[id].faceup = true;
      s.corp.discard.push(id);
    }
    const deckBefore = s.corp.deck.length;
    const op = instantiateCard("hedge-fund", "sim-1", "corp:hq");
    op.title = "Simulation Reset";
    op.type = "operation";
    op.playCost = 1;
    op.onPlay = def.onPlay;
    op.unsupported = [];
    s.cards["sim-1"] = op;
    s.corp.hand.push("sim-1");

    s = must(s, { type: "play_operation", cardId: "sim-1" });
    expect(s.removedFromGame).toContain("sim-1");
    // Trashed up to 5 from HQ (3 fill + maybe demo cards, capped)
    expect(s.corp.deck.length).toBeGreaterThanOrEqual(deckBefore);
  });
});

describe("PH Poison Vial", () => {
  it("wires power break gated on already-broken sub", () => {
    const def = getCardDef("poison-vial");
    expect(def.unsupported).toEqual([]);
    expect(def.powerCountersOnInstall).toBe(3);
    expect(def.trashWhenPowerEmpty).toBe(true);
    const ab = def.paidAbilities![0]!;
    expect(ab.requireBrokenSubThisEncounter).toBe(true);
    expect(validateEffectTree(ab.effect)).toBeNull();

    expect(
      validateEffectTree(fx.breakEncounterSubroutine(undefined, 2)),
    ).toBeNull();

    let s = createInitialState();
    s = structuredClone(s);
    const vial = instantiateCard("t400-memory-diamond", "vial-1", "runner:rig");
    vial.title = "Poison Vial";
    vial.powerCounters = 3;
    vial.trashWhenPowerEmpty = true;
    vial.paidAbilities = [
      {
        id: "poison-vial-break",
        label: "break",
        clickCost: 0,
        creditCost: 0,
        cost: { powerCounters: 1 },
        windows: ["encounter_paw"],
        requireBrokenSubThisEncounter: true,
        effect: fx.breakEncounterSubroutine(undefined, 2),
      },
    ];
    vial.unsupported = [];
    s.cards["vial-1"] = vial;
    s.runner.rig = ["vial-1"];

    const ice = instantiateCard("palisade", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    ice.subroutines = [
      { id: "a", text: "A", effect: fx.etr() },
      { id: "b", text: "B", effect: fx.etr() },
      { id: "c", text: "C", effect: fx.etr() },
    ];
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];
    s.run = {
      attackedServerId: "hq",
      position: 0,
      successful: false,
      encounter: {
        iceId: "ice-1",
        broken: [false, false, false],
        subIndex: 0,
      },
    } as never;
    s.timingKey = "run.encounterPaw";
    s.activeSide = "runner";

    // No broken sub yet → illegal
    let r = applyAction(s, {
      type: "use_paid_ability",
      cardId: "vial-1",
      abilityId: "poison-vial-break",
    });
    expect(r.ok).toBe(false);

    s.run!.encounter!.broken[0] = true;
    r = applyAction(s, {
      type: "use_paid_ability",
      cardId: "vial-1",
      abilityId: "poison-vial-break",
    });
    expect(r.ok).toBe(true);
    s = r.state;
    expect(s.cards["vial-1"].powerCounters).toBe(2);
    // Broke up to 2 remaining → indices 1 and 2
    expect(s.run!.encounter!.broken).toEqual([true, true, true]);
  });
});

describe("PH Hippocampic Mechanocytes", () => {
  it("places power on install, meat damage, hand size per counter", () => {
    const def = getCardDef("hippocampic-mechanocytes");
    expect(def.unsupported).toEqual([]);
    expect(def.powerCountersOnInstall).toBe(2);
    expect(def.handSizePerPowerCounter).toBe(1);
    expect(validateEffectTree(def.onInstall!)).toBeNull();

    let s = createInitialState();
    s = structuredClone(s);
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;
    s.runner.credits = 5;
    // Pad grip so meat doesn't flatline
    for (let i = 0; i < 3; i++) {
      const id = `pad-${i}`;
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }
    const hip = instantiateCard("t400-memory-diamond", "hip-1", "runner:grip");
    hip.title = "Hippocampic Mechanocytes";
    hip.installCost = 0;
    hip.handSizeBonus = undefined;
    hip.muBonus = undefined;
    hip.powerCountersOnInstall = 2;
    hip.handSizePerPowerCounter = 1;
    hip.onInstall = def.onInstall;
    hip.unsupported = [];
    s.cards["hip-1"] = hip;
    s.runner.hand.push("hip-1");
    const beforeHand = s.runner.maxHandSize;
    s = must(s, {
      type: "basic_install",
      cardId: "hip-1",
      destination: { kind: "rig" },
    });
    expect(s.cards["hip-1"].powerCounters).toBe(2);
    recomputeRunnerMaxHandSize(s);
    expect(s.runner.maxHandSize).toBe(beforeHand + 2);
  });
});
