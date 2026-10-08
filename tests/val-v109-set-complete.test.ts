/**
 * The Valley (val) set-complete — floor v1.108.0 → v1.109.0.
 * 19/19 VAL-only clears (clot reprint). CR pin v26.03.
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

const VAL_CLEARS = [
  "paige-piper",
  "adjusted-chronotype",
  "spike",
  "enhanced-vision",
  "gene-conditioning-shoppe",
  "synthetic-blood",
  "traffic-jam",
  "symmetrical-visage",
  "brain-taping-warehouse",
  "next-gold",
  "jinteki-biotech-life-imagined",
  "genetic-resequencing",
  "cortex-lock",
  "valley-grid",
  "bandwidth",
  "predictive-algorithm",
  "capital-investors",
  "negotiator",
  "tech-startup",
] as const;

const VAL_REPRINTS = ["clot"] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.145.0");
});

describe("The Valley v1.109.0 set-complete", () => {
  it("declares the-valley supported after order-and-chaos with 20 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["the-valley"].status).toBe("supported");
    expect(pool.waves["the-valley"].cards).toHaveLength(20);
    expect(pool.corpusOrder[21]).toBe("order-and-chaos");
    expect(pool.corpusOrder[22]).toBe("the-valley");
    expect(pool.corpusOrder[23]).toBe("breaker-bay");
    expect(pool.corpusOrder[24]).toBe("chrome-city");
    expect(pool.corpusOrder[25]).toBe("the-underway");
    expect(pool.corpusOrder[26]).toBe("old-hollywood");
    expect(pool.corpusOrder[28]).toBe("data-and-destiny");
    expect(pool.corpusOrder[29]).toBe("kala-ghoda");
    expect(pool.corpusOrder[30]).toBe("business-first");
    expect(pool.corpusOrder[31]).toBe("democracy-and-dogma");
    expect(pool.corpusOrder[32]).toBe("salsette-island");
    expect(pool.corpusOrder[33]).toBe("the-liberated-mind");
    expect(pool.corpusOrder[34]).toBe("fear-the-masses");
    expect(pool.corpusOrder[43]).toBe("terminal-directive");
    expect(pool.corpusOrder[44]).toBe("earths-scion");
    expect(pool.corpusOrder[45]).toBe("blood-and-water");
    expect(pool.corpusOrder[46]).toBe("free-mars");
    expect(pool.corpusOrder[47]).toBe("crimson-dust");
    expect(pool.corpusOrder[48]).toBe("revised-core");
    expect(pool.corpusOrder[49]).toBe("sovereign-sight");
    expect(pool.corpusOrder[50]).toBe("down-the-white-nile");
    expect(pool.corpusOrder[51]).toBe("council-of-the-crest");
    expect(pool.corpusOrder[52]).toBe("the-devil-and-the-dragon");
    expect(pool.corpusOrder[53]).toBe("whispers-in-nalubaale");
    expect(pool.corpusOrder[54]).toBe("kampala-ascendent");
    expect(pool.corpusOrder[55]).toBe("reign-and-reverie");
  });

  it("clears all 19 VAL cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of VAL_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("the-valley");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onEncounter) expect(validateEffectTree(def.onEncounter)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onInstall) expect(validateEffectTree(def.onInstall)).toBeNull();
      if (def.onFirstInstallEachTurn) {
        expect(validateEffectTree(def.onFirstInstallEachTurn)).toBeNull();
      }
      if (def.onFirstClickLossEachTurnExceptPaidAbility) {
        expect(
          validateEffectTree(def.onFirstClickLossEachTurnExceptPaidAbility),
        ).toBeNull();
      }
      if (def.onFirstDamageEachTurn) {
        expect(validateEffectTree(def.onFirstDamageEachTurn)).toBeNull();
      }
      if (def.onFirstBasicClickDrawEachTurn) {
        expect(validateEffectTree(def.onFirstBasicClickDrawEachTurn)).toBeNull();
      }
      if (def.onFirstSuccessfulRunThisTurn) {
        expect(validateEffectTree(def.onFirstSuccessfulRunThisTurn)).toBeNull();
      }
      if (def.onFullyBreakProtectingIce) {
        expect(validateEffectTree(def.onFullyBreakProtectingIce)).toBeNull();
      }
      for (const face of def.identityFaceOptions ?? []) {
        expect(validateEffectTree(face.onFlip)).toBeNull();
      }
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
    }
  });

  it("skips clot reprint (lives in system-update-2021)", () => {
    loadCardCatalog(true);
    for (const id of VAL_REPRINTS) {
      const def = getCardDef(id);
      expect(def.wave).not.toBe("the-valley");
    }
  });

  it("wires key VAL fields", () => {
    loadCardCatalog(true);
    expect(getCardDef("spike").memoryCostZeroIfLinkGte).toBe(2);
    expect(getCardDef("spike").strengthBonusPerIcebreaker).toBe(1);
    expect(getCardDef("spike").breaker?.breakViaPaidAbilityOnly).toBe(true);
    expect(getCardDef("gene-conditioning-shoppe").geneticsAlsoTriggerSecondTime).toBe(
      true,
    );
    expect(
      getCardDef("traffic-jam").agendaAdvancementRequirementBonusPerCopyInCorpScore,
    ).toBe(1);
    expect(
      getCardDef("brain-taping-warehouse")
        .bioroidIceRezCostReductionPerRunnerClickRemaining,
    ).toBe(1);
    expect(
      getCardDef("jinteki-biotech-life-imagined").chooseIdentityFaceBeforeFirstTurn,
    ).toBe(true);
    expect(
      getCardDef("jinteki-biotech-life-imagined").identityFaceOptions,
    ).toHaveLength(3);
    expect(
      getCardDef("predictive-algorithm").stealAdditionalCreditsWhileRezzed,
    ).toBe(2);
    expect(getCardDef("predictive-algorithm").lingerAsCurrent).toBe(true);
    expect(getCardDef("negotiator").paidAbilities?.[0]?.usableByRunnerOnSelfIce).toBe(
      true,
    );
    expect(getCardDef("cortex-lock").subroutines?.[0]?.effect).toEqual({
      op: "do",
      action: { kind: "net_damage_equal_unused_mu" },
    });
    expect(getCardDef("bandwidth").subroutines?.[0]?.effect).toEqual({
      op: "do",
      action: { kind: "give_tag_remove_if_successful" },
    });
  });
});
