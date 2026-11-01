import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  autoWalk,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  instantiateCard,
} from "../src/index.js";
import type { GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.15");
});

function brainstormExtras(s: GameState): number {
  return (s.cards["bs-1"]?.subroutines ?? []).filter((sub) =>
    sub.id.startsWith("brainstorm-core-"),
  ).length;
}

function setupRun(s: GameState): GameState {
  const bs = instantiateCard("brainstorm", "bs-1", "server:hq:ice");
  bs.rezzed = true;
  bs.faceup = true;
  s.cards["bs-1"] = bs;
  s.servers.hq.ice = ["bs-1"];
  for (let i = 0; i < 6; i++) {
    const c = instantiateCard("sure-gamble", `grip-${i}`, "runner:hand");
    s.cards[`grip-${i}`] = c;
  }
  s.runner.hand = ["grip-0", "grip-1", "grip-2", "grip-3", "grip-4", "grip-5"];
  s.corp.hand = [];
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
  } as GameState["run"];
  return s;
}

function driveToEncounter(s: GameState): GameState {
  for (let i = 0; i < 40; i++) {
    autoWalk(s);
    if (s.log.some((line) => line.includes("gains 3 \"Do 1 core damage.\""))) {
      return s;
    }
    const passed = applyAction(s, { type: "pass_window" });
    if (!passed.ok) break;
    s = passed.state;
  }
  return s;
}

describe("Brainstorm run-scoped subroutines", () => {
  it("gains X = grip size per run, not cumulatively across runs", () => {
    let s = setupRun(createInitialState());
    s.runner.hand = ["grip-0", "grip-1", "grip-2"];
    s = driveToEncounter(s);
    expect(brainstormExtras(s)).toBe(3);

    // Finish the run: keep passing windows until the run state clears.
    for (let i = 0; i < 60 && s.run; i++) {
      autoWalk(s);
      if (!s.run) break;
      const passed = applyAction(s, { type: "pass_window" });
      if (!passed.ok) break;
      s = passed.state;
    }
    expect(s.run).toBeNull();
    // The gained subroutines lasted only for the remainder of that run.
    expect(brainstormExtras(s)).toBe(0);

    // Second encounter with the same ice instance (fresh harness, same
    // card object): exactly X again, not 2X.
    const usedIce = s.cards["bs-1"]!;
    const s2 = setupRun(createInitialState());
    s2.cards["bs-1"] = usedIce;
    s2.runner.hand = ["grip-3", "grip-4", "grip-5"];
    const after = driveToEncounter(s2);
    expect(brainstormExtras(after)).toBe(3);
  });
});
