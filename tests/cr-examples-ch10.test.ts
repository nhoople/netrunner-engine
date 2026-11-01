/**
 * Comprehensive Rules examples from chapter 10.
 * Each test plays that example's board.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  autoWalk,
  cardsDataPresent,
  commitCheckpointSnapshot,
  createInitialState,
  crDataPresent,
  enterStep,
  evalEffect,
  fx,
  getPublicView,
  instantiateCard,
  CR,
  boostTrace,
  legalActions,
  resolveTrace,
  startTrace,
  stealAgenda,
} from "../src/index.js";
import type { Action, GameState } from "../src/state/types.js";
import {
  occurCheckpoint,
} from "../src/legality/checkpoints.js";
import {
  createGame,
} from "../src/api/library.js";
import {
  createShortGameState,
} from "../src/cards/shortGame.js";


beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.15");
});

function must(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`${result.error} ${JSON.stringify(result.cites)}`);
  return result.state;
}


function at(lines: string[], fragment: string): number {
  const i = lines.findIndex((line) => line.includes(fragment));
  expect(i, fragment).toBeGreaterThanOrEqual(0);
  return i;
}

function runnerTurn(state: GameState): void {
  state.activeSide = "runner";
  state.timingKey = "runner.takeAction";
}

function corpTurn(state: GameState): void {
  state.activeSide = "corp";
  state.timingKey = "corp.takeAction";
}

function setCorpPile(state: GameState, hq: number, rd: number): void {
  const ids = [...state.corp.hand, ...state.corp.deck];
  while (ids.length < hq + rd) {
    const id = `fill-${ids.length}`;
    state.cards[id] = instantiateCard("hedge-fund", id, "corp:rd");
    ids.push(id);
  }
  state.corp.hand = [];
  state.corp.deck = [];
  for (let i = 0; i < hq; i++) {
    const id = ids[i]!;
    state.cards[id]!.zone = "corp:hq";
    state.cards[id]!.faceup = false;
    state.corp.hand.push(id);
  }
  for (let i = 0; i < rd; i++) {
    const id = ids[hq + i]!;
    state.cards[id]!.zone = "corp:rd";
    state.cards[id]!.faceup = false;
    state.corp.deck.push(id);
  }
}

describe("CR examples, chapter 10", () => {


  it("trashes the Kitsune whose subroutine resolved, not another copy (CR 10.1.5.ex1)", () => {
    const s = createInitialState();
    const kitsune = instantiateCard("kitsune", "kit-1", "server:hq:ice");
    kitsune.rezzed = true;
    kitsune.faceup = true;
    const other = instantiateCard("kitsune", "kit-2", "server:rd:ice");
    other.rezzed = true;
    other.faceup = true;
    s.cards["kit-1"] = kitsune;
    s.cards["kit-2"] = other;
    s.servers.hq.ice = ["kit-1"];
    s.servers.rd.ice = ["kit-2"];
    s.run = {
      attackedServerId: "hq",
      phase: "breach",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: 0,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      kitsuneIceToTrashAtBreachEnd: "kit-1",
    };
    enterStep(s, "breach.complete");
    autoWalk(s);
    expect(s.corp.discardPile).toContain("kit-1");
    expect(s.servers.hq.ice).not.toContain("kit-1");
    expect(s.servers.rd.ice).toContain("kit-2");
    expect(s.log.join("\n")).toContain(CR.selfReference.number);
  });


  it("lets the Corp choose how many times two Wormholes loop (CR 10.1.6a.ex1)", () => {
    const s = createInitialState();
    const first = instantiateCard("wormhole", "worm-1", "server:hq:ice");
    const second = instantiateCard("wormhole", "worm-2", "server:rd:ice");
    first.rezzed = true;
    second.rezzed = true;
    s.cards["worm-1"] = first;
    s.cards["worm-2"] = second;
    s.servers.hq.ice = ["worm-1"];
    s.servers.rd.ice = ["worm-2"];
    const offered = evalEffect(
      { state: s, sourceId: "worm-1" },
      first.subroutines?.[0]?.effect ??
        fx.do({ kind: "may_resolve_subroutine_on_rezzed_ice", subtype: "" }),
    );
    expect(offered.ok).toBe(true);
    expect(s.pendingChoice?.loopCount).toBe(true);
    const ended = must(s, { type: "choose_option", optionId: "loop-times:2157" });
    expect(ended.pendingChoice).toBeNull();
    expect(ended.log.join("\n")).toContain("2157");
    expect(ended.log.join("\n")).toContain(CR.mandatoryLoop.number);
    expect(ended.cards["worm-1"]?.rezzed).toBe(true);
    expect(ended.cards["worm-2"]?.rezzed).toBe(true);
  });


  it("leaves the Corp's facedown install unnamed after Indexing (CR 10.2.2b.ex1)", () => {
    const s = createInitialState();
    const indexing = instantiateCard("indexing", "idx-1", "runner:heap");
    const brain = instantiateCard("braintrust", "brain-1", "corp:rd");
    const snare = instantiateCard("snare", "snare-1", "corp:rd");
    const pad = instantiateCard("pad-campaign", "pad-1", "corp:hq");
    s.cards["idx-1"] = indexing;
    s.cards["brain-1"] = brain;
    s.cards["snare-1"] = snare;
    s.cards["pad-1"] = pad;
    s.corp.deck = ["brain-1", "snare-1"];
    s.corp.hand = ["pad-1"];
    s.run = {
      attackedServerId: "rd",
      phase: "success",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    const opened = evalEffect(
      { state: s, sourceId: "idx-1" },
      fx.do({ kind: "may_breach_instead_indexing" }),
    );
    expect(opened.ok).toBe(true);
    const arranging = must(s, { type: "choose_option", optionId: "arrange" });
    const brainTop = must(arranging, {
      type: "choose_option",
      optionId: "rd-arrange:brain-1",
    });
    const arranged = must(brainTop, {
      type: "choose_option",
      optionId: "rd-arrange:snare-1",
    });
    expect(arranged.cards[arranged.corp.deck[0]!]?.title).toBe("Braintrust");
    expect(arranged.cards[arranged.corp.deck[1]!]?.title).toBe("Snare!");
    const firstDraw = evalEffect(
      { state: arranged, sourceId: arranged.corp.identityId },
      fx.do({ kind: "draw", side: "corp", amount: 1 }),
    );
    expect(firstDraw.ok).toBe(true);
    const secondDraw = evalEffect(
      { state: arranged, sourceId: arranged.corp.identityId },
      fx.do({ kind: "draw", side: "corp", amount: 1 }),
    );
    expect(secondDraw.ok).toBe(true);
    expect(arranged.corp.hand.map((id) => arranged.cards[id]?.title)).toEqual([
      "PAD Campaign",
      "Braintrust",
      "Snare!",
    ]);
    arranged.run = null;
    arranged.activeSide = "corp";
    arranged.timing.structure = "corp_turn";
    arranged.timingKey = "corp.takeAction";
    arranged.corp.clicks = 1;
    const installed = must(arranged, {
      type: "basic_install",
      cardId: "pad-1",
      destination: { kind: "new_remote" },
    });
    const remote = installed.servers["remote-1"];
    expect(remote?.root).toEqual(["pad-1"]);
    expect(installed.cards["pad-1"]?.faceup).toBe(false);
    expect(installed.corp.hand.map((id) => installed.cards[id]?.title)).toEqual([
      "Braintrust",
      "Snare!",
    ]);
    const runnerView = getPublicView(installed, "runner");
    const hidden = runnerView.servers.find((server) => server.id === "remote-1");
    expect(hidden?.root[0]?.title).toBeNull();
  });


  it("shows Femme Fatale's chosen ice to the Corp (CR 10.2.3b.ex1)", () => {
    const state = createGame({ setup: () => createShortGameState() });
    const ice = instantiateCard("ice-wall", "hq-ice", "server:hq:ice");
    ice.rezzed = true;
    state.cards[ice.id] = ice;
    state.servers.hq!.ice = [ice.id];
    const femme = instantiateCard("femme-fatale", "ff-open", "runner:installed");
    femme.chosenIceId = ice.id;
    state.cards[femme.id] = femme;
    state.runner.installed = [femme.id];

    const corp = getPublicView(state, "corp");
    const runner = getPublicView(state, "runner");
    expect(corp.opponent.chosenIce).toEqual([{ cardId: femme.id, iceId: ice.id }]);
    expect(runner.self.chosenIce).toEqual([{ cardId: femme.id, iceId: ice.id }]);
    expect(corp.self.chosenIce).toEqual([]);
  });


  it("removes an encounter-duration strength increase at the checkpoint after the encounter (CR 10.3.1b.ex1)", () => {
    const s = createInitialState();
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: { iceId: "ice-1", broken: [] },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: { "runner-program-1": 4 },
      encounterStrengthBoosts: { "runner-program-1": 2 },
      iceStrengthBoosts: { "ice-1": 1 },
      accessingCardId: null,
    };
    s.timingKey = "run.checkSubs";
    enterStep(s, "run.movement");
    expect(s.run!.encounterStrengthBoosts).toEqual({});
    expect(s.run!.iceStrengthBoosts).toEqual({});
    expect(s.run!.strengthBoosts["runner-program-1"]).toBe(4);
    expect(s.log.join("\n")).toContain(
      `Duration abilities checked (CR ${CR.checkpointDurationAbilities.number}); 2 removed.`,
    );
  });


  it("trashes Targeted Marketing at the checkpoint after an agenda is stolen (CR 10.3.1b.ex2)", () => {
    let s = createInitialState();
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    const current = instantiateCard("targeted-marketing", "tm-1", "corp:play-area");
    const agenda = instantiateCard("priority-requisition", "ag-1", "server:hq:root");
    s.cards["tm-1"] = current;
    s.cards["ag-1"] = agenda;
    s.corp.playArea = ["tm-1"];
    s.servers.hq.root = ["ag-1"];
    stealAgenda(s, "ag-1");
    expect(s.cards["tm-1"]!.zone).toBe("corp:play-area");
    s = must(s, { type: "basic_gain_credit" });
    expect(s.cards["tm-1"]!.zone).toBe("corp:archives");
    expect(s.corp.discardPile).toContain("tm-1");
    expect(s.log.join("\n")).toContain("duration passed");
  });


  it("trashes Chisel when the ice it is hosted on is rezzed Tithonium (CR 10.3.1e.ex1)", () => {
    const s = createInitialState();
    const ice = instantiateCard("tithonium", "tith-1", "server:hq:ice");
    ice.rezzed = false;
    ice.faceup = false;
    const chisel = instantiateCard("chisel", "chisel-1", "hosted:tith-1");
    chisel.hostId = "tith-1";
    ice.hostedCardIds = ["chisel-1"];
    s.cards["tith-1"] = ice;
    s.cards["chisel-1"] = chisel;
    s.servers.hq.ice = ["tith-1"];
    occurCheckpoint(s, "timing", "before rez", [CR.checkpointCardRestrictions], "test");
    expect(s.cards["chisel-1"]?.zone).toBe("hosted:tith-1");
    ice.rezzed = true;
    ice.faceup = true;
    occurCheckpoint(s, "timing", "after rez", [CR.checkpointCardRestrictions], "test");
    expect(s.runner.discardPile).toContain("chisel-1");
    expect(ice.hostedCardIds ?? []).not.toContain("chisel-1");
    expect(s.log.join("\n")).toContain(CR.checkpointCardRestrictions.number);
  });


  it("offers only minimal memory sets after Bad Times (CR 10.3.1e.ex2)", () => {
    const s = createInitialState();
    const bad = instantiateCard("bad-times", "bad-1", "corp:hq");
    const oneA = instantiateCard("corroder", "one-a", "runner:installed");
    const oneB = instantiateCard("datasucker", "one-b", "runner:installed");
    const two = instantiateCard("corroder", "two-1", "runner:installed");
    const zero = instantiateCard("parasite", "zero-1", "runner:installed");
    oneA.memoryCost = 1;
    oneB.memoryCost = 1;
    two.memoryCost = 2;
    two.title = "Heavy";
    zero.memoryCost = 0;
    zero.title = "Free";
    s.cards["bad-1"] = bad;
    s.cards["one-a"] = oneA;
    s.cards["one-b"] = oneB;
    s.cards["two-1"] = two;
    s.cards["zero-1"] = zero;
    s.corp.hand = ["bad-1"];
    s.runner.installed = ["one-a", "one-b", "two-1", "zero-1"];
    s.runner.memoryLimit = 4;
    s.runner.tags = 1;
    s.corp.credits = 4;
    s.corp.clicks = 1;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    const played = must(s, { type: "play_operation", cardId: "bad-1" });
    const ids = played.pendingChoice?.options.map((option) => option.id) ?? [];
    expect(ids).toContain("restrict:one-a,one-b|*");
    expect(ids).toContain("restrict:two-1|*");
    expect(ids.join(" ")).not.toContain("zero-1");
    expect(ids.some((id) => id.includes("two-1") && id.includes("one-"))).toBe(false);
    const kept = must(played, {
      type: "choose_option",
      optionId: "restrict:two-1|*",
    });
    expect(kept.runner.installed).not.toContain("two-1");
    expect(kept.runner.installed).toEqual(
      expect.arrayContaining(["one-a", "one-b", "zero-1"]),
    );
  });


  it("lets the Runner add Drafter's installed card as a breach candidate (CR 10.3.1j.ex1)", () => {
    const s = createInitialState();
    const ice = instantiateCard("drafter", "draft-1", "server:remote-1:ice");
    ice.rezzed = true;
    ice.faceup = true;
    const ganked = instantiateCard("ganked", "gank-1", "server:remote-1:root");
    const pad = instantiateCard("pad-campaign", "pad-1", "corp:hq");
    s.cards["draft-1"] = ice;
    s.cards["gank-1"] = ganked;
    s.cards["pad-1"] = pad;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: ["draft-1"],
      root: ["gank-1"],
    };
    s.corp.hand = ["pad-1"];
    s.timing.structure = "breach";
    s.run = {
      attackedServerId: "remote-1",
      phase: "breach",
      position: null,
      successful: true,
      accessedCardIds: ["gank-1"],
      accessCandidates: ["gank-1"],
      randomAccessLimit: null,
      encounter: {
        iceId: "draft-1",
        broken: [false, false],
        subroutinesResolved: [],
      },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: "gank-1",
    };
    // Baseline so 10.3.1a zone-diff can see the root entry (CR 10.3.1j).
    commitCheckpointSnapshot(s, "before-drafter-install");
    const sub = ice.subroutines?.[1]?.effect;
    if (!sub) throw new Error("Drafter's second subroutine is missing");
    const offered = evalEffect({ state: s, sourceId: "draft-1" }, sub);
    expect(offered.ok).toBe(true);
    const installed = must(s, { type: "choose_option", optionId: "install" });
    expect(installed.servers["remote-1"]?.root).toContain("pad-1");
    expect(installed.pendingChoice?.options.map((option) => option.id)).toContain(
      "root-access:yes:pad-1",
    );
    const chosen = must(installed, {
      type: "choose_option",
      optionId: "root-access:yes:pad-1",
    });
    expect(chosen.run?.accessCandidates).toContain("pad-1");
  });


  it("does not let Jesminder avoid AMAZE tags after the run has ended (CR 10.3.6.ex1)", () => {
    const s = createInitialState();
    const jes = instantiateCard(
      "jesminder-sareen-girl-behind-the-curtain",
      "jes-1",
      "runner:identity",
    );
    const amaze = instantiateCard("amaze-amusements", "amaze-1", "server:hq:root");
    amaze.rezzed = true;
    amaze.faceup = true;
    s.cards["jes-1"] = jes;
    s.cards["amaze-1"] = amaze;
    s.runner.identityId = "jes-1";
    s.servers.hq.root.push("amaze-1");
    s.runner.tags = 0;
    s.run = {
      attackedServerId: "hq",
      phase: "success",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      agendasStolenThisRun: 1,
      persistentTagsIfAgendaStolen: 2,
    };
    s.timingKey = "run.movement";
    enterStep(s, "run.ends");
    autoWalk(s);
    const closed = at(s.log, "the run has ended, so this tag is not during a run");
    expect(s.log[closed]).toContain(CR.checkpointAfterTimingStructure.number);
    expect(s.runner.tags).toBe(2);
    expect(s.run).toBeNull();
  });


  it("does not add The Cleaners to damage the Runner suffers (CR 10.4.1.ex1)", () => {
    let s = createInitialState();
    const argus = instantiateCard(
      "argus-security-protection-guaranteed",
      "argus-1",
      "corp:identity",
    );
    const cleaners = instantiateCard("the-cleaners", "cl-1", "corp:score");
    const punitive = instantiateCard(
      "punitive-counterstrike",
      "pun-1",
      "corp:hq",
    );
    const spoof = instantiateCard(
      "biometric-spoofing",
      "spoof-1",
      "runner:installed",
    );
    s.cards["argus-1"] = argus;
    s.cards["cl-1"] = cleaners;
    s.cards["pun-1"] = punitive;
    s.cards["spoof-1"] = spoof;
    s.corp.identityId = "argus-1";
    s.corp.scoreArea = ["cl-1"];
    s.runner.installed = ["spoof-1"];
    s.runner.hand = ["g1", "g2", "g3", "g4", "g5"];
    for (const id of s.runner.hand) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    }

    const stolen = evalEffect(
      { state: s, sourceId: "argus-1" },
      argus.onAgendaStolen!,
    );
    expect(stolen.ok).toBe(true);
    s = must(s, { type: "choose_option", optionId: "meat" });
    const suffered = at(s.log, "The Runner suffers the meat damage");
    expect(s.log[suffered]).toContain(CR.sufferDamage.number);
    expect(s.log.some((line) => line.includes("Meat damage increased"))).toBe(
      false,
    );
    expect(s.pendingDamage).toMatchObject({ type: "meat", remaining: 2 });
    s = must(s, { type: "accept_damage" });
    expect(s.runner.hand).toHaveLength(3);

    s.turn.agendaPointsStolenLastTurn = 2;
    const struck = evalEffect(
      { state: s, sourceId: "pun-1" },
      {
        op: "do",
        action: { kind: "meat_damage_stolen_last_turn" },
      },
    );
    expect(struck.ok).toBe(true);
    expect(s.log.some((line) => line.includes("Meat damage increased"))).toBe(
      true,
    );
    expect(s.pendingDamage).toMatchObject({ type: "meat", remaining: 3 });
  });


    it("flatlines to BOOM! before I've Had Worse can draw (CR 10.4.3.ex1)", () => {
    let s = createInitialState();
    const worse = instantiateCard("ive-had-worse", "worse-1", "runner:grip");
    const boom = instantiateCard("boom", "boom-1", "corp:hq");
    s.cards["worse-1"] = worse;
    s.cards["boom-1"] = boom;
    s.runner.hand = ["worse-1"];
    for (const id of ["g1", "g2", "g3"]) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }
    s.corp.hand = ["boom-1"];
    s.runner.tags = 2;
    s.corp.clicks = 3;
    s.corp.credits = 10;
    const deckBefore = s.runner.deck.length;
    corpTurn(s);
    s = must(s, { type: "play_operation", cardId: "boom-1" });
    expect(s.winner).toBe("corp");
    expect(s.winReason).toBe("flatline");
    expect(s.runner.deck).toHaveLength(deckBefore);
    expect(s.runner.hand).toEqual([]);
    expect(s.runner.discardPile).toContain("worse-1");
    expect(s.log.join("\n")).toContain("I've Had Worse does not resolve");
  });


  it("trashes Chronos Protocol's chosen card and two random cards together (CR 10.4.3a.ex1)", () => {
    const s = createInitialState();
    s.cards[s.corp.identityId]!.corpChoosesFirstNetDamageCardEachTurn = true;
    const worse = instantiateCard("ive-had-worse", "worse-1", "runner:grip");
    s.cards["worse-1"] = worse;
    for (const id of ["g1", "g2", "g3"]) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    }
    for (const id of ["d1", "d2", "d3"]) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:stack");
    }
    s.runner.hand = ["worse-1", "g1", "g2", "g3"];
    s.runner.deck = ["d1", "d2", "d3"];
    const dealt = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      { op: "do", action: { kind: "net_damage", amount: 3 } },
    );
    expect(dealt.ok).toBe(true);
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options).toHaveLength(4);
    const picked = must(s, { type: "choose_option", optionId: "chronos:worse-1" });
    expect(picked.pendingChoice).toBeNull();
    expect(picked.runner.discardPile).toContain("worse-1");
    expect(picked.runner.discardPile.filter((id) => ["worse-1", "g1", "g2", "g3"].includes(id))).toHaveLength(3);
    expect(picked.log.join("\n")).toContain("1 still in the grip");
    expect(picked.log.join("\n")).toContain(CR.sequentialDamageSelection.number);
    expect(picked.runner.hand).toHaveLength(4);
    expect(picked.runner.deck).toEqual([]);
  });


  it("resolves Gemini's strength ability after the trace is determined (CR 10.8.5.ex1)", () => {
    const grip = (s: GameState) => {
      s.runner.hand = [];
      for (let i = 0; i < 3; i++) {
        const card = instantiateCard("sure-gamble", `grip-${i}`, "runner:grip");
        s.cards[card.id] = card;
        s.runner.hand.push(card.id);
      }
    };
    const gemini = (s: GameState) => {
      const ice = instantiateCard("gemini", "gem-1", "server:hq:ice");
      ice.rezzed = true;
      s.cards["gem-1"] = ice;
    };
    const netHits = (s: GameState) =>
      s.log.filter((line) => line.startsWith("net damage 1:")).length;

    const low = createInitialState();
    gemini(low);
    grip(low);
    low.runner.link = 0;
    const lowTrace = evalEffect(
      { state: low, sourceId: "gem-1" },
      fx.do({ kind: "trace_subroutine" }),
    );
    expect(lowTrace.ok).toBe(true);
    expect(netHits(low)).toBe(1);

    const missed = createInitialState();
    gemini(missed);
    grip(missed);
    missed.runner.link = 3;
    const missedTrace = evalEffect(
      { state: missed, sourceId: "gem-1" },
      fx.do({ kind: "trace_subroutine" }),
    );
    expect(missedTrace.ok).toBe(true);
    expect(netHits(missed)).toBe(0);

    const strongFail = createInitialState();
    gemini(strongFail);
    grip(strongFail);
    strongFail.runner.link = 6;
    strongFail.corp.credits = 5;
    const whenDetermined = fx.do({ kind: "trace_when_determined" });
    startTrace(
      strongFail,
      "gem-1",
      2,
      fx.seq(fx.do({ kind: "trace_success" }), whenDetermined),
      whenDetermined,
    );
    expect(boostTrace(strongFail, 3)).toBeNull();
    const failed = resolveTrace(strongFail);
    expect(failed.ok).toBe(true);
    expect(netHits(strongFail)).toBe(1);
    expect(strongFail.log.join("\n")).toContain(CR.traceConditionals.number);
  });


    it("does not empty Crowdfunding before its install credits are placed (CR 10.9.2.ex1)", () => {
    let s = createInitialState();
    const deckBefore = s.runner.deck.length;
    const card = instantiateCard("crowdfunding", "cf-1", "runner:grip");
    s.cards["cf-1"] = card;
    s.runner.hand = ["cf-1"];
    s.runner.clicks = 1;
    runnerTurn(s);
    s = must(s, {
      type: "basic_install",
      cardId: "cf-1",
      destination: { kind: "installed" },
    });
    expect(s.cards["cf-1"]?.zone).toBe("runner:installed");
    expect(s.cards["cf-1"]?.hostedCredits).toBe(3);
    expect(s.runner.deck).toHaveLength(deckBefore);
    expect(s.runner.discardPile).not.toContain("cf-1");
    expect(s.log.join("\n")).not.toContain("hosted credits empty");
  });


  it("gives Virtuoso's extra HQ access on the first successful mark run (CR 10.11.5.ex1)", () => {
    const s = createInitialState();
    s.turnNumber = 3;
    s.markServerId = null;
    s.run = {
      attackedServerId: "hq",
      phase: "success",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      skipBreach: true,
    };
    s.timingKey = "run.approachServer";
    enterStep(s, "run.success");
    autoWalk(s);
    expect(s.turn.successfulMarkRunThisTurn).toBeFalsy();
    const virtuoso = instantiateCard("virtuoso", "virt-1", "runner:installed");
    const carpe = instantiateCard("carpe-diem", "carpe-1", "runner:heap");
    s.cards["virt-1"] = virtuoso;
    s.cards["carpe-1"] = carpe;
    s.runner.installed = ["virt-1"];
    evalEffect(
      { state: s, sourceId: "carpe-1" },
      fx.do({ kind: "identify_mark" }),
    );
    expect(s.markServerId).toBe("hq");
    s.run = {
      attackedServerId: "hq",
      phase: "success",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      skipBreach: true,
    };
    s.timingKey = "run.approachServer";
    enterStep(s, "run.success");
    autoWalk(s);
    expect(s.log.join("\n")).toContain("Virtuoso — +1 bonus access");
    expect(s.turn.successfulMarkRunThisTurn).toBe(true);
  });


    it("lets the Corp split Esâ Afontov's sabotage 2 across 2 HQ and 30 R&D (CR 10.12.3b.ex1)", () => {
    const s = createInitialState();
    const esa = instantiateCard(
      "esa-afontov-eco-insurrectionist",
      "esa-1",
      "runner:identity",
    );
    s.cards["esa-1"] = esa;
    s.runner.identityId = "esa-1";
    s.runner.hand = [];
    for (const id of ["grip-a", "grip-b"]) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }
    setCorpPile(s, 2, 30);
    const hq = [...s.corp.hand];
    const rdTop = s.corp.deck[0]!;
    const dealt = evalEffect(
      { state: s, sourceId: "corp-id" },
      fx.coreDamage(1),
    );
    expect(dealt.ok).toBe(true);
    expect(s.pendingChoice?.options.map((o) => o.id)).toContain("draw-sabotage");
    const chosen = must(s, { type: "choose_option", optionId: "draw-sabotage" });
    expect(chosen.pendingSabotage?.amount).toBe(2);

    const none = must(structuredClone(chosen), {
      type: "resolve_sabotage",
      hqCardIds: [],
    });
    expect(none.corp.hand).toEqual(hq);
    expect(none.corp.deck).toHaveLength(28);
    expect(none.corp.discardPile).toContain(rdTop);
    expect(none.cards[rdTop]?.faceup).toBe(false);

    const oneId = hq[1]!;
    const one = must(structuredClone(chosen), {
      type: "resolve_sabotage",
      hqCardIds: [oneId],
    });
    expect(one.corp.hand).toEqual([hq[0]!]);
    expect(one.corp.deck).toHaveLength(29);
    expect(one.cards[oneId]?.zone).toBe("corp:archives");
    expect(one.cards[oneId]?.faceup).toBe(false);

    const both = must(structuredClone(chosen), {
      type: "resolve_sabotage",
      hqCardIds: [...hq],
    });
    expect(both.corp.hand).toEqual([]);
    expect(both.corp.deck).toHaveLength(30);
    expect(both.cards[hq[0]!]?.zone).toBe("corp:archives");
    expect(both.cards[hq[1]!]?.zone).toBe("corp:archives");
  });


    it("requires at least 2 HQ cards for Chastushka's sabotage 4 (CR 10.12.3b.ex2)", () => {
    let s = createInitialState();
    const event = instantiateCard("chastushka", "ch-1", "runner:grip");
    s.cards["ch-1"] = event;
    s.runner.hand = ["ch-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    runnerTurn(s);
    s.servers.hq.ice = [];
    setCorpPile(s, 5, 2);
    const hq = [...s.corp.hand];
    s = must(s, { type: "play_event", cardId: "ch-1", serverId: "hq" });
    expect(s.pendingSabotage?.amount).toBe(4);
    const short = applyAction(s, {
      type: "resolve_sabotage",
      hqCardIds: [hq[4]!],
    });
    expect(short.ok).toBe(false);
    const paid = must(s, {
      type: "resolve_sabotage",
      hqCardIds: [hq[3]!, hq[4]!],
    });
    expect(paid.corp.hand).toHaveLength(3);
    expect(paid.corp.deck).toHaveLength(0);
    expect(paid.cards[hq[3]!]?.faceup).toBe(false);
    expect(paid.cards[hq[4]!]?.faceup).toBe(false);
    expect(paid.pendingSabotage).toBeNull();
  });


    it("trashes all of HQ and R&D for Chastushka's sabotage 4 (CR 10.12.3b.ex3)", () => {
    let s = createInitialState();
    const event = instantiateCard("chastushka", "ch-2", "runner:grip");
    s.cards["ch-2"] = event;
    s.runner.hand = ["ch-2"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    runnerTurn(s);
    s.servers.hq.ice = [];
    setCorpPile(s, 2, 1);
    s = must(s, { type: "play_event", cardId: "ch-2", serverId: "hq" });
    expect(s.pendingSabotage?.amount).toBe(4);
    s = must(s, { type: "resolve_sabotage", hqCardIds: [] });
    expect(s.corp.hand).toEqual([]);
    expect(s.corp.deck).toEqual([]);
    expect(s.pendingSabotage).toBeNull();
    expect(s.log.join("\n")).toContain("trash all");
  });


    it("places 4 agenda counters on Embedded Reporting scored with 5 advancements (CR 10.13.1.ex1)", () => {
    let s = createInitialState();
    const agenda = instantiateCard(
      "embedded-reporting",
      "er-1",
      "server:remote-1:root",
    );
    agenda.advancementCounters = 5;
    s.cards["er-1"] = agenda;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["er-1"],
    };
    s.corp.clicks = 3;
    s.corp.credits = 5;
    s.activeSide = "corp";
    s.timingKey = "corp.actionPaw";
    s = must(s, { type: "score_agenda", cardId: "er-1" });
    expect(s.corp.scoreArea).toContain("er-1");
    expect(s.cards["er-1"]?.agendaCounters).toBe(4);
    expect(s.cards["er-1"]?.advancementCounters ?? 0).toBe(0);
  });


  it("uses the effective advancement requirement before the agenda moves (CR 10.13.2.ex1)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const agenda = instantiateCard(
      "project-ingatan",
      "ingatan-2",
      "server:remote-2:root",
    );
    agenda.onScore = fx.dividends(1);
    agenda.advancementCounters = 3;
    s.cards["ingatan-2"] = agenda;

    const sansan = instantiateCard(
      "sansan-city-grid",
      "sansan-1",
      "server:remote-2:root",
    );
    sansan.rezzed = true;
    s.cards["sansan-1"] = sansan;

    s.servers["remote-2"] = {
      id: "remote-2",
      kind: "remote",
      ice: [],
      root: ["ingatan-2", "sansan-1"],
    };
    s.corp.clicks = 3;
    s.corp.credits = 10;
    s.activeSide = "corp";
    s.timingKey = "corp.actionPaw";

    // Printed req 3, SanSan −1 → effective 2; 3 advancements → 1 excess.
    s = must(s, { type: "score_agenda", cardId: "ingatan-2" });
    expect(s.cards["ingatan-2"].scoreBeginAdvancementRequirement).toBe(2);
    expect(s.cards["ingatan-2"].agendaCounters).toBe(1);
    expect(s.cards["ingatan-2"].advancementCounters ?? 0).toBe(0);
  });


  it("lets the Runner bid a hosted credit and not a credit they cannot spend (CR 10.14.3.ex1)", () => {
    let s = createInitialState();
    const fencer = instantiateCard("fencer-fueno", "fen-1", "runner:installed");
    fencer.hostedCredits = 1;
    const adrian = instantiateCard("adrian-seis", "adrian-1", "server:hq:root");
    adrian.rezzed = true;
    s.cards["fen-1"] = fencer;
    s.cards["adrian-1"] = adrian;
    s.runner.installed = ["fen-1"];
    s.runner.credits = 0;
    s.corp.credits = 5;
    s.run = {
      attackedServerId: "hq",
      phase: "success",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    const opened = evalEffect(
      { state: s, sourceId: "adrian-1" },
      { op: "do", action: { kind: "play_psi_game", maxBid: 2 } },
    );
    expect(opened.ok).toBe(true);
    const bids = legalActions(s)
      .filter((action) => action.type === "psi_runner_bid")
      .map((action) => action.amount);
    expect(bids).toEqual([0, 1]);
    s = must(s, { type: "psi_runner_bid", amount: 1 });
    const bid = at(s.log, "Runner bids 1¢");
    expect(s.log[bid]).toContain(CR.bidPossible.number);
    expect(s.cards["fen-1"]!.hostedCredits).toBe(1);
    expect(s.runner.credits).toBe(0);
    expect(s.psi?.runnerBid).toBe(1);
    s = must(s, { type: "psi_corp_bid", amount: 0 });
    expect(s.log.some((line) => line.includes("Spend 1¢ from Fencer Fueno"))).toBe(
      true,
    );
    expect(s.log.join("\n")).toContain(CR.psiRevealSpend.number);
    expect(s.cards["fen-1"]!.hostedCredits).toBe(0);

    s.psi = null;
    s.run.runnerCannotSpendCreditsForRun = true;
    s.cards["fen-1"]!.hostedCredits = 1;
    s.runner.credits = 5;
    evalEffect(
      { state: s, sourceId: "adrian-1" },
      { op: "do", action: { kind: "play_psi_game", maxBid: 2 } },
    );
    const locked = legalActions(s)
      .filter((action) => action.type === "psi_runner_bid")
      .map((action) => action.amount);
    expect(locked).toEqual([0]);
  });


    it("forces a later bid to 0 after RSVP's subroutine (CR 10.14.3.ex2)", () => {
    const open = createInitialState();
    open.runner.credits = 5;
    open.run = {
      attackedServerId: "hq",
      phase: "success",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    const before = evalEffect(
      { state: open, sourceId: "corp-id" },
      fx.do({ kind: "play_psi_game", maxBid: 2 }),
    );
    expect(before.ok).toBe(true);
    const paid = must(open, { type: "psi_runner_bid", amount: 1 });
    expect(paid.psi?.runnerBid).toBe(1);

    const s = createInitialState();
    const rsvp = instantiateCard("rsvp", "rsvp-1", "server:hq:ice");
    rsvp.rezzed = true;
    s.cards["rsvp-1"] = rsvp;
    s.runner.credits = 5;
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: { iceId: "rsvp-1", broken: [false] },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    const sub = rsvp.subroutines?.[0]?.effect;
    if (!sub) throw new Error("RSVP subroutine missing");
    const resolved = evalEffect({ state: s, sourceId: "rsvp-1" }, sub);
    expect(resolved.ok).toBe(true);
    expect(s.run?.runnerCannotSpendCreditsForRun).toBe(true);
    const opened = evalEffect(
      { state: s, sourceId: "rsvp-1" },
      fx.do({ kind: "play_psi_game", maxBid: 2 }),
    );
    expect(opened.ok).toBe(true);
    const blocked = applyAction(s, { type: "psi_runner_bid", amount: 1 });
    expect(blocked.ok).toBe(false);
    const zero = must(s, { type: "psi_runner_bid", amount: 0 });
    expect(zero.psi?.runnerBid).toBe(0);
    expect(zero.runner.credits).toBe(5);
  });


});
