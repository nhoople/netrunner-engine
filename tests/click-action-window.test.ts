/**
 * CR 5.2.1 / 11.2_2_b_ii: a paid ability whose cost begins with a click is
 * an action, taken with the basic actions. It is not used in the action-phase
 * paid ability window (11.2_2_a). CR 5.2.1a: a click that does not begin the
 * cost stays in that window.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyIntent,
  assertPinnedTag,
  crDataPresent,
  createGame,
  instantiateCard,
  loadCardCatalog,
  queryLegality,
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

function offersAbility(state: GameState, abilityId: string): boolean {
  return offers(
    state,
    (action) =>
      action.type === "use_paid_ability" && action.abilityId === abilityId,
  );
}

function offersBasicCredit(state: GameState): boolean {
  return offers(state, (action) => action.type === "basic_gain_credit");
}

describe("click abilities are actions", () => {
  it("offers Regolith beside basic actions at take-action, not in the paid ability window", () => {
    const state = createGame({ stopAfterFirstCycle: false, agendaPointsToWin: 7 });
    const regolith = instantiateCard(
      "regolith-mining-license",
      "reg-1",
      "server:remote-1:root",
    );
    regolith.rezzed = true;
    regolith.hostedCredits = 15;
    state.cards["reg-1"] = regolith;
    state.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["reg-1"],
    };
    state.activeSide = "corp";
    state.corp.clicks = 3;
    state.corp.credits = 5;
    state.timingKey = "corp.actionPaw";

    expect(offersAbility(state, "regolith-take")).toBe(false);
    expect(offersBasicCredit(state)).toBe(false);

    state.timingKey = "corp.takeAction";
    expect(offersAbility(state, "regolith-take")).toBe(true);
    expect(offersBasicCredit(state)).toBe(true);

    const first = applyIntent(state, {
      type: "use_paid_ability",
      cardId: "reg-1",
      abilityId: "regolith-take",
    });
    if (!first.ok) throw new Error(first.error);
    expect(first.state.corp.clicks).toBe(2);
    expect(first.state.corp.credits).toBe(8);
    expect(first.state.cards["reg-1"].hostedCredits).toBe(12);
    expect(first.state.timingKey).toBe("corp.actionPaw");
    expect(offersAbility(first.state, "regolith-take")).toBe(false);

    let again = first.state;
    for (let i = 0; i < 4 && again.timingKey !== "corp.takeAction"; i++) {
      const passed = applyIntent(again, { type: "pass_window" });
      if (!passed.ok) throw new Error(passed.error);
      again = passed.state;
    }
    expect(again.timingKey).toBe("corp.takeAction");
    expect(offersAbility(again, "regolith-take")).toBe(true);

    const second = applyIntent(again, {
      type: "use_paid_ability",
      cardId: "reg-1",
      abilityId: "regolith-take",
    });
    if (!second.ok) throw new Error(second.error);
    expect(second.state.corp.clicks).toBe(1);
    expect(second.state.corp.credits).toBe(11);
    expect(second.state.cards["reg-1"].hostedCredits).toBe(9);
  });

  it("keeps a zero-click action-window ability in the paid ability window", () => {
    const state = createGame({ stopAfterFirstCycle: false, agendaPointsToWin: 7 });
    const lead = instantiateCard("false-lead", "fl-1", "corp:score");
    lead.rezzed = true;
    state.cards["fl-1"] = lead;
    state.corp.score = ["fl-1"];
    state.activeSide = "corp";
    state.corp.clicks = 3;
    state.runner.clicks = 3;
    state.timingKey = "corp.actionPaw";

    expect(offersAbility(state, "false-lead-forfeit")).toBe(true);

    state.timingKey = "corp.takeAction";
    expect(offersAbility(state, "false-lead-forfeit")).toBe(false);
  });

  it("still enforces once per turn when the click ability is an action", () => {
    const state = createGame({ stopAfterFirstCycle: false, agendaPointsToWin: 7 });
    const telework = instantiateCard(
      "telework-contract",
      "tw-1",
      "runner:rig",
    );
    telework.hostedCredits = 6;
    state.cards["tw-1"] = telework;
    state.runner.rig = ["tw-1"];
    state.activeSide = "runner";
    state.runner.clicks = 3;
    state.timingKey = "runner.takeAction";

    expect(offersAbility(state, "telework-take")).toBe(true);
    const used = applyIntent(state, {
      type: "use_paid_ability",
      cardId: "tw-1",
      abilityId: "telework-take",
    });
    if (!used.ok) throw new Error(used.error);
    expect(used.state.timingKey).toBe("runner.actionPaw");
    expect(offersAbility(used.state, "telework-take")).toBe(false);

    used.state.timingKey = "runner.takeAction";
    expect(offersAbility(used.state, "telework-take")).toBe(false);
  });
});
