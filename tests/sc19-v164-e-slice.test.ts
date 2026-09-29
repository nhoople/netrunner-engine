/**
 * System Core 2019 v1.64.0 E-slice: Heimdall 1.0 / Ichi 1.0 /
 * SEA Source / Product Placement / Notoriety.
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
  "heimdall-1-0",
  "ichi-1-0",
  "sea-source",
  "product-placement",
  "notoriety",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.72.0");
});

describe("System Core 2019 v1.64.0 E-slice", () => {
  it("declares at least 30 SC19-only clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["system-core-2019"].status).toBe("in-progress");
    let clear = 0;
    for (const id of pool.waves["system-core-2019"].cards) {
      const def = getCardDef(id);
      if ((def.unsupported ?? []).length === 0 && def.wave === "system-core-2019") {
        clear++;
      }
    }
    expect(clear).toBeGreaterThanOrEqual(30);
  });

  it("loads five clear E-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("system-core-2019");
    }
  });

  it("Heimdall 1.0 is bioroid with core + ETR×2", () => {
    const def = getCardDef("heimdall-1-0");
    expect(def.subtypes).toEqual(
      expect.arrayContaining(["barrier", "bioroid", "ap"]),
    );
    expect(def.subroutines).toHaveLength(3);
    expect(def.subroutines![0].effect).toEqual(
      fx.do({ kind: "core_damage", amount: 1 }),
    );
    expect(def.subroutines![1].effect).toEqual(fx.etr());
    expect(def.subroutines![2].effect).toEqual(fx.etr());
    expect(validateEffectTree(def.subroutines![0].effect)).toBeNull();
  });

  it("Ichi 1.0 trashes programs then Trace core+tag", () => {
    const def = getCardDef("ichi-1-0");
    expect(def.subtypes).toEqual(
      expect.arrayContaining(["sentry", "bioroid", "tracer", "destroyer"]),
    );
    expect(def.subroutines).toHaveLength(3);
    expect(def.subroutines![0].effect).toEqual(
      fx.do({ kind: "trash_program", pick: "choose" }),
    );
    expect(def.subroutines![1].effect).toEqual(
      fx.do({ kind: "trash_program", pick: "choose" }),
    );
    expect(def.subroutines![2].effect).toEqual(
      fx.do({
        kind: "trace",
        strength: 1,
        onSuccess: fx.seq(
          fx.do({ kind: "core_damage", amount: 1 }),
          fx.giveTags(1),
        ),
      }),
    );
    expect(validateEffectTree(def.subroutines![2].effect)).toBeNull();
  });

  it("SEA Source gates on successful run last turn then Trace tag", () => {
    const def = getCardDef("sea-source");
    expect(def.playRequiresSuccessfulRunLastTurn).toBe(true);
    expect(def.onPlay).toEqual(
      fx.do({
        kind: "trace",
        strength: 3,
        onSuccess: fx.giveTags(1),
      }),
    );
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });

  it("Product Placement reveals from R&D and gains 2¢ on access", () => {
    const def = getCardDef("product-placement");
    expect(def.mustRevealWhenAccessedFromRd).toBe(true);
    expect(def.skipOnAccessFromArchives).toBe(true);
    expect(def.onAccess).toEqual(fx.gainCredits("corp", 2));
    expect(validateEffectTree(def.onAccess!)).toBeNull();
  });

  it("Notoriety scores itself after all centrals", () => {
    const def = getCardDef("notoriety");
    expect(def.playRequiresSuccessfulAllCentralsThisTurn).toBe(true);
    expect(def.onPlay).toEqual(
      fx.do({
        kind: "add_to_runner_score_as_agenda",
        agendaPoints: 1,
      }),
    );
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });
});
