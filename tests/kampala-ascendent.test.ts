/**
 * kampala-ascendent play tests.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
  loadCardCatalog,
  CARD_WAVE_DIRS,
} from "../src/index.js";

describe("kampala-ascendent", () => {
  describe("ka-v141-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  describe("Kampala Ascendent v1.141.0 set-complete", () => {

    it("wires kampala-ascendent in CARD_WAVE_DIRS after whispers-in-nalubaale", () => {
      const idx = CARD_WAVE_DIRS.indexOf("kampala-ascendent");
      expect(idx).toBeGreaterThan(0);
      expect(CARD_WAVE_DIRS[idx - 1]).toBe("whispers-in-nalubaale");
      expect(CARD_WAVE_DIRS[idx + 1]).toBe("reign-and-reverie");
    });

    it("wires key ka fields (NRDB text)", () => {
      loadCardCatalog(true);
      expect(getCardDef("zer0").unique).toBe(true);
      expect(getCardDef("zer0").paidAbilities?.[0]?.flag).toBe("once_per_turn");
      expect(getCardDef("zer0").paidAbilities?.[0]?.cost?.netDamage).toBe(1);
      expect(getCardDef("musaazi").breaker?.breaksSubtype).toBe("sentry");
      expect(getCardDef("musaazi").breaker?.breakViaPaidAbilityOnly).toBe(true);
      expect(
        getCardDef("hippo").mayRfgSelfToTrashOutermostIceOnFirstFullBreakEachTurn,
      ).toBe(true);
      expect(getCardDef("amina").breaker?.breaksSubtype).toBe("code gate");
      expect(getCardDef("amina").breaker?.breakMaxSubs).toBe(3);
      expect(getCardDef("amina").onFullyBreakOncePerTurn).toBeTruthy();
      expect(getCardDef("diversion-of-funds").playAdditionalClick).toBe(true);
      expect(getCardDef("diversion-of-funds").runEvent?.servers).toBe("hq");
      expect(
        getCardDef("pad-tap").mayGainCreditOnFirstCorpCardAbilityCreditGainEachTurn,
      ).toBe(true);
      expect(getCardDef("pad-tap").paidAbilities?.[0]?.usableByAnyPlayer).toBe(
        true,
      );
      expect(getCardDef("reclaim").paidAbilities?.length).toBe(1);
      expect(
        getCardDef("engolo").onEncounterMayPayCreditsGrantIceSubtype?.subtype,
      ).toBe("code gate");
      expect(getCardDef("flame-out").hostedCreditsOnInstall).toBe(9);
      expect(getCardDef("flame-out").maxHostedCards).toBe(1);
      expect(getCardDef("flame-out").spendHostedCreditsToUseHostedProgram).toBe(
        true,
      );
      expect(
        getCardDef("flame-out").trashHostedProgramAtEndOfTurnIfHostedCreditsUsed,
      ).toBe(true);
      expect(getCardDef("black-hat").onPlay).toBeTruthy();
      expect(
        getCardDef("kasi-string")
          .placePowerOnFirstSuccessfulRemoteRunEndIfBreachedNoSteal,
      ).toBe(true);
      expect(getCardDef("kasi-string").scoreWhenPowerGte).toEqual({
        threshold: 4,
        agendaPoints: 1,
      });
      expect(
        getCardDef("next-diamond").rezCostDiscountPerRezzedSubtype,
      ).toEqual({ subtype: "next", amount: 1 });
      expect(getCardDef("next-diamond").subroutines?.length).toBe(3);
      expect(
        getCardDef("riot-suppression").playRequiresRunnerTrashedCorpCardLastTurn,
      ).toBe(true);
      expect(getCardDef("riot-suppression").rfgInsteadOfTrashing).toBe(true);
      expect(
        getCardDef("mti-mwekundu-life-improved").onApproachServerOncePerTurn,
      ).toBe(true);
      expect(getCardDef("mti-mwekundu-life-improved").onApproachServer).toBeTruthy();
      expect(getCardDef("mlinzi").subroutines?.length).toBe(3);
      expect(
        getCardDef("better-citizen-program")
          .mayTagOnFirstRunEventOrIcebreakerInstallEachTurn,
      ).toBe(true);
      expect(getCardDef("market-forces").playRequiresTagged).toBe(true);
      expect(
        getCardDef("surveyor").strengthBonusPerIceProtectingThisServer,
      ).toBe(2);
      expect(getCardDef("high-profile-target").playRequiresTagged).toBe(true);
      expect(getCardDef("false-flag").canAdvance).toBe(true);
      expect(getCardDef("false-flag").onAccess).toBeTruthy();
      expect(getCardDef("false-flag").paidAbilities?.[0]?.cost?.advancementCounters).toBe(
        7,
      );
    });
  });
  });
});
