/**
 * Run paid ability windows the chart lists and the engine used to skip:
 * 11.4_1_e (P) (R) after the run begins, 11.4_4_b (P) after passing ice,
 * and 11.4_4_e (P) (R) after moving inward. A non-click ability tagged only
 * for the action phase is legal in every (P) window (CR 9.2.7b). Breaking
 * subroutines still requires an encounter.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyIntent,
  assertPinnedTag,
  crDataPresent,
  instantiateCard,
  loadCardCatalog,
  queryLegality,
  setupEmptyRemoteWithIce,
} from "../src/index.js";
import type { Action, GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  assertPinnedTag("v26.03");
  loadCardCatalog(true);
});

function offers(state: GameState, pred: (action: Action) => boolean): boolean {
  return queryLegality(state).legal.some((entry) => pred(entry.action));
}

function pass(state: GameState): GameState {
  const result = applyIntent(state, { type: "pass_window" });
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe("run paid ability windows", () => {
  it("opens 11.4_1_e, 11.4_4_b, and 11.4_4_e, and keeps break abilities on the encounter", () => {
    let state = setupEmptyRemoteWithIce();
    const remote = Object.values(state.servers).find((server) => server.kind === "remote")!;
    const pad = instantiateCard("pad-campaign", "pad-1", `server:${remote.id}:root`);
    state.cards["pad-1"] = pad;
    remote.root.push("pad-1");
    const fallGuy = instantiateCard("fall-guy", "fg-1", "runner:rig");
    state.cards["fg-1"] = fallGuy;
    state.runner.rig.push("fg-1");
    const hook = instantiateCard("grappling-hook", "gh-1", "runner:rig");
    state.cards["gh-1"] = hook;
    state.runner.rig.push("gh-1");
    state.corp.credits = 10;

    const started = applyIntent(state, { type: "basic_run", serverId: remote.id });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    state = started.state;

    expect(state.timingKey).toBe("run.initiatePaw");
    expect(state.timing.stepNumber).toBe("11.4_1_e");
    expect(offers(state, (action) => action.type === "score_agenda")).toBe(false);
    expect(offers(state, (action) => action.type === "rez_ice")).toBe(false);
    expect(
      offers(state, (action) => action.type === "use_paid_ability" && action.cardId === "fg-1"),
    ).toBe(true);
    expect(
      offers(state, (action) => action.type === "use_paid_ability" && action.cardId === "gh-1"),
    ).toBe(false);
    // CR 9.2.7a: the Runner has priority first. The Corp rezzes after that pass.
    expect(offers(state, (action) => action.type === "rez_asset")).toBe(false);
    state = pass(state);
    expect(offers(state, (action) => action.type === "rez_asset" && action.cardId === "pad-1")).toBe(true);

    state = pass(state);
    expect(state.timingKey).toBe("run.approachPaw");
    state = pass(state);
    state = pass(state);
    expect(state.timingKey).toBe("run.passIcePaw");
    expect(state.timing.stepNumber).toBe("11.4_4_b");
    expect(offers(state, (action) => action.type === "rez_asset")).toBe(false);
    expect(
      offers(state, (action) => action.type === "use_paid_ability" && action.cardId === "fg-1"),
    ).toBe(true);

    state = pass(state);
    expect(state.timingKey).toBe("run.jackOutWindow");
    state = pass(state);
    expect(state.timingKey).toBe("run.afterMovePaw");
    expect(state.timing.stepNumber).toBe("11.4_4_e");
    expect(offers(state, (action) => action.type === "rez_asset")).toBe(false);
    state = pass(state);
    expect(offers(state, (action) => action.type === "rez_asset" && action.cardId === "pad-1")).toBe(true);
    expect(offers(state, (action) => action.type === "rez_ice")).toBe(false);
  });
});
