/**
 * The Spaces Between (tsb) set-complete — floor v1.103.0 → v1.103.0.
 * 20/20 TSB-only clears. CR pin v26.03.
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

const TSB_CLEARS = [
  "the-foundry-refining-the-process",
  "enhanced-login-protocol",
  "heinlein-grid",
  "encrypted-portals",
  "cerebral-static",
  "targeted-marketing",
  "information-overload",
  "paywall-implementation",
  "sealed-vault",
  "eden-fragment",
  "lag-time",
  "will-o-the-wisp",
  "d4v1d",
  "scrubbed",
  "three-steps-ahead",
  "unscheduled-maintenance",
  "cache",
  "net-celebrity",
  "llds-energy-regulator",
  "ghost-runner",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.103.0");
});

describe("The Spaces Between v1.103.0 set-complete", () => {
  it("declares the-spaces-between supported after upstalk with 20 cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["the-spaces-between"].status).toBe("supported");
    expect(pool.waves["the-spaces-between"].cards).toHaveLength(20);
    expect(pool.corpusOrder[15]).toBe("upstalk");
    expect(pool.corpusOrder[16]).toBe("the-spaces-between");
    expect(pool.corpusOrder[17]).toBe("reign-and-reverie");
  });

  it("clears all 20 TSB cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of TSB_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("the-spaces-between");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onEncounter) expect(validateEffectTree(def.onEncounter)).toBeNull();
      if (def.onRunnerTurnEnd) expect(validateEffectTree(def.onRunnerTurnEnd)).toBeNull();
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
    }
  });

  it("wires key TSB fields", () => {
    loadCardCatalog(true);
    expect(getCardDef("d4v1d").powerCountersOnInstall).toBe(3);
    expect(getCardDef("ghost-runner").hostedCreditsOnInstall).toBe(3);
    expect(getCardDef("lag-time").allIceStrengthBonus).toBe(1);
    expect(getCardDef("enhanced-login-protocol").lingerAsCurrent).toBe(true);
  });
});
