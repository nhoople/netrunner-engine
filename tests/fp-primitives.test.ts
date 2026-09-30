/**
 * Future Proof primitive smoke — IR kinds + field wiring.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  fx,
  validateEffectTree,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.107.0");
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
