/**
 * Reign and Reverie v1.84.0 I-slice: Formicary / Neurostasis / Akiko Nisei /
 * Divide and Conquer / Fast Break.
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

const CLEAR = [
  "formicary",
  "neurostasis",
  "akiko-nisei-head-case",
  "divide-and-conquer",
  "fast-break",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.139.0");
});

describe("Reign and Reverie v1.84.0 I-slice", () => {
  it("declares reign-and-reverie supported with at least 50 RaR-only clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["reign-and-reverie"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["reign-and-reverie"].cards) {
      const def = getCardDef(id);
      if (
        (def.unsupported ?? []).length === 0 &&
        def.wave === "reign-and-reverie"
      ) {
        clear++;
      }
    }
    expect(clear).toBeGreaterThanOrEqual(50);
  });

  it("loads five clear I-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("reign-and-reverie");
    }
  });

  it("Formicary: formicaryApproachAnyServer + rez/move + ETR unless net damage", () => {
    const def = getCardDef("formicary");
    const ab = def.paidAbilities?.find((a) => a.id === "formicary-approach");
    expect(ab?.formicaryApproachAnyServer).toBe(true);
    expect(ab?.windows).toContain("approach_server_paw");
    expect(JSON.stringify(ab?.effect)).toContain("formicary_rez_move_innermost");
    expect(validateEffectTree(ab!.effect)).toBeNull();
    const sub = def.subroutines?.[0];
    expect(JSON.stringify(sub?.effect)).toContain(
      "end_the_run_unless_net_damage",
    );
    expect(validateEffectTree(sub!.effect)).toBeNull();
  });

  it("Neurostasis: canAdvance + may_pay_credits_for_shuffle_installed_runner_per_advancement", () => {
    const def = getCardDef("neurostasis");
    expect(def.canAdvance).toBe(true);
    expect(JSON.stringify(def.onAccess)).toContain(
      "may_pay_credits_for_shuffle_installed_runner_per_advancement",
    );
    expect(validateEffectTree(def.onAccess!)).toBeNull();
  });

  it("Akiko Nisei: onBreachRd play_psi_game with bonus_access on match", () => {
    const def = getCardDef("akiko-nisei-head-case");
    expect(def.onBreachRd).toBeTruthy();
    expect(JSON.stringify(def.onBreachRd)).toContain("play_psi_game");
    expect(JSON.stringify(def.onBreachRd)).toContain("ifBidsMatch");
    expect(JSON.stringify(def.onBreachRd)).toContain("bonus_access");
    expect(validateEffectTree(def.onBreachRd!)).toBeNull();
  });

  it("Divide and Conquer: archives runEvent + queue_breaches_after_current", () => {
    const def = getCardDef("divide-and-conquer");
    expect(def.runEvent?.servers).toBe("archives");
    expect(JSON.stringify(def.runEvent?.onSuccessfulRun)).toContain(
      "queue_breaches_after_current",
    );
    expect(JSON.stringify(def.runEvent?.onSuccessfulRun)).toContain(
      "cannotAccessRoot",
    );
    expect(validateEffectTree(def.runEvent!.onSuccessfulRun!)).toBeNull();
  });

  it("Fast Break: fast_break_equal_to_runner_scored_agendas", () => {
    const def = getCardDef("fast-break");
    expect(JSON.stringify(def.onPlay)).toContain(
      "fast_break_equal_to_runner_scored_agendas",
    );
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });
});
