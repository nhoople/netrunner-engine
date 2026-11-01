/**
 * Currents end when another current is played, whichever side plays it
 * (CR 3.5.1b, CR 3.7.1b). Found by the ported jnet trash-currents scenarios.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyIntent,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  createInitialState,
  instantiateCard,
  legalActions,
} from "../src/index.js";
import type { Action, GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.17");
});

function must(state: GameState, action: Action): GameState {
  const result = applyIntent(state, action);
  if (!result.ok) throw new Error(`${action.type} refused: ${result.error}`);
  return result.state;
}

function toTakeAction(state: GameState, side: "corp" | "runner"): GameState {
  const wanted = side === "corp" ? "corp.takeAction" : "runner.takeAction";
  for (let guard = 0; guard < 200; guard++) {
    if (state.timingKey === wanted) return state;
    const legal = legalActions(state);
    if (legal.some((a) => a.type === "keep_starting_hand")) {
      state = must(state, { type: "keep_starting_hand" });
      continue;
    }
    if (legal.some((a) => a.type === "discard_to_hand_size")) {
      state = must(state, { type: "discard_to_hand_size" });
      continue;
    }
    const atOtherAction =
      (state.timingKey === "corp.takeAction" && side === "runner") ||
      (state.timingKey === "runner.takeAction" && side === "corp");
    if (atOtherAction && legal.some((a) => a.type === "basic_gain_credit")) {
      state = must(state, { type: "basic_gain_credit" });
      continue;
    }
    if (legal.some((a) => a.type === "pass_window")) {
      state = must(state, { type: "pass_window" });
      continue;
    }
    throw new Error(`Cannot reach ${wanted}; parked at ${state.timingKey}`);
  }
  throw new Error(`Cannot reach ${wanted}`);
}

function board(): GameState {
  let state = createInitialState({ stopAfterFirstCycle: false });
  state.cards["cerebral-1"] = instantiateCard(
    "cerebral-static",
    "cerebral-1",
    "corp:hq",
  );
  state.cards["scrubbed-1"] = instantiateCard(
    "scrubbed",
    "scrubbed-1",
    "runner:grip",
  );
  state.corp.hand = ["cerebral-1"];
  state.runner.hand = ["scrubbed-1"];
  state = toTakeAction(state, "corp");
  return state;
}

describe("currents", () => {
  it("playing a Runner current trashes the Corp current (CR 3.5.1b)", () => {
    let state = board();
    state = must(state, { type: "play_operation", cardId: "cerebral-1" });
    expect(state.corp.playArea).toContain("cerebral-1");
    state = toTakeAction(state, "runner");
    state = must(state, { type: "play_event", cardId: "scrubbed-1" });
    expect(state.runner.playArea).toContain("scrubbed-1");
    expect(state.corp.playArea).not.toContain("cerebral-1");
    expect(state.corp.discardPile).toContain("cerebral-1");
  });

  it("playing a Corp current trashes the Runner current (CR 3.7.1b)", () => {
    let state = board();
    state = toTakeAction(state, "runner");
    state = must(state, { type: "play_event", cardId: "scrubbed-1" });
    expect(state.runner.playArea).toContain("scrubbed-1");
    state = toTakeAction(state, "corp");
    state = must(state, { type: "play_operation", cardId: "cerebral-1" });
    expect(state.corp.playArea).toContain("cerebral-1");
    expect(state.runner.playArea).not.toContain("scrubbed-1");
    expect(state.runner.discardPile).toContain("scrubbed-1");
  });
});
