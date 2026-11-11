/**
 * Movement Phase windows.
 * CR 6.9.1f: with no ice at the Runner's position, the run goes to the
 * Movement Phase. CR 6.9.4b and 6.9.4e are its paid ability windows, and
 * the Runner may jack out at 6.9.4c. CR 6.9.4g (approach the server) is not
 * a paid ability window. CR 9.2.7b: a paid ability may be used from any
 * active card whenever its player has priority in a paid ability window.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertPinnedTag,
  autoWalk,
  cardsDataPresent,
  crDataPresent,
  createInitialState,
  fx,
  instantiateCard,
  legalActions,
  queryLegality,
} from "../src/index.js";
import type { Action, GameState } from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
});

function must(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`${state.timingKey}: ${result.error}`);
  return result.state;
}

function runnerTurn(): GameState {
  const s = createInitialState();
  s.activeSide = "runner";
  s.timingKey = "runner.takeAction";
  s.runner.clicks = 4;
  s.runner.credits = 10;
  s.corp.credits = 10;
  s.priorityStack = [];
  return s;
}

function remote(s: GameState, serverId: string): void {
  s.servers[serverId] = { id: serverId, kind: "remote", ice: [], root: [] };
}

function inRoot(
  s: GameState,
  defId: string,
  id: string,
  serverId: string,
  rezzed: boolean,
): void {
  const card = instantiateCard(defId, id, `server:${serverId}:root`);
  card.rezzed = rezzed;
  card.faceup = rezzed;
  s.cards[id] = card;
  s.servers[serverId].root.push(id);
  s.corp.installed.push(id);
}

function ice(s: GameState, defId: string, id: string, serverId: string): void {
  const card = instantiateCard(defId, id, `server:${serverId}:ice`);
  card.rezzed = true;
  card.faceup = true;
  s.cards[id] = card;
  s.servers[serverId].ice.push(id);
  s.corp.installed.push(id);
}

function scoredNisei(s: GameState): void {
  const nisei = instantiateCard("nisei-mk-ii", "nisei-1", "corp:score");
  nisei.agendaCounters = 1;
  s.cards["nisei-1"] = nisei;
  s.corp.scoreArea.push("nisei-1");
}

/** A Runner program with a paid ability that is not an action. */
function runnerPaidProgram(s: GameState): void {
  const card = instantiateCard("corroder", "paid-1", "runner:installed");
  card.paidAbilities = [
    {
      id: "gain",
      label: "1 credit: gain 1 credit",
      clickCost: 0,
      creditCost: 1,
      windows: ["runner_action_paw"],
      effect: fx.gainCredits("runner", 1),
    },
  ];
  s.cards["paid-1"] = card;
  s.runner.installed.push("paid-1");
}

/** Pass until the run stands on the named step. */
function passTo(s: GameState, key: string): GameState {
  for (let i = 0; i < 12 && s.timingKey !== key; i += 1) {
    s = must(s, { type: "pass_window" });
  }
  expect(s.timingKey).toBe(key);
  return s;
}

/** Put two cards from R&D into HQ so Anoetic Void's cost can be paid. */
function twoInHq(s: GameState): void {
  for (const id of s.corp.deck.slice(0, 2)) {
    s.corp.deck = s.corp.deck.filter((d) => d !== id);
    s.corp.hand.push(id);
    s.cards[id].zone = "corp:hq";
  }
}

const offers = (s: GameState, type: Action["type"], cardId?: string): boolean =>
  legalActions(s).some(
    (a) => a.type === type && (cardId === undefined || (a as { cardId?: string }).cardId === cardId),
  );

describe("iceless run goes through the Movement Phase (CR 6.9.1f)", () => {
  it("stops for the Runner's jack-out choice (CR 6.9.4c)", () => {
    let s = runnerTurn();
    s = must(s, { type: "basic_run", serverId: "hq" });
    expect(s.timingKey).toBe("run.jackOutWindow");
    expect(queryLegality(s).priority).toBe("runner");
    expect(offers(s, "jack_out")).toBe(true);
    expect(offers(s, "continue_run")).toBe(true);
  });

  it("ends the run unsuccessfully when the Runner jacks out (CR 6.9.4c)", () => {
    let s = runnerTurn();
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = must(s, { type: "jack_out" });
    expect(s.run).toBeNull();
    expect(s.timingKey).not.toBe("breach.awaitAccess");
    expect(s.runner.madeSuccessfulRunThisTurn ?? false).toBe(false);
  });

  it("gives the Runner the 6.9.4b paid ability window", () => {
    let s = runnerTurn();
    runnerPaidProgram(s);
    s = must(s, { type: "basic_run", serverId: "hq" });
    // 6.9.1e comes first; the Runner passes it and the Corp has nothing.
    expect(s.timingKey).toBe("run.initiatePaw");
    s = must(s, { type: "pass_window" });
    expect(s.timingKey).toBe("run.passIcePaw");
    expect(offers(s, "use_paid_ability", "paid-1")).toBe(true);
  });

  it("lets the Corp rez in the root at 6.9.4e after the Runner commits", () => {
    let s = runnerTurn();
    remote(s, "remote-1");
    inRoot(s, "pad-campaign", "pad-1", "remote-1", false);
    s = must(s, { type: "basic_run", serverId: "remote-1" });
    // 6.9.1e (P)(R): the Runner passes, then the Corp passes.
    expect(s.timingKey).toBe("run.initiatePaw");
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    expect(s.timingKey).toBe("run.jackOutWindow");
    s = must(s, { type: "continue_run" });
    expect(s.timingKey).toBe("run.afterMovePaw");
    s = must(s, { type: "pass_window" });
    expect(queryLegality(s).priority).toBe("corp");
    s = must(s, { type: "rez_asset", cardId: "pad-1" });
    expect(s.cards["pad-1"].rezzed).toBe(true);
  });
});

describe("approaching the server is not a paid ability window (CR 6.9.4g)", () => {
  it("does not stop for a facedown card in the root", () => {
    const s = runnerTurn();
    remote(s, "remote-1");
    inRoot(s, "pad-campaign", "pad-1", "remote-1", false);
    s.run = {
      attackedServerId: "remote-1",
      phase: "movement",
      position: null,
      successful: false,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      accessingCardId: null,
    };
    s.timingKey = "run.approachServer";
    autoWalk(s);
    expect(s.timingKey).not.toBe("run.approachServerPaw");
    expect(s.cards["pad-1"].rezzed).toBe(false);
  });

  it("does not stop for a scored Nisei MK II; its last window is 6.9.4e", () => {
    let s = runnerTurn();
    scoredNisei(s);
    twoInHq(s);
    s = must(s, { type: "basic_run", serverId: "hq" });
    // 6.9.1e: the Corp may already use it here.
    expect(s.timingKey).toBe("run.initiatePaw");
    s = must(s, { type: "pass_window" });
    expect(offers(s, "use_paid_ability", "nisei-1")).toBe(true);
    // 6.9.4b: open again, because the Corp could act.
    s = passTo(s, "run.passIcePaw");
    s = must(s, { type: "pass_window" });
    expect(offers(s, "use_paid_ability", "nisei-1")).toBe(true);
    s = passTo(s, "run.jackOutWindow");
    s = must(s, { type: "continue_run" });
    // 6.9.4e: the last paid ability window before the server.
    expect(s.timingKey).toBe("run.afterMovePaw");
    s = must(s, { type: "pass_window" });
    expect(offers(s, "use_paid_ability", "nisei-1")).toBe(true);
    s = must(s, { type: "pass_window" });
    expect(s.timingKey).toBe("breach.awaitAccess");
    expect(s.cards["nisei-1"].agendaCounters).toBe(1);
  });

  it("ends the run when Nisei MK II is used at 6.9.4e", () => {
    let s = runnerTurn();
    scoredNisei(s);
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = passTo(s, "run.jackOutWindow");
    s = must(s, { type: "continue_run" });
    expect(s.timingKey).toBe("run.afterMovePaw");
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "use_paid_ability", cardId: "nisei-1", abilityId: "nisei-etr" });
    expect(s.run).toBeNull();
    expect(s.cards["nisei-1"].agendaCounters).toBe(0);
  });

  it("stops only for an approach-server ability, with the Corp to act", () => {
    let s = runnerTurn();
    remote(s, "remote-1");
    inRoot(s, "anoetic-void", "void-1", "remote-1", true);
    inRoot(s, "pad-campaign", "pad-1", "remote-1", false);
    scoredNisei(s);
    runnerPaidProgram(s);
    twoInHq(s);
    s = must(s, { type: "basic_run", serverId: "remote-1" });
    s = passTo(s, "run.jackOutWindow");
    s = must(s, { type: "continue_run" });
    s = passTo(s, "run.approachServerPaw");
    expect(queryLegality(s).priority).toBe("corp");
    expect(offers(s, "use_paid_ability", "void-1")).toBe(true);
    // Nothing else is legal here: no rez, no other paid ability.
    expect(offers(s, "rez_asset")).toBe(false);
    expect(offers(s, "use_paid_ability", "nisei-1")).toBe(false);
    expect(offers(s, "use_paid_ability", "paid-1")).toBe(false);
    const rez = applyAction(s, { type: "rez_asset", cardId: "pad-1" });
    expect(rez.ok).toBe(false);
    const nisei = applyAction(s, {
      type: "use_paid_ability",
      cardId: "nisei-1",
      abilityId: "nisei-etr",
    });
    expect(nisei.ok).toBe(false);

    s = must(s, { type: "use_paid_ability", cardId: "void-1", abilityId: "etr" });
    expect(s.run).toBeNull();
    expect(s.corp.credits).toBe(8);
  });

  it("does not ask the Runner to act when the Corp declines", () => {
    let s = runnerTurn();
    remote(s, "remote-1");
    inRoot(s, "anoetic-void", "void-1", "remote-1", true);
    runnerPaidProgram(s);
    twoInHq(s);
    s.run = {
      attackedServerId: "remote-1",
      phase: "movement",
      position: null,
      successful: false,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      accessingCardId: null,
    };
    s.timingKey = "run.approachServer";
    autoWalk(s);
    expect(s.timingKey).toBe("run.approachServerPaw");
    expect(queryLegality(s).priority).toBe("corp");
    s = must(s, { type: "pass_window" });
    expect(s.timingKey).not.toBe("run.approachServerPaw");
    expect(s.run?.successful).toBe(true);
  });

  it("does not stop when the approach-server cost cannot be paid", () => {
    const s = runnerTurn();
    remote(s, "remote-1");
    inRoot(s, "anoetic-void", "void-1", "remote-1", true);
    s.corp.hand = [];
    s.run = {
      attackedServerId: "remote-1",
      phase: "movement",
      position: null,
      successful: false,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      accessingCardId: null,
    };
    s.timingKey = "run.approachServer";
    autoWalk(s);
    expect(s.timingKey).not.toBe("run.approachServerPaw");
  });
});

describe("Corp paid abilities while the Runner approaches ice (CR 9.2.7b)", () => {
  it("offers a scored agenda's ability and a root card's ability, not only the approached ice", () => {
    let s = runnerTurn();
    remote(s, "remote-1");
    ice(s, "ice-wall", "wall-1", "remote-1");
    inRoot(s, "pad-campaign", "pad-1", "remote-1", true);
    s.cards["pad-1"].paidAbilities = [
      {
        id: "gain",
        label: "1 credit: gain 2 credits",
        clickCost: 0,
        creditCost: 1,
        windows: ["corp_action_paw"],
        effect: fx.gainCredits("corp", 2),
      },
    ];
    scoredNisei(s);
    s = must(s, { type: "basic_run", serverId: "remote-1" });
    while (s.timingKey !== "run.approachPaw") s = must(s, { type: "pass_window" });
    if (queryLegality(s).priority !== "corp") s = must(s, { type: "pass_window" });
    expect(s.timingKey).toBe("run.approachPaw");
    expect(offers(s, "use_paid_ability", "nisei-1")).toBe(true);
    expect(offers(s, "use_paid_ability", "pad-1")).toBe(true);
    s = must(s, { type: "use_paid_ability", cardId: "pad-1", abilityId: "gain" });
    expect(s.corp.credits).toBe(11);
    expect(s.timingKey).toBe("run.approachPaw");
  });

  it("does not offer an ability on a facedown card", () => {
    let s = runnerTurn();
    remote(s, "remote-1");
    ice(s, "ice-wall", "wall-1", "remote-1");
    inRoot(s, "pad-campaign", "pad-1", "remote-1", false);
    s.cards["pad-1"].paidAbilities = [
      {
        id: "gain",
        label: "1 credit: gain 2 credits",
        clickCost: 0,
        creditCost: 1,
        windows: ["corp_action_paw"],
        effect: fx.gainCredits("corp", 2),
      },
    ];
    s = must(s, { type: "basic_run", serverId: "remote-1" });
    while (s.timingKey !== "run.approachPaw") s = must(s, { type: "pass_window" });
    if (queryLegality(s).priority !== "corp") s = must(s, { type: "pass_window" });
    expect(offers(s, "use_paid_ability", "pad-1")).toBe(false);
    const used = applyAction(s, {
      type: "use_paid_ability",
      cardId: "pad-1",
      abilityId: "gain",
    });
    expect(used.ok).toBe(false);
  });
});
