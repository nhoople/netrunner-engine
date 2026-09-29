/**
 * Reign and Reverie v1.81.0 D-slice: Cradle / The Outfit / Building Blocks /
 * Attitude Adjustment / API-S Keeper Isobel.
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
  "cradle",
  "the-outfit-family-owned-and-operated",
  "building-blocks",
  "attitude-adjustment",
  "api-s-keeper-isobel",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.86.0");
});

describe("Reign and Reverie v1.81.0 D-slice", () => {
  it("declares reign-and-reverie in-progress with at least 25 RaR-only clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["reign-and-reverie"].status).toBe("in-progress");
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
    expect(clear).toBeGreaterThanOrEqual(25);
  });

  it("loads five clear D-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("reign-and-reverie");
    }
  });

  it("Cradle is a decoder with grip strength penalty and break-any", () => {
    const def = getCardDef("cradle");
    expect(def.strengthPenaltyPerGripCard).toBe(1);
    expect(def.breaker?.breaksSubtype).toBe("code gate");
    expect(def.breaker?.breakCredits).toBe(2);
    expect(def.breaker?.breakMaxSubs).toBe(99);
  });

  it("The Outfit gains credits on each bad publicity take", () => {
    const def = getCardDef("the-outfit-family-owned-and-operated");
    expect(def.gainCreditsOnEachBadPublicityTake).toBe(3);
  });

  it("Building Blocks reveals a barrier then install+rez ignore costs", () => {
    const def = getCardDef("building-blocks");
    expect(def.onPlay).toEqual({
      op: "do",
      action: {
        kind: "reveal_hq_subtype_install_and_rez_ignore_costs",
        subtype: "barrier",
      },
    });
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });

  it("Attitude Adjustment draws 2 then reveals agendas for credits", () => {
    const def = getCardDef("attitude-adjustment");
    expect(def.onPlay).toEqual({
      op: "seq",
      effects: [
        fx.draw("corp", 2),
        fx.do({
          kind: "may_reveal_shuffle_agendas_into_rd",
          max: 2,
          creditsEach: 2,
        }),
      ],
    });
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });

  it("API-S Keeper Isobel may remove an advancement for credits", () => {
    const def = getCardDef("api-s-keeper-isobel");
    expect(def.onTurnBegin).toEqual({
      op: "do",
      action: {
        kind: "may_remove_advancement_from_installed_gain_credits",
        credits: 3,
      },
    });
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
  });
});
