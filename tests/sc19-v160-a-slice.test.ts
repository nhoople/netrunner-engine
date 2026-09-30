/**
 * System Core 2019 v1.60.0 A-slice: Neural Katana / Wall of Thorns /
 * Armitage Codebusting / Hadrian's Wall / IPO.
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
  "neural-katana",
  "wall-of-thorns",
  "armitage-codebusting",
  "hadrians-wall",
  "ipo",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.139.0");
});

describe("System Core 2019 v1.60.0 A-slice", () => {
  it("declares system-core-2019 supported with at least 10 SC19-only clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["system-core-2019"].status).toBe("supported");
    expect(pool.waves["system-core-2019"].cards).toHaveLength(147);
    let clear = 0;
    for (const id of pool.waves["system-core-2019"].cards) {
      const def = getCardDef(id);
      if ((def.unsupported ?? []).length === 0 && def.wave === "system-core-2019") {
        clear++;
      }
    }
    expect(clear).toBeGreaterThanOrEqual(10);
  });

  it("loads five clear A-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("system-core-2019");
    }
  });

  it("Neural Katana does 3 net damage", () => {
    const def = getCardDef("neural-katana");
    expect(def.subroutines).toHaveLength(1);
    expect(def.subroutines![0].effect).toEqual(fx.netDamage(3));
    expect(validateEffectTree(def.subroutines![0].effect)).toBeNull();
  });

  it("Wall of Thorns does 2 net then ETR", () => {
    const def = getCardDef("wall-of-thorns");
    expect(def.subroutines).toHaveLength(2);
    expect(def.subroutines![0].effect).toEqual(fx.netDamage(2));
    expect(def.subroutines![1].effect).toEqual(fx.etr());
  });

  it("Armitage Codebusting hosts 12¢ and takes 2¢", () => {
    const def = getCardDef("armitage-codebusting");
    expect(def.hostedCreditsOnInstall).toBe(12);
    expect(def.paidAbilities?.[0]?.effect).toEqual(
      fx.do({ kind: "take_hosted_credits", amount: 2 }),
    );
    expect(validateEffectTree(def.paidAbilities![0].effect)).toBeNull();
  });

  it("Hadrian's Wall is advanceable with two ETR subs", () => {
    const def = getCardDef("hadrians-wall");
    expect(def.canAdvance).toBe(true);
    expect(def.strengthPerAdvancement).toBe(1);
    expect(def.subroutines).toHaveLength(2);
    expect(def.subroutines![0].effect).toEqual(fx.etr());
    expect(def.subroutines![1].effect).toEqual(fx.etr());
  });

  it("IPO gains 13¢ and ends the action phase", () => {
    const def = getCardDef("ipo");
    expect(def.endsActionPhase).toBe(true);
    expect(def.onPlay).toEqual(fx.gainCredits("corp", 13));
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });
});
