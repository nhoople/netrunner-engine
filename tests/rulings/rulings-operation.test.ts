/**
 * Official rulings on operations (CR audit tool 1.14, fourth batch).
 *
 * Each it() names a card, states the ruling's answer in plain words, and
 * ends with the ruling number at the cards pin (vendor/cards-data/rulings/,
 * numbered in file order). tests/rulings/rulings.test.ts reads these titles. A
 * ruling the engine plays wrong is an it.skip naming the ruling and the CR
 * rule, filed under its area in the CR audit plan, not a fix here.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
} from "../../src/index.js";
import type { GameState } from "../../src/index.js";
import {
  atCorpAction,
  clearCorpHand,
  corpTurn,
  drive,
  fresh,
  installIce,
  installRoot,
  installRunner,
  must,
  optionIds,
  pick,
  put,
  setIdentity,
  toHand,
} from "./rulings-helpers.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.29");
});

/**
 * The Corp's turn with NBN: Making News, whose identity has no ability on
 * scoring (the default identity opens a choice on every score).
 */
function corpPlays(credits = 10): GameState {
  const s = corpTurn(fresh(), credits);
  setIdentity(s, "corp", "nbn-making-news");
  return s;
}

function giveRunnerCards(s: GameState, n: number): void {
  for (let i = 1; i <= n; i++) toHand(s, "runner", "sure-gamble", `grip-${i}`);
}

function play(s: GameState, defId: string, id: string): GameState {
  toHand(s, "corp", defId, id);
  return must(s, { type: "play_operation", cardId: id });
}

// ---------------------------------------------------------------------------
// Big Deal
// ---------------------------------------------------------------------------

describe("Big Deal", () => {
  it("Big Deal: the Corp may score outside a paid ability window, but only an agenda that meets its advancement requirement (ruling 1)", () => {
    let s = corpPlays(20);
    installRoot(s, "artificial-cryptocrash", "ac-1", false);
    s = play(s, "big-deal", "bd-1");
    if (s.pendingChoice && optionIds(s).some((id) => id.includes("ac-1"))) {
      s = pick(s, "ac-1");
    }
    s = drive(s, (x) => !!x.pendingChoice || x.activeSide === "runner");
    if (s.pendingChoice) s = pick(s, "score");
    // Requirement 4, 4 counters: scored, then Big Deal is removed.
    expect(s.corp.scoreArea).toContain("ac-1");
    expect(s.cards["bd-1"]!.zone).toBe("removed-from-game");

    let t = corpPlays(20);
    installRoot(t, "priority-requisition", "pr-1", false);
    t = play(t, "big-deal", "bd-2");
    if (t.pendingChoice && optionIds(t).some((id) => id.includes("pr-1"))) {
      t = pick(t, "pr-1");
    }
    // Requirement 5, 4 counters: no score is offered.
    expect(optionIds(t).some((id) => /score/.test(id))).toBe(false);
    expect(t.cards["pr-1"]!.advancementCounters).toBe(4);
    expect(t.corp.scoreArea).not.toContain("pr-1");
  });
});

// ---------------------------------------------------------------------------
// Divert Power
// ---------------------------------------------------------------------------

describe("Divert Power", () => {
  it("Divert Power: the Corp may play it and then derez and rez nothing (ruling 1)", () => {
    let s = corpPlays(10);
    installIce(s, "ice-wall", "iw-1", "hq");
    installRoot(s, "pad-campaign", "pad-1", false);
    s = play(s, "divert-power", "dp-1");
    s = pick(s, "done-derez-any");
    s = pick(s, "decline");
    s = drive(s, atCorpAction);
    expect(s.cards["iw-1"]!.rezzed).toBe(true);
    expect(s.cards["pad-1"]!.rezzed).toBe(false);
    expect(s.corp.discardPile).toContain("dp-1");
  });
});

// ---------------------------------------------------------------------------
// Fast Break
// ---------------------------------------------------------------------------

describe("Fast Break", () => {
  // Filed under area 11: Fast Break draws all X cards ("corp draws up to 2
  // (drew 2)") with no choice of how many. "Draw up to X" lets the Corp
  // choose a number from 0 to X first (CR 1.2.1, 8.4.5a).
  it.skip("Fast Break: the Corp chooses how many cards to draw, from 0 to X, before drawing (ruling 1; filed, area 11, CR 1.2.1: all X cards are drawn with no choice)", () => {
    let s = corpPlays(10);
    clearCorpHand(s);
    for (const id of ["rs-1", "rs-2"]) {
      put(s, "hostile-takeover", id, "runner:score");
      s.runner.scoreArea.push(id);
    }
    const deck = s.corp.deck.length;
    s = play(s, "fast-break", "fb-1");
    // X = 2: the Corp is asked for a number before any card is drawn.
    expect(s.corp.deck).toHaveLength(deck);
    expect(optionIds(s)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("0"),
        expect.stringContaining("1"),
        expect.stringContaining("2"),
      ]),
    );
  });
});

// ---------------------------------------------------------------------------
// Hansei Review
// ---------------------------------------------------------------------------

describe("Hansei Review", () => {
  it("Hansei Review: it is in the play area while it resolves, so with no other card in HQ nothing is trashed (ruling 1)", () => {
    let s = corpPlays(5);
    clearCorpHand(s);
    s = play(s, "hansei-review", "hr-1");
    s = drive(s, atCorpAction);
    // 5 − 5 to play + 10.
    expect(s.corp.credits).toBe(10);
    expect(s.corp.hand).toEqual([]);
    expect(s.corp.discardPile).toEqual(["hr-1"]);
  });
});

// ---------------------------------------------------------------------------
// Mitosis
// ---------------------------------------------------------------------------

describe("Mitosis", () => {
  // Filed under area 5 (fix-now): install_hq_new_remotes_with_advancements
  // installs the first 2 cards in HQ with no choice of which cards or how
  // many. "Install up to 2 cards from HQ" is the Corp's choice of targets,
  // 0 to 2 (CR 1.15.2, 1.2.1).
  it.skip("Mitosis: the Corp may play it and install 0 cards (ruling 1; filed, area 5, CR 1.15.2: the first 2 cards in HQ are installed with no choice)", () => {
    let s = corpPlays(10);
    clearCorpHand(s);
    toHand(s, "corp", "pad-campaign", "pad-1");
    toHand(s, "corp", "pad-campaign", "pad-2");
    s = play(s, "mitosis", "mi-1");
    s = pick(s, "done");
    s = drive(s, atCorpAction);
    expect(s.corp.hand).toEqual(["pad-1", "pad-2"]);
  });

  it("Mitosis: each card goes in a new remote server of its own, never an existing one (ruling 3)", () => {
    let s = corpPlays(10);
    clearCorpHand(s);
    installRoot(s, "pad-campaign", "pad-0", false);
    toHand(s, "corp", "pad-campaign", "pad-1");
    toHand(s, "corp", "pad-campaign", "pad-2");
    const servers = Object.keys(s.servers);
    s = play(s, "mitosis", "mi-1");
    // Only new servers are offered, if the Corp is asked at all.
    while (s.pendingChoice) {
      expect(optionIds(s).some((id) => id.includes("remote-pad-0"))).toBe(
        false,
      );
      s = must(s, { type: "choose_option", optionId: optionIds(s)[0]! });
    }
    s = drive(s, atCorpAction);
    const zones = ["pad-1", "pad-2"].map((id) => s.cards[id]!.zone);
    expect(zones[0]).not.toBe(zones[1]);
    for (const zone of zones) {
      const server = zone.split(":")[1]!;
      expect(servers).not.toContain(server);
      expect(s.servers[server as never]!.root).toHaveLength(1);
    }
    expect(s.cards["pad-1"]!.advancementCounters).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Neurospike
// ---------------------------------------------------------------------------

describe("Neurospike", () => {
  it("Neurospike: an agenda scored and then forfeited this turn still counts its printed points (ruling 1)", () => {
    let s = corpPlays(10);
    giveRunnerCards(s, 5);
    installRoot(s, "hostile-takeover", "ht-1", false).advancementCounters = 2;
    s.timingKey = "corp.actionPaw";
    s = must(s, { type: "score_agenda", cardId: "ht-1" });
    s = drive(s, atCorpAction);
    expect(s.corp.scoreArea).toContain("ht-1");
    // 24/7 News Cycle's additional cost forfeits Hostile Takeover.
    s = play(s, "24-7-news-cycle", "nc-1");
    if (s.pendingChoice) s = pick(s, "ht-1");
    s = drive(s, atCorpAction);
    expect(s.corp.scoreArea).not.toContain("ht-1");
    s = play(s, "neurospike", "ns-1");
    s = drive(s, atCorpAction);
    // Hostile Takeover is worth 1: 1 net damage.
    expect(s.runner.hand).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// Predictive Planogram
// ---------------------------------------------------------------------------

describe("Predictive Planogram", () => {
  it("Predictive Planogram: the Corp decides on both before resolving either (ruling 1)", () => {
    let s = corpPlays(5);
    s.runner.tags = 1;
    const hq = s.corp.hand.length;
    s = play(s, "predictive-planogram", "pp-1");
    expect(optionIds(s)).toEqual(
      expect.arrayContaining(["gain3", "draw3", "both"]),
    );
    s = pick(s, "both");
    s = drive(s, atCorpAction);
    expect(s.corp.credits).toBe(8);
    expect(s.corp.hand).toHaveLength(hq + 3);
  });

  // Filed under area 11: "Resolve both" always gains, then draws. A modal
  // ability's player picks which mode to resolve next, in any order
  // (CR 9.12.6b).
  it.skip("Predictive Planogram: resolving both, the Corp may draw first and then gain (ruling 1; filed, area 11, CR 9.12.6b: both modes resolve in printed order)", () => {
    let s = corpPlays(5);
    s.runner.tags = 1;
    s = play(s, "predictive-planogram", "pp-1");
    s = pick(s, "both");
    expect(optionIds(s)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("draw"),
        expect.stringContaining("gain"),
      ]),
    );
  });
});

// ---------------------------------------------------------------------------
// Public Trail
// ---------------------------------------------------------------------------

describe("Public Trail", () => {
  it("Public Trail: the tag it gives is the Runner taking a tag, so NBN: Reality Plus triggers (ruling 1)", () => {
    let s = corpTurn(fresh(), 10);
    setIdentity(s, "corp", "nbn-reality-plus");
    s.turn.successfulRunLastTurn = true;
    s.runner.credits = 0;
    s = play(s, "public-trail", "pt-1");
    s = drive(s, (x) => x.runner.tags > 0 && !x.pendingTags);
    expect(s.runner.tags).toBe(1);
    expect(s.pendingChoice?.sourceId).toBe(s.corp.identityId);
    expect(optionIds(s)).toEqual(["gain2", "draw2"]);
  });
});

// ---------------------------------------------------------------------------
// Seamless Launch
// ---------------------------------------------------------------------------

describe("Seamless Launch", () => {
  // Filed under area 12: place_advancements offers only agendas and cards
  // with canAdvance, and only the Corp's ("Place advancements — no
  // eligible card"). Placing counters is not advancing, so any installed
  // card the Corp did not install this turn qualifies (CR 1.18.2). Seen
  // here too: "did not install this turn" is only a preference
  // (preferNotInstalledThisTurn), so with no other card it places on one
  // installed this turn (CR 1.2.1).
  it.skip("Seamless Launch: it can place counters on a card the Corp cannot advance (ruling 1; filed, area 12, CR 1.18.2: only advanceable cards are offered)", () => {
    let s = corpPlays(5);
    installRoot(s, "pad-campaign", "pad-1");
    s = play(s, "seamless-launch", "sl-1");
    if (s.pendingChoice) s = pick(s, "pad-1");
    s = drive(s, atCorpAction);
    expect(s.cards["pad-1"]!.advancementCounters).toBe(2);
  });

  // Filed with ruling 1: Runner cards are never offered (CR 1.18.2).
  it.skip("Seamless Launch: it can place counters on one of the Runner's installed cards (ruling 2; filed, area 12, CR 1.18.2: Runner cards are not offered)", () => {
    let s = corpPlays(5);
    installRunner(s, "corroder", "cor-1");
    s = play(s, "seamless-launch", "sl-1");
    s = pick(s, "cor-1");
    s = drive(s, atCorpAction);
    expect(s.cards["cor-1"]!.advancementCounters).toBe(2);
  });

  it("Seamless Launch: placing counters is not advancing, so Oaktown Renovation gains nothing (ruling 3)", () => {
    let s = corpPlays(5);
    installRoot(s, "oaktown-renovation", "oak-1", false).faceup = true;
    s = play(s, "seamless-launch", "sl-1");
    if (s.pendingChoice) s = pick(s, "oak-1");
    s = drive(s, atCorpAction);
    expect(s.cards["oak-1"]!.advancementCounters).toBe(2);
    expect(s.corp.credits).toBe(4);
  });
});
