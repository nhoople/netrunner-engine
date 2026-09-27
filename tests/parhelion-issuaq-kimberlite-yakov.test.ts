/**
 * Parhelion v0.60: Issuaq Adaptics, Kimberlite Field, Yakov.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  validateEffectTree,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v0.70.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("PH Issuaq Adaptics", () => {
  it("places power on score if agenda not installed/advanced; reduces win", () => {
    const def = getCardDef("issuaq-adaptics-sustaining-diversity");
    expect(def.unsupported).toEqual([]);
    expect(def.powerOnScoreIfAgendaNotInstalledOrAdvancedThisTurn).toBe(true);
    expect(def.agendaPointsToWinReductionPerPowerCounter).toBe(1);

    let s = createInitialState();
    s = structuredClone(s);
    s.config.agendaPointsToWin = 3;
    const id = s.cards[s.corp.identityId]!;
    id.powerOnScoreIfAgendaNotInstalledOrAdvancedThisTurn = true;
    id.agendaPointsToWinReductionPerPowerCounter = 1;
    id.powerCounters = 0;
    id.title = "Issuaq Adaptics";
    if (id.onAgendaScored) delete id.onAgendaScored;

    const ag = instantiateCard("hostile-takeover", "ag-1", "server:remote-1:root");
    ag.advancementTokens = 10;
    ag.agendaPoints = 2;
    s.cards["ag-1"] = ag;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["ag-1"],
    };
    // Not installed/advanced this turn
    s.turn.installedThisTurn = [];
    s.turn.advancedThisTurn = [];
    s.corp.clicks = 3;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    s = must(s, { type: "score_agenda", cardId: "ag-1" });
    expect(s.cards[s.corp.identityId]!.powerCounters).toBe(1);
    // 2 pts with need 3-1=2 → win
    expect(s.winner).toBe("corp");
  });
});

describe("PH Kimberlite Field", () => {
  it("wires may trash rezzed then trash Runner ≤ rez cost", () => {
    const def = getCardDef("kimberlite-field");
    expect(def.unsupported).toEqual([]);
    expect(validateEffectTree(def.onScore!)).toBeNull();

    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("ice-wall", "iw-1", "server:hq:ice");
    ice.rezzed = true;
    ice.rezCost = 1;
    s.cards["iw-1"] = ice;
    s.servers.hq.ice = ["iw-1"];
    const prog = instantiateCard("sure-gamble", "p-1", "runner:rig");
    prog.type = "program";
    prog.installCost = 1;
    s.cards["p-1"] = prog;
    s.runner.rig = ["p-1"];
    s.turn.lastTrashedRezzedPrintedRezCost = null;
    const r = evalEffect(
      { state: s, sourceId: "corp-id" },
      fx.mayTrashInstalled({
        excludeSelf: true,
        rezzedOnly: true,
        then: fx.trashInstalledRunnerLteLastTrashedRez("choose"),
      }),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice?.chooser).toBe("corp");
    s = must(s, { type: "choose_option", optionId: "trash:iw-1" });
    expect(s.corp.discard).toContain("iw-1");
    expect(s.turn.lastTrashedRezzedPrintedRezCost).toBe(1);
    // sole eligible runner → auto trash
    expect(s.runner.discard).toContain("p-1");
  });
});

describe("PH Yakov", () => {
  it("gains credits when a card is trashed from its server", () => {
    const def = getCardDef("yakov-erikovich-avdakov");
    expect(def.unsupported).toEqual([]);
    expect(def.creditsOnTrashFromThisServer).toBe(2);

    let s = createInitialState();
    s = structuredClone(s);
    const yak = instantiateCard(
      "yakov-erikovich-avdakov",
      "yak-1",
      "server:remote-1:root",
    );
    yak.rezzed = true;
    s.cards["yak-1"] = yak;
    const pad = instantiateCard("pad-campaign", "pad-1", "server:remote-1:root");
    pad.rezzed = true;
    s.cards["pad-1"] = pad;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["yak-1", "pad-1"],
    };
    const creditsBefore = s.corp.credits;
    const r = evalEffect(
      { state: s, sourceId: "corp-id" },
      fx.trashCorpCard("pad-1"),
    );
    expect(r.ok).toBe(true);
    expect(s.corp.credits).toBe(creditsBefore + 2);
  });
});
