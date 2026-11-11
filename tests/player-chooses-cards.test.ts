/**
 * The engine does not pick a card for a player.
 * CR 1.15.2: the player resolving an instruction makes its choices.
 * CR 5.5.4c: the discarding player chooses the cards discarded to hand
 * size, and they are discarded simultaneously.
 * CR 4.4.6c: the Corp may look at every card in Archives; facedown cards
 * there are hidden from the Runner.
 * CR 7.3.4a: a card accessed from the Corp's hand is a random candidate.
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
  seedRng,
  validateEffectTree,
} from "../src/index.js";
import type { Action, GameState } from "../src/index.js";
import { trashCorpCardToArchives } from "../src/effects/corpTrash.js";

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

function run(s: GameState, kind: string, extra: object = {}): void {
  const r = evalEffect(
    { state: s, sourceId: s.corp.identityId },
    fx.do({ kind, ...extra } as never),
  );
  if (!r.ok) throw new Error(`${kind}: ${r.error}`);
}

const pick = (s: GameState, cardId: string): GameState =>
  must(s, { type: "choose_option", optionId: `choose-card:${cardId}` });

const optionIds = (s: GameState): string[] =>
  (s.pendingChoice?.options ?? []).map((o) => o.id);

describe("discard step (CR 5.5.4c)", () => {
  function runnerAtDiscard(): GameState {
    const s = createInitialState();
    s.activeSide = "runner";
    s.timingKey = "runner.discard";
    s.priorityStack = [];
    s.runner.maxHandSize = 5;
    grip(s, [
      ["sure-gamble", "g-1"],
      ["corroder", "g-2"],
      ["diesel", "g-3"],
      ["sure-gamble", "g-4"],
      ["corroder", "g-5"],
      ["diesel", "g-6"],
      ["sure-gamble", "g-7"],
    ]);
    return s;
  }

  it("asks the Runner which cards to discard instead of taking the last drawn", () => {
    let s = runnerAtDiscard();
    s = must(s, { type: "discard_to_hand_size" });
    expect(s.timingKey).toBe("runner.discard");
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(optionIds(s)).toHaveLength(7);
    expect(s.runner.hand).toHaveLength(7);

    s = pick(s, "g-1");
    // Nothing is discarded until every card is chosen.
    expect(s.runner.hand).toHaveLength(7);
    expect(optionIds(s)).not.toContain("choose-card:g-1");
    s = pick(s, "g-3");

    expect(s.pendingChoice).toBeNull();
    expect(s.runner.hand).toEqual(["g-2", "g-4", "g-5", "g-6", "g-7"]);
    expect(s.runner.discardPile).toEqual(["g-1", "g-3"]);
    expect(s.cards["g-1"].zone).toBe("runner:heap");
    expect(s.timingKey).not.toBe("runner.discard");
  });

  it("accepts the cards on the action itself", () => {
    let s = runnerAtDiscard();
    s = must(s, { type: "discard_to_hand_size", cardIds: ["g-2", "g-6"] });
    expect(s.pendingChoice).toBeNull();
    expect(s.runner.hand).toEqual(["g-1", "g-3", "g-4", "g-5", "g-7"]);
    expect(s.runner.discardPile).toEqual(["g-2", "g-6"]);
  });

  it("rejects the wrong number of cards or a card not in hand", () => {
    const s = runnerAtDiscard();
    expect(applyAction(s, { type: "discard_to_hand_size", cardIds: ["g-2"] }).ok).toBe(false);
    expect(
      applyAction(s, { type: "discard_to_hand_size", cardIds: ["g-2", "g-2"] }).ok,
    ).toBe(false);
    expect(
      applyAction(s, { type: "discard_to_hand_size", cardIds: ["g-2", "nope"] }).ok,
    ).toBe(false);
  });

  it("does not ask when the hand is within its maximum", () => {
    let s = runnerAtDiscard();
    s.runner.hand = s.runner.hand.slice(0, 5);
    s = must(s, { type: "discard_to_hand_size" });
    expect(s.pendingChoice).toBeNull();
    expect(s.runner.hand).toHaveLength(5);
    expect(s.timingKey).not.toBe("runner.discard");
  });

  it("discards the Corp's chosen cards facedown and hides the choice from the Runner", () => {
    let s = createInitialState();
    s.activeSide = "corp";
    s.timingKey = "corp.discard";
    s.priorityStack = [];
    s.corp.maxHandSize = 5;
    hq(s, [
      ["hedge-fund", "h-1"],
      ["hostile-takeover", "h-2"],
      ["ice-wall", "h-3"],
      ["pad-campaign", "h-4"],
      ["hedge-fund", "h-5"],
      ["ice-wall", "h-6"],
    ]);
    s.corp.discardPile = [];
    s = must(s, { type: "discard_to_hand_size" });
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.hiddenFromOpponent).toBe(true);

    const runnerSees = getPublicView(s, "runner").pendingChoice;
    expect(runnerSees?.options).toHaveLength(6);
    expect(JSON.stringify(runnerSees)).not.toContain("h-2");
    expect(JSON.stringify(runnerSees)).not.toContain("Hostile Takeover");
    const corpSees = getPublicView(s, "corp").pendingChoice;
    expect(corpSees?.options.map((o) => o.label)).toContain("Hostile Takeover");

    s = pick(s, "h-2");
    expect(s.corp.hand).toEqual(["h-1", "h-3", "h-4", "h-5", "h-6"]);
    expect(s.corp.discardPile).toEqual(["h-2"]);
    expect(s.cards["h-2"].faceup).toBe(false);
  });
});

describe("trash from HQ is the Corp's choice (CR 1.15.2)", () => {
  function threeInHq(): GameState {
    const s = createInitialState();
    hq(s, [
      ["hedge-fund", "h-1"],
      ["hostile-takeover", "h-2"],
      ["ice-wall", "h-3"],
    ]);
    s.corp.discardPile = [];
    return s;
  }

  it("asks which card, then resolves what follows", () => {
    let s = threeInHq();
    s.corp.credits = 0;
    run(s, "trash_hq", { pick: "first", then: fx.gainCredits("corp", 2) });
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.hiddenFromOpponent).toBe(true);
    expect(s.corp.credits).toBe(0);
    s = pick(s, "h-1");
    expect(s.corp.hand).toEqual(["h-2", "h-3"]);
    expect(s.corp.discardPile).toEqual(["h-1"]);
    expect(s.corp.credits).toBe(2);
  });

  it("does not ask when every card in HQ must go", () => {
    const s = threeInHq();
    run(s, "trash_hq", { pick: "choose", amount: 3 });
    expect(s.pendingChoice).toBeNull();
    expect(s.corp.hand).toEqual([]);
    expect(s.corp.discardPile).toHaveLength(3);
  });

  it("does not ask when the cards cannot be told apart", () => {
    const s = createInitialState();
    hq(s, [
      ["hedge-fund", "h-1"],
      ["hedge-fund", "h-2"],
    ]);
    s.corp.discardPile = [];
    run(s, "trash_hq", { pick: "first" });
    expect(s.pendingChoice).toBeNull();
    expect(s.corp.hand).toHaveLength(1);
  });

  it("lets the Corp stop early when the card says any number", () => {
    expect(
      validateEffectTree(fx.do({ kind: "trash_hq", pick: "choose", amount: 9, upTo: true })),
    ).toBeNull();
    let s = threeInHq();
    run(s, "trash_hq", { pick: "choose", amount: 9, upTo: true });
    expect(optionIds(s)).toContain("choose-cards-done");
    s = pick(s, "h-3");
    s = must(s, { type: "choose_option", optionId: "choose-cards-done" });
    expect(s.corp.hand).toEqual(["h-1", "h-2"]);
    expect(s.corp.discardPile).toEqual(["h-3"]);

    let none = threeInHq();
    run(none, "trash_hq", { pick: "choose", amount: 9, upTo: true });
    none = must(none, { type: "choose_option", optionId: "choose-cards-done" });
    expect(none.corp.hand).toHaveLength(3);
  });

  it("trashes at random from the seeded stream when the card says random", () => {
    const trashed = new Set<string>();
    for (let seed = 1; seed <= 24; seed += 1) {
      const s = threeInHq();
      seedRng(s, seed);
      run(s, "trash_hq", { pick: "random" });
      expect(s.pendingChoice).toBeNull();
      expect(s.corp.discardPile).toHaveLength(1);
      trashed.add(s.corp.discardPile[0]!);
    }
    expect(trashed.size).toBe(3);

    const a = threeInHq();
    const b = threeInHq();
    seedRng(a, 5);
    seedRng(b, 5);
    run(a, "trash_hq", { pick: "random" });
    run(b, "trash_hq", { pick: "random" });
    expect(a.corp.discardPile).toEqual(b.corp.discardPile);
  });
});

describe("cards taken from Archives are the Corp's choice (CR 4.4.6c)", () => {
  function mixedArchives(): GameState {
    const s = createInitialState();
    s.corp.hand = [];
    archives(s, [
      ["hedge-fund", "a-1", true],
      ["hostile-takeover", "a-2", false],
      ["ice-wall", "a-3", true],
      ["pad-campaign", "a-4", false],
    ]);
    return s;
  }

  it("adds the chosen card to HQ, not the top card of Archives", () => {
    let s = mixedArchives();
    run(s, "archives_to_hq", { amount: 1 });
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(optionIds(s)).toHaveLength(4);
    s = pick(s, "a-2");
    expect(s.corp.hand).toEqual(["a-2"]);
    expect(s.corp.discardPile).toEqual(["a-1", "a-3", "a-4"]);
    expect(s.cards["a-2"].zone).toBe("corp:hq");
  });

  it("hides the options from the Runner while a facedown card is on offer", () => {
    const s = mixedArchives();
    run(s, "archives_to_hq", { amount: 1 });
    expect(s.pendingChoice?.hiddenFromOpponent).toBe(true);
    const seen = JSON.stringify(getPublicView(s, "runner").pendingChoice);
    expect(seen).not.toContain("a-2");
    expect(seen).not.toContain("Hostile Takeover");
  });

  it("does not ask when Archives holds one card", () => {
    const s = createInitialState();
    s.corp.hand = [];
    archives(s, [["hedge-fund", "a-1", true]]);
    run(s, "archives_to_hq", { amount: 1 });
    expect(s.pendingChoice).toBeNull();
    expect(s.corp.hand).toEqual(["a-1"]);
  });

  it("shuffles the chosen cards into R&D and lets the Corp take fewer", () => {
    let s = mixedArchives();
    for (let i = 0; i < 12; i += 1) {
      put(s, "hedge-fund", `rd-${i}`, "corp:rd");
    }
    s.corp.deck = Array.from({ length: 12 }, (_, i) => `rd-${i}`);
    const before = [...s.corp.deck];
    run(s, "shuffle_archives_to_rd", { amount: 3 });
    expect(optionIds(s)).toContain("choose-cards-done");
    s = pick(s, "a-2");
    s = pick(s, "a-4");
    s = must(s, { type: "choose_option", optionId: "choose-cards-done" });
    expect(s.corp.discardPile).toEqual(["a-1", "a-3"]);
    expect(s.corp.deck).toHaveLength(14);
    expect(s.corp.deck).toEqual(expect.arrayContaining(["a-2", "a-4"]));
    expect(s.cards["a-2"].faceup).toBe(false);
    // A real shuffle: the old order is not kept under the new cards.
    expect(s.corp.deck.filter((id) => id.startsWith("rd-"))).not.toEqual(before);
  });
});

describe("shuffles and random picks use the seeded stream", () => {
  it("does not leave a card shuffled into R&D on top every time", () => {
    const positions = new Set<number>();
    for (let seed = 1; seed <= 16; seed += 1) {
      const s = createInitialState();
      seedRng(s, seed);
      for (let i = 0; i < 9; i += 1) put(s, "hedge-fund", `rd-${i}`, "corp:rd");
      s.corp.deck = Array.from({ length: 9 }, (_, i) => `rd-${i}`);
      const marilyn = put(s, "marilyn-campaign", "mc-1", "server:remote-1:root");
      marilyn.rezzed = true;
      marilyn.faceup = true;
      s.servers["remote-1"] = { id: "remote-1", kind: "remote", ice: [], root: ["mc-1"] };
      trashCorpCardToArchives(s, "mc-1", "corp");
      expect(s.corp.deck).toContain("mc-1");
      positions.add(s.corp.deck.indexOf("mc-1"));
    }
    expect(positions.size).toBeGreaterThan(3);
  });

  it("accesses a random card from HQ, the same one for the same seed (CR 7.3.4a)", () => {
    function breached(seed: number): string {
      let s = createInitialState();
      seedRng(s, seed);
      hq(s, [
        ["hedge-fund", "h-1"],
        ["hostile-takeover", "h-2"],
        ["ice-wall", "h-3"],
        ["pad-campaign", "h-4"],
        ["hedge-fund", "h-5"],
      ]);
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.runner.clicks = 4;
      s.priorityStack = [];
      s = must(s, { type: "basic_run", serverId: "hq" });
      s = must(s, { type: "continue_run" });
      expect(s.timingKey).toBe("breach.awaitAccess");
      const fromHand = (s.run?.accessCandidates ?? []).filter((id) =>
        s.corp.hand.includes(id),
      );
      expect(fromHand).toHaveLength(1);
      return fromHand[0]!;
    }
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed += 1) seen.add(breached(seed));
    expect(seen.size).toBeGreaterThan(2);
    expect(breached(11)).toBe(breached(11));
  });
});

describe("a choice shown to the other player", () => {
  it("does not carry what the options would do", () => {
    const s = createInitialState();
    hq(s, [
      ["hedge-fund", "h-1"],
      ["hostile-takeover", "h-2"],
    ]);
    run(s, "choose_card", {
      chooser: "corp",
      zone: "hq",
      then: fx.do({ kind: "trash_hq_card", cardId: "$chosen" }),
    });
    const runnerSees = getPublicView(s, "runner").pendingChoice;
    expect(JSON.stringify(runnerSees?.options.map((o) => o.effect))).not.toContain(
      "trash_hq_card",
    );
    const corpSees = getPublicView(s, "corp").pendingChoice;
    expect(JSON.stringify(corpSees?.options.map((o) => o.effect))).toContain(
      "trash_hq_card",
    );
  });
});
