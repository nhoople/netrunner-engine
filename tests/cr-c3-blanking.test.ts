/**
 * CR adherence C3: blanking / Mayfly delayed trash lock-in
 * (CR 9.12 Hush×Magnet via practical solver; 6.8.5 / 9.6.13 Mayfly at run complete).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  abilitiesSuppressed,
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
  assertCardsPinnedTag("v1.65.0");
});

describe("CR C3 — blanking / Mayfly", () => {
  it("Hush on Magnet still blanks Magnet abilities (9.12 Hush-wins)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const magnet = instantiateCard("magnet", "mag-1", "server:hq:ice");
    magnet.rezzed = true;
    magnet.hostedProgramsLoseAbilities = true;
    s.cards["mag-1"] = magnet;
    s.servers.hq.ice = ["mag-1"];
    const hush = instantiateCard("hush", "hush-1", "runner:rig");
    hush.hostId = "mag-1";
    hush.blanksHostAbilities = true;
    hush.abilitiesBlanked = true; // Magnet would set this; solver must prefer Hush.
    s.cards["hush-1"] = hush;
    s.runner.rig = ["hush-1"];
    // Magnet would blank hosted programs, but Hush blanks Magnet itself —
    // abilitiesSuppressed on Magnet must still be true via Hush; Hush stays live.
    expect(abilitiesSuppressed(s, "mag-1")).toBe(true);
    expect(abilitiesSuppressed(s, "hush-1")).toBe(false);
    // Printed subs still present on Magnet (blanking does not remove them).
    expect((s.cards["mag-1"].subroutines ?? []).length).toBeGreaterThan(0);
  });

  it("Mayfly trashes at run complete (11.4_6_d) after breaking this run", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const mayfly = instantiateCard("mayfly", "mf-1", "runner:rig");
    mayfly.trashAfterBreakingThisRun = true;
    s.cards["mf-1"] = mayfly;
    s.runner.rig = ["mf-1"];
    s.run = {
      attackedServerId: "archives",
      phase: "ends",
      position: null,
      successful: true,
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
      breakersThatBroke: ["mf-1"],
    };
    enterStep(s, "run.closePriorityWindows");
    autoWalk(s);
    expect(s.runner.rig).not.toContain("mf-1");
    expect(s.runner.discard).toContain("mf-1");
    expect(
      s.log.some((l) => l.includes("Mayfly") && l.includes("trashed")),
    ).toBe(true);
    expect(s.run).toBeNull();
  });
});
