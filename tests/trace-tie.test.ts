/**
 * CR 10.8.4: a trace succeeds only if trace strength exceeds link strength.
 * When link strength is equal to or greater than trace strength, the trace
 * is unsuccessful and only "if unsuccessful" abilities fire.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertPinnedTag,
  autoResolveTrace,
  createInitialState,
  CR,
  crDataPresent,
  fx,
  runnerTraceLink,
  startTrace,
  traceStrength,
  traceSucceeds,
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

function fresh(link: number): GameState {
  const s = structuredClone(createInitialState());
  s.runner.link = link;
  s.runner.credits = 5;
  s.runner.tags = 0;
  s.corp.credits = 5;
  // The default fixture marks a Runner program rezzed; clear it so the
  // invariant check only sees what these traces do.
  for (const c of Object.values(s.cards)) {
    if (c.side === "runner") c.rezzed = false;
  }
  return s;
}

describe("CR 10.8.4 — trace vs link strength", () => {
  it("cites the comparison rule", () => {
    expect(CR.traceCompare).toEqual({
      number: "10.8.4",
      id: "rule_compare_trace_and_link_strength",
    });
  });

  it("traceSucceeds is true only when strength exceeds link", () => {
    expect(traceSucceeds(3, 2)).toBe(true);
    expect(traceSucceeds(3, 3)).toBe(false);
    expect(traceSucceeds(2, 3)).toBe(false);
    expect(traceSucceeds(0, 0)).toBe(false);
  });

  it("interactive trace: a tie is unsuccessful and fires only the failure ability", () => {
    let s = fresh(1);
    const credits = s.runner.credits;
    startTrace(s, "corp-id", 2, fx.giveTags(1), fx.gainCredits("runner", 1));
    s = must(s, { type: "boost_trace", credits: 1 });
    s = must(s, { type: "spend_link", amount: 2 });
    expect(traceStrength(s)).toBe(3);
    expect(runnerTraceLink(s)).toBe(3);
    s = must(s, { type: "resolve_trace" });
    expect(s.trace).toBeNull();
    expect(s.runner.tags).toBe(0);
    expect(s.runner.credits).toBe(credits - 2 + 1);
    expect(s.turn.lastTraceExcess).toBe(0);
    expect(s.log.some((l) => l.includes("→ failure") && l.includes("10.8.4"))).toBe(true);
  });

  it("interactive trace: one more strength than link succeeds", () => {
    let s = fresh(1);
    startTrace(s, "corp-id", 2, fx.giveTags(1), fx.gainCredits("runner", 1));
    s = must(s, { type: "boost_trace", credits: 1 });
    s = must(s, { type: "spend_link", amount: 1 });
    s = must(s, { type: "resolve_trace" });
    expect(s.runner.tags).toBe(1);
    expect(s.turn.lastTraceExcess).toBe(1);
  });

  it("autoResolveTrace: a tie is unsuccessful and fires only the failure ability", () => {
    const s = fresh(2);
    const credits = s.runner.credits;
    const r = autoResolveTrace(s, "corp-id", 2, fx.giveTags(1), fx.gainCredits("runner", 1));
    expect(r.ok).toBe(true);
    expect(s.trace).toBeNull();
    expect(s.runner.tags).toBe(0);
    expect(s.runner.credits).toBe(credits + 1);
  });

  it("autoResolveTrace: strength above link succeeds", () => {
    const s = fresh(1);
    const credits = s.runner.credits;
    const r = autoResolveTrace(s, "corp-id", 2, fx.giveTags(1), fx.gainCredits("runner", 1));
    expect(r.ok).toBe(true);
    expect(s.runner.tags).toBe(1);
    expect(s.runner.credits).toBe(credits);
  });

  it("a tie does not fire 'whenever there is a successful trace' (Aryabhata Tech)", () => {
    for (const [strength, fires] of [[1, false], [2, true]] as const) {
      const s = fresh(1);
      const hq = s.servers.hq!;
      s.cards["aryabhata"] = {
        ...structuredClone(s.cards[s.corp.identityId]!),
        id: "aryabhata",
        title: "Aryabhata Tech",
        type: "upgrade",
        rezzed: true,
        zone: "server:hq:root",
        onAnySuccessfulTraceGainAndRunnerLose: { gain: 1, lose: 1 },
      };
      hq.root.push("aryabhata");
      const corp = s.corp.credits;
      const r = autoResolveTrace(s, "corp-id", strength, fx.giveTags(1));
      expect(r.ok).toBe(true);
      expect(s.corp.credits).toBe(fires ? corp + 1 : corp);
      expect(s.runner.tags).toBe(fires ? 1 : 0);
    }
  });
});
