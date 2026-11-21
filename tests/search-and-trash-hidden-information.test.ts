/**
 * FX-access, items added 2026-11-21: a search of R&D and a trash of a
 * facedown ice must not tell the Runner what is hidden (CR 10.2.2b).
 *
 * - The shared deck search (`chooseCards` with `search`) always asks the
 *   searcher, lets them find nothing, and shows the other player one hidden
 *   option, so whether R&D holds a match stays hidden (CR 8.7.2e). The
 *   Foundry uses it, and shuffles R&D whether or not the Corp searches
 *   (decided 2026-11-21; CR 8.7.3).
 * - "Players cannot trash this ice" is an ability of an active card: an
 *   unrezzed Architect is trashed like any other ice (CR 1.8.3a, 1.8.4).
 */
import { describe, expect, it } from "vitest";
import { evalEffect, fx, getPublicView } from "../src/index.js";
import { checkpointAfterInstruction } from "../src/legality/checkpoints.js";
import { instantiateCard } from "../src/cards/load.js";
import type { GameState } from "../src/state/types.js";
import { Board, Report } from "./second-reader/harness.js";
import { drive as walk, run } from "./second-reader/driving.js";
import {
  corpTurn as corpTurnAt,
  drive,
  fresh,
  installRoot,
  paidAbility,
  setIdentity,
  installIce,
  must,
  optionIds,
  runnerTurn,
  toHand,
} from "./rulings-helpers.js";

function grip(s: GameState, n: number): void {
  for (let i = 0; i < n; i++) toHand(s, "runner", "sure-gamble", `grip-${i}`);
}

function answerAll(s: GameState, part: string): GameState {
  for (let i = 0; i < 10 && s.pendingChoice; i++) {
    const ids = optionIds(s);
    const id = ids.find((x) => x.includes(part)) ?? ids[0]!;
    s = must(s, { type: "choose_option", optionId: id });
  }
  return s;
}

/**
 * The Foundry's Corp rezzes its first ice of the turn, as the Runner
 * approaches it. R&D holds `rd`
 * (ten cards in all, so a shuffle shows).
 */
function foundryRez(rd: string[]): { s: GameState; rdBefore: string[] } {
  const b = new Board(new Report(), "runner", 5);
  b.identity("corp", "the-foundry-refining-the-process");
  const wall = b.ice("ice-wall", "hq", false);
  const filler = 10 - rd.length;
  b.rd(...rd, ...Array.from({ length: filler }, () => "hedge-fund"));
  const rdBefore = [...b.s.corp.deck];
  const at = walk(run(b.s, "hq"), (x) => x.timingKey === "run.approachPaw");
  const s = must(at, { type: "rez_ice", cardId: wall });
  return { s, rdBefore };
}

const runnerViewOfChoice = (s: GameState) => {
  const choice = getPublicView(s, "runner").pendingChoice;
  return choice && { chooser: choice.chooser, prompt: choice.prompt, options: choice.options };
};

describe("The Foundry searches R&D with the shared deck search (CR 8.7.2e, 8.7.3)", () => {
  it("The Foundry's search may find nothing even when R&D holds a copy (CR 8.7.2e)", () => {
    let { s } = foundryRez(["ice-wall"]);
    const copy = s.corp.deck.find((id) => s.cards[id]!.title === "Ice Wall")!;
    s = must(s, { type: "choose_option", optionId: "search" });
    expect(optionIds(s)).toEqual([`choose-card:${copy}`, "choose-cards-done"]);
    s = must(s, { type: "choose_option", optionId: "choose-cards-done" });
    expect(s.corp.deck).toContain(copy);
    expect(s.corp.hand).not.toContain(copy);
    expect(s.pendingChoice).toBeNull();
  });

  it("The Foundry's search finds the copy when the Corp takes it, and reveals it (CR 8.7.2c)", () => {
    let { s } = foundryRez(["ice-wall"]);
    const copy = s.corp.deck.find((id) => s.cards[id]!.title === "Ice Wall")!;
    s = must(s, { type: "choose_option", optionId: "search" });
    s = must(s, { type: "choose_option", optionId: `choose-card:${copy}` });
    expect(s.corp.hand).toContain(copy);
    expect(s.corp.deck).not.toContain(copy);
  });

  it("the Runner sees the same search whether or not R&D holds a copy (CR 8.7.2e, 10.2.2b)", () => {
    const withCopy = must(foundryRez(["ice-wall"]).s, {
      type: "choose_option",
      optionId: "search",
    });
    const without = must(foundryRez([]).s, {
      type: "choose_option",
      optionId: "search",
    });
    expect(withCopy.pendingChoice?.chooser).toBe("corp");
    expect(without.pendingChoice?.chooser).toBe("corp");
    expect(runnerViewOfChoice(withCopy)).toEqual(runnerViewOfChoice(without));
    expect(runnerViewOfChoice(without)?.options).toEqual([
      expect.objectContaining({ id: "hidden:0", label: "Hidden" }),
    ]);
  });

  it("The Foundry shuffles R&D even when the Corp does not search (CR 8.7.3)", () => {
    let { s, rdBefore } = foundryRez(["ice-wall"]);
    s = must(s, { type: "choose_option", optionId: "decline" });
    expect([...s.corp.deck].sort()).toEqual([...rdBefore].sort());
    expect(s.corp.deck).not.toEqual(rdBefore);
    expect(s.log.join("\n")).toContain("does not search; shuffle R&D");
  });

  it("The Foundry shuffles R&D when the search finds nothing (CR 8.7.3)", () => {
    let { s, rdBefore } = foundryRez([]);
    s = must(s, { type: "choose_option", optionId: "search" });
    s = must(s, { type: "choose_option", optionId: "choose-cards-done" });
    expect(s.corp.deck).not.toEqual(rdBefore);
    expect(s.log.join("\n")).toContain("no card found; shuffle R&D");
  });
});

describe("other R&D searches with criteria use the shared deck search (CR 8.7.2e, 10.2.2b)", () => {
  /** Editorial Division's Corp searches R&D; R&D holds `rd`, padded to ten cards. */
  function editorial(rd: string[], setup?: (s: GameState) => void): GameState {
    const b = new Board(new Report(), "corp", 5);
    const id = b.identity("corp", "editorial-division-ad-nihilum");
    b.rd(...rd, ...Array.from({ length: 10 - rd.length }, () => "hedge-fund"));
    setup?.(b.s);
    const r = evalEffect(
      { state: b.s, sourceId: id },
      fx.do({
        kind: "may_search_rd_non_agenda_any_subtype_to_hq",
        subtypes: ["black ops", "gray ops", "liability"],
      }),
    );
    expect(r.ok).toBe(true);
    return b.s;
  }

  it("Editorial Division's search may find nothing even when R&D holds a black ops card (CR 8.7.2e)", () => {
    let s = editorial(["scorched-earth"]);
    const se = s.corp.deck.find((id) => s.cards[id]!.title === "Scorched Earth")!;
    expect(optionIds(s)).toEqual([`choose-card:${se}`, "choose-cards-done"]);
    s = must(s, { type: "choose_option", optionId: "choose-cards-done" });
    expect(s.corp.deck).toContain(se);
    expect(s.corp.hand).not.toContain(se);
  });

  it("the Runner sees the same Editorial Division search whether or not R&D holds a match (CR 10.2.2b)", () => {
    expect(runnerViewOfChoice(editorial(["scorched-earth"]))).toEqual(
      runnerViewOfChoice(editorial([])),
    );
    expect(editorial([]).pendingChoice?.chooser).toBe("corp");
  });

  it("Ob Superheavy Logistics asks the Corp even when R&D holds no card of the right rez cost (CR 8.7.2e, 10.2.2b)", () => {
    const b = new Board(new Report(), "corp", 5);
    const id = b.identity("corp", "ob-superheavy-logistics-extract-export-excel");
    b.rd(...Array.from({ length: 5 }, () => "hedge-fund"));
    b.s.turn.lastTrashedRezzedPrintedRezCost = 3;
    const r = evalEffect(
      { state: b.s, sourceId: id },
      fx.do({ kind: "search_rd_install_rez_by_printed_rez_cost", delta: -1 }),
    );
    expect(r.ok).toBe(true);
    expect(b.s.pendingChoice?.chooser).toBe("corp");
    expect(optionIds(b.s)).toEqual(["choose-cards-done"]);
    expect(runnerViewOfChoice(b.s)?.options).toEqual([
      expect.objectContaining({ id: "hidden:0", label: "Hidden" }),
    ]);
  });
});

describe("a paid ability's effect waits for a choice its trash cost triggered (CR 10.3.4, 10.3.2)", () => {
  it("with Ob Superheavy Logistics, Alexa Belsky's shuffle choice still follows Ob's search (CR 10.3.4)", () => {
    let s = corpTurnAt(fresh(), 5);
    setIdentity(s, "corp", "ob-superheavy-logistics-extract-export-excel");
    installRoot(s, "alexa-belsky", "ab-1", true);
    toHand(s, "corp", "hedge-fund", "hf-hq");
    s.runner.credits = 0;
    s.timingKey = "corp.actionPaw";
    s = must(s, paidAbility(s, "ab-1")!);
    expect(optionIds(s)).toEqual(["choose-cards-done"]);
    s = must(s, { type: "choose_option", optionId: "choose-cards-done" });
    expect(optionIds(s).some((id) => id.startsWith("alexa:"))).toBe(true);
  });

  // Filed under area 2 (trash procedure): Ob's trigger checkpoint runs
  // inside the trash cost, before the advancement counters are set aside,
  // so they are lost whatever Ob finds (CR 10.3.4, 9.5.5).
  it.skip("with Ob Superheavy Logistics, Reconstruction Contract still moves its advancements after Ob's search (filed, area 2, CR 10.3.4: the trash's checkpoint runs before the cost is paid)", () => {
    let s = corpTurnAt(fresh(), 5);
    setIdentity(s, "corp", "ob-superheavy-logistics-extract-export-excel");
    const rc = installRoot(s, "reconstruction-contract", "rc-1", true);
    rc.advancementCounters = 2;
    installIce(s, "ice-wall", "iw-1", "hq", true);
    s.timingKey = "corp.actionPaw";
    s = must(s, paidAbility(s, "rc-1")!);
    // Ob's search comes first: R&D holds no 0-cost card, so it finds nothing.
    expect(optionIds(s)).toContain("choose-cards-done");
    s = must(s, { type: "choose_option", optionId: "choose-cards-done" });
    // Then Reconstruction Contract's move: both tokens onto Ice Wall.
    for (let i = 0; i < 6 && s.pendingChoice; i++) {
      const ids = optionIds(s);
      const id =
        ids.find((x) => x.includes("iw-1")) ??
        ids.find((x) => /(^|:)2$/.test(x)) ??
        ids[0]!;
      s = must(s, { type: "choose_option", optionId: id });
    }
    expect(s.cards["iw-1"]!.advancementCounters ?? 0).toBe(2);
    expect(s.corp.discardPile).toContain("rc-1");
  });
});

describe("an unrezzed Architect is trashed like any other ice (CR 1.8.3a, 1.8.4, 10.2.2b)", () => {
  /** Apocalypse in the grip; `ice` installed unrezzed on HQ. */
  function apocalypse(ice: string): GameState {
    const s = runnerTurn(fresh(), 10);
    installIce(s, ice, "ice-1", "hq", false);
    grip(s, 3);
    toHand(s, "runner", "apocalypse", "apoc-1");
    s.turn.successfulHqRunThisTurn = true;
    s.turn.successfulRdRunThisTurn = true;
    s.turn.successfulArchivesRunThisTurn = true;
    return s;
  }

  function play(s0: GameState): GameState {
    let s = must(s0, { type: "play_event", cardId: "apoc-1" });
    for (let i = 0; i < 20 && s.pendingChoice; i++) {
      s = answerAll(s, "draw");
      s = drive(s, (x) => x.timingKey === "runner.takeAction");
    }
    return drive(s, (x) => x.timingKey === "runner.takeAction");
  }

  it("Apocalypse trashes an unrezzed Architect (CR 8.1.4a, 10.2.2b)", () => {
    const s = play(apocalypse("architect"));
    expect(s.corp.discardPile).toContain("ice-1");
  });

  it("Apocalypse treats an unrezzed Architect and an unrezzed Ice Wall the same (CR 10.2.2b)", () => {
    const architect = play(apocalypse("architect"));
    const wall = play(apocalypse("ice-wall"));
    expect(architect.cards["ice-1"]!.zone).toBe(wall.cards["ice-1"]!.zone);
    expect(architect.log.some((l) => l.includes("cannot trash"))).toBe(false);
  });

  it("a rezzed Architect still cannot be trashed (CR 1.8.3a)", () => {
    const s0 = apocalypse("architect");
    s0.cards["ice-1"]!.rezzed = true;
    s0.cards["ice-1"]!.faceup = true;
    const s = play(s0);
    expect(s.corp.discardPile).not.toContain("ice-1");
  });

  /** Trypano with 5 virus counters hosted on an Architect protecting HQ. */
  function trypanoOnArchitect(rezzed: boolean): GameState {
    const s = runnerTurn(fresh(), 5);
    installIce(s, "architect", "arch-1", "hq", rezzed);
    s.cards["arch-1"]!.hostedCardIds = ["tryp-1"];
    const trypano = instantiateCard("trypano", "tryp-1", "runner:installed");
    trypano.hostId = "arch-1";
    trypano.virusCounters = 5;
    s.cards["tryp-1"] = trypano;
    s.runner.installed.push("tryp-1");
    checkpointAfterInstruction(s, "test");
    return s;
  }

  it("Trypano trashes an unrezzed Architect it is hosted on (CR 1.8.3a, 10.2.2b)", () => {
    expect(trypanoOnArchitect(false).cards["arch-1"]!.zone).toBe("corp:archives");
  });

  it("Trypano cannot trash a rezzed Architect (CR 1.8.3a)", () => {
    expect(trypanoOnArchitect(true).cards["arch-1"]!.zone).toBe("server:hq:ice");
  });
});
