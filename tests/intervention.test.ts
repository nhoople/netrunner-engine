/**
 * intervention play tests.
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

describe("intervention", () => {
  describe("in-v125-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.12");
  });

  describe("Intervention v1.125.0 set-complete", () => {

    it("wires key in fields (NRDB text)", () => {
      loadCardCatalog(true);
      expect(getCardDef("the-gauntlet").muBonus).toBe(2);
      expect(
        getCardDef("the-gauntlet").bonusAccessOnHqBreachPerFullyBrokenProtectingIce,
      ).toBe(true);
      expect(getCardDef("saker").breaker?.breaksSubtype).toBe("barrier");
      expect(
        getCardDef("blackstone").paidAbilities?.some(
          (a) => a.cost?.minCreditsFromStealth === 1,
        ),
      ).toBe(true);
      expect(getCardDef("ele-smoke-scovak-cynosure-of-the-net").recurringCreditsMax).toBe(
        1,
      );
      expect(getCardDef("top-hat").mayInsteadOfBreachRdAccessOneOfTopN).toBe(5);
      expect(getCardDef("government-investigations").secretSpendCannotEqual).toBe(
        2,
      );
      expect(getCardDef("government-investigations").lingerAsCurrent).toBe(true);
      expect(
        getCardDef("fumiko-yamamori").meatDamageWhenSecretSpendAmountsDiffer,
      ).toBe(1);
      expect(
        getCardDef("chief-slee").placePowerPerUnbrokenSubOnAnyEncounterEnd,
      ).toBe(true);
      expect(getCardDef("bulwark").badPublicityOnRez).toBe(1);
      expect(getCardDef("preemptive-action").endsActionPhase).toBe(true);
      expect(getCardDef("preemptive-action").rfgInsteadOfTrashing).toBe(true);
      expect(
        getCardDef("wetwork-refit").hostGainsSubroutinesBeforePrinted?.[0]?.text,
      ).toMatch(/core damage/i);
      expect(
        getCardDef("drone-screen").onRunDeclaredOnThisServerIfTagged,
      ).toBeTruthy();
    });
  });
  });
});
