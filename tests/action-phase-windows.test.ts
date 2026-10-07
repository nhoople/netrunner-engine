/**
 * Scoring is an (S) option (CR 1.17.3, 9.2.7d). Identity abilities split on
 * CR 5.2.1. Purge is the Corp basic action in CR 5.2.6h. Draw, discard, and
 * turn-start paid ability windows stop instead of being skipped (11.2_1_b,
 * 11.2_3_b, 11.3_1_b, 11.3_2_b).
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

function ready(state: GameState, timingKey: string, side: "corp" | "runner"): GameState {
  state.activeSide = side;
  state.timingKey = timingKey;
  return state;
}

describe("action-phase windows", () => {
  it("scores in an (S) window and not while taking an action", () => {
    const state = createGame({ stopAfterFirstCycle: false, agendaPointsToWin: 7 });
    const agenda = instantiateCard("hostile-takeover", "ht-1", "server:remote-1:root");
    agenda.advancementTokens = 2;
    state.cards["ht-1"] = agenda;
    state.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["ht-1"],
    };
    state.corp.clicks = 3;
    state.corp.credits = 5;

    ready(state, "corp.actionPaw", "corp");
    expect(offers(state, (action) => action.type === "score_agenda" && action.cardId === "ht-1")).toBe(true);
    expect(offers(state, (action) => action.type === "basic_gain_credit")).toBe(false);

    ready(state, "corp.drawPaw", "corp");
    expect(offers(state, (action) => action.type === "score_agenda")).toBe(true);
    expect(offers(state, (action) => action.type === "basic_gain_credit")).toBe(false);

    ready(state, "corp.discardPaw", "corp");
    expect(offers(state, (action) => action.type === "score_agenda")).toBe(false);

    ready(state, "corp.takeAction", "corp");
    expect(offers(state, (action) => action.type === "score_agenda")).toBe(false);
    expect(offers(state, (action) => action.type === "basic_gain_credit")).toBe(true);

    const refused = applyIntent(state, { type: "score_agenda", cardId: "ht-1" });
    expect(refused.ok).toBe(false);

    ready(state, "corp.actionPaw", "corp");
    const clicks = state.corp.clicks;
    const scored = applyIntent(state, { type: "score_agenda", cardId: "ht-1" });
    if (!scored.ok) throw new Error(scored.error);
    expect(scored.state.corp.score).toContain("ht-1");
    expect(scored.state.corp.clicks).toBe(clicks);
    expect(scored.state.timingKey).toBe("corp.actionPaw");
  });

  it("offers a click identity ability only while taking an action", () => {
    const state = createGame({ stopAfterFirstCycle: false, agendaPointsToWin: 7 });
    const identity = state.cards[state.corp.identityId]!;
    identity.paidAbilities = [
      {
        id: "id-click",
        label: "Click for a credit",
        clickCost: 1,
        creditCost: 0,
        cost: { clicks: 1 },
        windows: ["corp_action_paw"],
        effect: { op: "do", action: { kind: "gain_credits", side: "corp", amount: 1 } },
      },
      {
        id: "id-paid",
        label: "Trash a credit for nothing",
        clickCost: 0,
        creditCost: 1,
        cost: { credits: 1 },
        windows: ["corp_action_paw"],
        effect: { op: "do", action: { kind: "gain_credits", side: "corp", amount: 0 } },
      },
    ];
    state.corp.clicks = 3;
    state.corp.credits = 5;

    ready(state, "corp.takeAction", "corp");
    expect(offers(state, (action) => action.type === "use_identity_ability" && action.abilityId === "id-click")).toBe(true);
    expect(offers(state, (action) => action.type === "use_identity_ability" && action.abilityId === "id-paid")).toBe(false);

    ready(state, "corp.actionPaw", "corp");
    expect(offers(state, (action) => action.type === "use_identity_ability" && action.abilityId === "id-click")).toBe(false);
    expect(offers(state, (action) => action.type === "use_paid_ability" && action.abilityId === "id-paid")).toBe(true);
  });

  it("purges virus counters as a three-click Corp action", () => {
    const state = createGame({ stopAfterFirstCycle: false, agendaPointsToWin: 7 });
    const virus = instantiateCard("fermenter", "ferm-1", "runner:rig");
    virus.virusCounters = 4;
    state.cards["ferm-1"] = virus;
    state.runner.rig = ["ferm-1"];
    state.corp.clicks = 3;

    ready(state, "corp.actionPaw", "corp");
    expect(offers(state, (action) => action.type === "basic_purge_virus")).toBe(false);

    ready(state, "corp.takeAction", "corp");
    expect(offers(state, (action) => action.type === "basic_purge_virus")).toBe(true);
    state.corp.clicks = 2;
    expect(offers(state, (action) => action.type === "basic_purge_virus")).toBe(false);

    state.corp.clicks = 4;
    const purged = applyIntent(state, { type: "basic_purge_virus" });
    if (!purged.ok) throw new Error(purged.error);
    expect(purged.state.cards["ferm-1"].virusCounters).toBe(0);
    expect(purged.state.corp.clicks).toBe(1);
    expect(purged.state.timingKey).toBe("corp.actionPaw");
  });

  it("stops on the Corp draw paid ability window", () => {
    const opened = createGame({ stopAfterFirstCycle: false, agendaPointsToWin: 7 });
    const corpKept = applyIntent(opened, { type: "keep_starting_hand" });
    if (!corpKept.ok) throw new Error(corpKept.error);
    const runnerKept = applyIntent(corpKept.state, { type: "keep_starting_hand" });
    if (!runnerKept.ok) throw new Error(runnerKept.error);
    expect(runnerKept.state.timingKey).toBe("corp.gainClicks");
    const drawWindow = applyIntent(runnerKept.state, { type: "pass_window" });
    if (!drawWindow.ok) throw new Error(drawWindow.error);
    expect(drawWindow.state.timingKey).toBe("corp.drawPaw");
    expect(offers(drawWindow.state, (action) => action.type === "pass_window")).toBe(true);
    expect(offers(drawWindow.state, (action) => action.type === "basic_gain_credit")).toBe(false);
    expect(drawWindow.state.timing.stepNumber).toBe("11.2_1_b");
  });
});
