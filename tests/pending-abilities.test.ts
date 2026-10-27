/**
 * Pending ability instances, checkpoint diffs, reaction windows, lingering
 * registry, and damage expected-effects (CR 9.6 / 9.9.2 / 9.10 / 10.3).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  CR,
  addLingeringEffect,
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  captureCheckpointFacts,
  cardsDataPresent,
  commitCheckpointSnapshot,
  createInitialState,
  autoWalk,
  createPendingAbilityInstance,
  crDataPresent,
  diffAgainstPreviousCheckpoint,
  enterStep,
  evalEffect,
  expireLingeringEffects,
  fx,
  instantiateCard,
  markPendingAbilityImminent,
  occurCheckpoint,
  openPendingTags,
  pendingAbilitiesWithStatus,
  preventPendingTags,
} from "../src/index.js";
import { dealDamage, preventPendingDamage } from "../src/state/damage.js";
import { resetPendingAbilitySeqForTests } from "../src/state/pendingAbilities.js";
import { resetLingeringSeqForTests } from "../src/state/lingeringEffects.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.13");
});

describe("checkpoint snapshot / diff (CR 10.3.1a / 9.6.6a)", () => {
  it("records facts at a checkpoint and diffs the next change", () => {
    const s = createInitialState();
    expect(s.previousCheckpointSnapshot).toBeNull();

    occurCheckpoint(
      s,
      "instruction",
      "test",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(s.previousCheckpointSnapshot).not.toBeNull();
    expect(s.previousCheckpointSnapshot?.facts.corpCredits).toBe(s.corp.credits);

    const before = s.corp.credits;
    s.corp.credits += 3;
    const diff = diffAgainstPreviousCheckpoint(s);
    expect(diff.corpCreditsDelta).toBe(3);
    expect(diff.runnerCreditsDelta).toBe(0);

    commitCheckpointSnapshot(s, "manual");
    expect(s.previousCheckpointSnapshot?.facts.corpCredits).toBe(before + 3);
    expect(diffAgainstPreviousCheckpoint(s).corpCreditsDelta).toBe(0);
  });

  it("reports zone changes against the previous snapshot (CR 9.6.6a)", () => {
    const s = createInitialState();
    commitCheckpointSnapshot(s, null);
    const facts = captureCheckpointFacts(s);
    expect(Object.keys(facts.cardZones).length).toBeGreaterThan(0);

    const cardId = Object.keys(s.cards)[0]!;
    const prevZone = s.cards[cardId]!.zone;
    s.cards[cardId]!.zone = "removed-from-game";
    const diff = diffAgainstPreviousCheckpoint(s);
    expect(diff.zoneChangedIds).toContain(cardId);
    s.cards[cardId]!.zone = prevZone;
  });
});

describe("pending ability instances (CR 9.6.2 / 9.6.12)", () => {
  it("creates pending instances and marks them independent when imminent", () => {
    resetPendingAbilitySeqForTests();
    const s = createInitialState();
    const inst = createPendingAbilityInstance(s, {
      abilityKey: "test:conditional",
      sourceId: s.runner.identityId,
      controller: "runner",
      mandatory: false,
    });
    expect(inst.status).toBe("pending");
    expect(inst.independentOfSource).toBe(false);
    expect(pendingAbilitiesWithStatus(s)).toHaveLength(1);

    markPendingAbilityImminent(s, inst.id);
    expect(inst.status).toBe("imminent");
    expect(inst.independentOfSource).toBe(true);
    expect(
      s.log.some((line) =>
        line.includes(CR.conditionalAbilityIndependent.number),
      ),
    ).toBe(true);
  });

  it("opens a reaction window with a fixed pending set (CR 9.2.8a / 10.3.2)", () => {
    resetPendingAbilitySeqForTests();
    const s = createInitialState();
    const a = createPendingAbilityInstance(s, {
      abilityKey: "test:a",
      sourceId: s.corp.identityId,
      controller: "corp",
      mandatory: true,
    });
    const b = createPendingAbilityInstance(s, {
      abilityKey: "test:b",
      sourceId: s.runner.identityId,
      controller: "runner",
      mandatory: false,
    });

    occurCheckpoint(
      s,
      "instruction",
      "with pending",
      [CR.checkpointConditionalAbilities],
      "test",
    );

    expect(
      s.log.some((line) =>
        line.includes(`Reaction window (CR ${CR.checkpointReaction.number})`),
      ),
    ).toBe(true);
    expect(
      s.log.some((line) => line.includes(CR.reactionWindowFixedSet.number)),
    ).toBe(true);
    expect(s.reactionStack).toHaveLength(0);
    expect(s.pendingAbilities.find((p) => p.id === a.id)).toBeUndefined();
    expect(s.pendingAbilities.find((p) => p.id === b.id)).toBeUndefined();
  });
});

describe("lingering effect registry (CR 9.10.1)", () => {
  it("creates independent lingerings and removes them at 10.3.1b", () => {
    resetLingeringSeqForTests();
    const s = createInitialState();
    const effect = addLingeringEffect(s, {
      createdBy: s.runner.identityId,
      duration: { kind: "until_checkpoint" },
      kind: "test-boost",
      payload: { amount: 1 },
    });
    expect(effect.independent).toBe(true);
    expect(s.lingeringEffects).toHaveLength(1);
    expect(
      s.log.some((line) => line.includes(CR.lingeringEffect.number)),
    ).toBe(true);

    expireLingeringEffects(s, { untilCheckpoint: true });
    expect(s.lingeringEffects).toHaveLength(0);
  });

  it("expires turn-duration lingerings only for the ended side", () => {
    resetLingeringSeqForTests();
    const s = createInitialState();
    addLingeringEffect(s, {
      createdBy: s.corp.identityId,
      duration: { kind: "turn", side: "corp" },
      kind: "corp-turn",
    });
    addLingeringEffect(s, {
      createdBy: s.runner.identityId,
      duration: { kind: "turn", side: "runner" },
      kind: "runner-turn",
    });
    expireLingeringEffects(s, { turn: "corp" });
    expect(s.lingeringEffects.map((e) => e.kind)).toEqual(["runner-turn"]);
  });
});

describe("draw on-draw pending (CR 8.4.5a / 10.3.1a / 10.3.2)", () => {
  it("marks Find the Truth pending at the draw checkpoint, then reveals in the reaction window", () => {
    let s = createInitialState();
    const truth = instantiateCard("find-the-truth", "ftt-1", "runner:installed");
    s.cards["ftt-1"] = truth;
    s.runner.installed.push("ftt-1");
    const topId = s.runner.deck[0]!;
    const title = s.cards[topId]!.title;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 1;

    const r = applyAction(s, { type: "basic_draw" });
    if (!r.ok) throw new Error(r.error);
    s = r.state;

    const checked = s.log.findIndex((line) =>
      line.includes("Conditional abilities checked"),
    );
    expect(checked).toBeGreaterThanOrEqual(0);
    expect(s.log[checked]).toContain("marked pending");
    expect(s.log[checked]).toContain(CR.pendingInstances.number);

    const window = s.log.findIndex((line) =>
      line.includes(`Reaction window (CR ${CR.checkpointReaction.number})`),
    );
    const reveal = s.log.findIndex((line) =>
      line.includes(`Find the Truth — reveal drawn card: ${title}`),
    );
    expect(window).toBeGreaterThanOrEqual(0);
    expect(reveal).toBeGreaterThan(window);
    expect(s.pendingAbilities).toHaveLength(0);
  });
});

describe("simultaneous trash multiplicity (CR 9.12.2a)", () => {
  it("marks Hostile Infrastructure twice and Warroid once, then resolves via a reaction window", () => {
    let s = createInitialState();
    const hi = instantiateCard(
      "hostile-infrastructure",
      "hi-1",
      "server:remote-1:root",
    );
    hi.rezzed = true;
    hi.faceup = true;
    const warroid = instantiateCard(
      "warroid-tracker",
      "war-1",
      "server:remote-1:root",
    );
    warroid.rezzed = true;
    warroid.faceup = true;
    const sing = instantiateCard("singularity", "sing-1", "runner:play-area");
    for (const card of [hi, warroid, sing]) s.cards[card.id] = card;
    s.runner.hand = ["grip-0", "grip-1"];
    for (const id of s.runner.hand) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    }
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["hi-1", "war-1"],
    };
    s.run = {
      attackedServerId: "remote-1",
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
    s.activeSide = "runner";

    const opened = evalEffect(
      { state: s, sourceId: "sing-1" },
      fx.do({ kind: "breach_instead_singularity_trash_root" }),
    );
    expect(opened.ok).toBe(true);
    const r = applyAction(s, { type: "choose_option", optionId: "singularity" });
    if (!r.ok) throw new Error(r.error);
    s = r.state;

    const hiPending = s.log.findIndex((line) =>
      line.includes(
        "Hostile Infrastructure remains active — 2 instances become pending",
      ),
    );
    const warPending = s.log.findIndex((line) =>
      line.includes(
        "Warroid Tracker — one instance becomes pending for this trash",
      ),
    );
    const windowOpen = s.log.findIndex(
      (line, i) => i > hiPending && line.includes("Reaction window open"),
    );
    expect(hiPending).toBeGreaterThanOrEqual(0);
    expect(warPending).toBeGreaterThan(hiPending);
    expect(windowOpen).toBeGreaterThan(warPending);
    expect(s.log.filter((line) => line.startsWith("net damage 1:")).length).toBe(
      2,
    );
    expect(s.pendingAbilities).toHaveLength(0);
    expect(s.reactionStack).toHaveLength(0);
  });
});

describe("interrupt expected effects (CR 9.9.2)", () => {
  it("tracks expected tags and updates them as they are prevented", () => {
    const s = createInitialState();
    openPendingTags(s, 2, s.corp.identityId);
    expect(s.pendingTags?.expectedEffects?.tags).toEqual({ amount: 2 });
    preventPendingTags(s, 1);
    expect(s.pendingTags?.expectedEffects?.tags).toEqual({ amount: 1 });
  });
});

describe("storedTriggers pending bag (CR 9.6.2)", () => {
  it("marks onAgendaScored pending when an agenda is scored", async () => {
    const { scoreAgendaAction } = await import("../src/actions/score.js");
    const s = createInitialState();
    const agenda = instantiateCard(
      "hostile-takeover",
      "ag-1",
      "server:remote-1:root",
    );
    agenda.advancementCounters = agenda.advancementRequirement ?? 2;
    const marrow = instantiateCard("marrow", "mar-1", "runner:installed");
    s.cards["ag-1"] = agenda;
    s.cards["mar-1"] = marrow;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["ag-1"],
    };
    s.runner.installed = ["mar-1"];
    s.activeSide = "corp";
    s.timingKey = "corp.actionPaw";
    const result = scoreAgendaAction(s, "ag-1");
    expect(result.ok).toBe(true);
    expect(
      s.log.some(
        (line) => line.includes("Marrow") && line.includes("becomes pending"),
      ),
    ).toBe(true);
  });

  it("marks onEncounter pending when resolving a deferred encounter", async () => {
    const { resolvePendingOnEncounter } = await import(
      "../src/state/onEncounter.js"
    );
    const s = createInitialState();
    const ice = instantiateCard("pop-up-window", "pop-1", "server:hq:ice");
    ice.rezzed = true;
    s.cards["pop-1"] = ice;
    s.servers.hq.ice = ["pop-1"];
    s.run = {
      serverId: "hq",
      position: 0,
      successful: false,
      ended: false,
      encounter: {
        iceId: "pop-1",
        onEncounterPending: true,
        onEncounterPrevented: false,
      },
    } as typeof s.run;
    resolvePendingOnEncounter(s);
    expect(
      s.log.some(
        (line) =>
          line.includes("Pop-up Window") && line.includes("becomes pending"),
      ),
    ).toBe(true);
  });

  it("marks onFirstEmptyGrip pending when the grip empties", async () => {
    const { maybeFireFirstEmptyGripTriggers } = await import(
      "../src/state/damage.js"
    );
    const s = createInitialState();
    const respiro = instantiateCard(
      "respirocytes",
      "resp-1",
      "runner:installed",
    );
    s.cards["resp-1"] = respiro;
    s.runner.installed = ["resp-1"];
    s.runner.hand = [];
    maybeFireFirstEmptyGripTriggers(s);
    expect(
      s.log.some(
        (line) =>
          line.includes("Respirocytes") && line.includes("becomes pending"),
      ),
    ).toBe(true);
  });

  it("marks onTrash pending when a Runner card hits the heap", async () => {
    const { moveRunnerCardToHeap } = await import("../src/state/trashHooks.js");
    const s = createInitialState();
    const rolodex = instantiateCard("rolodex", "rolo-1", "runner:installed");
    s.cards["rolo-1"] = rolodex;
    s.runner.installed = ["rolo-1"];
    moveRunnerCardToHeap(s, "rolo-1");
    expect(
      s.log.some(
        (line) => line.includes("Rolodex") && line.includes("becomes pending"),
      ),
    ).toBe(true);
  });

  it("marks MirrorMorph pending on the third distinct Corp action", async () => {
    const { noteCorpActionType } = await import(
      "../src/state/corpActionHooks.js"
    );
    const s = createInitialState();
    const morph = instantiateCard(
      "mirrormorph-endless-iteration",
      "mm-1",
      "corp:identity",
    );
    s.cards["mm-1"] = morph;
    s.corp.identityId = "mm-1";
    s.activeSide = "corp";
    noteCorpActionType(s, "draw");
    noteCorpActionType(s, "gain");
    noteCorpActionType(s, "click_ability");
    const pending = s.log.findIndex((line) =>
      line.includes("MirrorMorph") && line.includes("becomes pending"),
    );
    expect(pending).toBeGreaterThanOrEqual(0);
    expect(s.log.some((line) => line.includes("Reaction window open"))).toBe(
      true,
    );
  });

  it("marks Jackpot! pending when an agenda is added to the Runner score area", async () => {
    const { fireOnAgendaAddedToRunnerScore } = await import(
      "../src/state/trashHooks.js"
    );
    const s = createInitialState();
    const jackpot = instantiateCard("jackpot", "jp-1", "runner:installed");
    const agenda = instantiateCard("hostile-takeover", "ht-1", "runner:score");
    s.cards["jp-1"] = jackpot;
    s.cards["ht-1"] = agenda;
    s.runner.installed = ["jp-1"];
    s.runner.scoreArea = ["ht-1"];
    s.runner.credits = 0;

    fireOnAgendaAddedToRunnerScore(s);

    const pending = s.log.findIndex((line) =>
      line.includes("Jackpot! becomes pending"),
    );
    const windowOpen = s.log.findIndex(
      (line, i) => i > pending && line.includes("Reaction window open"),
    );
    expect(pending).toBeGreaterThanOrEqual(0);
    expect(windowOpen).toBeGreaterThan(pending);
    expect(s.pendingAbilities).toHaveLength(0);
  });

  it("marks NeoTokyo Grid pending on the first advancement in its server", () => {
    let s = createInitialState();
    const grid = instantiateCard("neotokyo-grid", "neo-1", "server:hq:root");
    grid.rezzed = true;
    const agenda = instantiateCard(
      "priority-requisition",
      "ag-1",
      "server:hq:root",
    );
    s.cards["neo-1"] = grid;
    s.cards["ag-1"] = agenda;
    s.servers.hq.root = ["neo-1", "ag-1"];
    s.corp.credits = 5;
    s.corp.clicks = 2;
    s.activeSide = "corp";
    s.timingKey = "corp.action";
    const r = applyAction(s, { type: "advance", cardId: "ag-1" });
    if (!r.ok) throw new Error(r.error);
    s = r.state;

    const pending = s.log.findIndex((line) =>
      line.includes("NeoTokyo Grid becomes pending"),
    );
    const windowOpen = s.log.findIndex(
      (line, i) => i > pending && line.includes("Reaction window open"),
    );
    expect(pending).toBeGreaterThanOrEqual(0);
    expect(windowOpen).toBeGreaterThan(pending);
    expect(s.corp.credits).toBe(5);
    expect(s.pendingAbilities).toHaveLength(0);
  });
});

describe("Bug on Corp draw pending (CR 8.4.1)", () => {
  it("marks Bug pending when the Corp draws, then opens its may-pay choice", () => {
    const s = createInitialState();
    const bug = instantiateCard("bug", "bug-1", "runner:installed");
    const top = instantiateCard("hedge-fund", "hf-1", "corp:rd");
    s.cards["bug-1"] = bug;
    s.cards["hf-1"] = top;
    s.runner.installed = ["bug-1"];
    s.corp.deck = ["hf-1"];
    s.corp.hand = [];
    s.runner.credits = 5;

    const drawn = evalEffect(
      { state: s, sourceId: "bug-1" },
      fx.do({ kind: "draw", side: "corp", amount: 1 }),
    );
    expect(drawn.ok).toBe(true);

    const pending = s.log.findIndex((line) =>
      line.includes("Bug becomes pending"),
    );
    const windowOpen = s.log.findIndex(
      (line, i) => i > pending && line.includes("Reaction window open"),
    );
    expect(pending).toBeGreaterThanOrEqual(0);
    expect(s.log[pending]).toContain(CR.drawing.number);
    expect(windowOpen).toBeGreaterThan(pending);
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(s.turn.pendingCorpDrawnCardId).toBe("hf-1");
    expect(s.pendingAbilities).toHaveLength(0);
    expect(s.reactionStack).toHaveLength(0);
  });
});

describe("Amaze run-end pending (CR 9.12.5d)", () => {
  it("marks Amaze pending at run end and gives tags in a reaction window", () => {
    const s = createInitialState();
    const amaze = instantiateCard(
      "amaze-amusements",
      "amaze-1",
      "corp:archives",
    );
    amaze.rezzed = false;
    amaze.faceup = true;
    s.cards["amaze-1"] = amaze;
    s.corp.discardPile.push("amaze-1");
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
      persistentAmazeSourceId: "amaze-1",
    };
    enterStep(s, "run.ends");
    autoWalk(s);

    const persists = s.log.findIndex((line) =>
      line.includes("persists for this run end"),
    );
    const windowOpen = s.log.findIndex(
      (line, i) => i > persists && line.includes("Reaction window open"),
    );
    expect(persists).toBeGreaterThanOrEqual(0);
    expect(s.log[persists]).toContain(CR.persistentAbility.number);
    expect(windowOpen).toBeGreaterThan(persists);
    expect(s.runner.tags).toBe(2);
    expect(s.pendingAbilities).toHaveLength(0);
    expect(s.reactionStack).toHaveLength(0);
    expect(s.run).toBeNull();
  });
});

describe("Chum run-ends pending (CR 6.8.5)", () => {
  it("resolves Chum pending net damage in a reaction window at run complete", () => {
    const s = createInitialState();
    const wall = instantiateCard("wall-of-static", "wall-1", "server:hq:ice");
    s.cards["wall-1"] = wall;
    s.servers.hq.ice = ["wall-1"];
    s.runner.hand = [
      "runner-program-1",
      "runner-fill-1",
      "runner-fill-2",
      "runner-fill-3",
    ];
    createPendingAbilityInstance(s, {
      abilityKey: "chum:net-on-run-end",
      sourceId: "wall-1",
      controller: "corp",
      mandatory: true,
      payload: { kind: "chum_net_damage", amount: 3 },
    });
    s.run = {
      attackedServerId: "hq",
      phase: "ends",
      position: null,
      successful: false,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: true,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      lastEncounteredIceId: "wall-1",
    };
    enterStep(s, "run.declareUnsuccessful");
    autoWalk(s);

    const windowOpen = s.log.findIndex((line) =>
      line.includes("Reaction window open"),
    );
    expect(windowOpen).toBeGreaterThanOrEqual(0);
    expect(s.log.some((line) => line.includes("net damage 3"))).toBe(true);
    expect(s.runner.hand).toHaveLength(1);
    expect(s.pendingAbilities).toHaveLength(0);
    expect(s.reactionStack).toHaveLength(0);
    expect(s.run).toBeNull();
  });
});

describe("Geist chain reaction pending (CR 9.1.2a)", () => {
  it("marks Geist pending after a trash cost, then draws in a nested reaction window", async () => {
    const { resolveGeistAfterTrashCost } = await import(
      "../src/actions/paidAbility.js"
    );
    const s = createInitialState();
    const geist = instantiateCard(
      "armand-geist-walker-tech-lord",
      "geist-1",
      "runner:identity",
    );
    const decoy = instantiateCard("decoy", "decoy-1", "runner:installed");
    const top = instantiateCard("sure-gamble", "stack-1", "runner:stack");
    s.cards["geist-1"] = geist;
    s.cards["decoy-1"] = decoy;
    s.cards["stack-1"] = top;
    s.runner.identityId = "geist-1";
    s.runner.installed = ["decoy-1"];
    s.runner.hand = [];
    s.runner.deck = ["stack-1"];

    resolveGeistAfterTrashCost(s, decoy, { trashSelf: true });

    const pending = s.log.findIndex(
      (line) => line.includes("Geist") && line.includes("becomes pending"),
    );
    const windowOpen = s.log.findIndex(
      (line, i) => i > pending && line.includes("Reaction window open"),
    );
    const aside = s.log.findIndex(
      (line, i) => i > windowOpen && line.includes("Set aside 1"),
    );
    const windowClose = s.log.findIndex(
      (line, i) => i > aside && line.includes("Reaction window close"),
    );
    expect(pending).toBeGreaterThanOrEqual(0);
    expect(s.log[pending]).toContain(CR.chainReaction.number);
    expect(windowOpen).toBeGreaterThan(pending);
    expect(aside).toBeGreaterThan(windowOpen);
    expect(windowClose).toBeGreaterThan(aside);
    expect(s.runner.hand).toEqual(["stack-1"]);
    expect(s.pendingAbilities).toHaveLength(0);
    expect(s.reactionStack).toHaveLength(0);
  });
});

describe("search pending (CR 8.7.5)", () => {
  it("marks Personality Profiles pending after shuffle, then trashes before the found card is revealed", () => {
    let s = createInitialState();
    const profiles = instantiateCard("personality-profiles", "pp-1", "corp:score");
    const ev = instantiateCard("special-order", "so-1", "runner:grip");
    const gamble = instantiateCard("sure-gamble", "sg-1", "runner:grip");
    const breaker = instantiateCard("corroder", "co-1", "runner:stack");
    s.cards["pp-1"] = profiles;
    s.cards["so-1"] = ev;
    s.cards["sg-1"] = gamble;
    s.cards["co-1"] = breaker;
    s.corp.scoreArea = ["pp-1"];
    s.runner.hand = ["so-1", "sg-1"];
    s.runner.deck = ["co-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    let r = applyAction(s, { type: "play_event", cardId: "so-1" });
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    r = applyAction(s, { type: "choose_option", optionId: "search-find:co-1" });
    if (!r.ok) throw new Error(r.error);
    s = r.state;

    const shuffled = s.log.findIndex((line) => line.includes("Stack shuffled"));
    const pending = s.log.findIndex((line) =>
      line.includes("Personality Profiles becomes pending"),
    );
    const windowOpen = s.log.findIndex(
      (line, i) =>
        i > pending && line.includes("Reaction window open"),
    );
    const trashed = s.log.findIndex((line) =>
      line.includes("trashes Sure Gamble from grip"),
    );
    expect(shuffled).toBeGreaterThanOrEqual(0);
    expect(pending).toBeGreaterThan(shuffled);
    expect(windowOpen).toBeGreaterThan(pending);
    expect(trashed).toBeGreaterThan(windowOpen);
    expect(s.log[pending]).toContain(CR.searchCondition.number);
    expect(s.pendingAbilities).toHaveLength(0);
    expect(s.reactionStack).toHaveLength(0);
  });
});

describe("card lifecycle conditionals pending (CR 9.6.2)", () => {
  it("marks onInstall / onRez / onPlay / onAccess / onBreakSubroutine / onBypass pending", async () => {
    const {
      fireOnAccess,
      fireOnBreakSubroutineTriggers,
      fireOnInstall,
      fireOnPlay,
      fireOnRez,
    } = await import("../src/state/cardLifecycleHooks.js");
    const { fireOnBypassTriggers } = await import("../src/state/iceRezHooks.js");

    const s = createInitialState();
    const asset = instantiateCard("pad-campaign", "pad-1", "server:hq:root");
    asset.onInstall = fx.do({ kind: "gain_credits", side: "corp", amount: 1 });
    asset.onRez = fx.do({ kind: "gain_credits", side: "corp", amount: 1 });
    asset.onPlay = fx.do({ kind: "gain_credits", side: "corp", amount: 1 });
    asset.onAccess = fx.do({ kind: "gain_credits", side: "corp", amount: 1 });
    asset.onBypass = fx.do({ kind: "gain_credits", side: "corp", amount: 1 });
    const breaker = instantiateCard("corroder", "cor-1", "runner:installed");
    breaker.onBreakSubroutine = fx.do({
      kind: "gain_credits",
      side: "runner",
      amount: 1,
    });
    s.cards["pad-1"] = asset;
    s.cards["cor-1"] = breaker;
    s.servers.hq.root = ["pad-1"];
    s.runner.installed = ["cor-1"];
    s.corp.credits = 0;
    s.runner.credits = 0;

    fireOnInstall(s, "pad-1");
    expect(
      s.log.some((line) => line.includes("PAD Campaign becomes pending — installed")),
    ).toBe(true);
    expect(s.corp.credits).toBe(1);

    fireOnRez(s, "pad-1");
    expect(
      s.log.some((line) => line.includes("PAD Campaign becomes pending — rezzed")),
    ).toBe(true);
    expect(s.corp.credits).toBe(2);

    fireOnPlay(s, "pad-1");
    expect(
      s.log.some((line) => line.includes("PAD Campaign becomes pending — played")),
    ).toBe(true);
    expect(s.corp.credits).toBe(3);

    fireOnAccess(s, "pad-1");
    expect(
      s.log.some((line) => line.includes("PAD Campaign becomes pending — accessed")),
    ).toBe(true);
    expect(s.corp.credits).toBe(4);

    fireOnBreakSubroutineTriggers(s);
    expect(
      s.log.some((line) =>
        line.includes("Corroder becomes pending — subroutine broken"),
      ),
    ).toBe(true);
    expect(s.runner.credits).toBe(1);

    fireOnBypassTriggers(s, "pad-1");
    expect(
      s.log.some((line) => line.includes("PAD Campaign becomes pending — bypassed")),
    ).toBe(true);
    expect(s.corp.credits).toBe(5);
    expect(s.pendingAbilities).toHaveLength(0);
    expect(s.reactionStack).toHaveLength(0);
  });

  it("marks onSteal / onStealAgenda / onFullyBreak / onEncounterEnd / onScore pending", async () => {
    const {
      fireAfterAgendaStolenHooks,
      fireOnEncounterEnd,
      fireOnFullyBreak,
      fireOnScore,
      fireOnSteal,
    } = await import("../src/state/cardLifecycleHooks.js");

    const s = createInitialState();
    const agenda = instantiateCard("hostile-takeover", "ht-1", "runner:score");
    agenda.onSteal = fx.do({ kind: "gain_credits", side: "runner", amount: 1 });
    agenda.onScore = fx.do({ kind: "gain_credits", side: "corp", amount: 1 });
    const maemi = instantiateCard("mystic-maemi", "mm-1", "runner:installed");
    maemi.onStealAgenda = fx.do({
      kind: "gain_credits",
      side: "runner",
      amount: 1,
    });
    const ice = instantiateCard("ice-wall", "iw-1", "server:hq:ice");
    ice.onFullyBreak = fx.do({ kind: "gain_credits", side: "corp", amount: 1 });
    ice.onEncounterEnd = fx.do({
      kind: "gain_credits",
      side: "corp",
      amount: 1,
    });
    s.cards["ht-1"] = agenda;
    s.cards["mm-1"] = maemi;
    s.cards["iw-1"] = ice;
    s.runner.scoreArea = ["ht-1"];
    s.runner.installed = ["mm-1"];
    s.servers.hq.ice = ["iw-1"];
    s.corp.credits = 0;
    s.runner.credits = 0;

    fireOnSteal(s, "ht-1");
    expect(
      s.log.some((line) => line.includes("Hostile Takeover becomes pending — stolen")),
    ).toBe(true);
    expect(s.runner.credits).toBe(1);

    fireAfterAgendaStolenHooks(s, "ht-1");
    expect(
      s.log.some((line) => line.includes("Mystic Maemi becomes pending — agenda stolen")),
    ).toBe(true);
    expect(s.runner.credits).toBe(2);

    fireOnFullyBreak(s, "iw-1");
    expect(
      s.log.some((line) =>
        line.includes("Ice Wall becomes pending — ice fully broken"),
      ),
    ).toBe(true);
    expect(s.corp.credits).toBe(1);

    fireOnEncounterEnd(s, "iw-1");
    expect(
      s.log.some((line) =>
        line.includes("Ice Wall becomes pending — encounter ends"),
      ),
    ).toBe(true);
    expect(s.corp.credits).toBe(2);

    fireOnScore(s, "ht-1");
    expect(
      s.log.some((line) => line.includes("Hostile Takeover becomes pending — scored")),
    ).toBe(true);
    expect(s.corp.credits).toBe(3);
    expect(s.pendingAbilities).toHaveLength(0);
  });
});

describe("inline flag conditionals pending (CR 9.6.2)", () => {
  it("marks Franchise City / Builder of Nations / Caïssa pending", async () => {
    const { fireInlineConditional } = await import(
      "../src/state/storedTriggers.js"
    );

    const s = createInitialState();
    const city = instantiateCard("franchise-city", "fc-1", "server:hq:root");
    city.addSelfToCorpScoreOnAgendaAccess = { agendaPoints: 1 };
    city.rezzed = true;
    const bon = instantiateCard(
      "weyland-consortium-builder-of-nations",
      "bon-1",
      "corp:identity",
    );
    bon.firstAdvancedIceEncounterEndMeatDamageEachTurn = true;
    const caissa = instantiateCard("imp", "imp-1", "runner:installed");
    caissa.caissaAdvanceOnSuccessfulRun = true;
    caissa.hostId = "iw-1";
    s.cards["fc-1"] = city;
    s.cards["bon-1"] = bon;
    s.cards["imp-1"] = caissa;
    s.corp.identityId = "bon-1";
    s.servers.hq.root = ["fc-1"];
    s.runner.installed = ["imp-1"];

    fireInlineConditional(
      s,
      "fc-1",
      {
        op: "do",
        action: { kind: "add_to_corp_score_as_agenda", agendaPoints: 1 },
      },
      "add-self-to-corp-score-on-agenda-access",
      `${city.title} becomes pending — agenda accessed (add self to Corp score).`,
      "corp",
    );
    expect(
      s.log.some(
        (line) =>
          line.includes("Franchise City") && line.includes("becomes pending"),
      ),
    ).toBe(true);

    fireInlineConditional(
      s,
      "bon-1",
      { op: "do", action: { kind: "meat_damage", amount: 1 } },
      "first-advanced-ice-encounter-end-meat",
      `${bon.title} becomes pending — first advanced ice encounter ends (meat damage).`,
      "corp",
    );
    expect(
      s.log.some(
        (line) =>
          line.includes("Builder of Nations") &&
          line.includes("becomes pending"),
      ),
    ).toBe(true);

    fireInlineConditional(
      s,
      "imp-1",
      {
        op: "do",
        action: { kind: "advance_caissa_host_inward_or_install" },
      },
      "caissa-advance-on-successful-run",
      `${caissa.title} becomes pending — successful run (Caïssa advance).`,
    );
    expect(
      s.log.some(
        (line) => line.includes("Imp") && line.includes("becomes pending"),
      ),
    ).toBe(true);
  });

  it("marks score/steal flag hooks pending via inline_conditional", async () => {
    const { fireInlineConditional } = await import(
      "../src/state/storedTriggers.js"
    );

    const s = createInitialState();
    const pe = instantiateCard(
      "jinteki-personal-evolution",
      "pe-1",
      "corp:identity",
    );
    pe.netDamageOnAgendaScoredOrStolen = 1;
    const panto = instantiateCard("pantograph", "pan-1", "runner:installed");
    panto.mayInstallOnScoreOrSteal = true;
    s.cards["pe-1"] = pe;
    s.cards["pan-1"] = panto;
    s.corp.identityId = "pe-1";
    s.runner.installed = ["pan-1"];
    s.runner.hand = [];

    fireInlineConditional(
      s,
      "pe-1",
      fx.netDamage(1),
      "net-damage-on-agenda-scored-or-stolen",
      `${pe.title} becomes pending — agenda scored or stolen (net damage).`,
      "corp",
    );
    expect(
      s.log.some(
        (line) =>
          line.includes("Personal Evolution") &&
          line.includes("becomes pending") &&
          line.includes("net damage"),
      ),
    ).toBe(true);

    fireInlineConditional(
      s,
      "pan-1",
      fx.mayInstallFromGrip(),
      "may-install-on-score-or-steal",
      `${panto.title} becomes pending — agenda scored or stolen (may install).`,
    );
    expect(
      s.log.some(
        (line) =>
          line.includes("Pantograph") && line.includes("becomes pending"),
      ),
    ).toBe(true);
  });
});

describe("misc conditionals pending (CR 9.6.2)", () => {
  it("marks leftover timed Effect conditionals pending", async () => {
    const {
      fireAfterMandatoryDraw,
      fireOnBeforeFirstTurn,
      fireOnCorpAbilityCausesRunnerSpendOrLoseCreditsDuringRun,
      fireOnFirstHardwareUseDuringRunEachTurn,
    } = await import("../src/state/miscConditionalHooks.js");
    const { maybeFireSeidrOnClickSpendOrLose } = await import(
      "../src/state/clickHooks.js"
    );

    const s = createInitialState();
    const forum = instantiateCard("open-forum", "of-1", "server:hq:root");
    forum.afterMandatoryDraw = fx.do({
      kind: "gain_credits",
      side: "corp",
      amount: 1,
    });
    const seidr = instantiateCard(
      "seidr-laboratories-destiny-defined",
      "seidr-1",
      "corp:identity",
    );
    seidr.onFirstRunnerClickSpendOrLoseDuringRun = fx.do({
      kind: "gain_credits",
      side: "corp",
      amount: 1,
    });
    seidr.onBeforeFirstTurn = fx.do({
      kind: "gain_credits",
      side: "corp",
      amount: 1,
    });
    seidr.onCorpAbilityCausesRunnerSpendOrLoseCreditsDuringRun = fx.do({
      kind: "gain_credits",
      side: "corp",
      amount: 1,
    });
    const hw = instantiateCard("diesel", "hw-1", "runner:installed");
    hw.onFirstHardwareUseDuringRunEachTurn = fx.do({
      kind: "gain_credits",
      side: "runner",
      amount: 1,
    });
    s.cards["of-1"] = forum;
    s.cards["seidr-1"] = seidr;
    s.cards["hw-1"] = hw;
    s.corp.identityId = "seidr-1";
    s.servers.hq.root = ["of-1"];
    s.runner.installed = ["hw-1"];
    s.corp.credits = 0;
    s.runner.credits = 0;
    s.run = {
      attackedServerId: "hq",
      position: 0,
      successful: false,
      ended: false,
    } as typeof s.run;

    fireAfterMandatoryDraw(s, "of-1");
    expect(
      s.log.some((line) =>
        line.includes("Open Forum becomes pending — after mandatory draw"),
      ),
    ).toBe(true);
    expect(s.corp.credits).toBe(1);

    fireOnBeforeFirstTurn(s, "seidr-1");
    expect(
      s.log.some((line) =>
        line.includes(
          "Seidr Laboratories: Destiny Defined becomes pending — before first turn",
        ),
      ),
    ).toBe(true);
    expect(s.corp.credits).toBe(2);

    maybeFireSeidrOnClickSpendOrLose(s);
    expect(
      s.log.some((line) =>
        line.includes(
          "Seidr Laboratories: Destiny Defined becomes pending — first Runner click spend/lose during a run",
        ),
      ),
    ).toBe(true);
    expect(s.corp.credits).toBe(3);

    fireOnCorpAbilityCausesRunnerSpendOrLoseCreditsDuringRun(s, "seidr-1");
    expect(
      s.log.some((line) =>
        line.includes(
          "Seidr Laboratories: Destiny Defined becomes pending — Corp ability caused Runner to spend or lose credits during a run",
        ),
      ),
    ).toBe(true);
    expect(s.corp.credits).toBe(4);

    fireOnFirstHardwareUseDuringRunEachTurn(s, "hw-1");
    expect(
      s.log.some((line) =>
        line.includes(
          "Diesel becomes pending — first hardware use during a run this turn",
        ),
      ),
    ).toBe(true);
    expect(s.runner.credits).toBe(1);
    expect(s.pendingAbilities).toHaveLength(0);
  });

  it("marks discard / full-break / first-ice-rez / would-draw pending", async () => {
    const {
      fireOnDiscardPhaseEnd,
      fireOnFirstIceRezEachTurn,
      fireOnFullyBreakOncePerTurn,
      fireOnInstallFromNonHq,
      fireOnWouldDrawOncePerTurn,
    } = await import("../src/state/miscConditionalHooks.js");

    const s = createInitialState();
    const discard = instantiateCard("diesel", "d-1", "runner:installed");
    discard.onDiscardPhaseEnd = fx.do({
      kind: "gain_credits",
      side: "runner",
      amount: 1,
    });
    const breaker = instantiateCard("corroder", "c-1", "runner:installed");
    breaker.onFullyBreakOncePerTurn = fx.do({
      kind: "gain_credits",
      side: "runner",
      amount: 1,
    });
    const foundry = instantiateCard(
      "haas-bioroid-stronger-together",
      "id-corp",
      "corp:identity",
    );
    foundry.onFirstIceRezEachTurn = fx.do({
      kind: "gain_credits",
      side: "corp",
      amount: 1,
    });
    const archivesInstall = instantiateCard(
      "pad-campaign",
      "pad-1",
      "server:remote-1:root",
    );
    archivesInstall.onInstallFromNonHq = fx.do({
      kind: "gain_credits",
      side: "corp",
      amount: 1,
    });
    const classAct = instantiateCard("the-class-act", "ca-1", "runner:installed");
    classAct.onWouldDrawOncePerTurn = fx.do({
      kind: "gain_credits",
      side: "runner",
      amount: 1,
    });
    s.cards["d-1"] = discard;
    s.cards["c-1"] = breaker;
    s.cards["id-corp"] = foundry;
    s.cards["pad-1"] = archivesInstall;
    s.cards["ca-1"] = classAct;
    s.runner.installed = ["d-1", "c-1", "ca-1"];
    s.corp.identityId = "id-corp";
    s.corp.credits = 0;
    s.runner.credits = 0;

    fireOnDiscardPhaseEnd(s, ["d-1"]);
    expect(
      s.log.some((line) =>
        line.includes("Diesel becomes pending — discard phase ends"),
      ),
    ).toBe(true);
    expect(s.runner.credits).toBe(1);

    fireOnFullyBreakOncePerTurn(s, "c-1");
    expect(
      s.log.some((line) =>
        line.includes(
          "Corroder becomes pending — ice fully broken (once per turn)",
        ),
      ),
    ).toBe(true);
    expect(s.runner.credits).toBe(2);

    fireOnFirstIceRezEachTurn(s, "id-corp");
    expect(
      s.log.some((line) =>
        line.includes(
          "Haas-Bioroid: Stronger Together becomes pending — first ice rezzed this turn",
        ),
      ),
    ).toBe(true);
    expect(s.corp.credits).toBe(1);

    fireOnInstallFromNonHq(s, "pad-1");
    expect(
      s.log.some((line) =>
        line.includes(
          "PAD Campaign becomes pending — installed from outside HQ",
        ),
      ),
    ).toBe(true);
    expect(s.corp.credits).toBe(2);

    fireOnWouldDrawOncePerTurn(s, "ca-1");
    expect(
      s.log.some((line) =>
        line.includes(
          "The Class Act becomes pending — would draw (once per turn)",
        ),
      ),
    ).toBe(true);
    expect(s.runner.credits).toBe(3);
    expect(s.pendingAbilities).toHaveLength(0);
  });
});

describe("run-timing conditionals pending (CR 9.6.2)", () => {
  it("marks first-encounter / pass / successful-run first-* pending", async () => {
    const {
      fireOnFirstEncounterEachRun,
      fireOnFirstSuccessfulHqRunThisTurn,
      fireOnPassRezzedIce,
    } = await import("../src/state/runTimingHooks.js");

    const s = createInitialState();
    const a = instantiateCard("corroder", "a-1", "runner:installed");
    a.onFirstEncounterEachRun = fx.do({
      kind: "gain_credits",
      side: "runner",
      amount: 1,
    });
    const b = instantiateCard("diesel", "b-1", "runner:installed");
    b.onPassRezzedIce = fx.do({
      kind: "gain_credits",
      side: "runner",
      amount: 1,
    });
    const c = instantiateCard("sure-gamble", "c-1", "runner:installed");
    c.onFirstSuccessfulHqRunThisTurn = fx.do({
      kind: "gain_credits",
      side: "runner",
      amount: 1,
    });
    s.cards["a-1"] = a;
    s.cards["b-1"] = b;
    s.cards["c-1"] = c;
    s.runner.installed = ["a-1", "b-1", "c-1"];
    s.runner.credits = 0;

    fireOnFirstEncounterEachRun(s);
    expect(
      s.log.some((line) =>
        line.includes("Corroder becomes pending — first encounter this run"),
      ),
    ).toBe(true);
    expect(s.runner.credits).toBe(1);

    fireOnPassRezzedIce(s);
    expect(
      s.log.some((line) =>
        line.includes("Diesel becomes pending — rezzed ice passed"),
      ),
    ).toBe(true);
    expect(s.runner.credits).toBe(2);

    fireOnFirstSuccessfulHqRunThisTurn(s);
    expect(
      s.log.some((line) =>
        line.includes(
          "Sure Gamble becomes pending — first successful HQ run this turn",
        ),
      ),
    ).toBe(true);
    expect(s.runner.credits).toBe(3);
    expect(s.pendingAbilities).toHaveLength(0);
  });
});

describe("damage expected effects (CR 9.9.2)", () => {
  it("tracks expected damage and updates it when prevented", () => {
    const s = createInitialState();
    const result = dealDamage(s, "net", 2, s.corp.identityId, {
      interactive: true,
    });
    expect(result).toBe("pending");
    expect(s.pendingDamage?.expectedEffects?.damage).toEqual({
      type: "net",
      amount: 2,
    });

    preventPendingDamage(s, 1);
    expect(s.pendingDamage?.remaining).toBe(1);
    expect(s.pendingDamage?.expectedEffects?.damage?.amount).toBe(1);
  });
});
