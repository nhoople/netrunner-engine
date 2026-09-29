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
  ensurePriorityWindow,
  fx,
  instantiateCard,
  legalActions,
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

  it("Nisei ETR during approach PAW closes the PAW under 6.8.2a at 11.4_6_a", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.activeSide = "corp";
    s.timingKey = "run.approachPaw";
    s.run = {
      attackedServerId: "hq",
      phase: "approach",
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
    // Open the approach PAW frame as the live host would.
    ensurePriorityWindow(s);
    expect(s.priorityStack.length).toBe(1);
    expect(s.priorityStack[0]!.stepKey).toBe("run.approachPaw");

    const nisei = instantiateCard("nisei-mk-ii", "nisei-1", "corp:score");
    nisei.agendaCounters = 1;
    s.cards["nisei-1"] = nisei;
    s.corp.score = ["nisei-1"];

    // SMC-class paid ability that would be illegal after PAW close (Runner
    // must not get another PAW act after Nisei ETR — CR 6.8.2a example).
    s.cards["smc"] = {
      id: "smc",
      defId: "self-modifying-code-fixture",
      title: "SMC Fixture",
      type: "program",
      side: "runner",
      zone: "runner:rig",
      faceup: true,
      rezzed: true,
      installCost: 0,
      paidAbilities: [
        {
          id: "smc-search",
          label: "search",
          clickCost: 0,
          creditCost: 2,
          windows: ["approach_paw", "encounter_paw"],
          effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
        },
      ],
    };
    s.runner.rig = ["smc"];
    s.runner.credits = 5;
    s.badPublicityFund = 1;

    expect(
      legalActions(s).some(
        (a) =>
          a.type === "use_paid_ability" &&
          a.cardId === "nisei-1" &&
          a.abilityId === "nisei-etr",
      ),
    ).toBe(true);

    s = must(s, {
      type: "use_paid_ability",
      cardId: "nisei-1",
      abilityId: "nisei-etr",
    });

    expect(s.run).toBeNull();
    expect(s.cards["nisei-1"]!.agendaCounters).toBe(0);
    // Approach PAW frame must be gone (action PAW after run-return may open).
    expect(s.priorityStack.every((pw) => pw.stepKey !== "run.approachPaw")).toBe(
      true,
    );

    const log = s.log.join("\n");
    expect(log).toMatch(/11\.4_6_a/);
    expect(log).toMatch(/6\.8\.2a/);
    expect(log).toMatch(/Close paid ability window @ run\.approachPaw/);
    // Runner SMC is not offered after ETR drainage.
    expect(
      legalActions(s).some(
        (a) =>
          a.type === "use_paid_ability" &&
          a.cardId === "smc",
      ),
    ).toBe(false);
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
      accessRemaining: null,
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
