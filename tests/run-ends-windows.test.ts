/**
 * CR adherence optional: fuller 11.4_6_a multi-window drainage (CR 6.8.2a–c)
 * when ETR leaves open priority windows (Nisei-class).
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

describe("CR optional — 11.4_6_a multi-window drainage (6.8.2a–c)", () => {
  it("cites resolve for 6.8.2a–c", () => {
    expect(CR.runEndsClosePaws).toEqual({
      number: "6.8.2a",
      id: "rule_run_ends_close_paws",
    });
    expect(CR.runEndsCloseReactionWindow).toEqual({
      number: "6.8.2b",
      id: "rule_run_ends_close_reaction_window",
    });
    expect(CR.runEndsOtherPriorityWindows).toEqual({
      number: "6.8.2c",
      id: "rule_run_ends_other_priority_windows",
    });
  });

  it("routes stacked non-PAW frames to interactive 6.8.2c completion", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.run = {
      attackedServerId: "hq",
      phase: "ends",
      position: null,
      successful: false,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: true,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    s.priorityStack = [
      {
        id: "pw-other",
        stepKey: "run.formicaryPending",
        nestDepth: 0,
        consecutivePasses: 0,
        priorityHolder: "corp",
        checkpointId: "",
      },
      {
        id: "pw-paw",
        stepKey: "run.approachServerPaw",
        nestDepth: 1,
        consecutivePasses: 0,
        priorityHolder: "corp",
        checkpointId: "",
      },
    ];
    enterStep(s, "run.closePriorityWindows");
    autoWalk(s);

    const log = s.log.join("\n");
    expect(log).toMatch(/Close paid ability window @ run\.approachServerPaw \(CR 6\.8\.2a/);
    expect(log).toMatch(/Open priority window\(s\) remain for completion without new structures \(CR 6\.8\.2c/);
    expect(s.timingKey).toBe("run.completeOtherPriorityWindows");
    expect(s.run!.forbidNewTimingStructures).toBe(true);
    expect(s.priorityStack).toHaveLength(1);
    expect(s.priorityStack[0]!.stepKey).toBe("run.formicaryPending");

    s = must(s, { type: "pass_window" });
    expect(s.log.join("\n")).toMatch(
      /Complete open priority window @ run\.formicaryPending without new structures \(CR 6\.8\.2c/,
    );
    expect(s.priorityStack.every((pw) => pw.stepKey !== "run.formicaryPending")).toBe(
      true,
    );
    expect(s.run).toBeNull();
  });
});
