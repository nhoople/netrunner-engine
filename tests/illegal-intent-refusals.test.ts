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

/** An agenda (advancement requirement 3) alone in the root of remote-1. */
function installAgendaInRemote(state: GameState): GameState["cards"][string] {
  const agenda = state.cards["corp-asset-1"];
  state.corp.hand = state.corp.hand.filter((id) => id !== agenda.id);
  state.corp.deck = state.corp.deck.filter((id) => id !== agenda.id);
  agenda.type = "agenda";
  agenda.title = "Test Agenda";
  agenda.advancementRequirement = 3;
  agenda.agendaPoints = 2;
  agenda.zone = "server:remote-1:root";
  state.servers["remote-1"] = { id: "remote-1", kind: "remote", ice: [], root: [agenda.id] };
  state.nextRemoteNumber = 2;
  return agenda;
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
  it("names an unknown card id as unknown, not as the wrong card type (CR 5.2.6e)", () => {
    const state = toCorpTakeAction(newGame());
    const out = refused(applyIntent(state, { type: "play_operation", cardId: "no-such-card" }));
    expect(out.error).toBe("Unknown card.");
    expect(out.cites).toContain("5.2.6e");
  });

  it("refuses Remove tag on the Corp's turn as a Runner action (CR 5.2.7g)", () => {
    const state = toCorpTakeAction(newGame());
    state.runner.tags = 1;
    state.runner.credits = 5;
    const out = refused(applyIntent(state, { type: "basic_remove_tag" }));
    expect(out.error).toBe("Only the Runner may remove a tag with the basic action.");
    expect(out.cites).toContain("5.2.7g");
    expect(out.cites).toContain("5.2.4");
  });

  it("refuses a Corp card install on the Runner's turn as a Corp install (CR 5.2.6d)", () => {
    const state = toCorpTakeAction(newGame());
    hold(state, "corp-ice-1");
    state.timingKey = "runner.takeAction";
    state.activeSide = "runner";
    state.runner.clicks = 4;
    for (const destination of [
      { kind: "new_remote" as const },
      { kind: "protect" as const, serverId: "hq" as const },
      { kind: "installed" as const },
    ]) {
      const out = refused(
        applyIntent(state, { type: "basic_install", cardId: "corp-ice-1", destination }),
      );
      expect(out.error).toBe("Only the Corp installs Corp cards.");
      expect(out.cites).toContain("5.2.6d");
    }
    // The Runner's own install is unaffected.
    hold(state, "runner-program-1");
    must(state, {
      type: "basic_install",
      cardId: "runner-program-1",
      destination: { kind: "installed" },
    });
  });

  it("refuses a Runner card install on the Corp's turn as a Runner install (CR 5.2.7d)", () => {
    const state = toCorpTakeAction(newGame());
    hold(state, "runner-program-1");
    const out = refused(
      applyIntent(state, {
        type: "basic_install",
        cardId: "runner-program-1",
        destination: { kind: "new_remote" },
      }),
    );
    expect(out.error).toBe("Only the Runner installs Runner cards.");
    expect(out.cites).toContain("5.2.7d");
  });

  it("names the missing advancement counters before the scoring window (CR 1.17.3a)", () => {
    const state = toCorpTakeAction(newGame());
    const agenda = installAgendaInRemote(state);
    agenda.advancementCounters = 1;
    // Not a scoring window and under-advanced: the target reason wins.
    let out = refused(applyIntent(state, { type: "score_agenda", cardId: agenda.id }));
    expect(out.error).toBe(`${agenda.title} has 1 of 3 advancement counters.`);
    expect(out.cites).toContain("1.17.3a");
    // Fully advanced, still not a scoring window: the window reason.
    agenda.advancementCounters = 3;
    out = refused(applyIntent(state, { type: "score_agenda", cardId: agenda.id }));
    expect(out.error).toBe("Score only in a paid ability window marked (S).");
    // Unknown and uninstalled targets.
    out = refused(applyIntent(state, { type: "score_agenda", cardId: "no-such-card" }));
    expect(out.error).toBe("Unknown card.");
    hold(state, "corp-ice-1");
    out = refused(applyIntent(state, { type: "score_agenda", cardId: "corp-ice-1" }));
    expect(out.error).toBe("Only an agenda installed in a server root can be scored.");
  });

  it("names a rezzed card as rezzed before the rez window (CR 8.1.2)", () => {
    const state = toCorpTakeAction(newGame());
    const ice = state.cards["corp-ice-1"];
    state.corp.hand = state.corp.hand.filter((id) => id !== ice.id);
    state.corp.deck = state.corp.deck.filter((id) => id !== ice.id);
    ice.zone = "server:hq:ice";
    ice.rezzed = true;
    ice.faceup = true;
    state.servers.hq.ice.push(ice.id);
    let out = refused(applyIntent(state, { type: "rez_ice", cardId: ice.id }));
    expect(out.error).toBe("Ice is already rezzed.");
    expect(out.cites).toContain("8.1.2");

    const asset = state.cards["corp-asset-1"];
    state.corp.hand = state.corp.hand.filter((id) => id !== asset.id);
    state.corp.deck = state.corp.deck.filter((id) => id !== asset.id);
    asset.zone = "server:hq:root";
    asset.type = "upgrade";
    asset.rezzed = true;
    asset.faceup = true;
    state.servers.hq.root.push(asset.id);
    out = refused(applyIntent(state, { type: "rez_asset", cardId: asset.id }));
    expect(out.error).toBe("Already rezzed.");
    expect(out.cites).toContain("8.1.2");

    // Unrezzed and outside a window: the window reason stays.
    ice.rezzed = false;
    ice.faceup = false;
    out = refused(applyIntent(state, { type: "rez_ice", cardId: ice.id }));
    expect(out.error).toBe("Ice can only be rezzed during the approach PAW.");
  });
});
