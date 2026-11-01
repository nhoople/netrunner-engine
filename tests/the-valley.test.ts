/**
 * the-valley play tests.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
  loadCardCatalog,
} from "../src/index.js";

describe("the-valley", () => {
  describe("val-v109-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.18");
  });

  describe("The Valley v1.109.0 set-complete", () => {

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
  });
});
