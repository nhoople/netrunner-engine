/**
 * Ported from game.core.engine-test in mtgred/netrunner, pinned at
 * bc9e2fca073a5b21d247e72877804118e81d5472. See tests/jnet/NOTICE.md and
 * docs/jnet-test-ports.md. The deftests that drive jnet's internal event,
 * cost-merge, and first-trash registries are recorded as deferred in the
 * manifest.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
} from "../../src/index.js";
import {
  accessCard,
  finishAccess,
  firstRemote,
  newGame,
  playFromHand,
  qty,
  runToAccess,
  scoreAgenda,
  stealAccessed,
  takeCredits,
} from "./helpers.js";
import type { GameState, ServerId } from "../../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.8");
});

function board(): GameState {
  let state = newGame({
    corpDeck: qty("Hedge Fund", 10),
    corpHand: ["Hostile Takeover", "Cerebral Static", "Lag Time"],
    runnerHand: ["Scrubbed", "Interdiction"],
  });
  state = playFromHand(state, "corp", "Hostile Takeover");
  return state;
}

function playAreaTitles(state: GameState, side: "corp" | "runner"): string[] {
  const ids = side === "corp" ? state.corp.playArea : state.runner.playArea;
  return ids.map((id) => state.cards[id]?.title ?? id);
}

function stealInstalledAgenda(state: GameState): GameState {
  const remote = firstRemote(state);
  const agenda = remote.root[0]!;
  state = runToAccess(state, remote.id as ServerId);
  state = accessCard(state, agenda);
  state = stealAccessed(state, agenda);
  return finishAccess(state);
}

describe("jnet ports — core engine", () => {
  // jnet: game.core.engine-test/trash-currents-test
  it("Cerebral Static stays in play when the Corp scores an agenda", () => {
    let state = board();
    state = playFromHand(state, "corp", "Cerebral Static");
    const agenda = firstRemote(state).root[0]!;
    state = scoreAgenda(state, agenda);
    expect(playAreaTitles(state, "corp")).toContain("Cerebral Static");
  });

  // jnet: game.core.engine-test/trash-currents-test
  it("Cerebral Static is trashed when the Runner steals an agenda", () => {
    let state = board();
    state = playFromHand(state, "corp", "Cerebral Static");
    state = takeCredits(state, "corp");
    state = stealInstalledAgenda(state);
    expect(playAreaTitles(state, "corp")).not.toContain("Cerebral Static");
  });

  // jnet: game.core.engine-test/trash-currents-test
  it("Lag Time replaces Cerebral Static as the Corp current", () => {
    let state = board();
    state = playFromHand(state, "corp", "Cerebral Static");
    state = playFromHand(state, "corp", "Lag Time");
    expect(playAreaTitles(state, "corp")).toContain("Lag Time");
    expect(playAreaTitles(state, "corp")).not.toContain("Cerebral Static");
    expect(
      state.corp.discardPile.some(
        (id) => state.cards[id]?.title === "Cerebral Static",
      ),
    ).toBe(true);
  });

  // jnet: game.core.engine-test/trash-currents-test
  it("Cerebral Static is trashed when the Runner plays Scrubbed", () => {
    let state = board();
    state = playFromHand(state, "corp", "Cerebral Static");
    state = takeCredits(state, "corp");
    state = playFromHand(state, "runner", "Scrubbed");
    expect(playAreaTitles(state, "corp")).not.toContain("Cerebral Static");
  });

  // jnet: game.core.engine-test/trash-currents-test
  it("Scrubbed stays in play when the Runner steals an agenda", () => {
    let state = board();
    state = takeCredits(state, "corp");
    state = playFromHand(state, "runner", "Scrubbed");
    state = stealInstalledAgenda(state);
    expect(playAreaTitles(state, "runner")).toContain("Scrubbed");
  });

  // jnet: game.core.engine-test/trash-currents-test
  it("Scrubbed is trashed when the Corp scores an agenda", () => {
    let state = board();
    state = takeCredits(state, "corp");
    state = playFromHand(state, "runner", "Scrubbed");
    state = takeCredits(state, "runner");
    const agenda = firstRemote(state).root[0]!;
    state = scoreAgenda(state, agenda);
    expect(playAreaTitles(state, "runner")).not.toContain("Scrubbed");
  });

  // jnet: game.core.engine-test/trash-currents-test
  it("Interdiction replaces Scrubbed as the Runner current", () => {
    let state = board();
    state = takeCredits(state, "corp");
    state = playFromHand(state, "runner", "Scrubbed");
    state = playFromHand(state, "runner", "Interdiction");
    expect(playAreaTitles(state, "runner")).toContain("Interdiction");
    expect(playAreaTitles(state, "runner")).not.toContain("Scrubbed");
    expect(
      state.runner.discardPile.some(
        (id) => state.cards[id]?.title === "Scrubbed",
      ),
    ).toBe(true);
  });

  // jnet: game.core.engine-test/trash-currents-test
  it("Scrubbed is trashed when the Corp plays Cerebral Static", () => {
    let state = board();
    state = takeCredits(state, "corp");
    state = playFromHand(state, "runner", "Scrubbed");
    state = takeCredits(state, "runner");
    state = playFromHand(state, "corp", "Cerebral Static");
    expect(playAreaTitles(state, "runner")).not.toContain("Scrubbed");
  });

  // jnet: game.core.engine-test/install-second-console-trashes-first
  it("Installing Box-E trashes the already installed Mirror console", () => {
    let state = newGame({
      startAs: "runner",
      runnerHand: ["Mirror", "Box-E"],
      runnerCredits: 100,
    });
    state = playFromHand(state, "runner", "Mirror");
    state = playFromHand(state, "runner", "Box-E");
    const hardware = Object.values(state.cards).filter(
      (c) => c.zone === "runner:installed" && c.type === "hardware",
    );
    expect(hardware.map((c) => c.title)).toEqual(["Box-E"]);
    expect(
      state.runner.discardPile.some((id) => state.cards[id]?.title === "Mirror"),
    ).toBe(true);
  });
});
