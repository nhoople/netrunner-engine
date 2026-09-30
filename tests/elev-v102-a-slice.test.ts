/**
 * Elevation v1.02.0: fifteen A-class maps (18/82 with kickoff).
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
} from "../src/index.js";

const CLEAR = [
  "azimat",
  "chromatophores",
  "byte",
  "nanomanagement",
  "hantu",
  "flyswatter",
  "n-pot",
  "empiricist",
  "syailendra",
  "lamplighter",
  "top-down-solutions",
  "illumination",
  "maglectric-rapid-748-mod",
  "idiosyncresis",
  "devadatta-drone",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.101.0");
});

describe("Elevation v1.02.0 A-slice", () => {
  it("declares pool-wide clear elevation cards (includes later slices)", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["elevation"].status).toBe("supported");
    const catalog = loadCardCatalog(true);
    let clear = 0;
    for (const id of pool.waves["elevation"].cards) {
      if ((catalog.get(id)?.unsupported ?? []).length === 0) clear++;
    }
    // Floor at this slice; later pins raise the pool-wide clear count.
    expect(clear).toBeGreaterThanOrEqual(18);
  });

  it("loads fifteen newly mapped cards clear", () => {
    for (const id of CLEAR) {
      const def = getCardDef(id);
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("elevation");
    }
  });

  it("Azimat is recurring trash credits; Chromatophores is Egret-class", () => {
    expect(getCardDef("azimat").recurringCreditsMax).toBe(2);
    expect(getCardDef("azimat").recurringSpendFor).toEqual(["trash"]);
    expect(getCardDef("chromatophores").installOnIce).toBe(true);
    expect(getCardDef("chromatophores").hostGainsAllIceSubtypes).toBe(true);
  });

  it("Byte! is Behold!-class ambush; Nanomanagement gains 2 clicks", () => {
    const b = getCardDef("byte");
    expect(b.mustRevealWhenAccessedFromRd).toBe(true);
    expect(b.skipOnAccessFromArchives).toBe(true);
    expect(b.onAccess).toBeDefined();
    expect(getCardDef("nanomanagement").onPlay).toEqual(
      fx.gainClicks("corp", 2),
    );
  });

  it("Hantu is virus killer with virus pump", () => {
    const h = getCardDef("hantu");
    expect(h.breaker?.breaksSubtype).toBe("sentry");
    expect(h.onInstall).toEqual(fx.addVirusCounter(2));
    expect(h.paidAbilities?.[0]?.cost).toEqual({ virusCounters: 1 });
  });

  it("Flyswatter purges on rez during run; N-Pot has threat ETRs", () => {
    const f = getCardDef("flyswatter");
    expect(f.onRez).toEqual(
      fx.if(
        { op: "source_protects_attacked_server" },
        fx.do({ kind: "purge_virus_counters" }),
      ),
    );
    const n = getCardDef("n-pot");
    expect(n.paidAbilities?.[0]?.effect).toEqual(fx.breakHostSubroutine());
    expect(n.subroutines).toHaveLength(3);
  });

  it("Empiricist / Syailendra / Lamplighter wire subroutine ice", () => {
    expect(getCardDef("empiricist").subroutines).toHaveLength(3);
    const s = getCardDef("syailendra");
    expect(s.canAdvance).toBe(true);
    expect(s.onEncounter).toBeDefined();
    const l = getCardDef("lamplighter");
    expect(l.onAgendaScoredOrStolen).toBeDefined();
    expect(l.subroutines).toHaveLength(2);
  });

  it("Top-Down / Illumination / Maglectric / Idiosyncresis / Devadatta", () => {
    expect(getCardDef("top-down-solutions").onPlay).toBeDefined();
    expect(getCardDef("illumination").runEvent?.servers).toBe("rd");
    expect(getCardDef("maglectric-rapid-748-mod").onSuccessfulRun).toBeDefined();
    expect(getCardDef("idiosyncresis").canAdvance).toBe(true);
    expect(getCardDef("devadatta-drone").powerCountersOnInstall).toBe(2);
    expect(getCardDef("devadatta-drone").maySpendPowerCountersForBonusRdAccess).toEqual(
      { max: 1 },
    );
  });
});
