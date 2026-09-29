/**
 * CR adherence optional: Formicary-class interactive 6.8.2c completion
 * (rez + move innermost allowed; encounter / new timing structures blocked).
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
  fx,
  legalActions,
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

function formicaryCard(id: string, zone: string) {
  return {
    id,
    defId: "formicary-fixture",
    title: "Formicary",
    type: "ice" as const,
    side: "corp" as const,
    zone,
    faceup: false,
    rezzed: false,
    installCost: 2,
    rezCost: 5,
    strength: 2,
    subtypes: ["sentry"],
    subroutines: [
      {
        id: "formicary-etr",
        text: "End the run.",
        effect: fx.do({ kind: "end_the_run" as const }),
      },
    ],
    paidAbilities: [
      {
        id: "formicary-approach",
        label: "Rez (−2), move innermost, encounter",
        clickCost: 0,
        creditCost: 0,
        windows: ["other_priority_window" as const],
        effect: fx.formicaryRezMoveInnermost(2),
      },
    ],
  };
}

describe("CR optional — Formicary interactive 6.8.2c", () => {
  it("exposes completeOtherPriorityWindows on the Run Ends chain", () => {
    expect(RUN_STEPS.completeOtherPriorityWindows.stepNumber).toBe("11.4_6_a");
    expect(CR.runEndsOtherPriorityWindows).toEqual({
      number: "6.8.2c",
      id: "rule_run_ends_other_priority_windows",
    });
  });

  it("lets Corp rez+move Formicary during 6.8.2c but blocks encounter (6.8.2c.ex1)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.corp.credits = 10;
    // Formicary protecting Archives; Runner approached HQ then ETR mid-pending.
    s.cards["form-1"] = formicaryCard("form-1", "server:archives:ice");
    s.servers.archives.ice = ["form-1"];
    // Existing ice on HQ so innermost move is observable.
    s.cards["wall-1"] = {
      id: "wall-1",
      defId: "ice-wall",
      title: "Ice Wall",
      type: "ice",
      side: "corp",
      zone: "server:hq:ice",
      faceup: true,
      rezzed: true,
      installCost: 1,
      rezCost: 1,
      strength: 1,
      subtypes: ["barrier"],
      subroutines: [],
    };
    s.servers.hq.ice = ["wall-1"];

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
        id: "pw-formicary",
        stepKey: "run.formicaryPending",
        nestDepth: 0,
        consecutivePasses: 0,
        priorityHolder: "corp",
        checkpointId: "",
      },
    ];

    enterStep(s, "run.closePriorityWindows");
    autoWalk(s);

    expect(s.timingKey).toBe("run.completeOtherPriorityWindows");
    expect(s.run!.forbidNewTimingStructures).toBe(true);
    expect(s.priorityStack).toHaveLength(1);
    expect(s.priorityStack[0]!.stepKey).toBe("run.formicaryPending");
    expect(s.log.join("\n")).toMatch(/6\.8\.2c/);

    expect(
      legalActions(s).some(
        (a) =>
          a.type === "use_paid_ability" &&
          a.cardId === "form-1" &&
          a.abilityId === "formicary-approach",
      ),
    ).toBe(true);

    s = must(s, {
      type: "use_paid_ability",
      cardId: "form-1",
      abilityId: "formicary-approach",
    });

    expect(s.cards["form-1"]!.rezzed).toBe(true);
    expect(s.servers.archives.ice).not.toContain("form-1");
    expect(s.servers.hq.ice).toEqual(["wall-1", "form-1"]);
    expect(s.corp.credits).toBe(7); // 5 − 2 discount
    // Encounter / position move blocked (CR 6.8.2c.ex1).
    expect(s.run!.encounter).toBeNull();
    expect(s.run!.position).toBeNull();
    expect(s.run!.reencounterIceId).toBeUndefined();
    expect(s.log.join("\n")).toMatch(
      /Cannot move Runner position or initiate encounter/,
    );

    s = must(s, { type: "pass_window" });
    expect(s.priorityStack.every((pw) => pw.stepKey !== "run.formicaryPending")).toBe(
      true,
    );
    expect(s.run).toBeNull();
    expect(s.log.join("\n")).toMatch(
      /Complete open priority window @ run\.formicaryPending without new structures \(CR 6\.8\.2c/,
    );
  });
});
