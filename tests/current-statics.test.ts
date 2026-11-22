/**
 * The static abilities of four currents apply while the current is active
 * and stop when it is trashed (CR 3.5.1b, CR 3.7.1b):
 * - Cerebral Static: the Runner's identity loses its printed abilities.
 * - Employee Strike: the Corp's identity loses its printed abilities.
 *   A lost ability is completely ignored (CR 9.1.9a).
 * - Unscheduled Maintenance: the Corp cannot install more than 1 piece of
 *   ice each turn ("cannot" wins, CR 1.2.2).
 * - Itinerant Protesters: the Corp gets −1 maximum hand size for each bad
 *   publicity they have (CR 5.5.3b).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  abilitiesSuppressed,
  applyIntent,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  createInitialState,
  instantiateCard,
  legalActions,
} from "../src/index.js";
import { discardPhase } from "../src/actions/phase.js";
import { evalEffect } from "../src/effects/eval.js";
import { fx } from "../src/effects/ir.js";
import { resolveRunnerInstallCostDelta } from "../src/state/continuousCosts.js";
import { effectiveCorpMaxHandSize } from "../src/state/handSize.js";
import type { Action, GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.28");
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

/** A board with the given cards in HQ and the grip, at the Corp's first action. */
function board(
  corpHand: [string, string][],
  runnerHand: [string, string][],
): GameState {
  const state = createInitialState({ stopAfterFirstCycle: false });
  // The default board marks a grip program rezzed; clear it so the
  // invariant check sees a clean board (CR 8.1.4f).
  for (const card of Object.values(state.cards)) {
    if (card.side === "runner") card.rezzed = false;
  }
  for (const [defId, id] of corpHand) {
    state.cards[id] = instantiateCard(defId, id, "corp:hq");
  }
  for (const [defId, id] of runnerHand) {
    state.cards[id] = instantiateCard(defId, id, "runner:grip");
  }
  state.corp.hand.push(...corpHand.map(([, id]) => id));
  state.runner.hand.push(...runnerHand.map(([, id]) => id));
  state.corp.credits = 10;
  state.runner.credits = 10;
  return toTakeAction(state, "corp");
}

describe("Cerebral Static", () => {
  it("blanks the Runner identity until another current is played", () => {
    let state = board(
      [["cerebral-static", "cs-1"]],
      [
        ["corroder", "cor-1"],
        ["scrubbed", "scrub-1"],
      ],
    );
    // Kate lowers the first program install each turn by 1.
    const kate = instantiateCard(
      "kate-mac-mccaffrey-digital-tinker",
      state.runner.identityId,
      state.cards[state.runner.identityId]!.zone,
    );
    state.cards[state.runner.identityId] = kate;
    expect(resolveRunnerInstallCostDelta(state, "cor-1")).toBe(-1);

    state = must(state, { type: "play_operation", cardId: "cs-1" });
    expect(state.corp.playArea).toContain("cs-1");
    expect(abilitiesSuppressed(state, state.runner.identityId)).toBe(true);
    expect(abilitiesSuppressed(state, state.corp.identityId)).toBe(false);
    expect(resolveRunnerInstallCostDelta(state, "cor-1")).toBe(0);

    state = toTakeAction(state, "runner");
    state = must(state, { type: "play_event", cardId: "scrub-1" });
    expect(state.corp.discardPile).toContain("cs-1");
    expect(abilitiesSuppressed(state, state.runner.identityId)).toBe(false);
    expect(resolveRunnerInstallCostDelta(state, "cor-1")).toBe(-1);
  });
});

describe("Employee Strike", () => {
  it("blanks the Corp identity until another current is played", () => {
    let state = board(
      [["cerebral-static", "cs-1"]],
      [["employee-strike", "es-1"]],
    );
    state = toTakeAction(state, "runner");
    state = must(state, { type: "play_event", cardId: "es-1" });
    expect(state.runner.playArea).toContain("es-1");
    expect(abilitiesSuppressed(state, state.corp.identityId)).toBe(true);
    expect(abilitiesSuppressed(state, state.runner.identityId)).toBe(false);

    state = toTakeAction(state, "corp");
    state = must(state, { type: "play_operation", cardId: "cs-1" });
    expect(state.runner.discardPile).toContain("es-1");
    expect(abilitiesSuppressed(state, state.corp.identityId)).toBe(false);
  });
});

describe("Employee Strike and Cerebral Imaging", () => {
  it("Cerebral Imaging's hand size = credits stops while the identity is blanked", () => {
    let state = board([], [["employee-strike", "es-1"]]);
    state.cards[state.corp.identityId] = instantiateCard(
      "cerebral-imaging-infinite-frontiers",
      state.corp.identityId,
      state.cards[state.corp.identityId]!.zone,
    );
    state.corp.credits = 9;
    expect(effectiveCorpMaxHandSize(state)).toBe(9);
    state = toTakeAction(state, "runner");
    state = must(state, { type: "play_event", cardId: "es-1" });
    expect(effectiveCorpMaxHandSize(state)).toBe(state.corp.maxHandSize);
  });
});

describe("Unscheduled Maintenance", () => {
  const iceInstalls = (state: GameState): Action[] =>
    legalActions(state).filter(
      (a) =>
        a.type === "basic_install" && state.cards[a.cardId]?.type === "ice",
    );

  it("lets the Corp install only 1 ice each turn until it is trashed", () => {
    let state = board(
      [
        ["ice-wall", "iw-1"],
        ["ice-wall", "iw-2"],
        ["ice-wall", "iw-3"],
        ["cerebral-static", "cs-1"],
      ],
      [["unscheduled-maintenance", "um-1"]],
    );
    state = toTakeAction(state, "runner");
    state = must(state, { type: "play_event", cardId: "um-1" });
    expect(state.runner.playArea).toContain("um-1");

    state = toTakeAction(state, "corp");
    state.corp.credits = 10;
    expect(iceInstalls(state).length).toBeGreaterThan(0);
    state = must(state, {
      type: "basic_install",
      cardId: "iw-1",
      destination: { kind: "new_remote" },
    });
    state = toTakeAction(state, "corp");

    // The second ice install this turn is refused and not offered.
    expect(iceInstalls(state)).toEqual([]);
    const refused = applyIntent(state, {
      type: "basic_install",
      cardId: "iw-2",
      destination: { kind: "new_remote" },
    });
    expect(refused.ok).toBe(false);

    // Playing another current trashes it, and the cap ends.
    state = must(state, { type: "play_operation", cardId: "cs-1" });
    expect(state.runner.discardPile).toContain("um-1");
    state = toTakeAction(state, "corp");
    expect(iceInstalls(state).length).toBeGreaterThan(0);
    state = must(state, {
      type: "basic_install",
      cardId: "iw-2",
      destination: { kind: "new_remote" },
    });
    expect(state.cards["iw-2"]!.zone).toMatch(/:ice$/);
  });

  it("also stops a second ice installed by an ability", () => {
    let state = board(
      [
        ["ice-wall", "iw-1"],
        ["ice-wall", "iw-2"],
      ],
      [["unscheduled-maintenance", "um-1"]],
    );
    state = toTakeAction(state, "runner");
    state = must(state, { type: "play_event", cardId: "um-1" });
    state = toTakeAction(state, "corp");
    state = must(state, {
      type: "basic_install",
      cardId: "iw-1",
      destination: { kind: "new_remote" },
    });
    const r = evalEffect(
      { state, sourceId: state.corp.identityId },
      fx.do({
        kind: "install_hq_card_ignore_costs",
        cardId: "iw-2",
        serverId: "hq",
      }),
    );
    expect(r.ok).toBe(true);
    expect(state.corp.hand).toContain("iw-2");
    expect(state.servers.hq!.ice).not.toContain("iw-2");
  });

  it("allows 1 ice again on the Corp's next turn", () => {
    let state = board(
      [
        ["ice-wall", "iw-1"],
        ["ice-wall", "iw-2"],
      ],
      [["unscheduled-maintenance", "um-1"]],
    );
    state = toTakeAction(state, "runner");
    state = must(state, { type: "play_event", cardId: "um-1" });
    state = toTakeAction(state, "corp");
    state = must(state, {
      type: "basic_install",
      cardId: "iw-1",
      destination: { kind: "new_remote" },
    });
    expect(iceInstalls(state)).toEqual([]);
    state = toTakeAction(state, "runner");
    state = toTakeAction(state, "corp");
    expect(state.runner.playArea).toContain("um-1");
    expect(
      iceInstalls(state).some(
        (a) => a.type === "basic_install" && a.cardId === "iw-2",
      ),
    ).toBe(true);
  });
});

describe("Itinerant Protesters", () => {
  it("gives the Corp −1 max hand size per bad publicity until it is trashed", () => {
    let state = board(
      [["cerebral-static", "cs-1"]],
      [["itinerant-protesters", "ip-1"]],
    );
    state.corp.badPublicity = 2;
    state = toTakeAction(state, "runner");
    state = must(state, { type: "play_event", cardId: "ip-1" });
    expect(state.runner.playArea).toContain("ip-1");
    const base = state.corp.maxHandSize;
    expect(effectiveCorpMaxHandSize(state)).toBe(base - 2);

    // The Corp discards down to the lowered size (CR 5.5.4c).
    const discard = structuredClone(state);
    const fillers = ["f-1", "f-2", "f-3", "f-4", "f-5"];
    for (const id of fillers) {
      discard.cards[id] = instantiateCard("hedge-fund", id, "corp:hq");
    }
    discard.corp.hand = [...fillers];
    discard.activeSide = "corp";
    discard.timingKey = "corp.discard";
    const keep = base - 2;
    const r = discardPhase(discard, fillers.slice(keep));
    expect(r.ok).toBe(true);
    expect(discard.corp.hand).toHaveLength(keep);

    // A second bad publicity counts too.
    state.corp.badPublicity = 3;
    expect(effectiveCorpMaxHandSize(state)).toBe(base - 3);

    state = toTakeAction(state, "corp");
    state = must(state, { type: "play_operation", cardId: "cs-1" });
    expect(state.runner.discardPile).toContain("ip-1");
    expect(effectiveCorpMaxHandSize(state)).toBe(base);
  });

  it("can take the Corp's max hand size below 0 (CR 1.1.3)", () => {
    let state = board([], [["itinerant-protesters", "ip-1"]]);
    state.corp.badPublicity = state.corp.maxHandSize + 2;
    state = toTakeAction(state, "runner");
    state = must(state, { type: "play_event", cardId: "ip-1" });
    expect(effectiveCorpMaxHandSize(state)).toBe(-2);
  });

  it("does nothing without bad publicity", () => {
    let state = board([], [["itinerant-protesters", "ip-1"]]);
    state.corp.badPublicity = 0;
    state = toTakeAction(state, "runner");
    state = must(state, { type: "play_event", cardId: "ip-1" });
    expect(effectiveCorpMaxHandSize(state)).toBe(state.corp.maxHandSize);
  });
});
