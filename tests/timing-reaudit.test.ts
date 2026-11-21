/**
 * RA-1 timing re-audit (CR audit program, "Re-audit of the earlier
 * programs"). The fidelity program built ability records (9.3), trigger
 * predicates and the 10.3.1a mark, interrupts and 9.9.9 replacement, and the
 * checkpoints of 9.11 and 10.3 before the CR-first loop existed. Each test
 * here checks one of those paths against the rule it cites.
 *
 * A path the CR settles that the engine plays wrong is written as
 * `it.fails`, titled "RF:". It stays green while the engine is wrong and
 * turns red once the RF session fixes it, which then changes it to `it`.
 * The PR that added this file lists each one with its CR rule.
 *
 * Paths that already had a test citing the rule are not repeated here; the
 * PR's path table names the test that covers each.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  allocateEffectIdentity,
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  CR,
  createInitialState,
  crDataPresent,
  evalEffect,
  fx,
  instantiateCard,
  legalActions,
  tryApplyReplacement,
} from "../src/index.js";
import { passIdle } from "../src/demo/passIdle.js";
import { occurCheckpoint } from "../src/legality/checkpoints.js";
import { effectiveIceStrength } from "../src/cards/stubs.js";
import { trashCard } from "../src/state/procedures/trash.js";
import type { Action, GameState } from "../src/state/types.js";
import { expectStateDelta, snapshot } from "./kind-coverage.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.25");
});

/** The test board, with no Runner card marked rezzed (CR 8.1.4f). */
function base(): GameState {
  const s = createInitialState();
  for (const card of Object.values(s.cards)) {
    if (card.side === "runner") card.rezzed = false;
  }
  return s;
}

function must(state: GameState, action: Action): GameState {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return passIdle(r.state);
}

function at(lines: string[], fragment: string): number {
  const i = lines.findIndex((line) => line.includes(fragment));
  expect(i, fragment).toBeGreaterThanOrEqual(0);
  return i;
}

/** The Runner's turn with Professional Contacts installed and a card on top of the stack. */
function contactsBoard(): GameState {
  const s = base();
  s.cards["pc-1"] = instantiateCard(
    "professional-contacts",
    "pc-1",
    "runner:installed",
  );
  s.runner.installed = ["pc-1"];
  s.cards["top-1"] = instantiateCard("sure-gamble", "top-1", "runner:stack");
  s.runner.deck.unshift("top-1");
  s.runner.clicks = 2;
  s.runner.credits = 0;
  s.activeSide = "runner";
  s.timingKey = "runner.takeAction";
  return s;
}

const useContacts: Action = {
  type: "use_paid_ability",
  cardId: "pc-1",
  abilityId: "pro-contacts",
};

/**
 * Hostile Infrastructure, Experiential Data and Strongbox in a remote root
 * the Runner has breached, with Singularity resolving and 3 cards in grip.
 */
function singularityBoard(): GameState {
  const s = base();
  const hi = instantiateCard(
    "hostile-infrastructure",
    "hi-1",
    "server:remote-1:root",
  );
  hi.rezzed = true;
  hi.faceup = true;
  const data = instantiateCard(
    "experiential-data",
    "ed-1",
    "server:remote-1:root",
  );
  const box = instantiateCard("strongbox", "sb-1", "server:remote-1:root");
  const sing = instantiateCard("singularity", "sing-1", "runner:play-area");
  for (const card of [hi, data, box, sing]) s.cards[card.id] = card;
  s.runner.playArea.push("sing-1");
  for (let i = 0; i < 3; i++) {
    const id = `grip-${i}`;
    s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    s.runner.hand.push(id);
  }
  s.servers["remote-1"] = {
    id: "remote-1",
    kind: "remote",
    ice: [],
    root: ["hi-1", "ed-1", "sb-1"],
  };
  s.run = {
    attackedServerId: "remote-1",
    phase: "success",
    position: null,
    successful: true,
    accessedCardIds: [],
    accessCandidates: [],
    randomAccessLimit: null,
    encounter: null,
    endedTheRun: false,
    cannotJackOut: false,
    accessingCardId: null,
  };
  s.activeSide = "runner";
  return s;
}

/**
 * The Runner encounters rezzed Hortum protecting HQ after Chum's subroutine
 * resolved earlier in the run: Chum's +2 strength and its "when that
 * encounter ends" ability apply to this encounter. The Runner has broken
 * Hortum's "End the run" subroutine and not its "Gain 1" one.
 */
function chumEncounterBoard(): GameState {
  const s = base();
  s.activeSide = "runner";
  s.runner.clicks = 3;
  s.runner.credits = 10;
  s.priorityStack = [];
  const hortum = instantiateCard("hortum", "ice-1", "server:hq:ice");
  hortum.rezzed = true;
  hortum.faceup = true;
  s.cards["ice-1"] = hortum;
  s.servers.hq.ice = ["ice-1"];
  const chum = instantiateCard("chum", "chum-1", "server:rd:ice");
  chum.rezzed = true;
  chum.faceup = true;
  s.cards["chum-1"] = chum;
  s.servers.rd.ice = ["chum-1"];
  for (let i = 0; i < 4; i++) {
    const id = `g-${i}`;
    s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    s.runner.hand.push(id);
  }
  s.run = {
    attackedServerId: "hq",
    phase: "encounter",
    position: 0,
    successful: null,
    accessedCardIds: [],
    accessCandidates: [],
    randomAccessLimit: null,
    encounter: { iceId: "ice-1", broken: [false, true] },
    endedTheRun: false,
    cannotJackOut: false,
    accessingCardId: null,
    chumActiveEncounter: {
      iceId: "ice-1",
      netDamageIfNotFullyBroken: 3,
      chumSourceId: "chum-1",
    },
  };
  s.timingKey = "run.encounterPaw";
  return s;
}

/** Pass every window until the run is over (at most `limit` actions). */
function passUntilRunEnds(s: GameState, limit = 14): GameState {
  for (let i = 0; i < limit && s.run; i++) {
    const acts = legalActions(s);
    const next =
      acts.find((a) => a.type === "pass_window") ??
      acts.find((a) => a.type === "accept_damage");
    if (!next) break;
    s = must(s, next);
  }
  return s;
}

describe("ability records (CR 9.3.7)", () => {
  it("resolves Professional Contacts' paid ability from its record: one click, then 1 credit and 1 card (CR 9.3.7b)", () => {
    const s = contactsBoard();
    const before = snapshot(s);
    const after = must(s, useContacts);
    expectStateDelta(before, after, {
      "runner.clicks": -1,
      "runner.credits": 1,
      "runner.hand.length": 1,
    });
    expect(after.runner.hand).toContain("top-1");
  });
});

describe("instruction boundaries (CR 9.1.2, 9.11.3)", () => {
  // Professional Contacts prints one sentence: "Gain 1[credit] and draw 1
  // card." The engine reads `oneInstruction` on a seq since RF-1 (CR 9.11.3);
  // the card's JSON gains the marker in paired cut A, which turns this green.
  it.fails(
    "RF: resolves Professional Contacts' one sentence as one instruction, with no checkpoint between the gain and the draw (CR 9.11.3)",
    () => {
      const s = contactsBoard();
      const from = s.log.length;
      const after = must(s, useContacts);
      const lines = after.log.slice(from);
      const gain = at(lines, "runner gains 1¢");
      const draw = at(lines, "Set aside 1");
      const between = lines
        .slice(gain, draw)
        .filter((line) => line.startsWith("Checkpoint open [instruction]"));
      expect(between).toEqual([]);
    },
  );
});

describe("cost checkpoints (CR 10.3.4, 9.11.1a, 8.5.16d)", () => {
  // Fixed in RF-1: the basic install action runs a cost checkpoint after the
  // click and another after the install cost (payInstallCost).
  it("runs a checkpoint right after the Runner pays Corroder's install cost, before Corroder is installed (CR 8.5.16d, 10.3.4)", () => {
    const s = base();
    s.cards["cor-1"] = instantiateCard("corroder", "cor-1", "runner:grip");
    s.runner.hand.push("cor-1");
    s.runner.credits = 5;
    s.runner.clicks = 3;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    const from = s.log.length;
    const after = must(s, {
      type: "basic_install",
      cardId: "cor-1",
      destination: { kind: "installed" },
    });
    expect(after.runner.credits).toBe(3);
    const lines = after.log.slice(from);
    const installed = at(lines, "Runner installs Corroder");
    // One cost checkpoint after the click (CR 10.3.4) and one after the
    // install cost (CR 8.5.16d), both before Corroder is installed.
    const costs = lines
      .slice(0, installed)
      .filter((line) => line.startsWith("Checkpoint open [cost]"));
    expect(costs).toHaveLength(2);
  });
});

describe("pending instances and their reaction window (CR 9.6.2, 9.6.4b, 9.2.8)", () => {
  it("does 3 net damage, one for each card Singularity trashes beside Hostile Infrastructure (CR 9.6.4b)", () => {
    let s = singularityBoard();
    const opened = evalEffect(
      { state: s, sourceId: "sing-1" },
      fx.do({ kind: "breach_instead_singularity_trash_root" }),
    );
    expect(opened.ok).toBe(true);
    const before = snapshot(s);
    s = must(s, { type: "choose_option", optionId: "singularity" });
    expectStateDelta(before, s, { "runner.hand.length": -3 });
    expect(s.pendingAbilities).toEqual([]);
  });

  // Fixed in RF-1: trash_attacked_server_root notes Hostile
  // Infrastructure's instances for the checkpoint after the instruction, and
  // the window's leftovers resume after the first damage interrupt.
  it("still does all 3 of Hostile Infrastructure's net damage after Singularity when the Runner could prevent the first (CR 9.6.2, 9.2.8e)", () => {
    let s = singularityBoard();
    s.cards["ff-1"] = instantiateCard(
      "feedback-filter",
      "ff-1",
      "runner:installed",
    );
    s.runner.installed = ["ff-1"];
    s.runner.credits = 10;
    const opened = evalEffect(
      { state: s, sourceId: "sing-1" },
      fx.do({ kind: "breach_instead_singularity_trash_root" }),
    );
    expect(opened.ok).toBe(true);
    const before = snapshot(s);
    s = must(s, { type: "choose_option", optionId: "singularity" });
    for (let i = 0; i < 6 && s.pendingDamage; i++) {
      s = must(s, { type: "accept_damage" });
    }
    expectStateDelta(before, s, { "runner.hand.length": -3 });
    expect(s.pendingAbilities.filter((p) => p.status === "pending")).toEqual(
      [],
    );
  });
});

describe("delayed conditional abilities (CR 9.6.13)", () => {
  // Fixed in RF-2: a resolved subroutine is no longer read as broken by the
  // Runner (`encounterFullyBrokenByRunner`), and Chum's damage resolves when
  // the encounter ends, not at the end of the run.
  it("Chum does 3 net damage when the encounter it boosted ends with a subroutine unbroken, before the Runner approaches the server (CR 9.6.13c, 1.2.1)", () => {
    let s = chumEncounterBoard();
    const hand = s.runner.hand.length;
    const from = s.log.length;
    s = passUntilRunEnds(s);
    expect(s.runner.hand.length).toBe(hand - 3);
    const lines = s.log.slice(from);
    expect(at(lines, "net damage 3")).toBeLessThan(
      at(lines, "Approach server"),
    );
  });

  it("Chum does its 3 net damage in the Run Ends Phase when an unbroken subroutine ends the run during the encounter it boosted (CR 6.1.4, 6.8.5.ex1, 9.6.13c)", () => {
    let s = chumEncounterBoard();
    // Ice Wall's only subroutine ends the run; the Runner breaks nothing.
    const wall = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    wall.rezzed = true;
    wall.faceup = true;
    s.cards["ice-1"] = wall;
    s.run!.encounter = { iceId: "ice-1", broken: [false] };
    const hand = s.runner.hand.length;
    const from = s.log.length;
    s = passUntilRunEnds(s);
    expect(s.run).toBeNull();
    expect(s.runner.hand.length).toBe(hand - 3);
    const lines = s.log.slice(from);
    expect(at(lines, "net damage 3")).toBeGreaterThan(at(lines, "End the run"));
  });

  it("Chum does no damage when the Runner breaks every subroutine of the encounter it boosted (CR 1.2.1)", () => {
    let s = chumEncounterBoard();
    s.run!.encounter = { iceId: "ice-1", broken: [true, true] };
    s.run!.encounter.fullyBrokenByRunner = true;
    const hand = s.runner.hand.length;
    s = passUntilRunEnds(s);
    expect(s.runner.hand.length).toBe(hand);
  });
});

describe("replacement effects (CR 9.9.9c)", () => {
  it("applies a replacement once to one effect, and again to the next effect (CR 9.9.9c)", () => {
    const s = base();
    const first = allocateEffectIdentity(s, "damage");
    const second = allocateEffectIdentity(s, "damage");
    expect(second).not.toBe(first);
    expect(tryApplyReplacement(s, first, "tori-hanzo:1")).toBe(true);
    expect(tryApplyReplacement(s, first, "tori-hanzo:1")).toBe(false);
    expect(tryApplyReplacement(s, first, "other:1")).toBe(true);
    expect(tryApplyReplacement(s, second, "tori-hanzo:1")).toBe(true);
    expect(s.turn.appliedReplacements).toEqual({
      [first]: ["tori-hanzo:1", "other:1"],
      [second]: ["tori-hanzo:1"],
    });
  });
});

describe("conditional abilities with a static condition (CR 9.6.7)", () => {
  // Fixed in RF-1: Parasite's static condition is checked at 10.3.1a of
  // every checkpoint (corpTrash.ts markStaticHostTrashConditions).
  it("trashes Wraparound at the next checkpoint once a fracter is installed and Parasite is hosted on it at 0 strength (CR 9.6.7a, 9.6.7b)", () => {
    const s = base();
    const wrap = instantiateCard("wraparound", "wrap-1", "server:hq:ice");
    wrap.rezzed = true;
    wrap.faceup = true;
    wrap.hostedCardIds = ["par-1"];
    s.cards["wrap-1"] = wrap;
    s.servers.hq.ice = ["wrap-1"];
    s.cards["cor-1"] = instantiateCard("corroder", "cor-1", "runner:installed");
    const parasite = instantiateCard("parasite", "par-1", "runner:installed");
    parasite.hostId = "wrap-1";
    s.cards["par-1"] = parasite;
    s.runner.installed = ["cor-1", "par-1"];
    expect(effectiveIceStrength(s, "wrap-1")).toBe(0);
    occurCheckpoint(
      s,
      "instruction",
      "Parasite installed",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(s.cards["wrap-1"]?.zone).toBe("corp:archives");
  });
});

describe("replacement order (CR 9.9.11a)", () => {
  // Security Testing (or Patron) already replaced the breach, so there is
  // nothing left for Diversion of Funds to replace. Fixed in RF-1: every
  // "instead of breaching" kind checks breachAlreadyReplaced.
  it("offers no Diversion of Funds replacement once Security Testing has already replaced the breach of HQ (CR 9.9.11a)", () => {
    const s = base();
    s.cards["dof-1"] = instantiateCard(
      "diversion-of-funds",
      "dof-1",
      "runner:play-area",
    );
    s.runner.playArea.push("dof-1");
    s.corp.credits = 8;
    s.run = {
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
      accessingCardId: null,
      skipBreach: true,
    };
    const r = evalEffect(
      { state: s, sourceId: "dof-1" },
      fx.do({ kind: "may_breach_instead_diversion_funds_ka" }),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice).toBeNull();
    expect(s.corp.credits).toBe(8);
  });
});

describe("conditional ability classes (CR 9.6.14)", () => {
  // Fixed in RF-1: the when-scored ability includes the field
  // badPublicityOnScore (state/whenScored.ts), whoever resolves it.
  it("24/7 News Cycle resolving Hostile Takeover's when-scored ability gives 7 credits and 1 bad publicity (CR 9.6.14c, 9.6.14d)", () => {
    let s = base();
    s.cards["news-1"] = instantiateCard(
      "24-7-news-cycle",
      "news-1",
      "corp:play-area",
    );
    s.corp.playArea.push("news-1");
    const ht = instantiateCard("hostile-takeover", "ht-1", "corp:score");
    ht.faceup = true;
    s.cards["ht-1"] = ht;
    s.corp.scoreArea = ["ht-1"];
    s.corp.credits = 2;
    const r = evalEffect(
      { state: s, sourceId: "news-1" },
      fx.do({ kind: "resolve_when_scored_on_scored_agenda" }),
    );
    expect(r.ok).toBe(true);
    const before = snapshot(s);
    s = must(s, { type: "choose_option", optionId: "247:ht-1" });
    expect(s.corp.credits - before.corp.credits).toBe(7);
    expect((s.corp.badPublicity ?? 0) - (before.corp.badPublicity ?? 0)).toBe(
      1,
    );
  });
});

describe("trigger conditions of trash abilities (CR 9.1.7, 9.1.8g, 9.6.5c)", () => {
  /** Hostile Infrastructure alone in a remote root, rezzed or not. */
  function hostileBoard(rezzed: boolean): GameState {
    const s = base();
    const hi = instantiateCard(
      "hostile-infrastructure",
      "hi-1",
      "server:remote-1:root",
    );
    hi.rezzed = rezzed;
    hi.faceup = rezzed;
    s.cards["hi-1"] = hi;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["hi-1"],
    };
    return s;
  }

  function trashThenCheckpoint(s: GameState, by: "corp" | "runner"): void {
    trashCard(s, "hi-1", { by });
    occurCheckpoint(
      s,
      "instruction",
      "Hostile Infrastructure trashed",
      [CR.checkpointConditionalAbilities],
      "test",
    );
  }

  // Fixed in RF-1: a Corp "trash" trigger is met only when the Runner trashes
  // the card while it is rezzed (corpTrash.ts).
  it("does no net damage when the Runner trashes an unrezzed Hostile Infrastructure, whose ability is not active (CR 9.1.7, 9.1.8g)", () => {
    const s = hostileBoard(false);
    const hand = s.runner.hand.length;
    trashThenCheckpoint(s, "runner");
    expect(s.cards["hi-1"]?.zone).toBe("corp:archives");
    expect(s.runner.hand).toHaveLength(hand);
  });

  it("does no net damage when the Corp trashes its own rezzed Hostile Infrastructure (CR 9.6.5c)", () => {
    const s = hostileBoard(true);
    const hand = s.runner.hand.length;
    trashThenCheckpoint(s, "corp");
    expect(s.cards["hi-1"]?.zone).toBe("corp:archives");
    expect(s.runner.hand).toHaveLength(hand);
  });

  it("does 1 net damage when the Runner trashes a rezzed Hostile Infrastructure (CR 9.1.8g)", () => {
    const s = hostileBoard(true);
    const before = snapshot(s);
    trashThenCheckpoint(s, "runner");
    expectStateDelta(before, s, { "runner.hand.length": -1 });
  });
});

describe("a cost paid with the last credits (CR 1.16.3, 8.5.16d)", () => {
  // Fixed in RF-1: the install spend goes through the credit pool and runs
  // the cost checkpoint (costs.ts payInstallCost), as playing an event does.
  it("Order of Sol gains 1 credit when the Runner spends their last 5 credits installing Professional Contacts (CR 8.5.16d, 10.3.4)", () => {
    let s = base();
    const idId = s.runner.identityId;
    s.cards[idId] = instantiateCard("order-of-sol", idId, s.cards[idId]!.zone);
    s.cards["pc-1"] = instantiateCard(
      "professional-contacts",
      "pc-1",
      "runner:grip",
    );
    s.runner.hand.push("pc-1");
    s.runner.credits = 5;
    s.runner.clicks = 3;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s = must(s, {
      type: "basic_install",
      cardId: "pc-1",
      destination: { kind: "installed" },
    });
    expect(s.cards["pc-1"]?.zone).toBe("runner:installed");
    expect(s.runner.credits).toBe(1);
  });
});
