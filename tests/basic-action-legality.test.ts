import { beforeAll, describe, expect, it } from "vitest";
import { applyIntent, assertPinnedTag, crDataPresent, createGame, queryLegality } from "../src/index.js";
import type { Action, GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run `npm run fetch-cr` before tests.");
  assertPinnedTag("v26.03");
});

function must(state: GameState, action: Action): GameState {
  const applied = applyIntent(state, action);
  if (!applied.ok) throw new Error(applied.error);
  return applied.state;
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

function ofType(state: GameState, type: Action["type"]): Action[] {
  return queryLegality(state).legal
    .map((entry) => entry.action)
    .filter((action) => action.type === type);
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

describe("basic action legality", () => {
  it("offers each Corp basic action only when that action is legal", () => {
    const state = toCorpTakeAction(createGame());
    expect(state.timingKey).toBe("corp.takeAction");
    state.corp.clicks = 3;
    state.corp.credits = 5;
    state.corp.deck = ["corp-fill-2"];

    expect(ofType(state, "basic_gain_credit")).toHaveLength(1);
    state.corp.clicks = 0;
    expect(ofType(state, "basic_gain_credit")).toHaveLength(0);
    state.corp.clicks = 3;

    expect(ofType(state, "basic_draw")).toHaveLength(1);
    state.corp.deck = [];
    expect(ofType(state, "basic_draw")).toHaveLength(0);
    state.corp.deck = ["corp-fill-2"];

    expect(ofType(state, "basic_purge_virus")).toHaveLength(1);
    state.corp.clicks = 2;
    expect(ofType(state, "basic_purge_virus")).toHaveLength(0);
    state.corp.clicks = 3;

    hold(state, "corp-fill-3");
    state.cards["corp-fill-3"].type = "operation";
    expect(ofType(state, "play_operation").some((action) => action.cardId === "corp-fill-3")).toBe(true);
    expect(
      ofType(state, "basic_install").some((action) => action.cardId === "corp-fill-3"),
    ).toBe(false);

    const upgrade = structuredClone(state.cards["corp-asset-1"]);
    upgrade.id = "upgrade-1";
    upgrade.type = "upgrade";
    upgrade.title = "Upgrade";
    state.cards[upgrade.id] = upgrade;
    hold(state, upgrade.id);
    expect(
      ofType(state, "basic_install").some(
        (action) =>
          action.type === "basic_install" &&
          action.cardId === upgrade.id &&
          action.destination.kind === "remote_root" &&
          action.destination.serverId === "hq",
      ),
    ).toBe(true);

    const resource = structuredClone(state.cards["runner-program-1"]);
    resource.id = "resource-1";
    resource.type = "resource";
    resource.side = "runner";
    resource.title = "Resource";
    resource.zone = "runner:installed";
    state.cards[resource.id] = resource;
    state.runner.installed = [resource.id];
    const program = state.cards["runner-program-1"];
    program.zone = "runner:installed";
    state.runner.installed.push(program.id);
    state.runner.hand = state.runner.hand.filter((id) => id !== program.id);

    state.runner.tags = 0;
    expect(ofType(state, "basic_trash_resource")).toHaveLength(0);
    state.runner.tags = 1;
    state.corp.credits = 1;
    expect(ofType(state, "basic_trash_resource")).toHaveLength(0);
    state.corp.credits = 5;
    const trash = ofType(state, "basic_trash_resource");
    expect(trash.map((action) => action.cardId)).toEqual([resource.id]);
    const before = state.corp.credits;
    const trashed = must(state, { type: "basic_trash_resource", cardId: resource.id });
    expect(trashed.corp.credits).toBe(before - 2);
  });

  it("installing an upgrade in a new remote creates that server (CR 4.6.8b)", () => {
    const state = toCorpTakeAction(createGame());
    state.corp.clicks = 3;
    state.corp.credits = 5;
    const upgrade = structuredClone(state.cards["corp-asset-1"]);
    upgrade.id = "upgrade-new-remote";
    upgrade.type = "upgrade";
    upgrade.title = "Upgrade";
    state.cards[upgrade.id] = upgrade;
    hold(state, upgrade.id);

    expect(
      ofType(state, "basic_install").some(
        (action) =>
          action.type === "basic_install" &&
          action.cardId === upgrade.id &&
          action.destination.kind === "new_remote",
      ),
    ).toBe(true);

    const next = must(state, {
      type: "basic_install",
      cardId: upgrade.id,
      destination: { kind: "new_remote" },
    });
    const remote = Object.values(next.servers).find((s) => s.kind === "remote");
    expect(remote?.root).toContain(upgrade.id);
    expect(next.cards[upgrade.id].zone).toBe(`server:${remote?.id}:root`);
  });

  it("offers each Runner basic action only when that action is legal", () => {
    const state = toCorpTakeAction(createGame());
    state.timingKey = "runner.takeAction";
    state.activeSide = "runner";
    state.runner.clicks = 4;
    state.runner.credits = 5;
    state.runner.tags = 0;

    hold(state, "runner-program-1");
    const event = state.cards["runner-fill-1"];
    event.type = "event";
    hold(state, event.id);

    const installs = ofType(state, "basic_install");
    expect(installs.some((action) => action.cardId === "runner-program-1")).toBe(true);
    expect(installs.some((action) => action.cardId === event.id)).toBe(false);
    expect(ofType(state, "play_event").some((action) => action.cardId === event.id)).toBe(true);
    expect(ofType(state, "basic_run").map((action) => action.serverId).sort()).toEqual([
      "archives",
      "hq",
      "rd",
    ]);

    expect(ofType(state, "basic_remove_tag")).toHaveLength(0);
    state.runner.tags = 1;
    state.runner.credits = 1;
    expect(ofType(state, "basic_remove_tag")).toHaveLength(0);
    state.runner.credits = 2;
    expect(ofType(state, "basic_remove_tag")).toHaveLength(1);
    state.runner.clicks = 0;
    expect(ofType(state, "basic_gain_credit")).toHaveLength(0);
  });
});
