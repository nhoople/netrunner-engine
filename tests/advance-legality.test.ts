import { beforeAll, describe, expect, it } from "vitest";
import { applyIntent, assertPinnedTag, crDataPresent, createGame, queryLegality } from "../src/index.js";
import type { Action, GameState, ServerId } from "../src/state/types.js";

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

function pull(state: GameState, id: string): void {
  for (const pile of [state.corp.hand, state.corp.deck, state.corp.discardPile, state.corp.installed]) {
    const index = pile.indexOf(id);
    if (index >= 0) pile.splice(index, 1);
  }
  for (const server of Object.values(state.servers)) {
    server.root = server.root.filter((cardId) => cardId !== id);
    server.ice = server.ice.filter((cardId) => cardId !== id);
  }
}

function install(
  state: GameState,
  id: string,
  serverId: ServerId,
  pile: "root" | "ice",
): void {
  pull(state, id);
  if (!state.servers[serverId]) {
    state.servers[serverId] = { id: serverId, kind: "remote", ice: [], root: [] };
  }
  const card = state.cards[id];
  card.zone = `${serverId}:${pile}`;
  state.servers[serverId][pile].push(id);
}

describe("basic advance targets (CR 1.18.3)", () => {
  it("offers agendas and cards that can be advanced, and refuses the rest", () => {
    const state = toCorpTakeAction(createGame());
    expect(state.timingKey).toBe("corp.takeAction");
    state.corp.credits = 5;
    state.corp.clicks = 3;

    const agenda = state.cards["corp-fill-1"];
    agenda.type = "agenda";
    agenda.advancementRequirement = 3;
    agenda.agendaPoints = 1;
    install(state, agenda.id, "remote-1", "root");

    const asset = state.cards["corp-asset-1"];
    asset.canAdvance = false;
    install(state, asset.id, "remote-1", "root");

    const advanceable = structuredClone(asset);
    advanceable.id = "advanceable-asset";
    advanceable.title = "Advanceable asset";
    advanceable.canAdvance = true;
    state.cards[advanceable.id] = advanceable;
    install(state, advanceable.id, "remote-2", "root");

    const upgrade = structuredClone(asset);
    upgrade.id = "advanceable-upgrade";
    upgrade.title = "Advanceable upgrade";
    upgrade.type = "upgrade";
    upgrade.canAdvance = true;
    state.cards[upgrade.id] = upgrade;
    install(state, upgrade.id, "remote-2", "root");

    const ice = state.cards["corp-ice-1"];
    ice.canAdvance = true;
    install(state, ice.id, "remote-1", "ice");

    const plainIce = structuredClone(ice);
    plainIce.id = "plain-ice";
    plainIce.title = "Plain ice";
    plainIce.canAdvance = false;
    state.cards[plainIce.id] = plainIce;
    install(state, plainIce.id, "remote-2", "ice");

    const woodcutter = structuredClone(ice);
    woodcutter.id = "woodcutter";
    woodcutter.title = "Woodcutter";
    woodcutter.canAdvance = true;
    woodcutter.canAdvanceOnlyWhenRezzed = true;
    woodcutter.rezzed = false;
    state.cards[woodcutter.id] = woodcutter;
    install(state, woodcutter.id, "remote-3", "ice");

    const targets = queryLegality(state).legal
      .filter((entry) => entry.action.type === "advance")
      .map((entry) => entry.action.cardId)
      .sort();
    expect(targets).toEqual(["advanceable-asset", "advanceable-upgrade", "corp-fill-1", "corp-ice-1"]);

    const refused = applyIntent(state, { type: "advance", cardId: asset.id });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.cites.some((cite) => cite.number === "1.18.3")).toBe(true);
  });
});
