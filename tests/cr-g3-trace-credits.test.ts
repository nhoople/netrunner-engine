/**
 * CR adherence G3: Runner spends credits (not link rating) to raise
 * link strength during a trace (CR 10.8.3 / 10.8.6d).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertPinnedTag,
  createInitialState,
  CR,
  crDataPresent,
  fx,
  legalActions,
  startTrace,
  runnerTraceLink,
  traceStrength,
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

describe("CR G3 — trace Runner spends credits (10.8.3)", () => {
  it("cites resolve for link strength / runner spend step", () => {
    expect(CR.linkStrength).toEqual({
      number: "10.8.3",
      id: "rule_link_strength",
    });
    expect(CR.traceRunnerSpendCredits).toEqual({
      number: "10.8.6d",
      id: "step_trace_runner_spend_credits",
    });
  });

  it("Runner spend_link deducts credits and raises link strength", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.runner.link = 1;
    s.runner.credits = 4;
    s.corp.credits = 5;
    startTrace(s, "corp-id", 2, fx.giveTags(1), fx.gainCredits("runner", 1));

    expect(legalActions(s).some((a) => a.type === "spend_link" && a.amount === 3)).toBe(
      true,
    );
    // Budget is credits, not link rating — link=1 must not cap spends at 1.
    expect(
      legalActions(s).filter((a) => a.type === "spend_link").map((a) =>
        a.type === "spend_link" ? a.amount : -1,
      ),
    ).toEqual([0, 1, 2, 3, 4]);

    s = must(s, { type: "boost_trace", credits: 1 });
    expect(traceStrength(s)).toBe(3);
    expect(s.corp.credits).toBe(4);

    s = must(s, { type: "spend_link", amount: 3 });
    expect(s.runner.credits).toBe(1);
    expect(runnerTraceLink(s)).toBe(4); // link 1 + 3¢
    expect(
      s.log.some((l) => l.includes(CR.linkStrength.number)),
    ).toBe(true);

    s = must(s, { type: "resolve_trace" });
    // strength 3 < link 4 → failure → runner gains 1¢
    expect(s.trace).toBeNull();
    expect(s.runner.tags).toBe(0);
    expect(s.runner.credits).toBe(2);
  });

  it("cannot spend more credits than the Runner has", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.runner.link = 5;
    s.runner.credits = 1;
    startTrace(s, "corp-id", 0, fx.giveTags(1));
    const r = applyAction(s, { type: "spend_link", amount: 2 });
    expect(r.ok).toBe(false);
  });
});
