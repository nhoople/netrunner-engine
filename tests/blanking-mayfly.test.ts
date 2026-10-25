/**
 * CR adherence C3: blanking / Mayfly delayed trash lock-in
 * (CR 9.12 Hush×Magnet via practical solver; 6.8.5 / 9.6.13 Mayfly at run complete).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertPinnedTag,
  autoWalk,
  createInitialState,
  crDataPresent,
  enterStep,
  cardsDataPresent,
  assertCardsPinnedTag,
  instantiateCard,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.13");
});

describe("CR C3 — blanking / Mayfly", () => {

  it("Mayfly trashes at run complete (11.4_6_d) after breaking this run", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const mayfly = instantiateCard("mayfly", "mf-1", "runner:installed");
    mayfly.trashAfterBreakingThisRun = true;
    s.cards["mf-1"] = mayfly;
    s.runner.installed = ["mf-1"];
    s.run = {
      attackedServerId: "archives",
      phase: "ends",
      position: null,
      successful: true,
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
      breakersThatBroke: ["mf-1"],
    };
    enterStep(s, "run.closePriorityWindows");
    autoWalk(s);
    expect(s.runner.installed).not.toContain("mf-1");
    expect(s.runner.discardPile).toContain("mf-1");
    expect(
      s.log.some((l) => l.includes("Mayfly") && l.includes("trashed")),
    ).toBe(true);
    expect(s.run).toBeNull();
  });
});
