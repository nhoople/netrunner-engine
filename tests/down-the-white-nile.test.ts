/**
 * down-the-white-nile play tests.
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

describe("down-the-white-nile", () => {
  describe("dtwn-v137-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.8");
  });

  describe("Down the White Nile v1.137.0 set-complete", () => {

    it("wires key dtwn fields (NRDB text)", () => {
      loadCardCatalog(true);
      expect(getCardDef("acacia").onVirusPurge).toBeTruthy();
      expect(getCardDef("plague").onInstall).toBeTruthy();
      expect(getCardDef("credit-kiting").playRequiresSuccessfulCentralRunThisTurn).toBe(
        true,
      );
      expect(getCardDef("wari").onFirstSuccessfulHqRunThisTurn).toBeTruthy();
      expect(getCardDef("kabonesa-wu-netspace-thrillseeker").type).toBe("identity");
      expect(getCardDef("takobi").onFullyBreak).toBeTruthy();
      expect(getCardDef("kongamato").subtypes).toContain("virtual");
      expect(getCardDef("emergent-creativity").playAdditionalClick).toBe(true);
      expect(getCardDef("rng-key").onFirstSuccessfulHqOrRdRunThisTurn).toBeTruthy();
      expect(getCardDef("nightdancer").subroutines).toHaveLength(2);
      expect(
        getCardDef("jinja-city-grid")
          .onDrawIceMayRevealAndInstallProtectingThisServerPayingLess,
      ).toBe(4);
      expect(getCardDef("jinja-city-grid").limitOnePerServer).toBe(true);
      expect(getCardDef("aimor").subtypes).toContain("trap");
      expect(getCardDef("bacterial-programming").onScore).toBeTruthy();
      expect(getCardDef("bacterial-programming").onSteal).toBeTruthy();
      expect(getCardDef("jua").onEncounter).toBeTruthy();
      expect(
        getCardDef("threat-assessment").playRequiresRunnerTrashedCorpCardLastTurn,
      ).toBe(true);
      expect(getCardDef("threat-assessment").playRequiresRunnerHasInstalledCard).toBe(
        true,
      );
      expect(getCardDef("economic-warfare").playRequiresSuccessfulRunLastTurn).toBe(
        true,
      );
      expect(getCardDef("forced-connection").mustRevealWhenAccessedFromRd).toBe(true);
      expect(getCardDef("ssl-endorsement").onTurnBeginFromRunnerScoreOnCorpTurn).toBe(
        true,
      );
      expect(getCardDef("ngo-front").canAdvance).toBe(true);
      expect(getCardDef("distract-the-masses").rfgInsteadOfTrashing).toBe(true);
    });
  });
  });
});
