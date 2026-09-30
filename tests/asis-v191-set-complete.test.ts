/**
 * A Study in Static (asis) Genesis set-complete — floor v1.90.0 → v1.91.0.
 * 15/15 ASIS-only clears; 5 reprints absorbed. CR pin v26.03.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
  loadCardCatalog,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";

const ASIS_CLEARS = [
  "disrupter",
  "doppelganger",
  "crescentus",
  "all-nighter",
  "inside-man",
  "underworld-contact",
  "green-level-clearance",
  "hourglass",
  "dedicated-server",
  "bullfrog",
  "uroboros",
  "net-police",
  "weyland-consortium-because-we-built-it",
  "government-contracts",
  "tyrant",
] as const;

const ASIS_REPRINTS = [
  "force-of-nature",
  "scrubber",
  "deus-x",
  "oversight-ai",
  "false-lead",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.106.0");
});

describe("A Study in Static v1.91.0 set-complete", () => {
  it("declares a-study-in-static supported after cyber-exodus with 20 cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["a-study-in-static"].status).toBe("supported");
    expect(pool.waves["a-study-in-static"].cards).toHaveLength(20);
    expect(pool.corpusOrder[0]).toBe("core");
    expect(pool.corpusOrder[1]).toBe("what-lies-ahead");
    expect(pool.corpusOrder[2]).toBe("trace-amount");
    expect(pool.corpusOrder[3]).toBe("cyber-exodus");
    expect(pool.corpusOrder[4]).toBe("a-study-in-static");
    expect(pool.corpusOrder[7]).toBe("creation-and-control");
    expect(pool.corpusOrder[8]).toBe("opening-moves");
    expect(pool.corpusOrder[9]).toBe("stalwart")
    expect(pool.corpusOrder[10]).toBe("mala-tempora");
    expect(pool.corpusOrder[11]).toBe("true-colors");
    expect(pool.corpusOrder[12]).toBe("fear-and-loathing");
    expect(pool.corpusOrder[13]).toBe("double-time");
    expect(pool.waves["cyber-exodus"].status).toBe("supported");
  });

  it("clears all 15 ASIS-only cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of ASIS_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("a-study-in-static");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onSuccessfulRunEndOncePerTurn) {
        expect(validateEffectTree(def.onSuccessfulRunEndOncePerTurn)).toBeNull();
      }
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
      if (def.gainsSubroutinesPerAdvancement?.subroutine.effect) {
        expect(
          validateEffectTree(
            def.gainsSubroutinesPerAdvancement.subroutine.effect,
          ),
        ).toBeNull();
      }
    }
  });

  it("absorbs 5 reprints from earlier waves", () => {
    for (const id of ASIS_REPRINTS) {
      const def = getCardDef(id);
      expect(def.wave).not.toBe("a-study-in-static");
      expect(def.unsupported ?? []).toEqual([]);
    }
  });

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
      "trace_interrupt_paw",
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
