
import {
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  autoWalk,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  enterStep,
  evalEffect,
  fx,
  instantiateCard,
  queryLegality,
  getCardDef,
  validateEffectTree,
} from "../src/index.js";
import { trashCorpCardToArchives } from "../src/effects/corpTrash.js";
import { onAccessed } from "../src/state/cardDeclarations.js";
import { occurCheckpoint } from "../src/legality/checkpoints.js";
import { runnerPsiSpendable } from "../src/state/psi.js";
import { CR } from "../src/timing/labels.js";
import { markAbilityUsed, wasAbilityUsed, memoryLimit } from "../src/state/turn.js";
import type { Action, GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.7");
});

function must(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`${result.error} ${JSON.stringify(result.cites)}`);
  return result.state;
}

function score(state: GameState, id: string, points: number, side: "corp" | "runner") {
  const card = instantiateCard("hostile-takeover", id, side === "corp" ? "corp:score" : "runner:score");
  card.agendaPoints = points;
  card.faceup = true;
  state.cards[id] = card;
  if (side === "corp") state.corp.scoreArea.push(id);
  else state.runner.scoreArea.push(id);
}

describe("CR examples, chapter 1", () => {

  it("ends the game when the Corp must draw and R&D is empty (CR 1.7.2c)", () => {
    let s = createInitialState();
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    expect(s.timingKey).toBe("corp.mandatoryDraw");
    s.corp.deck = [];
    s = must(s, { type: "pass_window" });
    expect(s.winner).toBe("runner");
    expect(s.winReason).toBe("empty_rd");
    expect(s.done).toBe(true);
    expect(s.log.join("\n")).toMatch(/CR 1\.7\.2c/);

    const basic = createInitialState();
    basic.corp.deck = [];
    basic.activeSide = "corp";
    basic.timingKey = "corp.takeAction";
    basic.timing.structure = "corp_turn";
    basic.corp.clicks = 3;
    const drawn = evalEffect(
      { state: basic, sourceId: basic.corp.identityId },
      fx.do({ kind: "draw", side: "corp", amount: 1 }),
    );
    expect(drawn.ok).toBe(true);
    expect(basic.winner).toBe("runner");
    expect(basic.winReason).toBe("empty_rd");

    const click = createInitialState();
    click.corp.deck = [];
    click.corp.clicks = 1;
    click.activeSide = "corp";
    click.timingKey = "corp.takeAction";
    click.timing.structure = "corp_turn";
    const acted = applyAction(click, { type: "basic_draw" });
    expect(acted.ok).toBe(true);
    if (acted.ok) {
      expect(acted.state.winner).toBe("runner");
      expect(acted.state.winReason).toBe("empty_rd");
      expect(acted.state.corp.clicks).toBe(0);
    }

    const upTo = createInitialState();
    upTo.corp.deck = [];
    const optional = evalEffect(
      { state: upTo, sourceId: upTo.corp.identityId },
      fx.do({ kind: "draw_up_to", side: "corp", amount: 3 }),
    );
    expect(optional.ok).toBe(true);
    expect(upTo.winner).toBeNull();
  });

    it("loses only the credits in the pool, and nothing when the pool is empty (CR 1.10.3b.ex1)", () => {
    const full = createInitialState();
    full.runner.credits = 5;
    const lostTwo = evalEffect(
      { state: full, sourceId: "corp-id" },
      fx.do({ kind: "lose_credits", side: "runner", amount: 2 }),
    );
    expect(lostTwo.ok).toBe(true);
    expect(full.runner.credits).toBe(3);

    const one = createInitialState();
    one.runner.credits = 1;
    const hosted = instantiateCard("ghost-runner", "gh-1", "runner:installed");
    hosted.hostedCredits = 5;
    one.cards["gh-1"] = hosted;
    one.runner.installed = ["gh-1"];
    const lostOne = evalEffect(
      { state: one, sourceId: "corp-id" },
      fx.do({ kind: "lose_credits", side: "runner", amount: 2 }),
    );
    expect(lostOne.ok).toBe(true);
    expect(one.runner.credits).toBe(0);
    expect(one.cards["gh-1"]?.hostedCredits).toBe(5);

    const empty = createInitialState();
    empty.runner.credits = 0;
    const lostNone = evalEffect(
      { state: empty, sourceId: "corp-id" },
      fx.do({ kind: "lose_credits", side: "runner", amount: 2 }),
    );
    expect(lostNone.ok).toBe(true);
    expect(empty.runner.credits).toBe(0);
  });


    it("lets Cyberfeeder pay for Atman's install ability (CR 1.10.3c.ex1)", () => {
    const s = createInitialState();
    const feed = instantiateCard("cyberfeeder", "cf-1", "runner:installed");
    feed.recurringCredits = 1;
    const atman = instantiateCard("atman", "at-1", "runner:grip");
    s.cards["cf-1"] = feed;
    s.cards["at-1"] = atman;
    s.runner.installed = ["cf-1"];
    s.runner.hand = ["at-1"];
    s.runner.credits = 3;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    const installed = must(s, {
      type: "basic_install",
      cardId: "at-1",
      destination: { kind: "installed" },
    });
    expect(installed.cards["at-1"]?.powerCounters).toBe(1);
    expect(installed.cards["cf-1"]?.recurringCredits).toBe(0);
    expect(installed.runner.credits).toBe(0);
  });


    it("lets Ghost Runner credits pay a psi bid during a run (CR 1.10.3c.ex2)", () => {
    const s = createInitialState();
    const ghost = instantiateCard("ghost-runner", "gh-1", "runner:installed");
    ghost.hostedCredits = 3;
    s.cards["gh-1"] = ghost;
    s.runner.installed = ["gh-1"];
    s.runner.credits = 0;
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
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
    expect(runnerPsiSpendable(s)).toBe(3);
  });


    it("makes the Runner pay Tollbooth with Ghost Runner when the pool cannot (CR 1.10.3c.ex3)", () => {
    const s = createInitialState();
    const ghost = instantiateCard("ghost-runner", "gh-1", "runner:installed");
    ghost.hostedCredits = 3;
    const toll = instantiateCard("tollbooth", "tb-1", "server:hq:ice");
    toll.rezzed = true;
    s.cards["gh-1"] = ghost;
    s.cards["tb-1"] = toll;
    s.runner.installed = ["gh-1"];
    s.runner.credits = 0;
    s.servers.hq.ice = ["tb-1"];
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: { iceId: "tb-1", subIndex: 0 },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    const paid = evalEffect(
      { state: s, sourceId: "tb-1" },
      fx.do({ kind: "pay_credits_or_etr", side: "runner", amount: 3 }),
    );
    expect(paid.ok).toBe(true);
    expect(s.run?.endedTheRun).toBe(false);
    expect(s.cards["gh-1"]?.hostedCredits).toBe(0);
  });


    it("refills Spinal Modem's recurring credits at the start of the Runner's turn (CR 1.10.5d.ex1)", () => {
    const s = createInitialState();
    const modem = instantiateCard("spinal-modem", "sm-1", "runner:installed");
    modem.recurringCredits = 1;
    s.cards["sm-1"] = modem;
    s.runner.installed = ["sm-1"];
    s.timingKey = "runner.startPaw";
    enterStep(s, "runner.recurring");
    autoWalk(s);
    expect(s.cards["sm-1"]?.recurringCredits).toBe(2);
  });


    it("treats a reinstalled Vaporframe Fabricator as a new once-per-turn object (CR 1.12.2.ex1)", () => {
    const s = createInitialState();
    const fab = instantiateCard("vaporframe-fabricator", "vf-1", "corp:archives");
    fab.rezzed = true;
    fab.faceup = true;
    s.cards["vf-1"] = fab;
    const ice = instantiateCard("ice-wall", "iw-1", "corp:hq");
    s.cards["iw-1"] = ice;
    s.corp.discardPile = ["vf-1"];
    s.corp.hand = ["iw-1"];
    s.servers["remote-1"] = { id: "remote-1", kind: "remote", ice: [], root: [] };
    s.corp.clicks = 1;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    markAbilityUsed(s, "vf-1", "vaporframe-click-install");
    expect(wasAbilityUsed(s, "vf-1", "vaporframe-click-install")).toBe(true);
    const installed = evalEffect(
      { state: s, sourceId: "vf-1" },
      fx.do({
        kind: "install_archives_card_ignore_costs",
        cardId: "vf-1",
        serverId: "remote-1",
      }),
    );
    expect(installed.ok).toBe(true);
    expect(wasAbilityUsed(s, "vf-1", "vaporframe-click-install")).toBe(false);
    s.cards["vf-1"]!.rezzed = true;
    const used = must(s, {
      type: "use_paid_ability",
      cardId: "vf-1",
      abilityId: "vaporframe-click-install",
    });
    expect(used.pendingChoice).toBeTruthy();
  });


  it("places Priority Construction's advancements on the ice it just installed (CR 1.12.2a.ex1)", () => {
    const s = createInitialState();
    const ice = instantiateCard("ice-wall", "wall-1", "corp:hq");
    s.cards["wall-1"] = ice;
    s.corp.hand = ["wall-1"];
    const played = evalEffect(
      { state: s, sourceId: "priority-construction" },
      fx.do({
        kind: "install_priority_construction_resolve",
        iceId: "wall-1",
        serverId: "__new_remote__",
        advancements: 3,
      }),
    );
    expect(played.ok).toBe(true);
    expect(s.cards["wall-1"]?.zone.endsWith(":ice")).toBe(true);
    expect(s.cards["wall-1"]?.advancementCounters).toBe(3);
    expect(s.corp.hand).not.toContain("wall-1");
  });


  it("shuffles Accelerated Beta Test's remaining cards when The Foundry searches R&D (CR 1.12.3.ex1)", () => {
    let s = createInitialState();
    const foundry = instantiateCard(
      "the-foundry-refining-the-process",
      "foundry-id",
      "corp:identity",
    );
    s.cards[s.corp.identityId]!.onFirstIceRezEachTurn = foundry.onFirstIceRezEachTurn;
    const ice = instantiateCard("ice-wall", "abt-ice", "corp:rd");
    const copy = instantiateCard("ice-wall", "abt-copy", "corp:rd");
    const other = instantiateCard("hedge-fund", "abt-other", "corp:rd");
    s.cards["abt-ice"] = ice;
    s.cards["abt-copy"] = copy;
    s.cards["abt-other"] = other;
    s.corp.deck = ["abt-ice", "abt-other", "abt-copy"];
    const looked = evalEffect(
      { state: s, sourceId: "abt" },
      fx.do({ kind: "accelerated_beta_test", n: 3 }),
    );
    expect(looked.ok).toBe(true);
    s = must(s, { type: "choose_option", optionId: "abt-ice:abt-ice:hq" });
    expect(s.turn.rdLookedCards).toEqual([]);
    expect(s.cards["abt-ice"]?.rezzed).toBe(true);
    expect(s.corp.hand).toContain("abt-copy");
    expect(s.corp.discardPile).not.toContain("abt-other");
    expect(s.corp.deck).toContain("abt-other");
    expect(s.log.join("\n")).toContain("1.12.3");
  });


  it("makes Precognition's rearranged cards new objects (CR 1.12.3.ex2)", () => {
    let s = createInitialState();
    const top = instantiateCard("hedge-fund", "pre-1", "corp:rd");
    const next = instantiateCard("ice-wall", "pre-2", "corp:rd");
    top.title = "First";
    next.title = "Second";
    s.cards["pre-1"] = top;
    s.cards["pre-2"] = next;
    s.corp.deck = ["pre-1", "pre-2"];
    evalEffect(
      { state: s, sourceId: "precog" },
      fx.do({ kind: "look_top_n_rd_arrange", n: 2 }),
    );
    s = must(s, { type: "choose_option", optionId: "rd-arrange:pre-2" });
    s = must(s, { type: "choose_option", optionId: "rd-arrange:pre-1" });
    expect(s.cards["pre-1"]).toBeUndefined();
    expect(s.cards["pre-2"]).toBeUndefined();
    expect(s.corp.deck.slice(0, 2).map((id) => s.cards[id]?.title)).toEqual([
      "Second",
      "First",
    ]);
    expect(s.log.join("\n")).toContain("1.12.3");
  });


  it("keeps Femme Fatale's chosen ice after Thimblerig moves it (CR 1.12.4.ex1)", () => {
    const s = createInitialState();
    const femme = instantiateCard("femme-fatale", "femme-1", "runner:installed");
    const chosen = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    const thimble = instantiateCard("thimblerig", "thimble-1", "server:rd:ice");
    femme.chosenIceId = "ice-1";
    chosen.rezzed = true;
    thimble.rezzed = true;
    s.cards["femme-1"] = femme;
    s.cards["ice-1"] = chosen;
    s.cards["thimble-1"] = thimble;
    s.runner.installed = ["femme-1"];
    s.servers.hq.ice = ["ice-1"];
    s.servers.rd.ice = ["thimble-1"];
    const swapped = evalEffect(
      { state: s, sourceId: "thimble-1" },
      fx.do({ kind: "swap_two_installed_ice", otherIceId: "ice-1" }),
    );
    expect(swapped.ok).toBe(true);
    expect(s.servers.rd.ice).toContain("ice-1");
    expect(s.cards["femme-1"]?.chosenIceId).toBe("ice-1");
    expect(s.cards["ice-1"]?.id).toBe("ice-1");
  });


    it("keeps Vaporframe Fabricator's once-per-turn use after it is derezzed and rezzed (CR 1.12.5.ex1)", () => {
    const s = createInitialState();
    const fab = instantiateCard("vaporframe-fabricator", "vf-1", "server:remote-1:root");
    fab.rezzed = true;
    fab.faceup = true;
    s.cards["vf-1"] = fab;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["vf-1"],
    };
    s.corp.clicks = 1;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    markAbilityUsed(s, "vf-1", "vaporframe-click-install");
    fab.rezzed = false;
    fab.rezzed = true;
    const again = applyAction(s, {
      type: "use_paid_ability",
      cardId: "vf-1",
      abilityId: "vaporframe-click-install",
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toContain("already used");
  });


  it("counts a passed ice for Bravado after that ice is trashed (CR 1.12.6.ex1)", () => {
    const s = createInitialState();
    const passed = instantiateCard("ice-wall", "passed-1", "corp:archives");
    s.cards["passed-1"] = passed;
    s.corp.discardPile = ["passed-1"];
    s.runner.credits = 0;
    s.run = {
      attackedServerId: "hq",
      phase: "ends",
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
      passedIceIds: ["passed-1", "still-1"],
    };
    const gained = evalEffect(
      { state: s, sourceId: "bravado" },
      fx.do({
        kind: "gain_credits",
        side: "runner",
        amount: 0,
        tally: { count: "passed_ice", per: 1, side: "runner", base: 6 },
      }),
    );
    expect(gained.ok).toBe(true);
    expect(s.runner.credits).toBe(8);
  });


  it("still counts a trashed R&D card against the breach (CR 1.12.6.ex2)", () => {
    const s = createInitialState();
    const top = instantiateCard("hedge-fund", "top-1", "corp:rd");
    s.cards["top-1"] = top;
    s.corp.deck = ["top-1", ...s.corp.deck.filter((id) => id !== "top-1")];
    s.run = {
      attackedServerId: "rd",
      phase: "breach",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: ["top-1"],
      randomAccessLimit: 2,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    enterStep(s, "breach.awaitAccess");
    const accessed = must(s, { type: "access_card", cardId: "top-1" });
    trashCorpCardToArchives(accessed, "top-1");
    expect(accessed.run?.accessedCardIds).toContain("top-1");
    expect(accessed.run?.randomAccessLimit).toBe(1);
    expect(accessed.corp.deck).not.toContain("top-1");
  });


  it("gives AMAZE's tags at run end after the Runner trashes it (CR 1.12.6a.ex1)", () => {
    const s = createInitialState();
    const amaze = instantiateCard("amaze-amusements", "amaze-1", "corp:archives");
    amaze.rezzed = false;
    s.cards["amaze-1"] = amaze;
    s.corp.discardPile = ["amaze-1"];
    s.runner.tags = 0;
    s.run = {
      attackedServerId: "hq",
      phase: "ends",
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
    expect(s.runner.tags).toBe(2);
    expect(s.log.join("\n")).toContain("persists");
  });


    it("does not lose hosted credits when the credit pool is emptied (CR 1.13.3.ex1)", () => {
    const s = createInitialState();
    s.runner.credits = 0;
    const space = instantiateCard("ghost-runner", "ws-1", "runner:installed");
    space.hostedCredits = 3;
    s.cards["ws-1"] = space;
    s.runner.installed = ["ws-1"];
    const lost = evalEffect(
      { state: s, sourceId: "corp-id" },
      fx.do({ kind: "lose_credits", side: "runner", amount: 1 }),
    );
    expect(lost.ok).toBe(true);
    expect(s.runner.credits).toBe(0);
    expect(s.cards["ws-1"]?.hostedCredits).toBe(3);
  });


    it("fills the bad publicity fund from the Corp's bad publicity, not hosted counters (CR 1.13.3.ex2)", () => {
    const s = createInitialState();
    s.corp.badPublicity = 1;
    const hole = instantiateCard("superdeep-borehole", "hole-1", "server:hq:root");
    hole.rezzed = true;
    hole.faceup = true;
    hole.badPublicityCounters = 2;
    s.cards["hole-1"] = hole;
    s.servers.hq.root = ["hole-1"];
    s.run = {
      attackedServerId: "hq",
      phase: "approach",
      position: null,
      successful: null,
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
    s.timingKey = "run.announce";
    enterStep(s, "run.fillBpFund");
    autoWalk(s);
    expect(s.badPublicityFund).toBe(1);
  });


    it("removes Corp bad publicity and leaves hosted bad publicity counters (CR 1.13.3.ex3)", () => {
    const s = createInitialState();
    s.corp.badPublicity = 3;
    const hole = instantiateCard("superdeep-borehole", "hole-1", "server:hq:root");
    hole.rezzed = true;
    hole.badPublicityCounters = 2;
    s.cards["hole-1"] = hole;
    const removed = evalEffect(
      { state: s, sourceId: "corp-id" },
      fx.do({ kind: "remove_bad_publicity", amount: 2 }),
    );
    expect(removed.ok).toBe(true);
    expect(s.corp.badPublicity).toBe(1);
    expect(s.cards["hole-1"]?.badPublicityCounters).toBe(2);
  });


  it("can install a connection hosted on Off-Campus Apartment (CR 1.13.6a.ex1)", () => {
    const s = createInitialState();
    const apt = instantiateCard("off-campus-apartment", "oca-1", "runner:installed");
    const kati = instantiateCard("kati-jones", "kati-1", "runner:grip");
    s.cards["oca-1"] = apt;
    s.cards["kati-1"] = kati;
    s.runner.installed = ["oca-1"];
    s.runner.hand = ["kati-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    const hosted = must(s, {
      type: "basic_install",
      cardId: "kati-1",
      destination: { kind: "host_card", hostId: "oca-1" },
    });
    expect(hosted.cards["kati-1"]?.hostId).toBe("oca-1");
    expect(hosted.cards["oca-1"]?.hostedCardIds).toContain("kati-1");
    const direct = createInitialState();
    const apt2 = instantiateCard("off-campus-apartment", "oca-2", "runner:installed");
    const kati2 = instantiateCard("kati-jones", "kati-2", "runner:grip");
    direct.cards["oca-2"] = apt2;
    direct.cards["kati-2"] = kati2;
    direct.runner.installed = ["oca-2"];
    direct.runner.hand = ["kati-2"];
    direct.runner.credits = 5;
    direct.runner.clicks = 1;
    direct.activeSide = "runner";
    direct.timingKey = "runner.takeAction";
    const plain = must(direct, {
      type: "basic_install",
      cardId: "kati-2",
      destination: { kind: "installed" },
    });
    expect(plain.cards["kati-2"]?.hostId).toBeUndefined();
    expect(plain.runner.installed).toContain("kati-2");
  });


  it("hosts a card on Glenn Station only through its paid ability (CR 1.13.6b.ex1)", () => {
    const s = createInitialState();
    const glenn = instantiateCard("glenn-station", "glenn-1", "corp:score");
    glenn.faceup = true;
    const guest = instantiateCard("hedge-fund", "guest-1", "corp:hq");
    const asset = instantiateCard("pad-campaign", "pad-1", "corp:hq");
    s.cards["glenn-1"] = glenn;
    s.cards["guest-1"] = guest;
    s.cards["pad-1"] = asset;
    s.corp.scoreArea = ["glenn-1"];
    s.corp.hand = ["guest-1", "pad-1"];
    s.corp.clicks = 1;
    s.corp.credits = 5;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    const hosted = evalEffect(
      { state: s, sourceId: "glenn-1" },
      fx.do({ kind: "glenn_host_card", cardId: "guest-1" }),
    );
    expect(hosted.ok).toBe(true);
    expect(s.cards["guest-1"]?.hostId).toBe("glenn-1");
    expect(s.corp.hand).not.toContain("guest-1");
    const refused = applyAction(s, {
      type: "basic_install",
      cardId: "pad-1",
      destination: { kind: "host_card", hostId: "glenn-1" },
    });
    expect(refused.ok).toBe(false);
    expect(s.cards["pad-1"]?.hostId).toBeUndefined();
  });


    it("refuses Egret when no ice is rezzed (CR 1.13.6c.ex1)", () => {
    const s = createInitialState();
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    ice.rezzed = false;
    const egret = instantiateCard("egret", "eg-1", "runner:grip");
    s.cards["ice-1"] = ice;
    s.cards["eg-1"] = egret;
    s.servers.hq.ice = ["ice-1"];
    s.runner.hand = ["eg-1"];
    s.runner.clicks = 1;
    s.runner.credits = 5;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    const refused = applyAction(s, {
      type: "basic_install",
      cardId: "eg-1",
      destination: { kind: "host_ice", iceId: "ice-1" },
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toContain("rezzed");
  });


  it("does not discount a program hosted on Leprechaun for Dhegdheer's reduction (CR 1.13.9.ex1)", () => {
    const s = createInitialState();
    const dheg = instantiateCard("dhegdheer", "dheg-1", "runner:installed");
    const leprechaun = instantiateCard("leprechaun", "lep-1", "runner:installed");
    leprechaun.hostId = "dheg-1";
    dheg.hostedCardIds = ["lep-1"];
    const program = instantiateCard("corroder", "prog-1", "runner:grip");
    s.cards["dheg-1"] = dheg;
    s.cards["lep-1"] = leprechaun;
    s.cards["prog-1"] = program;
    s.runner.installed = ["dheg-1", "lep-1"];
    s.runner.hand = ["prog-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    const installed = must(s, {
      type: "basic_install",
      cardId: "prog-1",
      destination: { kind: "host_card", hostId: "lep-1" },
    });
    expect(installed.cards["prog-1"]?.hostId).toBe("lep-1");
    expect(installed.runner.credits).toBe(3);
  });


  it("moves Madani's chosen programs from the grip into the play area (CR 1.13.12.ex1)", () => {
    const s = createInitialState();
    const madani = instantiateCard("madani", "madani-1", "runner:installed");
    const a = instantiateCard("corroder", "prog-a", "runner:grip");
    const b = instantiateCard("femme-fatale", "prog-b", "runner:grip");
    s.cards["madani-1"] = madani;
    s.cards["prog-a"] = a;
    s.cards["prog-b"] = b;
    s.runner.installed = ["madani-1"];
    s.runner.hand = ["prog-a", "prog-b"];
    const hosted = evalEffect(
      { state: s, sourceId: "madani-1" },
      fx.do({ kind: "host_all_programs_from_grip" }),
    );
    expect(hosted.ok).toBe(true);
    expect(s.runner.hand).toEqual([]);
    expect(s.cards["prog-a"]?.zone).toBe("hosted:madani-1");
    expect(s.cards["prog-b"]?.zone).toBe("hosted:madani-1");
    expect(s.cards["madani-1"]?.hostedCardIds).toEqual(["prog-a", "prog-b"]);
  });


  it("trashes cards hosted on Detente when Rejig returns it to the grip (CR 1.13.13.ex1)", () => {
    const s = createInitialState();
    const host = instantiateCard("corroder", "detente-1", "runner:installed");
    host.title = "Detente";
    const hosted = instantiateCard("hedge-fund", "hosted-1", "hosted:detente-1");
    hosted.hostId = "detente-1";
    host.hostedCardIds = ["hosted-1"];
    s.cards["detente-1"] = host;
    s.cards["hosted-1"] = hosted;
    s.runner.installed = ["detente-1"];
    const bounced = evalEffect(
      { state: s, sourceId: "rejig" },
      fx.do({ kind: "return_rig_card_to_grip", cardId: "detente-1" }),
    );
    expect(bounced.ok).toBe(true);
    expect(s.cards["detente-1"]?.zone).toBe("runner:grip");
    occurCheckpoint(s, "instruction", "Rejig finished", [CR.checkpointHostedOnUninstalled], "test");
    expect(s.cards["hosted-1"]?.zone).toBe("corp:archives");
    expect(s.cards["hosted-1"]?.hostId).toBeUndefined();
  });


  it("trashes Next Big Thing's agenda counter when IP Enforcement installs it (CR 1.13.13.ex2)", () => {
    const s = createInitialState();
    const agenda = instantiateCard("clone-retirement", "nbt-1", "runner:score");
    agenda.agendaCounters = 1;
    agenda.faceup = true;
    s.cards["nbt-1"] = agenda;
    s.runner.scoreArea = ["nbt-1"];
    s.servers["remote-1"] = { id: "remote-1", kind: "remote", ice: [], root: [] };
    const installed = evalEffect(
      { state: s, sourceId: "ip" },
      fx.do({
        kind: "install_runner_score_agenda_on_server",
        cardId: "nbt-1",
        serverId: "remote-1",
      }),
    );
    expect(installed.ok).toBe(true);
    expect(s.cards["nbt-1"]?.zone).toBe("server:remote-1:root");
    expect(s.cards["nbt-1"]?.agendaCounters).toBe(0);
    expect(s.log.join("\n")).toContain("1.13.13");
  });


  it("keeps Next Big Thing's agenda counter when Exchange of Information swaps it (CR 1.13.13.ex3)", () => {
    const s = createInitialState();
    const runnerAgenda = instantiateCard("clone-retirement", "nbt-1", "runner:score");
    runnerAgenda.agendaCounters = 1;
    runnerAgenda.faceup = true;
    const corpAgenda = instantiateCard("hostile-takeover", "corp-ag", "corp:score");
    corpAgenda.faceup = true;
    s.cards["nbt-1"] = runnerAgenda;
    s.cards["corp-ag"] = corpAgenda;
    s.runner.scoreArea = ["nbt-1"];
    s.corp.scoreArea = ["corp-ag"];
    const swapped = evalEffect(
      { state: s, sourceId: "eoi" },
      fx.do({
        kind: "swap_resolve",
        corpAgendaId: "corp-ag",
        runnerAgendaId: "nbt-1",
      }),
    );
    expect(swapped.ok).toBe(true);
    expect(s.corp.scoreArea).toContain("nbt-1");
    expect(s.cards["nbt-1"]?.agendaCounters).toBe(1);
  });


  it("lets the Corp choose Rototurret's program and the Runner choose Bulwark's (CR 1.14.5.ex1)", () => {
    const roto = createInitialState();
    const turret = instantiateCard("rototurret", "roto-1", "server:hq:ice");
    turret.rezzed = true;
    const first = instantiateCard("corroder", "prog-1", "runner:installed");
    const second = instantiateCard("femme-fatale", "prog-2", "runner:installed");
    roto.cards["roto-1"] = turret;
    roto.cards["prog-1"] = first;
    roto.cards["prog-2"] = second;
    roto.runner.installed = ["prog-1", "prog-2"];
    roto.servers.hq.ice = ["roto-1"];
    evalEffect(
      { state: roto, sourceId: "roto-1" },
      fx.do({ kind: "trash_program", pick: "choose" }),
    );
    expect(roto.pendingTrashProgram?.chooser).toBe("corp");

    const bulk = createInitialState();
    const bulwark = instantiateCard("bulwark", "bulk-1", "server:hq:ice");
    bulwark.rezzed = true;
    const a = instantiateCard("corroder", "prog-a", "runner:installed");
    const b = instantiateCard("femme-fatale", "prog-b", "runner:installed");
    bulk.cards["bulk-1"] = bulwark;
    bulk.cards["prog-a"] = a;
    bulk.cards["prog-b"] = b;
    bulk.runner.installed = ["prog-a", "prog-b"];
    bulk.servers.hq.ice = ["bulk-1"];
    evalEffect(
      { state: bulk, sourceId: "bulk-1" },
      fx.do({ kind: "trash_program", pick: "choose" }),
    );
    expect(bulk.pendingTrashProgram?.chooser).toBe("runner");
    expect(bulk.log.join("\n")).toContain("1.14.5");
  });


  it("meets Hostile Infrastructure when the Runner trashes an installed Corp card (CR 1.14.5a.ex1)", () => {
    const s = createInitialState();
    const hi = instantiateCard("hostile-infrastructure", "hi-1", "server:hq:root");
    hi.rezzed = true;
    hi.faceup = true;
    const asset = instantiateCard("pad-campaign", "pad-1", "server:remote-1:root");
    asset.rezzed = true;
    s.cards["hi-1"] = hi;
    s.cards["pad-1"] = asset;
    s.servers.hq.root = ["hi-1"];
    s.servers["remote-1"] = { id: "remote-1", kind: "remote", ice: [], root: ["pad-1"] };
    s.runner.hand = ["runner-program-1", "runner-fill-1", "runner-fill-2"];
    s.activeSide = "runner";
    trashCorpCardToArchives(s, "pad-1", "runner");
    const dealt = (s.pendingDamage?.remaining ?? 0) > 0 || s.runner.hand.length < 3;
    expect(dealt).toBe(true);
    expect(s.log.join("\n")).toContain("source=hi-1");
  });


  it("does not meet Hostile Infrastructure when the Corp trashes from HQ (CR 1.14.5a.ex2)", () => {
    const s = createInitialState();
    const hi = instantiateCard("hostile-infrastructure", "hi-1", "server:hq:root");
    hi.rezzed = true;
    hi.faceup = true;
    const card = instantiateCard("hedge-fund", "hq-1", "corp:hq");
    s.cards["hi-1"] = hi;
    s.cards["hq-1"] = card;
    s.servers.hq.root = ["hi-1"];
    s.corp.hand = ["hq-1"];
    s.runner.hand = ["runner-program-1", "runner-fill-1"];
    s.activeSide = "runner";
    evalEffect(
      { state: s, sourceId: "alice" },
      fx.do({ kind: "trash_hq", amount: 1, pick: "first" }),
    );
    expect(s.pendingDamage).toBeNull();
    expect(s.runner.hand.length).toBe(2);
    expect(s.corp.discardPile).toContain("hq-1");
  });


  it("makes the Runner trash an installed program (CR 1.15.2c.ex1)", () => {
    const s = createInitialState();
    const ice = instantiateCard("bulwark", "bulk-1", "server:hq:ice");
    const installed = instantiateCard("corroder", "prog-1", "runner:installed");
    const gripped = instantiateCard("femme-fatale", "prog-2", "runner:grip");
    s.cards["bulk-1"] = ice;
    s.cards["prog-1"] = installed;
    s.cards["prog-2"] = gripped;
    s.runner.installed = ["prog-1"];
    s.runner.hand = ["prog-2"];
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: {
        iceId: "bulk-1",
        broken: [false],
        subroutinesResolved: [],
      },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    evalEffect(
      { state: s, sourceId: "bulk-1" },
      fx.do({ kind: "trash_program", pick: "choose" }),
    );
    expect(s.runner.discardPile).toContain("prog-1");
    expect(s.runner.hand).toContain("prog-2");
  });


  it("trashes both programs Aggressive Secretary chose (CR 1.15.2e.ex1)", () => {
    let s = createInitialState();
    const ambush = instantiateCard(
      "aggressive-secretary",
      "sec-1",
      "server:remote-1:root",
    );
    ambush.advancementCounters = 3;
    ambush.rezzed = true;
    const a = instantiateCard("corroder", "prog-a", "runner:installed");
    const b = instantiateCard("femme-fatale", "prog-b", "runner:installed");
    s.cards["sec-1"] = ambush;
    s.cards["prog-a"] = a;
    s.cards["prog-b"] = b;
    s.runner.installed = ["prog-a", "prog-b"];
    s.corp.credits = 5;
    const offered = evalEffect(
      { state: s, sourceId: "sec-1" },
      fx.do({
        kind: "may_pay_credits_for_trash_programs_per_advancement",
        amount: 2,
      }),
    );
    expect(offered.ok).toBe(true);
    s = must(s, { type: "choose_option", optionId: "pay" });
    s = must(s, { type: "choose_option", optionId: "trash-prog:prog-a" });
    expect(s.runner.installed).not.toContain("prog-a");
    expect(s.runner.installed).not.toContain("prog-b");
    expect(s.runner.discardPile).toEqual(
      expect.arrayContaining(["prog-a", "prog-b"]),
    );
  });


  it("finds the ice Howler installed while that ice is still installed (CR 1.15.4.ex1)", () => {
    const s = createInitialState();
    const howler = instantiateCard("howler", "howler-1", "server:remote-1:ice");
    howler.rezzed = true;
    howler.faceup = true;
    const eli = instantiateCard("eli-1-0", "eli-1", "corp:hq");
    s.cards["howler-1"] = howler;
    s.cards["eli-1"] = eli;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: ["howler-1"],
      root: [],
    };
    s.corp.hand = ["eli-1"];
    s.run = {
      attackedServerId: "remote-1",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: {
        iceId: "howler-1",
        broken: [false],
        subroutinesResolved: [],
      },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    evalEffect(
      { state: s, sourceId: "howler-1" },
      fx.do({ kind: "install_rez_bioroid_inward" }),
    );
    expect(s.cards["eli-1"]?.rezzed).toBe(true);
    expect(s.servers["remote-1"]?.ice).toContain("eli-1");
    enterStep(s, "run.ends");
    autoWalk(s);
    expect(s.cards["eli-1"]?.rezzed).toBe(false);
    expect(s.servers["remote-1"]?.ice).toContain("eli-1");
    expect(s.corp.discardPile).toContain("howler-1");
  });


  it("trashes Clone Chip as a cost LLDS Energy Regulator cannot prevent (CR 1.16.1a.ex1)", () => {
    const s = createInitialState();
    const chip = instantiateCard("clone-chip", "chip-1", "runner:installed");
    const llds = instantiateCard(
      "llds-energy-regulator",
      "llds-1",
      "runner:installed",
    );
    const program = instantiateCard("corroder", "prog-1", "runner:heap");
    s.cards["chip-1"] = chip;
    s.cards["llds-1"] = llds;
    s.cards["prog-1"] = program;
    s.runner.installed = ["chip-1", "llds-1"];
    s.runner.discardPile = ["prog-1"];
    s.runner.credits = 5;
    s.activeSide = "runner";
    s.timingKey = "runner.actionPaw";
    const used = must(s, {
      type: "use_paid_ability",
      cardId: "chip-1",
      abilityId: "clone-chip-install",
    });
    expect(used.runner.discardPile).toContain("chip-1");
    expect(used.pendingTrashPrevent).toBeFalsy();
    expect(used.cards["llds-1"]?.zone).toBe("runner:installed");
  });


  it("cannot pay Obokata Protocol's damage while Guru Davinder would prevent it (CR 1.16.1b.ex1)", () => {
    const s = createInitialState();
    const agenda = instantiateCard(
      "obokata-protocol",
      "obo-1",
      "server:remote-1:root",
    );
    const guru = instantiateCard("guru-davinder", "guru-1", "runner:installed");
    s.cards["obo-1"] = agenda;
    s.cards["guru-1"] = guru;
    s.runner.installed = ["guru-1"];
    s.runner.credits = 10;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["obo-1"],
    };
    s.run = {
      attackedServerId: "remote-1",
      phase: "breach",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: ["obo-1"],
      randomAccessLimit: 1,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: "obo-1",
    };
    s.timingKey = "access.stealAgenda";
    const types = queryLegality(s).legal.map((entry) => entry.action.type);
    expect(types).not.toContain("steal_agenda");
    expect(types).toContain("finish_access");
    const stolen = applyAction(s, { type: "steal_agenda", cardId: "obo-1" });
    expect(stolen.ok).toBe(false);
  });


  it("ends the run when Jesminder prevents Funhouse's tag cost (CR 1.16.1b.ex2)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.cards[s.runner.identityId]!.preventFirstTagThisTurn = true;
    s.cards[s.runner.identityId]!.title = "Jesminder Fixture";
    s.turn.tagsGivenThisTurn = 0;
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: {
        iceId: "fh-2",
        broken: [false],
        strengthBoost: 0,
      },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    s.cards["fh-2"] = {
      id: "fh-2",
      defId: "funhouse",
      title: "Funhouse",
      type: "ice",
      side: "corp",
      zone: "hq:ice",
      faceup: true,
      rezzed: true,
    };
    const r = evalEffect(
      { state: s, sourceId: "fh-2" },
      fx.endTheRunUnlessTakeTags(1),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice).toBeNull();
    expect(s.run?.endedTheRun).toBe(true);
    expect(s.runner.tags).toBe(0);
    expect(
      s.log.some(
        (l) =>
          l.includes("1.16.1b") &&
          (l.includes("nested cost") || l.includes("Cannot take")),
      ),
    ).toBe(true);
  });


  it("does not suffer Zer0's net damage when the once-per-turn ability cannot be used (CR 1.16.1c.ex1)", () => {
    let s = createInitialState();
    const zer0 = instantiateCard("zer0", "zer0-1", "runner:installed");
    const clan = instantiateCard(
      "clan-vengeance",
      "clan-1",
      "runner:installed",
    );
    s.cards["zer0-1"] = zer0;
    s.cards["clan-1"] = clan;
    s.runner.installed = ["zer0-1", "clan-1"];
    s.runner.clicks = 2;
    s.runner.hand = ["grip-1"];
    s.cards["grip-1"] = instantiateCard("sure-gamble", "grip-1", "runner:grip");
    s.runner.deck = ["stack-1", "stack-2"];
    s.cards["stack-1"] = instantiateCard("sure-gamble", "stack-1", "runner:stack");
    s.cards["stack-2"] = instantiateCard("sure-gamble", "stack-2", "runner:stack");
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s = must(s, {
      type: "use_paid_ability",
      cardId: "zer0-1",
      abilityId: "zer0",
    });
    expect(s.cards["clan-1"]?.powerCounters).toBe(1);
    const again = applyAction(s, {
      type: "use_paid_ability",
      cardId: "zer0-1",
      abilityId: "zer0",
    });
    expect(again.ok).toBe(false);
    expect(s.cards["clan-1"]?.powerCounters).toBe(1);
  });


  it("cannot trash SanSan City Grid to score Azef Protocol (CR 1.16.1c.ex2)", () => {
    let s = createInitialState();
    const agenda = instantiateCard(
      "azef-protocol",
      "azef-1",
      "server:remote-1:root",
    );
    agenda.advancementCounters = 2;
    const grid = instantiateCard(
      "sansan-city-grid",
      "grid-1",
      "server:remote-1:root",
    );
    grid.rezzed = true;
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    s.cards["azef-1"] = agenda;
    s.cards["grid-1"] = grid;
    s.cards["ice-1"] = ice;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["azef-1", "grid-1"],
    };
    s.servers.hq.ice = ["ice-1"];
    s.corp.clicks = 1;
    s.activeSide = "corp";
    s.timingKey = "corp.actionPaw";
    s.runner.hand = ["rh1", "rh2"];
    for (const id of s.runner.hand) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    }
    s = must(s, { type: "score_agenda", cardId: "azef-1" });
    const options = s.pendingChoice?.options.map((option) => option.id) ?? [];
    expect(options).toContain("trash:ice-1");
    expect(options).not.toContain("trash:grid-1");
    s = must(s, { type: "choose_option", optionId: "trash:ice-1" });
    expect(s.corp.scoreArea).toContain("azef-1");
    expect(s.cards["grid-1"]?.zone).toBe("server:remote-1:root");
  });


  it("trashes Beanstalk Royalties with Freedom Khumalo for zero virus counters (CR 1.16.1d.ex1)", () => {
    const s = createInitialState();
    const khumalo = instantiateCard(
      "freedom-khumalo-crypto-anarchist",
      s.runner.identityId,
      "runner:identity",
    );
    s.cards[s.runner.identityId] = khumalo;
    const bean = instantiateCard(
      "beanstalk-royalties",
      "bean-1",
      "corp:rd",
    );
    s.cards["bean-1"] = bean;
    s.corp.deck = ["bean-1"];
    s.run = {
      attackedServerId: "rd",
      phase: "breach",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: ["bean-1"],
      randomAccessLimit: 1,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: "bean-1",
    };
    onAccessed(s, "bean-1");
    expect(s.pendingChoice?.options.map((option) => option.id)).toContain(
      `decl:khumalo:${s.runner.identityId}:bean-1:0`,
    );
    const trashed = must(s, {
      type: "choose_option",
      optionId: `decl:khumalo:${s.runner.identityId}:bean-1:0`,
    });
    expect(trashed.corp.discardPile).toContain("bean-1");
    expect(trashed.cards[trashed.runner.identityId]?.virusCounters ?? 0).toBe(0);
  });


  it("pays Cayambe Grid's 6 credits as one payment, so GameNET gains 1 (CR 1.16.2b.ex1)", () => {
    const def = getCardDef("gamenet-where-dreams-are-real");
    expect(
      validateEffectTree(
        def.onCorpAbilityCausesRunnerSpendOrLoseCreditsDuringRun!,
      ),
    ).toBeNull();

    let s = createInitialState();
    s = structuredClone(s);
    const gn = instantiateCard(
      "gamenet-where-dreams-are-real",
      "gn-1",
      "corp:identity",
    );
    s.cards["gn-1"] = gn;
    s.corp.identityId = "gn-1";
    s.corp.credits = 5;
    s.runner.credits = 10;
    s.run = {
      attackedServerId: "remote-1",
      phase: "approach-server",
      position: null,
      successful: null,
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
    const cay = instantiateCard("cayambe-grid", "cay-1", "server:remote-1:root");
    s.cards["cay-1"] = cay;
    // One lose_credits of 6 (Cayambe 3×2) → one GameNET trigger.
    const r = evalEffect(
      { state: s, sourceId: "cay-1" },
      fx.do({ kind: "lose_credits", side: "runner", amount: 6 }),
    );
    expect(r.ok).toBe(true);
    expect(s.runner.credits).toBe(4);
    expect(s.corp.credits).toBe(6);

    // Runner self-spend (source = runner id) does not trigger.
    const before = s.corp.credits;
    evalEffect(
      { state: s, sourceId: s.runner.identityId },
      fx.do({ kind: "lose_credits", side: "runner", amount: 1 }),
    );
    expect(s.corp.credits).toBe(before);
  });


    it("cannot spend more credits on Psychographics than the Runner has tags (CR 1.16.2c.ex1)", () => {
    const s = createInitialState();
    const op = instantiateCard("psychographics", "psy-1", "corp:hq");
    const agenda = instantiateCard("hostile-takeover", "ht-1", "server:remote-1:root");
    agenda.installed = true;
    s.cards["psy-1"] = op;
    s.cards["ht-1"] = agenda;
    s.corp.hand = ["psy-1"];
    s.servers["remote-1"] = { id: "remote-1", kind: "remote", ice: [], root: ["ht-1"] };
    s.runner.tags = 2;
    s.corp.credits = 5;
    s.corp.clicks = 1;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    const played = must(s, { type: "play_operation", cardId: "psy-1" });
    expect(played.corp.credits).toBe(3);
    expect(played.cards["ht-1"]?.advancementCounters).toBe(2);
  });


  it("pays Biawak with credits, Mahkota Langit Grid, and a forfeited agenda (CR 1.16.2e.ex1)", () => {
    let s = createInitialState();
    const ice = instantiateCard("biawak", "biawak-1", "server:hq:ice");
    const grid = instantiateCard(
      "mahkota-langit-grid",
      "grid-1",
      "server:hq:root",
    );
    grid.rezzed = true;
    grid.recurringCredits = 2;
    const agenda = instantiateCard("hostile-takeover", "ag-1", "corp:score");
    agenda.faceup = true;
    s.cards["biawak-1"] = ice;
    s.cards["grid-1"] = grid;
    s.cards["ag-1"] = agenda;
    s.servers.hq.ice = ["biawak-1"];
    s.servers.hq.root = ["grid-1"];
    s.corp.scoreArea = ["ag-1"];
    s.corp.credits = 2;
    s.activeSide = "corp";
    s.timingKey = "run.approachPaw";
    s.run = {
      attackedServerId: "hq",
      phase: "approach",
      position: 0,
      successful: null,
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
    s = must(s, { type: "rez_ice", cardId: "biawak-1" });
    s = must(s, { type: "choose_option", optionId: "rez-forfeit-discount" });
    expect(s.cards["biawak-1"]?.rezzed).toBe(true);
    expect(s.corp.credits).toBe(0);
    expect(s.cards["grid-1"]?.recurringCredits).toBe(0);
    expect(s.corp.scoreArea).not.toContain("ag-1");
  });


  it("splits Tucana's 3-credit discount so Logjam costs 0 to install and 4 to rez (CR 1.16.2f.ex1)", () => {
    let s = createInitialState();
    const tucana = instantiateCard("tucana", "tucana-1", "server:remote-1:root");
    tucana.rezzed = true;
    const wall = instantiateCard("ice-wall", "wall-1", "server:remote-1:ice");
    const jam = instantiateCard("logjam", "jam-1", "corp:rd");
    s.cards["tucana-1"] = tucana;
    s.cards["wall-1"] = wall;
    s.cards["jam-1"] = jam;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: ["wall-1"],
      root: ["tucana-1"],
    };
    s.corp.deck = ["jam-1"];
    s.corp.credits = 10;
    const offered = evalEffect(
      { state: s, sourceId: "tucana-1" },
      fx.do({
        kind: "search_rd_install_rez_ice_on_source_server",
        totalDiscount: 3,
      }),
    );
    expect(offered.ok).toBe(true);
    expect(s.pendingChoice?.options.map((option) => option.id)).toContain(
      "split-install:1",
    );
    s = must(s, { type: "choose_option", optionId: "split-install:1" });
    expect(s.corp.credits).toBe(6);
    expect(s.cards["jam-1"]?.rezzed).toBe(true);
    expect(s.servers["remote-1"]?.ice[0]).toBe("jam-1");
    expect(s.log.join("\n")).toContain("1.16.2f");
  });


  it("counts Blue Level Clearance's click and its additional click as one action (CR 1.16.4d.ex1)", () => {
    const s = createInitialState();
    const jeeves = instantiateCard(
      "jeeves-model-bioroids",
      "jeeves-1",
      "server:hq:root",
    );
    jeeves.rezzed = true;
    jeeves.gainClickFirstTimeSpendClicksGteOnSameActionEachTurn = 2;
    const op = instantiateCard(
      "blue-level-clearance",
      "blc-1",
      "corp:hq",
    );
    s.cards["jeeves-1"] = jeeves;
    s.cards["blc-1"] = op;
    s.servers.hq.root = ["jeeves-1"];
    s.corp.hand = ["blc-1"];
    s.corp.clicks = 3;
    s.corp.credits = 5;
    s.corp.deck = ["rd-1", "rd-2"];
    s.cards["rd-1"] = instantiateCard("hedge-fund", "rd-1", "corp:rd");
    s.cards["rd-2"] = instantiateCard("hedge-fund", "rd-2", "corp:rd");
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    const played = must(s, { type: "play_operation", cardId: "blc-1" });
    expect(played.corp.clicks).toBe(2);
    expect(played.log.join("\n")).toContain("spent 2 [click]");
  });


  it("charges 1 credit to install ice in front of one ice (CR 1.16.6b)", () => {
    const s = createInitialState();
    const wall = instantiateCard("ice-wall", "wall-1", "server:hq:ice");
    const jam = instantiateCard("logjam", "jam-1", "corp:hq");
    expect(jam.installCost).toBe(0);
    s.cards["wall-1"] = wall;
    s.cards["jam-1"] = jam;
    s.servers.hq.ice = ["wall-1"];
    s.corp.hand = ["jam-1"];
    s.corp.credits = 5;
    s.corp.clicks = 1;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    const installed = must(s, {
      type: "basic_install",
      cardId: "jam-1",
      destination: { kind: "protect", serverId: "hq" },
    });
    expect(installed.corp.credits).toBe(4);
    expect(installed.servers.hq.ice).toContain("jam-1");
  });


  it("can decline Obokata Protocol's additional cost and not steal it (CR 1.16.10a.ex1)", () => {
    let s = createInitialState();
    const agenda = instantiateCard(
      "obokata-protocol",
      "obo-1",
      "server:remote-1:root",
    );
    s.cards["obo-1"] = agenda;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["obo-1"],
    };
    s.runner.hand = ["a", "b", "c", "d"];
    for (const id of s.runner.hand) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    }
    s.run = {
      attackedServerId: "remote-1",
      phase: "breach",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: ["obo-1"],
      randomAccessLimit: 1,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: "obo-1",
    };
    s.timingKey = "access.stealAgenda";
    const types = queryLegality(s).legal.map((entry) => entry.action.type);
    expect(types).toContain("steal_agenda");
    expect(types).toContain("finish_access");
    s = must(s, { type: "finish_access" });
    expect(s.runner.scoreArea).not.toContain("obo-1");
    expect(s.runner.hand).toHaveLength(4);
  });


  it("pays Predictive Algorithm and Ben Musashi together with Obokata Protocol (CR 1.16.10b.ex1)", () => {
    const s = createInitialState();
    const agenda = instantiateCard(
      "obokata-protocol",
      "obo-1",
      "server:remote-1:root",
    );
    const ben = instantiateCard(
      "ben-musashi",
      "ben-1",
      "server:remote-1:root",
    );
    ben.rezzed = true;
    const current = instantiateCard(
      "predictive-algorithm",
      "pred-1",
      "corp:play-area",
    );
    s.cards["obo-1"] = agenda;
    s.cards["ben-1"] = ben;
    s.cards["pred-1"] = current;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["obo-1", "ben-1"],
    };
    s.runner.credits = 2;
    s.runner.hand = ["a", "b", "c", "d", "e", "f"];
    for (const id of s.runner.hand) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    }
    s.run = {
      attackedServerId: "remote-1",
      phase: "breach",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: ["obo-1"],
      randomAccessLimit: 1,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: "obo-1",
    };
    s.timingKey = "access.stealAgenda";
    const broke = applyAction(structuredClone(s), {
      type: "steal_agenda",
      cardId: "obo-1",
    });
    const poor = structuredClone(s);
    poor.runner.credits = 1;
    const types = queryLegality(poor).legal.map((entry) => entry.action.type);
    expect(types).not.toContain("steal_agenda");
    expect(broke.ok).toBe(true);
    if (!broke.ok) return;
    expect(broke.state.runner.credits).toBe(0);
    expect(broke.state.runner.hand).toHaveLength(0);
    expect(broke.state.runner.scoreArea).toContain("obo-1");
  });


  it("resolves Ob Superheavy Logistics before Azef Protocol is scored (CR 1.16.10c.ex1)", () => {
    let s = createInitialState();
    const identity = instantiateCard(
      "ob-superheavy-logistics-extract-export-excel",
      s.corp.identityId,
      "corp:identity",
    );
    s.cards[s.corp.identityId] = identity;
    const agenda = instantiateCard(
      "azef-protocol",
      "azef-1",
      "server:remote-1:root",
    );
    agenda.advancementCounters = 3;
    const pad = instantiateCard("pad-campaign", "pad-1", "server:hq:root");
    pad.rezzed = true;
    const ice = instantiateCard("ice-wall", "ice-1", "corp:rd");
    s.cards["azef-1"] = agenda;
    s.cards["pad-1"] = pad;
    s.cards["ice-1"] = ice;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["azef-1"],
    };
    s.servers.hq.root = ["pad-1"];
    s.corp.deck = ["ice-1"];
    s.corp.clicks = 1;
    s.corp.credits = 5;
    s.activeSide = "corp";
    s.timingKey = "corp.actionPaw";
    s.runner.hand = ["rh1", "rh2"];
    for (const id of s.runner.hand) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    }
    s = must(s, { type: "score_agenda", cardId: "azef-1" });
    s = must(s, { type: "choose_option", optionId: "trash:pad-1" });
    s = must(s, { type: "choose_option", optionId: "ob-rez:ice-1" });
    const log = s.log.join("\n");
    const installedAt = log.indexOf("install Ice Wall");
    const rezzedAt = log.indexOf("rez Ice Wall");
    const scoredAt = log.indexOf("Corp scores Azef Protocol");
    expect(installedAt).toBeGreaterThan(-1);
    expect(rezzedAt).toBeGreaterThan(installedAt);
    expect(scoredAt).toBeGreaterThan(rezzedAt);
    expect(s.corp.scoreArea).toContain("azef-1");
    expect(s.cards["ice-1"]?.rezzed).toBe(true);
  });


  it("does not end the run when the Runner pays the nested credit (CR 1.16.11b.ex1)", () => {
    let s = createInitialState();
    s.runner.credits = 1;
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: { iceId: "ice-1", broken: [false] },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];
    const offered = evalEffect(
      { state: s, sourceId: "ice-1" },
      fx.do({
        kind: "unless",
        payer: "runner",
        cost: { op: "do", action: { kind: "lose_credits", side: "runner", amount: 1 } },
        instruction: { op: "do", action: { kind: "end_the_run" } },
      }),
    );
    expect(offered.ok).toBe(true);
    s = must(s, { type: "choose_option", optionId: "unless-pay" });
    expect(s.runner.credits).toBe(0);
    expect(s.run?.endedTheRun).toBeFalsy();
    expect(s.log.join("\n")).toContain("1.16.11b");
  });


    it("sets the threat level to the higher agenda-point total (CR 1.17.1a.ex1)", () => {
    const low = createInitialState();
    score(low, "r-low", 3, "runner");
    score(low, "c-low", 2, "corp");
    const measured = instantiateCard("measured-response", "mr-low", "corp:hq");
    low.cards["mr-low"] = measured;
    low.corp.hand = ["mr-low"];
    low.corp.clicks = 1;
    low.corp.credits = 10;
    low.activeSide = "corp";
    low.timingKey = "corp.takeAction";
    low.turn.successfulRunLastTurn = true;
    const denied = applyAction(low, { type: "play_operation", cardId: "mr-low" });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error).toContain("Threat 4");

    const s = createInitialState();
    score(s, "r-4", 4, "runner");
    score(s, "c-3", 3, "corp");
    const op = instantiateCard("measured-response", "mr-1", "corp:hq");
    s.cards["mr-1"] = op;
    s.corp.hand = ["mr-1"];
    s.corp.clicks = 1;
    s.corp.credits = 10;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    s.turn.successfulRunLastTurn = true;
    const played = must(s, { type: "play_operation", cardId: "mr-1" });
    expect(played.cards["mr-1"]?.zone).not.toBe("corp:hq");
  });


    it("places Mushin's advancement counters without advancing Oaktown Renovation (CR 1.18.2.ex1)", () => {
    const s = createInitialState();
    const oak = instantiateCard("oaktown-renovation", "oak-1", "corp:hq");
    const mushin = instantiateCard("mushin-no-shin", "mu-1", "corp:hq");
    s.cards["oak-1"] = oak;
    s.cards["mu-1"] = mushin;
    s.corp.hand = ["oak-1", "mu-1"];
    const anchor = instantiateCard("pad-campaign", "anchor-1", "server:remote-1:root");
    s.cards["anchor-1"] = anchor;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["anchor-1"],
    };
    s.corp.clicks = 2;
    s.corp.credits = 5;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    let played = must(s, { type: "play_operation", cardId: "mu-1" });
    played = must(played, { type: "choose_option", optionId: "mushin:oak-1" });
    played = must(played, {
      type: "choose_option",
      optionId: "mushin-srv:remote-1:oak-1",
    });
    expect(played.cards["oak-1"]?.advancementCounters).toBe(3);
    expect(played.corp.credits).toBe(5);
    expect(played.log.some((line) => line.includes("on advance"))).toBe(false);
  });


    it("trashes Fall Guy to gain 2 credits (CR 1.19.4.ex1)", () => {
    const s = createInitialState();
    const fall = instantiateCard("fall-guy", "fg-1", "runner:installed");
    s.cards["fg-1"] = fall;
    s.runner.installed = ["fg-1"];
    s.runner.credits = 0;
    s.activeSide = "runner";
    s.timingKey = "runner.actionPaw";
    const gained = must(s, {
      type: "use_paid_ability",
      cardId: "fg-1",
      abilityId: "fall-guy-credits",
    });
    expect(gained.runner.credits).toBe(2);
    expect(gained.cards["fg-1"]?.zone).toBe("runner:heap");
  });


    it("raises the memory limit by T400 Memory Diamond's +1 MU (CR 1.20.2.ex1)", () => {
    const s = createInitialState();
    expect(s.runner.memoryLimit).toBe(4);
    const chip = instantiateCard("t400-memory-diamond", "t400-1", "runner:installed");
    s.cards["t400-1"] = chip;
    s.runner.installed = ["t400-1"];
    expect(memoryLimit(s)).toBe(5);
  });


  it("installs PAD Campaign with no install cost (CR 8.5.11a)", () => {
    const s = createInitialState();
    const pad = instantiateCard("pad-campaign", "pad-1", "corp:hq");
    expect(pad.installCost).toBe(0);
    s.cards["pad-1"] = pad;
    s.corp.hand = ["pad-1"];
    s.corp.credits = 2;
    s.corp.clicks = 1;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    const installed = must(s, {
      type: "basic_install",
      cardId: "pad-1",
      destination: { kind: "new_remote" },
    });
    expect(installed.corp.credits).toBe(2);
    expect(installed.cards["pad-1"]?.zone).toMatch(/:root$/);
  });


});
