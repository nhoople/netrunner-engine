/**
 * Security Nexus: "Once per turn → When you encounter a piece of ice, you may
 * have the Corp trace[5]. If successful, they give you 1 tag and end the run.
 * If unsuccessful, bypass the encountered ice."
 *
 * - The trace is a full trace attempt: the Corp spends, then the Runner
 *   (CR 10.8.2, 10.8.3, 10.8.6c–d). These tests avoid ties: the engine's
 *   resolveTrace treats a tie as success, which CR 10.8.4 does not.
 * - "When you encounter" is a conditional ability that meets its trigger
 *   condition when the encounter begins (CR 6.5.2, 6.9.3a), once per turn
 *   (CR 9.3.6g). It is not a paid ability usable in other windows.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  autoWalk,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  enterStep,
  instantiateCard,
  legalActions,
} from "../src/index.js";
import type { Action, GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.29");
});

function must(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok)
    throw new Error(`${result.error} ${JSON.stringify(result.cites)}`);
  return result.state;
}

/** Runner with Security Nexus encounters a rezzed Tollbooth on HQ. */
function encounterTollbooth(): GameState {
  const s = createInitialState();
  // The default fixture marks Marjanah rezzed (CR 8.1.4f); not part of this test.
  s.cards["runner-program-1"]!.rezzed = false;
  const booth = instantiateCard("tollbooth", "toll-1", "server:hq:ice");
  booth.rezzed = true;
  booth.faceup = true;
  const nexus = instantiateCard(
    "security-nexus",
    "nexus-1",
    "runner:installed",
  );
  s.cards["toll-1"] = booth;
  s.cards["nexus-1"] = nexus;
  s.runner.installed = ["nexus-1"];
  s.runner.link = 1;
  s.runner.credits = 10;
  s.corp.credits = 10;
  s.servers.hq.ice = ["toll-1"];
  s.run = {
    attackedServerId: "hq",
    phase: "encounter",
    position: 0,
    successful: null,
    accessedCardIds: [],
    accessCandidates: [],
    randomAccessLimit: null,
    encounter: null,
    endedTheRun: false,
    cannotJackOut: false,
    accessingCardId: null,
  };
  enterStep(s, "run.encounter");
  autoWalk(s);
  return s;
}

function nexusPaidAbilityOffered(s: GameState): boolean {
  return legalActions(s).some(
    (a) => a.type === "use_paid_ability" && a.cardId === "nexus-1",
  );
}

describe("Security Nexus trace (CR 10.8)", () => {
  it("lets the Corp spend for trace strength, then the Runner for link (CR 10.8.2–10.8.3)", () => {
    let s = encounterTollbooth();
    expect(s.pendingChoice?.options.map((o) => o.id)).toContain("nexus-trace");
    s = must(s, { type: "choose_option", optionId: "nexus-trace" });
    // The trace waits for both players to spend; it is not auto-resolved.
    expect(s.trace).toBeTruthy();
    expect(s.trace?.baseStrength).toBe(5);
    s = must(s, { type: "boost_trace", credits: 3 });
    expect(s.corp.credits).toBe(7);
    s = must(s, { type: "spend_link", amount: 2 });
    expect(s.runner.credits).toBe(10 - 2);
    // 8 trace strength vs 3 link: successful.
    s = must(s, { type: "resolve_trace" });
    expect(s.trace).toBeNull();
    expect(s.runner.tags).toBe(1);
    expect(s.run === null || s.run.endedTheRun).toBe(true);
    // Tollbooth's "when encountered" ability does not resolve (CR 6.8.2b).
    expect(s.runner.credits).toBe(8);
  });

  it("bypasses the ice when the Runner's link exceeds the trace strength", () => {
    let s = encounterTollbooth();
    s = must(s, { type: "choose_option", optionId: "nexus-trace" });
    expect(s.trace).toBeTruthy();
    s = must(s, { type: "boost_trace", credits: 0 });
    s = must(s, { type: "spend_link", amount: 6 });
    // 5 trace strength vs 7 link: unsuccessful, bypass Tollbooth.
    s = must(s, { type: "resolve_trace" });
    expect(s.trace).toBeNull();
    expect(s.runner.tags).toBe(0);
    expect(s.run?.bypassedIceIds ?? []).toContain("toll-1");
    // Bypassing aborts the encounter before Tollbooth charges 3 (CR 6.5.8a).
    expect(s.runner.credits).toBe(4);
    expect(s.log.join("\n")).not.toMatch(/pay 3/);
  });

  it("resolves Tollbooth after the Runner declines", () => {
    let s = encounterTollbooth();
    s = must(s, { type: "choose_option", optionId: "decline" });
    expect(s.trace ?? null).toBeNull();
    expect(s.runner.credits).toBe(7);
  });
});

describe("Security Nexus timing (CR 6.5.2, 6.9.3a, 9.3.6g)", () => {
  it("is not a paid ability in the encounter paid ability window", () => {
    let s = encounterTollbooth();
    s = must(s, { type: "choose_option", optionId: "decline" });
    expect(s.runner.credits).toBe(7);
    expect(nexusPaidAbilityOffered(s)).toBe(false);
    const r = applyAction(s, {
      type: "use_paid_ability",
      cardId: "nexus-1",
      abilityId: "security-nexus-trace",
    });
    expect(r.ok).toBe(false);
  });

  it("cannot be used during a run outside an encounter", () => {
    const s = createInitialState();
    const nexus = instantiateCard(
      "security-nexus",
      "nexus-1",
      "runner:installed",
    );
    s.cards["nexus-1"] = nexus;
    s.runner.installed = ["nexus-1"];
    s.run = {
      attackedServerId: "hq",
      phase: "movement",
      position: null,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      accessingCardId: null,
    };
    enterStep(s, "run.afterMovePaw");
    expect(nexusPaidAbilityOffered(s)).toBe(false);
    const r = applyAction(s, {
      type: "use_paid_ability",
      cardId: "nexus-1",
      abilityId: "security-nexus-trace",
    });
    expect(r.ok).toBe(false);
  });

  it("is offered only once per turn", () => {
    let s = encounterTollbooth();
    s = must(s, { type: "choose_option", optionId: "nexus-trace" });
    s = must(s, { type: "boost_trace", credits: 0 });
    s = must(s, { type: "spend_link", amount: 6 });
    s = must(s, { type: "resolve_trace" });
    expect(s.run?.bypassedIceIds ?? []).toContain("toll-1");
    // A second encounter the same turn: no offer.
    s.run!.bypassedIceIds = [];
    s.run!.encounter = null;
    s.pendingChoice = null;
    enterStep(s, "run.encounter");
    autoWalk(s);
    const offered =
      (s as GameState).pendingChoice?.options.map((o) => o.id) ?? [];
    expect(offered).not.toContain("nexus-trace");
  });

  it("is offered again later the same turn after a decline (CR 9.1.6b)", () => {
    let s = encounterTollbooth();
    s = must(s, { type: "choose_option", optionId: "decline" });
    expect(s.runner.credits).toBe(7);
    s.run!.encounter = null;
    s.pendingChoice = null;
    enterStep(s, "run.encounter");
    autoWalk(s);
    const offered =
      (s as GameState).pendingChoice?.options.map((o) => o.id) ?? [];
    expect(offered).toContain("nexus-trace");
  });

  it("cites the encounter-begins step on its offer", () => {
    const s = encounterTollbooth();
    expect(s.log.join("\n")).toMatch(
      /may trace at the start of this encounter \(CR 6\.9\.3a\)/,
    );
  });
});
