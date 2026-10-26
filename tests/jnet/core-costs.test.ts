/**
 * Ported from game.core.costs-test in mtgred/netrunner, pinned at
 * bc9e2fca073a5b21d247e72877804118e81d5472. See tests/jnet/NOTICE.md and
 * docs/jnet-test-ports.md. The Hive full-break blocks of pump-and-break
 * wait on the pinned cards catalog (4 of Hive's 5 printed subroutines);
 * the cost-record and log-wording deftests are recorded as deferred in
 * the manifest, along with the expend reveal scenario.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyIntent,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  effectiveBreakerStrength,
  legalActions,
} from "../../src/index.js";
import {
  breakSubroutine,
  iceCard,
  installedCards,
  newGame,
  playFromHand,
  pumpBreaker,
  rezCard,
  startEncounter,
  takeCredits,
} from "./helpers.js";
import type { GameState } from "../../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.13");
});

function brokenSubs(state: GameState): boolean[] {
  return state.run?.encounter?.broken ?? [];
}

describe("jnet ports — core costs", () => {
  // jnet: game.core.costs-test/pump-and-break
  it("Corroder cannot pump with no credits and stays at 2 strength", () => {
    let state = newGame({
      corpHand: ["Hive"],
      runnerHand: ["Corroder"],
      runnerCredits: 2,
    });
    state = playFromHand(state, "corp", "Hive", "HQ");
    state = takeCredits(state, "corp");
    state = playFromHand(state, "runner", "Corroder");
    const hive = iceCard(state, state.servers.hq!);
    state = startEncounter(state, "hq", hive.id);
    const breaker = installedCards(state, "runner")[0]!.id;
    expect(state.runner.credits).toBe(0);
    expect(
      legalActions(state).some(
        (a) => a.type === "use_paid_ability" && a.cardId === breaker,
      ),
    ).toBe(false);
    expect(effectiveBreakerStrength(state, breaker)).toBe(2);
  });

  // jnet: game.core.costs-test/pump-and-break
  it("Houdini pumps to 10 on 2 stealth credits from 2 Mantles and breaks Little Engine", () => {
    let state = newGame({
      corpHand: ["Little Engine"],
      runnerHand: ["Houdini", "Mantle", "Mantle"],
      runnerCredits: 15,
    });
    state = playFromHand(state, "corp", "Little Engine", "HQ");
    state = takeCredits(state, "corp");
    state = playFromHand(state, "runner", "Houdini");
    state = playFromHand(state, "runner", "Mantle");
    state = playFromHand(state, "runner", "Mantle");
    const engine = iceCard(state, state.servers.hq!);
    state = startEncounter(state, "hq", engine.id);
    const houdini = installedCards(state, "runner").find(
      (c) => c.title === "Houdini",
    )!.id;
    state = pumpBreaker(state, houdini, "houdini-pump");
    state = pumpBreaker(state, houdini, "houdini-pump");
    expect(effectiveBreakerStrength(state, houdini)).toBe(10);
    const mantles = installedCards(state, "runner").filter(
      (c) => c.title === "Mantle",
    );
    expect(mantles.map((c) => c.recurringCredits ?? 0)).toEqual([0, 0]);
    expect(state.runner.credits).toBe(9);
    for (let sub = 0; sub < brokenSubs(state).length; sub++) {
      state = breakSubroutine(state, houdini, sub);
    }
    expect(brokenSubs(state).every(Boolean)).toBe(true);
  });

  // jnet: game.core.costs-test/run-additional-costs
  it("Ruhr Valley removes HQ from the Runner's run options when the additional click cannot be paid", () => {
    let state = newGame({
      corpHand: ["Ruhr Valley"],
      runnerHand: ["Dirty Laundry"],
      corpCredits: 10,
    });
    state = playFromHand(state, "corp", "Ruhr Valley", "HQ");
    const ruhr = state.servers.hq!.root[0]!;
    state = rezCard(state, ruhr);
    state = takeCredits(state, "corp");
    state.runner.clicks = 1;
    const runServers = legalActions(state)
      .filter((a) => a.type === "basic_run")
      .map((a) => (a.type === "basic_run" ? a.serverId : ""));
    expect(runServers).not.toContain("hq");
    expect(runServers).toContain("rd");
    expect(runServers).toContain("archives");
    const dirty = Object.values(state.cards).find(
      (c) => c.title === "Dirty Laundry",
    )!;
    const attempt = applyIntent(state, {
      type: "play_event",
      cardId: dirty.id,
      serverId: "hq",
    });
    expect(attempt.ok).toBe(false);
  });
});
