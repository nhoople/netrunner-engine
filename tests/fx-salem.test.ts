/**
 * FX-salem (CR audit program, fix-now from PF-S2, engine #950).
 *
 * Salem's Hospitality named from every card in the game, so the Corp's list
 * showed the titles in the Runner's grip and stack (CR 10.2.2a). Quest
 * Completed shared Pinhole Threading's access kind, which needs a run and
 * protects agendas; the card is played outside a run and prints no such
 * restriction (CR 1.2.1, 7.1.5, 7.1.6).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyIntent,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  getPublicView,
  instantiateCard,
  legalActions,
} from "../src/index.js";
import type { Action, GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.26");
});

function must(state: GameState, action: Action): GameState {
  const result = applyIntent(state, action);
  if (!result.ok) throw new Error(`${action.type} refused: ${result.error}`);
  return result.state;
}

function toTakeAction(state: GameState, side: "corp" | "runner"): GameState {
  const wanted = side === "corp" ? "corp.takeAction" : "runner.takeAction";
  for (let guard = 0; guard < 200; guard++) {
    if (state.timingKey === wanted) return state;
    const legal = legalActions(state);
    if (legal.some((a) => a.type === "keep_starting_hand")) {
      state = must(state, { type: "keep_starting_hand" });
      continue;
    }
    if (legal.some((a) => a.type === "discard_to_hand_size")) {
      state = must(state, { type: "discard_to_hand_size" });
      continue;
    }
    const atOtherAction =
      (state.timingKey === "corp.takeAction" && side === "runner") ||
      (state.timingKey === "runner.takeAction" && side === "corp");
    if (atOtherAction && legal.some((a) => a.type === "basic_gain_credit")) {
      state = must(state, { type: "basic_gain_credit" });
      continue;
    }
    if (legal.some((a) => a.type === "pass_window")) {
      state = must(state, { type: "pass_window" });
      continue;
    }
    throw new Error(`Cannot reach ${wanted}; parked at ${state.timingKey}`);
  }
  throw new Error(`Cannot reach ${wanted}`);
}

/** The default board with no Runner card marked rezzed (CR 8.1.4f). */
function fresh(): GameState {
  const s = createInitialState({ stopAfterFirstCycle: false });
  for (const card of Object.values(s.cards)) {
    if (card.side === "runner") card.rezzed = false;
  }
  return s;
}

function put(s: GameState, defId: string, id: string, zone: string) {
  const card = instantiateCard(defId, id, zone as never);
  s.cards[id] = card;
  return card;
}

/** A card alone in the root of a new remote server. */
function installRemote(
  s: GameState,
  defId: string,
  id: string,
  rezzed: boolean,
) {
  const serverId = `remote-${id}`;
  (s.servers as Record<string, unknown>)[serverId] = {
    id: serverId,
    kind: "remote",
    root: [id],
    ice: [],
  };
  const card = put(s, defId, id, `server:${serverId}:root`);
  card.rezzed = rezzed;
  card.faceup = rezzed;
  return card;
}

function optionIds(s: GameState): string[] {
  return (s.pendingChoice?.options ?? []).map((o) => o.id);
}

function revealedTitles(s: GameState): string[] {
  return (s.reveals ?? []).flatMap((r) => r.cards.map((c) => c.title));
}

/** The Corp at its action phase with Salem's Hospitality in HQ. */
function salemBoard(
  grip: Array<[string, string]>,
  stack: Array<[string, string]>,
) {
  let s = fresh();
  put(s, "salems-hospitality", "salem-1", "corp:hq");
  s.corp.hand = ["salem-1"];
  for (const [defId, id] of grip) put(s, defId, id, "runner:grip");
  for (const [defId, id] of stack) put(s, defId, id, "runner:stack");
  s.runner.hand.push(...grip.map(([, id]) => id));
  s.runner.deck.unshift(...stack.map(([, id]) => id));
  s = toTakeAction(s, "corp");
  s.corp.credits = 10;
  return must(s, { type: "play_operation", cardId: "salem-1" });
}

describe("Salem's Hospitality", () => {
  it("Salem's Hospitality offers the Corp names from the catalog, not the titles in the Runner's grip and stack (CR 10.2.2a, 10.2.2b)", () => {
    const empty = salemBoard([], []);
    const plain = optionIds(empty);
    const s = salemBoard(
      [
        ["sure-gamble", "grip-sg"],
        ["diesel", "grip-d"],
      ],
      [["corroder", "stack-c"]],
    );
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(optionIds(s)).toEqual(plain);
    // A Runner card in no zone of this game can be named too.
    expect(optionIds(s)).toContain("salem:Mimic");
    // Only Runner card names: the grip cannot hold a Corp card.
    expect(optionIds(s)).not.toContain("salem:Hedge Fund");
    // The Corp's own view of the choice is the same list.
    const corpView = getPublicView(s, "corp").pendingChoice;
    expect(corpView?.options.map((o) => o.id)).toEqual(plain);
  });

  it("Salem's Hospitality reveals the whole grip, then the Runner trashes every card with the chosen name (CR 1.21.3, 1.14.5)", () => {
    let s = salemBoard(
      [
        ["sure-gamble", "grip-sg1"],
        ["sure-gamble", "grip-sg2"],
        ["diesel", "grip-d"],
      ],
      [["sure-gamble", "stack-sg"]],
    );
    s = must(s, { type: "choose_option", optionId: "salem:Sure Gamble" });
    expect(revealedTitles(s)).toEqual(
      expect.arrayContaining(["Sure Gamble", "Sure Gamble", "Diesel"]),
    );
    expect(s.runner.hand).toContain("grip-d");
    expect(s.runner.hand).not.toContain("grip-sg1");
    expect(s.runner.hand).not.toContain("grip-sg2");
    expect(s.runner.discardPile).toEqual(
      expect.arrayContaining(["grip-sg1", "grip-sg2"]),
    );
    // Only the grip is revealed and trashed, not the stack.
    expect(s.runner.deck).toContain("stack-sg");
    expect(s.corp.discardPile).toContain("salem-1");
  });

  it("Salem's Hospitality naming a card not in the grip still reveals the grip and trashes nothing (CR 1.21.3)", () => {
    let s = salemBoard([["diesel", "grip-d"]], []);
    s = must(s, { type: "choose_option", optionId: "salem:Mimic" });
    expect(revealedTitles(s)).toContain("Diesel");
    expect(s.runner.hand).toContain("grip-d");
    expect(s.runner.discardPile).not.toContain("grip-d");
  });
});

/** The Runner at its action phase, after successful runs on all centrals. */
function questBoard(setup: (s: GameState) => void): GameState {
  let s = fresh();
  put(s, "quest-completed", "quest-1", "runner:grip");
  s.runner.hand.push("quest-1");
  setup(s);
  s = toTakeAction(s, "runner");
  s.turn.successfulHqRunThisTurn = true;
  s.turn.successfulRdRunThisTurn = true;
  s.turn.successfulArchivesRunThisTurn = true;
  s.runner.credits = 10;
  return must(s, { type: "play_event", cardId: "quest-1" });
}

/** Choose a card to access, then steal it, or pay to trash it, or neither. */
function accessThrough(s: GameState, cardId: string, trash: boolean) {
  s = must(s, {
    type: "choose_option",
    optionId: `access-installed:${cardId}`,
  });
  for (let i = 0; i < 20 && s.timingKey !== "runner.takeAction"; i++) {
    const legal = legalActions(s);
    const next =
      (trash ? legal.find((a) => a.type === "trash_accessed") : undefined) ??
      legal.find((a) => a.type === "steal_agenda") ??
      legal.find((a) => a.type === "access_card") ??
      legal.find((a) => a.type === "finish_access") ??
      legal.find((a) => a.type === "finish_breach") ??
      legal.find((a) => a.type === "pass_window");
    if (!next) {
      throw new Error(`Stuck at ${s.timingKey}: ${JSON.stringify(legal)}`);
    }
    s = must(s, next);
  }
  return s;
}

describe("Quest Completed", () => {
  it("Quest Completed accesses a root card outside a run, and the Runner can steal it (CR 7.1.6)", () => {
    let s = questBoard((b) => {
      installRemote(b, "hostile-takeover", "ht-1", false);
    });
    const clicksAfterPlay = s.runner.clicks;
    expect(s.run).toBeNull();
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(optionIds(s)).toEqual(["access-installed:ht-1"]);
    s = accessThrough(s, "ht-1", false);
    expect(s.runner.scoreArea).toContain("ht-1");
    expect(s.runner.discardPile).toContain("quest-1");
    expect(s.runner.playArea).not.toContain("quest-1");
    // The access is part of the one action: no further click is spent.
    expect(s.runner.clicks).toBe(clicksAfterPlay);
    expect(s.timingKey).toBe("runner.takeAction");
  });

  it("Quest Completed can access a card in a central server's root, and the Runner may pay to trash it (CR 7.1.5)", () => {
    let s = questBoard((b) => {
      const card = put(b, "manta-grid", "mg-1", "server:hq:root");
      card.rezzed = true;
      card.faceup = true;
      b.servers.hq!.root = ["mg-1"];
    });
    expect(optionIds(s)).toEqual(["access-installed:mg-1"]);
    s = accessThrough(s, "mg-1", true);
    expect(s.corp.discardPile).toContain("mg-1");
    expect(s.servers.hq!.root).not.toContain("mg-1");
  });

  it("Quest Completed's list names a rezzed card but not a facedown one, and offers no ice (CR 7.1.2, 10.2.2a)", () => {
    const s = questBoard((b) => {
      installRemote(b, "pad-campaign", "pad-1", true);
      installRemote(b, "hostile-takeover", "ht-1", false);
      const ice = put(b, "ice-wall", "iw-1", "server:remote-pad-1:ice");
      ice.rezzed = true;
      ice.faceup = true;
      (b.servers as Record<string, { ice: string[] }>)["remote-pad-1"]!.ice = [
        "iw-1",
      ];
    });
    const labels = (s.pendingChoice?.options ?? []).map((o) => o.label);
    expect(optionIds(s)).toEqual([
      "access-installed:pad-1",
      "access-installed:ht-1",
    ]);
    expect(labels.join(" ")).toContain("PAD Campaign");
    expect(labels.join(" ")).not.toContain("Hostile Takeover");
  });
});
