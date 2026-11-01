import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertPinnedTag,
  autoWalk,
  crDataPresent,
  createInitialState,
  effectiveBreakerStrength,
  instantiateCard,
} from "../src/index.js";
import type { GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) {
    throw new Error("Run `npm run fetch-cr` before tests.");
  }
  assertPinnedTag("v26.03");
});

function encounterBoard(withMantles: boolean): GameState {
  const s = createInitialState();
  const engine = instantiateCard("little-engine", "le-1", "server:hq:ice");
  engine.rezzed = true;
  engine.faceup = true;
  s.cards["le-1"] = engine;
  s.servers.hq.ice = ["le-1"];
  const houdini = instantiateCard("houdini", "hou-1", "runner:installed");
  s.cards["hou-1"] = houdini;
  s.runner.installed = ["hou-1"];
  if (withMantles) {
    for (const n of [1, 2]) {
      const mantle = instantiateCard("mantle", `man-${n}`, "runner:installed");
      // Recurring credits are placed when the card becomes active (CR 1.10.5b).
      mantle.recurringCredits = 1;
      s.cards[`man-${n}`] = mantle;
      s.runner.installed.push(`man-${n}`);
    }
  }
  s.runner.credits = 11;
  s.activeSide = "runner";
  s.timingKey = "run.approachIce";
  s.run = {
    attackedServerId: "hq",
    phase: "approach_ice",
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
  return s;
}

function toEncounterPaw(s: GameState): GameState {
  for (let i = 0; i < 40; i++) {
    if (s.timingKey === "run.encounterPaw") return s;
    autoWalk(s);
    if (s.timingKey === "run.encounterPaw") return s;
    const passed = applyAction(s, { type: "pass_window" });
    if (!passed.ok) {
      throw new Error(`pass_window refused at ${s.timingKey}: ${passed.error}`);
    }
    s = passed.state;
  }
  throw new Error(`Encounter PAW never opened (at ${s.timingKey})`);
}

function pump(s: GameState) {
  return applyAction(s, {
    type: "use_paid_ability",
    cardId: "hou-1",
    abilityId: "houdini-pump",
  });
}

describe("stealth credit costs", () => {
  it("Houdini pumps twice on Mantle's recurring credits and reaches 10 strength (CR 1.10.5a)", () => {
    let s = toEncounterPaw(encounterBoard(true));
    expect(s.cards["man-1"]?.recurringCredits).toBe(1);
    expect(s.cards["man-2"]?.recurringCredits).toBe(1);

    const first = pump(s);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    s = first.state;
    expect(effectiveBreakerStrength(s, "hou-1")).toBe(6);
    expect(s.cards["man-1"]?.recurringCredits).toBe(0);
    expect(s.runner.credits).toBe(10);

    const second = pump(s);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    s = second.state;
    expect(effectiveBreakerStrength(s, "hou-1")).toBe(10);
    expect(s.cards["man-2"]?.recurringCredits).toBe(0);
    expect(s.runner.credits).toBe(9);
  });

  it("Houdini cannot pump without a credit from a stealth card", () => {
    const s = toEncounterPaw(encounterBoard(false));
    const attempt = pump(s);
    expect(attempt.ok).toBe(false);
    expect(effectiveBreakerStrength(s, "hou-1")).toBe(2);
  });
});
