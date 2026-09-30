/**
 * Reign and Reverie v1.77.0 B-slice: SIU / Too Big to Fail / Office Supplies /
 * Miss Bones / Tycoon.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  fx,
  getCardDef,
  loadCardCatalog,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";

const CLEAR = [
  "siu",
  "too-big-to-fail",
  "office-supplies",
  "miss-bones",
  "tycoon",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.140.0");
});

describe("Reign and Reverie v1.77.0 B-slice", () => {
  it("declares reign-and-reverie supported with at least 15 RaR-only clears", () => {
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
    expect(clear).toBeGreaterThanOrEqual(15);
  });

  it("loads five clear B-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("reign-and-reverie");
    }
  });

  it("SIU may trash self to Trace[3] for a tag", () => {
    const def = getCardDef("siu");
    expect(def.onTurnBegin?.op).toBe("choose");
    expect(JSON.stringify(def.onTurnBegin)).toContain("trash_self");
    expect(JSON.stringify(def.onTurnBegin)).toContain("trace");
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
  });

  it("Too Big to Fail requires <10¢ then gains 7¢ + bad publicity", () => {
    const def = getCardDef("too-big-to-fail");
    expect(def.playRequiresCreditsLt).toBe(10);
    expect(def.onPlay).toEqual({
      op: "seq",
      effects: [
        fx.gainCredits("corp", 7),
        fx.do({ kind: "give_bad_publicity", amount: 1 }),
      ],
    });
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });

  it("Office Supplies reduces by link and chooses gain or draw 4", () => {
    const def = getCardDef("office-supplies");
    expect(def.playCostReducedByLink).toBe(true);
    expect(def.onPlay?.op).toBe("choose");
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });

  it("Miss Bones hosts 12¢ spendable for trash", () => {
    const def = getCardDef("miss-bones");
    expect(def.hostedCreditsOnInstall).toBe(12);
    expect(def.hostedCreditsSpendFor).toEqual(["trash"]);
  });

  it("Tycoon is a fracter that pays Corp on encounter end if broke", () => {
    const def = getCardDef("tycoon");
    expect(def.breaker?.breaksSubtype).toBe("barrier");
    expect(def.breaker?.breakMaxSubs).toBe(2);
    expect(def.corpGainsCreditsOnEncounterEndIfBroke).toBe(2);
  });
});
