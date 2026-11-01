/**
 * Ported from game.core.installing-test in mtgred/netrunner, pinned at
 * bc9e2fca073a5b21d247e72877804118e81d5472. See tests/jnet/NOTICE.md and
 * docs/jnet-test-ports.md. The MU-overflow trash prompt was missing from
 * the engine; that fix carries the native regression in
 * tests/program-install-memory.test.ts.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
} from "../../src/index.js";
import {
  clickCard,
  installedCards,
  newGame,
  playFromHand,
  takeCredits,
} from "./helpers.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.16");
});

describe("jnet ports — core installing", () => {
  // jnet: game.core.installing-test/trash-existing-programs-test
  it("Endless Hunger is trashed so Corroder can install when MU is full", () => {
    let state = newGame({
      corpHand: ["Hedge Fund"],
      runnerHand: ["Endless Hunger", "Corroder"],
      runnerCredits: 10,
    });
    state = takeCredits(state, "corp");
    state = playFromHand(state, "runner", "Endless Hunger");
    expect(installedCards(state, "runner").map((c) => c.title)).toEqual([
      "Endless Hunger",
    ]);
    state = playFromHand(state, "runner", "Corroder");
    expect(state.pendingChoice?.options.some((o) => o.label.includes("Endless Hunger"))).toBe(
      true,
    );
    state = clickCard(state, "Endless Hunger");
    expect(installedCards(state, "runner").map((c) => c.title)).toEqual([
      "Corroder",
    ]);
    expect(
      state.runner.discardPile.some(
        (id) => state.cards[id]?.title === "Endless Hunger",
      ),
    ).toBe(true);
  });
});
