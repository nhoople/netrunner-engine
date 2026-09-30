/**
 * Trace Amount (ta) Effect IR / card-field primitives for v1.89.0.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  effectiveBreakerStrength,
  evalEffect,
  fx,
  instantiateCard,
  resolveTrace,
  runnerTrashCostForCard,
  spendLink,
  startTrace,
  validateEffectTree,
} from "../src/index.js";
import { fireAfterBreakSubroutineHooks, fireOnAnyIceRez } from "../src/effects/eval.js";
import type { Action, GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
});

function must(state: GameState, action: Action): GameState {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

function emptyRun(serverId = "hq"): GameState["run"] {
  return {
    attackedServerId: serverId as "hq",
    phase: "encounter",
    position: 0,
    successful: null,
    accessedCardIds: [],
    accessCandidates: [],
    accessRemaining: null,
    encounter: null,
    endedTheRun: false,
    cannotJackOut: false,
    strengthBoosts: {},
    encounterStrengthBoosts: {},
    iceStrengthBoosts: {},
    accessingCardId: null,
  };
}

describe("TA vamp_may_instead_of_breach", () => {
  it("validates and offers spend/skip-breach choices", () => {
    expect(validateEffectTree(fx.vampMayInsteadOfBreach())).toBeNull();
    let s = createInitialState();
    s = structuredClone(s);
    s.runner.credits = 3;
    s.corp.credits = 5;
    s.run = emptyRun("hq");
    const r = evalEffect(
      { state: s, sourceId: s.runner.identityId },
      fx.vampMayInsteadOfBreach(),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice).not.toBeNull();
    expect(s.pendingChoice!.options.some((o) => o.id === "vamp:2")).toBe(true);
    s = must(s, { type: "choose_option", optionId: "vamp:2" });
    expect(s.run?.skipBreach).toBe(true);
    expect(s.runner.credits).toBe(1);
    expect(s.corp.credits).toBe(3);
    expect(s.runner.tags).toBe(1);
  });
});

describe("TA expose_up_to", () => {
  it("offers decline and sequential exposes", () => {
    expect(validateEffectTree(fx.exposeUpTo(2))).toBeNull();
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("ice-wall", "iw-1", "server:hq:ice");
    ice.rezzed = false;
    ice.faceup = false;
    s.cards["iw-1"] = ice;
    s.servers.hq.ice = ["iw-1"];
    const r = evalEffect(
      { state: s, sourceId: s.runner.identityId },
      fx.exposeUpTo(2),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice).not.toBeNull();
    expect(s.pendingChoice!.options.some((o) => o.id === "decline")).toBe(true);
  });
});

describe("TA fireAfterBreakSubroutineHooks (e3 / Snowball)", () => {
  it("pumps Snowball strength and offers e3 may-pay break", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.runner.credits = 5;
    s.run = emptyRun("hq");
    const ice = instantiateCard("ice-wall", "iw-1", "server:hq:ice");
    ice.subroutines = [
      { id: "a", text: "End the run.", effect: { op: "do", action: { kind: "end_the_run" } } },
      { id: "b", text: "End the run.", effect: { op: "do", action: { kind: "end_the_run" } } },
    ];
    s.cards["iw-1"] = ice;
    s.servers.hq.ice = ["iw-1"];
    s.run!.encounter = { iceId: "iw-1", broken: [true, false] };

    const snow = instantiateCard("corroder", "sb-1", "runner:rig");
    snow.strengthBonusOnBreakSubForRun = 1;
    snow.breaker = { breaksSubtype: "barrier", strength: 2, breakCredits: 1 };
    s.cards["sb-1"] = snow;
    const e3 = instantiateCard("the-toolbox", "e3-1", "runner:rig");
    e3.onBreakSubroutineMayPayCreditsBreakAnother = { credits: 1 };
    s.cards["e3-1"] = e3;
    s.runner.rig = ["sb-1", "e3-1"];

    const before = effectiveBreakerStrength(s, "sb-1");
    fireAfterBreakSubroutineHooks(s, "sb-1");
    expect(s.run!.strengthBoosts["sb-1"]).toBe(1);
    expect(effectiveBreakerStrength(s, "sb-1")).toBe(before + 1);
    expect(s.pendingChoice).not.toBeNull();
    expect(s.pendingChoice!.sourceId).toBe("e3-1");
  });
});

describe("TA Compromised Employee host wiring", () => {
  it("spendLink uses trace recurring; fireOnAnyIceRez scans rig", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.runner.credits = 0;
    s.runner.link = 1;
    const emp = instantiateCard("access-to-globalsec", "ce-1", "runner:rig");
    emp.recurringCreditsMax = 1;
    emp.recurringCredits = 1;
    emp.recurringSpendFor = ["trace"];
    emp.onAnyIceRez = fx.gainCredits("runner", 1);
    s.cards["ce-1"] = emp;
    s.runner.rig = ["ce-1"];
    startTrace(s, "corp-id", 1, fx.giveTags(1));
    expect(spendLink(s, 1)).toBeNull();
    expect(emp.recurringCredits).toBe(0);
    expect(s.trace!.runnerLinkSpent).toBe(1);

    const ice = instantiateCard("ice-wall", "iw-1", "server:hq:ice");
    ice.rezzed = true;
    s.cards["iw-1"] = ice;
    s.servers.hq.ice = ["iw-1"];
    const before = s.runner.credits;
    fireOnAnyIceRez(s, "iw-1");
    expect(s.runner.credits).toBe(before + 1);
  });
});

describe("TA Encryption Protocol trash cost bonus", () => {
  it("raises runner trash cost while rezzed", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const asset = instantiateCard("pad-campaign", "pad-1", "server:remote1:root");
    asset.trashCost = 2;
    asset.rezzed = true;
    s.cards["pad-1"] = asset;
    s.servers.remote1 = {
      id: "remote1",
      kind: "remote",
      root: ["pad-1"],
      ice: [],
    };
    expect(runnerTrashCostForCard(s, "pad-1")).toBe(2);

    const enc = instantiateCard("pad-campaign", "ep-1", "server:hq:root");
    enc.installedCardsTrashCostBonus = 1;
    enc.rezzed = true;
    s.cards["ep-1"] = enc;
    s.servers.hq.root = ["ep-1"];
    expect(runnerTrashCostForCard(s, "pad-1")).toBe(3);
  });
});

describe("TA add_installed_program_to_stack_top / Sensei / PGO / Freelancer", () => {
  it("validates new IR kinds", () => {
    expect(validateEffectTree(fx.addInstalledProgramToStackTop())).toBeNull();
    expect(validateEffectTree(fx.senseiRegisterEtrOnOtherIceForRun())).toBeNull();
    expect(
      validateEffectTree(fx.trashHardwareInstallCostLteLastTraceExcess()),
    ).toBeNull();
    expect(validateEffectTree(fx.trashUpToNResources(2))).toBeNull();
  });

  it("stores lastTraceExcess and filters hardware by install cost", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.runner.link = 0;
    s.corp.credits = 5;
    const hw = instantiateCard("the-toolbox", "hw-1", "runner:rig");
    hw.installCost = 2;
    s.cards["hw-1"] = hw;
    const hw2 = instantiateCard("the-toolbox", "hw-2", "runner:rig");
    hw2.installCost = 9;
    s.cards["hw-2"] = hw2;
    s.runner.rig = ["hw-1", "hw-2"];
    startTrace(s, "corp-id", 5, fx.trashHardwareInstallCostLteLastTraceExcess());
    expect(resolveTrace(s).ok).toBe(true);
    expect(s.turn.lastTraceExcess).toBe(5);
    // Only hw-1 (install 2) is eligible; auto-trashed when sole candidate.
    expect(s.runner.rig).toEqual(["hw-2"]);
  });

  it("sensei registers run flag", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.run = emptyRun("hq");
    const ice = instantiateCard("ice-wall", "sensei-1", "server:hq:ice");
    s.cards["sensei-1"] = ice;
    s.servers.hq.ice = ["sensei-1"];
    const r = evalEffect(
      { state: s, sourceId: "sensei-1" },
      fx.senseiRegisterEtrOnOtherIceForRun(),
    );
    expect(r.ok).toBe(true);
    expect(s.run!.senseiEtrSourceIds).toEqual(["sensei-1"]);
  });

  it("trash_up_to_n_resources offers decline", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const res = instantiateCard("armitage-codebusting", "r-1", "runner:rig");
    s.cards["r-1"] = res;
    s.runner.rig = ["r-1"];
    const r = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      fx.trashUpToNResources(2),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice!.options.some((o) => o.id === "decline")).toBe(true);
  });
});

describe("TA ChiLo onSuccessfulTraceDuringRun from Corp root", () => {
  it("fires rezzed root card on successful trace during run", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.runner.link = 0;
    s.run = emptyRun("hq");
    const grid = instantiateCard("ash-2x3zb9cy", "chilo-1", "server:hq:root");
    grid.rezzed = true;
    grid.onSuccessfulTraceDuringRun = fx.giveTags(1);
    s.cards["chilo-1"] = grid;
    s.servers.hq.root = ["chilo-1"];
    startTrace(s, "corp-id", 5, {
      op: "do",
      action: { kind: "gain_credits", side: "corp", amount: 0 },
    });
    expect(resolveTrace(s).ok).toBe(true);
    expect(s.runner.tags).toBe(1);
  });
});
