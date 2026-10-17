/**
 * Comprehensive Rules examples from chapter 9.
 * Each test plays that example's board. An example that already has a
 * test in a mechanism file stays in that file.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  autoWalk,
  cardsDataPresent,
  CR,
  createInitialState,
  crDataPresent,
  enterStep,
  evalEffect,
  instantiateCard,
} from "../src/index.js";
import { breakerStrength } from "../src/effects/iceStrength.js";
import { onRunnerTurnEnds } from "../src/state/staticFlags.js";
import type { Action, GameState, ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.6");
});

function must(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`${result.error} ${JSON.stringify(result.cites)}`);
  return result.state;
}

function runnerTurn(state: GameState): void {
  state.activeSide = "runner";
  state.timingKey = "runner.takeAction";
}

function openEncounter(
  state: GameState,
  iceId: string,
  subs: number,
  serverId: ServerId = "hq",
): void {
  state.servers[serverId].ice = [iceId];
  state.run = {
    attackedServerId: serverId,
    phase: "encounter",
    position: 0,
    successful: null,
    accessedCardIds: [],
    accessCandidates: [],
    randomAccessLimit: null,
    encounter: {
      iceId,
      broken: Array.from({ length: subs }, () => false),
    },
    endedTheRun: false,
    cannotJackOut: false,
    strengthBoosts: {},
    encounterStrengthBoosts: {},
    iceStrengthBoosts: {},
    accessingCardId: null,
  };
  enterStep(state, "run.encounterPaw");
}

describe("CR examples, chapter 9", () => {
    it("gives Arruaceiras Crew's tag only during an encounter (CR 9.5.6c.ex1)", () => {
    const idle = createInitialState();
    const crew = instantiateCard("arruaceiras-crew", "crew-1", "runner:installed");
    const wall = instantiateCard("ice-wall", "wall-1", "server:hq:ice");
    wall.rezzed = true;
    wall.faceup = true;
    idle.cards["crew-1"] = crew;
    idle.cards["wall-1"] = wall;
    idle.runner.installed = ["crew-1"];
    idle.servers.hq.ice = ["wall-1"];
    runnerTurn(idle);
    const early = applyAction(idle, {
      type: "use_paid_ability",
      cardId: "crew-1",
      abilityId: "arruaceiras-weaken",
    });
    expect(early.ok).toBe(false);

    const s = createInitialState();
    s.cards["crew-1"] = instantiateCard("arruaceiras-crew", "crew-1", "runner:installed");
    const ice = instantiateCard("ice-wall", "wall-1", "server:hq:ice");
    ice.rezzed = true;
    ice.faceup = true;
    s.cards["wall-1"] = ice;
    s.runner.installed = ["crew-1"];
    s.runner.tags = 0;
    openEncounter(s, "wall-1", ice.subroutines?.length ?? 1);
    const weakened = must(s, {
      type: "use_paid_ability",
      cardId: "crew-1",
      abilityId: "arruaceiras-weaken",
    });
    expect(weakened.runner.tags).toBe(1);
    expect(weakened.run?.iceStrengthBoosts["wall-1"]).toBe(-2);
  });

    it("uses Abagnale's trash and interface only on a code gate it can interface (CR 9.5.6c.ex2)", () => {
    const outside = createInitialState();
    outside.cards["ab-1"] = instantiateCard("abagnale", "ab-1", "runner:installed");
    outside.runner.installed = ["ab-1"];
    runnerTurn(outside);
    const trashedEarly = applyAction(outside, {
      type: "use_paid_ability",
      cardId: "ab-1",
      abilityId: "abagnale-bypass",
    });
    expect(trashedEarly.ok).toBe(false);
    const pumpedEarly = applyAction(outside, {
      type: "use_paid_ability",
      cardId: "ab-1",
      abilityId: "abagnale-pump",
    });
    expect(pumpedEarly.ok).toBe(false);

    const barrier = createInitialState();
    const ab = instantiateCard("abagnale", "ab-1", "runner:installed");
    const wall = instantiateCard("ice-wall", "wall-1", "server:hq:ice");
    wall.rezzed = true;
    wall.faceup = true;
    barrier.cards["ab-1"] = ab;
    barrier.cards["wall-1"] = wall;
    barrier.runner.installed = ["ab-1"];
    barrier.runner.credits = 5;
    openEncounter(barrier, "wall-1", wall.subroutines?.length ?? 1);
    const wrongSubtype = applyAction(barrier, {
      type: "use_paid_ability",
      cardId: "ab-1",
      abilityId: "abagnale-bypass",
    });
    expect(wrongSubtype.ok).toBe(false);
    const breakBarrier = applyAction(barrier, {
      type: "break_subroutine",
      breakerId: "ab-1",
      subIndex: 0,
    });
    expect(breakBarrier.ok).toBe(false);

    const weak = createInitialState();
    weak.cards["ab-1"] = instantiateCard("abagnale", "ab-1", "runner:installed");
    const toll = instantiateCard("tollbooth", "toll-1", "server:hq:ice");
    toll.rezzed = true;
    toll.faceup = true;
    weak.cards["toll-1"] = toll;
    weak.runner.installed = ["ab-1"];
    weak.runner.credits = 5;
    openEncounter(weak, "toll-1", toll.subroutines?.length ?? 1);
    expect(breakerStrength(weak, "ab-1")).toBeLessThan(toll.strength ?? 0);
    const cannotInterface = applyAction(weak, {
      type: "break_subroutine",
      breakerId: "ab-1",
      subIndex: 0,
    });
    expect(cannotInterface.ok).toBe(false);

    const gate = createInitialState();
    gate.cards["ab-1"] = instantiateCard("abagnale", "ab-1", "runner:installed");
    const enigma = instantiateCard("enigma", "en-1", "server:hq:ice");
    enigma.rezzed = true;
    enigma.faceup = true;
    gate.cards["en-1"] = enigma;
    gate.runner.installed = ["ab-1"];
    gate.runner.credits = 5;
    openEncounter(gate, "en-1", enigma.subroutines?.length ?? 1);
    const pumped = must(gate, {
      type: "use_paid_ability",
      cardId: "ab-1",
      abilityId: "abagnale-pump",
    });
    expect(breakerStrength(pumped, "ab-1")).toBe(4);
    const broke = must(pumped, {
      type: "break_subroutine",
      breakerId: "ab-1",
      subIndex: 0,
    });
    expect(broke.run?.encounter?.broken[0]).toBe(true);

    const bypass = createInitialState();
    bypass.cards["ab-2"] = instantiateCard("abagnale", "ab-2", "runner:installed");
    const enigma2 = instantiateCard("enigma", "en-2", "server:hq:ice");
    enigma2.rezzed = true;
    enigma2.faceup = true;
    bypass.cards["en-2"] = enigma2;
    bypass.runner.installed = ["ab-2"];
    openEncounter(bypass, "en-2", enigma2.subroutines?.length ?? 1);
    const trashed = must(bypass, {
      type: "use_paid_ability",
      cardId: "ab-2",
      abilityId: "abagnale-bypass",
    });
    expect(trashed.cards["ab-2"]?.zone).toBe("runner:heap");
    expect(trashed.run?.bypassedIceIds).toContain("en-2");
    expect(trashed.run?.encounter?.broken.every(Boolean)).toBe(true);
  });

    it("stops Little Engine's later subroutines after the first ends the run (CR 9.8.7c.ex1)", () => {
    let s = createInitialState();
    const ice = instantiateCard("little-engine", "le-1", "server:hq:ice");
    ice.rezzed = true;
    ice.faceup = true;
    s.cards["le-1"] = ice;
    s.servers.hq.ice = ["le-1"];
    s.runner.credits = 0;
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    enterStep(s, "run.encounter");
    autoWalk(s);
    let guard = 0;
    while (s.run && guard++ < 6) {
      const passed = applyAction(s, { type: "pass_window" });
      if (!passed.ok) break;
      s = passed.state;
    }
    expect(s.runner.credits).toBe(0);
    expect(s.run).toBeNull();
    expect(s.log.filter((line) => line.startsWith("Resolve subroutine"))).toEqual([
      'Resolve subroutine "End the run." (appendix 11.4_3_c_i / CR 6.5.5).',
    ]);
  });

    it("treats Process Automation's gain and draw as the expected effects (CR 9.9.2.ex1)", () => {
    const s = createInitialState();
    const event = instantiateCard("process-automation", "pa-1", "runner:grip");
    s.cards["pa-1"] = event;
    s.runner.hand = ["pa-1"];
    s.runner.clicks = 1;
    s.runner.credits = 5;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    const deckBefore = s.runner.deck.length;

    const played = must(s, { type: "play_event", cardId: "pa-1" });
    expect(played.runner.credits).toBe(7);
    expect(played.runner.hand).toHaveLength(1);
    expect(played.runner.deck).toHaveLength(deckBefore - 1);
    expect(played.cards["pa-1"]?.zone).toBe("runner:heap");
    expect(played.log.join("\n")).not.toContain("not an expected effect");
  });

    it("lets Patchwork modify a play cost (CR 9.9.6c.ex1)", () => {
    const s = createInitialState();
    const patch = instantiateCard("patchwork", "pw-1", "runner:installed");
    const gamble = instantiateCard("sure-gamble", "sg-1", "runner:grip");
    const fodder = instantiateCard("sure-gamble", "sg-2", "runner:grip");
    s.cards["pw-1"] = patch;
    s.cards["sg-1"] = gamble;
    s.cards["sg-2"] = fodder;
    s.runner.installed = ["pw-1"];
    s.runner.hand = ["sg-1", "sg-2"];
    s.runner.clicks = 1;
    s.runner.credits = 5;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    const played = must(s, {
      type: "play_event",
      cardId: "sg-1",
      trashGripForDiscountCardId: "sg-2",
    });
    expect(played.runner.credits).toBe(11);
    expect(played.cards["sg-2"]?.zone).toBe("runner:heap");
    expect(played.turn.patchworkDiscountUsedThisTurn).toBe(true);
    expect(played.log.join("\n")).toContain(CR.modifiableValueCost.number);
  });

    it("keeps Flare's meat damage unpreventable after The Cleaners adds 1 (CR 9.9.7e.ex1)", () => {
    const s = createInitialState();
    const cleaners = instantiateCard("the-cleaners", "cl-1", "corp:score");
    const pap = instantiateCard("paparazzi", "pap-1", "runner:installed");
    const flare = instantiateCard("flare", "flare-1", "server:hq:ice");
    flare.rezzed = true;
    flare.faceup = true;
    s.cards["cl-1"] = cleaners;
    s.cards["pap-1"] = pap;
    s.cards["flare-1"] = flare;
    s.corp.scoreArea = ["cl-1"];
    s.runner.installed = ["pap-1"];
    s.runner.hand = [];
    s.runner.link = 0;
    s.corp.credits = 0;
    for (const id of ["g1", "g2", "g3"]) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: { iceId: "flare-1", broken: [false] },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    const sub = flare.subroutines?.[0]?.effect;
    if (!sub) throw new Error("Flare subroutine missing");
    const traced = evalEffect({ state: s, sourceId: "flare-1" }, sub);
    expect(traced.ok).toBe(true);
    expect(s.log.join("\n")).toContain("Meat damage increased by 1");
    expect(s.log.join("\n")).toContain("3 meat damage from flare-1 cannot be prevented");
    expect(s.runner.hand).toEqual([]);
    expect(s.runner.installed).toContain("pap-1");
    expect(s.log.join("\n")).not.toContain("Paparazzi — prevent");
    expect(s.run?.endedTheRun).toBe(true);
  });

    it("forgets Security Testing's server when the turn ends (CR 9.10.3b.ex1)", () => {
    const s = createInitialState();
    const testing = instantiateCard("security-testing", "st-1", "runner:installed");
    testing.namedServerId = "rd";
    s.cards["st-1"] = testing;
    s.runner.installed = ["st-1"];
    s.runner.credits = 5;
    onRunnerTurnEnds(s);
    expect(s.cards["st-1"]?.namedServerId).toBeUndefined();
    expect(s.log.join("\n")).toContain("9.10.3b");

    s.timingKey = "runner.startPaw";
    enterStep(s, "runner.turnBegins");
    autoWalk(s);
    expect(s.pendingChoice?.options.map((option) => option.id)).toContain("st-decline");
    const declined = must(s, { type: "choose_option", optionId: "st-decline" });
    expect(declined.cards["st-1"]?.namedServerId).toBeUndefined();

    declined.runner.credits = 5;
    declined.run = {
      attackedServerId: "rd",
      phase: "success",
      position: null,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    enterStep(declined, "run.success");
    autoWalk(declined);
    expect(declined.runner.credits).toBe(5);
    expect(declined.log.join("\n")).not.toContain("gain 2¢ instead");
  });

    it("remembers Femme Fatale's ice while Femme is active (CR 9.10.3c.ex1)", () => {
    let s = createInitialState();
    const ice = instantiateCard("rsvp", "rsvp-1", "server:hq:ice");
    ice.rezzed = true;
    ice.faceup = true;
    const femme = instantiateCard("femme-fatale", "ff-1", "runner:grip");
    s.cards["rsvp-1"] = ice;
    s.cards["ff-1"] = femme;
    s.servers.hq.ice = ["rsvp-1"];
    s.runner.hand = ["ff-1"];
    s.runner.credits = 10;
    s.runner.clicks = 1;
    runnerTurn(s);
    s = must(s, {
      type: "basic_install",
      cardId: "ff-1",
      destination: { kind: "installed" },
    });
    expect(s.pendingChoice?.options.map((o) => o.id)).toContain("chosen-ice:rsvp-1");
    s = must(s, { type: "choose_option", optionId: "chosen-ice:rsvp-1" });
    expect(s.cards["ff-1"]?.chosenIceId).toBe("rsvp-1");

    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    enterStep(s, "run.encounter");
    autoWalk(s);
    expect(s.pendingChoice?.options.map((o) => o.id)).toContain("bypass");
    s = must(s, { type: "choose_option", optionId: "decline" });
    expect(s.cards["ff-1"]?.chosenIceId).toBe("rsvp-1");

    s.runner.installed = s.runner.installed.filter((id) => id !== "ff-1");
    s.runner.discardPile.push("ff-1");
    s.cards["ff-1"]!.zone = "runner:heap";
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    enterStep(s, "run.encounter");
    autoWalk(s);
    const offered = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(offered).not.toContain("bypass");
  });

    it("traces 0 after ZATO City Grid trashes Surveyor (CR 9.12.2e.ex1)", () => {
    const s = createInitialState();
    const surveyor = instantiateCard("surveyor", "sv-1", "server:remote-1:ice");
    surveyor.rezzed = true;
    surveyor.faceup = true;
    const wall = instantiateCard("ice-wall", "wall-1", "server:remote-1:ice");
    wall.rezzed = true;
    wall.faceup = true;
    const zato = instantiateCard("zato-city-grid", "zato-1", "server:remote-1:root");
    zato.rezzed = true;
    zato.faceup = true;
    s.cards["sv-1"] = surveyor;
    s.cards["wall-1"] = wall;
    s.cards["zato-1"] = zato;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: ["sv-1", "wall-1"],
      root: ["zato-1"],
    };
    s.runner.link = 0;
    s.run = {
      attackedServerId: "remote-1",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    enterStep(s, "run.encounter");
    autoWalk(s);
    expect(s.pendingChoice?.options.map((o) => o.id)).toContain("zato:0");
    const traced = must(s, { type: "choose_option", optionId: "zato:0" });
    expect(traced.cards["sv-1"]?.zone).toBe("corp:archives");
    expect(traced.log.join("\n")).toContain("X is 0");
    expect(traced.log.join("\n")).toContain("Trace initiated strength 0");
  });

    it("lets the Runner take Data Raven's tag and avoid it without ending the run (CR 9.12.3d.ex1)", () => {
    const s = createInitialState();
    const raven = instantiateCard("data-raven", "raven-1", "server:hq:ice");
    raven.rezzed = true;
    raven.faceup = true;
    const decoy = instantiateCard("decoy", "decoy-1", "runner:installed");
    s.cards["raven-1"] = raven;
    s.cards["decoy-1"] = decoy;
    s.servers.hq.ice = ["raven-1"];
    s.runner.installed = ["decoy-1"];
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: { iceId: "raven-1", broken: [] },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    expect(raven.onEncounter).toBeDefined();
    const offered = evalEffect({ state: s, sourceId: "raven-1" }, raven.onEncounter!);
    expect(offered.ok).toBe(true);
    expect(s.pendingChoice?.options.map((option) => option.id)).toEqual([
      "unless-pay",
      "unless-instruction",
    ]);

    const paying = must(s, { type: "choose_option", optionId: "unless-pay" });
    expect(paying.pendingTags?.remaining).toBe(1);
    const avoided = must(paying, {
      type: "use_paid_ability",
      cardId: "decoy-1",
      abilityId: "decoy-prevent-tag",
    });
    expect(avoided.pendingTags).toBeNull();
    expect(avoided.runner.tags).toBe(0);
    expect(avoided.run?.endedTheRun).toBe(false);
    expect(avoided.cards["decoy-1"]?.zone).toBe("runner:heap");
  });
});
