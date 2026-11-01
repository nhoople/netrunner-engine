/**
 * Ported from game.core.ice-test in mtgred/netrunner, pinned at
 * bc9e2fca073a5b21d247e72877804118e81d5472. See tests/jnet/NOTICE.md and
 * docs/jnet-test-ports.md. Upstream's auto-pump / auto-pump-and-break
 * dynamic abilities and labels are jnet UI; the boards below assert the
 * same observable strength, break, and subroutine counts through this
 * engine's paid pump and break intents. The bioroid undo-click block is
 * deferred (chat-command system).
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
  must,
  newGame,
  playFromHand,
  pumpBreaker,
  rezCard,
  settle,
  startEncounter,
  takeCredits,
} from "./helpers.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.15");
});

describe("jnet ports — core ice", () => {
  // jnet: game.core.ice-test/auto-pump-and-break-test
  it("Tour Guide has 1 subroutine with one rezzed asset and 2 after a second asset is rezzed on approach", () => {
    let state = newGame({
      corpHand: ["Tour Guide", "PAD Campaign", "PAD Campaign"],
      corpCredits: 15,
      runnerCredits: 5,
    });
    state = playFromHand(state, "corp", "PAD Campaign");
    state = playFromHand(state, "corp", "PAD Campaign");
    state = playFromHand(state, "corp", "Tour Guide", "HQ");
    const pads = Object.values(state.servers)
      .filter((s) => s.kind === "remote")
      .flatMap((s) => s.root);
    expect(pads).toHaveLength(2);
    state = rezCard(state, pads[0]!);
    const tour = iceCard(state, state.servers.hq!);
    state = takeCredits(state, "corp");
    state = must(settle(state), { type: "basic_run", serverId: "hq" });
    for (let guard = 0; guard < 80; guard++) {
      const legal = legalActions(state);
      if (
        state.timingKey === "run.approachPaw" &&
        legal.some((a) => a.type === "rez_ice" && a.cardId === tour.id)
      ) {
        break;
      }
      if (legal.some((a) => a.type === "pass_window")) {
        state = must(state, { type: "pass_window" });
        continue;
      }
      throw new Error(
        `Never reached approach rez window (${state.timingKey})`,
      );
    }
    state = rezCard(state, tour.id);
    expect(state.cards[tour.id]?.subroutines?.length ?? 0).toBe(1);
    state = rezCard(state, pads[1]!);
    for (let guard = 0; guard < 80; guard++) {
      if (state.timingKey === "run.encounterPaw") break;
      const legal = legalActions(state);
      if (legal.some((a) => a.type === "pass_window")) {
        state = must(state, { type: "pass_window" });
        continue;
      }
      if (legal.some((a) => a.type === "continue_run")) {
        state = must(state, { type: "continue_run" });
        continue;
      }
      throw new Error(`Encounter never opened (${state.timingKey})`);
    }
    expect(state.cards[tour.id]?.subroutines?.length ?? 0).toBe(2);
    expect(state.run?.encounter?.broken).toHaveLength(2);
  });

  // jnet: game.core.ice-test/auto-pump-and-break-test
  it("Afshar on HQ allows only 1 printed subroutine to be broken", () => {
    let state = newGame({
      corpHand: ["Afshar"],
      corpCredits: 10,
      runnerHand: ["Gordian Blade"],
      runnerCredits: 15,
    });
    state = playFromHand(state, "corp", "Afshar", "HQ");
    state = takeCredits(state, "corp");
    state = playFromHand(state, "runner", "Gordian Blade");
    const ice = iceCard(state, state.servers.hq!);
    state = startEncounter(state, "hq", ice.id);
    const breaker = installedCards(state, "runner")[0]!.id;
    state = breakSubroutine(state, breaker, 0);
    expect(state.run?.encounter?.broken).toEqual([true, false]);
    const second = applyIntent(state, {
      type: "break_subroutine",
      breakerId: breaker,
      subIndex: 1,
    });
    expect(second.ok).toBe(false);
  });

  // jnet: game.core.ice-test/auto-pump-and-break-test
  it("Afshar on R&D allows Gordian Blade to break both printed subroutines", () => {
    let state = newGame({
      corpHand: ["Afshar"],
      corpCredits: 10,
      runnerHand: ["Gordian Blade"],
      runnerCredits: 15,
    });
    state = playFromHand(state, "corp", "Afshar", "R&D");
    state = takeCredits(state, "corp");
    state = playFromHand(state, "runner", "Gordian Blade");
    const ice = iceCard(state, state.servers.rd!);
    state = startEncounter(state, "rd", ice.id);
    const breaker = installedCards(state, "runner")[0]!.id;
    state = breakSubroutine(state, breaker, 0);
    state = breakSubroutine(state, breaker, 1);
    expect(state.run?.encounter?.broken).toEqual([true, true]);
  });

  // jnet: game.core.ice-test/auto-pump-and-break-test
  it("Corroder pumps to Fire Wall's strength for 3 credits and breaks none yet", () => {
    let state = newGame({
      corpHand: ["Fire Wall"],
      corpCredits: 10,
      runnerHand: ["Corroder"],
      runnerCredits: 20,
    });
    state = playFromHand(state, "corp", "Fire Wall", "HQ");
    state = takeCredits(state, "corp");
    state = playFromHand(state, "runner", "Corroder");
    const wall = iceCard(state, state.servers.hq!);
    state = startEncounter(state, "hq", wall.id);
    const breaker = installedCards(state, "runner")[0]!.id;
    expect(effectiveBreakerStrength(state, breaker)).toBe(2);
    const before = state.runner.credits;
    state = pumpBreaker(state, breaker, "corroder-pump");
    state = pumpBreaker(state, breaker, "corroder-pump");
    state = pumpBreaker(state, breaker, "corroder-pump");
    expect(effectiveBreakerStrength(state, breaker)).toBe(5);
    expect(state.runner.credits).toBe(before - 3);
    expect(state.run?.encounter?.broken.every((b) => !b)).toBe(true);
  });
});
