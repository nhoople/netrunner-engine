/**
 * Ported from game.core.access-test in mtgred/netrunner, pinned at
 * bc9e2fca073a5b21d247e72877804118e81d5472. See tests/jnet/NOTICE.md and
 * docs/jnet-test-ports.md. Scenarios that drive jnet's internal access-bonus
 * and access-count helpers are recorded as deferred in the manifest; the
 * boards below reach the same access outcomes through legal intents.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  legalActions,
} from "../../src/index.js";
import {
  accessCard,
  accessingTitle,
  clickPrompt,
  finishAccess,
  firstRemote,
  must,
  newGame,
  playFromHand,
  qty,
  runToAccess,
  stealAccessed,
  takeCredits,
  walkToAccess,
} from "./helpers.js";
import type { GameState, ServerId } from "../../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.8");
});

function runnerAgendaPoints(state: GameState): number {
  return state.runner.scoreArea.reduce(
    (total, id) => total + (state.cards[id]?.agendaPoints ?? 0),
    0,
  );
}

function candidates(state: GameState): string[] {
  return state.run?.accessCandidates ?? [];
}

function rootIds(state: GameState, serverId: ServerId): string[] {
  return state.servers[serverId]?.root ?? [];
}

function declineAccess(state: GameState, cardId: string): GameState {
  return finishAccess(accessCard(state, cardId));
}

describe("jnet ports — core access", () => {
  // jnet: game.core.access-test/rd-access
  it("A run on R&D with an empty deck ends with nothing to access", () => {
    let state = newGame({
      corpDeck: ["Hedge Fund"],
      corpHand: qty("Hedge Fund", 4),
    });
    state = takeCredits(state, "corp");
    state = runToAccess(state, "rd");
    expect(state.run).toBeNull();
    expect(state.pendingChoice).toBeNull();
  });

  // jnet: game.core.access-test/rd-access
  it("Runner accesses the top card of R&D and takes no action", () => {
    let state = newGame({
      corpDeck: qty("Hedge Fund", 5),
      corpHand: ["Hedge Fund"],
    });
    state = takeCredits(state, "corp");
    state = runToAccess(state, "rd");
    const top = state.corp.deck[0]!;
    state = accessCard(state, top);
    expect(state.log.some((l) => l.includes("Accessed Hedge Fund"))).toBe(true);
    state = finishAccess(state);
    expect(state.run).toBeNull();
    expect(state.pendingChoice).toBeNull();
  });

  // jnet: game.core.access-test/rd-access
  it("Runner accesses an unrezzed upgrade in the root of R&D and declines to trash it", () => {
    let state = newGame({
      corpDeck: ["Hedge Fund"],
      corpHand: [...qty("Hedge Fund", 4), "Bryan Stinson"],
    });
    state = playFromHand(state, "corp", "Bryan Stinson", "R&D");
    state = takeCredits(state, "corp");
    state = runToAccess(state, "rd");
    const bryan = rootIds(state, "rd")[0]!;
    expect(candidates(state)).toEqual([bryan]);
    state = accessCard(state, bryan);
    expect(
      legalActions(state).some(
        (a) => a.type === "trash_accessed" && a.cardId === bryan,
      ),
    ).toBe(true);
    state = finishAccess(state);
    expect(state.run).toBeNull();
  });

  // jnet: game.core.access-test/rd-access
  it("Runner accesses a card from R&D and then the upgrade in its root", () => {
    let state = newGame({
      corpDeck: qty("Hedge Fund", 5),
      corpHand: ["Bryan Stinson"],
    });
    state = playFromHand(state, "corp", "Bryan Stinson", "R&D");
    state = takeCredits(state, "corp");
    state = runToAccess(state, "rd");
    state = declineAccess(state, state.corp.deck[0]!);
    state = declineAccess(state, rootIds(state, "rd")[0]!);
    expect(state.run).toBeNull();
    expect(state.pendingChoice).toBeNull();
  });

  // jnet: game.core.access-test/rd-access
  it("The Maker's Eye accesses 3 cards from R&D and steals the agendas among them", () => {
    let state = newGame({
      corpDeck: [
        "Hedge Fund",
        "Hostile Takeover",
        "Hedge Fund",
        "Hostile Takeover",
        ...qty("Hedge Fund", 3),
      ],
      corpHand: [],
      runnerHand: ["The Maker's Eye"],
    });
    state = takeCredits(state, "corp");
    state = playFromHand(state, "runner", "The Maker's Eye", "R&D");
    state = state.run ? walkToAccess(state, "rd") : runToAccess(state, "rd");
    for (let access = 0; access < 3; access++) {
      const top = candidates(state)[0]!;
      state = accessCard(state, top);
      if (state.cards[top]?.title === "Hostile Takeover") {
        expect(accessingTitle(state)).toBe("Hostile Takeover");
        state = stealAccessed(state, top);
      }
      state = finishAccess(state);
    }
    expect(state.run).toBeNull();
    expect(state.runner.scoreArea).toHaveLength(2);
  });

  // jnet: game.core.access-test/hq-access
  it("A run on HQ with an empty hand ends with nothing to access", () => {
    let state = newGame({ corpDeck: qty("Hedge Fund", 5), corpHand: [] });
    state = playFromHand(state, "corp", "Hedge Fund");
    expect(state.corp.hand).toHaveLength(0);
    state = takeCredits(state, "corp");
    state = runToAccess(state, "hq");
    expect(state.run).toBeNull();
    expect(state.pendingChoice).toBeNull();
  });

  // jnet: game.core.access-test/hq-access
  it("Runner accesses a card from HQ and takes no action", () => {
    let state = newGame({
      corpDeck: qty("Hedge Fund", 5),
      corpHand: ["Hedge Fund"],
    });
    state = takeCredits(state, "corp");
    state = runToAccess(state, "hq");
    expect(candidates(state)).toHaveLength(1);
    state = declineAccess(state, candidates(state)[0]!);
    expect(state.run).toBeNull();
  });

  // jnet: game.core.access-test/hq-access
  it("Runner accesses an unrezzed upgrade in the root of HQ and declines to trash it", () => {
    let state = newGame({
      corpDeck: qty("Hedge Fund", 5),
      corpHand: ["Bryan Stinson"],
    });
    state = playFromHand(state, "corp", "Bryan Stinson", "HQ");
    state = playFromHand(state, "corp", "Hedge Fund");
    state = takeCredits(state, "corp");
    state = runToAccess(state, "hq");
    const bryan = rootIds(state, "hq")[0]!;
    expect(candidates(state)).toEqual([bryan]);
    state = declineAccess(state, bryan);
    expect(state.run).toBeNull();
  });

  // jnet: game.core.access-test/hq-access
  it("Runner accesses two unrezzed upgrades in the root of HQ in turn", () => {
    let state = newGame({
      corpDeck: qty("Hedge Fund", 5),
      corpHand: ["Bryan Stinson", "Expo Grid"],
    });
    state = playFromHand(state, "corp", "Bryan Stinson", "HQ");
    state = playFromHand(state, "corp", "Expo Grid", "HQ");
    state = playFromHand(state, "corp", "Hedge Fund");
    state = takeCredits(state, "corp");
    state = runToAccess(state, "hq");
    const [first, second] = rootIds(state, "hq");
    state = declineAccess(state, first!);
    state = declineAccess(state, second!);
    expect(state.run).toBeNull();
    expect(state.pendingChoice).toBeNull();
  });

  // jnet: game.core.access-test/hq-access
  it("Runner accesses a card from HQ and then the upgrade in its root", () => {
    let state = newGame({
      corpDeck: qty("Hedge Fund", 5),
      corpHand: ["Hedge Fund", "Bryan Stinson"],
    });
    state = playFromHand(state, "corp", "Bryan Stinson", "HQ");
    state = takeCredits(state, "corp");
    state = runToAccess(state, "hq");
    const bryan = rootIds(state, "hq")[0]!;
    const fromHand = candidates(state).find((id) => id !== bryan)!;
    state = declineAccess(state, fromHand);
    state = declineAccess(state, bryan);
    expect(state.run).toBeNull();
  });

  // jnet: game.core.access-test/hq-access
  it("Runner pays 5 credits to trash Bryan Stinson as the only card accessed from HQ", () => {
    let state = newGame({
      corpDeck: qty("Hedge Fund", 5),
      corpHand: ["Bryan Stinson"],
    });
    state = playFromHand(state, "corp", "Bryan Stinson", "HQ");
    state = playFromHand(state, "corp", "Hedge Fund");
    state = takeCredits(state, "corp");
    state = runToAccess(state, "hq");
    const bryan = rootIds(state, "hq")[0]!;
    state = accessCard(state, bryan);
    const creditsBefore = state.runner.credits;
    state = must(state, { type: "trash_accessed", cardId: bryan });
    expect(state.runner.credits).toBe(creditsBefore - 5);
    expect(state.corp.discardPile).toContain(bryan);
    state = finishAccess(state);
    expect(state.run).toBeNull();
  });

  // jnet: game.core.access-test/archives-access
  it("A run on empty Archives ends with nothing to access", () => {
    let state = newGame({
      corpDeck: qty("Hedge Fund", 5),
      corpHand: ["Hedge Fund"],
    });
    state = takeCredits(state, "corp");
    state = runToAccess(state, "archives");
    expect(state.pendingChoice).toBeNull();
  });

  // jnet: game.core.access-test/archives-access
  it("Runner accesses non-interactive cards in Archives and the run ends", () => {
    let state = newGame({
      corpDeck: qty("Hedge Fund", 5),
      corpHand: ["Hedge Fund"],
      corpDiscard: ["Hedge Fund", "Beanstalk Royalties"],
    });
    state = takeCredits(state, "corp");
    state = runToAccess(state, "archives");
    for (const id of [...candidates(state)]) {
      state = declineAccess(state, id);
    }
    expect(state.run).toBeNull();
    expect(state.runner.scoreArea).toHaveLength(0);
  });

  // jnet: game.core.access-test/archives-access
  it("Runner steals an agenda from Archives for 1 agenda point", () => {
    let state = newGame({
      corpDeck: qty("Hedge Fund", 5),
      corpHand: ["Hedge Fund"],
      corpDiscard: ["Hostile Takeover"],
    });
    state = takeCredits(state, "corp");
    state = runToAccess(state, "archives");
    const agenda = candidates(state)[0]!;
    state = accessCard(state, agenda);
    state = stealAccessed(state, agenda);
    expect(runnerAgendaPoints(state)).toBe(1);
    state = finishAccess(state);
    expect(state.run).toBeNull();
  });

  // jnet: game.core.access-test/archives-access
  it("Runner steals two agendas from Archives for 2 agenda points", () => {
    let state = newGame({
      corpDeck: qty("Hedge Fund", 5),
      corpHand: ["Hedge Fund"],
      corpDiscard: ["Hostile Takeover", "15 Minutes"],
    });
    state = takeCredits(state, "corp");
    state = runToAccess(state, "archives");
    for (const title of ["Hostile Takeover", "15 Minutes"]) {
      const id = candidates(state).find(
        (candidate) => state.cards[candidate]?.title === title,
      )!;
      state = accessCard(state, id);
      state = stealAccessed(state, id);
      state = finishAccess(state);
    }
    expect(runnerAgendaPoints(state)).toBe(2);
    expect(state.run).toBeNull();
  });

  // jnet: game.core.access-test/archives-access
  it("Corp may purge when Cyberdex Virus Suite is accessed from Archives", () => {
    let state = newGame({
      corpDeck: qty("Hedge Fund", 5),
      corpHand: ["Hedge Fund"],
      corpDiscard: ["Cyberdex Virus Suite"],
    });
    state = takeCredits(state, "corp");
    state = runToAccess(state, "archives");
    state = accessCard(state, candidates(state)[0]!);
    expect(state.pendingChoice?.chooser).toBe("corp");
    state = clickPrompt(state, "Purge virus counters");
    state = finishAccess(state);
    expect(state.run).toBeNull();
  });

  // jnet: game.core.access-test/archives-access
  it("Runner takes 1 net damage from Shock! in Archives and answers the Cyberdex Virus Suite choice", () => {
    let state = newGame({
      corpDeck: qty("Hedge Fund", 5),
      corpHand: ["Hedge Fund"],
      corpDiscard: ["Cyberdex Virus Suite", "Shock!"],
      runnerHand: qty("Sure Gamble", 3),
    });
    state = takeCredits(state, "corp");
    state = runToAccess(state, "archives");
    const shock = candidates(state).find(
      (id) => state.cards[id]?.title === "Shock!",
    )!;
    const gripBefore = state.runner.hand.length;
    state = accessCard(state, shock);
    expect(state.runner.hand.length).toBe(gripBefore - 1);
    state = finishAccess(state);
    const cvs = candidates(state).find(
      (id) => state.cards[id]?.title === "Cyberdex Virus Suite",
    )!;
    state = accessCard(state, cvs);
    state = clickPrompt(state, "Purge virus counters");
    state = finishAccess(state);
    expect(state.run).toBeNull();
  });

  // jnet: game.core.access-test/archives-access
  it("Runner accesses Cyberdex Virus Suite and then steals Hostile Takeover from Archives", () => {
    let state = newGame({
      corpDeck: qty("Hedge Fund", 5),
      corpHand: ["Hedge Fund"],
      corpDiscard: ["Hostile Takeover", "Cyberdex Virus Suite"],
    });
    state = takeCredits(state, "corp");
    state = runToAccess(state, "archives");
    const cvs = candidates(state).find(
      (id) => state.cards[id]?.title === "Cyberdex Virus Suite",
    )!;
    state = accessCard(state, cvs);
    state = clickPrompt(state, "Purge virus counters");
    state = finishAccess(state);
    const agenda = candidates(state).find(
      (id) => state.cards[id]?.title === "Hostile Takeover",
    )!;
    state = accessCard(state, agenda);
    expect(accessingTitle(state)).toBe("Hostile Takeover");
    state = stealAccessed(state, agenda);
    expect(runnerAgendaPoints(state)).toBe(1);
    state = finishAccess(state);
    expect(state.run).toBeNull();
  });

  // jnet: game.core.access-test/archives-access
  it("Runner steals three copies of Breaking News from Archives", () => {
    let state = newGame({
      corpDeck: qty("Hedge Fund", 5),
      corpHand: ["Hedge Fund"],
      corpDiscard: qty("Breaking News", 3),
    });
    state = takeCredits(state, "corp");
    state = runToAccess(state, "archives");
    for (let i = 0; i < 3; i++) {
      const id = candidates(state)[0]!;
      state = accessCard(state, id);
      state = stealAccessed(state, id);
      state = finishAccess(state);
    }
    expect(state.runner.scoreArea).toHaveLength(3);
    expect(state.corp.discardPile).toHaveLength(0);
  });

  // jnet: game.core.access-test/archives-access
  it("Runner accesses the faceup cards in Archives and steals Global Food Initiative", () => {
    let state = newGame({
      corpDeck: qty("Hedge Fund", 5),
      corpHand: ["Hedge Fund"],
      corpDiscard: ["Global Food Initiative", ...qty("Blue Level Clearance", 3)],
    });
    state = takeCredits(state, "corp");
    state = runToAccess(state, "archives");
    while (state.run && candidates(state).length > 0) {
      const id = candidates(state)[0]!;
      state = accessCard(state, id);
      if (state.cards[id]?.title === "Global Food Initiative") {
        state = stealAccessed(state, id);
      }
      state = finishAccess(state);
    }
    expect(
      state.runner.scoreArea.map((id) => state.cards[id]?.title),
    ).toEqual(["Global Food Initiative"]);
    expect(state.run).toBeNull();
  });

  // jnet: game.core.access-test/multiple-trash-abilities
  it("Imp spends a hosted virus counter to trash Mumbad Virtual Tour on access", () => {
    let state = newGame({
      corpDeck: qty("Hedge Fund", 5),
      corpHand: ["Mumbad Virtual Tour"],
      runnerHand: ["Imp"],
      runnerCredits: 10,
    });
    state = playFromHand(state, "corp", "Mumbad Virtual Tour");
    const tour = firstRemote(state).root[0]!;
    state = takeCredits(state, "corp");
    state = playFromHand(state, "runner", "Imp");
    const imp = Object.values(state.cards).find((c) => c.title === "Imp")!;
    expect(imp.virusCounters ?? 0).toBe(2);
    state = runToAccess(state, firstRemote(state).id as ServerId);
    state = accessCard(state, tour);
    expect(
      state.pendingChoice?.options.some((o) =>
        o.label.includes("virus counter"),
      ),
    ).toBe(true);
    state = clickPrompt(state, "Spend a virus counter on Imp");
    expect(state.corp.discardPile).toContain(tour);
    expect(state.cards[imp.id]?.virusCounters ?? 0).toBe(1);
    state = finishAccess(state);
    expect(state.run).toBeNull();
  });
});
