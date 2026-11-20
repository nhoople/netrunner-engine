/**
 * Official rulings on identities (CR audit tool 1.14, first batch).
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
  createInitialState,
  crDataPresent,
  evalEffect,
  instantiateCard,
  legalActions,
} from "../src/index.js";
import type { GameState } from "../src/index.js";
import type { Action, ServerId } from "../src/state/types.js";
import { passIdle } from "../src/demo/passIdle.js";
import { fx } from "../src/effects/ir.js";
import { trashCard } from "../src/state/procedures/trash.js";
import { checkpointAfterInstruction } from "../src/legality/checkpoints.js";
import { currentMark } from "../src/state/msKeywords.js";
import { expectStateDelta, snapshot } from "./kind-coverage.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.25");
});

// ---------------------------------------------------------------------------
// Board helpers
// ---------------------------------------------------------------------------

/** The default board with no Runner card marked rezzed (CR 8.1.4f). */
function fresh(): GameState {
  const s = createInitialState();
  for (const card of Object.values(s.cards)) {
    if (card.side === "runner") card.rezzed = false;
  }
  // Out of the grip and out of the game, so no card is left in no zone.
  for (const id of s.runner.hand) delete s.cards[id];
  s.runner.hand = [];
  s.priorityStack = [];
  return s;
}

function put(s: GameState, defId: string, id: string, zone: string) {
  const card = instantiateCard(defId, id, zone as never);
  s.cards[id] = card;
  return card;
}

/** Replace a side's identity in place, keeping its id. */
function setIdentity(s: GameState, side: "corp" | "runner", defId: string) {
  const id = side === "corp" ? s.corp.identityId : s.runner.identityId;
  return put(s, defId, id, s.cards[id]!.zone);
}

/** A Corp card alone in the root of a new remote server. */
function installRoot(s: GameState, defId: string, id: string, rezzed = true) {
  const serverId = `remote-${id}`;
  (s.servers as Record<string, unknown>)[serverId] = {
    id: serverId,
    kind: "remote",
    root: [id],
    ice: [],
  };
  const card = put(s, defId, id, `server:${serverId}:root`);
  card.rezzed = rezzed;
  card.faceup = rezzed;
  return card;
}

/** A piece of ice installed outermost on `server` (index 0 is outermost). */
function installIce(
  s: GameState,
  defId: string,
  id: string,
  server: ServerId,
  rezzed = true,
) {
  const card = put(s, defId, id, `server:${server}:ice`);
  card.rezzed = rezzed;
  card.faceup = rezzed;
  s.servers[server]!.ice.unshift(id);
  return card;
}

function installRunner(s: GameState, defId: string, id: string) {
  const card = put(s, defId, id, "runner:installed");
  s.runner.installed.push(id);
  return card;
}

function toHand(
  s: GameState,
  side: "corp" | "runner",
  defId: string,
  id: string,
) {
  put(s, defId, id, side === "corp" ? "corp:hq" : "runner:grip");
  (side === "corp" ? s.corp : s.runner).hand.push(id);
}

/** Put cards on top of R&D, first id on top. */
function stackRd(s: GameState, cards: Array<[string, string]>): void {
  for (const [defId, id] of [...cards].reverse()) {
    put(s, defId, id, "corp:rd");
    s.corp.deck.unshift(id);
  }
}

function corpTurn(s: GameState, credits = 10): GameState {
  s.activeSide = "corp";
  s.timingKey = "corp.takeAction";
  s.corp.clicks = 3;
  s.corp.credits = credits;
  return s;
}

function runnerTurn(s: GameState, credits = 10): GameState {
  s.activeSide = "runner";
  s.timingKey = "runner.takeAction";
  s.runner.clicks = 4;
  s.runner.credits = credits;
  return s;
}

function must(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) {
    throw new Error(
      `${action.type}: ${result.error} ${JSON.stringify(result.cites)}`,
    );
  }
  return passIdle(result.state);
}

function optionIds(s: GameState): string[] {
  return (s.pendingChoice?.options ?? []).map((o) => o.id);
}

const DRIVE_ORDER: Action["type"][] = [
  "continue_run",
  "access_card",
  "finish_access",
  "finish_breach",
  "pass_window",
  "discard_to_hand_size",
];

/**
 * Play the obvious step (continue, access, finish, pass) until `stop` holds
 * or a choice opens. A test driver: it reads every candidate, hidden ones too.
 */
function drive(s: GameState, stop: (s: GameState) => boolean): GameState {
  for (let i = 0; i < 200; i++) {
    if (stop(s) || s.pendingChoice || s.done) return s;
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

const atRunnerAction = (s: GameState) =>
  s.timingKey === "runner.takeAction" && !s.run;
const atCorpAction = (s: GameState) => s.timingKey === "corp.takeAction";

// ---------------------------------------------------------------------------
// Weyland Consortium: Built to Last
// ---------------------------------------------------------------------------

describe("Weyland Consortium: Built to Last", () => {
  function weyland(): GameState {
    const s = corpTurn(fresh(), 5);
    setIdentity(s, "corp", "weyland-consortium-built-to-last");
    installRoot(s, "hostile-takeover", "ht-1", false);
    return s;
  }

  it("Weyland Consortium: advancing a card with no advancement counters gains 2 credits; advancing it again gains nothing (ruling 1)", () => {
    let s = weyland();
    const before = snapshot(s);
    s = must(s, { type: "advance", cardId: "ht-1" });
    // Advancing costs 1; the identity gives 2 back (CR 1.18.1).
    expectStateDelta(before, s, {
      "corp.credits": 1,
      "cards.ht-1.advancementCounters": 1,
    });
    const again = snapshot(s);
    s = must(s, { type: "advance", cardId: "ht-1" });
    expectStateDelta(again, s, {
      "corp.credits": -1,
      "cards.ht-1.advancementCounters": 1,
    });
  });

  it("Weyland Consortium: Seamless Launch places advancement counters without advancing, so the Corp gains nothing (ruling 2)", () => {
    let s = weyland();
    toHand(s, "corp", "seamless-launch", "sl-1");
    const before = snapshot(s);
    s = must(s, { type: "play_operation", cardId: "sl-1" });
    // Seamless Launch costs 1; placing counters is not advancing (CR 1.18.2).
    expectStateDelta(before, s, {
      "corp.credits": -1,
      "cards.ht-1.advancementCounters": 2,
    });
  });

  it("Weyland Consortium: Success advances one at a time, so only the first advancement gains 2 credits (ruling 3)", () => {
    let s = weyland();
    put(s, "priority-requisition", "pr-1", "corp:score");
    s.corp.scoreArea.push("pr-1");
    toHand(s, "corp", "success", "suc-1");
    const before = snapshot(s);
    s = must(s, { type: "play_operation", cardId: "suc-1" });
    while (s.pendingChoice) {
      const ids = optionIds(s);
      const pick =
        ids.find((id) => id.includes("pr-1")) ??
        ids.find((id) => id.includes("ht-1")) ??
        ids[0]!;
      s = must(s, { type: "choose_option", optionId: pick });
    }
    // Priority Requisition's requirement is 5: five advancements, one gain.
    expectStateDelta(before, s, {
      "corp.credits": 2,
      "cards.ht-1.advancementCounters": 5,
    });
  });
});

// ---------------------------------------------------------------------------
// Jinteki: Personal Evolution
// ---------------------------------------------------------------------------

describe("Jinteki: Personal Evolution", () => {
  // Filed under area 16: the engine logs "Runner wins with 7 agenda points",
  // keeps resolving, and the pending net damage flatlines the Runner and
  // sets the winner to the Corp. The game ends at the win (CR 1.7.1).
  it.skip("Jinteki: Personal Evolution: a Runner with an empty grip who steals their seventh agenda point wins before the net damage resolves (ruling 1; filed, area 16, CR 1.7.1: the later flatline overwrites the win)", () => {
    let s = runnerTurn(fresh());
    setIdentity(s, "corp", "jinteki-personal-evolution");
    for (const id of ["pr-a", "pr-b"]) {
      put(s, "priority-requisition", id, "runner:score");
      s.runner.scoreArea.push(id);
    }
    installRoot(s, "hostile-takeover", "ht-1", false);
    s = must(s, { type: "basic_run", serverId: "remote-ht-1" as ServerId });
    s = drive(s, (x) => legalActions(x).some((a) => a.type === "steal_agenda"));
    s = must(s, { type: "steal_agenda", cardId: "ht-1" });
    // The Runner wins at the checkpoint after the steal (CR 1.7.1); the
    // pending net damage never resolves, so it is not a flatline.
    expect(s.done).toBe(true);
    expect(s.winner).toBe("runner");
  });
});

// ---------------------------------------------------------------------------
// Jinteki: Restoring Humanity
// ---------------------------------------------------------------------------

describe("Jinteki: Restoring Humanity", () => {
  it("Jinteki: Restoring Humanity: a card discarded to hand size at the end of the turn is the facedown card in Archives that gains 1 credit, since the gain comes after the hand size check (rulings 1, 2)", () => {
    let s = corpTurn(fresh(), 0);
    setIdentity(s, "corp", "jinteki-restoring-humanity");
    s.corp.discardPile = [];
    for (let i = 1; i <= 6; i++) toHand(s, "corp", "hedge-fund", `hf-${i}`);
    for (let i = 0; i < 3; i++) {
      s = drive(s, atCorpAction);
      s = must(s, { type: "basic_gain_credit" });
    }
    expect(s.corp.credits).toBe(3);
    s = drive(s, (x) =>
      legalActions(x).some((a) => a.type === "discard_to_hand_size"),
    );
    expect(s.corp.discardPile).toEqual([]);
    s = must(s, { type: "discard_to_hand_size", cardIds: ["hf-1"] });
    s = drive(s, (x) => x.activeSide === "runner");
    expect(s.corp.discardPile).toEqual(["hf-1"]);
    expect(s.cards["hf-1"]!.faceup).toBe(false);
    expect(s.corp.credits).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Captain Padma Isbister: Intrepid Explorer
// ---------------------------------------------------------------------------

describe("Captain Padma Isbister: Intrepid Explorer", () => {
  it("Captain Padma Isbister: a card with 2 power counters has at least 1, so it can be charged to 3 (ruling 1)", () => {
    let s = runnerTurn(fresh());
    setIdentity(s, "runner", "captain-padma-isbister-intrepid-explorer");
    installRunner(s, "propeller", "prop-1").powerCounters = 2;
    const before = snapshot(s);
    s = must(s, { type: "basic_run", serverId: "rd" });
    expect(optionIds(s)).toContain("charge");
    s = must(s, { type: "choose_option", optionId: "charge" });
    if (s.pendingChoice) {
      s = must(s, {
        type: "choose_option",
        optionId: optionIds(s).find((id) => id.includes("prop-1"))!,
      });
    }
    expectStateDelta(before, s, { "cards.prop-1.powerCounters": 1 });
  });
});

// ---------------------------------------------------------------------------
// Liza Talking Thunder: Prominent Legislator
// ---------------------------------------------------------------------------

describe("Liza Talking Thunder: Prominent Legislator", () => {
  it("Liza Talking Thunder: the Runner who prevents the tag still draws the 2 cards (ruling 1)", () => {
    let s = runnerTurn(fresh());
    setIdentity(s, "runner", "liza-talking-thunder-prominent-legislator");
    installRunner(s, "decoy", "decoy-1");
    for (const id of s.runner.deck) delete s.cards[id];
    s.runner.deck = [];
    for (let i = 1; i <= 3; i++) {
      put(s, "sure-gamble", `sg-${i}`, "runner:stack");
      s.runner.deck.push(`sg-${i}`);
    }
    s.servers.hq.ice = [];
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, (x) =>
      legalActions(x).some(
        (a) => a.type === "use_paid_ability" && a.cardId === "decoy-1",
      ),
    );
    const decoy = legalActions(s).find(
      (a) => a.type === "use_paid_ability" && a.cardId === "decoy-1",
    )!;
    s = must(s, decoy);
    s = drive(s, atRunnerAction);
    expect(s.runner.tags).toBe(0);
    expect(s.runner.hand).toEqual(["sg-1", "sg-2"]);
  });
});

// ---------------------------------------------------------------------------
// NBN: Reality Plus
// ---------------------------------------------------------------------------

describe("NBN: Reality Plus", () => {
  /** The Corp's turn, Public Trail in HQ, the Runner ran last turn. */
  function realityPlus(): GameState {
    const s = corpTurn(fresh(), 10);
    setIdentity(s, "corp", "nbn-reality-plus");
    s.turn.successfulRunLastTurn = true;
    s.runner.credits = 0;
    toHand(s, "corp", "public-trail", "pt-1");
    toHand(s, "corp", "public-trail", "pt-2");
    return s;
  }

  it("NBN: Reality Plus: a tag given by Public Trail is the Runner taking a tag, so the Corp gains 2 credits (ruling 1)", () => {
    let s = realityPlus();
    s = must(s, { type: "play_operation", cardId: "pt-1" });
    s = drive(s, (x) => x.runner.tags > 0 && !x.pendingTags);
    expect(s.runner.tags).toBe(1);
    expect(optionIds(s)).toEqual(["gain2", "draw2"]);
    const before = snapshot(s);
    s = must(s, { type: "choose_option", optionId: "gain2" });
    expectStateDelta(before, s, { "corp.credits": 2 });
  });

  it("NBN: Reality Plus: a prevented tag is not taken, so it does not trigger; a tag taken later that turn does (rulings 2, 3)", () => {
    let s = realityPlus();
    installRunner(s, "decoy", "decoy-1");
    s = must(s, { type: "play_operation", cardId: "pt-1" });
    expect(s.pendingTags?.remaining).toBe(1);
    // Applied directly: the legal list leaves Decoy out while the Corp
    // holds priority (the finding under "Decoy" below).
    s = must(s, {
      type: "use_paid_ability",
      cardId: "decoy-1",
      abilityId: "decoy-prevent-tag",
    });
    s = drive(s, atCorpAction);
    expect(s.runner.tags).toBe(0);
    expect(s.pendingChoice).toBeNull();

    s = must(s, { type: "play_operation", cardId: "pt-2" });
    s = drive(s, (x) => x.runner.tags > 0 && !x.pendingTags);
    expect(s.runner.tags).toBe(1);
    expect(optionIds(s)).toEqual(["gain2", "draw2"]);
  });
});

// ---------------------------------------------------------------------------
// Esâ Afontov: Eco-Insurrectionist
// ---------------------------------------------------------------------------

describe("Esâ Afontov: Eco-Insurrectionist", () => {
  /** HQ and R&D hold exactly `hq` and `rd` facedown cards. */
  function corpPiles(s: GameState, hq: number, rd: number): void {
    for (const id of [...s.corp.hand, ...s.corp.deck]) delete s.cards[id];
    s.corp.hand = [];
    s.corp.deck = [];
    for (let i = 1; i <= hq; i++) toHand(s, "corp", "hedge-fund", `hq-${i}`);
    for (let i = 1; i <= rd; i++) {
      put(s, "hedge-fund", `rd-${i}`, "corp:rd");
      s.corp.deck.push(`rd-${i}`);
    }
  }

  /** Esâ suffers 1 core damage and chooses to draw and sabotage 2. */
  function sabotage(hq: number, rd: number): GameState {
    let s = runnerTurn(fresh());
    setIdentity(s, "runner", "esa-afontov-eco-insurrectionist");
    toHand(s, "runner", "sure-gamble", "grip-1");
    toHand(s, "runner", "sure-gamble", "grip-2");
    corpPiles(s, hq, rd);
    const dealt = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      fx.coreDamage(1),
    );
    expect(dealt.ok).toBe(true);
    s = must(s, { type: "choose_option", optionId: "draw-sabotage" });
    expect(s.pendingSabotage?.amount).toBe(2);
    return s;
  }

  it("Esâ Afontov: the Corp chooses how many cards come from HQ without seeing R&D, then all are trashed at once and the R&D cards go facedown to Archives (ruling 1)", () => {
    let s = sabotage(3, 5);
    // The Corp names HQ cards only; R&D cards come from the top unseen.
    expect(Object.keys(s.pendingSabotage!)).not.toContain("rdCardIds");
    expect(s.reveals ?? []).toEqual([]);
    s = must(s, { type: "resolve_sabotage", hqCardIds: ["hq-1"] });
    expect(s.corp.hand).toEqual(["hq-2", "hq-3"]);
    expect(s.corp.deck).toHaveLength(4);
    expect(s.corp.discardPile).toEqual(
      expect.arrayContaining(["hq-1", "rd-1"]),
    );
    expect(s.cards["rd-1"]!.faceup).toBe(false);
    expect(s.reveals ?? []).toEqual([]);
  });

  it("Esâ Afontov: with 1 card in HQ, the Corp cannot trash only that card; the second comes from R&D (ruling 2)", () => {
    let s = sabotage(1, 5);
    s = must(s, { type: "resolve_sabotage", hqCardIds: ["hq-1"] });
    expect(s.corp.hand).toEqual([]);
    expect(s.corp.deck).toHaveLength(4);
    expect(s.corp.discardPile).toEqual(
      expect.arrayContaining(["hq-1", "rd-1"]),
    );
  });

  it("Esâ Afontov: with 1 card in R&D, the Corp cannot trash only that card; the second comes from HQ (ruling 3)", () => {
    const s = sabotage(3, 1);
    const short = applyAction(s, { type: "resolve_sabotage", hqCardIds: [] });
    expect(short.ok).toBe(false);
    const t = must(s, { type: "resolve_sabotage", hqCardIds: ["hq-2"] });
    expect(t.corp.hand).toEqual(["hq-1", "hq-3"]);
    expect(t.corp.deck).toEqual([]);
    expect(t.corp.discardPile).toEqual(
      expect.arrayContaining(["hq-2", "rd-1"]),
    );
  });

  it("Esâ Afontov: with 1 card in HQ and R&D together, the Corp trashes it (ruling 4)", () => {
    let s = sabotage(1, 0);
    s = must(s, { type: "resolve_sabotage", hqCardIds: ["hq-1"] });
    expect(s.corp.hand).toEqual([]);
    expect(s.corp.discardPile).toContain("hq-1");
    expect(s.pendingSabotage).toBeNull();
  });

  it("Esâ Afontov: the Corp trashes the sabotaged cards, so Demolisher gains the Runner nothing (ruling 5)", () => {
    let s = sabotage(3, 5);
    installRunner(s, "demolisher", "demo-1");
    const before = snapshot(s);
    s = must(s, { type: "resolve_sabotage", hqCardIds: ["hq-1", "hq-2"] });
    expectStateDelta(before, s, { "corp.hand.length": -2 });
    expect(s.runner.credits).toBe(before.runner.credits);
    // The Runner's own trash is still the first this turn: it gains 1.
    trashCard(s, "hq-3", { by: "runner" });
    checkpointAfterInstruction(s, "test");
    s = passIdle(s);
    expect(s.runner.credits).toBe(before.runner.credits + 1);
  });
});

// ---------------------------------------------------------------------------
// Nyusha "Sable" Sintashta: Symphonic Prodigy
// ---------------------------------------------------------------------------

describe('Nyusha "Sable" Sintashta: Symphonic Prodigy', () => {
  /** Play out the Corp's last click, through to the Runner's first action. */
  function toRunnerTurn(s: GameState): GameState {
    corpTurn(s, 5);
    s.corp.clicks = 1;
    s = must(s, { type: "basic_gain_credit" });
    s = drive(s, atRunnerAction);
    // Several turn-begin abilities: the Runner orders them (CR 9.2.8c).
    while (s.pendingChoice) {
      s = must(s, { type: "choose_option", optionId: optionIds(s)[0]! });
      s = drive(s, atRunnerAction);
    }
    return s;
  }

  function marks(s: GameState) {
    return s.lingeringEffects.filter((e) => !e.expired && e.kind === "mark");
  }

  it('Nyusha "Sable" Sintashta: a mark identified by Carpe Diem stays for the turn after the event leaves play (ruling 1)', () => {
    let s = runnerTurn(fresh());
    toHand(s, "runner", "carpe-diem", "cd-1");
    expect(currentMark(s)).toBeNull();
    s = must(s, { type: "play_event", cardId: "cd-1" });
    while (s.pendingChoice) {
      const decline = optionIds(s).find((id) => id === "decline");
      s = must(s, {
        type: "choose_option",
        optionId: decline ?? optionIds(s)[0]!,
      });
    }
    s = drive(s, atRunnerAction);
    expect(s.runner.discardPile).toContain("cd-1");
    expect(currentMark(s)).not.toBeNull();
  });

  it('Nyusha "Sable" Sintashta: installing a card that identifies a mark when the turn begins gives no mark this turn (ruling 2)', () => {
    let s = runnerTurn(fresh());
    toHand(s, "runner", "backstitching", "bs-1");
    s = must(s, {
      type: "basic_install",
      cardId: "bs-1",
      destination: { kind: "installed" },
    });
    s = drive(s, atRunnerAction);
    expect(s.runner.installed).toContain("bs-1");
    expect(currentMark(s)).toBeNull();
  });

  it('Nyusha "Sable" Sintashta: with several mark cards the first identification picks the mark for the turn and the others change nothing (ruling 3)', () => {
    let s = fresh();
    setIdentity(s, "runner", "nyusha-sable-sintashta-symphonic-prodigy");
    installRunner(s, "backstitching", "bs-1");
    installRunner(s, "info-bounty", "ib-1");
    s = toRunnerTurn(s);
    const mark = currentMark(s);
    expect(mark).not.toBeNull();
    expect(marks(s)).toHaveLength(1);
    toHand(s, "runner", "carpe-diem", "cd-1");
    s = must(s, { type: "play_event", cardId: "cd-1" });
    while (s.pendingChoice) {
      const decline = optionIds(s).find((id) => id === "decline");
      s = must(s, {
        type: "choose_option",
        optionId: decline ?? optionIds(s)[0]!,
      });
    }
    expect(currentMark(s)).toBe(mark);
    expect(marks(s)).toHaveLength(1);
  });

  it("Nyusha \"Sable\" Sintashta: the mark lasts only for the Runner's turn, so there is none on the Corp's turn (ruling 4)", () => {
    let s = fresh();
    setIdentity(s, "runner", "nyusha-sable-sintashta-symphonic-prodigy");
    s = toRunnerTurn(s);
    expect(currentMark(s)).not.toBeNull();
    s.runner.clicks = 1;
    s = must(s, { type: "basic_gain_credit" });
    s = drive(s, atCorpAction);
    expect(s.activeSide).toBe("corp");
    expect(currentMark(s)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Pravdivost Consulting: Political Solutions
// ---------------------------------------------------------------------------

describe("Pravdivost Consulting: Political Solutions", () => {
  /** A run on a remote holding `defId`, stopped at Pravdivost's choice. */
  function pravdivost(defId: string, id: string): GameState {
    let s = runnerTurn(fresh());
    setIdentity(s, "corp", "pravdivost-consulting-political-solutions");
    installRoot(s, defId, id, false);
    s = must(s, { type: "basic_run", serverId: `remote-${id}` as ServerId });
    s = drive(s, () => false);
    expect(s.pendingChoice?.chooser).toBe("corp");
    return s;
  }

  function place(s: GameState, id: string): GameState {
    s = must(s, { type: "choose_option", optionId: "place-adv" });
    // With one card the Corp can advance, it is the only target.
    if (!s.pendingChoice) return s;
    const option = optionIds(s).find((o) => o.includes(id));
    expect(option, `options: ${optionIds(s).join(", ")}`).toBeDefined();
    return must(s, { type: "choose_option", optionId: option! });
  }

  it("Pravdivost Consulting: the Corp may place the counter on the card the Runner is about to access (ruling 1)", () => {
    let s = pravdivost("hostile-takeover", "ht-1");
    s = place(s, "ht-1");
    expect(s.cards["ht-1"]!.advancementCounters).toBe(1);
    expect(s.run?.successful).toBe(true);
    s = drive(s, (x) => legalActions(x).some((a) => a.type === "steal_agenda"));
    expect(s.run?.accessingCardId).toBe("ht-1");
    expect(s.cards["ht-1"]!.advancementCounters).toBe(1);
  });

  it("Pravdivost Consulting: after the counter is placed the run is already successful, so the Runner cannot jack out (ruling 2)", () => {
    let s = pravdivost("hostile-takeover", "ht-1");
    s = place(s, "ht-1");
    for (
      ;
      !legalActions(s).some(
        (a) => a.type === "access_card" || a.type === "steal_agenda",
      );
    ) {
      expect(legalActions(s).map((a) => a.type)).not.toContain("jack_out");
      const next = legalActions(s).find(
        (a) => a.type === "pass_window" || a.type === "continue_run",
      );
      if (!next) break;
      s = must(s, next);
    }
    expect(legalActions(s).map((a) => a.type)).not.toContain("jack_out");
  });

  it("Pravdivost Consulting: the Corp cannot use NGO Front with the new counter before the Runner breaches, since no paid ability window is left (ruling 3)", () => {
    let s = pravdivost("ngo-front", "ngo-1");
    s.cards["ngo-1"]!.rezzed = true;
    s.cards["ngo-1"]!.faceup = true;
    s = place(s, "ngo-1");
    expect(s.cards["ngo-1"]!.advancementCounters).toBe(1);
    const ngo = (x: GameState) =>
      legalActions(x).some(
        (a) => a.type === "use_paid_ability" && a.cardId === "ngo-1",
      );
    for (let i = 0; i < 20 && s.run?.phase !== "breach"; i++) {
      expect(ngo(s), s.timingKey).toBe(false);
      const next = legalActions(s).find(
        (a) => a.type === "pass_window" || a.type === "continue_run",
      );
      if (!next) break;
      s = must(s, next);
    }
    expect(s.run?.phase).toBe("breach");
    expect(s.cards["ngo-1"]!.zone).toMatch(/root$/);

    // Control: with a counter already on it, the Corp can use NGO Front in
    // a run's paid ability window.
    let c = runnerTurn(fresh());
    installRoot(c, "ngo-front", "ngo-1", true).advancementCounters = 1;
    c = must(c, { type: "basic_run", serverId: "remote-ngo-1" as ServerId });
    for (let i = 0; i < 5 && !ngo(c); i++) {
      c = must(c, { type: "pass_window" });
    }
    expect(ngo(c)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Zahya Sadeghi: Versatile Smuggler
// ---------------------------------------------------------------------------

describe("Zahya Sadeghi: Versatile Smuggler", () => {
  // Filed under area 8: Otoroshi's "the Runner accesses that card" sets the
  // run's access candidates for the breach (`access_installed_card`) instead
  // of accessing the card during the encounter. When the Runner then jacks
  // out, the card is never accessed, so Zahya has nothing to count. The
  // printed text accesses at once (CR 1.2.1, 7.1.1).
  it.skip("Zahya Sadeghi: a card accessed through Otoroshi counts even when the HQ run then ends unsuccessfully (ruling 2; filed, area 8, CR 7.1.1: Otoroshi's access waits for a breach)", () => {
    let s = runnerTurn(fresh(), 0);
    setIdentity(s, "runner", "zahya-sadeghi-versatile-smuggler");
    installIce(s, "otoroshi", "oto-1", "hq");
    installRoot(s, "pad-campaign", "pad-1", false);
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, () => false);
    // The subroutine resolves unbroken: 1 counter on PAD Campaign.
    s = must(s, { type: "choose_option", optionId: "otoroshi:pad-1:1" });
    s = drive(s, (x) => legalActions(x).some((a) => a.type === "jack_out"));
    s = must(s, { type: "jack_out" });
    s = drive(
      s,
      (x) => optionIds(x).includes("zahya-gain") || atRunnerAction(x),
    );
    expect(optionIds(s)).toContain("zahya-gain");
  });
});

// ---------------------------------------------------------------------------
// Reina Roja: Freedom Fighter
// ---------------------------------------------------------------------------

describe("Reina Roja: Freedom Fighter", () => {
  /** A run on HQ, at the approach to unrezzed Tithonium. */
  function approachTithonium(corpCredits: number, reina = true): GameState {
    let s = runnerTurn(fresh());
    if (reina) setIdentity(s, "runner", "reina-roja-freedom-fighter");
    installIce(s, "tithonium", "tith-1", "hq", false);
    put(s, "hostile-takeover", "ag-1", "corp:score");
    s.corp.scoreArea.push("ag-1");
    s.corp.credits = corpCredits;
    s = must(s, { type: "basic_run", serverId: "hq" });
    return drive(s, (x) =>
      legalActions(x).some(
        (a) => a.type === "rez_ice" && a.cardId === "tith-1",
      ),
    );
  }

  /** Rez Tithonium by forfeiting the agenda in the Corp's score area. */
  function rezByForfeit(s: GameState): GameState {
    s = must(s, { type: "rez_ice", cardId: "tith-1" });
    if (optionIds(s).includes("rez-forfeit-discount")) {
      s = must(s, { type: "choose_option", optionId: "rez-forfeit-discount" });
    }
    if (s.pendingChoice) {
      s = must(s, {
        type: "choose_option",
        optionId: optionIds(s).find((id) => id.includes("ag-1"))!,
      });
    }
    return s;
  }

  // Filed under area 7: Tithonium's "forfeit an agenda instead of paying
  // its rez cost" is a discount of its printed 9 credits off the rez cost
  // (`rezCostCreditDiscountOnForfeitAgenda`), so Reina's +1 is still owed
  // and a Corp with 0 credits cannot rez it. Forfeiting replaces the whole
  // rez cost, increases included (CR 1.2.1, 1.16.2).
  it.skip("Reina Roja: rezzing the first ice of the turn by forfeiting an agenda for Tithonium costs no extra credit, since the increase is to the rez cost and not an additional cost (ruling 1; filed, area 7, CR 1.16.2: the forfeit is a discount, so Reina's +1 is owed)", () => {
    // Without Reina, a Corp with 0 credits rezzes Tithonium by forfeiting.
    const c = rezByForfeit(approachTithonium(0, false));
    expect(c.cards["tith-1"]!.rezzed).toBe(true);
    expect(c.corp.scoreArea).not.toContain("ag-1");

    const s = rezByForfeit(approachTithonium(0));
    expect(s.cards["tith-1"]!.rezzed).toBe(true);
    expect(s.corp.credits).toBe(0);
    expect(s.corp.scoreArea).not.toContain("ag-1");
  });
});

// ---------------------------------------------------------------------------
// Quetzal: Free Spirit
// ---------------------------------------------------------------------------

describe("Quetzal: Free Spirit", () => {
  it("Quetzal: Free Spirit: the break is a paid ability, used in the encounter's paid ability window for 0 credits, once per turn (ruling 1)", () => {
    let s = runnerTurn(fresh(), 0);
    setIdentity(s, "runner", "quetzal-free-spirit");
    installIce(s, "ice-wall", "iw-inner", "hq");
    installIce(s, "ice-wall", "iw-outer", "hq");
    const quetzal = (x: GameState) =>
      legalActions(x).find(
        (a) => "abilityId" in a && a.abilityId === "quetzal-break",
      );
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, (x) => x.run?.encounter?.iceId === "iw-outer" && !!quetzal(x));
    expect(s.timingKey).toMatch(/encounter/);
    s = must(s, quetzal(s)!);
    expect(s.runner.credits).toBe(0);
    // The broken "End the run." does not resolve: the run reaches the
    // inner barrier.
    s = drive(s, (x) => x.run?.encounter?.iceId === "iw-inner");
    expect(s.run?.endedTheRun).toBe(false);
    // Once per turn: not offered against the second barrier.
    for (let i = 0; i < 4 && s.run?.encounter?.iceId === "iw-inner"; i++) {
      expect(quetzal(s)).toBeUndefined();
      const pass = legalActions(s).find((a) => a.type === "pass_window");
      if (!pass) break;
      s = must(s, pass);
    }
  });
});

// ---------------------------------------------------------------------------
// Ayla "Bios" Rahim: Simulant Specialist
// ---------------------------------------------------------------------------

describe('Ayla "Bios" Rahim: Simulant Specialist', () => {
  // Filed under area 16: the engine sets aside the top 6 cards of the stack
  // in "opening.beforeFirstTurn", after both starting hands and mulligans,
  // and never shuffles 2 of them back. Ayla's text sets aside 6 before the
  // starting hand is drawn and shuffles 2 back (CR 1.6.1a, 1.6.6).
  it.skip('Ayla "Bios" Rahim: the cards are set aside before the starting hand is drawn, so a mulligan leaves them alone (ruling 1; filed, area 16, CR 1.6.1a: set aside after the mulligans, and 2 are never shuffled back)', () => {
    // At the opening, before the Corp's mulligan.
    let s = createInitialState();
    for (const card of Object.values(s.cards)) {
      if (card.side === "runner") card.rezzed = false;
    }
    setIdentity(s, "runner", "ayla-bios-rahim-simulant-specialist");
    for (let i = 1; i <= 12; i++) {
      put(s, "sure-gamble", `st-${i}`, "runner:stack");
      s.runner.deck.push(`st-${i}`);
    }
    s = must(s, { type: "keep_starting_hand" });
    expect(s.timingKey).toBe("opening.runnerMulligan");
    // At the Runner's mulligan, 4 cards are already set aside.
    expect(s.runner.setAside ?? []).toHaveLength(4);
    const aside = [...(s.runner.setAside ?? [])];
    s = must(s, { type: "mulligan" });
    expect(s.runner.setAside).toEqual(aside);
  });

  it('Ayla "Bios" Rahim: set-aside cards are not installed, so Endless Hunger cannot trash them (ruling 2)', () => {
    const s = runnerTurn(fresh());
    setIdentity(s, "runner", "ayla-bios-rahim-simulant-specialist");
    for (const id of ["sa-1", "sa-2"]) {
      put(s, "sure-gamble", id, "runner:set-aside");
    }
    s.runner.setAside = ["sa-1", "sa-2"];
    installRunner(s, "endless-hunger", "eh-1");
    installRunner(s, "daily-casts", "dc-1");
    const r = evalEffect(
      { state: s, sourceId: "eh-1" },
      fx.do({ kind: "break_etr_subroutine_trash_installed" }),
    );
    expect(r.ok).toBe(true);
    expect(optionIds(s)).toEqual(["eh:dc-1"]);
  });
});

// ---------------------------------------------------------------------------
// René "Loup" Arcemont: Party Animal
// ---------------------------------------------------------------------------

describe('René "Loup" Arcemont: Party Animal', () => {
  // Already filed under area 8 (sweep S1a, engine #943): the gain and draw
  // sit inline in the pay-trash-cost access path only, so Carnivore's trash
  // never triggers them. The ruling adds the order: Carnivore's cost and
  // trash resolve in full before Loup's ability resolves (CR 9.3.2b).
  it.skip("René \"Loup\" Arcemont: the Runner trashes the 2 grip cards for Carnivore before Loup's draw, then gains 1 credit and draws 1 (ruling 1; filed, area 8, CR 9.3.2b: Carnivore's trash never triggers Loup)", () => {
    let s = runnerTurn(fresh(), 0);
    setIdentity(s, "runner", "rene-loup-arcemont-party-animal");
    installRunner(s, "carnivore", "carn-1");
    toHand(s, "runner", "sure-gamble", "g-1");
    toHand(s, "runner", "diesel", "g-2");
    for (const id of s.runner.deck) delete s.cards[id];
    s.runner.deck = [];
    put(s, "corroder", "top-1", "runner:stack");
    s.runner.deck.push("top-1");
    for (const id of s.corp.hand) delete s.cards[id];
    s.corp.hand = [];
    toHand(s, "corp", "pad-campaign", "pad-1");
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, (x) =>
      legalActions(x).some((a) => a.type === "access_trash_from_grip"),
    );
    s = must(s, { type: "access_trash_from_grip" });
    for (const id of ["g-1", "g-2"]) {
      if (optionIds(s).includes(`cost-card:${id}`)) {
        s = must(s, { type: "choose_option", optionId: `cost-card:${id}` });
      }
    }
    s = drive(s, atRunnerAction);
    expect(s.corp.discardPile).toContain("pad-1");
    expect(s.runner.discardPile).toEqual(
      expect.arrayContaining(["g-1", "g-2"]),
    );
    // Loup draws the stack's top card into an empty grip.
    expect(s.runner.hand).toEqual(["top-1"]);
    expect(s.runner.credits).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Ob Superheavy Logistics: Extract. Export. Excel.
// ---------------------------------------------------------------------------

describe("Ob Superheavy Logistics: Extract. Export. Excel.", () => {
  /** The Corp's turn with Ob Superheavy and a rezzed `defId` in a remote. */
  function ob(defId: string, credits = 0): GameState {
    const s = corpTurn(fresh(), credits);
    setIdentity(s, "corp", "ob-superheavy-logistics-extract-export-excel");
    installRoot(s, defId, "trashed-1", true);
    return s;
  }

  /** The Corp trashes `id`, and the checkpoint after it runs. */
  function corpTrashes(s: GameState, id: string): GameState {
    trashCard(s, id, { by: "corp" });
    checkpointAfterInstruction(s, "test");
    return passIdle(s);
  }

  it("Ob Superheavy Logistics: trashing a card with rez cost 0 finds nothing, still shuffles R&D, and uses the ability for the turn (ruling 2)", () => {
    let s = ob("sandburg");
    stackRd(s, [["ice-wall", "iw-1"]]);
    const logStart = s.log.length;
    s = corpTrashes(s, "trashed-1");
    expect(optionIds(s).filter((id) => id.startsWith("choose-card:"))).toEqual(
      [],
    );
    while (s.pendingChoice) {
      s = must(s, { type: "choose_option", optionId: optionIds(s).at(-1)! });
    }
    expect(s.log.slice(logStart).join("\n")).toMatch(/shuffl/i);
    expect(s.turn.obSuperheavyUsedThisTurn).toBe(true);
    expect(s.corp.deck).toContain("iw-1");
  });

  it("Ob Superheavy Logistics: the found ice is installed ignoring its install cost (ruling 6)", () => {
    let s = ob("pad-campaign");
    installIce(s, "ice-wall", "iw-hq", "hq");
    stackRd(s, [["ice-wall", "iw-1"]]);
    s = corpTrashes(s, "trashed-1");
    s = must(s, { type: "choose_option", optionId: "choose-card:iw-1" });
    // Behind 1 piece of ice on HQ, the install cost would be 1 credit.
    s = must(s, {
      type: "choose_option",
      optionId: optionIds(s).find((id) => id.includes("hq"))!,
    });
    expect(s.servers.hq.ice).toContain("iw-1");
    expect(s.cards["iw-1"]!.rezzed).toBe(true);
    expect(s.corp.credits).toBe(0);
  });

  it("Ob Superheavy Logistics: an agenda has no rez cost, so the search never finds one (ruling 9)", () => {
    let s = ob("pad-campaign");
    stackRd(s, [
      ["hostile-takeover", "ht-1"],
      ["ice-wall", "iw-1"],
    ]);
    s = corpTrashes(s, "trashed-1");
    const found = optionIds(s).filter((id) => id.startsWith("choose-card:"));
    expect(found).toContain("choose-card:iw-1");
    expect(found).not.toContain("choose-card:ht-1");
  });

  it("Ob Superheavy Logistics: a unique card trashed by the uniqueness rule is trashed by the game, not the Corp, so the ability does not trigger (ruling 10)", () => {
    let s = ob("the-twins");
    installRoot(s, "the-twins", "twins-2", true);
    stackRd(s, [["ice-wall", "iw-1"]]);
    checkpointAfterInstruction(s, "test");
    s = passIdle(s);
    const trashed = ["trashed-1", "twins-2"].filter((id) =>
      s.corp.discardPile.includes(id),
    );
    expect(trashed).toHaveLength(1);
    expect(s.pendingChoice).toBeNull();
    expect(s.turn.obSuperheavyUsedThisTurn ?? false).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Found while testing the rulings above (not a ruling)
// ---------------------------------------------------------------------------

describe("Carnivore", () => {
  // Filed, fix-now: the access-trash candidate is offered only when the
  // attacked server is HQ or R&D (candidatePending.ts), but Carnivore's
  // printed ability has no server restriction (CR 1.2.1, 7.1.4).
  it.skip("the Runner may use Carnivore on a card accessed in a remote server (CR 1.2.1, 7.1.4)", () => {
    let s = runnerTurn(fresh(), 0);
    installRunner(s, "carnivore", "carn-1");
    toHand(s, "runner", "sure-gamble", "g-1");
    toHand(s, "runner", "diesel", "g-2");
    installRoot(s, "pad-campaign", "pad-1", false);
    s = must(s, { type: "basic_run", serverId: "remote-pad-1" as ServerId });
    s = drive(s, (x) => x.run?.accessingCardId === "pad-1");
    expect(legalActions(s)).toContainEqual({ type: "access_trash_from_grip" });
  });
});

describe("Decoy", () => {
  // Filed, fix-now: queryLegality refuses the Runner's tag interrupt with
  // "The other player has priority" while the Corp holds priority in its
  // paid ability window, though applyAction accepts it. The game host only
  // accepts listed actions, so the Runner cannot prevent a tag given on the
  // Corp's turn. Interrupt windows give both players priority (CR 9.2.9c).
  it.skip("the Runner is offered Decoy against a tag the Corp gives on its own turn (CR 9.2.9c, 9.2.9d)", () => {
    let s = corpTurn(fresh(), 5);
    s.turn.successfulRunLastTurn = true;
    s.runner.credits = 0;
    toHand(s, "corp", "public-trail", "pt-1");
    installRunner(s, "decoy", "decoy-1");
    s = must(s, { type: "play_operation", cardId: "pt-1" });
    expect(s.pendingTags?.remaining).toBe(1);
    expect(legalActions(s)).toContainEqual({
      type: "use_paid_ability",
      cardId: "decoy-1",
      abilityId: "decoy-prevent-tag",
    });
  });
});
