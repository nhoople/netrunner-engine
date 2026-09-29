/**
 * Parhelion v0.58: Orca, Info Bounty, Abaasy.
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

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.85.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("PH Orca", () => {
  it("wires sentry breaker + onFullyBreakOncePerTurn may-charge", () => {
    const def = getCardDef("orca");
    expect(def.unsupported).toEqual([]);
    expect(def.breaker?.breaksSubtype).toBe("sentry");
    expect(def.breaker?.breakMaxSubs).toBe(99);
    expect(validateEffectTree(def.onFullyBreakOncePerTurn!)).toBeNull();

    let s = createInitialState();
    s = structuredClone(s);
    const orca = instantiateCard("orca", "orca-1", "runner:rig");
    s.cards["orca-1"] = orca;
    s.runner.rig = ["orca-1"];
    const prop = instantiateCard("propeller", "prop-1", "runner:rig");
    prop.powerCounters = 1;
    s.cards["prop-1"] = prop;
    s.runner.rig.push("prop-1");

    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    ice.subtypes = ["sentry"];
    ice.subroutines = [
      { text: "ETR", effect: fx.do({ kind: "end_the_run" }) },
      { text: "ETR2", effect: fx.do({ kind: "end_the_run" }) },
    ];
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];
    s.runner.credits = 20;
    s.runner.clicks = 4;
    s.activeSide = "runner";
    s.timingKey = "run.encounterPaw";
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: {
        iceId: "ice-1",
        broken: [false, false],
      },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    // Match strength
    s.run.strengthBoosts["orca-1"] = 10;

    s = must(s, {
      type: "break_subroutine",
      breakerId: "orca-1",
      subIndex: 0,
    });
    // Multi-break: free second break
    s = must(s, {
      type: "break_subroutine",
      breakerId: "orca-1",
      subIndex: 1,
    });
    expect(s.turn.onFullyBreakFiredIds).toContain("orca-1");
    expect(s.pendingChoice?.chooser).toBe("runner");
    s = must(s, { type: "choose_option", optionId: "charge" });
    // sole chargeable → auto
    expect(s.cards["prop-1"]!.powerCounters).toBe(2);
  });
});

describe("PH Abaasy", () => {
  it("wires code gate breaker + may_trash_from_grip_to_draw", () => {
    const def = getCardDef("abaasy");
    expect(def.unsupported).toEqual([]);
    expect(def.breaker?.breaksSubtype).toBe("code gate");
    expect(validateEffectTree(def.onFullyBreakOncePerTurn!)).toBeNull();
    expect(validateEffectTree(fx.mayTrashFromGripToDraw())).toBeNull();

    let s = createInitialState();
    s = structuredClone(s);
    const filler = instantiateCard("sure-gamble", "sg-1", "runner:grip");
    s.cards["sg-1"] = filler;
    s.runner.hand = ["sg-1"];
    const handBefore = s.runner.hand.length;
    const deckBefore = s.runner.deck.length;
    const r = evalEffect(
      { state: s, sourceId: "runner-id" },
      fx.mayTrashFromGripToDraw(),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice?.chooser).toBe("runner");
    s = must(s, { type: "choose_option", optionId: "trash-draw:sg-1" });
    expect(s.runner.hand).not.toContain("sg-1");
    expect(s.runner.discard).toContain("sg-1");
    expect(s.runner.hand.length).toBe(handBefore); // trash 1, draw 1
    expect(s.runner.deck.length).toBe(deckBefore - 1);
  });
});

describe("PH Info Bounty", () => {
  it("wires identify_mark + gain on first mark run end if breached", () => {
    const def = getCardDef("info-bounty");
    expect(def.unsupported).toEqual([]);
    expect(def.onTurnBegin).toEqual(fx.identifyMark());
    expect(def.gainCreditsOnFirstMarkRunEndIfBreached).toBe(2);

    let s = createInitialState();
    s = structuredClone(s);
    const ib = instantiateCard("info-bounty", "ib-1", "runner:rig");
    s.cards["ib-1"] = ib;
    s.runner.rig = ["ib-1"];
    s.markServerId = "archives";
    s.servers.archives.ice = [];
    s.corp.discard = [];
    s.runner.credits = 5;
    s.runner.clicks = 4;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    const creditsBefore = s.runner.credits;
    s = must(s, { type: "basic_run", serverId: "archives" });
    expect(s.run).toBeNull();
    expect(s.turn.infoBountyMarkRunEndUsed).toBe(true);
    expect(s.runner.credits).toBe(creditsBefore + 2);
  });
});
