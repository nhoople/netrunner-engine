/**
 * free-mars play tests.
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

describe("free-mars", () => {
  describe("fm-v133-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.16");
  });

  describe("Free Mars v1.133.0 set-complete", () => {

    it("wires key fm fields (NRDB text)", () => {
      loadCardCatalog(true);
      expect(getCardDef("mars-for-martians").playRequiresFirstClick).toBe(true);
      expect(getCardDef("god-of-war").breaker?.breaksSubtype).toBe("*");
      expect(getCardDef("leave-no-trace").runEvent?.onRunEnd).toBeTruthy();
      expect(getCardDef("rip-deal").ripDealHeapInsteadOfHqAccess).toBe(true);
      expect(getCardDef("rip-deal").rfgSelfOnRunEnd).toBe(true);
      expect(getCardDef("flashbang").breaker?.breaksSubtype).toBe("sentry");
      expect(
        getCardDef("lean-and-mean").runEvent
          ?.icebreakerStrengthBonusIfInstalledProgramsLte,
      ).toEqual({ programsMax: 3, bonus: 2 });
      expect(getCardDef("maven").strengthBonusPerInstalledProgram).toBe(1);
      expect(
        getCardDef("nanotk").strengthBonusPerIceProtectingAttackedServerDuringRun,
      ).toBe(1);
      expect(getCardDef("nanotk").breaker?.breaksSubtype).toBe("sentry");
      expect(getCardDef("bloo-moose").unique).toBe(true);
      expect(getCardDef("water-monopoly").nonVirtualResourceInstallCostIncrease).toBe(
        1,
      );
      expect(getCardDef("tithonium").cannotHostCards).toBe(true);
      expect(getCardDef("tithonium").rezCostCreditDiscountOnForfeitAgenda).toBe(9);
      expect(getCardDef("open-forum").afterMandatoryDraw).toBeTruthy();
      expect(getCardDef("transparency-initiative").hostAgendaGainsPublic).toBe(true);
      expect(getCardDef("rover-algorithm").hostStrengthPerPowerCounter).toBe(1);
      expect(getCardDef("rover-algorithm").onPassHost).toBeTruthy();
    });
  });
  });
});
