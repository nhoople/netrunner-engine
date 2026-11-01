/**
 * a-study-in-static play tests.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  fx,
  validateEffectTree,
  getCardDef,
} from "../src/index.js";

describe("a-study-in-static", () => {
  describe("asis-primitives", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  describe("ASIS forbid_runner_runs_this_turn", () => {
    it("validates Uroboros primitive", () => {
      expect(
        validateEffectTree(fx.forbidRunnerRunsThisTurn()),
      ).toBeNull();
    });
  });

  describe("ASIS bullfrog move ice", () => {
    it("validates move_source_ice_to_outermost_another_server_continue_run", () => {
      expect(
        validateEffectTree(fx.moveSourceIceToOutermostAnotherServerContinueRun()),
      ).toBeNull();
    });
  });

  describe("ASIS doppelganger may_start_run", () => {
    it("validates may_start_run any", () => {
      expect(
        validateEffectTree(
          fx.do({ kind: "may_start_run", servers: "any" }),
        ),
      ).toBeNull();
    });
  });

  describe("ASIS set_trace_base_strength", () => {
    it("validates Disrupter interrupt primitive", () => {
      expect(validateEffectTree(fx.setTraceBaseStrength(0))).toBeNull();
    });
  });
  });

  describe("asis-v191-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  describe("A Study in Static v1.91.0 set-complete", () => {

    it("maps ASIS-specific fields and primitives", () => {
      expect(getCardDef("doppelganger").muBonus).toBe(1);
      expect(getCardDef("doppelganger").onSuccessfulRunEndOncePerTurn).toMatchObject({
        op: "do",
        action: { kind: "may_start_run", servers: "any" },
      });
      expect(getCardDef("inside-man").recurringSpendFor).toEqual([
        "install_hardware",
      ]);
      expect(getCardDef("dedicated-server").recurringSpendFor).toEqual(["rez_ice"]);
      expect(
        getCardDef("weyland-consortium-because-we-built-it").recurringSpendFor,
      ).toEqual(["advance_ice"]);
      expect(getCardDef("net-police").recurringCreditsMaxEqualsRunnerLink).toBe(
        true,
      );
      expect(getCardDef("net-police").recurringSpendFor).toEqual(["trace"]);
      expect(getCardDef("tyrant").canAdvance).toBe(true);
      expect(getCardDef("tyrant").canAdvanceOnlyWhenRezzed).toBe(true);
      expect(getCardDef("tyrant").gainsSubroutinesPerAdvancement).toBeTruthy();
      const crescentus = getCardDef("crescentus");
      expect(crescentus.paidAbilities?.[0]?.requireFullyBrokenThisEncounter).toBe(
        true,
      );
      expect(JSON.stringify(crescentus.paidAbilities)).toContain(
        "derez_encounter_ice",
      );
      const disrupter = getCardDef("disrupter");
      expect(JSON.stringify(disrupter.paidAbilities)).toContain(
        "trace_interrupt",
      );
      expect(JSON.stringify(disrupter.paidAbilities)).toContain(
        "set_trace_base_strength",
      );
      const uroboros = getCardDef("uroboros");
      expect(JSON.stringify(uroboros.subroutines)).toContain(
        "forbid_runner_runs_this_turn",
      );
      const bullfrog = getCardDef("bullfrog");
      expect(JSON.stringify(bullfrog.subroutines)).toContain("play_psi_game");
      expect(JSON.stringify(bullfrog.subroutines)).toContain(
        "move_source_ice_to_outermost_another_server_continue_run",
      );
      expect(getCardDef("hourglass").subroutines).toHaveLength(3);
      expect(getCardDef("underworld-contact").onTurnBegin).toMatchObject({
        op: "if",
        cond: { op: "link_gte", amount: 2 },
      });
    });
  });
  });
});
