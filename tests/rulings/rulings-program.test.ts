/**
 * Official rulings on programs (CR audit tool 1.14, third batch).
 *
 * Each it() names a card, states the ruling's answer in plain words, and
 * ends with the ruling number at the cards pin (vendor/cards-data/rulings/,
 * numbered in file order). tests/rulings/rulings.test.ts reads these titles. A
 * ruling the engine plays wrong is an it.skip naming the ruling and the CR
 * rule, filed under its area in the CR audit plan, not a fix here.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  legalActions,
} from "../../src/index.js";
import type { GameState } from "../../src/index.js";
import type { Action } from "../../src/state/types/actions.js";
import { trashCard } from "../../src/state/hostingAndTrash/trash.js";
import { checkpointAfterInstruction } from "../../src/legality/checkpoints.js";
import { breakerStrength } from "../../src/effects/continuous/iceStrength.js";
import { resolveIceSubtypes } from "../../src/state/continuous/continuousEffects.js";
import {
  atRunnerAction,
  clearCorpHand,
  clearRd,
  drive,
  fresh,
  installIce,
  installRoot,
  installRunner,
  must,
  optionIds,
  paidAbility,
  pick,
  put,
  runnerTurn,
  toRunnerTurn,
  settle,
  stackRd,
  toCorpTurn,
  toHand,
  walkThrough,
  serverOf,
} from "./rulings-helpers.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.29");
});

/** Walk on to the Runner's next action (see `walkThrough`). */
function walk(s: GameState, stop = atRunnerAction): GameState {
  return walkThrough(s, stop).state;
}

const atEncounter = (s: GameState) => s.timingKey === "run.encounterPaw";

/** The legal paid ability `abilityId` on `cardId`, if one is offered. */
function ability(s: GameState, cardId: string, abilityId: string) {
  return legalActions(s).find(
    (a) =>
      a.type === "use_paid_ability" &&
      a.cardId === cardId &&
      a.abilityId === abilityId,
  );
}

/** Install `defId` from the grip onto rezzed `iceId`. */
function installOnIce(
  s: GameState,
  defId: string,
  id: string,
  iceId: string,
): GameState {
  toHand(s, "runner", defId, id);
  s = must(s, {
    type: "basic_install",
    cardId: id,
    destination: { kind: "host_ice", iceId },
  });
  return drive(s, atRunnerAction);
}

// ---------------------------------------------------------------------------
// Algernon
// ---------------------------------------------------------------------------

describe("Algernon", () => {
  it("Algernon: once it pays for the click, the end-of-turn trash still happens after Dr. Lovegood blanks Algernon (ruling 1)", () => {
    let s = toCorpTurn(runnerTurn(fresh(), 5));
    installRunner(s, "algernon", "alg-1");
    installRunner(s, "dr-lovegood", "lg-1");
    s = toRunnerTurn(s);
    // Algernon's ability first: pay 2 for a click; then Lovegood blanks it.
    for (let i = 0; i < 6 && s.pendingChoice; i++) {
      const ids = optionIds(s);
      const choice =
        ids.find((id) => id.includes("alg-1") && !id.includes("lg-1")) ??
        ids.find((id) => /pay|gain|yes|accept/i.test(id)) ??
        ids.find((id) => id.includes("alg-1")) ??
        ids[0]!;
      s = must(s, { type: "choose_option", optionId: choice });
      s = drive(s, atRunnerAction);
    }
    expect(s.runner.clicks).toBe(5);
    // No successful run this turn.
    s.config.stopAfterFirstCycle = false;
    s.runner.clicks = 1;
    s = must(s, { type: "basic_gain_credit" });
    s = drive(s, (x) => x.activeSide === "corp");
    expect(s.runner.discardPile).toContain("alg-1");
  });
});

// ---------------------------------------------------------------------------
// Botulus
// ---------------------------------------------------------------------------

describe("Botulus", () => {
  it("Botulus: it is not an icebreaker and has no strength, so it breaks a subroutine on ice of any strength (ruling 1)", () => {
    let s = runnerTurn(fresh(), 10);
    s.servers.hq.ice = [];
    installIce(s, "archangel", "aa-1", "hq");
    s = installOnIce(s, "botulus", "bot-1", "aa-1");
    expect(s.cards["bot-1"]!.strength).toBeUndefined();
    expect(s.cards["bot-1"]!.virusCounters).toBe(1);
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, atEncounter);
    s = must(s, ability(s, "bot-1", "break-host")!);
    if (s.pendingChoice) {
      s = must(s, { type: "choose_option", optionId: optionIds(s)[0]! });
    }
    expect(s.run?.encounter?.broken).toEqual([true]);
  });

  it("Botulus: trashed with its host ice, but kept with its counters when the host is only derezzed (ruling 2)", () => {
    // Derezzed: Tranquilizer reaches 3 counters as the turn begins.
    let s = runnerTurn(fresh(), 10);
    s.servers.hq.ice = [];
    installIce(s, "ice-wall", "iw-1", "hq");
    s = installOnIce(s, "botulus", "bot-1", "iw-1");
    s = installOnIce(s, "tranquilizer", "tq-1", "iw-1");
    s.cards["tq-1"]!.virusCounters = 2;
    s = settle(toRunnerTurn(toCorpTurn(s)));
    expect(s.cards["iw-1"]!.rezzed).toBe(false);
    expect(s.cards["iw-1"]!.hostedCardIds).toContain("bot-1");
    expect(s.cards["bot-1"]!.virusCounters).toBe(2);
    // Trashed: the hosted Botulus goes to the heap.
    trashCard(s, "iw-1", { by: "corp" });
    checkpointAfterInstruction(s, "test");
    expect(s.runner.discardPile).toContain("bot-1");
  });
});

// ---------------------------------------------------------------------------
// Cezve
// ---------------------------------------------------------------------------

describe("Cezve", () => {
  // Filed under area 15: with 0 in the pool, Masterwork's run-begin
  // install finds "no installable affordable cards", though the run on HQ
  // has begun and Cezve's 2 credits cover the cost (CR 6.9.1c). With 2 in
  // the pool the install is offered.
  it.skip("Cezve: the run is in progress when Masterwork's run-begin install resolves, so Cezve's credits pay for it (ruling 1; filed, area 15, CR 6.9.1c: Cezve's credits are not counted for the run-begin install)", () => {
    let s = runnerTurn(fresh(), 0);
    s.servers.hq.ice = [];
    installRunner(s, "masterwork-v37", "mw-1");
    installRunner(s, "cezve", "cz-1").recurringCredits = 2;
    // Simulchip costs 1, plus Masterwork's 1: exactly Cezve's 2.
    toHand(s, "runner", "simulchip", "dp-1");
    s = must(s, { type: "basic_run", serverId: "hq" });
    for (let i = 0; i < 4 && s.pendingChoice; i++) {
      const ids = optionIds(s);
      s = must(s, {
        type: "choose_option",
        optionId:
          ids.find((id) => id.includes("dp-1")) ??
          ids.find((id) => !/decline/i.test(id)) ??
          ids[0]!,
      });
    }
    expect(s.runner.installed).toContain("dp-1");
    expect(s.cards["cz-1"]!.recurringCredits ?? 0).toBe(0);
  });

  // Filed under area 6: with memory full, MKUltra's install from the heap
  // logs "insufficient MU" and does nothing; the Runner is never offered
  // to trash Cezve to make room (CR 8.5.6c), even with credits in the pool.
  it.skip("Cezve: a card is trashed to make room before its install cost is paid, so Cezve's credits cannot pay for MKUltra installed over it (ruling 2; filed, area 6, CR 8.5.6c: MKUltra's heap install over full memory offers no trash)", () => {
    /** MKUltra in the heap, memory full with Cezve, encountering a sentry. */
    const board = (pool: number): GameState => {
      let s = runnerTurn(fresh(), pool);
      s.runner.memoryLimit = 1;
      s.servers.hq.ice = [];
      installIce(s, "ichi-1-0", "ichi-1", "hq");
      installRunner(s, "cezve", "cz-1").recurringCredits = 2;
      put(s, "mkultra", "mk-1", "runner:heap");
      s.runner.discardPile.push("mk-1");
      s = must(s, { type: "basic_run", serverId: "hq" });
      s = drive(s, () => false);
      for (let i = 0; i < 4 && s.pendingChoice; i++) {
        const ids = optionIds(s);
        s = must(s, {
          type: "choose_option",
          optionId:
            ids.find((id) => id.includes("cz-1")) ??
            ids.find((id) => /install|mk-1/i.test(id)) ??
            ids[0]!,
        });
      }
      return s;
    };
    // Control: 2 in the pool pays for MKUltra after Cezve is trashed.
    const control = board(2);
    expect(control.runner.installed).toContain("mk-1");
    expect(control.runner.discardPile).toContain("cz-1");
    const s = board(0);
    expect(s.runner.installed).not.toContain("mk-1");
  });
});

// ---------------------------------------------------------------------------
// Clot
// ---------------------------------------------------------------------------

describe("Clot", () => {
  /** The Corp installs Hostile Takeover and advances it twice. */
  function advanceToScore(clot: boolean): GameState {
    let s = toCorpTurn(runnerTurn(fresh(), 5));
    if (clot) installRunner(s, "clot", "clot-1");
    s.corp.credits = 10;
    toHand(s, "corp", "hostile-takeover", "ht-1");
    s = must(s, {
      type: "basic_install",
      cardId: "ht-1",
      destination: { kind: "new_remote" },
    });
    s = drive(s, (x) => x.timingKey === "corp.takeAction");
    s = must(s, { type: "advance", cardId: "ht-1" });
    s = drive(s, (x) => x.timingKey === "corp.takeAction");
    const r = applyAction(s, { type: "advance", cardId: "ht-1" });
    if (!r.ok) throw new Error(r.error);
    return r.state;
  }

  it("Clot: the Corp may score as soon as the last advancement is placed, so Clot must already be installed to stop it (ruling 1)", () => {
    const s = advanceToScore(false);
    expect(s.priorityStack.at(-1)?.priorityHolder ?? s.activeSide).toBe("corp");
    expect(
      legalActions(s).some(
        (a) => a.type === "score_agenda" && a.cardId === "ht-1",
      ),
    ).toBe(true);
    const clot = advanceToScore(true);
    expect(
      legalActions(clot).some(
        (a) => a.type === "score_agenda" && a.cardId === "ht-1",
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Conduit
// ---------------------------------------------------------------------------

/** R&D with no ice and `cards` on top; Conduit installed with `counters`. */
function conduitBoard(
  counters: number,
  cards: Array<[string, string]> = [
    ["hedge-fund", "rd-1"],
    ["hedge-fund", "rd-2"],
    ["hedge-fund", "rd-3"],
    ["hedge-fund", "rd-4"],
  ],
): GameState {
  const s = runnerTurn(fresh(), 5);
  s.servers.rd.ice = [];
  clearRd(s);
  stackRd(s, cards);
  installRunner(s, "conduit", "cd-1").virusCounters = counters;
  return s;
}

function useConduit(s: GameState): GameState {
  return must(s, {
    type: "use_paid_ability",
    cardId: "cd-1",
    abilityId: "run-rd",
    serverId: "rd",
  });
}

/** Play out the run, counting accesses and Conduit's counters at each. */
function conduitWalk(s: GameState): {
  state: GameState;
  accesses: number;
  countersDuringBreach: number[];
} {
  let accesses = 0;
  const countersDuringBreach: number[] = [];
  for (let i = 0; i < 80 && !atRunnerAction(s); i++) {
    if (s.pendingChoice) {
      const ids = optionIds(s);
      s = must(s, {
        type: "choose_option",
        optionId: ids.find((id) => /virus|accept|place/i.test(id)) ?? ids[0]!,
      });
      continue;
    }
    const legal = legalActions(s);
    const next = (
      [
        "continue_run",
        "access_card",
        "finish_access",
        "finish_breach",
        "pass_window",
      ] as Action["type"][]
    )
      .map((type) => legal.find((a) => a.type === type))
      .find(Boolean)!;
    if (next.type === "access_card") {
      accesses++;
      countersDuringBreach.push(s.cards["cd-1"]?.virusCounters ?? 0);
    }
    s = must(s, next);
  }
  return { state: s, accesses, countersDuringBreach };
}

describe("Conduit", () => {
  // Filed under area 14: Conduit's counter is placed when the run is
  // declared successful (its data uses the successful-run trigger), so it
  // is already there during the breach; it should wait for the run to end.
  it.skip("Conduit: the virus counter is placed when the run ends, after the breach of R&D (ruling 1; filed, area 14, CR 6.9.6d: the counter is placed at success, before the breach)", () => {
    const { state, accesses, countersDuringBreach } = conduitWalk(
      useConduit(conduitBoard(0)),
    );
    expect(accesses).toBe(1);
    expect(countersDuringBreach).toEqual([0]);
    expect(state.cards["cd-1"]!.virusCounters).toBe(1);
  });

  // Filed under area 14: the extra accesses are fixed when the ability is
  // used, so Conduit trashed before the breach still gives 2 more.
  it.skip("Conduit: trashed before R&D is breached, it has no counters, so there are no additional accesses (ruling 2; filed, area 14, CR 6.7.4b: the count is taken when the run starts, not when the breach begins)", () => {
    const s = useConduit(conduitBoard(2));
    trashCard(s, "cd-1", { by: "runner" });
    const { accesses } = conduitWalk(s);
    expect(accesses).toBe(1);
  });

  it("Conduit: the access count is set when the breach begins, so a purge by Cyberdex Virus Suite mid-breach leaves the third access (ruling 3)", () => {
    let s = conduitBoard(2, [
      ["hedge-fund", "rd-1"],
      ["cyberdex-virus-suite", "cvs-1"],
      ["hedge-fund", "rd-3"],
      ["hedge-fund", "rd-4"],
    ]);
    s = useConduit(s);
    const { state, accesses } = conduitWalk(s);
    expect(accesses).toBe(3);
    // Purged mid-breach; the run's end then places 1.
    expect(state.cards["cd-1"]!.virusCounters ?? 0).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Cradle
// ---------------------------------------------------------------------------

describe("Cradle", () => {
  it("Cradle: with 6 cards in the grip its strength is -1, and it can break only ice of strength -1 or less (ruling 1)", () => {
    let s = runnerTurn(fresh(), 10);
    s.servers.hq.ice = [];
    installIce(s, "enigma", "en-1", "hq");
    installRunner(s, "cradle", "cr-1");
    for (let i = 1; i <= 6; i++) toHand(s, "runner", "sure-gamble", `g-${i}`);
    expect(breakerStrength(s, "cr-1")).toBe(-1);
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, atEncounter);
    expect(
      legalActions(s).some(
        (a) => a.type === "break_subroutine" && a.breakerId === "cr-1",
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Egret
// ---------------------------------------------------------------------------

describe("Egret", () => {
  it("Egret: derezzed host ice still gains barrier, code gate and sentry (ruling 1)", () => {
    let s = runnerTurn(fresh(), 10);
    s.servers.hq.ice = [];
    installIce(s, "enigma", "en-1", "hq");
    s = installOnIce(s, "egret", "eg-1", "en-1");
    s = installOnIce(s, "tranquilizer", "tq-1", "en-1");
    s.cards["tq-1"]!.virusCounters = 2;
    s = settle(toRunnerTurn(toCorpTurn(s)));
    expect(s.cards["en-1"]!.rezzed).toBe(false);
    expect(resolveIceSubtypes(s, "en-1")).toEqual(
      expect.arrayContaining(["barrier", "code gate", "sentry"]),
    );
  });
});

// ---------------------------------------------------------------------------
// Fermenter
// ---------------------------------------------------------------------------

describe("Fermenter", () => {
  it("Fermenter: the Corp gets no chance to purge while it resolves, so the Runner gains for every counter (ruling 1)", () => {
    let s = runnerTurn(fresh(), 0);
    installRunner(s, "fermenter", "fe-1").virusCounters = 3;
    installRoot(s, "cyberdex-virus-suite", "cvs-1", true);
    s = must(s, {
      type: "use_paid_ability",
      cardId: "fe-1",
      abilityId: "fermenter-cash",
    });
    expect(s.runner.credits).toBe(6);
    expect(s.runner.discardPile).toContain("fe-1");
    expect(s.corp.discardPile).not.toContain("cvs-1");
  });
});

// ---------------------------------------------------------------------------
// Hyperbaric
// ---------------------------------------------------------------------------

describe("Hyperbaric", () => {
  it("Hyperbaric: installed by Rigging Up, its install counter comes before the charge, so it can be charged to 2 (ruling 1)", () => {
    let s = runnerTurn(fresh(), 5);
    toHand(s, "runner", "hyperbaric", "hb-1");
    toHand(s, "runner", "rigging-up", "ru-1");
    s = must(s, { type: "play_event", cardId: "ru-1" });
    for (let i = 0; i < 6 && s.pendingChoice; i++) {
      const ids = optionIds(s);
      s = must(s, {
        type: "choose_option",
        optionId:
          ids.find((id) => id.includes("hb-1")) ??
          ids.find((id) => /charge/i.test(id) && !/decline|no/i.test(id)) ??
          ids[0]!,
      });
    }
    s = drive(s, atRunnerAction);
    expect(s.runner.installed).toContain("hb-1");
    expect(s.cards["hb-1"]!.powerCounters).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Ika
// ---------------------------------------------------------------------------

describe("Ika", () => {
  // Filed under area 6 (fix-now candidate): the engine installs every
  // trojan only onto ice ("Trojan must be installed hosted on ice"), but
  // Ika, Bishop, Pawn, Knight and Rook print no such limit; they install
  // in the rig and host themselves on ice by a paid ability (CR 1.13.6c).
  // So Ika cannot be installed on Flame-out.
  it.skip("Ika: paid with Flame-out's credits and then moved onto ice, it is no longer hosted on Flame-out, so it is not trashed when the turn ends (ruling 1; filed, area 6, CR 1.13.6c: a trojan with no install limit can only be installed on ice)", () => {
    let s = runnerTurn(fresh(), 5);
    s.servers.hq.ice = [];
    installIce(s, "enigma", "en-1", "hq");
    installIce(s, "ichi-1-0", "ichi-1", "rd");
    installRunner(s, "flame-out", "fo-1").hostedCredits = 9;
    toHand(s, "runner", "ika", "ika-1");
    s = must(s, {
      type: "basic_install",
      cardId: "ika-1",
      destination: { kind: "host_card", hostId: "fo-1" },
    });
    s = drive(s, atRunnerAction);
    expect(s.cards["ika-1"]!.hostId).toBe("fo-1");
    // Pump outside a run is not offered (see The Twinning ruling 6), so
    // spend Flame-out's credits on Ika's host ability instead.
    s.timingKey = "runner.actionPaw";
    s = must(s, ability(s, "ika-1", "ika-host")!);
    if (s.pendingChoice) s = pick(s, "ichi-1");
    s = drive(s, atRunnerAction);
    expect(s.cards["fo-1"]!.hostedCredits).toBe(7);
    expect(s.cards["ika-1"]!.hostId).toBe("ichi-1");
    s = toCorpTurn(s);
    expect(s.runner.discardPile).not.toContain("ika-1");
  });
});

// ---------------------------------------------------------------------------
// Imp
// ---------------------------------------------------------------------------

describe("Imp", () => {
  it('Imp: its "Access →" ability is used while accessing a card: spend a virus counter to trash it (ruling 1)', () => {
    let s = runnerTurn(fresh(), 0);
    installRunner(s, "imp", "imp-1").virusCounters = 2;
    installRoot(s, "pad-campaign", "root-1", false);
    s = must(s, { type: "basic_run", serverId: serverOf(s, "root-1") });
    s = drive(s, (x) =>
      legalActions(x).some((a) => a.type === "access_trash_with_virus"),
    );
    s = must(s, { type: "access_trash_with_virus", cardId: "root-1" });
    expect(s.corp.discardPile).toContain("root-1");
    expect(s.cards["imp-1"]!.virusCounters).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Leech
// ---------------------------------------------------------------------------

describe("Leech", () => {
  /** Archangel on top of R&D; the Corp pays 3 to make the Runner encounter it. */
  function archangel(defId: string): GameState {
    let s = runnerTurn(fresh(), 0);
    s.servers.rd.ice = [];
    s.corp.credits = 3;
    clearRd(s);
    stackRd(s, [["archangel", "aa-1"]]);
    s.cards["aa-1"]!.rezzed = false;
    installRunner(s, defId, "vir-1").virusCounters = 1;
    s = must(s, { type: "basic_run", serverId: "rd" });
    s = drive(s, () => false);
    for (let i = 0; i < 4 && !atEncounter(s); i++) {
      if (s.pendingChoice) s = pick(s, "accept");
      else s = drive(s, (x) => atEncounter(x) || !!x.pendingChoice);
    }
    expect(s.run?.encounter?.iceId).toBe("aa-1");
    expect(s.cards["aa-1"]!.rezzed).toBe(false);
    return s;
  }

  // Filed under area 7: the forced encounter with an accessed Archangel
  // (`force_encounter_accessed_ice`) sets it rezzed and faceup while it is
  // still in R&D, so Datasucker's "rezzed ice" check passes. A card is
  // rezzed only if installed and faceup (CR 8.1.1). Leech is offered.
  it.skip("Leech: unlike Datasucker it needs no rezzed ice, so it works on Archangel encountered from R&D (ruling 1; filed, area 7, CR 8.1.1: the accessed Archangel is marked rezzed, so Datasucker works too)", () => {
    expect(ability(archangel("leech"), "vir-1", "leech-weaken")).toBeDefined();
    expect(
      ability(archangel("datasucker"), "vir-1", "datasucker-weaken"),
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Mayfly
// ---------------------------------------------------------------------------

describe("Mayfly", () => {
  it("Mayfly: it may break subroutines on several ice in one run and is trashed once, when the run ends (ruling 1)", () => {
    let s = runnerTurn(fresh(), 10);
    s.servers.hq.ice = [];
    installIce(s, "ice-wall", "iw-in", "hq");
    installIce(s, "ice-wall", "iw-out", "hq");
    installRunner(s, "mayfly", "mf-1");
    s = must(s, { type: "basic_run", serverId: "hq" });
    for (const ice of ["iw-out", "iw-in"]) {
      s = drive(s, (x) => atEncounter(x) && x.run?.encounter?.iceId === ice);
      expect(s.run?.encounter?.iceId).toBe(ice);
      s = must(s, { type: "break_subroutine", breakerId: "mf-1", subIndex: 0 });
      expect(s.runner.installed).toContain("mf-1");
    }
    s = walk(s);
    expect(s.runner.discardPile).toContain("mf-1");
    expect(s.runner.discardPile.filter((id) => id === "mf-1")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Paricia
// ---------------------------------------------------------------------------

describe("Paricia", () => {
  // Filed with Scrubber ruling 1 (area 15, CR 1.10.5a).
  it.skip("Paricia: installed it gets 2 credits, and before the Runner's turn begins it refills to 2, adding none when it has 2 or more (ruling 1; filed, area 15, CR 1.10.5a: the refill lowers 3 hosted credits to 2)", () => {
    let s = runnerTurn(fresh(), 10);
    toHand(s, "runner", "paricia", "pa-1");
    s = must(s, {
      type: "basic_install",
      cardId: "pa-1",
      destination: { kind: "installed" },
    });
    expect(s.cards["pa-1"]!.recurringCredits).toBe(2);
    s = drive(s, atRunnerAction);
    s.cards["pa-1"]!.recurringCredits = 1;
    s = settle(toRunnerTurn(toCorpTurn(s)));
    expect(s.cards["pa-1"]!.recurringCredits).toBe(2);
    s.cards["pa-1"]!.recurringCredits = 3;
    s = settle(toRunnerTurn(toCorpTurn(s)));
    expect(s.cards["pa-1"]!.recurringCredits).toBe(3);
  });

  it("Paricia: its credits pay the basic trash cost of an accessed asset, but not Political Operative's X (ruling 2)", () => {
    let s = runnerTurn(fresh(), 2);
    installRunner(s, "paricia", "pa-1").recurringCredits = 2;
    installRoot(s, "pad-campaign", "root-1", false);
    s = must(s, { type: "basic_run", serverId: serverOf(s, "root-1") });
    s = drive(s, (x) =>
      legalActions(x).some(
        (a) => a.type === "trash_accessed" && a.cardId === "root-1",
      ),
    );
    s = must(s, { type: "trash_accessed", cardId: "root-1" });
    expect(s.corp.discardPile).toContain("root-1");
    expect(s.cards["pa-1"]!.recurringCredits ?? 0).toBe(0);
    expect(s.runner.credits).toBe(0);

    const po = (pool: number): GameState => {
      const b = runnerTurn(fresh(), pool);
      b.timingKey = "runner.actionPaw";
      installRunner(b, "paricia", "pa-1").recurringCredits = 2;
      installRunner(b, "political-operative", "po-1");
      installRoot(b, "pad-campaign", "root-1", true);
      return b;
    };
    const control = po(4);
    let c = must(control, paidAbility(control, "po-1")!);
    if (c.pendingChoice) c = pick(c, "root-1");
    expect(c.corp.discardPile).toContain("root-1");
    const b = po(2);
    const use = paidAbility(b, "po-1");
    if (use) {
      const r = applyAction(b, use);
      const after = r.ok ? r.state : b;
      const options = after.pendingChoice ? optionIds(after) : [];
      expect(options.some((id) => id.includes("root-1"))).toBe(false);
      expect(after.corp.discardPile).not.toContain("root-1");
    }
  });
});

// ---------------------------------------------------------------------------
// Revolver
// ---------------------------------------------------------------------------

describe("Revolver", () => {
  it("Revolver: spending a power counter is not a [trash] ability, so Tech Trader gains nothing; trashing Revolver to break does (ruling 1)", () => {
    const board = (abilityId: string): GameState => {
      let s = runnerTurn(fresh(), 10);
      s.servers.hq.ice = [];
      installIce(s, "ichi-1-0", "ichi-1", "hq");
      s.cards["ichi-1"]!.strength = 0;
      installRunner(s, "revolver", "rv-1").powerCounters = 6;
      installRunner(s, "tech-trader", "tt-1");
      s = must(s, { type: "basic_run", serverId: "hq" });
      s = drive(s, atEncounter);
      const credits = s.runner.credits;
      s = must(s, ability(s, "rv-1", abilityId)!);
      if (s.pendingChoice) {
        s = must(s, { type: "choose_option", optionId: optionIds(s)[0]! });
      }
      s.runner.credits -= credits;
      return s;
    };
    const counter = board("revolver-power-break");
    expect(counter.cards["rv-1"]!.powerCounters).toBe(5);
    expect(counter.runner.credits).toBe(0);
    const trashed = board("revolver-trash-break");
    expect(trashed.runner.discardPile).toContain("rv-1");
    expect(trashed.runner.credits).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Sneakdoor Beta
// ---------------------------------------------------------------------------

/** HQ and Archives with no ice, a card in each, and Crisium Grid in `where`. */
function sneakdoorBoard(where: "hq" | "archives" | null): GameState {
  const s = runnerTurn(fresh(), 5);
  clearCorpHand(s);
  toHand(s, "corp", "hedge-fund", "hq-1");
  s.servers.hq.ice = [];
  s.servers.archives.ice = [];
  put(s, "hedge-fund", "ar-1", "corp:archives");
  s.corp.discardPile.push("ar-1");
  if (where) {
    const cg = put(s, "crisium-grid", "cg-1", `server:${where}:root`);
    s.servers[where].root.push("cg-1");
    cg.rezzed = true;
    cg.faceup = true;
  }
  installRunner(s, "sneakdoor-beta", "sd-1");
  return s;
}

function useSneakdoor(s: GameState): GameState {
  return must(s, {
    type: "use_paid_ability",
    cardId: "sd-1",
    abilityId: "sneakdoor-run",
    serverId: "archives",
  });
}

describe("Sneakdoor Beta", () => {
  // Filed under area 14 (fix-now candidate): when Crisium Grid stops the
  // declaration, the engine skips the breach. CR 6.9.5b has the Runner
  // breach whether or not the run was declared successful (6.8.4a).
  it.skip("Sneakdoor Beta: with Crisium Grid in HQ the attacked server still changes to HQ; the run is not successful, but the Runner breaches HQ (ruling 1; filed, area 14, CR 6.9.5b: no breach when the run cannot be declared successful)", () => {
    const s = useSneakdoor(sneakdoorBoard("hq"));
    const start = s.log.length;
    const { state, accessed } = walkThrough(s);
    expect(state.log.slice(start).join("\n")).toMatch(/to hq/);
    expect(state.turn.successfulHqRunThisTurn ?? false).toBe(false);
    expect(accessed).toHaveLength(2);
  });

  // Filed under area 14: the engine changes the run to HQ and declares it
  // successful there, though with Crisium Grid in Archives the run would
  // never be declared successful, so Sneakdoor's ability never triggers.
  it.skip("Sneakdoor Beta: with Crisium Grid in Archives the run stays on Archives, is not successful, and the Runner breaches Archives (ruling 2; filed, area 14, CR 6.9.5a: the run is moved to HQ and declared successful)", () => {
    const { state, accessed } = walkThrough(
      useSneakdoor(sneakdoorBoard("archives")),
    );
    expect(accessed).not.toContain("hq-1");
    expect(accessed).toContain("ar-1");
    expect(state.turn.successfulHqRunThisTurn ?? false).toBe(false);
  });

  it("Sneakdoor Beta: trashed during the run it started, the attacked server still changes to HQ (ruling 3)", () => {
    const s = useSneakdoor(sneakdoorBoard(null));
    trashCard(s, "sd-1", { by: "runner" });
    const { state, accessed } = walkThrough(s);
    expect(state.runner.discardPile).toContain("sd-1");
    expect(accessed).toEqual(["hq-1"]);
  });

  it("Sneakdoor Beta: a run it starts counts as a run on Archives for Red Team, not HQ (ruling 4)", () => {
    let s = sneakdoorBoard(null);
    installRunner(s, "red-team", "rt-1").hostedCredits = 12;
    s = walk(useSneakdoor(s));
    const targets = legalActions(s)
      .filter((a) => a.type === "use_paid_ability" && a.cardId === "rt-1")
      .map((a) => (a as { serverId?: string }).serverId);
    expect(targets).toContain("hq");
    expect(targets).not.toContain("archives");
  });
});

// ---------------------------------------------------------------------------
// Tranquilizer
// ---------------------------------------------------------------------------

/** Rezzed Ice Wall on HQ hosting Tranquilizer, installed from the grip. */
function tranquilizerBoard(): GameState {
  const s = runnerTurn(fresh(), 10);
  s.servers.hq.ice = [];
  installIce(s, "ice-wall", "iw-1", "hq");
  return installOnIce(s, "tranquilizer", "tq-1", "iw-1");
}

describe("Tranquilizer", () => {
  it("Tranquilizer: after it derezzes its host it stays hosted with its counters (ruling 1)", () => {
    let s = tranquilizerBoard();
    s.cards["tq-1"]!.virusCounters = 2;
    s = settle(toRunnerTurn(toCorpTurn(s)));
    expect(s.cards["iw-1"]!.rezzed).toBe(false);
    expect(s.cards["iw-1"]!.hostedCardIds).toContain("tq-1");
    expect(s.cards["tq-1"]!.virusCounters).toBe(3);
  });

  it("Tranquilizer: reaching 3 counters mid-turn (Hivemind installed) does not derez the host (ruling 2)", () => {
    let s = tranquilizerBoard();
    s.cards["tq-1"]!.virusCounters = 2;
    toHand(s, "runner", "hivemind", "hm-1");
    s = must(s, {
      type: "basic_install",
      cardId: "hm-1",
      destination: { kind: "installed" },
    });
    s = drive(s, atRunnerAction);
    expect(s.cards["hm-1"]!.virusCounters).toBe(1);
    expect(s.cards["iw-1"]!.rezzed).toBe(true);
  });

  // Filed with Cookbook ruling 1 (area 11, CR 9.2.8d).
  it.skip("Tranquilizer: with Cookbook and Hivemind, resolving Cookbook first derezzes the host at once; Tranquilizer first does not (ruling 3; filed, area 11, CR 9.2.8d: Tranquilizer always resolves first, with no order offered)", () => {
    const install = (first: string): GameState => {
      let s = runnerTurn(fresh(), 10);
      s.servers.hq.ice = [];
      installIce(s, "ice-wall", "iw-1", "hq");
      installRunner(s, "cookbook", "cb-1");
      installRunner(s, "hivemind", "hm-1").virusCounters = 1;
      toHand(s, "runner", "tranquilizer", "tq-1");
      s = must(s, {
        type: "basic_install",
        cardId: "tq-1",
        destination: { kind: "host_ice", iceId: "iw-1" },
      });
      for (let i = 0; i < 4 && s.pendingChoice; i++) {
        const ids = optionIds(s);
        s = must(s, {
          type: "choose_option",
          optionId:
            ids.find((id) => id.includes(first)) ??
            ids.find((id) => !/decline/.test(id)) ??
            ids[0]!,
        });
      }
      return drive(s, atRunnerAction);
    };
    expect(install("tq-1").cards["iw-1"]!.rezzed).toBe(true);
    expect(install("cb-1").cards["iw-1"]!.rezzed).toBe(false);
  });

  it("Tranquilizer: the Corp may rez its host with 3 counters on it; the ice is derezzed again when the Runner's turn begins (ruling 4)", () => {
    let s = tranquilizerBoard();
    s.cards["tq-1"]!.virusCounters = 2;
    s = settle(toRunnerTurn(toCorpTurn(s)));
    expect(s.cards["iw-1"]!.rezzed).toBe(false);
    s.corp.credits = 5;
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, (x) =>
      legalActions(x).some((a) => a.type === "rez_ice" && a.cardId === "iw-1"),
    );
    s = must(s, { type: "rez_ice", cardId: "iw-1" });
    expect(s.cards["iw-1"]!.rezzed).toBe(true);
    s = settle(s);
    expect(s.cards["iw-1"]!.rezzed).toBe(true);
    s = settle(toRunnerTurn(toCorpTurn(s)));
    expect(s.cards["iw-1"]!.rezzed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unity
// ---------------------------------------------------------------------------

describe("Unity", () => {
  it("Unity: its boost adds the number of installed icebreakers to Unity alone (ruling 1)", () => {
    let s = runnerTurn(fresh(), 10);
    s.servers.hq.ice = [];
    installIce(s, "enigma", "en-1", "hq");
    installRunner(s, "unity", "un-1");
    installRunner(s, "corroder", "cor-1");
    installRunner(s, "gordian-blade", "gb-1");
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, atEncounter);
    const others = [breakerStrength(s, "cor-1"), breakerStrength(s, "gb-1")];
    const unity = breakerStrength(s, "un-1");
    s = must(s, ability(s, "un-1", "unity-pump")!);
    expect(breakerStrength(s, "un-1")).toBe(unity + 3);
    expect([breakerStrength(s, "cor-1"), breakerStrength(s, "gb-1")]).toEqual(
      others,
    );
  });
});
