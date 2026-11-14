/**
 * Who carries out a trash, and what the Corp is asked.
 *
 * CR 1.14.5: the controller of an ability carries out its effects, unless
 * the text names the other player.
 * CR 1.14.5a: a condition that cares who trashed a card is met only when
 * that player carried out the trash. Whose turn it is does not matter.
 * CR 1.16.11b, CR 1.16.1d: an "unless" is a cost its payer may decline, and
 * a cost of 0 can still be paid.
 * CR 8.6.3: cards an effect plays are chosen and played one at a time.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  createInitialState,
  evalEffect,
  getPublicView,
  instantiateCard,
  seedRng,
} from "../src/index.js";
import type { Action, Effect, GameState } from "../src/index.js";
import { notePowerCounters } from "../src/state/cardDeclarations.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.23");
});

function put(s: GameState, defId: string, id: string, zone: string) {
  const card = instantiateCard(defId, id, zone);
  s.cards[id] = card;
  return card;
}

/**
 * Hostile Infrastructure rezzed in remote 1, Ice Wall rezzed on HQ, a
 * Corp source in remote 2, a Runner source installed, and 3 cards in grip.
 */
function board(activeSide: "corp" | "runner"): GameState {
  const s = createInitialState();
  s.activeSide = activeSide;
  s.timingKey = activeSide === "corp" ? "corp.takeAction" : "runner.takeAction";
  s.priorityStack = [];
  s.corp.hand = [];
  s.runner.hand = [];
  const rezzed = (defId: string, id: string, zone: string) => {
    const card = put(s, defId, id, zone);
    card.rezzed = true;
    card.faceup = true;
    s.corp.installed.push(id);
    return card;
  };
  rezzed("hostile-infrastructure", "hostile-1", "server:remote-1:root");
  s.servers["remote-1"] = { id: "remote-1", kind: "remote", ice: [], root: ["hostile-1"] };
  rezzed("melange-mining-corp", "src-c", "server:remote-2:root");
  s.servers["remote-2"] = { id: "remote-2", kind: "remote", ice: [], root: ["src-c"] };
  s.nextRemoteNumber = 3;
  rezzed("ice-wall", "wall-1", "server:hq:ice");
  s.servers.hq.ice = ["wall-1"];
  put(s, "kati-jones", "src-r", "runner:installed").faceup = true;
  s.runner.installed.push("src-r");
  for (const id of ["grip-1", "grip-2", "grip-3"]) {
    put(s, "sure-gamble", id, "runner:grip");
    s.runner.hand.push(id);
  }
  return s;
}

function run(s: GameState, sourceId: string, effect: Effect): void {
  const result = evalEffect({ state: s, sourceId }, effect);
  if (!result.ok) throw new Error(result.error);
}

function doKind(s: GameState, sourceId: string, kind: string, rest: Record<string, unknown> = {}): void {
  run(s, sourceId, { op: "do", action: { kind, ...rest } as never });
}

function must(s: GameState, action: Action): GameState {
  const result = applyAction(s, action);
  if (!result.ok) throw new Error(`${s.timingKey}: ${result.error}`);
  return result.state;
}

const choose = (s: GameState, optionId: string): GameState =>
  must(s, { type: "choose_option", optionId });

/** Net damage the Runner has taken or is about to take. */
function damage(s: GameState): number {
  return 3 - s.runner.hand.length + (s.pendingDamage?.amount ?? 0);
}

describe("the controller of the ability trashes the card (CR 1.14.5)", () => {
  it("does not count the Corp's own trash as the Runner's on the Runner's turn", () => {
    const s = board("runner");
    doKind(s, "src-c", "trash_corp_card", { cardId: "wall-1" });
    expect(s.cards["wall-1"]?.zone).toBe("corp:archives");
    // Hostile Infrastructure: "Whenever the Runner trashes a Corp card".
    expect(damage(s)).toBe(0);
    expect(s.turn.runnerTrashedCorpCardThisTurn).toBe(false);
  });

  it("counts the Runner's trash as the Runner's on the Corp's turn (CR 1.14.5a.ex1)", () => {
    const s = board("corp");
    doKind(s, "src-r", "trash_corp_card", { cardId: "wall-1" });
    expect(s.cards["wall-1"]?.zone).toBe("corp:archives");
    expect(damage(s)).toBe(1);
    expect(s.turn.runnerTrashedCorpCardThisTurn).toBe(true);
  });

  it("keeps the Runner's trash on record after the Corp trashes a card of its own", () => {
    const s = board("runner");
    doKind(s, "src-r", "trash_corp_card", { cardId: "wall-1" });
    expect(s.turn.runnerTrashedCorpCardThisTurn).toBe(true);
    s.pendingDamage = null;
    doKind(s, "src-c", "trash_corp_card", { cardId: "src-c" });
    expect(s.cards["src-c"]?.zone).toBe("corp:archives");
    expect(s.turn.runnerTrashedCorpCardThisTurn).toBe(true);
  });

  it("stops the Runner from trashing Kessleroid on either turn, and lets the Corp trash it", () => {
    for (const turn of ["corp", "runner"] as const) {
      const s = board(turn);
      const ice = put(s, "kessleroid", "kess-1", "server:rd:ice");
      ice.rezzed = true;
      ice.faceup = true;
      s.servers.rd.ice = ["kess-1"];
      s.corp.installed.push("kess-1");
      doKind(s, "src-r", "trash_corp_card", { cardId: "kess-1" });
      expect(s.cards["kess-1"]?.zone, turn).toBe("server:rd:ice");
      doKind(s, "src-c", "trash_corp_card", { cardId: "kess-1" });
      expect(s.cards["kess-1"]?.zone, turn).toBe("corp:archives");
    }
  });

  it("has the Corp trash the card Hemorrhage names, so the Runner did not trash it (CR 1.14.5a.ex2)", () => {
    for (const hq of [["hq-1"], ["hq-1", "hq-2"]]) {
      let s = board("runner");
      put(s, "hemorrhage", "hem-1", "runner:installed").faceup = true;
      s.runner.installed.push("hem-1");
      for (const id of hq) {
        put(s, "hedge-fund", id, "corp:hq").faceup = false;
        s.corp.hand.push(id);
      }
      doKind(s, "hem-1", "corp_trash_from_hq");
      if (hq.length > 1) {
        expect(s.pendingChoice?.chooser).toBe("corp");
        s = choose(s, "hemorrhage:hq-1");
      }
      expect(s.cards["hq-1"]?.zone).toBe("corp:archives");
      // The Runner did not see it: facedown (CR 4.4.6b).
      expect(s.cards["hq-1"]?.faceup).toBe(false);
      expect(damage(s)).toBe(0);
      expect(s.turn.runnerTrashedCorpCardThisTurn).toBe(false);
    }
  });
});

describe("Shred", () => {
  /** A run on remote 1, whose root holds Hostile Infrastructure, with Shred's flag set. */
  function shredRun(hqSize: number): GameState {
    const s = board("runner");
    seedRng(s, 7);
    for (let i = 0; i < hqSize; i += 1) {
      put(s, i % 2 ? "hedge-fund" : "pad-campaign", `hq-${i}`, "corp:hq").faceup = false;
      s.corp.hand.push(`hq-${i}`);
    }
    s.run = {
      attackedServerId: "remote-1",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      accessingCardId: null,
      shredPreventFirstEndTheRun: true,
    } as unknown as GameState["run"];
    return s;
  }

  /** The run was ended: it is over, or marked ended and about to be. */
  const ended = (s: GameState): boolean =>
    s.log.some((line) => line.startsWith("End the run (CR")) && (!s.run || s.run.endedTheRun === true);

  it("asks the Corp whether to reveal and trash a card to end the run (CR 1.16.11b)", () => {
    const s = shredRun(4);
    doKind(s, "wall-1", "end_the_run");
    expect(s.run?.endedTheRun).toBe(false);
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.map((option) => option.id)).toEqual([
      "end-run-pay",
      "end-run-decline",
    ]);
    // Both players read the offer: it names no card.
    expect(getPublicView(s, "runner").pendingChoice?.options.map((option) => option.id)).toEqual([
      "end-run-pay",
      "end-run-decline",
    ]);

    const declined = choose(structuredClone(s), "end-run-decline");
    expect(ended(declined)).toBe(false);
    expect(declined.run?.endedTheRun).toBe(false);
    expect(declined.corp.hand).toHaveLength(4);
    // Only the first time: the next "end the run" ends it.
    doKind(declined, "wall-1", "end_the_run");
    expect(ended(declined)).toBe(true);
  });

  it("trashes a card at random, revealed and so faceup in Archives (CR 1.21.3, CR 4.4.6b)", () => {
    const trashed = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      let s = shredRun(4);
      seedRng(s, seed);
      doKind(s, "wall-1", "end_the_run");
      s = choose(s, "end-run-pay");
      expect(ended(s)).toBe(true);
      expect(s.corp.hand).toHaveLength(3);
      expect(s.corp.discardPile).toHaveLength(1);
      const id = s.corp.discardPile[0]!;
      trashed.add(id);
      expect(s.cards[id]?.faceup).toBe(true);
      expect((s.reveals ?? []).flatMap((event) => event.cards.map((card) => card.title))).toEqual([
        s.cards[id]!.title,
      ]);
      // The Corp trashed it: Hostile Infrastructure does not meet its condition.
      expect(damage(s)).toBe(0);
    }
    // Not always the same position in HQ.
    expect(trashed.size).toBeGreaterThan(1);
  });

  it("does not end the run when HQ has fewer cards than the root (CR 1.16.1)", () => {
    const s = shredRun(0);
    doKind(s, "wall-1", "end_the_run");
    expect(s.pendingChoice).toBeFalsy();
    expect(s.run?.endedTheRun).toBe(false);
  });

  it("lets the Corp pay a cost of 0 when the root is empty (CR 1.16.1d)", () => {
    let s = shredRun(2);
    s.run!.attackedServerId = "hq";
    doKind(s, "wall-1", "end_the_run");
    expect(s.pendingChoice?.chooser).toBe("corp");
    s = choose(s, "end-run-pay");
    expect(ended(s)).toBe(true);
    expect(s.corp.hand).toHaveLength(2);
  });
});

describe("Accelerated Diagnostics", () => {
  /** R&D top to bottom: Hedge Fund, Ice Wall, Beanstalk Royalties, PAD Campaign. */
  function diagnostics(credits: number): GameState {
    const s = board("corp");
    s.corp.credits = credits;
    s.corp.deck = [];
    ["hedge-fund", "ice-wall", "beanstalk-royalties", "pad-campaign"].forEach((defId, i) => {
      put(s, defId, `rd-${i}`, "corp:rd").faceup = false;
      s.corp.deck.push(`rd-${i}`);
    });
    doKind(s, "src-c", "accelerated_diagnostics");
    return s;
  }

  it("asks the Corp which operation to play, one at a time (CR 8.6.3)", () => {
    let s = diagnostics(5);
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.map((option) => option.id)).toEqual([
      "play-looked:rd-0",
      "play-looked:rd-2",
      "play-looked:none",
    ]);
    // The Runner is told a choice is open, and not which cards it is among.
    const runner = JSON.stringify(getPublicView(s, "runner").pendingChoice);
    expect(runner).not.toContain("Hedge Fund");
    expect(runner).not.toContain("Beanstalk Royalties");
    expect(runner).not.toContain("rd-0");

    // Beanstalk Royalties first: 5 + 3.
    s = choose(s, "play-looked:rd-2");
    expect(s.corp.credits).toBe(8);
    expect(s.pendingChoice?.options.map((option) => option.id)).toEqual([
      "play-looked:rd-0",
      "play-looked:none",
    ]);
    // Then Hedge Fund: 8 - 5 + 9.
    s = choose(s, "play-looked:rd-0");
    expect(s.corp.credits).toBe(12);
    expect(s.pendingChoice).toBeFalsy();
    // Ice Wall is trashed unseen (CR 4.4.6b). PAD Campaign was never looked at.
    expect(s.cards["rd-1"]?.zone).toBe("corp:archives");
    expect(s.cards["rd-1"]?.faceup).toBe(false);
    expect(s.corp.deck).toEqual(["rd-3"]);
  });

  it("lets the Corp play none, and trashes all three facedown", () => {
    let s = diagnostics(5);
    s = choose(s, "play-looked:none");
    expect(s.corp.credits).toBe(5);
    for (const id of ["rd-0", "rd-1", "rd-2"]) {
      expect(s.cards[id]?.zone, id).toBe("corp:archives");
      expect(s.cards[id]?.faceup, id).toBe(false);
      expect(s.cards[id]?.lookedBy, id).toBeUndefined();
    }
    expect(s.log.join("\n")).not.toContain("Hedge Fund");
  });

  it("offers only an operation the Corp can pay for", () => {
    const s = diagnostics(1);
    // Hedge Fund costs 5. Beanstalk Royalties costs 0.
    expect(s.pendingChoice?.options.map((option) => option.id)).toEqual([
      "play-looked:rd-2",
      "play-looked:none",
    ]);
  });

  it("trashes the three cards without asking when none is an operation", () => {
    const s = board("corp");
    s.corp.deck = [];
    ["ice-wall", "pad-campaign", "enigma"].forEach((defId, i) => {
      put(s, defId, `rd-${i}`, "corp:rd").faceup = false;
      s.corp.deck.push(`rd-${i}`);
    });
    doKind(s, "src-c", "accelerated_diagnostics");
    expect(s.pendingChoice).toBeFalsy();
    expect(s.corp.discardPile).toEqual(["rd-0", "rd-1", "rd-2"]);
  });
});

describe("card-specific trashes use the trash procedure (CR 1.14.5, CR 4.4.6b)", () => {
  it("Trypano: the Runner trashes its host, and unrezzed ice goes to Archives facedown", () => {
    const s = createInitialState();
    const ice = put(s, "ice-wall", "host-ice", "server:hq:ice");
    ice.rezzed = false;
    ice.faceup = false;
    s.servers["hq"]!.ice = ["host-ice"];
    const trypano = put(s, "trypano", "tryp-1", "runner:installed");
    trypano.hostId = "host-ice";
    trypano.virusCounters = 4;
    ice.hostedCardIds = ["tryp-1"];
    s.runner.installed = ["tryp-1"];
    s.turn.runnerTrashedCorpCardThisTurn = false;
    doKind(s, "tryp-1", "add_virus_counter", { amount: 1 });
    expect(s.cards["host-ice"]?.zone).toBe("corp:archives");
    expect(s.cards["host-ice"]?.faceup).toBe(false);
    expect(s.servers["hq"]!.ice).toEqual([]);
    expect(s.turn.runnerTrashedCorpCardThisTurn).toBe(true);
  });

  it("an asset trashed for having no power counters is a Corp card added to Archives by the Corp", () => {
    const s = createInitialState();
    const rex = put(s, "rex-campaign", "rex-1", "server:remote-1:root");
    rex.rezzed = true;
    rex.faceup = true;
    rex.trashWhenPowerEmpty = true;
    rex.powerHosted = true;
    rex.powerCounters = 0;
    s.servers["remote-1"] = { id: "remote-1", kind: "remote", ice: [], root: ["rex-1"] };
    s.turn.runnerTrashedCorpCardThisTurn = false;
    const before = s.turn.corpCardsAddedToArchivesThisTurn;
    notePowerCounters(s, rex);
    expect(rex.zone).toBe("corp:archives");
    expect(rex.faceup).toBe(true);
    expect(s.turn.corpCardsAddedToArchivesThisTurn).toBe(before + 1);
    expect(s.turn.runnerTrashedCorpCardThisTurn).toBe(false);
  });
});
