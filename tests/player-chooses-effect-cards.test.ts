/**
 * The engine does not pick a card for a player (second pass).
 * CR 1.15.2: the player resolving an instruction makes its choices.
 * CR 1.16.1: the payer picks the cards a cost takes.
 * CR 1.21.3: a revealed card is shown to all players, then returns to its
 * previous state.
 * CR 8.7.1 / 8.7.2d / 8.7.3: a search lets the player look through the
 * zone and pick; the deck is shuffled afterwards.
 * CR 10.11.2a: the mark is a random central server, each equally likely.
 * CR 10.12.2: the Corp chooses the HQ cards a sabotage trashes.
 * Card text wins where it says more (CR 1.2.1).
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
  seedRng,
} from "../src/index.js";
import type { Action, GameState } from "../src/index.js";
import { placeCurrentAfterPlay } from "../src/state/currents.js";
import { currentMark, pickRandomCentral } from "../src/state/msKeywords.js";

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

function rd(s: GameState, cards: Array<[string, string]>): void {
  s.corp.deck = [];
  for (const [defId, id] of cards) {
    put(s, defId, id, "corp:rd");
    s.corp.deck.push(id);
  }
}

function archives(s: GameState, cards: Array<[string, string, boolean]>): void {
  s.corp.discardPile = [];
  for (const [defId, id, faceup] of cards) {
    put(s, defId, id, "corp:archives").faceup = faceup;
    s.corp.discardPile.push(id);
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

function ice(s: GameState, defId: string, id: string, serverId: string, rezzed: boolean) {
  if (!s.servers[serverId]) {
    s.servers[serverId] = { id: serverId, kind: "remote", ice: [], root: [] };
  }
  const card = put(s, defId, id, `server:${serverId}:ice`);
  card.rezzed = rezzed;
  card.faceup = rezzed;
  s.servers[serverId].ice.push(id);
  s.corp.installed.push(id);
  return card;
}

function scored(s: GameState, defId: string, id: string) {
  const card = put(s, defId, id, "corp:score");
  card.faceup = true;
  s.corp.scoreArea.push(id);
  return card;
}

function run(s: GameState, sourceId: string, kind: string, extra: object = {}): void {
  const r = evalEffect({ state: s, sourceId }, fx.do({ kind, ...extra } as never));
  if (!r.ok) throw new Error(`${kind}: ${r.error}`);
}

function corpTurn(): GameState {
  const s = createInitialState();
  s.activeSide = "corp";
  s.timingKey = "corp.takeAction";
  s.corp.clicks = 3;
  s.corp.credits = 20;
  s.runner.credits = 10;
  s.priorityStack = [];
  return s;
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

/** The Corp's rez window as the Runner approaches the outermost ice of HQ. */
function approach(s: GameState): GameState {
  s.activeSide = "corp";
  s.timingKey = "run.approachPaw";
  s.run = {
    attackedServerId: "hq",
    phase: "approach",
    position: 0,
    successful: null,
    accessedCardIds: [],
    accessCandidates: [],
    randomAccessLimit: null,
    encounter: null,
    endedTheRun: false,
    cannotJackOut: false,
    accessingCardId: null,
  };
  return s;
}

const logged = (s: GameState): string => s.log.join("\n");
const pick = (s: GameState, cardId: string): GameState =>
  must(s, { type: "choose_option", optionId: `choose-card:${cardId}` });
const done = (s: GameState): GameState =>
  must(s, { type: "choose_option", optionId: "choose-cards-done" });
const pickCost = (s: GameState, cardId: string): GameState =>
  must(s, { type: "choose_option", optionId: `cost-card:${cardId}` });
const optionIds = (s: GameState): string[] =>
  (s.pendingChoice?.options ?? []).map((o) => o.id);

describe("sabotage: the Corp chooses the HQ cards (CR 10.12.2)", () => {
  function sabotaged(amount: number, hqCards: number, rdCards: number): GameState {
    const s = createInitialState();
    hq(
      s,
      ["hedge-fund", "ice-wall", "pad-campaign", "hostile-takeover"]
        .slice(0, hqCards)
        .map((d, i) => [d, `h-${i}`]),
    );
    rd(
      s,
      Array.from({ length: rdCards }, (_, i) => ["hedge-fund", `r-${i}`] as [string, string]),
    );
    run(s, s.runner.identityId, "sabotage", { amount });
    return s;
  }

  it("offers each HQ card, and finishing with none takes the top of R&D", () => {
    const s = sabotaged(2, 2, 5);
    expect(s.pendingSabotage?.amount).toBe(2);
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(optionIds(s).sort()).toEqual(["sabotage-hq:h-0", "sabotage-hq:h-1"]);
    const legal = legalActions(s);
    expect(legal).toContainEqual({ type: "choose_option", optionId: "sabotage-hq:h-0" });
    expect(legal).toContainEqual({ type: "resolve_sabotage", hqCardIds: [] });
    const none = must(s, { type: "resolve_sabotage", hqCardIds: [] });
    expect(none.corp.hand).toEqual(["h-0", "h-1"]);
    expect(none.corp.deck).toEqual(["r-2", "r-3", "r-4"]);
    expect(none.pendingSabotage).toBeNull();
    expect(none.pendingChoice ?? null).toBeNull();
  });

  it("takes the HQ card the Corp picks and fills from R&D (CR 10.12.3b.ex1)", () => {
    let s = sabotaged(2, 2, 5);
    s = must(s, { type: "choose_option", optionId: "sabotage-hq:h-0" });
    // One picked: the Corp may stop here or pick the other.
    expect(s.pendingSabotage?.picked).toEqual(["h-0"]);
    expect(legalActions(s)).toContainEqual({ type: "resolve_sabotage", hqCardIds: ["h-0"] });
    const one = must(s, { type: "resolve_sabotage", hqCardIds: ["h-0"] });
    expect(one.corp.hand).toEqual(["h-1"]);
    expect(one.corp.deck).toHaveLength(4);
    expect(one.cards["h-0"].faceup).toBe(false);
    // Picking as many as the sabotage takes resolves it.
    const both = must(s, { type: "choose_option", optionId: "sabotage-hq:h-1" });
    expect(both.pendingSabotage).toBeNull();
    expect(both.corp.hand).toEqual([]);
    expect(both.corp.deck).toHaveLength(5);
  });

  it("does not let the Corp stop short when R&D cannot cover the rest (CR 10.12.3a)", () => {
    const s = sabotaged(4, 4, 2);
    const legal = legalActions(s);
    expect(legal.some((a) => a.type === "resolve_sabotage")).toBe(false);
    expect(applyAction(s, { type: "resolve_sabotage", hqCardIds: [] }).ok).toBe(false);
    let t = must(s, { type: "choose_option", optionId: "sabotage-hq:h-3" });
    expect(legalActions(t).some((a) => a.type === "resolve_sabotage")).toBe(false);
    t = must(t, { type: "choose_option", optionId: "sabotage-hq:h-1" });
    expect(legalActions(t)).toContainEqual({
      type: "resolve_sabotage",
      hqCardIds: ["h-3", "h-1"],
    });
    t = must(t, { type: "resolve_sabotage", hqCardIds: ["h-3", "h-1"] });
    expect(t.corp.hand).toEqual(["h-0", "h-2"]);
    expect(t.corp.deck).toEqual([]);
  });

  it("does not show the Runner the HQ cards or the picks", () => {
    let s = sabotaged(2, 3, 5);
    s = must(s, { type: "choose_option", optionId: "sabotage-hq:h-1" });
    const seen = getPublicView(s, "runner");
    expect(JSON.stringify(seen.pendingChoice)).not.toContain("h-0");
    expect(JSON.stringify(seen.pendingSabotage)).not.toContain("h-1");
    expect(getPublicView(s, "corp").pendingSabotage).toEqual(
      expect.objectContaining({ picked: ["h-1"] }),
    );
  });

  it("asks nothing when HQ is empty or everything goes (CR 10.12.3b)", () => {
    const empty = sabotaged(2, 0, 5);
    expect(empty.pendingSabotage ?? null).toBeNull();
    expect(empty.corp.deck).toHaveLength(3);
    const all = sabotaged(4, 1, 2);
    expect(all.pendingSabotage ?? null).toBeNull();
    expect(all.corp.hand).toEqual([]);
    expect(all.corp.deck).toEqual([]);
  });
});

describe("costs: the payer picks (CR 1.16.1)", () => {
  it("Carnivore: the Runner names the two grip cards", () => {
    const s = runnerTurn();
    installed(s, "carnivore", "carn-1");
    grip(s, [
      ["sure-gamble", "g-1"],
      ["diesel", "g-2"],
      ["corroder", "g-3"],
    ]);
    hq(s, [["pad-campaign", "pad-1"]]);
    s.run = {
      attackedServerId: "hq",
      phase: "success",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      accessingCardId: "pad-1",
    } as never;
    s.timingKey = "run.access";
    let t = must(s, { type: "access_trash_from_grip" });
    expect(t.pendingCost?.payer).toBe("runner");
    expect(t.pendingCost?.count).toBe(2);
    expect(t.runner.hand).toHaveLength(3);
    expect(t.cards["pad-1"].zone).toBe("corp:hq");
    t = pickCost(t, "g-1");
    expect(optionIds(t).sort()).toEqual(["cost-card:g-2", "cost-card:g-3"]);
    t = pickCost(t, "g-3");
    expect(t.runner.hand).toEqual(["g-2"]);
    expect(t.cards["pad-1"].zone).toBe("corp:archives");
    expect(t.pendingCost).toBeUndefined();
  });

  it("Moshing: the Runner names the three grip cards", () => {
    const s = runnerTurn();
    grip(s, [
      ["moshing", "mosh-1"],
      ["sure-gamble", "g-1"],
      ["diesel", "g-2"],
      ["corroder", "g-3"],
      ["mimic", "g-4"],
    ]);
    for (let i = 0; i < 5; i++) put(s, "sure-gamble", `stk-${i}`, "runner:stack");
    s.runner.deck = ["stk-0", "stk-1", "stk-2", "stk-3", "stk-4"];
    let t = must(s, { type: "play_event", cardId: "mosh-1" });
    expect(t.pendingCost?.count).toBe(3);
    expect(t.runner.hand).toContain("mosh-1");
    expect(optionIds(t)).not.toContain("cost-card:mosh-1");
    t = pickCost(t, "g-4");
    t = pickCost(t, "g-1");
    t = pickCost(t, "g-2");
    expect(t.runner.discardPile).toEqual(expect.arrayContaining(["g-4", "g-1", "g-2"]));
    expect(t.runner.hand).toContain("g-3");
    expect(t.runner.hand).toHaveLength(4); // g-3 and three drawn
    expect(t.runner.credits).toBe(13);
  });

  it("Archer: the Corp names the agenda to forfeit", () => {
    const s = runnerTurn();
    ice(s, "archer", "arch-1", "hq", false);
    scored(s, "hostile-takeover", "ht-1");
    scored(s, "project-atlas", "atlas-1");
    approach(s);
    let t = must(s, { type: "rez_ice", cardId: "arch-1" });
    expect(t.pendingCost?.payer).toBe("corp");
    expect(optionIds(t).sort()).toEqual(["cost-card:atlas-1", "cost-card:ht-1"]);
    // The score area is open: the Runner sees the options.
    expect(
      getPublicView(t, "runner").pendingChoice?.options.map((o) => o.id).sort(),
    ).toEqual(["cost-card:atlas-1", "cost-card:ht-1"]);
    expect(t.cards["arch-1"].rezzed).toBe(false);
    t = pickCost(t, "ht-1");
    expect(t.cards["arch-1"].rezzed).toBe(true);
    expect(t.corp.scoreArea).toEqual(["atlas-1"]);
  });

  it("Bloop: the Corp names the harmonic ice to derez", () => {
    const s = approach(runnerTurn());
    ice(s, "bloop", "bloop-1", "hq", false);
    const a = ice(s, "ice-wall", "harm-1", "rd", true);
    const b = ice(s, "enigma", "harm-2", "archives", true);
    a.subtypes = [...(a.subtypes ?? []), "harmonic"];
    b.subtypes = [...(b.subtypes ?? []), "harmonic"];
    let t = must(s, { type: "rez_ice", cardId: "bloop-1" });
    expect(optionIds(t).sort()).toEqual(["cost-card:harm-1", "cost-card:harm-2"]);
    t = pickCost(t, "harm-2");
    expect(t.cards["bloop-1"].rezzed).toBe(true);
    expect(t.cards["harm-2"].rezzed).toBe(false);
    expect(t.cards["harm-1"].rezzed).toBe(true);
  });
});

describe("Housekeeping (card text)", () => {
  function board(): GameState {
    const s = runnerTurn();
    put(s, "housekeeping", "hk-1", "corp:hq");
    placeCurrentAfterPlay(s, "hk-1", "corp");
    grip(s, [
      ["daily-casts", "res-1"],
      ["sure-gamble", "g-1"],
      ["diesel", "g-2"],
    ]);
    return s;
  }

  it("fires on the first install of any card, and the Runner picks the card", () => {
    let s = must(board(), {
      type: "basic_install",
      cardId: "res-1",
      destination: { kind: "installed" },
    });
    expect(s.cards["res-1"].zone).toBe("runner:installed");
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(optionIds(s).sort()).toEqual(["choose-card:g-1", "choose-card:g-2"]);
    s = pick(s, "g-2");
    expect(s.runner.hand).toEqual(["g-1"]);
    expect(s.cards["g-2"].zone).toBe("runner:heap");
  });

  it("does not fire on the second install of the turn", () => {
    let s = board();
    grip(s, [
      ["daily-casts", "res-1"],
      ["daily-casts", "res-2"],
      ["sure-gamble", "g-1"],
      ["diesel", "g-2"],
    ]);
    s.runner.credits = 20;
    s = must(s, { type: "basic_install", cardId: "res-1", destination: { kind: "installed" } });
    s = pick(s, "g-1");
    s.timingKey = "runner.takeAction";
    s = must(s, { type: "basic_install", cardId: "res-2", destination: { kind: "installed" } });
    expect(s.pendingChoice ?? null).toBeNull();
    expect(s.runner.hand).toEqual(["g-2"]);
  });
});

describe("Titanium Ribs: the Runner chooses the cards damage trashes (card text)", () => {
  function ribs(): GameState {
    const s = runnerTurn();
    installed(s, "titanium-ribs", "ribs-1");
    grip(s, [
      ["sure-gamble", "g-1"],
      ["diesel", "g-2"],
      ["corroder", "g-3"],
    ]);
    return s;
  }

  it("asks the Runner for each card, then trashes them together", () => {
    const s = ribs();
    run(s, s.corp.identityId, "meat_damage", { amount: 2 });
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(optionIds(s).sort()).toEqual(["ribs:g-1", "ribs:g-2", "ribs:g-3"]);
    expect(s.runner.hand).toHaveLength(3);
    let t = must(s, { type: "choose_option", optionId: "ribs:g-3" });
    expect(t.runner.hand).toHaveLength(3);
    expect(optionIds(t).sort()).toEqual(["ribs:g-1", "ribs:g-2"]);
    t = must(t, { type: "choose_option", optionId: "ribs:g-1" });
    expect(t.runner.hand).toEqual(["g-2"]);
    expect(t.runner.discardPile).toEqual(expect.arrayContaining(["g-1", "g-3"]));
    expect(t.pendingChoice ?? null).toBeNull();
    expect(t.winner ?? null).toBeNull();
  });

  it("does not show the Corp the grip", () => {
    const s = ribs();
    run(s, s.corp.identityId, "meat_damage", { amount: 1 });
    const seen = getPublicView(s, "corp").pendingChoice;
    expect(JSON.stringify(seen)).not.toContain("g-1");
    expect(JSON.stringify(seen)).not.toContain("Diesel");
  });

  it("asks nothing when the whole grip goes, and still flatlines on too much damage", () => {
    const all = ribs();
    run(all, all.corp.identityId, "meat_damage", { amount: 3 });
    expect(all.pendingChoice ?? null).toBeNull();
    expect(all.runner.hand).toEqual([]);
    expect(all.winner ?? null).toBeNull();
    const dead = ribs();
    run(dead, dead.corp.identityId, "meat_damage", { amount: 4 });
    expect(dead.winner).toBe("corp");
  });
});

describe("Peer Review (card text; CR 1.21.3)", () => {
  it("the Corp picks the card that stays hidden, and the rest are named", () => {
    const s = corpTurn();
    put(s, "peer-review", "pr-1", "corp:play");
    hq(s, [
      ["hedge-fund", "h-1"],
      ["ice-wall", "h-2"],
      ["hostile-takeover", "h-3"],
    ]);
    const before = s.corp.credits;
    run(s, "pr-1", "peer_review");
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.corp.credits).toBe(before);
    const t = pick(s, "h-3");
    expect(t.corp.credits).toBe(before + 7);
    const line = t.log.find((l) => l.includes("Peer Review — reveal"))!;
    expect(line).toContain("Hedge Fund");
    expect(line).toContain("Ice Wall");
    expect(line).not.toContain("Hostile Takeover");
    // Still in HQ, and hidden there.
    expect(t.corp.hand).toEqual(["h-1", "h-2", "h-3"]);
  });
});

describe("the mark is random (CR 10.11.2a)", () => {
  it("lands on each central server across seeds, whatever the turn number", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const s = createInitialState();
      s.turnNumber = 3;
      seedRng(s, seed);
      seen.add(pickRandomCentral(s));
    }
    expect([...seen].sort()).toEqual(["archives", "hq", "rd"]);
  });

  it("identify your mark uses it and keeps the mark for the turn (CR 10.11.3)", () => {
    const s = createInitialState();
    seedRng(s, 7);
    run(s, s.runner.identityId, "identify_mark");
    const mark = currentMark(s);
    expect(["hq", "rd", "archives"]).toContain(mark);
    run(s, s.runner.identityId, "identify_mark");
    expect(currentMark(s)).toBe(mark);
  });
});

describe("Meeting of Minds: reveal any number (card text; CR 1.21.3)", () => {
  it("the Runner says which matching cards are revealed", () => {
    const s = runnerTurn();
    put(s, "meeting-of-minds", "mom-1", "runner:play");
    grip(s, [
      ["daily-casts", "g-1"],
      ["sure-gamble", "g-2"],
    ]);
    const a = s.cards["g-1"];
    a.subtypes = ["virtual"];
    const b = put(s, "daily-casts", "g-3", "runner:grip");
    b.subtypes = ["virtual"];
    b.title = "Second Virtual";
    s.runner.hand.push("g-3");
    s.runner.deck = [];
    const credits = s.runner.credits;
    run(s, "mom-1", "reveal_gain", { subtype: "virtual" });
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(optionIds(s).sort()).toEqual([
      "choose-card:g-1",
      "choose-card:g-3",
      "choose-cards-done",
    ]);
    const one = done(pick(s, "g-3"));
    expect(one.runner.credits).toBe(credits + 1);
    const line = one.log.find((l) => l.includes("Meeting of Minds — reveal"))!;
    expect(line).toContain("Second Virtual");
    expect(line).not.toContain(a.title);
    const none = done(s);
    expect(none.runner.credits).toBe(credits);
    expect(one.runner.hand).toEqual(["g-1", "g-2", "g-3"]);
  });
});

describe("searching R&D (CR 8.7)", () => {
  function atlas(extra: object = {}): GameState {
    const s = corpTurn();
    put(s, "project-atlas", "atlas-1", "corp:score");
    rd(s, [
      ["hedge-fund", "r-0"],
      ["ice-wall", "r-1"],
      ["hostile-takeover", "r-2"],
      ["pad-campaign", "r-3"],
    ]);
    hq(s, []);
    run(s, "atlas-1", "search_rd_to_hq", { amount: 1, ...extra });
    return s;
  }

  it("the Corp picks from all of R&D, not the top card", () => {
    const s = atlas();
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(optionIds(s).sort()).toEqual([
      "choose-card:r-0",
      "choose-card:r-1",
      "choose-card:r-2",
      "choose-card:r-3",
    ]);
    // A search for a set number with no criterion must find one (CR 8.7.2d).
    expect(optionIds(s)).not.toContain("choose-cards-done");
    const t = pick(s, "r-2");
    expect(t.corp.hand).toEqual(["r-2"]);
    expect(t.corp.deck.sort()).toEqual(["r-0", "r-1", "r-3"]);
    expect(logged(t)).toContain("shuffle R&D");
    // Not revealed: the log does not name the card.
    expect(logged(t)).not.toContain("Hostile Takeover");
  });

  it("does not show the Runner what is in R&D", () => {
    const seen = getPublicView(atlas(), "runner").pendingChoice;
    expect(JSON.stringify(seen)).not.toContain("r-2");
    expect(JSON.stringify(seen)).not.toContain("Hostile Takeover");
  });

  it("names the card when the text has it revealed", () => {
    const t = pick(atlas({ reveal: true }), "r-2");
    expect(logged(t)).toContain("reveal Hostile Takeover");
  });

  it("\"up to\" lets the Corp stop early", () => {
    const s = corpTurn();
    put(s, "hortum", "hort-1", "server:hq:ice");
    rd(s, [
      ["hedge-fund", "r-0"],
      ["ice-wall", "r-1"],
      ["hostile-takeover", "r-2"],
    ]);
    hq(s, []);
    run(s, "hort-1", "search_rd_to_hq", { amount: 2, upTo: true });
    expect(optionIds(s)).toContain("choose-cards-done");
    const t = done(pick(s, "r-1"));
    expect(t.corp.hand).toEqual(["r-1"]);
    expect(t.corp.deck).toHaveLength(2);
  });
});

describe("other instructions where the player picks (CR 1.15.2)", () => {
  it("Trust Operation: the Corp picks the Archives card", () => {
    const s = corpTurn();
    put(s, "trust-operation", "to-1", "corp:play");
    archives(s, [
      ["pad-campaign", "a-1", true],
      ["ice-wall", "a-2", true],
    ]);
    run(s, "to-1", "install_and_rez_from_archives_free");
    expect(optionIds(s).sort()).toEqual(["choose-card:a-1", "choose-card:a-2"]);
    let t = pick(s, "a-2");
    // Then where it goes (CR 8.5.16b).
    expect(optionIds(t)).toEqual([
      "install-dest:__new_remote__",
      "install-dest:hq",
      "install-dest:rd",
      "install-dest:archives",
    ]);
    t = must(t, { type: "choose_option", optionId: "install-dest:rd" });
    expect(t.cards["a-2"].rezzed).toBe(true);
    expect(t.cards["a-2"].zone).toBe("server:rd:ice");
    expect(t.servers.rd.ice).toEqual(["a-2"]);
    expect(t.corp.discardPile).toEqual(["a-1"]);
    // "Ignoring all costs".
    expect(t.corp.credits).toBe(s.corp.credits);
  });

  it("Glut Cipher: the Corp picks the 5 Archives cards, and the log names none", () => {
    const s = runnerTurn();
    put(s, "glut-cipher", "gc-1", "runner:play");
    archives(s, [
      ["hedge-fund", "a-0", false],
      ["ice-wall", "a-1", false],
      ["pad-campaign", "a-2", false],
      ["hostile-takeover", "a-3", false],
      ["enigma", "a-4", false],
      ["project-atlas", "a-5", false],
    ]);
    hq(s, []);
    seedRng(s, 3);
    run(s, "gc-1", "tdatd_glut_cipher");
    expect(s.pendingChoice?.chooser).toBe("corp");
    let t: GameState = s;
    for (const id of ["a-5", "a-3", "a-0", "a-1", "a-2"]) t = pick(t, id);
    // a-4 stayed in Archives; the 5 picked went to HQ, then 5 were trashed
    // from HQ at random (HQ held exactly those 5).
    expect(t.corp.hand).toEqual([]);
    expect(t.corp.discardPile).toHaveLength(6);
    expect(t.corp.discardPile.every((id) => t.cards[id].faceup === false)).toBe(true);
    const lines = logged(t);
    for (const title of ["Hedge Fund", "Ice Wall", "PAD Campaign", "Hostile Takeover", "Project Atlas"]) {
      expect(lines).not.toContain(title);
    }
  });

  it("Glut Cipher: nothing happens with fewer than 5 cards in Archives", () => {
    const s = runnerTurn();
    put(s, "glut-cipher", "gc-1", "runner:play");
    archives(s, [["hedge-fund", "a-0", false]]);
    run(s, "gc-1", "tdatd_glut_cipher");
    expect(s.pendingChoice ?? null).toBeNull();
    expect(s.corp.discardPile).toEqual(["a-0"]);
  });

  it("Hasty Relocation: the Corp picks every card, the last one included", () => {
    const s = corpTurn();
    put(s, "hasty-relocation", "hr-1", "corp:play");
    hq(s, [
      ["hedge-fund", "h-1"],
      ["ice-wall", "h-2"],
      ["pad-campaign", "h-3"],
    ]);
    rd(s, [["enigma", "r-0"]]);
    run(s, "hr-1", "add_n_hq_to_top_rd_continue", { remaining: 1 });
    expect(s.pendingChoice?.chooser).toBe("corp");
    const t = must(s, { type: "choose_option", optionId: "hq-top:h-2" });
    expect(t.corp.deck[0]).toBe("h-2");
    expect(t.corp.hand).toEqual(["h-1", "h-3"]);
  });

  it("Bacterial Programming: trashed cards are facedown and the rest are arranged by the Corp", () => {
    const s = corpTurn();
    put(s, "bacterial-programming", "bp-1", "corp:score");
    rd(s, [
      ["hedge-fund", "r-0"],
      ["ice-wall", "r-1"],
      ["pad-campaign", "r-2"],
      ["enigma", "r-3"],
    ]);
    hq(s, []);
    s.corp.discardPile = [];
    run(s, "bp-1", "dtwn_bacterial_programming");
    let t = must(s, { type: "choose_option", optionId: "begin" });
    t = must(t, { type: "choose_option", optionId: "trash:r-0" });
    expect(t.cards["r-0"].zone).toBe("corp:archives");
    expect(t.cards["r-0"].faceup).toBe(false);
    expect(t.log.join("\n")).not.toContain("trash Hedge Fund");
    t = must(t, { type: "choose_option", optionId: "keep-order" });
    // Three cards left: the Corp orders them.
    expect(optionIds(t).sort()).toEqual([
      "rd-arrange:r-1",
      "rd-arrange:r-2",
      "rd-arrange:r-3",
    ]);
    t = must(t, { type: "choose_option", optionId: "rd-arrange:r-3" });
    t = must(t, { type: "choose_option", optionId: "rd-arrange:r-1" });
    t = must(t, { type: "choose_option", optionId: "rd-arrange:r-2" });
    expect(t.corp.deck.slice(0, 3).map((id) => t.cards[id].defId)).toEqual([
      "enigma",
      "ice-wall",
      "pad-campaign",
    ]);
    // Rearranged cards are new objects whose ids say nothing about them.
    for (const id of t.corp.deck.slice(0, 3)) {
      expect(id).toMatch(/^obj_[0-9a-z]{8}$/);
    }
    expect(logged(t)).not.toContain("Enigma");
  });
});
