/**
 * Official rulings on agendas (CR audit tool 1.14, fourth batch).
 *
 * Each it() names a card, states the ruling's answer in plain words, and
 * ends with the ruling number at the cards pin (vendor/cards-data/rulings/,
 * numbered in file order). tests/rulings.test.ts reads these titles. A
 * ruling the engine plays wrong is an it.skip naming the ruling and the CR
 * rule, filed under its area in the CR audit plan, not a fix here.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  legalActions,
} from "../src/index.js";
import type { GameState } from "../src/index.js";
import type { ServerId } from "../src/state/types.js";
import {
  atCorpAction,
  corpTurn,
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
} from "./rulings-helpers.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.26");
});

function giveRunnerCards(s: GameState, n: number): void {
  for (let i = 1; i <= n; i++) toHand(s, "runner", "sure-gamble", `grip-${i}`);
}

/** An agenda alone in a new remote, with `counters` advancement counters. */
function agendaReady(
  s: GameState,
  defId: string,
  id: string,
  counters: number,
) {
  installRoot(s, defId, id, false).advancementCounters = counters;
}

/**
 * The Corp's turn with NBN: Making News, whose identity has no ability on
 * scoring (the default identity opens a choice on every score).
 */
function corpScoring(credits = 5): GameState {
  const s = corpTurn(fresh(), credits);
  setIdentity(s, "corp", "nbn-making-news");
  return s;
}

/** Score `id` in the Corp's action-phase paid ability window. */
function score(s: GameState, id: string): GameState {
  s.timingKey = "corp.actionPaw";
  return must(s, { type: "score_agenda", cardId: id });
}

function toArchives(s: GameState, defId: string, id: string, faceup = false) {
  put(s, defId, id, "corp:archives").faceup = faceup;
  s.corp.discardPile.push(id);
}

// ---------------------------------------------------------------------------
// Artificial Cryptocrash
// ---------------------------------------------------------------------------

describe("Artificial Cryptocrash", () => {
  it("Artificial Cryptocrash: with fewer than 7 credits the Runner loses all of them (ruling 1)", () => {
    let s = corpScoring(5);
    s.runner.credits = 3;
    agendaReady(s, "artificial-cryptocrash", "ac-1", 4);
    s = score(s, "ac-1");
    s = drive(s, atCorpAction);
    expect(s.corp.scoreArea).toContain("ac-1");
    expect(s.runner.credits).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Azef Protocol
// ---------------------------------------------------------------------------

describe("Azef Protocol", () => {
  /** Ob Superheavy Logistics; Azef ready in a remote with Ice Wall and a PAD Campaign to trash. */
  function azefOb(found: string): GameState {
    const s = corpTurn(fresh(), 5);
    setIdentity(s, "corp", "ob-superheavy-logistics-extract-export-excel");
    giveRunnerCards(s, 3);
    agendaReady(s, "azef-protocol", "azef-1", 3);
    installIce(s, "ice-wall", "iw-1", "remote-azef-1" as ServerId);
    installRoot(s, "pad-campaign", "pad-1");
    stackRd(s, [
      [found, "found-1"],
      ["hedge-fund", "hf-1"],
    ]);
    return s;
  }

  it("Azef Protocol: Malapert Data Vault found by Ob after the cost is paid and installed in Azef's root triggers on the score (ruling 1)", () => {
    let s = score(azefOb("malapert-data-vault"), "azef-1");
    if (s.pendingChoice) s = pick(s, "pad-1");
    // PAD Campaign (printed rez 2) finds Malapert Data Vault (1).
    s = pick(s, "found-1");
    s = pick(s, "remote-azef-1");
    expect(s.cards["found-1"]!.zone).toBe("server:remote-azef-1:root");
    s = drive(s, () => false);
    expect(s.corp.scoreArea).toContain("azef-1");
    expect(s.pendingChoice?.sourceId).toBe("found-1");
  });

  // Filed under area 11 with Ob Superheavy Logistics ruling 15: choosing
  // Azef's root for the found asset is refused, though the install is legal
  // and the score then finds no installed Azef (CR 9.11.1a, 1.17.3).
  it.skip("Azef Protocol: an asset found by Ob and installed in Azef's root trashes Azef, so Azef is not scored (ruling 2; filed, area 11, CR 9.11.1a: the install is refused because the score then fails)", () => {
    let s = score(azefOb("alexa-belsky"), "azef-1");
    if (s.pendingChoice) s = pick(s, "pad-1");
    s = pick(s, "found-1");
    s = pick(s, "install-dest:remote-azef-1");
    s = drive(s, atCorpAction);
    expect(s.cards["found-1"]!.zone).toBe("server:remote-azef-1:root");
    expect(s.corp.scoreArea).not.toContain("azef-1");
    expect(s.corp.discardPile).toContain("azef-1");
  });

  it("Azef Protocol: with 2 counters and SanSan City Grid in its root, the Corp cannot trash SanSan to pay the cost (ruling 3)", () => {
    let s = corpScoring(5);
    giveRunnerCards(s, 3);
    agendaReady(s, "azef-protocol", "azef-1", 2);
    put(s, "sansan-city-grid", "ssg-1", "server:remote-azef-1:root");
    s.servers["remote-azef-1" as ServerId]!.root.push("ssg-1");
    s.cards["ssg-1"]!.rezzed = true;
    s.cards["ssg-1"]!.faceup = true;
    installRoot(s, "pad-campaign", "pad-1");
    s.timingKey = "corp.actionPaw";
    expect(legalActions(s)).toContainEqual({
      type: "score_agenda",
      cardId: "azef-1",
    });
    s = must(s, { type: "score_agenda", cardId: "azef-1" });
    // SanSan is not offered for the cost; PAD Campaign is.
    expect(optionIds(s).some((id) => id.includes("ssg-1"))).toBe(false);
    s = pick(s, "pad-1");
    s = drive(s, atCorpAction);
    expect(s.corp.scoreArea).toContain("azef-1");
    expect(s.cards["ssg-1"]!.zone).toBe("server:remote-azef-1:root");
  });
});

// ---------------------------------------------------------------------------
// Blood in the Water
// ---------------------------------------------------------------------------

describe("Blood in the Water", () => {
  // Filed under area 12: Amani Senai's trace reads the scored agenda's
  // printed advancement requirement (`lastAgendaAdvancementRequirement`),
  // which is X here, so it traces at 0. Blood in the Water's X is defined
  // by its own ability, active in the score area too (CR 9.1.8e, 3.2.2a).
  it.skip("Blood in the Water: scored with 2 cards in the grip, Amani Senai's trace has base strength 2 (ruling 1; filed, area 12, CR 9.1.8e: Amani reads the printed requirement and traces at 0)", () => {
    let s = corpScoring(10);
    giveRunnerCards(s, 2);
    installRoot(s, "amani-senai", "am-1");
    agendaReady(s, "blood-in-the-water", "bw-1", 2);
    s = score(s, "bw-1");
    s = pick(s, "accept");
    expect(s.log.some((l) => /Trace initiated strength 2\b/.test(l))).toBe(
      true,
    );
  });

  // Filed with ruling 1: RNG Key compares the named number with the printed
  // advancement requirement, so Blood in the Water never matches (CR 9.1.8e).
  // Hokusai Grid also fires twice for one successful run (found, area 14,
  // CR 9.6.6), so this test would fail on that too.
  it.skip("Blood in the Water: RNG Key's number must match the grip when the accessed card is revealed, after Hokusai Grid's damage (ruling 2; filed, area 12, CR 9.1.8e: RNG Key reads the printed requirement)", () => {
    let s = runnerTurn(fresh(), 5);
    giveRunnerCards(s, 4);
    installRunner(s, "rng-key", "rng-1");
    put(s, "hokusai-grid", "hg-1", "server:rd:root");
    s.servers.rd.root.push("hg-1");
    s.cards["hg-1"]!.rezzed = true;
    s.cards["hg-1"]!.faceup = true;
    stackRd(s, [["blood-in-the-water", "bw-1"]]);
    s = must(s, { type: "basic_run", serverId: "rd" });
    s = drive(s, (x) => x.pendingChoice?.sourceId === "rng-1");
    s = pick(s, "accept");
    // 4 cards when the run is successful; 3 after Hokusai's 1 net damage.
    s = pick(s, "rng:3");
    s = drive(s, (x) => x.timingKey === "access.stealAgenda");
    if (s.pendingChoice) s = pick(s, "gain");
    expect(s.runner.hand).toHaveLength(3);
    expect(s.runner.credits).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// Hyperloop Extension
// ---------------------------------------------------------------------------

describe("Hyperloop Extension", () => {
  // Filed under area 11: Bifrost Array logs "no other scored agenda with
  // when-scored" and 24/7 News Cycle "no when-scored ability can resolve":
  // a "scored or stolen" trigger is not read as a "when scored" ability,
  // though it can meet its condition by the Corp scoring (CR 9.6.14c).
  it.skip("Hyperloop Extension: Bifrost Array can resolve its scored ability, so the Corp gains 3 credits (ruling 1; filed, area 11, CR 9.6.14c: a scored-or-stolen ability is not offered as a when-scored ability)", () => {
    let s = corpScoring(5);
    put(s, "hyperloop-extension", "hx-1", "corp:score");
    s.corp.scoreArea.push("hx-1");
    agendaReady(s, "bifrost-array", "ba-1", 3);
    s = score(s, "ba-1");
    const credits = s.corp.credits;
    s = drive(s, (x) => optionIds(x).some((id) => id.includes("hx-1")));
    s = pick(s, "hx-1");
    s = drive(s, atCorpAction);
    expect(s.corp.credits).toBe(credits + 3);
  });
});

// ---------------------------------------------------------------------------
// Longevity Serum
// ---------------------------------------------------------------------------

describe("Longevity Serum", () => {
  // Filed under area 11 (fix-now): when the scored agenda's own ability
  // opens a choice, scoreAgenda returns before it marks the other "agenda
  // scored" abilities (src/actions/score.ts, after "scoreAgenda.onScore"),
  // so Spoilers never triggers. With Archives empty, Longevity opens no
  // choice and Spoilers does trigger. Each occurrence marks an instance
  // pending (CR 9.6.6).
  it.skip("Longevity Serum: the Corp resolves it before the Runner's Spoilers, so the card Spoilers trashes cannot be shuffled back (ruling 1; filed, area 11, CR 9.6.6: Spoilers is never marked pending after Longevity's choice)", () => {
    let s = corpScoring(5);
    installRunner(s, "spoilers", "sp-1");
    stackRd(s, [["hedge-fund", "rd-top"]]);
    toArchives(s, "hedge-fund", "arc-1");
    agendaReady(s, "longevity-serum", "ls-1", 3);
    s = score(s, "ls-1");
    // Longevity Serum's choices come first: nothing from R&D is in
    // Archives to choose.
    expect(s.pendingChoice?.sourceId).toBe("ls-1");
    const archives = [...s.corp.discardPile];
    for (let i = 0; i < 6 && s.pendingChoice?.sourceId === "ls-1"; i++) {
      expect(
        optionIds(s).every((id) => !/rd-|choose-card:(?!arc)/.test(id)),
      ).toBe(true);
      s = pick(s, "done");
    }
    expect(s.corp.discardPile).toEqual(archives);
    // Then Spoilers trashes R&D's top card, and it stays in Archives.
    const top = s.corp.deck[0]!;
    s = drive(s, atCorpAction);
    expect(s.corp.discardPile).toContain(top);
    expect(s.corp.deck).not.toContain(top);
  });
});

// ---------------------------------------------------------------------------
// Midnight-3 Arcology
// ---------------------------------------------------------------------------

describe("Midnight-3 Arcology", () => {
  it("Midnight-3 Arcology: the Corp does not discard down to maximum hand size this turn (ruling 1)", () => {
    let s = corpScoring(5);
    for (let i = 1; i <= 5; i++) toHand(s, "corp", "hedge-fund", `hq-${i}`);
    agendaReady(s, "midnight-3-arcology", "m3-1", 4);
    s = score(s, "m3-1");
    // Offered with a "decline"; the printed text is not optional.
    s = pick(s, "skip-discard");
    s = drive(s, atCorpAction);
    const hq = s.corp.hand.length;
    expect(hq).toBeGreaterThan(5);
    s.config.stopAfterFirstCycle = false;
    s.corp.clicks = 1;
    s = must(s, { type: "basic_gain_credit" });
    s = drive(s, (x) => x.activeSide === "runner");
    expect(s.corp.hand).toHaveLength(hq);
  });
});

// ---------------------------------------------------------------------------
// Oaktown Renovation
// ---------------------------------------------------------------------------

describe("Oaktown Renovation", () => {
  it("Oaktown Renovation: Seamless Launch places counters without advancing it, so the Corp gains nothing (ruling 1)", () => {
    let s = corpScoring(5);
    installRoot(s, "oaktown-renovation", "oak-1", false).faceup = true;
    toHand(s, "corp", "seamless-launch", "sl-1");
    s = must(s, { type: "play_operation", cardId: "sl-1" });
    if (s.pendingChoice) s = pick(s, "oak-1");
    s = drive(s, atCorpAction);
    // Seamless Launch costs 1.
    expect(s.corp.credits).toBe(4);
    expect(s.cards["oak-1"]!.advancementCounters).toBe(2);
    // Advancing it does gain (2 for fewer than 5 counters).
    s = must(s, { type: "advance", cardId: "oak-1" });
    expect(s.corp.credits).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Regenesis
// ---------------------------------------------------------------------------

describe("Regenesis", () => {
  it("Regenesis: Seamless Launch is in Archives before the Corp can score, so Regenesis adds no agenda (ruling 1)", () => {
    let s = corpScoring(5);
    agendaReady(s, "regenesis", "rg-1", 1);
    toArchives(s, "hostile-takeover", "arc-ag");
    // Archives already held it before this turn.
    s.corp.discardPile = ["arc-ag"];
    toHand(s, "corp", "seamless-launch", "sl-1");
    s = must(s, { type: "play_operation", cardId: "sl-1" });
    if (s.pendingChoice) s = pick(s, "rg-1");
    s = drive(s, atCorpAction);
    expect(s.corp.discardPile).toContain("sl-1");
    s = score(s, "rg-1");
    s = drive(s, atCorpAction);
    expect(s.corp.scoreArea).toContain("rg-1");
    // No reveal is offered: drive stops at any open choice.
    expect(s.pendingChoice).toBeNull();
    expect(s.corp.scoreArea).not.toContain("arc-ag");
  });

  it("Regenesis: Moon Pool trashing nothing from HQ leaves Archives untouched, since Moon Pool itself is removed from the game (ruling 2)", () => {
    let s = corpScoring(5);
    agendaReady(s, "regenesis", "rg-1", 3);
    installRoot(s, "moon-pool", "mp-1");
    toArchives(s, "hostile-takeover", "arc-ag");
    toArchives(s, "hedge-fund", "arc-2");
    s.timingKey = "corp.actionPaw";
    s = must(s, paidAbility(s, "mp-1")!);
    // Trash nothing from HQ; reveal nothing from Archives.
    while (s.pendingChoice?.sourceId === "mp-1") s = pick(s, "done");
    s = drive(s, atCorpAction);
    s = score(s, "rg-1");
    s = drive(s, (x) => optionIds(x).some((id) => id.includes("arc-ag")));
    s = pick(s, "arc-ag");
    s = drive(s, atCorpAction);
    expect(s.corp.scoreArea).toEqual(
      expect.arrayContaining(["rg-1", "arc-ag"]),
    );
  });
});

// ---------------------------------------------------------------------------
// Send a Message
// ---------------------------------------------------------------------------

describe("Send a Message", () => {
  it("Send a Message: Archer is rezzed ignoring its additional cost, so no agenda is forfeited (ruling 1)", () => {
    let s = corpScoring(0);
    put(s, "hostile-takeover", "ht-1", "corp:score");
    s.corp.scoreArea.push("ht-1");
    installIce(s, "archer", "ar-1", "hq", false);
    agendaReady(s, "send-a-message", "sam-1", 5);
    s = score(s, "sam-1");
    s = drive(s, (x) => optionIds(x).some((id) => id.includes("ar-1")));
    s = pick(s, "ar-1");
    s = drive(s, atCorpAction);
    expect(s.cards["ar-1"]!.rezzed).toBe(true);
    expect(s.corp.scoreArea).toContain("ht-1");
    expect(s.corp.credits).toBe(0);
  });
});
