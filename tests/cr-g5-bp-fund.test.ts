/**
 * CR adherence G5: bad publicity fund fill at run initiation (11.4_1_b / 10.6.3a)
 * and clear at run ends (10.6.3b); spendable during the run (10.6.2).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertPinnedTag,
  createInitialState,
  CR,
  crDataPresent,
  runnerAvailableCredits,
  spendRunnerCredits,
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

describe("CR G5 — bad publicity fund (11.4_1_b / 10.6.2)", () => {
  it("cites resolve for BP fund rules", () => {
    expect(CR.badPublicityFund).toEqual({
      number: "10.6.2",
      id: "rule_bad_publicity_fund",
    });
    expect(CR.badPublicityBeginningRun).toEqual({
      number: "10.6.3a",
      id: "rule_bad_publicity_beginning_run",
    });
    expect(CR.badPublicityGoneInRunEnds).toEqual({
      number: "10.6.3b",
      id: "rule_bad_publicity_gone_in_run_ends_phase",
    });
  });

  it("fills fund from Corp BP at initiation and clears at run end", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.corp.badPublicity = 2;
    s.servers.archives.ice = [];
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;
    s.runner.credits = 0;

    s = must(s, { type: "basic_run", serverId: "archives" });
    // During or after the empty-archives run walk, fund was filled then cleared.
    expect(
      s.log.some((l) =>
        l.includes("Fill bad publicity fund with 2¢") &&
        l.includes("10.6.3a"),
      ),
    ).toBe(true);
    expect(
      s.log.some((l) =>
        l.includes("Return 2¢ from bad publicity fund") ||
        l.includes("Return") && l.includes("bad publicity fund"),
      ),
    ).toBe(true);
    expect(s.badPublicityFund).toBe(0);
    expect(s.run).toBeNull();
  });

  it("BP fund credits are available and spendable during a run", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.corp.badPublicity = 3;
    s.badPublicityFund = 3;
    s.runner.credits = 1;
    s.run = {
      attackedServerId: "hq",
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
    expect(runnerAvailableCredits(s)).toBe(4); // 1 bank + 3 BP
    spendRunnerCredits(s, 2);
    // Prefer BP fund before bank after other special pools.
    expect(s.badPublicityFund).toBe(1);
    expect(s.runner.credits).toBe(1);
    expect(
      s.log.some((l) => l.includes(CR.badPublicityFund.number)),
    ).toBe(true);
  });
});
