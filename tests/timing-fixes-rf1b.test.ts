/**
 * RF-1b timing fixes (CR audit program). What RF-1 (engine #980) left, plus
 * two fix-now run bugs folded in on 2026-11-21: resolved subroutines read as
 * broken (RF-2's area 11 row) and subroutines resolving after an encounter
 * ability ends the run (the second reader's area 14 row). Each test states
 * the behavior the CR settles and cites the rule.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  evalEffect,
  fx,
  legalActions,
} from "../src/index.js";
import type { GameState } from "../src/index.js";
import {
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
  toHand,
} from "./rulings-helpers.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.28");
});

/** A card in the root of HQ. */
function hqRoot(s: GameState, defId: string, id: string, rezzed = true) {
  const card = put(s, defId, id, "server:hq:root");
  card.rezzed = rezzed;
  card.faceup = rezzed;
  s.servers.hq.root.push(id);
  return card;
}

/** Fill the grip so net damage does not flatline the Runner. */
function grip(s: GameState, n: number): void {
  for (let i = 0; i < n; i++) toHand(s, "runner", "sure-gamble", `grip-${i}`);
}

/** Fill HQ so a run on it has something to access. */
function hq(s: GameState, n: number): void {
  for (let i = 0; i < n; i++) toHand(s, "corp", "hedge-fund", `hq-${i}`);
}

/** Run a server and stop at the first encounter's paid ability window. */
function runToEncounter(s: GameState, server: string): GameState {
  s = must(s, { type: "basic_run", serverId: server as never });
  return drive(s, (x) => x.timingKey === "run.encounterPaw" || !x.run);
}

/** Answer each open choice with its first option whose id contains `part`, else its first option. */
function answerAll(s: GameState, part = "decline"): GameState {
  for (let i = 0; i < 10 && s.pendingChoice; i++) {
    const ids = optionIds(s);
    const id = ids.find((x) => x.includes(part)) ?? ids[0]!;
    s = must(s, { type: "choose_option", optionId: id });
  }
  return s;
}

/** Pass, answering choices, until the encounter with the current ice is over. */
function finishEncounter(s: GameState, part = "decline"): GameState {
  for (let i = 0; i < 40; i++) {
    s = answerAll(s, part);
    if (!s.run || s.timingKey === "run.jackOutWindow") return s;
    if (s.timingKey === "run.approachServerPaw") return s;
    const pass = legalActions(s).find(
      (a) => a.type === "pass_window" || a.type === "continue_run",
    );
    if (!pass) return s;
    s = must(s, pass);
  }
  return s;
}

describe("resolved subroutines are not broken subroutines (CR 6.5.7a, 6.5.8b, 1.2.1)", () => {
  /** Tithe protects HQ with Mason Bellamy in its root; the Runner has Mimic. */
  function masonBoard(): GameState {
    const s = runnerTurn(fresh(), 10);
    installIce(s, "tithe", "tithe-1", "hq");
    hqRoot(s, "mason-bellamy", "mason-1");
    installRunner(s, "mimic", "mimic-1");
    grip(s, 4);
    hq(s, 1);
    return s;
  }

  it("Mason Bellamy takes no click when Tithe's subroutines resolve unbroken (CR 6.5.7a, 1.2.1)", () => {
    let s = runToEncounter(masonBoard(), "hq");
    const clicks = s.runner.clicks;
    s = finishEncounter(s);
    expect(s.runner.clicks).toBe(clicks);
    expect(s.log.join("\n")).not.toContain("Mason Bellamy — Runner loses");
  });

  it("Mason Bellamy takes a click when the Runner breaks one of Tithe's subroutines and the other resolves (CR 6.5.7a, 1.2.1)", () => {
    let s = runToEncounter(masonBoard(), "hq");
    const clicks = s.runner.clicks;
    s = must(s, {
      type: "break_subroutine",
      breakerId: "mimic-1",
      subIndex: 0,
    });
    s = finishEncounter(s);
    expect(s.runner.clicks).toBe(clicks - 1);
  });

  it("Chief Slee gets a power counter for each of Tithe's subroutines that resolved unbroken (CR 6.5.7a, 1.2.1)", () => {
    const s0 = runnerTurn(fresh(), 10);
    installIce(s0, "tithe", "tithe-1", "hq");
    installRoot(s0, "chief-slee", "slee-1", true);
    grip(s0, 4);
    hq(s0, 1);
    let s = runToEncounter(s0, "hq");
    s = finishEncounter(s);
    expect(s.cards["slee-1"]!.powerCounters ?? 0).toBe(2);
  });

  it("Fractal Threat Matrix trashes nothing from the stack when Tithe's subroutines resolve unbroken (CR 6.5.7a, 1.2.1)", () => {
    let s = runnerTurn(fresh(), 10);
    installIce(s, "tithe", "tithe-1", "hq");
    hqRoot(s, "fractal-threat-matrix", "ftm-1");
    for (let i = 0; i < 3; i++) {
      put(s, "sure-gamble", `stack-${i}`, "runner:stack");
      s.runner.deck.push(`stack-${i}`);
    }
    grip(s, 4);
    hq(s, 1);
    s = runToEncounter(s, "hq");
    const stack = s.runner.deck.length;
    s = finishEncounter(s);
    expect(s.runner.deck.length).toBe(stack);
  });

  it("the Runner may still break Enigma's subroutines that Mass-Driver keeps from resolving, and breaking both fully breaks Enigma (CR 9.8.5, 9.8.6, 6.5.7a)", () => {
    const s0 = runnerTurn(fresh(), 10);
    installIce(s0, "enigma", "enigma-1", "hq");
    installRunner(s0, "gordian-blade", "gb-1");
    hq(s0, 1);
    s0.turn.massDriverSkipSubsNextEncounter = 3;
    let s = runToEncounter(s0, "hq");
    const offered = legalActions(s).filter(
      (a) => a.type === "break_subroutine" && a.breakerId === "gb-1",
    );
    expect(offered.map((a) => (a as { subIndex: number }).subIndex)).toEqual([
      0, 1,
    ]);
    s = must(s, { type: "break_subroutine", breakerId: "gb-1", subIndex: 0 });
    s = must(s, { type: "break_subroutine", breakerId: "gb-1", subIndex: 1 });
    expect(s.run?.encounter?.fullyBrokenByRunner).toBe(true);
  });

  it("the Runner passes Mirāju normally when its subroutine resolved unbroken (CR 6.5.7a, 1.2.1)", () => {
    const s0 = runnerTurn(fresh(), 10);
    installIce(s0, "miraju", "miraju-1", "hq");
    hq(s0, 1);
    let s = runToEncounter(s0, "hq");
    s = finishEncounter(s);
    expect(s.cards["miraju-1"]!.rezzed).toBe(true);
    expect(s.run?.attackedServerId).toBe("hq");
    expect(s.log.join("\n")).not.toContain(
      "is not passed — the encounter-end replacement",
    );
  });

  it("Chum does its net damage when the Runner bypasses the ice it boosted, which the Runner did not fully break (CR 6.5.8b, 9.12.2d)", () => {
    let s = runnerTurn(fresh(), 10);
    installIce(s, "tithe", "tithe-1", "hq");
    installIce(s, "chum", "chum-1", "rd");
    grip(s, 4);
    hq(s, 1);
    s.run = {
      attackedServerId: "hq",
      phase: "approach_ice",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      accessingCardId: null,
      bypassFirstEncounter: true,
      chumNextIce: {
        strengthBonus: 2,
        netDamageIfNotFullyBroken: 3,
        chumSourceId: "chum-1",
      },
    } as GameState["run"];
    s.timingKey = "run.approachPaw";
    s = finishEncounter(s);
    s = answerAll(s);
    expect(s.runner.hand.length).toBe(1);
  });
});

describe("no subroutine resolves after an encounter ability ends the run (CR 6.1.4, 6.9.6)", () => {
  it("no subroutine resolves after Tollbooth's encounter ability ends the run (CR 6.1.4)", () => {
    const s0 = runnerTurn(fresh(), 2);
    installIce(s0, "tollbooth", "tb-1", "hq");
    hq(s0, 1);
    const from = s0.log.length;
    let s = must(s0, { type: "basic_run", serverId: "hq" });
    s = drive(s, (x) => !x.run);
    const lines = s.log.slice(from).join("\n");
    expect(s.run).toBeFalsy();
    expect(s.runner.credits).toBe(2);
    expect(lines).not.toMatch(/Resolve subroutine|resolves subroutine/i);
  });

  it("no subroutine resolves after Funhouse's encounter ability ends the run (CR 6.1.4)", () => {
    const s0 = runnerTurn(fresh(), 10);
    setIdentity(s0, "runner", "jesminder-sareen-girl-behind-the-curtain");
    installIce(s0, "funhouse", "fh-1", "hq");
    hq(s0, 1);
    let s = must(s0, { type: "basic_run", serverId: "hq" });
    s = drive(s, (x) => !x.run);
    s = answerAll(s, "end");
    s = drive(s, (x) => !x.run);
    expect(s.run).toBeFalsy();
    expect(s.runner.tags).toBe(0);
    expect(s.runner.credits).toBe(10);
  });
});

describe("Apocalypse trashes the Corp's installed cards as one set (CR 9.12.2a, 9.6.4b, 9.2.8d)", () => {
  /** Hostile Infrastructure, Calvin B4L3Y and Ice Wall installed; Apocalypse in the grip. */
  function apocalypseBoard(): GameState {
    const s = runnerTurn(fresh(), 10);
    installRoot(s, "hostile-infrastructure", "hi-1", true);
    installRoot(s, "calvin-b4l3y", "calvin-1", true);
    installIce(s, "ice-wall", "iw-1", "hq");
    grip(s, 5);
    toHand(s, "runner", "apocalypse", "apoc-1");
    s.turn.successfulHqRunThisTurn = true;
    s.turn.successfulRdRunThisTurn = true;
    s.turn.successfulArchivesRunThisTurn = true;
    return s;
  }

  it("Hostile Infrastructure does 3 net damage when Apocalypse trashes it with 2 other Corp cards (CR 9.6.4b, 9.1.8g)", () => {
    let s = must(apocalypseBoard(), { type: "play_event", cardId: "apoc-1" });
    const prompts: string[] = [];
    for (let i = 0; i < 20 && s.pendingChoice; i++) {
      prompts.push(s.pendingChoice.prompt ?? "");
      s = answerAll(s, "draw");
      s = drive(s, (x) => x.timingKey === "runner.takeAction");
    }
    s = drive(s, (x) => x.timingKey === "runner.takeAction");
    for (const id of ["hi-1", "calvin-1", "iw-1"]) {
      expect(s.corp.discardPile).toContain(id);
    }
    // 5 cards, less Apocalypse played, less 3 net damage.
    expect(s.runner.hand.length).toBe(2);
  });

  it("Warroid Tracker has one instance when Apocalypse trashes it and another card of its server (CR 9.12.2a, 9.1.8g)", () => {
    const s0 = apocalypseBoard();
    const warroid = put(
      s0,
      "warroid-tracker",
      "wt-1",
      "server:remote-hi-1:root",
    );
    warroid.rezzed = true;
    warroid.faceup = true;
    s0.servers["remote-hi-1" as never]!.root.push("wt-1");
    const from = s0.log.length;
    const s = must(s0, { type: "play_event", cardId: "apoc-1" });
    const lines = s.log.slice(from).join("\n");
    expect(
      lines.match(/Warroid Tracker — one instance becomes pending/g)?.length,
    ).toBe(1);
  });

  it("every Hostile Infrastructure instance resolves before Apocalypse turns the Runner's cards facedown, so Feedback Filter stays usable for each damage (CR 9.11.3, 10.3.2)", () => {
    const s0 = apocalypseBoard();
    installRunner(s0, "feedback-filter", "ff-1");
    s0.cards["ff-1"]!.faceup = true;
    let s = must(s0, { type: "play_event", cardId: "apoc-1" });
    const faceupAtDamage: boolean[] = [];
    for (let i = 0; i < 30; i++) {
      if (s.pendingDamage) {
        faceupAtDamage.push(Boolean(s.cards["ff-1"]!.faceup));
        s = must(s, { type: "accept_damage" });
        continue;
      }
      if (s.pendingChoice) {
        const opts = s.pendingChoice.options;
        const hi = opts.find((o) =>
          /Hostile/.test((o as { label?: string }).label ?? ""),
        );
        s = must(s, {
          type: "choose_option",
          optionId: (hi ?? opts[opts.length - 1]!).id,
        });
        continue;
      }
      if (s.timingKey === "runner.takeAction") break;
      const pass = legalActions(s).find((a) => a.type === "pass_window");
      if (!pass) break;
      s = must(s, pass);
    }
    expect(faceupAtDamage).toEqual([true, true, true]);
    expect(s.cards["ff-1"]!.faceup).toBe(false);
  });

  it("the Corp chooses the order of Hostile Infrastructure's and Calvin B4L3Y's pending abilities after Apocalypse (CR 9.2.8d)", () => {
    let s = must(apocalypseBoard(), { type: "play_event", cardId: "apoc-1" });
    s = drive(
      s,
      (x) => Boolean(x.pendingChoice) || x.timingKey === "runner.takeAction",
    );
    expect(s.pendingChoice?.chooser).toBe("corp");
    const labels = (s.pendingChoice?.options ?? []).map(
      (o) => (o as { label?: string }).label ?? o.id,
    );
    expect(labels.some((l) => /Hostile Infrastructure/.test(l))).toBe(true);
    expect(labels.some((l) => /Calvin/.test(l))).toBe(true);
  });
});

describe("Atman's install ability is optional in part (CR 9.6.9c, 9.6.2)", () => {
  it("the Runner chooses how many credits to spend for Atman's power counters, 0 included, after installing it (CR 9.6.9c)", () => {
    const s0 = runnerTurn(fresh(), 8);
    toHand(s0, "runner", "atman", "atman-1");
    let s = must(s0, {
      type: "basic_install",
      cardId: "atman-1",
      destination: { kind: "installed" },
    });
    expect(s.pendingChoice?.chooser).toBe("runner");
    // 8 credits less Atman's install cost of 3: 5 to spend, or none.
    expect(optionIds(s)).toContain("spend-power:0");
    expect(optionIds(s)).toContain("spend-power:5");
    expect(optionIds(s)).not.toContain("spend-power:6");
    s = must(s, { type: "choose_option", optionId: "spend-power:2" });
    expect(s.cards["atman-1"]!.powerCounters).toBe(2);
    expect(s.runner.credits).toBe(3);
  });
});

describe("a 'you may' in a conditional ability can be declined (CR 9.6.9c)", () => {
  it("Tennin Institute's Corp may place no advancement counter (CR 9.6.9c)", () => {
    let s = fresh();
    setIdentity(s, "corp", "tennin-institute-the-secrets-within");
    installIce(s, "ice-wall", "iw-1", "hq", false);
    evalEffect(
      { state: s, sourceId: s.corp.identityId },
      fx.do({ kind: "tennin_place_advancement_on_installed" }),
    );
    expect(optionIds(s)).toContain("decline");
    s = must(s, { type: "choose_option", optionId: "decline" });
    expect(s.cards["iw-1"]!.advancementCounters ?? 0).toBe(0);
  });

  it("The Foundry's Corp may decline to search R&D for another copy of the ice it rezzed (CR 9.6.9c)", () => {
    let s = fresh();
    setIdentity(s, "corp", "the-foundry-refining-the-process");
    installIce(s, "ice-wall", "iw-1", "hq");
    put(s, "ice-wall", "iw-2", "corp:rd");
    s.corp.deck.unshift("iw-2");
    s.turn.iceRezzedThisTurn = 1;
    s.turn.rezzedThisTurnIds = ["iw-1"];
    evalEffect(
      { state: s, sourceId: s.corp.identityId },
      fx.do({ kind: "search_foundry_copy_to_hq" }),
    );
    expect(optionIds(s)).toEqual(["search", "decline"]);
    s = must(s, { type: "choose_option", optionId: "decline" });
    expect(s.corp.deck).toContain("iw-2");
    expect(s.corp.hand).not.toContain("iw-2");
  });
});
