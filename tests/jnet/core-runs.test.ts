/**
 * Ported from game.core.runs-test in mtgred/netrunner, pinned at
 * bc9e2fca073a5b21d247e72877804118e81d5472. See tests/jnet/NOTICE.md and
 * docs/jnet-test-ports.md. Upstream phase labels and auto-continue /
 * buffered-continue UI are jnet-specific; the boards below assert the
 * observable end of the run through this engine's intents.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  legalActions,
} from "../../src/index.js";
import type { GameState } from "../../src/state/types.js";
import {
  iceCard,
  must,
  newGame,
  playFromHand,
  remotes,
  settle,
  startEncounter,
  takeCredits,
} from "./helpers.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.17");
});

function walkRunToEnd(state: GameState): GameState {
  for (let guard = 0; guard < 80; guard++) {
    if (!state.run) return state;
    const legal = legalActions(state);
    if (legal.some((a) => a.type === "pass_window")) {
      state = must(state, { type: "pass_window" });
      continue;
    }
    if (legal.some((a) => a.type === "continue_run")) {
      state = must(state, { type: "continue_run" });
      continue;
    }
    if (legal.some((a) => a.type === "finish_access")) {
      state = must(state, { type: "finish_access" });
      continue;
    }
    if (legal.some((a) => a.type === "access_card")) {
      const access = legal.find((a) => a.type === "access_card")!;
      state = must(state, access);
      continue;
    }
    if (legal.some((a) => a.type === "jack_out")) {
      state = must(state, { type: "jack_out" });
      continue;
    }
    throw new Error(
      `Run did not end (${state.timingKey}); legal=${legal
        .map((a) => a.type)
        .join(",")}`,
    );
  }
  return state;
}

describe("jnet ports — core runs", () => {
  // jnet: game.core.runs-test/run-timing-with-no-ice
  it("a run on empty Archives ends", () => {
    let state = newGame({
      corpHand: ["Ice Wall"],
      startAs: "runner",
    });
    state = must(settle(state), { type: "basic_run", serverId: "archives" });
    state = walkRunToEnd(state);
    expect(state.run).toBeNull();
  });

  // jnet: game.core.runs-test/run-timing-with-an-ice
  it("Ice Wall's End the run subroutine ends the run", () => {
    let state = newGame({
      corpHand: ["Ice Wall"],
      corpCredits: 5,
    });
    state = playFromHand(state, "corp", "Ice Wall");
    const remote = remotes(state)[0]!;
    const ice = iceCard(state, remote);
    state = takeCredits(state, "corp");
    state = startEncounter(state, remote.id, ice.id);
    state = walkRunToEnd(state);
    expect(state.run).toBeNull();
  });
});
