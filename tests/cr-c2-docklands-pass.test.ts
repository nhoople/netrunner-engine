/**
 * CR adherence C2: Docklands Pass via field, not defId hardcode (CR 7.4.2).
 */
import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/index.js";
import { instantiateCard } from "../src/cards/load.js";
import { beginBreachAccess } from "../src/state/access.js";

describe("CR C2 — Docklands Pass field-driven HQ bonus", () => {
  it("loads bonusAccessOnFirstHqBreachThisTurn from card def", () => {
    const card = instantiateCard("docklands-pass", "dp-1", "runner:rig");
    expect(card.bonusAccessOnFirstHqBreachThisTurn).toBe(1);
  });

  it("grants +1 on first HQ breach only (defId-agnostic field)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    // Fixture with the field — not docklands-pass defId.
    const pass = instantiateCard("aesops-pawnshop", "pass-1", "runner:rig");
    pass.bonusAccessOnFirstHqBreachThisTurn = 1;
    pass.title = "Test HQ Pass";
    s.cards["pass-1"] = pass;
    s.runner.rig = ["pass-1"];
    const c1 = instantiateCard("hedge-fund", "c1", "corp:hq");
    const c2 = instantiateCard("hedge-fund", "c2", "corp:hq");
    const c3 = instantiateCard("hedge-fund", "c3", "corp:hq");
    s.cards["c1"] = c1;
    s.cards["c2"] = c2;
    s.cards["c3"] = c3;
    s.corp.hand = ["c1", "c2", "c3"];
    s.turn.hqBreachesThisTurn = 0;
    s.run = {
      attackedServerId: "hq",
      phase: "breach",
      position: null,
      successful: true,
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
    beginBreachAccess(s);
    expect(s.run!.accessRemaining).toBe(2);
    expect(s.run!.accessCandidates.length).toBe(2);
    expect(
      s.log.some((l) => l.includes("Test HQ Pass") && l.includes("+1")),
    ).toBe(true);
    expect(s.turn.hqBreachesThisTurn).toBe(1);

    // Second HQ breach same turn — no bonus.
    s.run = {
      attackedServerId: "hq",
      phase: "breach",
      position: null,
      successful: true,
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
    const logLen = s.log.length;
    beginBreachAccess(s);
    expect(s.run!.accessRemaining).toBe(1);
    expect(s.run!.accessCandidates.length).toBe(1);
    expect(s.log.slice(logLen).some((l) => l.includes("Test HQ Pass"))).toBe(
      false,
    );
  });
});
