/**
 * Vantage Point v1.18.0 B-slice: Witch Hunt / Stowaway / Méliès City → 21/66.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";

const CLEAR = [
  "witch-hunt",
  "stowaway",
  "melies-city-luxury-line",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.44.0");
});

describe("Vantage Point v1.18.0 B-slice", () => {
  it("declares at least 21 clear vantage-point cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["vantage-point"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["vantage-point"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(21);
  });

  it("loads three newly mapped cards clear", () => {
    for (const id of CLEAR) {
      expect(getCardDef(id).unsupported ?? [], id).toEqual([]);
      expect(getCardDef(id).wave).toBe("vantage-point");
    }
  });

  it("Witch Hunt takes BP on score/steal and tags on action-phase end", () => {
    const def = getCardDef("witch-hunt");
    expect(def.badPublicityOnScore).toBe(1);
    expect(validateEffectTree(def.onSteal!)).toBeNull();
    expect(JSON.stringify(def.onSteal)).toContain("give_bad_publicity");
    expect(validateEffectTree(def.onCorpActionPhaseEnd!)).toBeNull();
    expect(JSON.stringify(def.onCorpActionPhaseEnd)).toContain(
      "self_scored_this_turn",
    );
    expect(JSON.stringify(def.onCorpActionPhaseEnd)).toContain(
      "remove_all_tags",
    );
    expect(JSON.stringify(def.onCorpActionPhaseEnd)).toContain("give_tags");
  });

  it("Stowaway installs on ice and gains on successful host-server run", () => {
    const def = getCardDef("stowaway");
    expect(def.installOnIce).toBe(true);
    expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
    expect(JSON.stringify(def.onSuccessfulRun)).toContain("gain_credits");
    expect(JSON.stringify(def.onSuccessfulRun)).toContain('"amount":2');
  });

  it("Méliès City costs a steal click and gains a click on score", () => {
    const def = getCardDef("melies-city-luxury-line");
    expect(def.stealAdditionalClicks).toBe(1);
    expect(validateEffectTree(def.onScore!)).toBeNull();
    expect(JSON.stringify(def.onScore)).toContain("gain_clicks");
  });
});
