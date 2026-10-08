/**
 * Shared nested cost "unless" (CR 1.16.11b).
 * An unpayable cost resolves the instruction (CR 1.16.1b for tags).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertPinnedTag,
  createInitialState,
  CR,
  crDataPresent,
  evalEffect,
  fx,
  validateEffectTree,
} from "../src/index.js";
import type { Action, GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  assertPinnedTag("v26.03");
});

function must(state: GameState, action: Action): GameState {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

function withRun(credits = 5): GameState {
  const s = structuredClone(createInitialState());
  s.runner.credits = credits;
  s.run = {
    attackedServerId: "hq",
    phase: "encounter",
    position: 0,
    successful: null,
    accessedCardIds: [],
    accessCandidates: [],
    accessRemaining: null,
    encounter: {
      iceId: "ice-1",
      broken: [false],
      strengthBoost: 0,
    },
    endedTheRun: false,
    accessingCardId: null,
  };
  s.cards["ice-1"] = {
    id: "ice-1",
    defId: "ice-1",
    title: "Unless Ice",
    type: "ice",
    side: "corp",
    zone: "hq:ice",
    faceup: true,
    rezzed: true,
  };
  return s;
}

describe("nested cost unless (CR 1.16.11b)", () => {
  it("cites the nested-cost rules", () => {
    expect(CR.nestedCostUnless.number).toBe("1.16.11b");
    expect(CR.costInterruptStaticMandatory.number).toBe("1.16.1b");
  });

  it("paying the cost does not resolve the instruction", () => {
    let s = withRun(5);
    const r = evalEffect(
      { state: s, sourceId: "ice-1" },
      fx.do({
        kind: "unless",
        payer: "runner",
        cost: fx.do({ kind: "lose_credits", side: "runner", amount: 1 }),
        instruction: fx.do({ kind: "end_the_run" }),
      }),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice?.options.map((o) => o.id).sort()).toEqual([
      "unless-instruction",
      "unless-pay",
    ]);
    s = must(s, { type: "choose_option", optionId: "unless-pay" });
    expect(s.runner.credits).toBe(4);
    expect(s.run?.endedTheRun).toBe(false);
  });

  it("declining the cost resolves the instruction", () => {
    let s = withRun(5);
    evalEffect(
      { state: s, sourceId: "ice-1" },
      fx.do({
        kind: "unless",
        payer: "runner",
        cost: fx.do({ kind: "lose_credits", side: "runner", amount: 1 }),
        instruction: fx.do({ kind: "end_the_run" }),
      }),
    );
    s = must(s, { type: "choose_option", optionId: "unless-instruction" });
    expect(s.runner.credits).toBe(5);
    expect(s.run).toBeFalsy();
  });

  it("resolves the instruction when the cost cannot be paid", () => {
    const s = withRun(0);
    const r = evalEffect(
      { state: s, sourceId: "ice-1" },
      fx.do({
        kind: "unless",
        payer: "runner",
        cost: fx.do({ kind: "lose_credits", side: "runner", amount: 1 }),
        instruction: fx.do({ kind: "end_the_run" }),
      }),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice).toBeFalsy();
    expect(s.run?.endedTheRun).toBe(true);
  });

  it("treats an empty cost as paid", () => {
    const s = withRun(5);
    const r = evalEffect(
      { state: s, sourceId: "ice-1" },
      fx.do({
        kind: "unless",
        payer: "runner",
        cost: fx.do({ kind: "lose_credits", side: "runner", amount: 0 }),
        instruction: fx.do({ kind: "end_the_run" }),
      }),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice).toBeFalsy();
    expect(s.run?.endedTheRun).toBe(false);
  });

  it("resolves the instruction when a tag cost is unpayable (CR 1.16.1b)", () => {
    const s = withRun(5);
    s.cards[s.runner.identityId]!.preventFirstTagThisTurn = true;
    s.turn.tagsGivenThisTurn = 0;
    const r = evalEffect(
      { state: s, sourceId: "ice-1" },
      fx.do({
        kind: "unless",
        payer: "runner",
        cost: fx.do({ kind: "give_tags", amount: 1 }),
        instruction: fx.do({ kind: "end_the_run" }),
      }),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice).toBeFalsy();
    expect(s.runner.tags).toBe(0);
    expect(s.run?.endedTheRun).toBe(true);
  });

  it("treats a credit payment primitive as the nested cost", () => {
    const s = withRun(0);
    const r = evalEffect(
      { state: s, sourceId: "ice-1" },
      fx.do({
        kind: "unless",
        payer: "runner",
        cost: fx.do({ kind: "runner_pay_credits", amount: 1 }),
        instruction: fx.do({ kind: "end_the_run" }),
      }),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice).toBeFalsy();
    expect(s.run?.endedTheRun).toBe(true);
  });

  it("fails closed on a cost that is not a nested payment", () => {
    const s = withRun(5);
    const r = evalEffect(
      { state: s, sourceId: "ice-1" },
      fx.do({
        kind: "unless",
        payer: "runner",
        cost: fx.do({ kind: "draw", side: "runner", amount: 1 }),
        instruction: fx.do({ kind: "end_the_run" }),
      }),
    );
    expect(r.ok).toBe(false);
    expect(s.run?.endedTheRun).toBe(false);
  });

  it("rejects an unknown primitive nested in the cost", () => {
    const err = validateEffectTree({
      op: "do",
      action: {
        kind: "unless",
        payer: "runner",
        cost: { op: "do", action: { kind: "not_a_real_cost" } },
        instruction: { op: "do", action: { kind: "end_the_run" } },
      },
    });
    expect(err).toMatch(/not_a_real_cost/);
  });
});
