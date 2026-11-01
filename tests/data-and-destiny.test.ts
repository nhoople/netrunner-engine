/**
 * data-and-destiny play tests.
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

describe("data-and-destiny", () => {
  describe("dad-v115-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.18");
  });

  describe("Data and Destiny v1.115.0 set-complete", () => {

    it("wires key DAD fields", () => {
      loadCardCatalog(true);
      expect(
        getCardDef("sync-everything-everywhere")
          .basicRemoveTagAdditionalCostCreditsWhileUnflipped,
      ).toBe(1);
      expect(
        getCardDef("sync-everything-everywhere")
          .basicTrashResourceCreditReductionWhileFlipped,
      ).toBe(2);
      expect(getCardDef("new-angeles-sol-your-news").onAgendaScoredOrStolen).toBeTruthy();
      expect(getCardDef("15-minutes").paidAbilities?.[0]?.usableFromRunnerScoreArea).toBe(
        true,
      );
      expect(getCardDef("improved-tracers").iceStrengthBonusForSubtype?.subtype).toBe(
        "tracer",
      );
      expect(getCardDef("improved-tracers").subroutineTraceBaseStrengthBonus).toBe(1);
      expect(getCardDef("rebranding-team").assetsGainSubtype).toBe("advertisement");
      expect(
        getCardDef("quantum-predictive-model").addToCorpScoreOnAccessIfRunnerTagged,
      ).toBe(true);
      expect(getCardDef("victoria-jenkins").runnerAllottedClicksBonus).toBe(-1);
      expect(getCardDef("news-hound").gainsEtrSubroutineWhileCurrentActive).toBe(true);
      expect(getCardDef("resistor").strengthBonusPerRunnerTag).toBe(1);
      expect(getCardDef("24-7-news-cycle").playAdditionalCostForfeitAgenda).toBe(true);
      expect(getCardDef("ad-blitz").playCostX).toBe(true);
      expect(getCardDef("surveillance-sweep").runnerSpendsFirstForTracesDuringRun).toBe(
        true,
      );
      expect(
        getCardDef("rutherford-grid").traceBaseStrengthBonusDuringRunOnThisServer,
      ).toBe(2);
      expect(
        getCardDef("global-food-initiative").agendaPointsModifierInRunnerScoreArea,
      ).toBe(-1);
      expect(getCardDef("apex-invasive-predator").cannotInstallNonVirtualResources).toBe(
        true,
      );
      expect(getCardDef("apocalypse").playRequiresSuccessfulAllCentralsThisTurn).toBe(
        true,
      );
      expect(
        getCardDef("prey").runEvent?.onPassIceMayTrashEqualStrengthToTrashIce,
      ).toBe(true);
      expect(getCardDef("harbinger").turnFacedownInsteadOfHeapWhenTrashed).toBe(true);
      expect(getCardDef("adam-compulsive-hacker").startWithDirectiveCards).toBe(3);
      expect(getCardDef("brain-chip").muEqualsAgendaPoints).toBe(true);
      expect(getCardDef("always-be-running").firstClickMustBeRunOrRunEvent).toBe(true);
      expect(getCardDef("gs-striker-m1").memoryCostZeroIfLinkGte).toBe(2);
      expect(getCardDef("gs-striker-m1").breaker?.breakMaxSubs).toBe(99);
      expect(getCardDef("employee-strike").blankCorpIdentityPrintedAbilities).toBe(true);
      expect(
        getCardDef("technical-writer").hostedCreditsOnProgramOrHardwareInstall,
      ).toBe(1);
      expect(getCardDef("sunny-lebeau-security-specialist").link).toBe(2);
    });
  });
  });
});
