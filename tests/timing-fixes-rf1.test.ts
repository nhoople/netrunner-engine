/**
 * RF-1 timing fixes (CR audit program, "Re-audit of the earlier programs").
 * RA-1 (engine #960) found these paths wrong; each test states the behavior
 * the CR settles and cites the rule.
 */
import { openAsChoice } from "./rulings-helpers.js";
import { beforeAll, describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  closeReactionWindow,
  createInitialState,
  createPendingAbilityInstance,
  crDataPresent,
  evalEffect,
  fx,
  instantiateCard,
  openReactionWindow,
} from "../src/index.js";
import { passIdle } from "../src/demo/passIdle.js";
import { checkpointAfterInstruction } from "../src/legality/checkpoints.js";
import { resumePendingStoredConditionals } from "../src/state/storedTriggers.js";
import { whenScoredEffect } from "../src/state/whenScored.js";
import { resumeRunnerTurnBeginAbilities } from "../src/timing/graph.js";
import type { Effect } from "../src/effects/ir.js";
import type { Action, GameState, Side } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.27");
});

/** The test board, with no Runner card marked rezzed (CR 8.1.4f). */
function base(): GameState {
  const s = createInitialState();
  for (const card of Object.values(s.cards)) {
    if (card.side === "runner") card.rezzed = false;
  }
  return s;
}

/** A pending inline conditional that gains its controller 1 credit. */
function pendingGain(
  s: GameState,
  side: Side,
  abilityKey = `test:${side}-gain`,
): string {
  const gain: Effect = {
    op: "do",
    action: { kind: "gain_credits", side, amount: 1 },
  };
  return createPendingAbilityInstance(s, {
    abilityKey,
    sourceId: side === "corp" ? s.corp.identityId : s.runner.identityId,
    controller: side,
    mandatory: true,
    payload: { kind: "inline_conditional", effect: gain },
  }).id;
}

/** Each "<side> gains 1" line, in order, from `from` on. */
function gains(s: GameState, from: number): string[] {
  return s.log
    .slice(from)
    .filter((line) => /^(corp|runner) gains 1¢/.test(line))
    .map((line) => line.split(" ")[0]!);
}

/** Each reaction window's size, in the order they opened, from `from` on. */
function windows(s: GameState, from: number): number[] {
  return s.log
    .slice(from)
    .filter((line) => line.startsWith("Reaction window open"))
    .map((line) => Number(/with (\d+) pending/.exec(line)?.[1]));
}

/**
 * A reaction window held the Runner's ability and paused (a choice opened
 * while an earlier instance resolved), so its frame closed with the
 * Runner's instance still pending. Then the Corp's ability became pending.
 */
function pausedWindowWithNewPending(s: GameState): void {
  s.activeSide = "runner";
  const leftover = pendingGain(s, "runner");
  const frame = openReactionWindow(s, [leftover], null);
  closeReactionWindow(s, frame.id);
  pendingGain(s, "corp");
}

describe("nested reaction windows (CR 9.2.8a)", () => {
  it("an ability that becomes pending during a paused reaction window resolves in its own window before the rest (CR 9.2.8a)", () => {
    const s = base();
    pausedWindowWithNewPending(s);
    const from = s.log.length;
    resumePendingStoredConditionals(s);
    // The Corp's new ability first, alone, though the Runner is the active
    // player (CR 9.2.8a, 9.2.8b); then the paused window's leftover.
    expect(gains(s, from)).toEqual(["corp", "runner"]);
    expect(windows(s, from)).toEqual([1, 1]);
    expect(s.pendingAbilities).toEqual([]);
  });

  it("resolves a nested window first when a Runner turn-begin ability's window resumes (CR 9.2.8a, 9.6.5d)", () => {
    const s = base();
    s.activeSide = "runner";
    const turnBegin = pendingGain(s, "runner", "on-turn-begin");
    const frame = openReactionWindow(s, [turnBegin], null);
    closeReactionWindow(s, frame.id);
    pendingGain(s, "corp");
    const from = s.log.length;
    resumeRunnerTurnBeginAbilities(s);
    expect(gains(s, from)).toEqual(["corp", "runner"]);
    expect(windows(s, from)).toEqual([1, 1]);
  });

  it("gives the active player priority first inside each window (CR 9.2.8b)", () => {
    const s = base();
    s.activeSide = "runner";
    const corpOld = pendingGain(s, "corp", "test:corp-old");
    const runnerOld = pendingGain(s, "runner", "test:runner-old");
    const frame = openReactionWindow(s, [corpOld, runnerOld], null);
    closeReactionWindow(s, frame.id);
    pendingGain(s, "corp", "test:corp-new");
    pendingGain(s, "runner", "test:runner-new");
    const from = s.log.length;
    resumePendingStoredConditionals(s);
    expect(gains(s, from)).toEqual(["runner", "corp", "runner", "corp"]);
    expect(windows(s, from)).toEqual([2, 2]);
  });
});

function must(state: GameState, action: Action): GameState {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return passIdle(r.state);
}

describe("losing pending status (CR 9.6.10)", () => {
  it("a rezzed card derezzed while its ability is pending loses that pending instance: Maglectric Rapid derezzing Bernice Mai (CR 9.6.10, 1.8.3a)", () => {
    const s = base();
    s.activeSide = "runner";
    const bernice = instantiateCard(
      "bernice-mai",
      "bm-1",
      "server:remote-1:root",
    );
    bernice.rezzed = true;
    bernice.faceup = true;
    s.cards["bm-1"] = bernice;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["bm-1"],
    };
    const pending = createPendingAbilityInstance(s, {
      abilityKey: "test:bernice",
      sourceId: "bm-1",
      controller: "corp",
      mandatory: true,
      payload: {
        kind: "inline_conditional",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 1 },
        },
      },
    });
    // The window paused on the Runner's Maglectric Rapid, which derezzed
    // Bernice Mai.
    const frame = openReactionWindow(s, [pending.id], null);
    closeReactionWindow(s, frame.id);
    bernice.rezzed = false;
    const credits = s.corp.credits;
    resumePendingStoredConditionals(s);
    expect(s.corp.credits).toBe(credits);
    expect(
      s.log.some((l) => l.startsWith("Bernice Mai loses pending status")),
    ).toBe(true);
  });
});

describe("cost checkpoints of basic actions (CR 10.3.4, 1.16.3)", () => {
  it("runs a cost checkpoint after the click of the basic gain-credit action, before the credit is gained (CR 10.3.4)", () => {
    const s = base();
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    s.corp.clicks = 3;
    const from = s.log.length;
    const after = must(s, { type: "basic_gain_credit" });
    const lines = after.log.slice(from);
    const cost = lines.findIndex((l) => l.startsWith("Checkpoint open [cost]"));
    const gain = lines.findIndex((l) => l.startsWith("corp gains 1 credit"));
    expect(cost).toBeGreaterThanOrEqual(0);
    expect(gain).toBeGreaterThan(cost);
  });
});

describe("one printed sentence is one instruction (CR 9.11.3)", () => {
  it("runs no checkpoint inside a seq marked as one instruction, and one between the effects of a plain seq (CR 9.11.3, 9.1.2)", () => {
    const s = base();
    const gainThenDraw = [
      fx.do({ kind: "gain_credits", side: "runner", amount: 1 }),
      fx.draw("runner", 1),
    ];
    const between = (oneInstruction: boolean): number => {
      const from = s.log.length;
      const r = evalEffect(
        { state: s, sourceId: s.runner.identityId },
        { op: "seq", effects: gainThenDraw, oneInstruction },
      );
      expect(r.ok).toBe(true);
      return s.log
        .slice(from)
        .filter((l) => l.startsWith("Checkpoint open [instruction] Between"))
        .length;
    };
    expect(between(true)).toBe(0);
    expect(between(false)).toBe(1);
  });
});

describe("conditional abilities with a static condition (CR 9.6.7a)", () => {
  it("Trypano trashes its host at the next checkpoint once it has 5 virus counters, however they arrived (Virus Breeding Ground) (CR 9.6.7a)", () => {
    const s = base();
    const ice = instantiateCard("ice-wall", "iw-1", "server:hq:ice");
    ice.rezzed = true;
    ice.faceup = true;
    ice.hostedCardIds = ["tryp-1"];
    s.cards["iw-1"] = ice;
    s.servers.hq.ice = ["iw-1"];
    const trypano = instantiateCard("trypano", "tryp-1", "runner:installed");
    trypano.hostId = "iw-1";
    trypano.virusCounters = 4;
    s.cards["tryp-1"] = trypano;
    s.runner.installed = ["tryp-1"];
    checkpointAfterInstruction(s, "test.before");
    expect(s.cards["iw-1"]?.zone).toBe("server:hq:ice");
    // Virus Breeding Ground moves its counter: no add_virus_counter runs.
    trypano.virusCounters = 5;
    checkpointAfterInstruction(s, "test.moved");
    expect(s.cards["iw-1"]?.zone).toBe("corp:archives");
  });
});

describe("when-scored abilities (CR 9.6.14c, 9.6.14d)", () => {
  /** Market Research advanced to its requirement in a remote root. */
  function marketResearchBoard(tags: number): GameState {
    const s = base();
    const agenda = instantiateCard(
      "market-research",
      "mr-1",
      "server:remote-1:root",
    );
    agenda.advancementCounters = agenda.advancementRequirement ?? 4;
    s.cards["mr-1"] = agenda;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["mr-1"],
    };
    s.runner.tags = tags;
    s.activeSide = "corp";
    s.timingKey = "corp.actionPaw";
    return s;
  }

  it("Market Research scored while the Runner is tagged gets 1 agenda counter (CR 9.6.14c, 1.2.1)", () => {
    const s = must(marketResearchBoard(1), {
      type: "score_agenda",
      cardId: "mr-1",
    });
    expect(s.corp.scoreArea).toContain("mr-1");
    expect(s.cards["mr-1"]?.agendaCounters).toBe(1);
  });

  it("Market Research scored while the Runner is not tagged gets no counter (CR 9.6.14d)", () => {
    const s = must(marketResearchBoard(0), {
      type: "score_agenda",
      cardId: "mr-1",
    });
    expect(s.cards["mr-1"]?.agendaCounters ?? 0).toBe(0);
  });

  it("Bifrost Array can trigger Market Research's when-scored ability, which places a counter while the Runner is tagged (CR 9.6.14d)", () => {
    let s = base();
    for (const [def, id] of [
      ["bifrost-array", "bif-1"],
      ["market-research", "mr-1"],
    ] as const) {
      const card = instantiateCard(def, id, "corp:score");
      card.faceup = true;
      s.cards[id] = card;
    }
    s.corp.scoreArea = ["bif-1", "mr-1"];
    s.runner.tags = 1;
    s.activeSide = "corp";
    const r = evalEffect(
      { state: s, sourceId: "bif-1" },
      fx.do({ kind: "may_score_bifrost_trigger_scored_agenda_on" }),
    );
    expect(r.ok).toBe(true);
    const pick = s.pendingChoice?.options.find((o) => o.id.includes("mr-1"));
    expect(pick).toBeDefined();
    s = must(s, { type: "choose_option", optionId: pick!.id });
    for (let i = 0; i < 2 && s.pendingChoice; i++) {
      s = must(s, {
        type: "choose_option",
        optionId: s.pendingChoice.options[0]!.id,
      });
    }
    expect(s.cards["mr-1"]?.agendaCounters).toBe(1);
  });

  it("scoring Hostile Takeover still gains 7 credits and takes 1 bad publicity (CR 9.6.14c)", () => {
    const s = base();
    const agenda = instantiateCard(
      "hostile-takeover",
      "ht-1",
      "server:remote-1:root",
    );
    agenda.advancementCounters = 2;
    s.cards["ht-1"] = agenda;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["ht-1"],
    };
    s.corp.credits = 0;
    s.activeSide = "corp";
    s.timingKey = "corp.actionPaw";
    const after = must(s, { type: "score_agenda", cardId: "ht-1" });
    expect(after.corp.credits).toBe(7);
    expect(after.corp.badPublicity ?? 0).toBe(1);
  });
});

describe("trash triggers of other cards on a checkpoint trash (CR 10.3.1a)", () => {
  it("Gravedigger gets a virus counter when the uniqueness checkpoint trashes an installed Corp card (CR 10.3.1d, 10.3.1a)", () => {
    const s = base();
    for (const [id, server, rezzed] of [
      ["board-a", "remote-1", true],
      ["board-b", "remote-2", false],
    ] as const) {
      const card = instantiateCard("the-board", id, `server:${server}:root`);
      card.rezzed = rezzed;
      card.faceup = rezzed;
      s.cards[id] = card;
      s.servers[server] = { id: server, kind: "remote", ice: [], root: [id] };
    }
    const digger = instantiateCard("gravedigger", "gd-1", "runner:installed");
    s.cards["gd-1"] = digger;
    s.runner.installed = ["gd-1"];
    checkpointAfterInstruction(s, "test.first");
    s.cards["board-b"]!.rezzed = true;
    s.cards["board-b"]!.faceup = true;
    checkpointAfterInstruction(s, "test.second");
    expect(s.cards["board-a"]?.zone).toBe("corp:archives");
    expect(s.cards["gd-1"]?.virusCounters ?? 0).toBe(1);
  });

  it("Q-Coherence Chip is trashed when the memory-limit checkpoint trashes an installed program (CR 10.3.1e, 10.3.1a)", () => {
    const s = base();
    const chip = instantiateCard(
      "q-coherence-chip",
      "qc-1",
      "runner:installed",
    );
    s.cards["qc-1"] = chip;
    s.runner.installed = ["qc-1"];
    for (const id of ["p-1", "p-2", "p-3", "p-4", "p-5", "p-6"]) {
      const program = instantiateCard("corroder", id, "runner:installed");
      program.memoryCost = 1;
      s.cards[id] = program;
      s.runner.installed.push(id);
    }
    checkpointAfterInstruction(s, "test.over");
    // Over the limit: the Runner chooses which programs to trash.
    for (let i = 0; i < 4 && s.pendingChoice; i++) {
      const r = applyAction(s, {
        type: "choose_option",
        optionId: s.pendingChoice.options[0]!.id,
      });
      if (!r.ok) throw new Error(r.error);
      Object.assign(s, r.state);
    }
    expect(
      ["p-1", "p-2", "p-3", "p-4", "p-5", "p-6"].some(
        (id) => s.cards[id]?.zone === "runner:heap",
      ),
    ).toBe(true);
    expect(s.cards["qc-1"]?.zone).toBe("runner:heap");
  });
});

describe("Corp trash triggers (CR 1.14.5a, 9.6.5c)", () => {
  it("every supported Corp card with a 'trash' trigger prints 'the Runner trashes', so only a Runner trash of an active card meets it", () => {
    const dir = join(process.cwd(), "vendor/cards-data/corp");
    const wrong: string[] = [];
    for (const type of readdirSync(dir)) {
      for (const file of readdirSync(join(dir, type))) {
        const def = JSON.parse(readFileSync(join(dir, type, file), "utf8")) as {
          title: string;
          id: string;
          abilities?: Array<{ trigger?: string }>;
        };
        if (!def.abilities?.some((a) => a.trigger === "trash")) continue;
        // Mavirus models "[trash]: Purge" as a trash trigger, a card-model
        // finding filed by RA-1 for the sweep.
        if (def.id === "mavirus") continue;
        const text = readFileSync(
          join(process.cwd(), "vendor/cards-data/printed", `${def.id}.json`),
          "utf8",
        );
        if (!/the Runner trashes/i.test(text)) wrong.push(def.title);
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe("breach replacements (CR 9.9.11a)", () => {
  it("offers no Account Siphon replacement once Security Testing has already replaced the breach of HQ (CR 9.9.11a)", () => {
    const s = base();
    s.cards["as-1"] = instantiateCard(
      "account-siphon",
      "as-1",
      "runner:play-area",
    );
    s.runner.playArea.push("as-1");
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
      { state: s, sourceId: "as-1" },
      fx.do({ kind: "may_breach_instead_account_siphon" }),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice).toBeNull();
  });
});

describe("creating a remote server during an install (CR 8.5.16e)", () => {
  it("Astrolabe's draw waits until the install is complete: after the install cost's checkpoint and the card entering the new server (CR 8.5.16d, 8.5.16e, 9.11.2a.ex1)", () => {
    const s = base();
    s.cards["astro-1"] = instantiateCard(
      "astrolabe",
      "astro-1",
      "runner:installed",
    );
    s.runner.installed = ["astro-1"];
    s.cards["pad-1"] = instantiateCard("pad-campaign", "pad-1", "corp:hq");
    s.corp.hand.push("pad-1");
    s.corp.clicks = 3;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    const hand = s.runner.hand.length;
    const from = s.log.length;
    const after = must(s, {
      type: "basic_install",
      cardId: "pad-1",
      destination: { kind: "new_remote" },
    });
    const lines = after.log.slice(from);
    const costCheckpoints = lines
      .map((l, i) => (l.startsWith("Checkpoint open [cost]") ? i : -1))
      .filter((i) => i >= 0);
    const installed = lines.findIndex((l) =>
      l.startsWith("Corp installs PAD Campaign"),
    );
    const pending = lines.findIndex((l) =>
      l.startsWith("Astrolabe becomes pending"),
    );
    expect(costCheckpoints).toHaveLength(2);
    expect(installed).toBeGreaterThan(costCheckpoints[1]!);
    expect(pending).toBeGreaterThan(installed);
    expect(after.runner.hand.length).toBe(hand + 1);
  });
});

describe("one pending instance per drawn card (CR 9.6.4b, 9.2.8d)", () => {
  it("Jinja City Grid offers both ice when the Corp draws 2 ice at once, the second after the first choice (CR 9.6.4b, 9.2.8a)", () => {
    let s = base();
    const jinja = instantiateCard(
      "jinja-city-grid",
      "jinja-1",
      "server:remote-1:root",
    );
    jinja.rezzed = true;
    jinja.faceup = true;
    s.cards["jinja-1"] = jinja;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["jinja-1"],
    };
    for (const id of ["ice-a", "ice-b"]) {
      s.cards[id] = instantiateCard("ice-wall", id, "corp:rd");
    }
    s.corp.deck.unshift("ice-a", "ice-b");
    s.corp.credits = 10;
    s.activeSide = "corp";
    const r = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      fx.draw("corp", 2),
    );
    expect(r.ok).toBe(true);
    const offers: string[] = [];
    for (let i = 0; i < 6 && s.pendingChoice; i++) {
      const options = s.pendingChoice.options;
      const accept = options.find((o) => o.id === "accept");
      if (accept) offers.push(accept.label);
      s = must(s, {
        type: "choose_option",
        optionId: (accept ?? options[0]!).id,
      });
    }
    expect(offers).toHaveLength(2);
    expect([...s.servers["remote-1"]!.ice].sort()).toEqual(["ice-a", "ice-b"]);
  });
});

describe("breach replacements, Singularity (CR 9.9.11a)", () => {
  it("offers no Singularity replacement once another replacement has already replaced the breach (CR 9.9.11a)", () => {
    const s = base();
    s.cards["sing-1"] = instantiateCard(
      "singularity",
      "sing-1",
      "runner:play-area",
    );
    s.runner.playArea.push("sing-1");
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
      { state: s, sourceId: "sing-1" },
      fx.do({ kind: "breach_instead_singularity_trash_root" }),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice).toBeNull();
    expect(s.log.some((l) => l.includes("already replaced"))).toBe(true);
  });
});

describe("follow-ups from cr-checker on RF-1", () => {
  it("Market Research's tag is part of its trigger condition: tagged when scored, it places the counter even if the tag is gone when it resolves (CR 9.6.5c)", () => {
    const s = base();
    const mr = instantiateCard("market-research", "mr-1", "corp:score");
    s.cards["mr-1"] = mr;
    s.corp.scoreArea = ["mr-1"];
    s.runner.tags = 0;
    expect(whenScoredEffect(mr, false)).toBeUndefined();
    const r = evalEffect(
      { state: s, sourceId: "mr-1" },
      whenScoredEffect(mr, true)!,
    );
    expect(r.ok).toBe(true);
    expect(s.cards["mr-1"]?.agendaCounters).toBe(1);
  });

  it("a run event's own 'instead of breaching' does not block another replacement the Runner may apply first (CR 9.9.11)", () => {
    const s = base();
    s.cards["as-1"] = instantiateCard(
      "account-siphon",
      "as-1",
      "runner:play-area",
    );
    s.runner.playArea.push("as-1");
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
      skipBreachFromRunStart: true,
    };
    const r = evalEffect(
      { state: s, sourceId: "as-1" },
      fx.do({ kind: "may_breach_instead_account_siphon" }),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice).not.toBeNull();
  });

  it("Calvin B4L3Y trashed by Singularity with Hostile Infrastructure is pending in the same reaction window as Hostile Infrastructure's instances (CR 9.6.4b, 9.12.2a)", () => {
    let s = base();
    for (const [def, id] of [
      ["hostile-infrastructure", "hi-1"],
      ["calvin-b4l3y", "cal-1"],
    ] as const) {
      const card = instantiateCard(def, id, "server:remote-1:root");
      card.rezzed = true;
      card.faceup = true;
      s.cards[id] = card;
    }
    s.cards["sing-1"] = instantiateCard(
      "singularity",
      "sing-1",
      "runner:play-area",
    );
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
      root: ["hi-1", "cal-1"],
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
    const opened = openAsChoice(
      s,
      "sing-1",
      "singularity",
      fx.do({ kind: "breach_instead_singularity_trash_root" }),
    );
    expect(opened.ok).toBe(true);
    const from = s.log.length;
    s = must(s, { type: "choose_option", optionId: "singularity" });
    expect(windows(s, from)[0]).toBe(3);
  });
});
