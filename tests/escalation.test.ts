/**
 * escalation play tests.
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

describe("escalation", () => {
  describe("es-v124-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.10");
  });

  describe("Escalation v1.124.0 set-complete", () => {

    it("wires key es fields (NRDB text)", () => {
      loadCardCatalog(true);
      expect(getCardDef("obelus").muBonus).toBe(1);
      expect(getCardDef("obelus").handSizeBonusPerTag).toBe(1);
      expect(
        getCardDef("obelus").drawPerAccessOnFirstSuccessfulHqOrRdRunEndEachTurn,
      ).toBe(true);
      expect(
        getCardDef("black-orchestra").mayInstallSelfFromHeapOnEncounterCodeGate,
      ).toBe(true);
      expect(
        getCardDef("omar-keung-conspiracy-theorist").paidAbilities?.[0]?.startsRun
          ?.redirectSuccessChooseHqOrRd,
      ).toBe(true);
      expect(getCardDef("peregrine").breaker?.breaksSubtype).toBe("code gate");
      expect(
        getCardDef("houdini").paidAbilities?.some(
          (a) => a.cost?.minCreditsFromStealth === 1,
        ),
      ).toBe(true);
      expect(
        getCardDef("net-mercur").firstStealthSpendEachRunPlaceCreditOrDraw,
      ).toBe(true);
      expect(getCardDef("find-the-truth").revealDrawnCards).toBe(true);
      expect(getCardDef("fairchild-3-0").bioroidBreakMaxSubs).toBe(3);
      expect(
        getCardDef("hellion-beta-test").playRequiresRunnerTrashedCorpCardLastTurn,
      ).toBe(true);
      expect(
        getCardDef("jinteki-potential-unleashed").trashTopOfStackOnRunnerNetDamage,
      ).toBe(true);
      expect(getCardDef("observe-and-destroy").playRequiresRunnerCreditsLt).toBe(
        6,
      );
      expect(
        getCardDef("service-outage").runnerFirstRunEachTurnAdditionalCost,
      ).toBe(1);
      expect(getCardDef("boom").playRequiresMinTags).toBe(2);
      expect(getCardDef("boom").playAdditionalClick).toBe(true);
      expect(getCardDef("door-to-door").lingerAsCurrent).toBe(true);
      expect(getCardDef("scarcity-of-resources").resourceInstallCostIncrease).toBe(
        2,
      );
    });
  });
  });
});
