/**
 * Uprising v1.37.1 B-slice: Euler / Odore / Penrose / Cayambe Grid / Moshing /
 * Cyberdex Sandbox / DreamNet / Swift / Self-modifying Code.
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
  "euler",
  "odore",
  "penrose",
  "cayambe-grid",
  "moshing",
  "cyberdex-sandbox",
  "dreamnet",
  "swift",
  "self-modifying-code",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.112.0");
});

describe("Uprising v1.37.1 B-slice", () => {
  it("declares uprising supported with at least 17 clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["uprising"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["uprising"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(17);
  });

  it("loads nine new clear cards", () => {
    for (const id of CLEAR) {
      const def = getCardDef(id);
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("uprising");
    }
  });

  it("Euler is a paid-ability code gate breaker with install-this-turn free break", () => {
    const def = getCardDef("euler");
    expect(def.breaker?.breaksSubtype).toBe("code gate");
    expect(def.breaker?.breakViaPaidAbilityOnly).toBe(true);
    const free = def.paidAbilities?.find((a) => a.id === "euler-break-install");
    expect(free?.requireInstalledThisTurn).toBe(true);
    expect(free?.creditCost).toBe(0);
    expect(validateEffectTree(free!.effect)).toBeNull();
  });

  it("Penrose dual-mode barrier/code gate with stealth pump", () => {
    const def = getCardDef("penrose");
    expect(def.subtypes).toEqual(
      expect.arrayContaining(["decoder", "fracter"]),
    );
    const barrier = def.paidAbilities?.find(
      (a) => a.id === "penrose-break-barrier",
    );
    expect(barrier?.requireInstalledThisTurn).toBe(true);
    const pump = def.paidAbilities?.find((a) => a.id === "penrose-pump");
    expect(pump?.cost?.creditsFromStealthOnly).toBe(true);
  });

  it("Odore free break requires 3+ virtual resources", () => {
    const def = getCardDef("odore");
    expect(def.breaker?.breaksSubtype).toBe("sentry");
    const free = def.paidAbilities?.find(
      (a) => a.id === "odore-break-virtual",
    );
    expect(free?.requireInstalledVirtualResourcesGte).toBe(3);
  });

  it("Cayambe Grid places on protecting ice and taxes advanced ice", () => {
    const def = getCardDef("cayambe-grid");
    expect(def.approachServerEtrUnlessCreditsPerAdvancedIce).toBe(2);
    expect(def.onTurnBegin).toEqual({
      op: "do",
      action: {
        kind: "place_advancements",
        amount: 1,
        onlyIceProtectingSourceServer: true,
        pick: "choose",
      },
    });
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
  });

  it("Moshing trashes 3 from grip then gains and draws", () => {
    const def = getCardDef("moshing");
    expect(def.playRequiresOtherGripCardsGte).toBe(3);
    expect(def.playAdditionalCost).toEqual({
      op: "do",
      action: { kind: "trash_n_from_grip", amount: 3 },
    });
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });

  it("Cyberdex Sandbox gains on first purge and may purge on score", () => {
    const def = getCardDef("cyberdex-sandbox");
    expect(def.onVirusPurgeOncePerTurn).toBe(true);
    expect(validateEffectTree(def.onVirusPurge!)).toBeNull();
    expect(validateEffectTree(def.onScore!)).toBeNull();
    expect(JSON.stringify(def.onScore)).toContain("purge_virus_counters");
  });

  it("DreamNet draws on first successful run with digital/link bonus", () => {
    const def = getCardDef("dreamnet");
    expect(validateEffectTree(def.onFirstSuccessfulRunThisTurn!)).toBeNull();
    const s = JSON.stringify(def.onFirstSuccessfulRunThisTurn);
    expect(s).toContain("identity_has_subtype");
    expect(s).toContain("link_gte");
  });

  it("Swift is a console with MU and first-run-event click", () => {
    const def = getCardDef("swift");
    expect(def.muBonus).toBe(1);
    expect(def.gainClickOnFirstRunEventThisTurn).toBe(true);
    expect(def.subtypes).toContain("console");
  });

  it("Self-modifying Code searches stack for a program", () => {
    const def = getCardDef("self-modifying-code");
    const ab = def.paidAbilities?.[0];
    expect(ab?.cost?.trashSelf).toBe(true);
    expect(ab?.cost?.credits).toBe(2);
    expect(validateEffectTree(ab!.effect)).toBeNull();
  });
});
