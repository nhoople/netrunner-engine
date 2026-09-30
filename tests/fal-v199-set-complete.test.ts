/**
 * Fear and Loathing (fal) set-complete — floor v1.98.0 → v1.99.0.
 * 15/15 FAL-only clears; 5 reprints absorbed. CR pin v26.03.
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

const FAL_CLEARS = [
  "hemorrhage",
  "tallie-perrault",
  "executive-wiretaps",
  "blackguard",
  "cybersolutions-mem-chip",
  "alpha",
  "omega",
  "blackmail",
  "strongbox",
  "toshiyuki-sakai",
  "restoring-face",
  "market-research",
  "grndl-power-unleashed",
  "vulcan-coverup",
  "grndl-refinery",
] as const;

const FAL_REPRINTS = [
  "quest-completed",
  "blue-level-clearance",
  "yagura",
  "wraparound",
  "subliminal-messaging",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.128.0");
});

describe("Fear and Loathing v1.99.0 set-complete", () => {
  it("declares fear-and-loathing supported after true-colors with 20 cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["fear-and-loathing"].status).toBe("supported");
    expect(pool.waves["fear-and-loathing"].cards).toHaveLength(20);
    expect(pool.corpusOrder[11]).toBe("true-colors");
    expect(pool.corpusOrder[12]).toBe("fear-and-loathing");
    expect(pool.corpusOrder[13]).toBe("double-time");
  });

  it("clears all 15 FAL-only cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of FAL_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("fear-and-loathing");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onGameStart) expect(validateEffectTree(def.onGameStart)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onSteal) expect(validateEffectTree(def.onSteal)).toBeNull();
      if (def.onSuccessfulRun) expect(validateEffectTree(def.onSuccessfulRun)).toBeNull();
      if (def.onAccess) expect(validateEffectTree(def.onAccess)).toBeNull();
      if (def.onGrayOrBlackOpsTrashedAfterResolve) {
        expect(validateEffectTree(def.onGrayOrBlackOpsTrashedAfterResolve)).toBeNull();
      }
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
    }
  });

  it("absorbs 5 reprints from earlier waves", () => {
    for (const id of FAL_REPRINTS) {
      const def = getCardDef(id);
      expect(def.wave).not.toBe("fear-and-loathing");
      expect(def.unsupported ?? []).toEqual([]);
    }
  });

  it("maps key FAL fields and primitives", () => {
    expect(getCardDef("blackguard").blackguardForceRezOnExpose).toBe(true);
    expect(getCardDef("blackmail").playRequiresCorpBadPublicityGte).toBe(1);
    expect(getCardDef("alpha").breakerOnlyOutermostIce).toBe(true);
    expect(getCardDef("omega").breakerOnlyInnermostIce).toBe(true);
    expect(getCardDef("strongbox").stealAdditionalClicks).toBe(1);
  });
});
