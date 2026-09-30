/**
 * Future Proof (fp) Genesis set-complete — floor v1.92.0 → v1.93.0.
 * 13/13 FP-only clears; 7 reprints absorbed. CR pin v26.03.
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
  createInitialState,
  instantiateCard,
  evalEffect,
  fx,
  effectiveBreakerStrength,
} from "../src/index.js";
import type { GameState } from "../src/state/types.js";
import { additionalRunInitiateTax } from "../src/state/runInitiateTax.js";

const FP_CLEARS = [
  "darwin",
  "data-leak-reversal",
  "mr-li",
  "indexing",
  "deep-thought",
  "new-angeles-city-hall",
  "ruhr-valley",
  "midori",
  "nbn-the-world-is-yours",
  "midseason-replacements",
  "dedicated-response-team",
  "burke-bugs",
  "corporate-war",
] as const;

const FP_REPRINTS = [
  "retrieval-run",
  "faerie",
  "r-d-interface",
  "eli-1-0",
  "ronin",
  "project-beale",
  "flare",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.108.0");
});

describe("Future Proof v1.93.0 set-complete", () => {
  it("declares future-proof supported after humanitys-shadow with 20 cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["future-proof"].status).toBe("supported");
    expect(pool.waves["future-proof"].cards).toHaveLength(20);
    expect(pool.corpusOrder[0]).toBe("core");
    expect(pool.corpusOrder[1]).toBe("what-lies-ahead");
    expect(pool.corpusOrder[2]).toBe("trace-amount");
    expect(pool.corpusOrder[3]).toBe("cyber-exodus");
    expect(pool.corpusOrder[4]).toBe("a-study-in-static");
    expect(pool.corpusOrder[5]).toBe("humanitys-shadow");
    expect(pool.corpusOrder[6]).toBe("future-proof");
    expect(pool.corpusOrder[7]).toBe("creation-and-control");
    expect(pool.corpusOrder[8]).toBe("opening-moves");
    expect(pool.corpusOrder[9]).toBe("stalwart")
    expect(pool.corpusOrder[10]).toBe("mala-tempora");
    expect(pool.corpusOrder[11]).toBe("true-colors");
    expect(pool.corpusOrder[12]).toBe("fear-and-loathing");
    expect(pool.corpusOrder[13]).toBe("double-time");
    expect(pool.waves["humanitys-shadow"].status).toBe("supported");
  });

  it("clears all 13 FP-only cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of FP_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("future-proof");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onRez) expect(validateEffectTree(def.onRez)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onSuccessfulRun) {
        expect(validateEffectTree(def.onSuccessfulRun)).toBeNull();
      }
      if (def.onSuccessfulRunEnd) {
        expect(validateEffectTree(def.onSuccessfulRunEnd)).toBeNull();
      }
      if (def.onApproachIce) {
        expect(validateEffectTree(def.onApproachIce)).toBeNull();
      }
      if (def.onStealAgenda) {
        expect(validateEffectTree(def.onStealAgenda)).toBeNull();
      }
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.runEvent?.onSuccessfulRun) {
        expect(validateEffectTree(def.runEvent.onSuccessfulRun)).toBeNull();
      }
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
    }
  });

  it("absorbs 7 reprints from earlier waves", () => {
    for (const id of FP_REPRINTS) {
      const def = getCardDef(id);
      expect(def.wave).not.toBe("future-proof");
      expect(def.unsupported ?? []).toEqual([]);
    }
  });

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
      "indexing_may_instead_of_breach",
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
      "midori_may_swap_approached_ice_with_hq",
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
    const darwin = instantiateCard("darwin", "darwin-1", "runner:rig");
    darwin.virusCounters = 3;
    s.cards["darwin-1"] = darwin;
    s.runner.rig.push("darwin-1");
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
