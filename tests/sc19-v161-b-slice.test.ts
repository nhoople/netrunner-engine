/**
 * System Core 2019 v1.61.0 B-slice: Battering Ram / Force of Nature /
 * Pipeline / Blue Level Clearance / Adonis Campaign.
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
  "battering-ram",
  "force-of-nature",
  "pipeline",
  "blue-level-clearance",
  "adonis-campaign",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.62.0");
});

describe("System Core 2019 v1.61.0 B-slice", () => {
  it("declares at least 15 SC19-only clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["system-core-2019"].status).toBe("in-progress");
    let clear = 0;
    for (const id of pool.waves["system-core-2019"].cards) {
      const def = getCardDef(id);
      if ((def.unsupported ?? []).length === 0 && def.wave === "system-core-2019") {
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
      expect(def.wave).toBe("system-core-2019");
    }
  });

  it("Battering Ram is a barrier fracter (break 2 / pump run)", () => {
    const def = getCardDef("battering-ram");
    expect(def.breaker).toEqual({
      breaksSubtype: "barrier",
      strength: 3,
      breakCredits: 2,
      breakMaxSubs: 2,
      pumpCredits: 1,
      pumpStrength: 1,
    });
    expect(def.paidAbilities?.[0]?.effect).toEqual(fx.pump(1, "run"));
  });

  it("Force of Nature is a code gate decoder", () => {
    const def = getCardDef("force-of-nature");
    expect(def.breaker?.breaksSubtype).toBe("code gate");
    expect(def.breaker?.breakMaxSubs).toBe(2);
    expect(def.paidAbilities?.[0]?.effect).toEqual(fx.pump(1));
  });

  it("Pipeline is a sentry killer (break 1 / pump run)", () => {
    const def = getCardDef("pipeline");
    expect(def.breaker?.breaksSubtype).toBe("sentry");
    expect(def.breaker?.breakMaxSubs).toBe(1);
    expect(def.paidAbilities?.[0]?.effect).toEqual(fx.pump(1, "run"));
  });

  it("Blue Level Clearance is a double: +click, gain 5, draw 2", () => {
    const def = getCardDef("blue-level-clearance");
    expect(def.playAdditionalClick).toBe(true);
    expect(def.onPlay).toEqual(
      fx.seq(fx.gainCredits("corp", 5), fx.draw("corp", 2)),
    );
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });

  it("Adonis Campaign hosts 12¢ and takes 3¢ on turn begin", () => {
    const def = getCardDef("adonis-campaign");
    expect(def.hostedCreditsOnInstall).toBe(12);
    expect(def.onTurnBegin).toEqual(
      fx.do({ kind: "take_hosted_credits", amount: 3 }),
    );
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
  });
});
