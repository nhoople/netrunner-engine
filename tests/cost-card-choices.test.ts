/**
 * The payer picks the cards a cost takes.
 * CR 1.16.1: a cost can be any card a player must spend. The engine does
 * not pick which card is trashed or forfeited when more than one would do.
 * CR 4.4.6b: cards trashed from HQ as a cost enter Archives facedown.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  createInitialState,
  evalEffect,
  fx,
  getPublicView,
  instantiateCard,
  legalActions,
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

function put(s: GameState, defId: string, id: string, zone: string) {
  const card = instantiateCard(defId, id, zone);
  s.cards[id] = card;
  return card;
}

function hq(s: GameState, cards: Array<[string, string]>): void {
  s.corp.hand = [];
  for (const [defId, id] of cards) {
    put(s, defId, id, "corp:hq");
    s.corp.hand.push(id);
  }
}

function grip(s: GameState, cards: Array<[string, string]>): void {
  s.runner.hand = [];
  for (const [defId, id] of cards) {
    put(s, defId, id, "runner:grip");
    s.runner.hand.push(id);
  }
}

function installed(s: GameState, defId: string, id: string) {
  const card = put(s, defId, id, "runner:installed");
  card.faceup = true;
  s.runner.installed.push(id);
  return card;
}

function inRoot(s: GameState, defId: string, id: string, serverId: string) {
  if (!s.servers[serverId]) {
    s.servers[serverId] = { id: serverId, kind: "remote", ice: [], root: [] };
  }
  const card = put(s, defId, id, `server:${serverId}:root`);
  card.rezzed = true;
  card.faceup = true;
  s.servers[serverId].root.push(id);
  s.corp.installed.push(id);
  return card;
}

function corpTurn(): GameState {
  const s = createInitialState();
  s.activeSide = "corp";
  s.timingKey = "corp.actionPaw";
  s.corp.clicks = 3;
  s.corp.credits = 10;
  s.runner.credits = 10;
  s.priorityStack = [];
  return s;
}

/** The Runner is encountering a rezzed Ice Wall on HQ. */
function encounter(): GameState {
  const s = runnerTurn();
  const wall = put(s, "ice-wall", "wall-1", "server:hq:ice");
  wall.rezzed = true;
  wall.faceup = true;
  s.servers.hq.ice = ["wall-1"];
  s.corp.installed.push("wall-1");
  s.run = {
    attackedServerId: "hq",
    phase: "encounter",
    position: 0,
    successful: null,
    accessedCardIds: [],
    accessCandidates: [],
    randomAccessLimit: null,
    encounter: { iceId: "wall-1", broken: [false] },
    endedTheRun: false,
    cannotJackOut: false,
  } as never;
  s.timingKey = "run.encounterPaw";
  return s;
}

function runnerTurn(): GameState {
  const s = createInitialState();
  s.activeSide = "runner";
  s.timingKey = "runner.actionPaw";
  s.runner.clicks = 4;
  s.runner.credits = 10;
  s.corp.credits = 10;
  s.priorityStack = [];
  return s;
}

const optionIds = (s: GameState): string[] =>
  (s.pendingChoice?.options ?? []).map((o) => o.id);

const pickCost = (s: GameState, cardId: string): GameState =>
  must(s, { type: "choose_option", optionId: `cost-card:${cardId}` });

describe("a cost that trashes from HQ asks the Corp which card (CR 1.16.1)", () => {
  function whampoa(): GameState {
    const s = corpTurn();
    inRoot(s, "whampoa-reclamation", "wr-1", "remote-1");
    hq(s, [
      ["hedge-fund", "h-1"],
      ["ice-wall", "h-2"],
      ["pad-campaign", "h-3"],
    ]);
    put(s, "hostile-takeover", "arch-1", "corp:archives").faceup = true;
    s.corp.discardPile = ["arch-1"];
    return s;
  }
  const use: Action = {
    type: "use_paid_ability",
    cardId: "wr-1",
    abilityId: "whampoa-reclaim",
  };

  it("holds the ability until the Corp names the card", () => {
    let s = must(whampoa(), use);
    expect(s.pendingCost?.payer).toBe("corp");
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(optionIds(s).sort()).toEqual([
      "cost-card:h-1",
      "cost-card:h-2",
      "cost-card:h-3",
    ]);
    // Nothing is paid yet.
    expect(s.corp.hand).toEqual(["h-1", "h-2", "h-3"]);
    expect(s.corp.discardPile).toEqual(["arch-1"]);
    // Only the pick is legal.
    expect(legalActions(s).every((a) => a.type === "choose_option")).toBe(true);
    expect(applyAction(s, { type: "pass_window" }).ok).toBe(false);

    s = pickCost(s, "h-1");
    expect(s.pendingCost).toBeUndefined();
    expect(s.corp.hand).toEqual(["h-2", "h-3"]);
    expect(s.cards["h-1"].zone).toBe("corp:archives");
    expect(s.cards["h-1"].faceup).toBe(false);
    // The ability then resolves: the Corp picks the Archives card.
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(optionIds(s)).toContain("rd:arch-1");
  });

  it("does not show the Runner which cards are in HQ", () => {
    const s = must(whampoa(), use);
    const seen = getPublicView(s, "runner").pendingChoice;
    expect(seen?.options.map((o) => o.id)).toEqual([
      "hidden:0",
      "hidden:1",
      "hidden:2",
    ]);
    expect(JSON.stringify(seen)).not.toContain("h-1");
    expect(JSON.stringify(seen)).not.toContain("Hedge Fund");
  });

  it("takes the card a host names with the action", () => {
    const s = must(whampoa(), { ...use, costCardIds: ["h-2"] });
    expect(s.pendingCost).toBeUndefined();
    expect(s.corp.hand).toEqual(["h-1", "h-3"]);
    expect(s.cards["h-2"].zone).toBe("corp:archives");
  });

  it("refuses a named card that is not in HQ, or the wrong number", () => {
    expect(applyAction(whampoa(), { ...use, costCardIds: ["arch-1"] }).ok).toBe(false);
    expect(applyAction(whampoa(), { ...use, costCardIds: ["h-1", "h-2"] }).ok).toBe(false);
    expect(applyAction(whampoa(), { ...use, costCardIds: [] }).ok).toBe(false);
  });

  it("does not ask when there is only one card, or only copies of one card", () => {
    const one = whampoa();
    hq(one, [["hedge-fund", "h-1"]]);
    expect(must(one, use).pendingCost).toBeUndefined();

    const copies = whampoa();
    hq(copies, [
      ["hedge-fund", "h-1"],
      ["hedge-fund", "h-2"],
    ]);
    const after = must(copies, use);
    expect(after.pendingCost).toBeUndefined();
    expect(after.corp.hand).toHaveLength(1);
  });

  it("does not ask when the ability cannot be used at all (CR 9.1.7)", () => {
    const s = whampoa();
    s.cards["wr-1"].rezzed = false;
    const result = applyAction(s, use);
    expect(result.ok).toBe(false);
  });

  it("Helheim Servers: the Corp names the card during the encounter", () => {
    let s = encounter();
    inRoot(s, "helheim-servers", "hel-1", "hq");
    hq(s, [
      ["hedge-fund", "h-1"],
      ["ice-wall", "h-2"],
    ]);
    s = must(s, { type: "use_paid_ability", cardId: "hel-1", abilityId: "helheim-boost" });
    expect(s.pendingCost?.payer).toBe("corp");
    expect(s.run?.encounter?.iceId).toBe("wall-1");
    s = pickCost(s, "h-2");
    expect(s.corp.hand).toEqual(["h-1"]);
    expect(s.cards["h-2"].faceup).toBe(false);
    expect(s.pendingCost).toBeUndefined();
  });
});

describe("a cost that trashes from the grip asks the Runner which card (CR 1.16.1)", () => {
  function faust(): GameState {
    const s = encounter();
    installed(s, "faust", "faust-1");
    grip(s, [
      ["sure-gamble", "g-1"],
      ["diesel", "g-2"],
      ["corroder", "g-3"],
    ]);
    return s;
  }
  const pump: Action = {
    type: "use_paid_ability",
    cardId: "faust-1",
    abilityId: "faust-pump",
  };

  it("Faust: the Runner names the grip card", () => {
    let s = must(faust(), pump);
    expect(s.pendingCost?.payer).toBe("runner");
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(s.runner.hand).toEqual(["g-1", "g-2", "g-3"]);
    s = pickCost(s, "g-1");
    expect(s.runner.hand).toEqual(["g-2", "g-3"]);
    expect(s.cards["g-1"].zone).toBe("runner:heap");
    expect(s.pendingCost).toBeUndefined();
    expect(s.pendingChoice ?? null).toBeNull();
  });

  it("Faust: the Corp does not see the grip", () => {
    const s = must(faust(), pump);
    const seen = getPublicView(s, "corp").pendingChoice;
    expect(JSON.stringify(seen)).not.toContain("g-1");
    expect(JSON.stringify(seen)).not.toContain("Diesel");
  });

  it("Monolith: only programs in the grip are offered", () => {
    const s = runnerTurn();
    installed(s, "monolith", "mono-1");
    grip(s, [
      ["sure-gamble", "g-1"],
      ["corroder", "g-2"],
      ["gordian-blade", "g-3"],
    ]);
    const r = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      fx.do({ kind: "net_damage", amount: 1 } as never),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingDamage).toBeTruthy();
    let after = must(s, {
      type: "use_paid_ability",
      cardId: "mono-1",
      abilityId: "monolith-prevent",
    });
    expect(optionIds(after).sort()).toEqual(["cost-card:g-2", "cost-card:g-3"]);
    after = pickCost(after, "g-3");
    expect(after.cards["g-3"].zone).toBe("runner:heap");
    expect(after.runner.hand).toContain("g-2");
    expect(after.pendingCost).toBeUndefined();
  });

  it("Simulchip: the Runner names the installed program", () => {
    const s = runnerTurn();
    installed(s, "simulchip", "sim-1");
    installed(s, "corroder", "p-1");
    installed(s, "gordian-blade", "p-2");
    put(s, "mimic", "heap-1", "runner:heap").faceup = true;
    s.runner.discardPile = ["heap-1"];
    const use: Action = {
      type: "use_paid_ability",
      cardId: "sim-1",
      abilityId: "simulchip-install",
    };
    let after = must(s, use);
    expect(after.pendingCost?.payer).toBe("runner");
    expect(optionIds(after).sort()).toEqual(["cost-card:p-1", "cost-card:p-2"]);
    // Installed programs are open information: the Corp sees the options.
    expect(
      getPublicView(after, "corp").pendingChoice?.options.map((o) => o.id).sort(),
    ).toEqual(["cost-card:p-1", "cost-card:p-2"]);
    after = pickCost(after, "p-2");
    expect(after.cards["p-2"].zone).toBe("runner:heap");
    expect(after.cards["p-1"].zone).toBe("runner:installed");
    expect(after.cards["sim-1"].zone).toBe("runner:heap");
  });

  it("Simulchip: no pick when the cost is ignored", () => {
    const s = runnerTurn();
    installed(s, "simulchip", "sim-1");
    installed(s, "corroder", "p-1");
    installed(s, "gordian-blade", "p-2");
    put(s, "mimic", "heap-1", "runner:heap").faceup = true;
    s.runner.discardPile = ["heap-1"];
    s.turn.runnerTrashedOwnInstalledThisTurn = true;
    const after = must(s, {
      type: "use_paid_ability",
      cardId: "sim-1",
      abilityId: "simulchip-install",
    });
    expect(after.pendingCost).toBeUndefined();
    expect(after.cards["p-1"].zone).toBe("runner:installed");
    expect(after.cards["p-2"].zone).toBe("runner:installed");
  });
});

describe("additional cost to trash a resource (Manuel Lattes de Moura, Sebastião)", () => {
  function tagged(): GameState {
    const s = corpTurn();
    s.timingKey = "corp.takeAction";
    s.runner.tags = 1;
    installed(s, "manuel-lattes-de-moura", "man-1");
    put(s, "hostile-takeover", "score-1", "corp:score");
    put(s, "project-atlas", "score-2", "corp:score");
    s.corp.scoreArea = ["score-1", "score-2"];
    hq(s, [
      ["hedge-fund", "h-1"],
      ["ice-wall", "h-2"],
    ]);
    return s;
  }

  it("the Corp names the HQ card", () => {
    let s = must(tagged(), { type: "basic_trash_resource", cardId: "man-1" });
    expect(s.pendingCost?.payer).toBe("corp");
    expect(s.cards["man-1"].zone).toBe("runner:installed");
    expect(s.corp.clicks).toBe(3);
    s = pickCost(s, "h-1");
    expect(s.cards["h-1"].zone).toBe("corp:archives");
    expect(s.cards["h-1"].faceup).toBe(false);
    expect(s.corp.hand).toEqual(["h-2"]);
    expect(s.cards["man-1"].zone).toBe("runner:heap");
  });

  it("no pick below the threat level", () => {
    const s = tagged();
    s.corp.scoreArea = [];
    const after = must(s, { type: "basic_trash_resource", cardId: "man-1" });
    expect(after.pendingCost).toBeUndefined();
    expect(after.corp.hand).toEqual(["h-1", "h-2"]);
    expect(after.cards["man-1"].zone).toBe("runner:heap");
  });
});
