/**
 * System Core 2019 v1.63.0 D-slice: Hunter / Caduceus /
 * Yagura / Viktor 1.0 / Special Order.
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
  "hunter",
  "caduceus",
  "yagura",
  "viktor-1-0",
  "special-order",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.135.0");
});

describe("System Core 2019 v1.63.0 D-slice", () => {
  it("declares at least 25 SC19-only clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["system-core-2019"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["system-core-2019"].cards) {
      const def = getCardDef(id);
      if ((def.unsupported ?? []).length === 0 && def.wave === "system-core-2019") {
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
      expect(def.wave).toBe("system-core-2019");
    }
  });

  it("Hunter is Trace[3] → give 1 tag", () => {
    const def = getCardDef("hunter");
    expect(def.subtypes).toEqual(
      expect.arrayContaining(["sentry", "tracer", "observer"]),
    );
    expect(def.subroutines).toHaveLength(1);
    expect(def.subroutines![0].effect).toEqual(
      fx.do({
        kind: "trace",
        strength: 3,
        onSuccess: fx.giveTags(1),
      }),
    );
    expect(validateEffectTree(def.subroutines![0].effect)).toBeNull();
  });

  it("Caduceus is Trace gain + Trace ETR", () => {
    const def = getCardDef("caduceus");
    expect(def.subroutines).toHaveLength(2);
    expect(def.subroutines![0].effect).toEqual(
      fx.do({
        kind: "trace",
        strength: 3,
        onSuccess: fx.gainCredits("corp", 3),
      }),
    );
    expect(def.subroutines![1].effect).toEqual(
      fx.do({
        kind: "trace",
        strength: 2,
        onSuccess: fx.etr(),
      }),
    );
    expect(validateEffectTree(def.subroutines![0].effect)).toBeNull();
    expect(validateEffectTree(def.subroutines![1].effect)).toBeNull();
  });

  it("Yagura looks at R&D then does 1 net damage", () => {
    const def = getCardDef("yagura");
    expect(def.subroutines).toHaveLength(2);
    expect(def.subroutines![0].effect).toEqual(
      fx.do({ kind: "look_top_rd_may_bottom" }),
    );
    expect(def.subroutines![1].effect).toEqual(fx.netDamage(1));
    expect(validateEffectTree(def.subroutines![0].effect)).toBeNull();
    expect(validateEffectTree(def.subroutines![1].effect)).toBeNull();
  });

  it("Viktor 1.0 is bioroid with core damage + ETR", () => {
    const def = getCardDef("viktor-1-0");
    expect(def.subtypes).toEqual(
      expect.arrayContaining(["code gate", "bioroid", "ap"]),
    );
    expect(def.subroutines).toHaveLength(2);
    expect(def.subroutines![0].effect).toEqual(
      fx.do({ kind: "core_damage", amount: 1 }),
    );
    expect(def.subroutines![1].effect).toEqual(fx.etr());
    expect(validateEffectTree(def.subroutines![0].effect)).toBeNull();
    expect(validateEffectTree(def.subroutines![1].effect)).toBeNull();
  });

  it("Special Order searches stack for an icebreaker", () => {
    const def = getCardDef("special-order");
    expect(def.onPlay).toEqual(
      fx.do({ kind: "search_stack_icebreaker" }),
    );
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });
});
