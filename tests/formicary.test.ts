/**
 * CR adherence optional: Formicary-class interactive 6.8.2c completion
 * (rez + move innermost allowed; encounter / new timing structures blocked).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertPinnedTag,
  autoWalk,
  createInitialState,
  CR,
  crDataPresent,
  cardsDataPresent,
  instantiateCard,
  legalActions,
  RUN_STEPS,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
});

describe("CR optional — Formicary interactive 6.8.2c", () => {
  it("exposes completeOtherPriorityWindows on the Run Ends chain", () => {
    expect(RUN_STEPS.completeOtherPriorityWindows.stepNumber).toBe("11.4_6_a");
    expect(CR.runEndsOtherPriorityWindows).toEqual({
      number: "6.8.2c",
      id: "rule_run_ends_other_priority_windows",
    });
  });

  it("offers unrezzed Formicary when the Runner approaches a server", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const form = instantiateCard("formicary", "form-1", "server:archives:ice");
    form.rezzed = false;
    form.faceup = false;
    s.cards["form-1"] = form;
    s.servers.archives.ice = ["form-1"];
    s.corp.credits = 10;
    s.run = {
      attackedServerId: "hq",
      phase: "movement",
      position: null,
      successful: false,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      accessingCardId: null,
    };
    s.timingKey = "run.afterMove";
    autoWalk(s);
    expect(s.timingKey).toBe("run.approachServerPaw");
    expect(
      legalActions(s).some(
        (a) =>
          a.type === "use_paid_ability" &&
          a.cardId === "form-1" &&
          a.abilityId === "formicary-approach",
      ),
    ).toBe(true);
  });
});

