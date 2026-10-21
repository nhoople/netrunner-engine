/**
 * future-proof play tests.
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
  createInitialState,
  instantiateCard,
  evalEffect,
  effectiveBreakerStrength,
} from "../src/index.js";
import type {
  GameState,
} from "../src/state/types.js";
import {
  additionalRunInitiateTax,
} from "../src/state/runInitiateTax.js";

describe("future-proof", () => {
  describe("fp-primitives", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.8");
  });

  describe("FP primitives IR validate", () => {
    it("accepts Darwin / Indexing / Midori / Midseason / Mr. Li kinds", () => {
      expect(
        validateEffectTree(fx.mayPayCreditsAddVirusCounter(1, 1)),
      ).toBeNull();
      expect(validateEffectTree(fx.indexingMayInsteadOfBreach())).toBeNull();
      expect(validateEffectTree(fx.drawNThenBottomOneOfDrawn(2))).toBeNull();
      expect(
        validateEffectTree(fx.midoriMaySwapApproachedIceWithHq()),
      ).toBeNull();
      expect(
        validateEffectTree(fx.giveTagsEqualToLastTraceExcess()),
      ).toBeNull();
      expect(
        validateEffectTree({
          op: "if",
          cond: { op: "credits_gte", side: "corp", amount: 7 },
          then: fx.gainCredits("corp", 7),
          else: fx.loseAllCredits("corp"),
        }),
      ).toBeNull();
      expect(
        validateEffectTree({
          op: "if",
          cond: { op: "runner_tagged" },
          then: fx.meatDamage(2),
        }),
      ).toBeNull();
      expect(
        validateEffectTree({
          op: "if",
          cond: { op: "virus_counters_gte", amount: 3 },
          then: fx.do({ kind: "look_top_n_rd_peek", n: 1 }),
        }),
      ).toBeNull();
    });
  });
  });

  describe("fp-v193-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.8");
  });

  describe("Future Proof v1.93.0 set-complete", () => {

    it("maps FP-specific fields and primitives", () => {
      const darwin = getCardDef("darwin");
      expect(darwin.strengthPerVirusCounter).toBe(1);
      expect(darwin.breaker?.breaksSubtype).toBe("*");
      expect(darwin.breaker?.breakCredits).toBe(2);
      expect(JSON.stringify(darwin.onTurnBegin)).toContain(
        "may_pay_credits_add_virus_counter",
      );

      const dlr = getCardDef("data-leak-reversal");
      expect(dlr.installRequiresSuccessfulCentralRunThisTurn).toBe(true);
      expect(dlr.paidAbilities?.[0]?.requireRunnerTagged).toBe(true);
      expect(JSON.stringify(dlr.paidAbilities?.[0]?.effect)).toContain(
        "trash_top_of_rd",
      );

      expect(JSON.stringify(getCardDef("mr-li").paidAbilities)).toContain(
        "draw_n_then_bottom_one_of_drawn",
      );

      expect(JSON.stringify(getCardDef("indexing").runEvent)).toContain(
        "may_breach_instead_indexing",
      );

      const deep = getCardDef("deep-thought");
      expect(JSON.stringify(deep.onSuccessfulRun)).toContain("attacking_rd");
      expect(JSON.stringify(deep.onTurnBegin)).toContain("virus_counters_gte");
      expect(JSON.stringify(deep.onTurnBegin)).toContain("look_top_n_rd_peek");

      const nach = getCardDef("new-angeles-city-hall");
      expect(JSON.stringify(nach.paidAbilities)).toContain("prevent_pending_tags");
      expect(JSON.stringify(nach.onStealAgenda)).toContain("trash_self");

      expect(getCardDef("ruhr-valley").additionalRunInitiateClicks).toBe(1);
      expect(getCardDef("ruhr-valley").subtypes).toContain("region");

      const midori = getCardDef("midori");
      expect(midori.onApproachIceOncePerRun).toBe(true);
      expect(JSON.stringify(midori.onApproachIce)).toContain(
        "may_swap_approached_ice_with_hq",
      );

      expect(getCardDef("nbn-the-world-is-yours").handSizeBonus).toBe(1);

      const midseason = getCardDef("midseason-replacements");
      expect(midseason.playRequiresAgendaStolenLastTurn).toBe(true);
      expect(JSON.stringify(midseason.onPlay)).toContain(
        "give_tags_equal_to_last_trace_excess",
      );

      const drt = getCardDef("dedicated-response-team");
      expect(JSON.stringify(drt.onSuccessfulRunEnd)).toContain("runner_tagged");
      expect(JSON.stringify(drt.onSuccessfulRunEnd)).toContain("meat_damage");

      expect(JSON.stringify(getCardDef("burke-bugs").subroutines)).toContain(
        "trash_own_program",
      );

      expect(JSON.stringify(getCardDef("corporate-war").onScore)).toContain(
        "credits_gte",
      );
      expect(JSON.stringify(getCardDef("corporate-war").onScore)).toContain(
        "lose_all_credits",
      );
    });

    it("Darwin virus strength and Ruhr Valley initiate tax smoke", () => {
      let s: GameState = createInitialState();
      s = structuredClone(s);
      const darwin = instantiateCard("darwin", "darwin-1", "runner:installed");
      darwin.virusCounters = 3;
      s.cards["darwin-1"] = darwin;
      s.runner.installed.push("darwin-1");
      expect(effectiveBreakerStrength(s, "darwin-1")).toBe(3);

      const ruhr = instantiateCard("ruhr-valley", "ruhr-1", "server:remote1:root");
      ruhr.rezzed = true;
      s.cards["ruhr-1"] = ruhr;
      s.servers["remote1"] = {
        id: "remote1",
        kind: "remote",
        root: ["ruhr-1"],
        ice: [],
      };
      expect(additionalRunInitiateTax(s, "remote1")).toEqual({
        credits: 0,
        clicks: 1,
      });

      s.turn.lastTraceExcess = 4;
      const mid = evalEffect(
        { state: s, sourceId: "corp-id" },
        fx.giveTagsEqualToLastTraceExcess(),
      );
      expect(mid.ok).toBe(true);
      expect(s.runner.tags).toBeGreaterThanOrEqual(4);
    });
  });
  });
});
