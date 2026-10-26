/**
 * Ported from game.core.charge-test in mtgred/netrunner, pinned at
 * bc9e2fca073a5b21d247e72877804118e81d5472. See tests/jnet/NOTICE.md and
 * docs/jnet-test-ports.md. Upstream drives the internal charge primitive
 * directly; the port charges through Captain Padma Isbister's printed
 * ability instead, and is recorded as adapted in the manifest.
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
  clickPrompt,
  finishAccess,
  installedCards,
  must,
  newGame,
  playFromHand,
  settle,
  takeCredits,
  walkToAccess,
} from "./helpers.js";
import type { GameState } from "../../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.13");
});

function powerCounters(state: GameState, title: string): number {
  const card = installedCards(state, "runner").find((c) => c.title === title);
  return card?.powerCounters ?? 0;
}

describe("jnet ports — core charge", () => {
  // jnet: game.core.charge-test/charge-test
  it("Captain Padma Isbister charges Earthrise Hotel from 3 to 4 power counters on an R&D run", () => {
    let state = newGame({
      runnerIdentity: "Captain Padma Isbister: Intrepid Explorer",
      runnerHand: ["Earthrise Hotel", "Daily Casts"],
      runnerCredits: 10,
    });
    state = takeCredits(state, "corp");
    state = playFromHand(state, "runner", "Daily Casts");
    state = playFromHand(state, "runner", "Earthrise Hotel");
    expect(powerCounters(state, "Earthrise Hotel")).toBe(3);
    expect(powerCounters(state, "Daily Casts")).toBe(0);
    state = must(settle(state), { type: "basic_run", serverId: "rd" });
    expect(state.pendingChoice).toBeTruthy();
    state = clickPrompt(state, "Charge 1 installed card");
    if (state.pendingChoice) {
      const targetLabels = state.pendingChoice.options.map((o) => o.label);
      expect(targetLabels.join(" ")).not.toContain("Daily Casts");
      state = clickCard(state, "Earthrise Hotel");
    }
    expect(powerCounters(state, "Earthrise Hotel")).toBe(4);
    expect(powerCounters(state, "Daily Casts")).toBe(0);
    state = walkToAccess(state, "rd");
    const candidate = state.run?.accessCandidates[0];
    expect(candidate).toBeTruthy();
    state = must(state, { type: "access_card", cardId: candidate! });
    state = finishAccess(state);
    expect(state.run).toBeNull();
  });
});
