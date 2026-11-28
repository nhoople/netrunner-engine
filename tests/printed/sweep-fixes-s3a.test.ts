/**
 * Printed-text sweep S3a and S3b fixes (CR audit program, slice PF-S3a).
 *
 * Each describe block is one Core Set or Genesis card the S3 sweep found
 * playing against its printed text (tests/baselines/printed-sweep.json). The
 * card text wins over the model (CR 1.2.1). Each test name states the printed
 * behavior and cites the rule it follows. Cards whose fix is card JSON read
 * the pinned catalog, so these tests also prove the paired cards release.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  effectiveIceStrength,
  evalEffect,
  legalActions,
} from "../../src/index.js";
import type { GameState } from "../../src/index.js";
import type { Action } from "../../src/state/types/actions.js";
import type { ServerId } from "../../src/state/types/servers.js";
import { fx } from "../../src/effects/ir/fx.js";
import { type Effect } from "../../src/effects/ir/effect.js";
import { memoryLimit } from "../../src/state/turnAndActions/turn.js";
import { recomputeRunnerLink } from "../../src/state/hostingAndTrash/trashHooks.js";
import { maybeOpenTrashPrevent } from "../../src/state/hostingAndTrash/trashPrevent.js";
import { uninstallCard } from "../../src/state/uninstallAndPosition/uninstall.js";
import { paidAbilityOpenIn } from "../../src/state/keywordsAndCredits/costs.js";
import {
  coversKind,
  expectStateDelta,
  snapshot,
} from "../effects/kind-coverage.js";
import {
  atRunnerAction,
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
  runnerTurn,
  stackRd,
  toHand,
} from "../rulings/rulings-helpers.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.29");
});

/** Evaluate an effect as `sourceId`'s ability. */
function evalAs(s: GameState, sourceId: string, effect: Effect): void {
  const r = evalEffect({ state: s, sourceId }, effect);
  expect(r.ok, r.ok ? "" : r.error).toBe(true);
}

/** Resolve one option of the open choice directly (unit level). */
function choose(s: GameState, optionId: string): void {
  const choice = s.pendingChoice;
  const option = choice?.options.find((o) => o.id === optionId);
  if (!choice || !option) {
    throw new Error(`No option ${optionId}; open: ${optionIds(s).join(", ")}`);
  }
  s.pendingChoice = null;
  evalAs(s, choice.sourceId, option.effect);
}

function labels(s: GameState): string[] {
  return (s.pendingChoice?.options ?? []).map((o) => o.label);
}

/** The paid ability window of the Corp's action phase. */
function corpPaw(s: GameState): GameState {
  s.timingKey = "corp.actionPaw";
  return s;
}

const runIs = (step: string) => (s: GameState) => s.timingKey === step;

/** The ice at the Runner's position in the attacked server. */
function approached(s: GameState): string | undefined {
  const run = s.run;
  if (!run || run.position === null) return undefined;
  return s.servers[run.attackedServerId]!.ice[run.position];
}

// ---------------------------------------------------------------------------
// Engine fixes
// ---------------------------------------------------------------------------

describe("Corporate Troubleshooter", () => {
  it("after its [trash] cost moves it to Archives, 'this server' is still the server it was in, so the chosen ice gets +X strength (CR 4.6.6i)", () => {
    let s = corpTurn(fresh(), 5);
    installRoot(s, "corporate-troubleshooter", "ct-1");
    const server = "remote-ct-1" as ServerId;
    installIce(s, "ice-wall", "iw-1", server, true);
    const base = effectiveIceStrength(s, "iw-1");
    s = must(corpPaw(s), {
      type: "use_paid_ability",
      cardId: "ct-1",
      abilityId: "ct-fortify",
    });
    expect(s.corp.discardPile).toContain("ct-1");
    expect(optionIds(s)).toContain("ct:iw-1:2");
    s = pick(s, "ct:iw-1:2");
    expect(effectiveIceStrength(s, "iw-1")).toBe(base + 2);
  });
});

describe("Edge of World", () => {
  it("the Runner cannot cancel its core damage by losing all clicks, which it does not print (CR 1.2.1, 10.4.2b)", () => {
    const s = fresh();
    installRoot(s, "edge-of-world", "eow-1", false);
    const server = "remote-eow-1" as ServerId;
    installIce(s, "ice-wall", "iw-1", server, false);
    installIce(s, "ice-wall", "iw-2", server, false);
    s.corp.credits = 5;
    s.runner.clicks = 3;
    evalAs(
      s,
      "eow-1",
      fx.do({
        kind: "may_pay_credits_for_core_damage_per_ice_protecting_this_server",
        amount: 3,
      }),
    );
    choose(s, "pay");
    expect(s.corp.credits).toBe(2);
    expect(s.pendingDamage?.remaining).toBe(2);
    expect(s.pendingDamage?.preventByLoseAllClicks ?? false).toBe(false);
  });
});

describe("Doppelgänger", () => {
  it("declining the run does not use its once per turn; running does, and then it is not offered again that turn (CR 9.6.9d, 9.3.6g)", () => {
    let s = runnerTurn(fresh());
    installRunner(s, "doppelganger", "dop-1");
    s = must(s, { type: "basic_run", serverId: "archives" });
    s = drive(s, (x) => Boolean(x.pendingChoice) && !x.run);
    expect(s.pendingChoice?.sourceId).toBe("dop-1");
    s = pick(s, "decline");
    expect(s.turn.onSuccessfulRunEndFiredIds).toEqual([]);

    s = drive(s, atRunnerAction);
    s = must(s, { type: "basic_run", serverId: "archives" });
    s = drive(s, (x) => Boolean(x.pendingChoice) && !x.run);
    expect(s.pendingChoice?.sourceId).toBe("dop-1");
    s = pick(s, "run:archives");
    expect(s.turn.onSuccessfulRunEndFiredIds).toEqual(["dop-1"]);
    // The run Doppelgänger started is also successful; it is used up.
    s = drive(s, (x) => Boolean(x.pendingChoice) || atRunnerAction(x));
    expect(s.pendingChoice?.sourceId).not.toBe("dop-1");
  });
});

describe("Midori", () => {
  it("declining the swap at the outer ice keeps its once per run for the next ice; the swap uses it (CR 9.6.9d)", () => {
    let s = runnerTurn(fresh());
    installRoot(s, "midori", "mid-1");
    const server = "remote-mid-1" as ServerId;
    installIce(s, "ice-wall", "inner", server, false);
    installIce(s, "ice-wall", "outer", server, false);
    toHand(s, "corp", "enigma", "hq-en");
    s = must(s, { type: "basic_run", serverId: server });
    s = drive(s, (x) => x.pendingChoice?.sourceId === "mid-1");
    expect(approached(s)).toBe("outer");
    s = pick(s, "decline");
    expect(s.run?.approachIceTriggersFiredIds ?? []).toEqual([]);

    s = drive(s, (x) => x.pendingChoice?.sourceId === "mid-1");
    expect(approached(s)).toBe("inner");
    s = pick(s, "hq-en");
    expect(s.run?.approachIceTriggersFiredIds).toEqual(["mid-1"]);
    expect(approached(s)).toBe("hq-en");
  });
});

describe("Snitch", () => {
  it("declining at the first unrezzed ice keeps its once per run for the next, and its choice does not name the unrezzed ice (CR 9.6.9d, 10.2.2a)", () => {
    let s = runnerTurn(fresh());
    installRunner(s, "snitch", "sn-1");
    installRoot(s, "pad-campaign", "pad-1", false);
    const server = "remote-pad-1" as ServerId;
    installIce(s, "ice-wall", "inner", server, false);
    installIce(s, "enigma", "outer", server, false);
    s = must(s, { type: "basic_run", serverId: server });
    s = drive(s, (x) => x.pendingChoice?.sourceId === "sn-1");
    expect(approached(s)).toBe("outer");
    expect(labels(s).join(" ")).not.toMatch(/Enigma/);
    expect(s.log.slice(-3).join(" ")).not.toMatch(/Enigma/);
    s = pick(s, "decline");

    s = drive(s, (x) => x.pendingChoice?.sourceId === "sn-1");
    expect(approached(s)).toBe("inner");
    expect(labels(s).join(" ")).not.toMatch(/Ice Wall/);
    coversKind("mark_ability_used_this_run");
    const before = snapshot(s);
    s = pick(s, "snitch-expose");
    expectStateDelta(before, s, {
      "run.usedAbilitiesThisRun": { to: ["sn-1:snitch-expose"] },
    });
  });
});

describe("Accelerated Beta Test", () => {
  it("the Corp may decline to look at the top 3 cards of R&D, and then nothing is trashed (CR 9.6.9c)", () => {
    const s = fresh();
    put(s, "accelerated-beta-test", "abt-1", "corp:score");
    stackRd(s, [
      ["hedge-fund", "rd-1"],
      ["pad-campaign", "rd-2"],
      ["ice-wall", "rd-3"],
    ]);
    const deck = [...s.corp.deck];
    evalAs(s, "abt-1", fx.do({ kind: "accelerated_beta_test", n: 3 }));
    expect(optionIds(s)).toEqual(["abt-look", "abt-decline"]);
    choose(s, "abt-decline");
    expect(s.corp.deck).toEqual(deck);
    expect(s.corp.discardPile).not.toContain("rd-1");
    expect(s.turn.rdLookedCards).toEqual([]);
  });

  it("looking still trashes the cards that are not installed (CR 1.2.1)", () => {
    const s = fresh();
    put(s, "accelerated-beta-test", "abt-1", "corp:score");
    stackRd(s, [
      ["hedge-fund", "rd-1"],
      ["pad-campaign", "rd-2"],
      ["beanstalk-royalties", "rd-3"],
    ]);
    evalAs(s, "abt-1", fx.do({ kind: "accelerated_beta_test", n: 3 }));
    choose(s, "abt-look");
    expect(s.corp.discardPile).toEqual(
      expect.arrayContaining(["rd-1", "rd-2", "rd-3"]),
    );
  });
});

describe("Test Run", () => {
  function board(): GameState {
    const s = runnerTurn(fresh());
    s.runner.deck = [];
    put(s, "test-run", "tr-1", "runner:play-area");
    for (const [defId, id, zone] of [
      ["corroder", "st-cor", "runner:stack"],
      ["gordian-blade", "st-gb", "runner:stack"],
      ["sure-gamble", "st-sg", "runner:stack"],
      ["mimic", "hp-mim", "runner:heap"],
    ] as const) {
      put(s, defId, id, zone);
      (zone === "runner:stack" ? s.runner.deck : s.runner.discardPile).push(id);
    }
    evalAs(s, "tr-1", fx.installProgramFromStackOrHeapFree());
    return s;
  }

  it("the Runner chooses the stack or the heap, then which program; the stack is shuffled and the program installed and marked to return (CR 8.7.1, 8.7.3)", () => {
    const s = board();
    expect(optionIds(s)).toEqual(["search-stack", "search-heap"]);
    choose(s, "search-stack");
    // A deck search offers each program and "None", and hides the count
    // from the Corp (CR 8.7.2e, 10.2.2b).
    expect(optionIds(s)).toEqual([
      "choose-card:st-cor",
      "choose-card:st-gb",
      "choose-cards-done",
    ]);
    expect(s.pendingChoice?.hiddenFromOpponent).toBe(true);
    choose(s, "choose-card:st-gb");
    expect(s.runner.installed).toContain("st-gb");
    expect(s.cards["st-gb"]!.bounceToStackAtTurnEnd).toBe(true);
    expect(s.runner.installed).not.toContain("st-cor");
    expect(s.log.some((l) => l.includes("shuffle the stack"))).toBe(true);
  });

  it("the Runner may search the heap instead, where a program must be found, or find nothing in the stack (CR 8.7.2e)", () => {
    // The heap is not a deck: its one program is found (CR 8.7.2e).
    const heap = board();
    choose(heap, "search-heap");
    expect(heap.pendingChoice).toBeNull();
    expect(heap.runner.installed).toContain("hp-mim");

    const none = board();
    choose(none, "search-stack");
    choose(none, "choose-cards-done");
    expect(none.runner.installed).not.toContain("st-cor");
    expect(none.runner.installed).not.toContain("st-gb");
  });
});

// ---------------------------------------------------------------------------
// Fixes that read card JSON (paired cards release)
// ---------------------------------------------------------------------------

describe("Faerie", () => {
  it("is trashed when the encounter in which it broke a subroutine ends, before the run goes on (CR 9.6.5a, 1.2.1)", () => {
    let s = runnerTurn(fresh());
    installRunner(s, "faerie", "fae-1");
    installIce(s, "rototurret", "rt-1", "hq" as ServerId, true);
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, runIs("run.encounterPaw"));
    for (let i = 0; i < 2; i++) {
      const brk = legalActions(s).find(
        (a): a is Extract<Action, { type: "break_subroutine" }> =>
          a.type === "break_subroutine" && a.breakerId === "fae-1",
      );
      expect(brk).toBeDefined();
      s = must(s, brk!);
    }
    s = drive(s, (x) => !x.run || x.runner.discardPile.includes("fae-1"));
    expect(s.runner.discardPile).toContain("fae-1");
    expect(s.run).not.toBeNull();
  });

  it("is trashed when it broke a subroutine and the run then ends during that encounter, because the encounter ends with the run (CR 6.1.4)", () => {
    let s = runnerTurn(fresh());
    installRunner(s, "faerie", "fae-1");
    installRunner(s, "corroder", "cor-1");
    installIce(s, "rototurret", "rt-1", "hq" as ServerId, true);
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, runIs("run.encounterPaw"));
    // Break "Trash 1 program" only; "End the run" resolves.
    const brk = legalActions(s).find(
      (a): a is Extract<Action, { type: "break_subroutine" }> =>
        a.type === "break_subroutine" &&
        a.breakerId === "fae-1" &&
        a.subIndex === 0,
    );
    expect(brk).toBeDefined();
    s = must(s, brk!);
    s = drive(s, atRunnerAction);
    expect(s.run).toBeNull();
    expect(s.runner.discardPile).toContain("fae-1");
    expect(s.runner.installed).toContain("cor-1");
  });

  it("is trashed when it broke a subroutine and the encountered ice is then uninstalled, which ends the encounter (CR 8.5.10)", () => {
    let s = runnerTurn(fresh());
    installRunner(s, "faerie", "fae-1");
    installIce(s, "rototurret", "rt-1", "hq" as ServerId, true);
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, runIs("run.encounterPaw"));
    const brk = legalActions(s).find(
      (a): a is Extract<Action, { type: "break_subroutine" }> =>
        a.type === "break_subroutine" && a.breakerId === "fae-1",
    );
    s = must(s, brk!);
    // An effect returns the encountered ice to HQ mid-encounter.
    expect(uninstallCard(s, "rt-1", "hand")).toBe(true);
    s = drive(s, (x) => !x.run || x.runner.discardPile.includes("fae-1"));
    expect(s.runner.discardPile).toContain("fae-1");
  });

  it("stays installed when another breaker broke the subroutines in that encounter (CR 1.2.1)", () => {
    let s = runnerTurn(fresh());
    installRunner(s, "faerie", "fae-1");
    installRunner(s, "mimic", "mim-1");
    installIce(s, "rototurret", "rt-1", "hq" as ServerId, true);
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, runIs("run.encounterPaw"));
    for (let i = 0; i < 2; i++) {
      const brk = legalActions(s).find(
        (a): a is Extract<Action, { type: "break_subroutine" }> =>
          a.type === "break_subroutine" && a.breakerId === "mim-1",
      );
      expect(brk).toBeDefined();
      s = must(s, brk!);
    }
    s = drive(s, (x) => !x.run || x.timingKey === "run.jackOutWindow");
    expect(s.runner.installed).toContain("fae-1");
    expect(s.runner.installed).toContain("mim-1");
  });
});

describe("Sacrificial Construct", () => {
  it("prevents the trash of an installed program or piece of hardware, but is not offered for a resource (CR 9.9.3a)", () => {
    const resource = runnerTurn(fresh());
    installRunner(resource, "sacrificial-construct", "sc-1");
    installRunner(resource, "aesops-pawnshop", "ap-1");
    expect(maybeOpenTrashPrevent(resource, "ap-1", "corp")).toBe(false);

    const program = runnerTurn(fresh());
    installRunner(program, "sacrificial-construct", "sc-1");
    installRunner(program, "corroder", "cor-1");
    expect(maybeOpenTrashPrevent(program, "cor-1", "corp")).toBe(true);
    expect(
      legalActions(program).some(
        (a) => a.type === "use_paid_ability" && a.cardId === "sc-1",
      ),
    ).toBe(true);
  });
});

describe("Retrieval Run", () => {
  function successfulRun(): GameState {
    let s = runnerTurn(fresh());
    toHand(s, "runner", "retrieval-run", "rr-1");
    put(s, "corroder", "hp-cor", "runner:heap");
    s.runner.discardPile.push("hp-cor");
    const agenda = put(s, "hostile-takeover", "arc-ht", "corp:archives");
    agenda.faceup = true;
    s.corp.discardPile.push("arc-ht");
    s = must(s, {
      type: "play_event",
      cardId: "rr-1",
      serverId: "archives" as ServerId,
    });
    return drive(s, (x) => x.pendingChoice?.sourceId === "rr-1");
  }

  it("the Runner may breach Archives instead of installing, and then can steal its agenda (CR 1.2.1, 9.6.9)", () => {
    let s = successfulRun();
    expect(optionIds(s)).toEqual(["breach", "install:hp-cor"]);
    s = pick(s, "breach");
    s = drive(s, (x) => legalActions(x).some((a) => a.type === "steal_agenda"));
    expect(
      legalActions(s).some(
        (a) => a.type === "steal_agenda" && a.cardId === "arc-ht",
      ),
    ).toBe(true);
  });

  it("on a successful Archives run the Runner is offered the breach or each heap program it can install (CR 1.2.1)", () => {
    const s = runnerTurn(fresh());
    put(s, "retrieval-run", "rr-1", "runner:play-area");
    put(s, "corroder", "hp-cor", "runner:heap");
    put(s, "sure-gamble", "hp-sg", "runner:heap");
    s.runner.discardPile.push("hp-cor", "hp-sg");
    s.run = {
      attackedServerId: "archives",
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
    } as unknown as GameState["run"];
    coversKind("may_install_heap_program_instead_of_breach");
    const before = snapshot(s);
    evalAs(
      s,
      "rr-1",
      fx.do({ kind: "may_install_heap_program_instead_of_breach" }),
    );
    expectStateDelta(before, s, { "pendingChoice.sourceId": { to: "rr-1" } });
    expect(optionIds(s)).toEqual(["breach", "install:hp-cor"]);
  });

  it("installing a heap program ignoring all costs replaces the breach (CR 1.2.1)", () => {
    let s = successfulRun();
    const credits = s.runner.credits;
    s = pick(s, "install:hp-cor");
    expect(s.runner.installed).toContain("hp-cor");
    expect(s.runner.credits).toBe(credits);
    s = drive(s, atRunnerAction);
    expect(s.runner.scoreArea).not.toContain("arc-ht");
  });
});

describe("Burke Bugs", () => {
  it("a successful trace with no installed program does nothing, and the game goes on (CR 1.2.1)", () => {
    const s = fresh();
    installIce(s, "burke-bugs", "bb-1", "hq" as ServerId, true);
    s.runner.installed = [];
    const sub = s.cards["bb-1"]!.subroutines![0]!.effect;
    const success = (sub as { op: "do"; action: { onSuccess: Effect } }).action
      .onSuccess;
    evalAs(s, "bb-1", success);
    expect(s.pendingChoice).toBeNull();
  });

  it("with two programs installed, the Runner chooses which one to trash (CR 1.15.2)", () => {
    const s = fresh();
    installIce(s, "burke-bugs", "bb-1", "hq" as ServerId, true);
    installRunner(s, "corroder", "cor-1");
    installRunner(s, "gordian-blade", "gb-1");
    const sub = s.cards["bb-1"]!.subroutines![0]!.effect;
    const success = (sub as { op: "do"; action: { onSuccess: Effect } }).action
      .onSuccess;
    evalAs(s, "bb-1", success);
    expect(s.pendingTrashProgram?.chooser).toBe("runner");
    expect(s.pendingTrashProgram?.candidates).toEqual(["cor-1", "gb-1"]);
  });
});

describe("Burke Bugs (who trashes)", () => {
  it("the Runner carries out the trash, so a trash the Runner makes is what prevention sees (CR 1.14.5)", () => {
    const s = runnerTurn(fresh());
    installIce(s, "burke-bugs", "bb-1", "hq" as ServerId, true);
    installRunner(s, "sacrificial-construct", "sc-1");
    installRunner(s, "corroder", "cor-1");
    const sub = s.cards["bb-1"]!.subroutines![0]!.effect;
    const success = (sub as { op: "do"; action: { onSuccess: Effect } }).action
      .onSuccess;
    evalAs(s, "bb-1", success);
    expect(s.pendingTrashPrevent?.cardId).toBe("cor-1");
    expect(s.pendingTrashPrevent?.by).toBe("runner");
  });
});

describe("Compromised Employee and Dinosaurus", () => {
  it("Compromised Employee gives no link, which it does not print (CR 1.2.1)", () => {
    const s = fresh();
    recomputeRunnerLink(s);
    const base = s.runner.link;
    installRunner(s, "compromised-employee", "ce-1");
    recomputeRunnerLink(s);
    expect(s.runner.link).toBe(base);
  });

  it("Dinosaurus gives no extra memory, which it does not print (CR 1.2.1)", () => {
    const s = fresh();
    const base = memoryLimit(s);
    installRunner(s, "dinosaurus", "dino-1");
    expect(memoryLimit(s)).toBe(base);
  });
});

describe("Adonis Campaign, Eve Campaign and Private Contracts", () => {
  it("Adonis Campaign rezzed the normal way puts 12 credits on itself, as printed (CR 1.2.1)", () => {
    let s = corpTurn(fresh(), 10);
    installRoot(s, "adonis-campaign", "ad-1", false);
    s = must(corpPaw(s), { type: "rez_asset", cardId: "ad-1" });
    expect(s.cards["ad-1"]!.hostedCredits).toBe(12);
  });

  it("Eve Campaign and Private Contracts are trashed when their last credit is taken (CR 1.2.1)", () => {
    for (const [defId, take] of [
      ["eve-campaign", 2],
      ["private-contracts", 2],
    ] as const) {
      const s = fresh();
      const card = installRoot(s, defId, "camp-1");
      card.hostedCredits = 2;
      evalAs(s, "camp-1", fx.do({ kind: "take_hosted_credits", amount: take }));
      expect(s.corp.discardPile, defId).toContain("camp-1");
    }
  });
});

describe("Cortez Chip, The Helpful AI and Data Raven", () => {
  const windowsOf = (defId: string): GameState["cards"][string] => {
    const s = fresh();
    return put(s, defId, "x-1", "runner:installed");
  };

  it("Cortez Chip and The Helpful AI can be used in every paid ability window, the Corp's turn included (CR 9.2.7b)", () => {
    for (const defId of ["cortez-chip", "the-helpful-ai"]) {
      const ability = windowsOf(defId).paidAbilities![0]!;
      for (const paw of [
        "corp_action_paw",
        "runner_action_paw",
        "run_initiate_paw",
        "approach_paw",
        "encounter_paw",
        "run_movement_paw",
      ] as const) {
        expect(paidAbilityOpenIn(ability, paw), `${defId} ${paw}`).toBe(true);
      }
    }
  });

  it("Data Raven's hosted power counter can be spent in the Runner's turn outside a run (CR 9.2.7b)", () => {
    const ability = windowsOf("data-raven").paidAbilities![0]!;
    for (const paw of [
      "runner_action_paw",
      "corp_action_paw",
      "encounter_paw",
    ] as const) {
      expect(paidAbilityOpenIn(ability, paw), paw).toBe(true);
    }
  });
});
