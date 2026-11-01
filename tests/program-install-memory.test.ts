/**
 * Installing a program that would exceed the memory limit requires
 * trashing installed programs first (CR 3.9.3b / 8.5.6c). Found by the
 * ported jnet trash-existing-programs scenario.
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
  assertCardsPinnedTag("v1.147.15");
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

describe("program install memory", () => {
  it("trashes Endless Hunger so Corroder can install when MU is full (CR 8.5.6c)", () => {
    let state = createInitialState({ stopAfterFirstCycle: false });
    state.cards["eh-1"] = instantiateCard(
      "endless-hunger",
      "eh-1",
      "runner:grip",
    );
    state.cards["cor-1"] = instantiateCard("corroder", "cor-1", "runner:grip");
    state.runner.hand = ["eh-1", "cor-1"];
    state.runner.credits = 10;
    state = toTakeAction(state, "runner");

    state = must(state, {
      type: "basic_install",
      cardId: "eh-1",
      destination: { kind: "installed" },
    });
    expect(state.runner.installed).toContain("eh-1");
    state = toTakeAction(state, "runner");

    state = must(state, {
      type: "basic_install",
      cardId: "cor-1",
      destination: { kind: "installed" },
    });
    expect(state.pendingMuProgramInstall?.cardId).toBe("cor-1");
    expect(state.pendingChoice?.options.some((o) => o.id === "mu-trash:eh-1")).toBe(
      true,
    );
    expect(state.runner.installed).not.toContain("cor-1");

    state = must(state, { type: "choose_option", optionId: "mu-trash:eh-1" });
    expect(state.pendingMuProgramInstall).toBeNull();
    expect(state.pendingChoice).toBeNull();
    expect(state.runner.installed).toContain("cor-1");
    expect(state.runner.installed).not.toContain("eh-1");
    expect(state.runner.discardPile).toContain("eh-1");
    expect(state.cards["eh-1"]?.zone).toBe("runner:heap");
  });
});
