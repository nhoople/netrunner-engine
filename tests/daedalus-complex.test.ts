/**
 * daedalus-complex play tests.
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

describe("daedalus-complex", () => {
  describe("dc-v128-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.18");
  });

  describe("Daedalus Complex v1.128.0 set-complete", () => {

    it("wires key dc fields (NRDB text)", () => {
      loadCardCatalog(true);
      expect(getCardDef("maw").muBonus).toBe(2);
      expect(
        getCardDef("maw").mawFirstAccessNotArchivesNoStealOrTrashForceCorpTrashHq,
      ).toBe(true);
      expect(getCardDef("the-archivist").link).toBe(1);
      expect(
        getCardDef("the-archivist").archivistOnCorpScoresInitiativeOrSecurityTrace,
      ).toBe(1);
      expect(getCardDef("exploit").playRequiresSuccessfulAllCentralsThisTurn).toBe(
        true,
      );
      expect(getCardDef("network-exchange").iceNotInnermostInstallCostIncrease).toBe(
        1,
      );
      expect(getCardDef("zed-2-0").bioroidBreakMaxSubs).toBe(2);
      expect(getCardDef("defense-construct").canAdvance).toBe(true);
      expect(
        getCardDef("synth-dna-modification").synthDnaFirstApSubBrokenEachTurnNetDamage,
      ).toBe(1);
      expect(
        getCardDef("net-analytics").netAnalyticsMayDrawWhenRunnerAvoidsOrRemovesTags,
      ).toBe(true);
      expect(
        getCardDef("jemison-astronautics-sacrifice-audacity-success")
          .jemisonOnForfeitPlaceAdvancementsEqualAgendaPointsPlus1,
      ).toBe(true);
      expect(getCardDef("oberth-protocol").rezAdditionalCostForfeitAgenda).toBe(
        true,
      );
      expect(
        getCardDef("oberth-protocol").oberthFirstAdvanceThisServerAdditionalAdvancement,
      ).toBe(1);
      expect(
        getCardDef("khondi-plaza").recurringCreditsMaxEqualsRemoteServers,
      ).toBe(true);
      expect(getCardDef("next-wave-2").subtypes).toContain("next");
    });
  });
  });
});
