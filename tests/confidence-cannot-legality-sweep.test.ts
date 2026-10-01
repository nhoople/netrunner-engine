/**
 * Legality / "cannot" sweep for cleared Gateway→VP cards that impose
 * cannot-jack-out / cannot-score / cannot-rez (and similar). Matching
 * basic/paid actions must drop from legality; apply stays fail-closed.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  addRestriction,
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  CR,
  crDataPresent,
  evalEffect,
  explainAction,
  fx,
  getCardDef,
  instantiateCard,
  isActionLegal,
  queryLegality,
  setupEmptyRemoteWithIce,
} from "../src/index.js";
import type { Action, GameState, ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.142.0");
});

function must(state: GameState, action: Action): GameState {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

function corpReadyWithScorableAgenda(): GameState {
  let s = createInitialState();
  s = structuredClone(s);
  const ag = instantiateCard(
    "offworld-office",
    "ag-1",
    "server:remote-1:root",
  );
  ag.advancementTokens = 4;
  s.cards["ag-1"] = ag;
  s.servers["remote-1"] = {
    id: "remote-1",
    kind: "remote",
    ice: [],
    root: ["ag-1"],
  };
  s.nextRemoteNumber = 2;
  s.activeSide = "corp";
  s.timingKey = "corp.takeAction";
  s.corp.clicks = 3;
  return s;
}

describe("cannot sweep — jack_out (prevent IR / 1.2.2)", () => {
  it("jack_out absent from legality with cannotPrecedence cite", () => {
    let s = setupEmptyRemoteWithIce();
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    s.cards[remote.ice[0]].onRez = fx.prevent("jack_out");
    s.cards[remote.ice[0]].prevention = { jackOutForRun: true };

    s = must(s, {
      type: "basic_install",
      cardId: "runner-program-1",
      destination: { kind: "rig" },
    });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_run", serverId: remote.id as ServerId });
    s = must(s, { type: "rez_ice", cardId: remote.ice[0] });
    s = must(s, { type: "pass_window" });
    s = must(s, {
      type: "break_subroutine",
      breakerId: "runner-program-1",
      subIndex: 0,
    });
    s = must(s, { type: "pass_window" });

    expect(queryLegality(s).legal.some((e) => e.action.type === "jack_out")).toBe(
      false,
    );
    const expl = explainAction(s, { type: "jack_out" });
    expect(expl.legal).toBe(false);
    if (expl.legal) return;
    expect(expl.cites.map((c) => c.number)).toEqual(
      expect.arrayContaining([CR.cannotPrecedence.number]),
    );
  });
});

describe("cannot sweep — Luminal Transubstantiation (cannot score agendas)", () => {
  it("forbid_scoring_agendas_this_turn drops score_agenda from legality", () => {
    expect(getCardDef("luminal-transubstantiation").unsupported ?? []).toEqual(
      [],
    );
    const s = corpReadyWithScorableAgenda();
    expect(
      queryLegality(s).legal.some((e) => e.action.type === "score_agenda"),
    ).toBe(true);

    expect(
      evalEffect(
        { state: s, sourceId: "ag-1" },
        fx.forbidScoringAgendasThisTurn(),
      ).ok,
    ).toBe(true);
    expect(s.turn.cannotScoreAgendas).toBe(true);

    expect(
      queryLegality(s).legal.some((e) => e.action.type === "score_agenda"),
    ).toBe(false);
    expect(isActionLegal(s, { type: "score_agenda", cardId: "ag-1" })).toBe(
      false,
    );
    const blocked = applyAction(s, { type: "score_agenda", cardId: "ag-1" });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error).toMatch(/Cannot score agendas/);
    expect(blocked.cites.map((c) => c.id)).toContain(CR.scoringAgenda.id);
  });
});

describe("cannot sweep — Clot (cannot score agenda installed this turn)", () => {
  it("score_agenda drops while Clot is installed and agenda is fresh", () => {
    expect(getCardDef("clot").forbidScoreAgendaInstalledThisTurn).toBe(true);
    const s = corpReadyWithScorableAgenda();
    s.turn.installedThisTurn = ["ag-1"];
    const clot = instantiateCard("clot", "clot-1", "runner:rig");
    s.cards["clot-1"] = clot;
    s.runner.rig = ["clot-1"];

    expect(
      queryLegality(s).legal.some(
        (e) => e.action.type === "score_agenda" && e.action.cardId === "ag-1",
      ),
    ).toBe(false);
    const blocked = applyAction(s, { type: "score_agenda", cardId: "ag-1" });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error).toMatch(/Clot/);
  });
});

describe("cannot sweep — Mitosis-class cannot score/rez card ids", () => {
  it("rez_ice and score_agenda for locked ids drop from legality", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];
    const ag = instantiateCard(
      "offworld-office",
      "ag-1",
      "server:remote-1:root",
    );
    ag.advancementTokens = 4;
    s.cards["ag-1"] = ag;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["ag-1"],
    };
    s.nextRemoteNumber = 2;
    s.turn.cannotScoreOrRezCardIds = ["ice-1", "ag-1"];

    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    s.corp.clicks = 3;
    expect(
      queryLegality(s).legal.some(
        (e) => e.action.type === "score_agenda" && e.action.cardId === "ag-1",
      ),
    ).toBe(false);

    s.activeSide = "runner";
    s.timingKey = "run.approachPaw";
    s.run = {
      attackedServerId: "hq",
      phase: "approach",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    expect(
      queryLegality(s).legal.some(
        (e) => e.action.type === "rez_ice" && e.action.cardId === "ice-1",
      ),
    ).toBe(false);
  });
});

describe("cannot sweep — restriction basic_run / rez_ice", () => {
  it("addRestriction(basic_run) drops basic_run from runner takeAction", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;
    addRestriction(s, "basic_run", CR.cannotPrecedence, "test-lockdown");

    expect(
      queryLegality(s).legal.some((e) => e.action.type === "basic_run"),
    ).toBe(false);
    const expl = explainAction(s, { type: "basic_run", serverId: "hq" });
    expect(expl.legal).toBe(false);
    if (expl.legal) return;
    expect(expl.cites.map((c) => c.id)).toContain(CR.cannotPrecedence.id);
  });
});

describe("cannot sweep — Ansel forbid steal/trash this run", () => {
  it("catalog wires forbid_steal_trash_this_run on Ansel 1.0", () => {
    const def = getCardDef("ansel-1-0");
    expect(def.unsupported ?? []).toEqual([]);
    const tree = JSON.stringify(def.subroutines ?? []);
    expect(tree).toContain("forbid_steal_trash_this_run");
  });
});
