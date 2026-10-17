/**
 * Comprehensive Rules examples from chapter 10.
 * Each test plays that example's board. An example that already has a
 * test in a mechanism file stays in that file.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  fx,
  instantiateCard,
} from "../src/index.js";
import type { Action, GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.6");
});

function must(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`${result.error} ${JSON.stringify(result.cites)}`);
  return result.state;
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
