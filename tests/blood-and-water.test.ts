/**
 * blood-and-water play tests.
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

describe("blood-and-water", () => {
  describe("baw-v132-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.18");
  });

  describe("Blood and Water v1.132.0 set-complete", () => {

    it("wires key baw fields (NRDB text)", () => {
      loadCardCatalog(true);
      expect(getCardDef("alice-merchant-clan-agitator").type).toBe("identity");
      expect(getCardDef("alice-merchant-clan-agitator").onSuccessfulRunOncePerTurn).toBe(
        true,
      );
      expect(getCardDef("jarogniew-mercs").trashWhenPowerEmpty).toBe(true);
      expect(
        getCardDef("jarogniew-mercs").corpCannotTrashWhileOtherResourceInstalled,
      ).toBe(true);
      expect(getCardDef("maui").muBonus).toBe(2);
      expect(getCardDef("maui").recurringCreditsMaxEqualsIceProtectingHq).toBe(true);
      expect(getCardDef("bug-out-bag").installCostX).toBe(true);
      expect(getCardDef("bug-out-bag").onTurnEndIfGripEmptyDrawPerPowerThenTrash).toBe(
        true,
      );
      expect(getCardDef("keros-mcintyre").gainCreditsOnFirstDerezIceEachTurn).toBe(2);
      expect(getCardDef("daredevil").drawOnFirstRunEachTurnIfServerIceGte).toEqual({
        ice: 2,
        draw: 2,
      });
      expect(
        getCardDef("mass-driver").fullyBreakNextEncounterFirstNSubsDoNotResolve,
      ).toBe(3);
      expect(getCardDef("obokata-protocol").stealAdditionalCost).toBeTruthy();
      expect(getCardDef("shipment-from-tennin").playRequiresNoSuccessfulRunLastTurn).toBe(
        true,
      );
      expect(getCardDef("success").playAdditionalClicks).toBe(2);
      expect(getCardDef("success").playAdditionalCostForfeitAgenda).toBe(true);
      expect(getCardDef("mass-commercialization").type).toBe("operation");
    });
  });
  });
});
