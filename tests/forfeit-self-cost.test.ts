/**
 * "Forfeit this agenda:" as a paid ability's cost (False Lead). Forfeiting
 * moves the agenda from the score area to the removed-from-game zone and its
 * points stop counting (CR 8.2.5, 4.9.3). It is not trashed, so it never
 * reaches Archives. A cost that cannot be paid stops the ability (CR 1.16.1).
 * A "when you forfeit" ability still becomes pending (CR 9.3.7c).
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
import { agendaPointsFor } from "../src/state/turnAndActions/scoring.js";
import type { GameState } from "../src/state/types.js";
import {
  syncPaidAbilitiesFromRecords,
  type AbilityRecord,
} from "../src/effects/abilityRecord.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  assertPinnedTag("v26.03");
  loadCardCatalog(true);
});

/** False Lead's ability record as the corrected card data writes it. */
const FALSE_LEAD_ABILITY: AbilityRecord = {
  class: "paid",
  rule: "9.3.7b",
  id: "false-lead-forfeit",
  label: "Forfeit: if Runner has 2+ [click], they lose [click][click]",
  cost: { forfeitSelf: true },
  windows: ["corp_action_paw"],
  instructions: {
    op: "if",
    cond: { op: "clicks_gte", side: "runner", amount: 2 },
    then: {
      op: "do",
      action: { kind: "lose_clicks", side: "runner", amount: 2 },
    },
  },
} as AbilityRecord;

/** A fresh game without the fixture's rezzed Runner card (CR 8.1.4f). */
function newGame(): GameState {
  const state = createGame({
    stopAfterFirstCycle: false,
    agendaPointsToWin: 7,
  });
  for (const card of Object.values(state.cards)) {
    if (card.side === "runner") card.rezzed = false;
  }
  return state;
}

function scoredFalseLead(runnerClicks: number): GameState {
  const state = newGame();
  const lead = instantiateCard("false-lead", "fl-1", "corp:score");
  lead.abilities = [structuredClone(FALSE_LEAD_ABILITY)];
  syncPaidAbilitiesFromRecords(lead);
  state.cards["fl-1"] = lead;
  state.corp.scoreArea = ["fl-1"];
  state.activeSide = "corp";
  state.corp.clicks = 3;
  state.runner.clicks = runnerClicks;
  state.timingKey = "corp.actionPaw";
  return state;
}

function offered(state: GameState, cardId: string, abilityId: string): boolean {
  return queryLegality(state).legal.some(
    (e) =>
      e.action.type === "use_paid_ability" &&
      e.action.cardId === cardId &&
      e.action.abilityId === abilityId,
  );
}

function useLead(state: GameState): GameState {
  const r = applyIntent(state, {
    type: "use_paid_ability",
    cardId: "fl-1",
    abilityId: "false-lead-forfeit",
  });
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe("forfeitSelf cost (False Lead)", () => {
  it("removes the agenda from the game, drops its point, and takes 2 Runner clicks", () => {
    const state = scoredFalseLead(3);
    expect(agendaPointsFor(state, "corp")).toBe(1);
    expect(offered(state, "fl-1", "false-lead-forfeit")).toBe(true);

    const after = useLead(state);
    const lead = after.cards["fl-1"]!;
    expect(lead.zone).toBe("removed-from-game");
    expect(after.removedFromGame).toContain("fl-1");
    expect(after.corp.scoreArea).not.toContain("fl-1");
    expect(after.corp.discardPile).not.toContain("fl-1");
    expect(agendaPointsFor(after, "corp")).toBe(0);
    expect(after.runner.clicks).toBe(1);
  });

  it("still forfeits when the Runner has fewer than 2 clicks, but they lose none", () => {
    const after = useLead(scoredFalseLead(1));
    expect(after.cards["fl-1"]!.zone).toBe("removed-from-game");
    expect(agendaPointsFor(after, "corp")).toBe(0);
    expect(after.runner.clicks).toBe(1);
  });

  it("cannot be paid by an agenda that cannot be forfeited", () => {
    const state = scoredFalseLead(3);
    state.cards["fl-1"]!.cannotForfeit = true;
    expect(offered(state, "fl-1", "false-lead-forfeit")).toBe(false);
  });
});

describe("forfeitAgenda cost fires when you forfeit", () => {
  it("Greenmail forfeited to pay Quarantine System gains the Corp 4 credits", () => {
    const state = newGame();
    const qs = instantiateCard(
      "quarantine-system",
      "qs-1",
      "server:remote-1:root",
    );
    qs.rezzed = true;
    state.cards["qs-1"] = qs;
    state.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["qs-1"],
    };
    const gm = instantiateCard("greenmail", "gm-1", "corp:score");
    state.cards["gm-1"] = gm;
    state.corp.scoreArea = ["gm-1"];
    state.activeSide = "corp";
    state.corp.clicks = 3;
    state.corp.credits = 0;
    state.timingKey = "corp.actionPaw";

    let r = applyIntent(state, {
      type: "use_paid_ability",
      cardId: "qs-1",
      abilityId: "quarantine-rez",
    });
    if (!r.ok) throw new Error(r.error);
    let s = r.state;
    // Resolve whatever is open (Greenmail's pending trigger, the rez choice).
    for (
      let i = 0;
      i < 6 &&
      s.cards["gm-1"]!.zone === "removed-from-game" &&
      s.corp.credits < 4;
      i++
    ) {
      const next = queryLegality(s).legal[0];
      if (!next) break;
      r = applyIntent(s, next.action);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    expect(s.cards["gm-1"]!.zone).toBe("removed-from-game");
    expect(s.corp.credits).toBe(4);
    // The forfeit happens first; the cost checkpoint then marks the trigger
    // (CR 1.16.3, 9.6.6).
    const lines = s.log.map(String);
    const moved = lines.findIndex((l) =>
      l.includes("Forfeit Greenmail as a cost"),
    );
    const pending = lines.findIndex((l) =>
      l.includes("Greenmail becomes pending"),
    );
    expect(moved).toBeGreaterThanOrEqual(0);
    expect(pending).toBeGreaterThan(moved);
  });

  it("a stolen Greenmail forfeited to pay Data Dealer is inactive and gains the Corp nothing", () => {
    const state = newGame();
    const dd = instantiateCard("data-dealer", "dd-1", "runner:installed");
    state.cards["dd-1"] = dd;
    state.runner.installed = [...state.runner.installed, "dd-1"];
    const gm = instantiateCard("greenmail", "gm-1", "runner:score");
    state.cards["gm-1"] = gm;
    state.runner.scoreArea = ["gm-1"];
    state.activeSide = "runner";
    state.runner.clicks = 4;
    state.runner.credits = 0;
    state.corp.credits = 0;
    state.timingKey = "runner.takeAction";

    const r = applyIntent(state, {
      type: "use_paid_ability",
      cardId: "dd-1",
      abilityId: "data-dealer-forfeit",
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.state.cards["gm-1"]!.zone).toBe("removed-from-game");
    expect(r.state.runner.credits).toBe(9);
    expect(r.state.corp.credits).toBe(0);
  });
});
