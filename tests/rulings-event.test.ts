/**
 * Official rulings on events (CR audit tool 1.14, second batch).
 *
 * Each it() names a card, states the ruling's answer in plain words, and
 * ends with the ruling number at the cards pin (vendor/cards-data/rulings/,
 * numbered in file order). tests/rulings.test.ts reads these titles. A
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
} from "../src/index.js";
import type { GameState } from "../src/index.js";
import type { ServerId } from "../src/state/types.js";
import { currentMark } from "../src/state/msKeywords.js";
import { passIdle } from "../src/demo/passIdle.js";
import { trashCard } from "../src/state/procedures/trash.js";
import { checkpointAfterInstruction } from "../src/legality/checkpoints.js";
import { expectStateDelta, snapshot } from "./kind-coverage.js";
import {
  atRunnerAction,
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
  setIdentity,
  stackRd,
  toHand,
  clearCorpHand,
  clearRd,
  walkThrough,
} from "./rulings-helpers.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.28");
});

/** Replace the Runner's stack with `n` copies of `defId`, ids `st-1`… */
function stack(s: GameState, n: number, defId = "sure-gamble"): void {
  for (const id of s.runner.deck) delete s.cards[id];
  s.runner.deck = [];
  for (let i = 1; i <= n; i++) {
    put(s, defId, `st-${i}`, "runner:stack");
    s.runner.deck.push(`st-${i}`);
  }
}

/** Decline every "you may" the play opens (Carpe Diem's run). */
function declineAll(s: GameState): GameState {
  while (s.pendingChoice) {
    const decline = optionIds(s).find((id) => id === "decline");
    s = must(s, {
      type: "choose_option",
      optionId: decline ?? optionIds(s)[0]!,
    });
  }
  return s;
}

/** Walk on to the Runner's next action (see `walkThrough`). */
function walk(s: GameState): { state: GameState; accessed: string[] } {
  return walkThrough(s);
}

// ---------------------------------------------------------------------------
// Carpe Diem
// ---------------------------------------------------------------------------

describe("Carpe Diem", () => {
  it("Carpe Diem: the mark it identifies stays the Runner's mark after the event is trashed (ruling 1)", () => {
    let s = runnerTurn(fresh());
    toHand(s, "runner", "carpe-diem", "cd-1");
    s = must(s, { type: "play_event", cardId: "cd-1" });
    s = declineAll(s);
    s = drive(s, atRunnerAction);
    expect(s.runner.discardPile).toContain("cd-1");
    expect(currentMark(s)).not.toBeNull();
  });

  it("Carpe Diem: a second instruction to identify the mark that turn changes nothing (ruling 2)", () => {
    let s = runnerTurn(fresh());
    toHand(s, "runner", "carpe-diem", "cd-1");
    toHand(s, "runner", "carpe-diem", "cd-2");
    s = must(s, { type: "play_event", cardId: "cd-1" });
    s = declineAll(s);
    const mark = currentMark(s);
    expect(mark).not.toBeNull();
    for (let i = 0; i < 5; i++) {
      // Back to the action step before the next action (CR 5.2.4).
      s = drive(s, atRunnerAction);
      s = must(s, { type: "play_event", cardId: "cd-2" });
      s = declineAll(s);
      expect(currentMark(s)).toBe(mark);
      // Back to the grip to try again: the mark never moves.
      s.runner.discardPile = s.runner.discardPile.filter((id) => id !== "cd-2");
      toHand(s, "runner", "carpe-diem", "cd-2");
      s.runner.clicks = 4;
    }
  });

  // Filed under area 15: after a successful run on R&D, a Carpe Diem that
  // makes R&D the mark and runs it gains no click from Sable, though the
  // same run with no earlier R&D run does. Sable's "first time each turn"
  // counts runs from before R&D was the mark (CR 10.11.5).
  it.skip("Carpe Diem: a successful run made before the server became the mark is not a run on the mark; a later run on it is (ruling 3; filed, area 15, CR 10.11.5: the earlier run uses up the first run on the mark)", () => {
    let s = runnerTurn(fresh());
    setIdentity(s, "runner", "nyusha-sable-sintashta-symphonic-prodigy");
    clearCorpHand(s);
    for (const server of ["hq", "rd", "archives"] as const) {
      s.servers[server].ice = [];
      s = must(s, { type: "basic_run", serverId: server });
      s = drive(s, atRunnerAction);
    }
    expect(s.runner.clicks).toBe(1);
    toHand(s, "runner", "carpe-diem", "cd-1");
    s.runner.clicks = 2;
    s = must(s, { type: "play_event", cardId: "cd-1" });
    // The runs above were made before the mark: Sable gains nothing.
    expect(currentMark(s)).not.toBeNull();
    expect(s.runner.clicks).toBe(1);
    s = pick(s, "run-mark");
    s = drive(s, atRunnerAction);
    // The run on the mark gains Sable's click.
    expect(s.runner.clicks).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Chastushka
// ---------------------------------------------------------------------------

describe("Chastushka", () => {
  /** HQ and R&D hold exactly `hq` and `rd` Hedge Funds. */
  function chastushka(hq: number, rd: number): GameState {
    let s = runnerTurn(fresh());
    for (const id of [...s.corp.hand, ...s.corp.deck]) delete s.cards[id];
    s.corp.hand = [];
    s.corp.deck = [];
    s.servers.hq.ice = [];
    for (let i = 1; i <= hq; i++) toHand(s, "corp", "hedge-fund", `hq-${i}`);
    for (let i = 1; i <= rd; i++) {
      put(s, "hedge-fund", `rd-${i}`, "corp:rd");
      s.corp.deck.push(`rd-${i}`);
    }
    toHand(s, "runner", "chastushka", "ch-1");
    s = must(s, { type: "play_event", cardId: "ch-1", serverId: "hq" });
    s = drive(s, (x) => !!x.pendingSabotage);
    expect(s.pendingSabotage?.amount).toBe(4);
    return s;
  }

  it("Chastushka: the Corp chooses its HQ cards without looking at R&D, then all are trashed at once, R&D's facedown (ruling 1)", () => {
    let s = chastushka(3, 5);
    expect(Object.keys(s.pendingSabotage!)).not.toContain("rdCardIds");
    expect(s.reveals ?? []).toEqual([]);
    s = must(s, { type: "resolve_sabotage", hqCardIds: ["hq-1", "hq-2"] });
    expect(s.corp.hand).toEqual(["hq-3"]);
    expect(s.corp.deck).toHaveLength(3);
    expect(s.corp.discardPile).toEqual(
      expect.arrayContaining(["hq-1", "hq-2", "rd-1", "rd-2"]),
    );
    expect(s.cards["rd-1"]!.faceup).toBe(false);
  });

  it("Chastushka: with 1 card in HQ, the rest must come from R&D (ruling 2)", () => {
    let s = chastushka(1, 5);
    s = must(s, { type: "resolve_sabotage", hqCardIds: ["hq-1"] });
    expect(s.corp.hand).toEqual([]);
    expect(s.corp.deck).toHaveLength(2);
    expect(s.corp.discardPile).toHaveLength(4);
  });

  it("Chastushka: with 1 card in R&D, the rest must come from HQ (ruling 3)", () => {
    const s = chastushka(5, 1);
    const short = applyAction(s, {
      type: "resolve_sabotage",
      hqCardIds: ["hq-1"],
    });
    expect(short.ok).toBe(false);
    const t = must(s, {
      type: "resolve_sabotage",
      hqCardIds: ["hq-1", "hq-2", "hq-3"],
    });
    expect(t.corp.hand).toEqual(["hq-4", "hq-5"]);
    expect(t.corp.deck).toEqual([]);
    expect(t.corp.discardPile).toHaveLength(4);
  });

  it("Chastushka: with fewer cards in HQ and R&D than the sabotage, the Corp trashes them all (ruling 4)", () => {
    let s = chastushka(1, 1);
    s = must(s, { type: "resolve_sabotage", hqCardIds: ["hq-1"] });
    expect(s.corp.hand).toEqual([]);
    expect(s.corp.deck).toEqual([]);
    expect(s.corp.discardPile).toEqual(
      expect.arrayContaining(["hq-1", "rd-1"]),
    );
  });

  it("Chastushka: the Corp trashes the sabotaged cards, so Demolisher gains the Runner nothing (ruling 5)", () => {
    let s = chastushka(3, 5);
    installRunner(s, "demolisher", "demo-1");
    const credits = s.runner.credits;
    s = must(s, { type: "resolve_sabotage", hqCardIds: ["hq-1"] });
    s = drive(s, atRunnerAction);
    expect(s.corp.discardPile).toHaveLength(4);
    expect(s.runner.credits).toBe(credits);
  });
});

// ---------------------------------------------------------------------------
// Creative Commission, VRcation
// ---------------------------------------------------------------------------

describe("Creative Commission", () => {
  it("Creative Commission: the Runner may play it with 1 click left; losing a click is part of the effect, not a cost (ruling 1)", () => {
    let s = runnerTurn(fresh(), 1);
    s.runner.clicks = 1;
    toHand(s, "runner", "creative-commission", "cc-1");
    const before = snapshot(s);
    s = must(s, { type: "play_event", cardId: "cc-1" });
    expectStateDelta(before, s, {
      "runner.credits": 4,
      "runner.clicks": -1,
      "runner.hand.length": -1,
      "runner.discardPile.length": 1,
    });
  });
});

describe("VRcation", () => {
  it("VRcation: the Runner may play it with 1 click left; losing a click is part of the effect, not a cost (ruling 1)", () => {
    let s = runnerTurn(fresh(), 1);
    s.runner.clicks = 1;
    stack(s, 5);
    toHand(s, "runner", "vrcation", "vr-1");
    s = must(s, { type: "play_event", cardId: "vr-1" });
    expect(s.runner.clicks).toBe(0);
    expect(s.runner.hand).toHaveLength(4);
    expect(s.runner.credits).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Guinea Pig, Wildcat Strike
// ---------------------------------------------------------------------------

describe("Guinea Pig", () => {
  it("Guinea Pig: the Runner may play it as the only card in the grip (ruling 1)", () => {
    let s = runnerTurn(fresh(), 4);
    toHand(s, "runner", "guinea-pig", "gp-1");
    expect(s.runner.hand).toEqual(["gp-1"]);
    s = must(s, { type: "play_event", cardId: "gp-1" });
    expect(s.runner.credits).toBe(10);
    expect(s.runner.discardPile).toContain("gp-1");
  });
});

describe("Wildcat Strike", () => {
  it("Wildcat Strike: the Corp may choose the draw with fewer than 4 cards in the stack (ruling 1)", () => {
    let s = runnerTurn(fresh(), 2);
    stack(s, 2);
    toHand(s, "runner", "wildcat-strike", "ws-1");
    s = must(s, { type: "play_event", cardId: "ws-1" });
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(optionIds(s)).toHaveLength(2);
    const draw = optionIds(s).find((id) => /draw/i.test(id))!;
    s = must(s, { type: "choose_option", optionId: draw });
    expect(s.runner.hand).toEqual(["st-1", "st-2"]);
    expect(s.runner.credits).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tread Lightly
// ---------------------------------------------------------------------------

describe("Tread Lightly", () => {
  // Fixed in FX-legal-moves: the approach candidates try the rez through
  // apply's own cost (src/legality/trial.ts) instead of a copy that left out
  // Asteroid Belt's advancement discount (CR 1.16.2a).
  it("Tread Lightly: Asteroid Belt with 4 advancement counters costs 0 to rez: 9, plus 3, minus 12, and the rez is a legal move (ruling 1; CR 1.16.2a)", () => {
    let s = runnerTurn(fresh());
    s.servers.hq.ice = [];
    installIce(s, "asteroid-belt", "ab-1", "hq", false).advancementCounters = 4;
    toHand(s, "runner", "tread-lightly", "tl-1");
    s.corp.credits = 0;
    s = must(s, { type: "play_event", cardId: "tl-1", serverId: "hq" });
    // The Runner passes the approach window; the Corp may rez.
    const passed = applyAction(s, { type: "pass_window" });
    expect(passed.ok).toBe(true);
    s = passed.ok ? passed.state : s;
    expect(legalActions(s)).toContainEqual({ type: "rez_ice", cardId: "ab-1" });
    s = must(s, { type: "rez_ice", cardId: "ab-1" });
    expect(s.cards["ab-1"]!.rezzed).toBe(true);
    expect(s.corp.credits).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Deep Dive
// ---------------------------------------------------------------------------

describe("Deep Dive", () => {
  // Filed under area 8: Deep Dive spends every remaining click for that many
  // more accesses, with no choice ("spend 3 [click] for 3 additional
  // access(es)"). The printed text gives one chance to spend 1 click for 1
  // more access (CR 1.2.1). Its set-aside cards also stay in "corp:set-aside"
  // outside any zone list (NO_ZONE, CR 4.1.2b).
  it.skip("Deep Dive: the Runner gets one chance to spend a click for 1 more access, whatever clicks remain (ruling 1; filed, area 8, CR 1.2.1: every remaining click is spent for more accesses)", () => {
    let s = runnerTurn(fresh());
    clearCorpHand(s);
    for (const server of ["hq", "rd", "archives"] as const) {
      s.servers[server].ice = [];
      s = must(s, { type: "basic_run", serverId: server });
      s = drive(s, atRunnerAction);
    }
    clearRd(s);
    stackRd(
      s,
      Array.from({ length: 8 }, (_, i) => ["hedge-fund", `dd-${i + 1}`]),
    );
    toHand(s, "runner", "deep-dive", "dd-ev");
    s.runner.clicks = 4;
    s = must(s, { type: "play_event", cardId: "dd-ev" });
    let accesses = 0;
    let clickOffers = 0;
    for (let i = 0; i < 30 && !atRunnerAction(s); i++) {
      if (s.pendingChoice) {
        const ids = optionIds(s);
        const click = ids.find((id) => /click|spend|another/i.test(id));
        if (click) clickOffers++;
        const card = ids.find((id) => id.includes("dd-"));
        if (card) accesses++;
        s = must(s, {
          type: "choose_option",
          optionId: click ?? card ?? ids[0]!,
        });
        continue;
      }
      s = drive(s, (x) => !!x.pendingChoice || atRunnerAction(x));
    }
    // 3 clicks were left: still only 1 extra access is offered.
    expect(clickOffers).toBe(1);
    expect(accesses).toBe(2);
    expect(s.runner.clicks).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Divide and Conquer
// ---------------------------------------------------------------------------

describe("Divide and Conquer", () => {
  function divide(s: GameState): GameState {
    for (const server of ["hq", "rd", "archives"] as const) {
      s.servers[server].ice = [];
    }
    toHand(s, "runner", "divide-and-conquer", "dc-1");
    return must(s, {
      type: "play_event",
      cardId: "dc-1",
      serverId: "archives",
    });
  }

  it("Divide and Conquer: the Runner cannot access upgrades in the root of HQ or R&D during its breaches (ruling 1)", () => {
    let s = runnerTurn(fresh());
    toHand(s, "corp", "hedge-fund", "hq-1");
    put(s, "ganked", "gk-hq", "server:hq:root");
    s.servers.hq.root.push("gk-hq");
    put(s, "ganked", "gk-rd", "server:rd:root");
    s.servers.rd.root.push("gk-rd");
    s = divide(s);
    const { accessed } = walk(s);
    // HQ and R&D were breached, but not their roots.
    expect(accessed).toContain("hq-1");
    expect(accessed).toHaveLength(2);
    expect(accessed).not.toContain("gk-hq");
    expect(accessed).not.toContain("gk-rd");
  });

  it("Divide and Conquer: Aumakua gets a counter for each of the three breaches with nothing trashed or stolen (ruling 2)", () => {
    let s = runnerTurn(fresh());
    installRunner(s, "aumakua", "au-1");
    s = divide(s);
    s = drive(s, atRunnerAction);
    expect(s.cards["au-1"]!.virusCounters ?? 0).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Emergency Shutdown
// ---------------------------------------------------------------------------

describe("Emergency Shutdown", () => {
  // At the pin Crisium Grid reads "cannot be declared successful", so the
  // Runner does not breach and cannot trash it during the breach as the
  // ruling's question supposes; its answer, no successful run, is tested.
  it("Emergency Shutdown: a run on HQ with an active Crisium Grid is not a successful run, so it cannot be played afterward (ruling 1)", () => {
    let s = runnerTurn(fresh(), 10);
    s.servers.hq.ice = [];
    installIce(s, "ice-wall", "iw-1", "rd");
    put(s, "crisium-grid", "cg-1", "server:hq:root");
    s.servers.hq.root.push("cg-1");
    s.cards["cg-1"]!.rezzed = true;
    s.cards["cg-1"]!.faceup = true;
    toHand(s, "runner", "emergency-shutdown", "es-1");
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = walk(s).state;
    expect(
      legalActions(s).some(
        (a) => a.type === "play_event" && a.cardId === "es-1",
      ),
    ).toBe(false);
    // Control: once Crisium Grid is gone, a successful run on HQ allows it.
    s.servers.hq.root = [];
    delete s.cards["cg-1"];
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = walk(s).state;
    expect(
      legalActions(s).some(
        (a) => a.type === "play_event" && a.cardId === "es-1",
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Inside Job
// ---------------------------------------------------------------------------

describe("Inside Job", () => {
  it("Inside Job: bypassing Funhouse or Tollbooth ends the encounter before their encounter abilities resolve (ruling 1)", () => {
    for (const defId of ["funhouse", "tollbooth"]) {
      let s = runnerTurn(fresh(), 10);
      s.servers.hq.ice = [];
      installIce(s, defId, "ice-1", "hq");
      toHand(s, "runner", "inside-job", "ij-1");
      s = must(s, { type: "play_event", cardId: "ij-1", serverId: "hq" });
      const start = s.log.length;
      s = walk(s).state;
      const log = s.log.slice(start).join("\n");
      expect(log, defId).toMatch(/Run successful/);
      expect(s.runner.tags, defId).toBe(0);
      // Inside Job cost 2; no toll was paid.
      expect(s.runner.credits, defId).toBe(8);
    }
  });
});

// ---------------------------------------------------------------------------
// Into the Depths
// ---------------------------------------------------------------------------

describe("Into the Depths", () => {
  /** A run on R&D through `ice` (outermost first), up to the mode choice. */
  function depths(
    ice: Array<[string, string, boolean]>,
    before?: (s: GameState) => GameState,
  ): GameState {
    let s = runnerTurn(fresh(), 10);
    s.servers.rd.ice = [];
    for (const [defId, id, rezzed] of [...ice].reverse()) {
      installIce(s, defId, id, "rd", rezzed);
    }
    installRunner(s, "propeller", "prop-1").powerCounters = 2;
    toHand(s, "runner", "into-the-depths", "itd-1");
    s = must(s, { type: "play_event", cardId: "itd-1", serverId: "rd" });
    if (before) s = before(s);
    return drive(s, (x) => optionIds(x).includes("charge"));
  }

  it("Into the Depths: a card with 2 power counters has one, so it can be charged (ruling 1)", () => {
    let s = depths([["ice-wall", "iw-1", false]]);
    s = pick(s, "charge");
    if (s.pendingChoice) s = pick(s, "prop-1");
    expect(s.cards["prop-1"]!.powerCounters).toBe(3);
  });

  it("Into the Depths: passing unrezzed ice counts, though it is not encountered (ruling 2)", () => {
    let start = 0;
    const s = depths(
      [
        ["ice-wall", "iw-out", false],
        ["ice-wall", "iw-in", false],
      ],
      (x) => {
        start = x.log.length;
        return x;
      },
    );
    expect(s.log.slice(start).join("\n")).toMatch(/passed 2, resolve 2/);
    expect(optionIds(s)).toEqual(["credits", "search", "charge"]);
  });

  it("Into the Depths: ice uninstalled while encountered was not passed, but ice passed before it was uninstalled still counts (ruling 3)", () => {
    let s = runnerTurn(fresh(), 10);
    s.servers.rd.ice = [];
    installIce(s, "ice-wall", "iw-in", "rd", false);
    // Envelopment with no counters: its only subroutine trashes it.
    installIce(s, "envelopment", "env-out", "rd").powerCounters = 0;
    toHand(s, "runner", "into-the-depths", "itd-1");
    s = must(s, { type: "play_event", cardId: "itd-1", serverId: "rd" });
    // Stop in the jack-out window after passing Ice Wall: the second one,
    // since Envelopment's former position comes first.
    let windows = 0;
    s = drive(s, (x) => x.timingKey === "run.jackOutWindow" && ++windows === 2);
    // The Runner passed Ice Wall; now the Corp trashes it.
    expect(s.servers.rd.ice).toEqual(["iw-in"]);
    trashCard(s, "iw-in", { by: "corp" });
    checkpointAfterInstruction(s, "test");
    s = passIdle(s);
    const start = s.log.length;
    s = drive(s, (x) => optionIds(x).includes("credits"));
    expect(s.log.slice(start).join("\n")).toMatch(/passed 1, resolve 1/);
  });

  it("Into the Depths: the same ice passed twice counts twice (ruling 4)", () => {
    let s = runnerTurn(fresh(), 10);
    s.servers.rd.ice = [];
    installIce(s, "ice-wall", "iw-in", "rd", false);
    installIce(s, "thimblerig", "th-1", "rd");
    installRunner(s, "gordian-blade", "gb-1");
    toHand(s, "runner", "into-the-depths", "itd-1");
    s = must(s, { type: "play_event", cardId: "itd-1", serverId: "rd" });
    const start = s.log.length;
    let swaps = 0;
    for (let i = 0; i < 60 && !optionIds(s).includes("charge"); i++) {
      if (s.pendingChoice) {
        // After the first pass, Thimblerig swaps inward with Ice Wall, so
        // the Runner approaches and passes it again; then it stays put.
        s = pick(s, swaps++ === 0 ? "swap-ice:iw-in" : "decline");
        continue;
      }
      const legal = legalActions(s);
      const next =
        legal.find((a) => a.type === "break_subroutine") ??
        legal.find((a) => a.type === "continue_run") ??
        legal.find((a) => a.type === "pass_window");
      if (!next) break;
      s = must(s, next);
    }
    expect(swaps).toBe(2);
    expect(s.servers.rd.ice).toEqual(["iw-in", "th-1"]);
    expect(s.log.slice(start).join("\n")).toMatch(/passed 2, resolve 2/);
    expect(optionIds(s)).toEqual(["credits", "search", "charge"]);
  });
});

// ---------------------------------------------------------------------------
// Jailbreak
// ---------------------------------------------------------------------------

describe("Jailbreak", () => {
  function jailbreak(s: GameState): GameState {
    s.servers.hq.ice = [];
    toHand(s, "runner", "jailbreak", "jb-1");
    stack(s, 3);
    return must(s, { type: "play_event", cardId: "jb-1", serverId: "hq" });
  }

  it("Jailbreak: the Runner draws when the run is declared successful, before the breach (ruling 1)", () => {
    let s = runnerTurn(fresh());
    toHand(s, "corp", "hedge-fund", "hq-1");
    toHand(s, "corp", "hedge-fund", "hq-2");
    s = jailbreak(s);
    s = drive(s, (x) => legalActions(x).some((a) => a.type === "access_card"));
    expect(s.run?.phase).toBe("breach");
    expect(s.runner.hand).toEqual(["st-1"]);
  });

  it("Jailbreak: with Crisium Grid the run is never declared successful, so there is no draw and no extra access (ruling 2)", () => {
    let s = runnerTurn(fresh());
    toHand(s, "corp", "hedge-fund", "hq-1");
    put(s, "crisium-grid", "cg-1", "server:hq:root");
    s.servers.hq.root.push("cg-1");
    s.cards["cg-1"]!.rezzed = true;
    s.cards["cg-1"]!.faceup = true;
    s = jailbreak(s);
    const { state, accessed } = walk(s);
    expect(accessed).toEqual([]);
    expect(state.runner.hand).toEqual([]);
  });

  it("Jailbreak: a run event stays in the play area until its run is over, not in the heap (ruling 3)", () => {
    let s = runnerTurn(fresh());
    toHand(s, "corp", "hedge-fund", "hq-1");
    s = jailbreak(s);
    s = drive(s, (x) => legalActions(x).some((a) => a.type === "access_card"));
    expect(s.runner.discardPile).not.toContain("jb-1");
    expect(s.cards["jb-1"]!.zone).not.toBe("runner:heap");
    s = walk(s).state;
    expect(s.runner.discardPile).toContain("jb-1");
  });
});

// ---------------------------------------------------------------------------
// Networking
// ---------------------------------------------------------------------------

describe("Networking", () => {
  function networking(pay: boolean): GameState {
    let s = runnerTurn(fresh(), 5);
    s.runner.tags = 1;
    installRunner(s, "aniccam", "an-1");
    stack(s, 3);
    toHand(s, "runner", "networking", "nw-1");
    s = must(s, { type: "play_event", cardId: "nw-1" });
    const ids = optionIds(s);
    const choice = pay
      ? ids.find((id) => !/decline|no/i.test(id))!
      : ids.find((id) => /decline|no/i.test(id))!;
    s = must(s, { type: "choose_option", optionId: choice });
    return drive(s, atRunnerAction);
  }

  // Filed under area 11: paying to add Networking to the grip leaves it in
  // the play area as well (the invariant reports MULTIPLE_ZONES). An event
  // added to the grip during its play is not trashed at step 8.6.7g, and a
  // card is in one zone (CR 8.6.7g, 4.1.2b).
  it.skip("Networking: added back to the grip it is never trashed, so Aniccam draws nothing (ruling 1; filed, area 11, CR 8.6.7g: it stays in the play area as well as the grip)", () => {
    const s = networking(true);
    expect(s.runner.tags).toBe(0);
    expect(s.runner.hand).toEqual(["nw-1"]);
    // Control: declining, Networking is trashed and Aniccam draws.
    const c = networking(false);
    expect(c.runner.discardPile).toContain("nw-1");
    expect(c.runner.hand).toEqual(["st-1"]);
  });
});

// ---------------------------------------------------------------------------
// Overclock
// ---------------------------------------------------------------------------

describe("Overclock", () => {
  it("Overclock: Whitespace's first subroutine takes the 3 credits from the credit pool, not from Overclock (ruling 1)", () => {
    let s = runnerTurn(fresh(), 4);
    s.servers.hq.ice = [];
    installIce(s, "whitespace", "ws-1", "hq");
    toHand(s, "runner", "overclock", "oc-1");
    s = must(s, { type: "play_event", cardId: "oc-1", serverId: "hq" });
    expect(s.runner.credits).toBe(3);
    s = drive(s, (x) => x.run?.encounter?.iceId === "ws-1");
    s = walk(s).state;
    // Overclock cost 1; Whitespace takes the other 3 from the pool.
    expect(s.runner.credits).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Pinhole Threading
// ---------------------------------------------------------------------------

describe("Pinhole Threading", () => {
  /** Pinhole Threading on `server`, accessing `targetId` in another root. */
  function pinhole(
    s: GameState,
    server: ServerId,
    targetId: string,
  ): GameState {
    s.servers[server].ice = [];
    toHand(s, "runner", "pinhole-threading", "ph-1");
    s = must(s, { type: "play_event", cardId: "ph-1", serverId: server });
    s = drive(s, (x) =>
      legalActions(x).some(
        (a) => a.type === "access_card" && a.cardId === targetId,
      ),
    );
    return must(s, { type: "access_card", cardId: targetId });
  }

  // Filed under area 14: Pinhole's access is set up as a breach ("Breach
  // begins with 2 preset candidate(s)"), so Aumakua's "whenever you finish
  // breaching a server" places a counter. The access replaces the breach
  // (CR 6.7.4c).
  it.skip("Pinhole Threading: its access is not a breach, so Aumakua gets no counter (ruling 1; filed, area 14, CR 6.7.4c: the access is played as a breach)", () => {
    let s = runnerTurn(fresh(), 5);
    installRunner(s, "aumakua", "au-1");
    installRoot(s, "pad-campaign", "pad-1", false);
    s = pinhole(s, "hq", "pad-1");
    s = walk(s).state;
    expect(s.corp.discardPile).not.toContain("pad-1");
    expect(s.cards["au-1"]!.virusCounters ?? 0).toBe(0);
  });

  it("Pinhole Threading: a run on Archives that accesses a remote card is not a breach of a remote, so Kasi String gets no counter (ruling 2)", () => {
    let s = runnerTurn(fresh(), 5);
    installRunner(s, "kasi-string", "ks-1");
    installRoot(s, "hostile-takeover", "ht-1", false);
    s = pinhole(s, "archives", "ht-1");
    s = walk(s).state;
    expect(s.runner.scoreArea).not.toContain("ht-1");
    expect(s.cards["ks-1"]!.powerCounters ?? 0).toBe(0);
  });

  // Filed under area 14: during a Pinhole run on HQ, the Border Control
  // protecting the remote whose Ganked! was accessed offers its "[trash]:
  // End the run" (use only during a run on this server). The access does
  // not change the attacked server (CR 6.1.3c).
  it.skip("Pinhole Threading: during Ganked!'s encounter only the Border Control on the attacked server can end the run (ruling 3; filed, area 14, CR 6.1.3c: the accessed server's Border Control is usable)", () => {
    let s = runnerTurn(fresh(), 5);
    installIce(s, "border-control", "bc-hq", "hq");
    installRoot(s, "ganked", "gk-1", false);
    installIce(s, "border-control", "bc-r", "remote-gk-1" as ServerId);
    toHand(s, "runner", "pinhole-threading", "ph-1");
    s.cards["bc-hq"]!.rezzed = false;
    s = must(s, { type: "play_event", cardId: "ph-1", serverId: "hq" });
    s = drive(s, (x) => legalActions(x).some((a) => a.type === "access_card"));
    s = must(s, { type: "access_card", cardId: "gk-1" });
    s = pick(s, "trash-encounter");
    s = drive(s, (x) => x.run?.encounter?.iceId === "bc-r");
    expect(s.run?.attackedServerId).toBe("hq");
    expect(paidAbility(s, "bc-r")).toBeUndefined();
  });

  // Filed under area 11: Ganked!'s "the Runner encounters that ice" goes
  // through an approach of the attacked server's outermost ice (the Corp
  // may rez it there), and the invariant reports ENCOUNTER_ICE_MISMATCH. An
  // encounter that does not move the Runner has no approach (CR 6.5.9a).
  it.skip("Pinhole Threading: Henry Phillips in the attacked server's root gains for subroutines broken on Ganked!'s ice from another server (ruling 4; filed, area 11, CR 6.5.9a: the forced encounter goes through an approach)", () => {
    let s = runnerTurn(fresh(), 10);
    s.runner.tags = 1;
    s.servers.hq.ice = [];
    put(s, "henry-phillips", "hp-1", "server:hq:root");
    s.servers.hq.root.push("hp-1");
    s.cards["hp-1"]!.rezzed = true;
    s.cards["hp-1"]!.faceup = true;
    installRoot(s, "ganked", "gk-1", false);
    installIce(s, "ice-wall", "iw-r", "remote-gk-1" as ServerId);
    installRunner(s, "corroder", "cor-1");
    s = pinhole(s, "hq", "gk-1");
    s = pick(s, "trash-encounter");
    s = drive(s, (x) =>
      legalActions(x).some((a) => a.type === "break_subroutine"),
    );
    const credits = s.corp.credits;
    s = must(
      s,
      legalActions(s).find((a) => a.type === "break_subroutine")!,
    );
    expect(s.corp.credits).toBe(credits + 2);
  });

  it("Pinhole Threading: on a run on a central server, Cezve's credits pay to trash an asset accessed in a remote root (ruling 5)", () => {
    const board = (cezve: number): GameState => {
      const s = runnerTurn(fresh(), 3);
      installRunner(s, "cezve", "cz-1").recurringCredits = cezve;
      installRoot(s, "pad-campaign", "pad-1", false);
      return pinhole(s, "hq", "pad-1");
    };
    // Control: 2 credits left after Pinhole cannot pay the trash cost of 4.
    const c = board(0);
    expect(c.runner.credits).toBe(2);
    expect(
      legalActions(c).some(
        (a) => a.type === "trash_accessed" && a.cardId === "pad-1",
      ),
    ).toBe(false);
    let s = board(2);
    const trash = legalActions(s).find(
      (a) => a.type === "trash_accessed" && a.cardId === "pad-1",
    );
    expect(trash).toBeDefined();
    s = must(s, trash!);
    while (s.pendingChoice) {
      s = must(s, { type: "choose_option", optionId: optionIds(s)[0]! });
    }
    expect(s.corp.discardPile).toContain("pad-1");
    expect(s.cards["cz-1"]!.recurringCredits ?? 0).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Rigging Up
// ---------------------------------------------------------------------------

describe("Rigging Up", () => {
  let chargeOffered = false;

  /** Play Rigging Up on `defId`, charging when offered. */
  function rig(defId: string): GameState {
    chargeOffered = false;
    let s = runnerTurn(fresh(), 5);
    toHand(s, "runner", defId, "card-1");
    toHand(s, "runner", "rigging-up", "ru-1");
    s = must(s, { type: "play_event", cardId: "ru-1" });
    for (let i = 0; i < 6 && s.pendingChoice; i++) {
      const ids = optionIds(s);
      if (ids.some((id) => /charge/i.test(id) && !/decline|no/i.test(id))) {
        chargeOffered = true;
      }
      const choice =
        ids.find((id) => id.includes("card-1")) ??
        ids.find((id) => /charge/i.test(id) && !/decline|no/i.test(id)) ??
        ids[0]!;
      s = must(s, { type: "choose_option", optionId: choice });
    }
    return drive(s, atRunnerAction);
  }

  it("Rigging Up: Hyperbaric's install counter is placed before the charge, so it can be charged to 2 (ruling 1)", () => {
    const s = rig("hyperbaric");
    expect(s.runner.installed).toContain("card-1");
    expect(s.cards["card-1"]!.powerCounters).toBe(2);
  });

  it("Rigging Up: a card with no power counter cannot be charged (ruling 2)", () => {
    const s = rig("corroder");
    expect(s.runner.installed).toContain("card-1");
    expect(chargeOffered).toBe(false);
    expect(s.cards["card-1"]!.powerCounters ?? 0).toBe(0);
  });

  it("Rigging Up: a card with 4 power counters has one, so it can be charged (ruling 3)", () => {
    const s = rig("propeller");
    expect(s.cards["card-1"]!.powerCounters).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Running Hot
// ---------------------------------------------------------------------------

describe("Running Hot", () => {
  it("Running Hot: it is in the play area when its core damage is paid, so the damage cannot trash it (ruling 1)", () => {
    let s = runnerTurn(fresh(), 5);
    s.runner.clicks = 1;
    toHand(s, "runner", "running-hot", "rh-1");
    toHand(s, "runner", "sure-gamble", "g-1");
    s = must(s, { type: "play_event", cardId: "rh-1" });
    s = drive(s, (x) => x.runner.clicks > 0 || x.done);
    expect(s.runner.discardPile).toEqual(
      expect.arrayContaining(["g-1", "rh-1"]),
    );
    expect(s.runner.clicks).toBe(3);
    expect(s.runner.coreDamage).toBe(1);
  });

  // Filed under area 11: the core damage is left pending in an interrupt
  // window ("Pending 1 core damage … interrupt PAW") while the event
  // resolves, and Feedback Filter's prevention is offered against it. A
  // cost is paid before the checkpoint and the effect, and an interrupt
  // sees only an imminent instruction (CR 1.16.3, 9.9.3a).
  it.skip("Running Hot: its core damage is a cost and cannot be prevented, even with Feedback Filter (ruling 2; filed, area 11, CR 1.16.3: the cost is left pending and preventable)", () => {
    let s = runnerTurn(fresh(), 5);
    installRunner(s, "feedback-filter", "ff-1");
    toHand(s, "runner", "running-hot", "rh-1");
    toHand(s, "runner", "sure-gamble", "g-1");
    s = must(s, { type: "play_event", cardId: "rh-1" });
    expect(
      legalActions(s).some(
        (a) => a.type === "use_paid_ability" && a.cardId === "ff-1",
      ),
    ).toBe(false);
    s = drive(s, atRunnerAction);
    expect(s.runner.installed).toContain("ff-1");
    expect(s.runner.coreDamage).toBe(1);
    expect(s.runner.discardPile).toContain("g-1");
  });

  it("Running Hot: the Runner may play it as the only card in the grip, and flatlines (ruling 3)", () => {
    let s = runnerTurn(fresh(), 5);
    toHand(s, "runner", "running-hot", "rh-1");
    s = must(s, { type: "play_event", cardId: "rh-1" });
    expect(s.done).toBe(true);
    expect(s.winner).toBe("corp");
  });

  it("Running Hot: the Runner may play it even when the core damage will flatline them at the end of the turn (ruling 4)", () => {
    let s = runnerTurn(fresh(), 5);
    s.runner.coreDamage = 5;
    toHand(s, "runner", "running-hot", "rh-1");
    toHand(s, "runner", "sure-gamble", "g-1");
    expect(
      legalActions(s).some(
        (a) => a.type === "play_event" && a.cardId === "rh-1",
      ),
    ).toBe(true);
    s = must(s, { type: "play_event", cardId: "rh-1" });
    expect(s.runner.coreDamage).toBe(6);
    expect(s.done).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Steelskin Scarring
// ---------------------------------------------------------------------------

describe("Steelskin Scarring", () => {
  it("Steelskin Scarring: played, it is trashed from the play area, so only its draw 3 resolves (ruling 1)", () => {
    let s = runnerTurn(fresh(), 5);
    stack(s, 6);
    toHand(s, "runner", "steelskin-scarring", "ss-1");
    s = must(s, { type: "play_event", cardId: "ss-1" });
    expect(s.pendingChoice).toBeNull();
    expect(s.runner.hand).toEqual(["st-1", "st-2", "st-3"]);
    expect(s.runner.discardPile).toContain("ss-1");
  });

  it("Steelskin Scarring: discarded to hand size it is not trashed, so the Runner draws nothing (ruling 2)", () => {
    let s = runnerTurn(fresh(), 5);
    stack(s, 3);
    for (let i = 1; i <= 5; i++) toHand(s, "runner", "sure-gamble", `g-${i}`);
    toHand(s, "runner", "steelskin-scarring", "ss-1");
    s.runner.clicks = 1;
    s = must(s, { type: "basic_gain_credit" });
    s = drive(s, (x) =>
      legalActions(x).some((a) => a.type === "discard_to_hand_size"),
    );
    s = must(s, { type: "discard_to_hand_size", cardIds: ["ss-1"] });
    expect(s.pendingChoice).toBeNull();
    expect(s.runner.deck).toHaveLength(3);
    expect(s.runner.discardPile).toContain("ss-1");
  });

  // Filed under area 11: Labor Rights trashes the stack's top card and
  // Steelskin's ability opens at once, before the rest are trashed and
  // before Buffer Drive is pending, so the Runner cannot choose the order.
  // Both meet their condition together and the Runner orders them
  // (CR 9.2.8d).
  it.skip("Steelskin Scarring: with Buffer Drive, the Runner may draw 2 first and then still use Buffer Drive (ruling 3; filed, area 11, CR 9.2.8d: Steelskin resolves before Buffer Drive is pending)", () => {
    let s = runnerTurn(fresh(), 5);
    installRunner(s, "buffer-drive", "bd-1");
    stack(s, 0);
    put(s, "steelskin-scarring", "ss-1", "runner:stack");
    s.runner.deck.push("ss-1");
    for (let i = 1; i <= 4; i++) {
      put(s, "sure-gamble", `st-${i}`, "runner:stack");
      s.runner.deck.push(`st-${i}`);
    }
    toHand(s, "runner", "labor-rights", "lr-1");
    s = must(s, { type: "play_event", cardId: "lr-1" });
    // Both abilities are pending: the Runner picks Steelskin's first.
    const order = optionIds(s);
    const steelskinFirst = order.find((id) => id.includes("ss-1"));
    expect(steelskinFirst, order.join(", ")).toBeDefined();
    s = must(s, { type: "choose_option", optionId: steelskinFirst! });
    const draw = optionIds(s).find((id) => /draw/i.test(id))!;
    s = must(s, { type: "choose_option", optionId: draw });
    // Buffer Drive is still offered after the draw.
    expect(s.pendingChoice?.sourceId).toBe("bd-1");
  });

  // Filed under area 1: "Trash the top 3 cards of your stack" trashes one
  // card at a time, and Steelskin's draw 2 resolves after the first, so the
  // Runner draws 2 of the cards Labor Rights should have trashed. The
  // sentence is one instruction; Steelskin resolves after it (CR 9.11.3).
  it.skip("Steelskin Scarring: trashed from the top of the stack by Labor Rights, it lets the Runner draw 2 before Labor Rights goes on (ruling 4; filed, area 1, CR 9.11.3: Steelskin draws between Labor Rights' trashes)", () => {
    let s = runnerTurn(fresh(), 5);
    stack(s, 0);
    put(s, "steelskin-scarring", "ss-1", "runner:stack");
    s.runner.deck.push("ss-1");
    for (let i = 1; i <= 4; i++) {
      put(s, "sure-gamble", `st-${i}`, "runner:stack");
      s.runner.deck.push(`st-${i}`);
    }
    toHand(s, "runner", "labor-rights", "lr-1");
    const start = s.log.length;
    s = must(s, { type: "play_event", cardId: "lr-1" });
    const draw = optionIds(s).find((id) => /draw/i.test(id));
    expect(draw, optionIds(s).join(", ")).toBeDefined();
    s = must(s, { type: "choose_option", optionId: draw! });
    s = drive(s, atRunnerAction);
    const log = s.log.slice(start);
    const drew2 = log.findIndex((l) => /draws 2/.test(l));
    const shuffled = log.findIndex((l) => /shuffl/i.test(l));
    expect(drew2).toBeGreaterThanOrEqual(0);
    expect(shuffled).toBeGreaterThan(drew2);
    // The top 3 (Steelskin, st-1, st-2) are trashed before the draw 2.
    expect(log.slice(0, drew2).join("\n")).toMatch(
      /trash[\s\S]*Sure Gamble[\s\S]*Sure Gamble/,
    );
    expect(s.removedFromGame).toContain("lr-1");
  });
});

// ---------------------------------------------------------------------------
// Test Run
// ---------------------------------------------------------------------------

describe("Test Run", () => {
  // A card that changes zones is a new object, and the lingering effect
  // applies only to the object Test Run installed (CR 1.12.1; fixed in
  // RF-1b).
  it("Test Run: a program reinstalled with Rejig is a new object, so it is not added to the stack at the end of the turn (ruling 1; CR 1.12.1)", () => {
    let s = runnerTurn(fresh(), 10);
    stack(s, 0);
    put(s, "corroder", "cor-1", "runner:heap");
    s.runner.discardPile.push("cor-1");
    toHand(s, "runner", "test-run", "tr-1");
    toHand(s, "runner", "rejig", "rj-1");
    s = must(s, { type: "play_event", cardId: "tr-1" });
    while (s.pendingChoice) {
      const ids = optionIds(s);
      s = must(s, {
        type: "choose_option",
        optionId:
          ids.find((id) => /heap/i.test(id)) ??
          ids.find((id) => id.includes("cor-1")) ??
          ids[0]!,
      });
    }
    s = drive(s, atRunnerAction);
    expect(s.runner.installed).toContain("cor-1");
    // Rejig's cost returns Corroder to the grip; it installs it again.
    s = must(s, { type: "play_event", cardId: "rj-1" });
    while (s.pendingChoice) {
      const ids = optionIds(s);
      s = must(s, {
        type: "choose_option",
        optionId: ids.find((id) => id.includes("cor-1")) ?? ids[0]!,
      });
    }
    s = drive(s, atRunnerAction);
    expect(s.runner.installed).toContain("cor-1");
    s.runner.clicks = 1;
    s.config.stopAfterFirstCycle = false;
    s = must(s, { type: "basic_gain_credit" });
    s = drive(s, (x) => x.activeSide === "corp" || x.done);
    expect(s.runner.installed).toContain("cor-1");
    expect(s.runner.deck).not.toContain("cor-1");
  });
});
