/**
 * Parhelion v0.57: Hybrid Release, Thule Subsea, Reprise.
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
  queryLegality,
  validateEffectTree,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.14.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("PH Hybrid Release", () => {
  it("wires may_install_facedown_from_archives onScore", () => {
    const def = getCardDef("hybrid-release");
    expect(def.unsupported).toEqual([]);
    expect(validateEffectTree(def.onScore!)).toBeNull();
    expect(validateEffectTree(fx.mayInstallFacedownFromArchives())).toBeNull();

    let s = createInitialState();
    s = structuredClone(s);
    const asset = instantiateCard("pad-campaign", "arch-1", "corp:archives");
    s.cards["arch-1"] = asset;
    s.corp.discard = ["arch-1"];
    const remotesBefore = Object.keys(s.servers).filter((k) =>
      k.startsWith("remote-"),
    ).length;
    const r = evalEffect(
      { state: s, sourceId: "corp-id" },
      fx.mayInstallFacedownFromArchives(),
    );
    expect(r.ok).toBe(true);
    expect(s.corp.discard).not.toContain("arch-1");
    const remotesAfter = Object.keys(s.servers).filter((k) =>
      k.startsWith("remote-"),
    ).length;
    expect(remotesAfter).toBe(remotesBefore + 1);
    expect(s.cards["arch-1"]!.rezzed).toBe(false);
    expect(s.cards["arch-1"]!.faceup).toBe(false);
  });
});

describe("PH Thule Subsea", () => {
  it("fires onAgendaStolen choice when Runner steals", () => {
    const def = getCardDef("thule-subsea-safety-below");
    expect(def.unsupported).toEqual([]);
    expect(validateEffectTree(def.onAgendaStolen!)).toBeNull();

    let s = createInitialState();
    s = structuredClone(s);
    const id = s.cards[s.corp.identityId]!;
    id.onAgendaStolen = structuredClone(def.onAgendaStolen!);
    id.title = "Thule Subsea: Safety Below";
    if (id.onAgendaScored) delete id.onAgendaScored;

    const agenda = instantiateCard(
      "hostile-takeover",
      "ag-1",
      "server:remote-1:root",
    );
    s.cards["ag-1"] = agenda;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["ag-1"],
    };
    s.runner.credits = 10;
    s.runner.clicks = 4;
    s.activeSide = "runner";
    s.timingKey = "breach.awaitAccess";
    s.run = {
      attackedServerId: "remote-1",
      phase: "breach",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: ["ag-1"],
      accessRemaining: 1,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      cannotStealOrTrash: false,
      accessCandidatesPreset: true,
    };
    s = must(s, { type: "access_card", cardId: "ag-1" });
    s = must(s, { type: "steal_agenda", cardId: "ag-1" });
    expect(s.runner.score).toContain("ag-1");
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(s.pendingChoice?.options.map((o) => o.id).sort()).toEqual([
      "damage",
      "pay",
    ]);

    const clicksBefore = s.runner.clicks;
    const creditsBefore = s.runner.credits;
    s = must(s, { type: "choose_option", optionId: "pay" });
    expect(s.runner.clicks).toBe(clicksBefore - 1);
    expect(s.runner.credits).toBe(creditsBefore - 2);
  });
});

describe("PH Reprise", () => {
  it("requires agenda stolen this turn; returns Corp card; optional run", () => {
    const def = getCardDef("reprise");
    expect(def.unsupported).toEqual([]);
    expect(def.playRequiresAgendaStolenThisTurn).toBe(true);
    expect(def.runEventOptional).toBe(true);
    expect(def.runEvent?.servers).toBe("any");
    expect(validateEffectTree(def.onPlay!)).toBeNull();
    expect(validateEffectTree(fx.returnInstalledCorpToHq("choose"))).toBeNull();

    let s = createInitialState();
    s = structuredClone(s);
    const ev = instantiateCard("sure-gamble", "rep-1", "runner:grip");
    ev.title = "Reprise";
    ev.type = "event";
    ev.playCost = 0;
    ev.subtypes = ["run"];
    ev.playRequiresAgendaStolenThisTurn = true;
    ev.onPlay = fx.returnInstalledCorpToHq("choose");
    ev.runEvent = { servers: "any" };
    ev.runEventOptional = true;
    s.cards["rep-1"] = ev;
    s.runner.hand = ["rep-1"];
    s.runner.credits = 5;
    s.runner.clicks = 4;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.turn.agendaPointsStolenThisTurn = 0;

    // Install one Corp asset to return
    const asset = instantiateCard("pad-campaign", "corp-a", "server:remote-1:root");
    s.cards["corp-a"] = asset;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["corp-a"],
    };

    expect(
      queryLegality(s).legal.some(
        (e) => e.action.type === "play_event" && e.action.cardId === "rep-1",
      ),
    ).toBe(false);

    s.turn.agendaPointsStolenThisTurn = 2;
    expect(
      queryLegality(s).legal.some(
        (e) =>
          e.action.type === "play_event" &&
          e.action.cardId === "rep-1" &&
          !("serverId" in e.action && e.action.serverId),
      ),
    ).toBe(true);

    // Decline run: return asset to HQ
    s = must(s, { type: "play_event", cardId: "rep-1" });
    expect(s.corp.hand).toContain("corp-a");
    expect(s.servers["remote-1"]?.root ?? []).not.toContain("corp-a");
    expect(s.run).toBeNull();
  });
});
