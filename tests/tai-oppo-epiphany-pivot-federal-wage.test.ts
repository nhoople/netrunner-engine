/**
 * TAI v0.84 primitives: Oppo / Epiphany / Pivot / Federal / Wage Workers.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  applyAction,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  queryLegality,
  validateEffectTree,
} from "../src/index.js";
import { noteRunnerStoleOrTrashedCorpCard } from "../src/state/trashHooks.js";
import { noteCorpActionType } from "../src/state/corpActionHooks.js";
import { beginRunnerTurnFlags } from "../src/state/turn.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.91.0");
});

describe("TAI Oppo / Epiphany / Pivot / Federal / Wage Workers", () => {
  it("wires Oppo Research gate + terminal + Threat tags", () => {
    const def = getCardDef("oppo-research");
    expect(def.unsupported).toEqual([]);
    expect(def.playRequiresRunnerStoleOrTrashedCorpCardLastTurn).toBe(true);
    expect(def.endsActionPhase).toBe(true);
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });

  it("wires Epiphany steal-or-trash power + look/install", () => {
    const def = getCardDef("epiphany-analytica-nations-undivided");
    expect(def.unsupported).toEqual([]);
    expect(
      validateEffectTree(def.onFirstRunnerStoleOrTrashedCorpCardThisTurn!),
    ).toBeNull();
    const ab = def.paidAbilities?.[0];
    expect(ab?.cost).toMatchObject({ clicks: 1, powerCounters: 1 });
    expect(validateEffectTree(ab!.effect)).toBeNull();
  });

  it("wires Pivot search + Threat play/install", () => {
    const def = getCardDef("pivot");
    expect(def.unsupported).toEqual([]);
    expect(def.playAdditionalClick).toBe(true);
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });

  it("wires Federal Fundraising arrange + unprotected draw", () => {
    const def = getCardDef("federal-fundraising");
    expect(def.unsupported).toEqual([]);
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
  });

  it("wires Wage Workers action tracking", () => {
    const def = getCardDef("wage-workers");
    expect(def.unsupported).toEqual([]);
    expect(def.wageWorkersTrackActions).toBe(true);
  });
});

function must(
  state: ReturnType<typeof createInitialState>,
  action?: Parameters<typeof applyAction>[1],
) {
  if (action) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }
  return state;
}

function mustEval(r: { ok: boolean; error?: string }) {
  if (!r.ok) throw new Error(JSON.stringify(r));
}

describe("TAI v0.84 steal-or-trash tracker + play gate", () => {
  it("accepts new IR kinds in validateEffectTree", () => {
    expect(
      validateEffectTree(fx.do({ kind: "search_rd_operation_or_agenda_to_hq" })),
    ).toBeNull();
    expect(validateEffectTree(fx.lookTopNRdMayInstallOne(3))).toBeNull();
    expect(validateEffectTree(fx.lookTopNRdArrange(3))).toBeNull();
    expect(validateEffectTree(fx.mayPlayOrInstallFromHq())).toBeNull();
    expect(
      validateEffectTree(
        fx.if({ op: "host_server_unprotected_by_ice" }, fx.draw("corp", 1)),
      ),
    ).toBeNull();
  });

  it("tracks this turn + rolls last turn on Runner turn begin", () => {
    const s = createInitialState();
    noteRunnerStoleOrTrashedCorpCard(s);
    expect(s.turn.runnerStoleOrTrashedCorpCardThisTurn).toBe(true);
    expect(s.turn.runnerStoleOrTrashedCorpCardLastTurn).toBe(false);
    beginRunnerTurnFlags(s);
    expect(s.turn.runnerStoleOrTrashedCorpCardLastTurn).toBe(true);
    expect(s.turn.runnerStoleOrTrashedCorpCardThisTurn).toBe(false);
  });

  it("gates play_operation on playRequiresRunnerStoleOrTrashedCorpCardLastTurn", () => {
    const s = createInitialState();
    const op = instantiateCard("hedge-fund", "oppo-test", "corp:hq");
    op.playCost = 2;
    op.playRequiresRunnerStoleOrTrashedCorpCardLastTurn = true;
    s.cards["oppo-test"] = op;
    s.corp.hand = ["oppo-test"];
    s.corp.credits = 10;
    s.corp.clicks = 3;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    expect(
      queryLegality(s).legal.some(
        (e) => e.action.type === "play_operation" && e.action.cardId === "oppo-test",
      ),
    ).toBe(false);
    s.turn.runnerStoleOrTrashedCorpCardLastTurn = true;
    expect(
      queryLegality(s).legal.some(
        (e) => e.action.type === "play_operation" && e.action.cardId === "oppo-test",
      ),
    ).toBe(true);
  });

  it("fires identity onFirstRunnerStoleOrTrashedCorpCardThisTurn once per turn", () => {
    const s = createInitialState();
    const id = s.cards[s.runner.identityId];
    id.onFirstRunnerStoleOrTrashedCorpCardThisTurn = fx.addPowerCounter(1);
    id.powerCounters = 0;
    noteRunnerStoleOrTrashedCorpCard(s);
    expect(id.powerCounters).toBe(1);
    noteRunnerStoleOrTrashedCorpCard(s);
    expect(id.powerCounters).toBe(1);
  });
});

describe("TAI v0.84 Pivot / Federal / Wage primitives", () => {
  it("search_rd_operation_or_agenda_to_hq finds agenda and shuffles R&D", () => {
    const s = createInitialState();
    const agenda = instantiateCard("hedge-fund", "ag-1", "corp:rd");
    agenda.type = "agenda";
    agenda.agendaPoints = 1;
    agenda.advancementRequirement = 2;
    const ice = instantiateCard("hedge-fund", "ice-1", "corp:rd");
    ice.type = "ice";
    ice.rezCost = 1;
    s.cards["ag-1"] = agenda;
    s.cards["ice-1"] = ice;
    s.corp.deck = ["ag-1", "ice-1"];
    mustEval(
      evalEffect({ state: s, sourceId: "ag-1" }, fx.do({ kind: "search_rd_operation_or_agenda_to_hq" })),
    );
    expect(s.corp.hand).toEqual(["ag-1"]);
    expect(s.corp.deck).toEqual(["ice-1"]);
  });

  it("host_server_unprotected_by_ice cond and Federal arrange", () => {
    let s = createInitialState();
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: [],
    };
    const asset = instantiateCard("hedge-fund", "fed-1", "server:remote-1:root");
    asset.rezzed = true;
    s.cards["fed-1"] = asset;
    s.servers["remote-1"].root.push("fed-1");
    const c1 = instantiateCard("hedge-fund", "rd-a", "corp:rd");
    c1.type = "agenda";
    c1.agendaPoints = 1;
    c1.advancementRequirement = 2;
    const c2 = instantiateCard("hedge-fund", "rd-b", "corp:rd");
    c2.type = "operation";
    s.cards["rd-a"] = c1;
    s.cards["rd-b"] = c2;
    s.corp.deck = ["rd-a", "rd-b"];

    mustEval(
      evalEffect(
        { state: s, sourceId: "fed-1" },
        fx.if({ op: "host_server_unprotected_by_ice" }, fx.draw("corp", 1)),
      ),
    );
    expect(s.corp.hand.length).toBe(1);

    s.corp.hand = [];
    s.corp.deck = ["rd-a", "rd-b"];
    mustEval(
      evalEffect(
        { state: s, sourceId: "fed-1" },
        fx.do({ kind: "look_top_n_rd_arrange", n: 2 }),
      ),
    );
    expect(s.pendingChoice?.options.length).toBe(2);
    s = must(s, { type: "choose_option", optionId: "rd-arrange:rd-b" });
    s = must(s, { type: "choose_option", optionId: "rd-arrange:rd-a" });
    expect(s.corp.deck.slice(0, 2)).toEqual(["rd-b", "rd-a"]);
  });

  it("wageWorkersTrackActions gains click on third action of a type", () => {
    const s = createInitialState();
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: [],
    };
    const wage = instantiateCard("hedge-fund", "wage-1", "server:remote-1:root");
    wage.wageWorkersTrackActions = true;
    wage.rezzed = true;
    s.cards["wage-1"] = wage;
    s.servers["remote-1"].root.push("wage-1");
    s.activeSide = "corp";
    s.corp.clicks = 3;
    noteCorpActionType(s, "basic_gain");
    noteCorpActionType(s, "basic_gain");
    expect(s.corp.clicks).toBe(3);
    noteCorpActionType(s, "basic_gain");
    expect(s.corp.clicks).toBe(4);
  });
});
