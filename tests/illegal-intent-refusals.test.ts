/**
 * Illegal intents found by the game's verification table (V7 gate): each
 * is refused, with the reason that names what is wrong, and a CR cite.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyIntent,
  assertPinnedTag,
  crDataPresent,
  createGame,
  queryLegality,
} from "../src/index.js";
import type { Action, ApplyResult, GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run `npm run fetch-cr` before tests.");
  assertPinnedTag("v26.03");
});

function must(state: GameState, action: Action): GameState {
  const applied = applyIntent(state, action);
  if (!applied.ok) throw new Error(applied.error);
  return applied.state;
}

/** The demo game marks a Runner program rezzed (CR 8.1.4f); clear that. */
function newGame(): GameState {
  const state = createGame();
  for (const card of Object.values(state.cards)) {
    if (card.side === "runner") card.rezzed = false;
  }
  return state;
}

function toCorpTakeAction(state: GameState): GameState {
  let current = state;
  while (
    current.timingKey === "opening.corpMulligan" ||
    current.timingKey === "opening.runnerMulligan"
  ) {
    current = must(current, { type: "keep_starting_hand" });
  }
  for (let i = 0; i < 8 && current.timingKey !== "corp.takeAction"; i++) {
    current = must(current, { type: "pass_window" });
  }
  return current;
}

function hold(state: GameState, id: string): void {
  const card = state.cards[id];
  const player = card.side === "corp" ? state.corp : state.runner;
  for (const pile of [player.hand, player.deck, player.discardPile]) {
    const index = pile.indexOf(id);
    if (index >= 0) pile.splice(index, 1);
  }
  player.hand.push(id);
  card.zone = card.side === "corp" ? "corp:hq" : "runner:grip";
}

function refused(result: ApplyResult): { error: string; cites: string[] } {
  if (result.ok) throw new Error("expected the intent to be refused");
  return { error: result.error, cites: result.cites.map((c) => c.number) };
}

describe("illegal intents are refused with the specific reason", () => {
  it("refuses ice sent to a server's root (CR 3.4.2, 8.5.2d)", () => {
    const state = toCorpTakeAction(newGame());
    state.corp.clicks = 3;
    state.corp.credits = 10;
    hold(state, "corp-ice-1");
    const asset = state.cards["corp-asset-1"];
    state.corp.hand = state.corp.hand.filter((id) => id !== asset.id);
    state.corp.deck = state.corp.deck.filter((id) => id !== asset.id);
    asset.zone = "server:remote-1:root";
    state.servers["remote-1"] = { id: "remote-1", kind: "remote", ice: [], root: [asset.id] };
    state.nextRemoteNumber = 2;
    const remote = state.servers["remote-1"];

    // Not offered: ice installs only protecting a server.
    expect(
      queryLegality(state).legal.some(
        ({ action }) =>
          action.type === "basic_install" &&
          action.cardId === "corp-ice-1" &&
          action.destination.kind === "remote_root",
      ),
    ).toBe(false);

    for (const serverId of [remote.id, "hq"] as const) {
      const out = refused(
        applyIntent(state, {
          type: "basic_install",
          cardId: "corp-ice-1",
          destination: { kind: "remote_root", serverId },
        }),
      );
      expect(out.error).toBe("Ice is installed protecting a server, not in its root.");
      expect(out.cites).toEqual(["3.4.2", "8.5.2d"]);
    }
    expect(state.servers[remote.id].ice).not.toContain("corp-ice-1");

    // Protecting the same server is still legal.
    const next = must(state, {
      type: "basic_install",
      cardId: "corp-ice-1",
      destination: { kind: "protect", serverId: remote.id },
    });
    expect(next.servers[remote.id].ice).toContain("corp-ice-1");
  });
});
