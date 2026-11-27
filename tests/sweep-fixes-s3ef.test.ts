/**
 * Printed-text sweep S3e and S3f fixes (CR audit program, slice PF-S3c).
 *
 * Each describe block is one Lunar, Order and Chaos or Data and Destiny card
 * the S3 sweep found playing against its printed text
 * (tests/baselines/printed-sweep.json), or a card the program asked this
 * slice to settle. The card text wins over the model (CR 1.2.1). Each test
 * name states the printed behavior and cites the rule it follows. Cards whose
 * fix is card JSON read the pinned catalog, so these tests also prove the
 * paired cards release.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  applyAction,
  crDataPresent,
  evalEffect,
  getCardDef,
  getPublicView,
} from "../src/index.js";
import type { GameState } from "../src/index.js";
import type { ServerId } from "../src/state/types.js";
import type { Effect } from "../src/effects/ir/effect.js";
import { fx } from "../src/effects/ir/fx.js";
import {
  paidAbilityOpenIn,
  payCost,
} from "../src/state/keywordsAndCredits/costs.js";
import {
  trashCorpCurrentsOnAgendaStolen,
  trashCurrentsOnAgendaScored,
} from "../src/state/continuous/currents.js";
import {
  memoryLimit,
  memoryNeededToInstall,
  usedMemory,
} from "../src/state/turnAndActions/turn.js";
import { hostCard } from "../src/state/hostingAndTrash/host.js";
import { runnerInstallCost } from "../src/actions/installRunner.js";
import { trashCard } from "../src/state/hostingAndTrash/trash.js";
import { noteOnRunnerTurnEnd } from "../src/state/turnAndActions/runnerTurnEndHooks.js";
import { applyRunAccessRestrictions } from "../src/state/access/accessFilter.js";
import { coversKind, expectStateDelta, snapshot } from "./kind-coverage.js";
import {
  actionMeetsFirstClickMust,
  firstClickMustBlocks,
} from "../src/state/turnAndActions/firstClickMust.js";
import {
  effectiveBreakerStrength,
  effectiveIceStrength,
  effectiveIceSubtypes,
} from "../src/cards/stubs.js";
import { noteVacuousFullBreak } from "../src/timing/vacuousBreak.js";
import {
  agendaPointsFor,
  effectiveAdvancementRequirement,
} from "../src/state/turnAndActions/scoring.js";
import {
  mayAdvanceInstalledCard,
  printsCanBeAdvanced,
} from "../src/state/counters/advanceable.js";
import {
  clearCorpHand,
  clearRd,
  corpTurn,
  drive,
  fresh,
  installIce,
  installRoot,
  installRunner,
  must,
  optionIds,
  put,
  runnerTurn,
  setIdentity,
  settle,
  stackRd,
  toCorpTurn,
  toHand,
  walkThrough,
} from "./rulings-helpers.js";

import { enhancedLoginProtocolClick } from "../src/state/continuous/currents.js";
import { enterLingeringPlayArea } from "../src/state/zones.js";
import { traceBaseBonus } from "../src/state/cardFlags/staticFlags.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.29");
});

/** Evaluate an effect as `sourceId`'s ability. */
function evalAs(s: GameState, sourceId: string, effect: Effect): void {
  const r = evalEffect({ state: s, sourceId }, effect);
  expect(r.ok, r.ok ? "" : r.error).toBe(true);
}

/** Resolve one option of the open choice directly (unit level). */
function choose(s: GameState, optionId: string): void {
  const choice = s.pendingChoice;
  const option = choice?.options.find((o) => o.id === optionId);
  if (!choice || !option) {
    throw new Error(`No option ${optionId}; open: ${optionIds(s).join(", ")}`);
  }
  s.pendingChoice = null;
  evalAs(s, choice.sourceId, option.effect);
}

/** The card data's instructions for one of a card's abilities. */
function instructions(
  defId: string,
  match: (a: Record<string, unknown>) => boolean,
): Effect {
  const abilities = (
    getCardDef(defId) as unknown as { abilities: Record<string, unknown>[] }
  ).abilities;
  const found = abilities.find(match);
  if (!found) throw new Error(`${defId}: no such ability`);
  return found.instructions as Effect;
}

function remote(s: GameState, id: string, ice: string[] = []): ServerId {
  (s.servers as Record<string, unknown>)[id] = {
    id,
    kind: "remote",
    root: [],
    ice,
  };
  return id as ServerId;
}

/** The Corp picks the first program offered to trash, as a player would. */
function pickProgram(s: GameState): GameState {
  const cardId = s.pendingTrashProgram?.candidates[0];
  if (!cardId) throw new Error("no program to pick");
  const r = applyAction(s, { type: "choose_trash_program", cardId });
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

/** An active current in its side's play area (CR 3.7.1b). */
function current(s: GameState, defId: string, id: string): void {
  const card = put(s, defId, id, "runner:play-area");
  enterLingeringPlayArea(s, id, card.side);
}

/** A run in progress on `serverId`, at its success step. */
function successfulRun(s: GameState, serverId: ServerId): void {
  runOn(s, serverId);
  s.run!.phase = "success";
  s.run!.successful = true;
}

/** The position in the game's random stream: a shuffle moves it. */
function shuffles(s: GameState): number {
  return s.rngState ?? 0;
}

/** A run in progress on `serverId`, encountering nothing. */
function runOn(s: GameState, serverId: ServerId): void {
  s.run = {
    attackedServerId: serverId,
    phase: "approach_ice",
    position: null,
    successful: false,
    accessedCardIds: [],
    accessCandidates: [],
    randomAccessLimit: null,
    encounter: null,
    endedTheRun: false,
    cannotJackOut: false,
    accessingCardId: null,
  };
}

describe("Heartbeat", () => {
  it("can trash itself to prevent 1 damage, since it is one of the Runner's installed cards (CR 1.2.1)", () => {
    const s = runnerTurn(fresh());
    installRunner(s, "heartbeat", "hb-1");
    installRunner(s, "sure-gamble", "x");
    evalAs(
      s,
      "hb-1",
      fx.do({ kind: "trash_installed_prevent_damage", amount: 1 }),
    );
    expect(optionIds(s)).toContain("hb:hb-1");
  });
});

describe("Heinlein Grid", () => {
  it("the Runner loses all their credits when they spend a click during a run on its server, as well as when they lose one (CR 1.11.3b)", () => {
    const s = runnerTurn(fresh(), 7);
    installRoot(s, "heinlein-grid", "hg-1", true);
    runOn(s, "remote-hg-1" as ServerId);
    payCost(s, "runner", { clicks: 1 }, "test");
    expect(s.runner.credits).toBe(0);

    s.runner.credits = 5;
    evalAs(
      s,
      "hg-1",
      fx.do({ kind: "lose_clicks", side: "runner", amount: 1 }),
    );
    expect(s.runner.credits).toBe(0);

    const other = runnerTurn(fresh(), 7);
    installRoot(other, "heinlein-grid", "hg-1", true);
    installRoot(other, "pad-campaign", "pad-1", true);
    runOn(other, "remote-pad-1" as ServerId);
    payCost(other, "runner", { clicks: 1 }, "test");
    expect(other.runner.credits).toBe(7);
  });
});

describe("Helium-3 Deposit", () => {
  it("can place power counters on any card with a power counter: a Runner card, a scored agenda or an identity (CR 1.2.1)", () => {
    const s = fresh();
    const hotel = installRunner(s, "earthrise-hotel", "eh-1");
    hotel.powerCounters = 1;
    const scored = put(s, "15-minutes", "fm-1", "corp:score");
    s.corp.scoreArea.push("fm-1");
    scored.powerCounters = 1;
    put(s, "helium-3-deposit", "he-1", "corp:score");
    s.corp.scoreArea.push("he-1");
    evalAs(
      s,
      "he-1",
      instructions("helium-3-deposit", (a) => a.class === "conditional"),
    );
    expect(optionIds(s)).toEqual(
      expect.arrayContaining(["helium3-2:eh-1", "helium3-2:fm-1"]),
    );
    choose(s, "helium3-2:eh-1");
    expect(hotel.powerCounters).toBe(3);
  });
});

describe("15 Minutes", () => {
  it("the Corp can shuffle it into R&D from its own score area, not only from the Runner's (CR 1.2.1)", () => {
    const s = fresh();
    put(s, "15-minutes", "fm-1", "corp:score");
    s.corp.scoreArea.push("fm-1");
    evalAs(
      s,
      "fm-1",
      instructions("15-minutes", (a) => a.class === "paid"),
    );
    expect(s.corp.scoreArea).not.toContain("fm-1");
    expect(s.corp.deck).toContain("fm-1");
  });

  it("Oracle Thinktank still shuffles only from the Runner's score area, as it prints (CR 1.2.1)", () => {
    const s = fresh();
    put(s, "oracle-thinktank", "ot-1", "corp:score");
    s.corp.scoreArea.push("ot-1");
    evalAs(
      s,
      "ot-1",
      instructions("oracle-thinktank", (a) => a.class === "paid"),
    );
    expect(s.corp.scoreArea).toContain("ot-1");
  });
});

describe("24/7 News Cycle", () => {
  it("resolves Market Research's when-scored ability on Market Research, so the tagged Runner gives it an agenda counter (CR 9.6.14d)", () => {
    const s = fresh();
    s.runner.tags = 1;
    const mr = put(s, "market-research", "mr-1", "corp:score");
    s.corp.scoreArea.push("mr-1");
    put(s, "24-7-news-cycle", "nc-1", "corp:play-area");
    evalAs(
      s,
      "nc-1",
      instructions("24-7-news-cycle", (a) => a.class === "play"),
    );
    choose(s, "247:mr-1");
    choose(s, optionIds(s)[0]!);
    expect(mr.agendaCounters).toBe(1);
    expect(s.cards["nc-1"]!.agendaCounters ?? 0).toBe(0);
  });
});

describe("Always Be Running", () => {
  it("a click ability that starts a run does not meet the first click: only the basic run action or a run event does (CR 1.2.1)", () => {
    const s = runnerTurn(fresh());
    installRunner(s, "always-be-running", "abr-1");
    const sd = installRunner(s, "sneakdoor-beta", "sd-1");
    const abilityId = sd.paidAbilities![0]!.id;
    expect(
      actionMeetsFirstClickMust(s, {
        type: "use_paid_ability",
        cardId: "sd-1",
        abilityId,
      }),
    ).toBe(false);
    expect(
      firstClickMustBlocks(s, {
        type: "use_paid_ability",
        cardId: "sd-1",
        abilityId,
      }),
    ).toBe(true);
    expect(
      actionMeetsFirstClickMust(s, { type: "basic_run", serverId: "hq" }),
    ).toBe(true);
  });
});

describe("Forked, Knifed and Spooned", () => {
  it("Knifed trashes an ice that gained barrier (Sub Boost) once all its subroutines are broken, as it reads the ice's current subtypes (CR 1.2.1)", () => {
    const s = runnerTurn(fresh());
    const server = remote(s, "remote-x");
    installIce(s, "enigma", "en-1", server);
    put(s, "sub-boost", "sb-1", "corp:play-area");
    evalAs(
      s,
      "sb-1",
      instructions("sub-boost", (a) => a.class === "play"),
    );
    choose(s, "host-cond:en-1");
    expect(effectiveIceSubtypes(s, "en-1")).toContain("barrier");
    runOn(s, server);
    s.run!.phase = "encounter";
    s.run!.trashFirstFullyBrokenSubtype = "barrier";
    s.run!.encounter = { iceId: "en-1", broken: [true, true, true] };
    noteVacuousFullBreak(s);
    expect(s.corp.discardPile).toContain("en-1");
  });
});

describe("Nasir Meidan: Cyber Explorer", () => {
  it("loses all credits in the pool, then gains credits equal to the rez cost of the ice encountered (CR 1.2.1)", () => {
    const s = runnerTurn(fresh(), 5);
    setIdentity(s, "runner", "nasir-meidan-cyber-explorer");
    const server = remote(s, "remote-x");
    const ice = installIce(s, "enigma", "en-1", server);
    runOn(s, server);
    s.run!.phase = "encounter";
    s.run!.encounter = { iceId: "en-1", broken: [false, false] };
    evalAs(
      s,
      s.runner.identityId,
      instructions(
        "nasir-meidan-cyber-explorer",
        (a) => a.class === "conditional",
      ),
    );
    expect(s.runner.credits).toBe(ice.rezCost);
  });
});

describe("Patch and Sub Boost", () => {
  it("can be hosted only on a rezzed piece of ice; Eavesdrop still on any ice (CR 1.2.1)", () => {
    for (const defId of ["patch", "sub-boost"]) {
      const s = fresh();
      const server = remote(s, "remote-x");
      installIce(s, "enigma", "up-1", server, true);
      installIce(s, "enigma", "down-1", server, false);
      put(s, defId, "op-1", "corp:play-area");
      evalAs(
        s,
        "op-1",
        instructions(defId, (a) => a.class === "play"),
      );
      expect(optionIds(s), defId).toEqual(["host-cond:up-1"]);
    }
    const s = fresh();
    const server = remote(s, "remote-x");
    installIce(s, "enigma", "down-1", server, false);
    put(s, "eavesdrop", "ed-1", "runner:play-area");
    evalAs(
      s,
      "ed-1",
      instructions("eavesdrop", (a) => a.class === "play"),
    );
    expect(optionIds(s)).toEqual(["host-cond:down-1"]);
  });
});

describe("The Board", () => {
  it("while rezzed, each agenda in the Runner's score area is worth 1 less agenda point; unrezzed, it does nothing (CR 1.8.3a)", () => {
    const s = fresh();
    const board = installRoot(s, "the-board", "tb-1", true);
    put(s, "hostile-takeover", "ht-1", "runner:score");
    s.runner.scoreArea.push("ht-1");
    put(s, "project-atlas", "pa-1", "runner:score");
    s.runner.scoreArea.push("pa-1");
    // Hostile Takeover (1) and Project Atlas (2), each 1 less.
    expect(agendaPointsFor(s, "runner")).toBe(1);
    board.rezzed = false;
    board.faceup = false;
    expect(agendaPointsFor(s, "runner")).toBe(3);
  });

  it("in the Runner's score area as a 2-point agenda it is worth 2 (CR 1.8.4a)", () => {
    const s = fresh();
    const board = put(s, "the-board", "tb-1", "runner:score");
    board.agendaPoints = 2;
    s.runner.scoreArea.push("tb-1");
    expect(agendaPointsFor(s, "runner")).toBe(2);
  });
});

describe("Medical Breakthrough", () => {
  it("only copies in the Corp's or the Runner's score area lower it: the first needs 4, the second 3, the third 2 (CR 9.1.8b; decided 2026-11-21)", () => {
    const s = fresh();
    const mb = installRoot(s, "medical-breakthrough", "mb-1", false);
    // Copies in HQ, R&D, Archives or installed do not count.
    toHand(s, "corp", "medical-breakthrough", "mb-hq");
    stackRd(s, [["medical-breakthrough", "mb-rd"]]);
    put(s, "medical-breakthrough", "mb-arc", "corp:archives");
    s.corp.discardPile.push("mb-arc");
    installRoot(s, "medical-breakthrough", "mb-2", false);
    expect(effectiveAdvancementRequirement(s, mb)).toBe(4);

    put(s, "medical-breakthrough", "mb-c", "corp:score");
    s.corp.scoreArea.push("mb-c");
    expect(effectiveAdvancementRequirement(s, mb)).toBe(3);

    put(s, "medical-breakthrough", "mb-r", "runner:score");
    s.runner.scoreArea.push("mb-r");
    expect(effectiveAdvancementRequirement(s, mb)).toBe(2);
  });
});

describe("Woodcutter, Tyrant and Salvage", () => {
  it("can be advanced only while rezzed, as 'You can advance this ice if it is rezzed' prints; the ability is active while unrezzed but its own condition is not met (CR 9.1.8f, 1.2.1)", () => {
    for (const defId of ["woodcutter", "tyrant", "salvage"]) {
      const s = corpTurn(fresh());
      const server = remote(s, "remote-x");
      const ice = installIce(s, defId, "ice-1", server, false);
      expect(printsCanBeAdvanced(ice), defId).toBe(true);
      expect(mayAdvanceInstalledCard(ice), defId).toBe(false);
      ice.rezzed = true;
      ice.faceup = true;
      expect(mayAdvanceInstalledCard(ice), defId).toBe(true);
    }
  });
});

describe("Scrubbed", () => {
  it("as an active current, gives the first piece of ice encountered each turn -2 strength for the rest of that run, and not the first ice of a later run (CR 3.7.1b)", () => {
    let s = runnerTurn(fresh());
    current(s, "scrubbed", "sc-1");
    const server = remote(s, "remote-x");
    installIce(s, "enigma", "en-1", server);
    const base = getCardDef("enigma").strength!;
    s = must(s, { type: "basic_run", serverId: server });
    s = drive(s, (x) => x.run?.encounter?.iceId === "en-1");
    expect(effectiveIceStrength(s, "en-1")).toBe(base - 2);

    // A later run the same turn: its first ice is not the turn's first.
    let t = runnerTurn(fresh());
    current(t, "scrubbed", "sc-1");
    installIce(t, "enigma", "en-1", remote(t, "remote-x"));
    t.turn.iceEncounteredThisTurn = true;
    t = must(t, { type: "basic_run", serverId: "remote-x" as ServerId });
    t = drive(t, (x) => x.run?.encounter?.iceId === "en-1");
    expect(effectiveIceStrength(t, "en-1")).toBe(base);
  });
});

describe("Wanton Destruction", () => {
  it("declining the replacement breaches HQ as normal; spending clicks replaces the breach (CR 6.7.4c, 9.6.9)", () => {
    const s = runnerTurn(fresh());
    successfulRun(s, "hq");
    put(s, "wanton-destruction", "wd-1", "runner:play-area");
    evalAs(s, "wd-1", fx.do({ kind: "breach_instead_wanton_destruction" }));
    expect(optionIds(s)[0]).toBe("wanton-decline");
    choose(s, "wanton-decline");
    expect(s.run!.skipBreach ?? false).toBe(false);

    const t = runnerTurn(fresh());
    successfulRun(t, "hq");
    put(t, "wanton-destruction", "wd-1", "runner:play-area");
    evalAs(t, "wd-1", fx.do({ kind: "breach_instead_wanton_destruction" }));
    const hq = t.corp.hand.length;
    choose(t, "wanton:2");
    expect(t.run!.skipBreach).toBe(true);
    expect(t.runner.clicks).toBe(2);
    expect(t.corp.hand.length).toBe(Math.max(0, hq - 2));
  });
});

describe("Trade-In", () => {
  it("the Runner may find no hardware, and the stack is shuffled either way; a found card is revealed and added to the grip (CR 8.7.2e, 8.7.3)", () => {
    const s = runnerTurn(fresh());
    const stack = ["sure-gamble", "plascrete-carapace", "dyson-mem-chip"];
    stack.forEach((d, i) => put(s, d, `st-${i}`, "runner:stack"));
    s.runner.deck = stack.map((_, i) => `st-${i}`);
    put(s, "trade-in", "ti-1", "runner:play-area");
    evalAs(s, "ti-1", fx.do({ kind: "resolve_trade_in" }));
    expect(optionIds(s)).toEqual(
      expect.arrayContaining([
        "choose-card:st-1",
        "choose-card:st-2",
        "choose-cards-done",
      ]),
    );
    const before = shuffles(s);
    choose(s, "choose-cards-done");
    expect(s.runner.hand).toEqual([]);
    expect(shuffles(s)).not.toBe(before);

    evalAs(s, "ti-1", fx.do({ kind: "resolve_trade_in" }));
    choose(s, "choose-card:st-1");
    expect(s.runner.hand).toEqual(["st-1"]);
  });
});

describe("Domestic Sleepers", () => {
  it("is worth 1 agenda point while it has at least 1 agenda counter, however many it has (CR 1.2.1)", () => {
    const s = fresh();
    const ds = put(s, "domestic-sleepers", "ds-1", "corp:score");
    s.corp.scoreArea.push("ds-1");
    expect(agendaPointsFor(s, "corp")).toBe(0);
    ds.agendaCounters = 1;
    expect(agendaPointsFor(s, "corp")).toBe(1);
    ds.agendaCounters = 3;
    expect(agendaPointsFor(s, "corp")).toBe(1);
  });
});

describe("Edward Kim: Humanity's Hammer", () => {
  it("trashes the first operation accessed each turn at no cost without asking, and only the first (CR 1.2.1)", () => {
    let s = runnerTurn(fresh(), 3);
    setIdentity(s, "runner", "edward-kim-humanitys-hammer");
    clearCorpHand(s);
    toHand(s, "corp", "hedge-fund", "op-1");
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = walkThrough(s).state;
    expect(s.corp.discardPile).toContain("op-1");
    expect(s.runner.credits).toBe(3);

    toHand(s, "corp", "hedge-fund", "op-2");
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = walkThrough(s).state;
    expect(s.corp.hand).toContain("op-2");
  });
});

describe("Enhanced Login Protocol", () => {
  it("a run event made first does not use it up: the first basic run action that turn still costs an additional click (CR 1.2.1)", () => {
    const s = runnerTurn(fresh());
    current(s, "enhanced-login-protocol", "elp-1");
    s.turn.runnerMadeRunThisTurn = true; // a run event was played first
    expect(enhancedLoginProtocolClick(s)).toBe(true);
    s.turn.runnerTookBasicRunActionThisTurn = true;
    expect(enhancedLoginProtocolClick(s)).toBe(false);
  });
});

describe("TL;DR", () => {
  it("the copied subroutines last only for that encounter: once it ends the ice has its own subroutines again (CR 9.10.1)", () => {
    let s = runnerTurn(fresh());
    installIce(s, "bandwidth", "bw-1", "hq");
    installIce(s, "tl-dr", "tl-1", "hq");
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, (x) => x.run?.encounter?.iceId === "bw-1");
    expect(s.cards["bw-1"]!.subroutines).toHaveLength(2);
    s = drive(s, (x) => !x.run?.encounter);
    expect(s.cards["bw-1"]!.subroutines).toHaveLength(1);
  });
});

describe("Titan Transnational: Investing In Your Future", () => {
  it("places the agenda counter on the agenda just scored, not on the identity (CR 1.2.1)", () => {
    const s = fresh();
    setIdentity(s, "corp", "titan-transnational-investing-in-your-future");
    const ht = put(s, "hostile-takeover", "ht-1", "corp:score");
    s.corp.scoreArea.push("ht-1");
    s.turn.lastScoredOrStolenAgendaId = "ht-1";
    evalAs(
      s,
      s.corp.identityId,
      instructions(
        "titan-transnational-investing-in-your-future",
        (a) => a.class === "conditional",
      ),
    );
    choose(s, "accept");
    expect(ht.agendaCounters).toBe(1);
    expect(s.cards[s.corp.identityId]!.agendaCounters ?? 0).toBe(0);
  });
});

/** Cards that entered the Runner's grip through the draw procedure this turn. */
const runnerDrawn = (s: GameState) => s.turn.uotRunnerCardsDrawnThisTurn ?? 0;

describe("Vigil", () => {
  it("draws through the draw procedure when HQ is at the Corp's maximum hand size (CR 8.4.5)", () => {
    const s = runnerTurn(fresh());
    installRunner(s, "vigil", "vg-1");
    clearCorpHand(s);
    for (let i = 0; i < 5; i++) toHand(s, "corp", "hedge-fund", `hf-${i}`);
    put(s, "sure-gamble", "sg-1", "runner:stack");
    s.runner.deck = ["sg-1"];
    evalAs(
      s,
      "vg-1",
      instructions("vigil", (a) => a.class === "conditional"),
    );
    expect(s.runner.hand).toEqual(["sg-1"]);
    expect(runnerDrawn(s)).toBe(1);
  });
});

describe("Safety First", () => {
  it("draws through the draw procedure when the Runner's turn ends with the grip below maximum hand size (CR 8.4.5)", () => {
    let s = runnerTurn(fresh());
    installRunner(s, "safety-first", "sf-1");
    put(s, "sure-gamble", "sg-1", "runner:stack");
    s.runner.deck.unshift("sg-1");
    const drawn: string[] = [];
    s = toCorpTurn(s);
    for (const line of s.log) {
      if (/Set aside 1/.test(line)) drawn.push(line);
    }
    expect(s.runner.hand).toEqual(["sg-1"]);
    expect(drawn.length).toBeGreaterThan(0);
  });
});

describe("Independent Thinking", () => {
  it("the Runner chooses up to 5 installed cards, they are trashed together, then the Runner draws 2 per card through the draw procedure since one is a directive (CR 9.12.2a, 8.4.5)", () => {
    const s = runnerTurn(fresh());
    installRunner(s, "safety-first", "dir-1");
    installRunner(s, "sure-gamble", "x-1");
    installRunner(s, "daily-casts", "x-2");
    for (let i = 0; i < 6; i++)
      put(s, "sure-gamble", `st-${i}`, "runner:stack");
    s.runner.deck = Array.from({ length: 6 }, (_, i) => `st-${i}`);
    put(s, "independent-thinking", "it-1", "runner:play-area");
    evalAs(
      s,
      "it-1",
      instructions("independent-thinking", (a) => a.class === "play"),
    );
    choose(s, "choose-card:dir-1");
    // Nothing is trashed until the Runner is done choosing.
    expect(s.runner.installed).toContain("dir-1");
    choose(s, "choose-card:x-1");
    choose(s, "choose-cards-done");
    expect(s.runner.discardPile).toEqual(
      expect.arrayContaining(["dir-1", "x-1"]),
    );
    expect(s.runner.hand).toHaveLength(4);
    expect(runnerDrawn(s)).toBe(4);
  });
});

describe("Shannon Claire", () => {
  it("draws the bottom card of R&D through the draw procedure (CR 8.4.5)", () => {
    const s = corpTurn(fresh());
    clearCorpHand(s);
    clearRd(s);
    stackRd(s, [
      ["hedge-fund", "top-1"],
      ["ice-wall", "bottom-1"],
    ]);
    installRoot(s, "shannon-claire", "sc-1", true);
    evalAs(s, "sc-1", fx.do({ kind: "draw_from_bottom_of_rd", amount: 1 }));
    expect(s.corp.hand).toEqual(["bottom-1"]);
    expect(s.corp.deck).toEqual(["top-1"]);
    expect(s.log.some((l) => /Set aside 1/.test(l))).toBe(true);
  });

  it("with R&D empty the Corp still has to draw, so the Runner wins (CR 1.7.2c)", () => {
    const s = corpTurn(fresh());
    clearRd(s);
    installRoot(s, "shannon-claire", "sc-1", true);
    evalAs(s, "sc-1", fx.do({ kind: "draw_from_bottom_of_rd", amount: 1 }));
    expect(s.winner).toBe("runner");
  });
});

/**
 * A subroutine resolving during a run on a server whose Rutherford Grid
 * (+2) and a scored Improved Tracers (+1) raise a base-2 trace to 5.
 */
function traceAtFive(s: GameState, iceDefId: string, link: number): void {
  installRoot(s, "rutherford-grid", "rg-1", true);
  const server = "remote-rg-1" as ServerId;
  installIce(s, iceDefId, "ice-1", server);
  put(s, "improved-tracers", "it-1", "corp:score");
  s.corp.scoreArea.push("it-1");
  runOn(s, server);
  s.run!.phase = "encounter";
  s.run!.position = 0;
  // Its one subroutine is the one resolving now.
  s.run!.encounter = { iceId: "ice-1", broken: [true], notBrokenByRunner: [0] };
  s.timingKey = "run.resolveSub";
  s.runner.link = link;
}

describe("Sagittarius, Taurus and Virgo", () => {
  it("Sagittarius: at trace strength 5 a failed trace still trashes 1 program, and a successful one trashes 2, one choice after the other (CR 10.8.5)", () => {
    const failed = runnerTurn(fresh());
    traceAtFive(failed, "sagittarius", 99);
    installRunner(failed, "corroder", "p-1");
    installRunner(failed, "gordian-blade", "p-2");
    coversKind("resolve_if_trace_strength_at_least");
    const before = snapshot(failed);
    evalAs(failed, "ice-1", fx.do({ kind: "trace_sagittarius_subroutine" }));
    expectStateDelta(before, failed, {
      "pendingTrashProgram.candidates": { to: ["p-1", "p-2"] },
    });
    expect(failed.turn.lastResolvedTraceStrength).toBe(5);
    const after = pickProgram(failed);
    expect(after.runner.installed).toHaveLength(1);
    expect(after.pendingTrashProgram).toBeFalsy();

    let won = runnerTurn(fresh());
    traceAtFive(won, "sagittarius", 0);
    installRunner(won, "corroder", "p-1");
    installRunner(won, "gordian-blade", "p-2");
    installRunner(won, "femme-fatale", "p-3");
    evalAs(won, "ice-1", fx.do({ kind: "trace_sagittarius_subroutine" }));
    won = pickProgram(won);

    expect(won.runner.installed).toHaveLength(2);
    won = pickProgram(won);
    expect(won.runner.installed).toHaveLength(1);
  });

  it("Taurus: at trace strength 5 a failed trace still trashes 1 piece of hardware (CR 10.8.5)", () => {
    const s = runnerTurn(fresh());
    traceAtFive(s, "taurus", 99);
    installRunner(s, "clone-chip", "hw-1");
    evalAs(s, "ice-1", fx.do({ kind: "trace_taurus_subroutine" }));
    expect(s.runner.discardPile).toContain("hw-1");
  });

  it("Virgo: at trace strength 5 a failed trace still gives 1 tag, and a successful one gives 2 (CR 10.8.5)", () => {
    const failed = runnerTurn(fresh());
    traceAtFive(failed, "virgo", 99);
    evalAs(failed, "ice-1", fx.do({ kind: "trace_virgo_subroutine" }));
    expect(failed.runner.tags).toBe(1);

    const won = runnerTurn(fresh());
    traceAtFive(won, "virgo", 0);
    evalAs(won, "ice-1", fx.do({ kind: "trace_virgo_subroutine" }));
    expect(won.runner.tags).toBe(2);
  });
});

describe("Improved Tracers", () => {
  it("while scored, tracer ice has +1 strength and a subroutine's trace has +1 base strength; other traces do not (CR 1.2.1)", () => {
    const s = runnerTurn(fresh());
    const server = remote(s, "remote-x");
    installIce(s, "news-hound", "nh-1", server);
    const base = effectiveIceStrength(s, "nh-1");
    put(s, "improved-tracers", "it-1", "corp:score");
    s.corp.scoreArea.push("it-1");
    expect(effectiveIceStrength(s, "nh-1")).toBe(base + 1);
    s.timingKey = "run.resolveSub";
    expect(traceBaseBonus(s)).toBe(1);
    s.timingKey = "run.encounterPaw";
    expect(traceBaseBonus(s)).toBe(0);
  });
});

describe("Will-o'-the-Wisp", () => {
  it("once the Corp trashes it, the icebreaker used this run goes to the bottom of the stack, not the heap; with none, it is still trashed (CR 1.2.1)", () => {
    const s = runnerTurn(fresh());
    installRoot(s, "will-o-the-wisp", "wow-1", true);
    installRunner(s, "corroder", "brk-1");
    put(s, "sure-gamble", "st-1", "runner:stack");
    s.runner.deck = ["st-1"];
    successfulRun(s, "remote-wow-1" as ServerId);
    s.run!.breakersThatBroke = ["brk-1"];
    evalAs(s, "wow-1", fx.do({ kind: "trash_will_o_wisp_breaker_used" }));
    choose(s, "trash");
    expect(s.corp.discardPile).toContain("wow-1");
    expect(s.runner.deck).toEqual(["st-1", "brk-1"]);
    expect(s.runner.discardPile).not.toContain("brk-1");

    const none = runnerTurn(fresh());
    installRoot(none, "will-o-the-wisp", "wow-1", true);
    successfulRun(none, "remote-wow-1" as ServerId);
    evalAs(none, "wow-1", fx.do({ kind: "trash_will_o_wisp_breaker_used" }));
    choose(none, "trash");
    expect(none.corp.discardPile).toContain("wow-1");
  });
});

describe("Self-destruct", () => {
  it("X is the number of cards its instruction trashes; Self-destruct, trashed as the cost, is not one of them (CR 1.2.1)", () => {
    const s = runnerTurn(fresh());
    const sd = installRoot(s, "self-destruct", "sd-1", true);
    const server = "remote-sd-1" as ServerId;
    installIce(s, "ice-wall", "iw-1", server);
    put(s, "pad-campaign", "pad-1", `server:${server}:root`);
    s.servers[server]!.root.push("pad-1");
    runOn(s, server);
    // The [trash] cost was paid: Self-destruct is in Archives.
    s.servers[server]!.root = s.servers[server]!.root.filter(
      (x) => x !== "sd-1",
    );
    sd.zone = "corp:archives";
    s.corp.discardPile.push("sd-1");
    s.runner.link = 0;
    evalAs(s, "sd-1", fx.do({ kind: "self_destruct_ability" }));
    expect(s.log.some((l) => /Trace initiated strength 2\b/.test(l))).toBe(
      true,
    );
  });
});

describe("Docklands Crackdown", () => {
  it("only the first card the Runner installs each turn costs more, a resource included (CR 1.2.1)", () => {
    const s = runnerTurn(fresh());
    const dc = installRoot(s, "docklands-crackdown", "dc-1", true);
    dc.powerCounters = 2;
    const resource = put(s, "daily-casts", "r-1", "runner:grip");
    const program = put(s, "corroder", "p-1", "runner:grip");
    expect(runnerInstallCost(s, resource)).toBe(resource.installCost! + 2);
    s.turn.runnerInstalledCardThisTurn = true; // the resource went in first
    expect(runnerInstallCost(s, program)).toBe(program.installCost!);
  });
});

describe("Mark Yale", () => {
  it("gains 1 credit whenever the Corp spends an agenda counter as any ability's cost, not only its own (CR 1.2.1)", () => {
    const s = corpTurn(fresh(), 0);
    installRoot(s, "mark-yale", "my-1", true);
    const fu = put(s, "firmware-updates", "fu-1", "corp:score");
    s.corp.scoreArea.push("fu-1");
    fu.agendaCounters = 2;
    payCost(s, "corp", { agendaCounters: 1 }, "test", fu);
    expect(s.corp.credits).toBe(1);
  });
});

describe("MemStrips", () => {
  it("its 3 MU hold only virus programs, and are not counted twice (CR 1.2.1)", () => {
    const s = runnerTurn(fresh());
    const base = memoryLimit(s);
    installRunner(s, "memstrips", "ms-1");
    expect(memoryLimit(s)).toBe(base);
    installRunner(s, "cache", "v-1");
    installRunner(s, "datasucker", "v-2");
    // Two 1-MU viruses fit in MemStrips' 3 MU: no general MU used.
    expect(usedMemory(s)).toBe(0);
    installRunner(s, "hivemind", "v-3"); // 2 MU virus: 1 more fits
    expect(usedMemory(s)).toBe(1);
    installRunner(s, "corroder", "p-1"); // not a virus: general MU
    expect(usedMemory(s)).toBe(2);
  });

  it("a virus program can be installed into MemStrips' free MU when the general MU is full (CR 1.2.1)", () => {
    const s = runnerTurn(fresh());
    installRunner(s, "memstrips", "ms-1");
    for (let i = 0; i < memoryLimit(s); i++) {
      installRunner(s, "corroder", `p-${i}`);
    }
    expect(usedMemory(s)).toBe(memoryLimit(s));
    put(s, "datasucker", "v-1", "runner:grip");
    expect(memoryNeededToInstall(s, "v-1")).toBe(0);
    put(s, "corroder", "p-x", "runner:grip");
    expect(memoryNeededToInstall(s, "p-x")).toBe(1);
  });
});

describe("Leprechaun", () => {
  it("hosts up to 2 programs whatever their memory cost (CR 1.2.1)", () => {
    const s = runnerTurn(fresh());
    const lep = installRunner(s, "leprechaun", "lep-1");
    expect(lep.maxHostedCards).toBe(2);
    expect(lep.daemonHostMaxMu).toBeUndefined();
    for (const [defId, id] of [
      ["hivemind", "h-1"],
      ["djinn", "h-2"],
    ] as const) {
      const program = put(s, defId, id, "runner:installed");
      s.runner.installed.push(id);
      hostCard(s, id, "lep-1", { installed: true });
      expect(program.hostId).toBe("lep-1");
    }
    toHand(s, "runner", "cache", "c-1");
    const third = applyAction(s, {
      type: "basic_install",
      cardId: "c-1",
      destination: { kind: "host_card", hostId: "lep-1" },
    } as never);
    expect(third.ok).toBe(false);
  });
});

describe("Cache, Cyberdex Virus Suite, IT Department, Hades Shard and Utopia Shard", () => {
  it("their non-click paid abilities can be used in every paid ability window, not only some (CR 9.2.7b)", () => {
    const cases: Array<[string, string]> = [
      ["cache", "cache-cash"],
      ["cyberdex-virus-suite", "cvs-purge"],
      ["it-department", "it-department-boost"],
      ["hades-shard", "hades-breach"],
      ["utopia-shard", "utopia-discard"],
    ];
    for (const [defId, abilityId] of cases) {
      const ability = getCardDef(defId).paidAbilities!.find(
        (a) => a.id === abilityId,
      )!;
      for (const paw of [
        "corp_action_paw",
        "runner_action_paw",
        "approach_paw",
        "encounter_paw",
        "run_movement_paw",
      ] as const) {
        expect(paidAbilityOpenIn(ability, paw), `${defId} ${paw}`).toBe(true);
      }
    }
  });
});

describe("Mamba", () => {
  it("its hosted power counter ability can be used in every paid ability window of a run, approach included (CR 9.2.7b)", () => {
    const ability = getCardDef("mamba").paidAbilities!.find(
      (a) => a.id === "mamba-counter",
    )!;
    for (const paw of [
      "approach_paw",
      "encounter_paw",
      "run_movement_paw",
    ] as const) {
      expect(paidAbilityOpenIn(ability, paw), paw).toBe(true);
    }
    expect(paidAbilityOpenIn(ability, "corp_action_paw")).toBe(false);
  });
});

describe("Unscheduled Maintenance", () => {
  it("is trashed when an agenda is scored, not when one is stolen (CR 3.7.1b)", () => {
    const s = fresh();
    current(s, "unscheduled-maintenance", "um-1");
    trashCorpCurrentsOnAgendaStolen(s);
    expect(s.turn.durationPassedCardIds ?? []).not.toContain("um-1");
    trashCurrentsOnAgendaScored(s);
    expect(s.turn.durationPassedCardIds).toContain("um-1");
  });
});

describe("Shattered Remains and Wendigo", () => {
  it("can be advanced, as printed (CR 1.18.3)", () => {
    for (const defId of ["shattered-remains", "wendigo"]) {
      expect(printsCanBeAdvanced(getCardDef(defId) as never), defId).toBe(true);
    }
    const s = runnerTurn(fresh());
    const sr = installRoot(s, "shattered-remains", "sr-1", false);
    sr.advancementCounters = 2;
    evalAs(s, "sr-1", fx.do({ kind: "shattered_remains_access" }));
    expect(optionIds(s)).toContain("pay");
  });
});

describe("LLDS Energy Regulator", () => {
  it("preventing a hardware trash costs 3 credits or trashing it, never nothing (CR 1.16.1)", () => {
    const abilities = getCardDef("llds-energy-regulator").paidAbilities!;
    expect(abilities.map((a) => a.cost)).toEqual([
      { credits: 3 },
      { trashSelf: true },
    ]);
    for (const a of abilities) {
      expect(a.requirePendingTrashCardTypes).toEqual(["hardware"]);
    }
  });
});

describe("Security Chip", () => {
  it("the chosen icebreaker has +1 strength per link for the remainder of the run, and the Runner may choose any number of cloud icebreakers (CR 9.10.1)", () => {
    const s = runnerTurn(fresh());
    s.runner.link = 2;
    installRunner(s, "security-chip", "sc-1");
    installRunner(s, "corroder", "c-1");
    const base = effectiveBreakerStrength(s, "c-1");
    runOn(s, "hq");
    evalAs(s, "sc-1", fx.do({ kind: "boost_breakers_per_link" }));
    choose(s, "sc:c-1");
    expect(effectiveBreakerStrength(s, "c-1")).toBe(base + 2);
    s.run = null;
    expect(effectiveBreakerStrength(s, "c-1")).toBe(base);

    const t = runnerTurn(fresh());
    t.runner.link = 1;
    installRunner(t, "security-chip", "sc-1");
    installRunner(t, "gs-sherman-m3", "cl-1");
    installRunner(t, "creeper", "cl-2");
    runOn(t, "hq");
    evalAs(t, "sc-1", fx.do({ kind: "boost_breakers_per_link" }));
    expect(optionIds(t)).toContain("sc-clouds");
  });
});

describe("I've Had Worse", () => {
  it("draws 3 when net or meat damage trashes it, and not when it is trashed another way (CR 1.2.1)", () => {
    const hit = runnerTurn(fresh());
    toHand(hit, "runner", "ive-had-worse", "ihw-1");
    for (let i = 0; i < 4; i++)
      put(hit, "sure-gamble", `st-${i}`, "runner:stack");
    hit.runner.deck = ["st-0", "st-1", "st-2", "st-3"];
    hit.turn.gripTrashDamageType = "meat";
    trashCard(hit, "ihw-1");
    hit.turn.gripTrashDamageType = undefined;
    expect(hit.runner.hand).toHaveLength(3);

    const other = runnerTurn(fresh());
    toHand(other, "runner", "ive-had-worse", "ihw-1");
    for (let i = 0; i < 4; i++)
      put(other, "sure-gamble", `st-${i}`, "runner:stack");
    other.runner.deck = ["st-0", "st-1", "st-2", "st-3"];
    other.turn.gripTrashDamageType = "core";
    trashCard(other, "ihw-1");
    other.turn.gripTrashDamageType = undefined;
    trashCard(other, "st-0");
    expect(other.runner.hand).toHaveLength(0);
  });
});

describe("Wasteland", () => {
  it("gains 1 credit the first time each turn the Runner trashes one of their installed cards, by a [trash] cost or any other way (CR 1.14.5a)", () => {
    const s = runnerTurn(fresh(), 0);
    installRunner(s, "wasteland", "wl-1");
    installRunner(s, "sure-gamble", "x-1");
    installRunner(s, "daily-casts", "x-2");
    trashCard(s, "x-1", { by: "runner", cause: "cost" });
    expect(s.runner.credits).toBe(1);
    trashCard(s, "x-2", { by: "runner" });
    expect(s.runner.credits).toBe(1);

    const corp = runnerTurn(fresh(), 0);
    installRunner(corp, "wasteland", "wl-1");
    installRunner(corp, "sure-gamble", "x-1");
    trashCard(corp, "x-1", { by: "corp" });
    expect(corp.runner.credits).toBe(0);
  });
});

describe("Three Steps Ahead", () => {
  it("pays only for a copy played this turn; a copy in the heap from an earlier turn or discarded unplayed pays nothing (CR 9.6.13c)", () => {
    const s = runnerTurn(fresh(), 0);
    put(s, "three-steps-ahead", "tsa-1", "runner:heap");
    s.runner.discardPile.push("tsa-1");
    s.turn.successfulRunCountThisTurn = 2;
    noteOnRunnerTurnEnd(s, "tsa-1");
    expect(s.turn.runnerTurnEndPendingIds ?? []).not.toContain("tsa-1");
    s.turn.eventIdsPlayedThisTurn = ["tsa-1"];
    noteOnRunnerTurnEnd(s, "tsa-1");
    expect(s.turn.runnerTurnEndPendingIds).toContain("tsa-1");
  });
});

describe("Checkpoint", () => {
  it("after a successful trace the Runner suffers 3 meat damage when the run becomes successful (CR 9.6.13c)", () => {
    let s = runnerTurn(fresh());
    clearCorpHand(s);
    for (let i = 0; i < 4; i++) toHand(s, "runner", "sure-gamble", `g-${i}`);
    s = must(s, { type: "basic_run", serverId: "hq" });
    s.run!.delayedMeatDamageOnSuccess = [{ sourceId: "cp-1", amount: 3 }];
    put(s, "checkpoint", "cp-1", "corp:archives");
    s.corp.discardPile.push("cp-1");
    s = settle(s);
    expect(s.runner.hand).toHaveLength(1);
  });

  it("its subroutine records the delayed damage instead of a field nothing reads (CR 9.6.13c)", () => {
    const s = runnerTurn(fresh());
    runOn(s, "hq");
    installIce(s, "checkpoint", "cp-1", "hq");
    evalAs(
      s,
      "cp-1",
      fx.do({ kind: "checkpoint_schedule_meat_on_successful_run", amount: 3 }),
    );
    expect(s.run!.delayedMeatDamageOnSuccess).toEqual([
      { sourceId: "cp-1", amount: 3 },
    ]);
  });
});

describe("Eater", () => {
  it("once it breaks a subroutine the Runner cannot access cards for the rest of the run (CR 1.2.1); its pump was fixed by FX-pump", () => {
    const s = runnerTurn(fresh());
    s.run = null;
    runOn(s, "hq");
    s.run!.cannotAccessCardsThisRun = true;
    s.run!.accessCandidates = [...s.corp.hand];
    applyRunAccessRestrictions(s);
    expect(s.run!.accessCandidates).toEqual([]);
    expect(getCardDef("eater").breaker?.breakPreventsCardAccessForRun).toBe(
      true,
    );
  });
});

describe("Architect", () => {
  it("installs a looked-at card ignoring the install cost without rezzing it (CR 8.5.2)", () => {
    const s = corpTurn(fresh());
    clearRd(s);
    stackRd(s, [
      ["pad-campaign", "pad-1"],
      ["ice-wall", "iw-1"],
    ]);
    installIce(s, "architect", "ar-1", "hq");
    coversKind("look_top_n_rd_may_install_ignore_install_cost");
    const before = snapshot(s);
    evalAs(
      s,
      "ar-1",
      instructions("architect", (a) => a.id === "architect-rd"),
    );
    expectStateDelta(before, s, {
      "turn.rdLookedCards": { to: ["pad-1", "iw-1"] },
    });
    choose(s, "rd-look-install-rez:pad-1");
    expect(s.cards["pad-1"]!.zone).toMatch(/^server:remote-.*:root$/);
    expect(s.cards["pad-1"]!.rezzed).toBe(false);
  });
});

describe("Eliza's Toybox", () => {
  it("rezzes any card, an asset or upgrade as well as ice, ignoring all costs (CR 8.1.2c)", () => {
    const s = corpTurn(fresh(), 0);
    installRoot(s, "elizas-toybox", "et-1", true);
    installRoot(s, "pad-campaign", "pad-1", false);
    installIce(s, "ice-wall", "iw-1", "hq", false);
    coversKind("rez_card_ignoring_costs");
    evalAs(
      s,
      "et-1",
      instructions("elizas-toybox", (a) => a.class === "paid"),
    );
    expect(optionIds(s)).toEqual(
      expect.arrayContaining(["rez-free:pad-1", "rez-free:iw-1"]),
    );
    const before = snapshot(s);
    choose(s, "rez-free:pad-1");
    expectStateDelta(before, s, {
      "cards.pad-1.rezzed": { from: false, to: true },
    });
    expect(s.corp.credits).toBe(0);
  });
});

describe("Globalsec Security Clearance", () => {
  it("the Runner looks at the top card of R&D; it is not revealed to the Corp (CR 1.21.2, 10.2.2a)", () => {
    const s = runnerTurn(fresh());
    clearRd(s);
    stackRd(s, [["hedge-fund", "top-1"]]);
    installRunner(s, "globalsec-security-clearance", "gs-1");
    const reveals = s.revealSeq ?? 0;
    evalAs(
      s,
      "gs-1",
      instructions(
        "globalsec-security-clearance",
        (a) => a.class === "conditional",
      ),
    );
    choose(s, "accept");
    expect(s.cards["top-1"]!.lookedBy).toBe("runner");
    expect(s.revealSeq ?? 0).toBe(reveals);
    expect(s.corp.deck[0]).toBe("top-1");
  });
});

describe("Hunting Grounds", () => {
  it("its interrupt prevents the encountered ice's when-encountered ability (CR 1.2.1)", () => {
    const s = runnerTurn(fresh());
    installRunner(s, "hunting-grounds", "hg-1");
    installIce(s, "tollbooth", "tb-1", "hq");
    runOn(s, "hq");
    s.run!.phase = "encounter";
    s.run!.position = 0;
    s.run!.encounter = {
      iceId: "tb-1",
      broken: [false],
      onEncounterPending: true,
    };
    evalAs(
      s,
      "hg-1",
      instructions(
        "hunting-grounds",
        (a) => a.id === "hunting-grounds-prevent",
      ),
    );
    expect(s.run!.encounter!.onEncounterPrevented).toBe(true);
    expect(s.run!.encounter!.onEncounterPending).toBe(false);
  });
});

describe("Eden Shard", () => {
  it("has its printed [trash] ability: the Corp draws 2 cards (CR 1.2.1)", () => {
    const s = runnerTurn(fresh());
    clearCorpHand(s);
    installRunner(s, "eden-shard", "es-1");
    evalAs(
      s,
      "es-1",
      instructions("eden-shard", (a) => a.id === "eden-draw"),
    );
    expect(s.corp.hand).toHaveLength(2);
    const paid = getCardDef("eden-shard").paidAbilities!.find(
      (a) => a.id === "eden-draw",
    )!;
    expect(paid.cost).toEqual({ trashSelf: true });
  });
});

describe("Code Siphon", () => {
  it("the Runner may find no program, only programs they can pay for are offered, the stack is shuffled before the install, and the tag is taken even when nothing is found (CR 8.7.2b, 8.7.2e, 8.7.3, 1.2.4)", () => {
    const s = runnerTurn(fresh(), 1);
    successfulRun(s, "rd");
    put(s, "corroder", "cheap-1", "runner:stack"); // 2¢
    put(s, "femme-fatale", "dear-1", "runner:stack"); // 9¢
    put(s, "sure-gamble", "ev-1", "runner:stack");
    s.runner.deck = ["cheap-1", "dear-1", "ev-1"];
    installIce(s, "ice-wall", "iw-1", "rd");
    put(s, "code-siphon", "cs-1", "runner:play-area");
    evalAs(s, "cs-1", fx.do({ kind: "breach_instead_code_siphon" }));
    expect(optionIds(s)).toEqual(["choose-card:cheap-1", "choose-cards-done"]);
    choose(s, "choose-card:cheap-1");
    expect(s.runner.installed).toContain("cheap-1");
    expect(s.runner.credits).toBe(1);
    expect(s.runner.tags).toBe(1);

    const none = runnerTurn(fresh(), 1);
    successfulRun(none, "rd");
    put(none, "corroder", "cheap-1", "runner:stack");
    none.runner.deck = ["cheap-1"];
    put(none, "code-siphon", "cs-1", "runner:play-area");
    evalAs(none, "cs-1", fx.do({ kind: "breach_instead_code_siphon" }));
    choose(none, "choose-cards-done");
    expect(none.runner.installed).not.toContain("cheap-1");
    expect(none.run!.skipBreach).toBe(true);
    // No "if able": the tag is still taken (CR 1.2.4).
    expect(none.runner.tags).toBe(1);
  });
});

describe("The Foundry: Refining the Process", () => {
  it("already fixed by FX-access: the Corp may decline the search and the search may find nothing; R&D is shuffled either way (CR 9.6.9, 8.7.2e, 8.7.3)", () => {
    const s = corpTurn(fresh());
    setIdentity(s, "corp", "the-foundry-refining-the-process");
    installIce(s, "ice-wall", "iw-1", "hq");
    stackRd(s, [["ice-wall", "iw-2"]]);
    s.turn.iceRezzedThisTurn = 1;
    s.turn.rezzedThisTurnIds = ["iw-1"];
    const sid = s.corp.identityId;
    evalAs(s, sid, fx.do({ kind: "search_foundry_copy_to_hq" }));
    expect(optionIds(s)).toEqual(["search", "decline"]);
    choose(s, "search");
    expect(optionIds(s)).toContain("choose-cards-done");
    choose(s, "choose-cards-done");
    expect(s.corp.hand).not.toContain("iw-2");
  });
});

describe("What the other seat sees in these choices", () => {
  const runnerView = (s: GameState) =>
    JSON.stringify(getPublicView(s, "runner").pendingChoice?.options);

  it("Eliza's Toybox: the Runner sees the same choice whether or not an unrezzed agenda is installed (CR 10.2.2a)", () => {
    const board = (withAgenda: boolean) => {
      const s = corpTurn(fresh());
      installRoot(s, "elizas-toybox", "et-1", true);
      installRoot(s, "pad-campaign", "pad-1", false);
      if (withAgenda) installRoot(s, "hostile-takeover", "ht-1", false);
      evalAs(
        s,
        "et-1",
        instructions("elizas-toybox", (a) => a.class === "paid"),
      );
      return s;
    };
    expect(runnerView(board(true))).toBe(runnerView(board(false)));
  });

  it("Architect: the Runner sees the same choice whatever mix of cards is in the top 5 of R&D (CR 10.2.2a)", () => {
    const board = (operation: boolean) => {
      const s = corpTurn(fresh());
      clearRd(s);
      stackRd(s, [
        ["pad-campaign", "a"],
        [operation ? "hedge-fund" : "ice-wall", "b"],
      ]);
      installIce(s, "architect", "ar-1", "hq");
      evalAs(
        s,
        "ar-1",
        instructions("architect", (a) => a.id === "architect-rd"),
      );
      return s;
    };
    expect(runnerView(board(true))).toBe(runnerView(board(false)));
  });

  it("Independent Thinking: the Corp's view names no facedown installed card (CR 8.1.4a, 10.2.2a)", () => {
    const s = runnerTurn(fresh());
    const down = installRunner(s, "femme-fatale", "fd-1");
    down.faceup = false;
    installRunner(s, "sure-gamble", "x-1");
    put(s, "independent-thinking", "it-1", "runner:play-area");
    evalAs(
      s,
      "it-1",
      instructions("independent-thinking", (a) => a.class === "play"),
    );
    const corpView = JSON.stringify(getPublicView(s, "corp").pendingChoice);
    expect(corpView).not.toContain("Femme Fatale");
  });
});
