/**
 * CR adherence G6 residual: discrete Run Ends Phase steps
 * (appendix 11.4_6_a–d / §6.8).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertPinnedTag,
  autoWalk,
  createInitialState,
  CR,
  crDataPresent,
  enterStep,
  RUN_STEPS,
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

describe("CR G6 residual — Run Ends Phase (11.4_6_a–d)", () => {
  it("cites and RUN_STEPS resolve for 11.4_6_a–d / §6.8", () => {
    expect(CR.runEndsClosePriorityWindows).toEqual({
      number: "6.8.2",
      id: "rule_run_ends_process_priority_windows",
    });
    expect(CR.runEndsLoseBadPubCredits).toEqual({
      number: "6.8.3",
      id: "rule_run_ends_lose_bad_pub_credits",
    });
    expect(CR.unsuccessfulRun).toEqual({
      number: "6.8.4",
      id: "rule_unsuccessful_run",
    });
    expect(CR.runEndsCondition).toEqual({
      number: "6.8.5",
      id: "rule_run_ends_condition",
    });
    expect(CR.runEndsAppendixA.number).toBe("11.4_6_a");
    expect(CR.runEndsAppendixB.number).toBe("11.4_6_b");
    expect(CR.runEndsAppendixC.number).toBe("11.4_6_c");
    expect(CR.runEndsAppendixD.number).toBe("11.4_6_d");
    expect(RUN_STEPS.closePriorityWindows.stepNumber).toBe("11.4_6_a");
    expect(RUN_STEPS.emptyBpFund.stepNumber).toBe("11.4_6_b");
    expect(RUN_STEPS.declareUnsuccessful.stepNumber).toBe("11.4_6_c");
    expect(RUN_STEPS.runEnds.stepNumber).toBe("11.4_6_d");
  });

  it("unsuccessful empty-archives run walks 11.4_6_a→b→c→d and empties BP on _b", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.corp.badPublicity = 2;
    s.servers.archives.ice = [];
    // Put a card in archives so breach has something, then jack out before
    // success — simpler: force endedTheRun via jack-out on empty ice with
    // a successful path that we abort. Use basic_run on archives (empty ice)
    // which auto-succeeds and breaches; instead inject mid-run jack-out.
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;
    s.runner.credits = 5;

    // Start run; with no ice it walks to success/breach. For unsuccessful
    // walk, jack out from movement — archives empty ice goes straight to
    // approach/success. Use forced unsuccessful via ETR-style: set up a run
    // that ends without success by jacking out after beginning with ice.
    s.servers.hq.ice = [];
    // Actually: run archives with empty ice succeeds. To get unsuccessful,
    // add a trivial ETR ice that is rezzed.
    // Simpler path: start run on archives, let it complete successful, and
    // separately test unsuccessful via jack_out on a synthetic run.
    s.run = {
      attackedServerId: "archives",
      phase: "movement",
      position: 0,
      successful: false,
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
    s.badPublicityFund = 2;
    s.timingKey = "run.jackOutWindow";
    s = must(s, { type: "jack_out" });

    const log = s.log.join("\n");
    expect(log).toMatch(/11\.4_6_a/);
    expect(log).toMatch(/11\.4_6_b/);
    expect(log).toMatch(/11\.4_6_c/);
    expect(log).toMatch(/11\.4_6_d/);
    expect(log).toMatch(/Return 2¢ from bad publicity fund/);
    expect(log).toMatch(/Run declared unsuccessful/);
    expect(s.badPublicityFund).toBe(0);
    expect(s.run).toBeNull();

    const a = s.log.findIndex((l) => l.includes("11.4_6_a"));
    const b = s.log.findIndex((l) => l.includes("11.4_6_b"));
    const c = s.log.findIndex((l) => l.includes("11.4_6_c"));
    const d = s.log.findIndex((l) => l.includes("11.4_6_d"));
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(d).toBeGreaterThan(c);
  });

  it("Crisium-class null success is not declared unsuccessful on 11.4_6_c", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.run = {
      attackedServerId: "hq",
      phase: "ends",
      position: null,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: null,
      endedTheRun: true,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    s.badPublicityFund = 0;
    s.activeSide = "runner";
    enterStep(s, "run.closePriorityWindows");
    autoWalk(s);

    expect(
      s.log.some(
        (l) =>
          l.includes("not declared unsuccessful") && l.includes("6.8.4a"),
      ),
    ).toBe(true);
    expect(s.log.some((l) => l.includes("Run declared unsuccessful"))).toBe(
      false,
    );
    expect(
      s.log.some(
        (l) =>
          l.includes("neither successful nor unsuccessful") &&
          l.includes("11.4_6_d"),
      ),
    ).toBe(true);
    expect(s.run).toBeNull();
  });
});
