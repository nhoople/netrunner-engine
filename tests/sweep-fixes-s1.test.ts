/**
 * Printed-text sweep S1 fixes (CR audit program, slice PF-S1).
 *
 * Each describe block is one Startup card the S1 sweep found playing
 * against its printed text (tests/baselines/printed-sweep.json). The card
 * text wins over the model (CR 1.2.1). Each test name states the printed
 * behavior and cites the rule it follows.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  createInitialState,
  enterStep,
  evalEffect,
  instantiateCard,
  legalActions,
} from "../src/index.js";
import type { GameState } from "../src/index.js";
import type { Action, ServerId } from "../src/state/types.js";
import { fx, type Effect } from "../src/effects/ir.js";
import { checkpointAfterInstruction } from "../src/legality/checkpoints.js";
import { trashCard } from "../src/state/procedures/trash.js";
import { iceStrength } from "../src/effects/iceStrength.js";
import { beginBreachAccess } from "../src/state/access.js";
import { applyRunAccessRestrictions } from "../src/state/accessFilter.js";
import { runnerCreditPoolLocked } from "../src/state/costs.js";
import { hostCard } from "../src/state/procedures/host.js";
import { suppressAbilities } from "../src/state/lingeringEffects.js";
import { quoteHostServerRecurringTowardCorpRez } from "../src/cards/stubs.js";
import { fireScoreOrStealSideEffects } from "../src/actions/score.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.27");
});

/** The default board with no Runner card marked rezzed (CR 8.1.4f). */
function fresh(): GameState {
  const s = createInitialState();
  for (const card of Object.values(s.cards)) {
    if (card.side === "runner") card.rezzed = false;
  }
  return s;
}

function must(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) {
    throw new Error(`${result.error} ${JSON.stringify(result.cites)}`);
  }
  return result.state;
}

function run(s: GameState, sourceId: string, effect: Effect) {
  const r = evalEffect({ state: s, sourceId }, effect);
  expect(r.ok, r.ok ? "" : r.error).toBe(true);
}

/** Resolve one option of the open choice as its chooser. */
function pick(s: GameState, optionId: string): void {
  const choice = s.pendingChoice;
  const option = choice?.options.find((o) => o.id === optionId);
  if (!choice || !option) {
    throw new Error(
      `No option ${optionId}; open: ${JSON.stringify(choice?.options.map((o) => o.id))}`,
    );
  }
  s.pendingChoice = null;
  run(s, choice.sourceId, option.effect);
}

/** The Runner's turn, at their first action, with 4 clicks. */
function runnerTurn(): GameState {
  const s = fresh();
  s.activeSide = "runner";
  s.timingKey = "runner.takeAction";
  s.runner.clicks = 4;
  s.runner.credits = 10;
  s.corp.credits = 5;
  s.priorityStack = [];
  // Out of the grip and out of the game, so no card is left in no zone.
  for (const id of s.runner.hand) delete s.cards[id];
  s.runner.hand = [];
  return s;
}

const DRIVE_ORDER: Action["type"][] = [
  "access_card",
  "finish_access",
  "finish_breach",
  "pass_window",
];

/**
 * Play the obvious step (access, finish, pass) until `stop` holds or a
 * choice opens. A test driver: it reads every candidate, hidden ones too.
 */
function drive(s: GameState, stop: (s: GameState) => boolean): GameState {
  for (let i = 0; i < 200; i++) {
    if (stop(s) || s.pendingChoice) return s;
    const legal = legalActions(s);
    const next = DRIVE_ORDER.map((t) => legal.find((a) => a.type === t)).find(
      Boolean,
    );
    if (!next) {
      throw new Error(
        `stuck at ${s.timingKey}: ${legal.map((a) => a.type).join(", ")}`,
      );
    }
    s = must(s, next);
  }
  throw new Error(`no stop at ${s.timingKey}`);
}

function atRunnerAction(s: GameState): boolean {
  return s.timingKey === "runner.takeAction" && !s.run;
}

function breach(s: GameState, server: ServerId): void {
  s.run = {
    attackedServerId: server,
    phase: "breach",
    position: null,
    successful: true,
    accessedCardIds: [],
    accessCandidates: [],
    randomAccessLimit: null,
    encounter: null,
    endedTheRun: false,
    cannotJackOut: false,
    accessingCardId: null,
    breached: true,
  };
  enterStep(s, "breach.awaitAccess");
}

function put(s: GameState, defId: string, id: string, zone: string) {
  const card = instantiateCard(defId, id, zone as never);
  s.cards[id] = card;
  return card;
}

/** A rezzed asset installed in a new remote. */
function installAsset(s: GameState, defId: string, id: string) {
  const serverId = `remote-${id}`;
  (s.servers as Record<string, unknown>)[serverId] = {
    id: serverId,
    kind: "remote",
    root: [id],
    ice: [],
  };
  const card = put(s, defId, id, `server:${serverId}:root`);
  card.rezzed = true;
  return card;
}

describe("first Corp card trash triggers (area 1 trash hooks)", () => {
  it("Cacophony and Epiphany Analytica meet their trigger only when the Runner trashes a Corp card, not when the Corp trashes its own (CR 1.14.5a)", () => {
    const s = fresh();
    const caco = put(s, "cacophony", "caco-1", "runner:installed");
    s.runner.installed.push("caco-1");
    caco.powerCounters = 0;
    installAsset(s, "pad-campaign", "pad-1");
    trashCard(s, "pad-1", { by: "corp" });
    checkpointAfterInstruction(s, "test");
    expect(s.turn.runnerStoleOrTrashedCorpCardThisTurn).toBe(false);
    expect(caco.powerCounters).toBe(0);

    installAsset(s, "pad-campaign", "pad-2");
    trashCard(s, "pad-2", { by: "runner" });
    checkpointAfterInstruction(s, "test");
    expect(s.turn.runnerStoleOrTrashedCorpCardThisTurn).toBe(true);
    expect(caco.powerCounters).toBe(1);
  });

  it("an HQ card the Runner trashes uses Solidarity Badge's first time but not the first installed Corp card trash (CR 9.6.5c)", () => {
    const s = fresh();
    const badge = put(s, "solidarity-badge", "sb-1", "runner:installed");
    s.runner.installed.push("sb-1");
    badge.powerCounters = 0;
    // A source with the installed-only trigger (Aggressive Trendsetting's
    // printed condition; its card data moves to it in paired cut A).
    const watcher = put(s, "sure-gamble", "w-1", "runner:installed");
    s.runner.installed.push("w-1");
    watcher.onFirstInstalledCorpCardTrashEachTurn = fx.gainCredits("runner", 5);
    const credits = s.runner.credits;

    const hqCard = put(s, "pad-campaign", "hq-1", "corp:hq");
    s.corp.hand.push(hqCard.id);
    trashCard(s, "hq-1", { by: "runner" });
    checkpointAfterInstruction(s, "test");
    expect(badge.powerCounters).toBe(1);
    expect(s.runner.credits).toBe(credits);

    installAsset(s, "pad-campaign", "pad-1");
    trashCard(s, "pad-1", { by: "runner" });
    checkpointAfterInstruction(s, "test");
    expect(badge.powerCounters).toBe(1);
    expect(s.runner.credits).toBe(credits + 5);

    installAsset(s, "pad-campaign", "pad-2");
    trashCard(s, "pad-2", { by: "runner" });
    checkpointAfterInstruction(s, "test");
    expect(s.runner.credits).toBe(credits + 5);
  });
});

describe("Ryō “Phoenix” Ōno: Out of the Ashes", () => {
  it("the Corp chooses which card it trashes from HQ, not a random one (CR 1.15.2)", () => {
    const s = fresh();
    const ryo = put(
      s,
      "ryo-phoenix-ono-out-of-the-ashes",
      s.runner.identityId,
      "runner:identity",
    );
    put(s, "hedge-fund", "hq-a", "corp:hq");
    put(s, "ice-wall", "hq-b", "corp:hq");
    s.corp.hand = ["hq-a", "hq-b"];
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
      accessingCardId: null,
      subroutineResolvedThisRun: true,
    } as GameState["run"];
    const credits = s.runner.credits;
    run(s, ryo.id, fx.do({ kind: "ryo_phoenix_on_successful_run" }));
    expect(s.runner.credits).toBe(credits + 1);
    expect(s.corp.hand).toEqual(["hq-a", "hq-b"]);
    expect(s.pendingChoice?.chooser).toBe("corp");
    pick(s, "choose-card:hq-b");
    expect(s.corp.hand).toEqual(["hq-a"]);
    expect(s.corp.discardPile).toContain("hq-b");
  });
});

describe("Scapegoat", () => {
  it("offers only installed Runner cards, not a card Read-Write Share hosts without installing (CR 1.13.2a)", () => {
    const s = fresh();
    put(s, "sure-gamble", "rws-1", "runner:installed");
    put(s, "corroder", "prog-1", "runner:installed");
    s.runner.installed.push("rws-1", "prog-1");
    const hosted = put(s, "datasucker", "hosted-1", "hosted:rws-1");
    hosted.hostId = "rws-1";
    s.cards["rws-1"]!.hostedCardIds = ["hosted-1"];
    run(
      s,
      s.corp.identityId,
      fx.do({ kind: "shuffle_installed_runner_into_stack" }),
    );
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toContain("shuffle-stack:prog-1");
    expect(ids).toContain("shuffle-stack:rws-1");
    expect(ids).not.toContain("shuffle-stack:hosted-1");
  });
});

describe("Madani", () => {
  it("hosts only the programs the Runner chooses, faceup and not installed (CR 1.15.2, 1.13.2a)", () => {
    const s = fresh();
    put(s, "madani", "madani-1", "runner:installed");
    s.runner.installed.push("madani-1");
    put(s, "corroder", "prog-a", "runner:grip");
    put(s, "datasucker", "prog-b", "runner:grip");
    s.runner.hand = ["prog-a", "prog-b"];
    run(s, "madani-1", fx.do({ kind: "host_all_programs_from_grip" }));
    expect(s.pendingChoice?.chooser).toBe("runner");
    pick(s, "choose-card:prog-b");
    pick(s, "choose-cards-done");
    expect(s.runner.hand).toEqual(["prog-a"]);
    expect(s.cards["prog-b"]?.zone).toBe("hosted:madani-1");
    expect(s.cards["prog-b"]?.faceup).toBe(true);
    expect(s.runner.installed).not.toContain("prog-b");
  });
});

describe("Plutus", () => {
  it("the trash-3 rez cost reveals the HQ cards, so they go to Archives faceup (CR 1.21.3, 4.4.6b)", () => {
    const s = fresh();
    const plutus = installAsset(s, "plutus", "plutus-1");
    plutus.rezzed = false;
    put(s, "hedge-fund", "hq-a", "corp:hq");
    put(s, "ice-wall", "hq-b", "corp:hq");
    put(s, "pad-campaign", "hq-c", "corp:hq");
    put(s, "hostile-takeover", "hq-d", "corp:hq");
    s.corp.hand = ["hq-a", "hq-b", "hq-c", "hq-d"];
    run(s, "plutus-1", fx.do({ kind: "pay_rez_additional_cost" }));
    pick(s, "trash-hq-3");
    pick(s, "choose-card:hq-a");
    pick(s, "choose-card:hq-b");
    pick(s, "choose-card:hq-c");
    expect(s.corp.hand).toEqual(["hq-d"]);
    for (const id of ["hq-a", "hq-b", "hq-c"]) {
      expect(s.cards[id]?.zone).toBe("corp:archives");
      expect(s.cards[id]?.faceup).toBe(true);
    }
    expect(s.reveals?.length ?? 0).toBeGreaterThan(0);
  });
});

describe("ezaM", () => {
  it("its +1 strength lasts for the remainder of the run, not just ezaM's encounter (CR 9.10.1)", () => {
    const s = fresh();
    const a = put(s, "ice-wall", "ice-a", "server:hq:ice");
    const b = put(s, "ice-wall", "ice-b", "server:rd:ice");
    a.rezzed = true;
    b.rezzed = true;
    s.servers.hq.ice = ["ice-a"];
    s.servers.rd.ice = ["ice-b"];
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: { iceId: "ice-a", broken: [false], subroutinesResolved: [] },
      endedTheRun: false,
      cannotJackOut: false,
      accessingCardId: null,
    } as unknown as GameState["run"];
    const before = iceStrength(s, "ice-b");
    run(s, "ice-a", fx.do({ kind: "fortify_all_ice", amount: 1 }));
    s.run!.encounter = null;
    checkpointAfterInstruction(s, "encounter ends");
    expect(iceStrength(s, "ice-a")).toBe(before + 1);
    expect(iceStrength(s, "ice-b")).toBe(before + 1);
    s.run = null;
    expect(iceStrength(s, "ice-b")).toBe(before);
  });
});

describe("place_advancements (Key Performance Indicators, Syailendra, Seamless Launch)", () => {
  it("Key Performance Indicators: the Corp chooses which card you can advance gets the counter, with no Decline (CR 1.15.2)", () => {
    const s = fresh();
    installAsset(s, "hostile-takeover", "ag-1");
    installAsset(s, "hostile-takeover", "ag-2");
    run(s, s.corp.identityId, fx.do({ kind: "place_advancements", amount: 1 }));
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(ids).toEqual(["adv:ag-1", "adv:ag-2"]);
    pick(s, "adv:ag-2");
    expect(s.cards["ag-2"]?.advancementCounters).toBe(1);
    expect(s.cards["ag-1"]?.advancementCounters ?? 0).toBe(0);
  });
});

describe("place_advancements keeps its fields through the Corp's pick", () => {
  it("Big Deal still offers to score the chosen card when two cards qualify (CR 1.15.2)", () => {
    const s = fresh();
    installAsset(s, "hostile-takeover", "ag-1");
    installAsset(s, "hostile-takeover", "ag-2");
    for (const id of ["ag-1", "ag-2"]) s.cards[id]!.rezzed = false;
    s.activeSide = "corp";
    run(
      s,
      s.corp.identityId,
      fx.do({ kind: "place_advancements", amount: 4, thenMayScore: true }),
    );
    pick(s, "adv:ag-1");
    expect(s.cards["ag-1"]?.advancementCounters).toBe(4);
    expect(s.pendingChoice?.options.map((o) => o.id)).toContain("score:ag-1");
  });

  it("The Holo Man still places its extra counter when the Corp picks between two cards (CR 1.15.2)", () => {
    const s = fresh();
    const holo = installAsset(s, "hostile-takeover", "ag-1");
    const server = s.servers["remote-ag-1" as ServerId]!;
    put(s, "hostile-takeover", "ag-2", "server:remote-ag-1:root");
    server.root.push("ag-2");
    holo.rezzed = false;
    put(s, "the-holo-man", "holo-1", "server:remote-ag-1:root");
    server.root.push("holo-1");
    s.turn.corpInstalledFromHqThisTurn = false;
    run(
      s,
      "holo-1",
      fx.do({
        kind: "place_advancements",
        amount: 2,
        sameServerRootOrIceAsSource: true,
        bonusAmountIfNoCorpInstallFromHqThisTurn: 1,
      }),
    );
    pick(s, "adv:ag-2");
    expect(s.cards["ag-2"]?.advancementCounters).toBe(3);
  });
});

describe("may_derez_installed (Maglectric Rapid, Stegodon MK IV)", () => {
  it("Maglectric Rapid: the Runner, who controls the ability, chooses the Corp card to derez (CR 1.14.4)", () => {
    const s = fresh();
    put(s, "maglectric-rapid-748-mod", "mag-1", "runner:installed");
    s.runner.installed.push("mag-1");
    installAsset(s, "pad-campaign", "pad-1");
    run(s, "mag-1", fx.do({ kind: "may_derez_installed" }));
    expect(s.pendingChoice?.chooser).toBe("runner");
    pick(s, "derez:pad-1");
    expect(s.cards["pad-1"]?.rezzed).toBe(false);
  });
});

describe("Stowaway", () => {
  it("gains 2 credits only on a successful run on the server its ice protects (CR 4.6.6k)", () => {
    let s = runnerTurn();
    const ice = put(s, "ice-wall", "rd-ice", "server:rd:ice");
    ice.rezzed = false;
    ice.faceup = false;
    s.servers.rd.ice = ["rd-ice"];
    const stow = put(s, "stowaway", "stow-1", "runner:installed");
    s.runner.installed.push("stow-1");
    hostCard(s, "stow-1", "rd-ice", { installed: true });
    put(s, "hedge-fund", "rd-1", "corp:rd");
    s.corp.deck.unshift("rd-1");
    s.corp.hand = [];
    expect(stow.hostId).toBe("rd-ice");

    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, atRunnerAction);
    expect(s.runner.credits).toBe(10);

    s = must(s, { type: "basic_run", serverId: "rd" });
    s = drive(s, atRunnerAction);
    expect(s.runner.credits).toBe(12);
  });
});

describe("Aircheck", () => {
  it("its hosted credits and the credit pool lock carry into the remote run while it is active (CR 8.6.5)", () => {
    let s = runnerTurn();
    put(s, "aircheck", "air-1", "runner:grip");
    s.runner.hand = ["air-1"];
    installAsset(s, "pad-campaign", "pad-1");
    s.cards["pad-1"]!.rezzed = false;
    s.cards["pad-1"]!.faceup = false;
    s = must(s, { type: "play_event", cardId: "air-1", serverId: "hq" });
    expect(s.run?.blockCreditPoolSpendAndLose).toBe(true);
    expect(s.run?.eventCredits).toBe(4);
    s = drive(s, (x) => Boolean(x.pendingChoice));
    // The first run is over; Aircheck is still active, so the pool stays
    // locked while the Runner decides on the remote run.
    expect(s.run).toBeNull();
    expect(runnerCreditPoolLocked(s)).toBe(true);
    expect(s.cards["air-1"]?.hostedCredits).toBe(4);
    s = must(s, { type: "choose_option", optionId: "run:remote-pad-1" });
    expect(s.run?.attackedServerId).toBe("remote-pad-1");
    expect(s.run?.blockCreditPoolSpendAndLose).toBe(true);
    expect(s.run?.eventCredits).toBe(4);
    s = drive(s, atRunnerAction);
    expect(runnerCreditPoolLocked(s)).toBe(false);
  });
});

describe("Weyland Consortium: Built to Last", () => {
  it("placing counters with Seamless Launch is not advancing, so it gains nothing (CR 1.18.2)", () => {
    let s = fresh();
    put(
      s,
      "weyland-consortium-built-to-last",
      s.corp.identityId,
      s.cards[s.corp.identityId]!.zone,
    );
    installAsset(s, "hostile-takeover", "ht-1");
    s.cards["ht-1"]!.rezzed = false;
    s.cards["ht-1"]!.faceup = false;
    put(s, "seamless-launch", "sl-1", "corp:hq");
    s.corp.hand = ["sl-1"];
    s.corp.credits = 5;
    s.corp.clicks = 3;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    s = must(s, { type: "play_operation", cardId: "sl-1" });
    expect(s.cards["ht-1"]?.advancementCounters).toBe(2);
    // Seamless Launch costs 1; Built to Last adds nothing.
    expect(s.corp.credits).toBe(4);
    expect(s.log.join("\n")).not.toContain("Built to Last becomes pending");
  });
});

describe("Lampades", () => {
  it("cannot trash an accessed agenda, which has no printed rez or play cost to pay (CR 1.16.1)", () => {
    let s = fresh();
    const lamp = put(s, "lampades", "lamp-1", "runner:installed");
    s.runner.installed.push("lamp-1");
    lamp.powerCounters = 3;
    put(s, "hostile-takeover", "ag-1", "corp:hq");
    s.corp.hand = ["ag-1"];
    breach(s, "hq");
    beginBreachAccess(s);
    s = must(s, { type: "access_card", cardId: "ag-1" });
    const offered = (x: GameState) =>
      legalActions(x).some(
        (a) => a.type === "access_trash_paying_printed_cost_from_stealth",
      );
    expect(offered(s)).toBe(false);
    const refused = applyAction(s, {
      type: "access_trash_paying_printed_cost_from_stealth",
      cardId: "ag-1",
      lampadesId: "lamp-1",
    });
    expect(refused.ok).toBe(false);

    // An asset with a printed rez cost of 0 can be trashed for a counter.
    let t = fresh();
    const lamp2 = put(t, "lampades", "lamp-1", "runner:installed");
    t.runner.installed.push("lamp-1");
    lamp2.powerCounters = 3;
    put(t, "plutus", "as-1", "corp:hq");
    t.corp.hand = ["as-1"];
    breach(t, "hq");
    beginBreachAccess(t);
    t = must(t, { type: "access_card", cardId: "as-1" });
    expect(offered(t)).toBe(true);
  });
});

describe("Flagship", () => {
  it("its access cap persists for the rest of the run after the Runner trashes it while accessing it (CR 9.12.5a)", () => {
    const s = fresh();
    const flag = put(s, "flagship", "flag-1", "server:hq:root");
    flag.rezzed = true;
    flag.faceup = true;
    s.servers.hq.root = ["flag-1"];
    put(s, "hedge-fund", "hq-a", "corp:hq");
    put(s, "ice-wall", "hq-b", "corp:hq");
    s.corp.hand = ["hq-a", "hq-b"];
    s.runner.credits = 10;
    breach(s, "hq");
    s.run!.accessedCardIds = ["hq-a"];
    s.run!.accessingCardId = "flag-1";
    trashCard(s, "flag-1", { by: "runner", cause: "access" });
    s.run!.accessingCardId = null;
    expect(s.corp.discardPile).toContain("flag-1");
    applyRunAccessRestrictions(s);
    expect(s.run?.accessCandidates).not.toContain("hq-b");
  });
});

describe("Mahkota Langit Grid", () => {
  it("its hosted credits pay to rez an asset in its root, not an upgrade, and only while it is rezzed (CR 1.2.1)", () => {
    const s = fresh();
    const grid = installAsset(s, "mahkota-langit-grid", "mlg-1");
    grid.recurringCredits = 2;
    const server = s.servers["remote-mlg-1" as ServerId]!;
    const asset = put(s, "pad-campaign", "pad-1", "server:remote-mlg-1:root");
    const upgrade = put(s, "ash-2x3zb9cy", "ash-1", "server:remote-mlg-1:root");
    asset.rezzed = false;
    upgrade.rezzed = false;
    server.root.push("pad-1", "ash-1");
    expect(quoteHostServerRecurringTowardCorpRez(s, "pad-1", 2)).toBe(0);
    expect(quoteHostServerRecurringTowardCorpRez(s, "ash-1", 2)).toBe(2);
    grid.rezzed = false;
    expect(quoteHostServerRecurringTowardCorpRez(s, "pad-1", 2)).toBe(2);
  });
});

describe("Malapert Data Vault", () => {
  it("the Corp may decline the search, and the card it finds is revealed (CR 9.6.9a, 8.7.3)", () => {
    const s = fresh();
    installAsset(s, "malapert-data-vault", "mdv-1");
    // An agenda scored from the vault's server marks the ability.
    const ag = put(s, "hostile-takeover", "ag-1", "corp:score");
    s.corp.scoreArea.push("ag-1");
    ag.scoredThisTurn = true;
    const deck = [...s.corp.deck];
    fireScoreOrStealSideEffects(s, "ag-1", "score", "remote-mdv-1");
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "search",
      "decline",
    ]);
    pick(s, "decline");
    expect(s.corp.deck).toEqual(deck);

    // Searching reveals the found card.
    const t = fresh();
    put(t, "hedge-fund", "rd-op", "corp:rd");
    t.corp.deck.unshift("rd-op");
    run(t, t.corp.identityId, fx.searchRdNonAgenda(true));
    pick(t, "choose-card:rd-op");
    expect(t.corp.hand).toContain("rd-op");
    expect(
      t.reveals?.some((r) => r.cards.some((c) => c.title === "Hedge Fund")),
    ).toBe(true);
  });
});

describe("Cookbook", () => {
  it("is a may: the Runner can decline the virus counter, and it becomes pending instead of applying at once (CR 9.6.9)", () => {
    let s = runnerTurn();
    put(s, "cookbook", "cook-1", "runner:installed");
    s.runner.installed.push("cook-1");
    put(s, "datasucker", "ds-1", "runner:grip");
    s.runner.hand = ["ds-1"];
    s = must(s, {
      type: "basic_install",
      cardId: "ds-1",
      destination: { kind: "installed" },
    });
    expect(s.cards["ds-1"]?.virusCounters ?? 0).toBe(0);
    s = drive(s, (x) => Boolean(x.pendingChoice));
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "place",
      "decline",
    ]);
    s = must(s, { type: "choose_option", optionId: "decline" });
    expect(s.cards["ds-1"]?.virusCounters ?? 0).toBe(0);
  });
});

describe("Sipa", () => {
  it("after the Runner fully breaks and passes the outermost ice, they may swap that ice with another installed piece of ice (CR 8.8.2)", () => {
    let s = runnerTurn();
    for (const [id, server] of [
      ["hq-ice", "hq"],
      ["rd-ice", "rd"],
    ] as const) {
      const ice = put(s, "ice-wall", id, `server:${server}:ice`);
      ice.rezzed = true;
      ice.faceup = true;
      s.servers[server].ice = [id];
    }
    put(s, "sipa", "sipa-1", "runner:installed");
    put(s, "corroder", "cor-1", "runner:installed");
    s.runner.installed.push("sipa-1", "cor-1");
    s.corp.hand = [];
    s = must(s, { type: "basic_run", serverId: "hq" });
    for (let i = 0; i < 100 && !s.pendingChoice; i++) {
      const legal = legalActions(s);
      const next =
        legal.find((a) => a.type === "break_subroutine") ??
        legal.find((a) => a.type === "pass_window");
      if (!next) throw new Error(`stuck at ${s.timingKey}`);
      s = must(s, next);
    }
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "decline",
      "swap-ice:rd-ice",
    ]);
    s = must(s, { type: "choose_option", optionId: "swap-ice:rd-ice" });
    expect(s.servers.hq.ice).toEqual(["rd-ice"]);
    expect(s.servers.rd.ice).toEqual(["hq-ice"]);
  });
});

describe("The Tungsten Tailor (engine half)", () => {
  /** A break on a rezzed Ice Wall (strength 0 with the Tailor). */
  function breakIceWall(blank: boolean): GameState {
    const s = fresh();
    const ice = put(s, "ice-wall", "hq-ice", "server:hq:ice");
    ice.rezzed = true;
    s.servers.hq.ice = ["hq-ice"];
    put(s, "the-tungsten-tailor", "tt-1", "runner:installed");
    put(s, "corroder", "cor-1", "runner:installed");
    s.runner.installed.push("tt-1", "cor-1");
    if (blank) suppressAbilities(s, "tt-1");
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: { iceId: "hq-ice", broken: [false] },
      endedTheRun: false,
      cannotJackOut: false,
      accessingCardId: null,
    } as unknown as GameState["run"];
    run(s, "cor-1", fx.do({ kind: "break_encounter_subroutine" }));
    return s;
  }

  const marked = (s: GameState) =>
    s.turn.inlineConditionalPending?.some(
      (m) => m.abilityKey === "gain-credit-on-break-ice-strength-lte",
    ) ?? false;

  it("its first-break credit becomes pending as a conditional ability, and a blank Tailor's does not (CR 9.3.2b, 9.6.2)", () => {
    const live = breakIceWall(false);
    const credits = live.runner.credits;
    expect(marked(live)).toBe(true);
    checkpointAfterInstruction(live, "break");
    expect(live.runner.credits).toBe(credits + 1);
    expect(marked(breakIceWall(true))).toBe(false);
  });
});
