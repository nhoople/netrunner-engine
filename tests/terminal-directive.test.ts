/**
 * terminal-directive play tests.
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

describe("terminal-directive", () => {
  describe("td-v130-set-complete", () => {

  const REPRINTS = [
    "steve-cambridge-master-grifter",
    "spear-phishing",
    "abagnale",
    "demara",
    "ayla-bios-rahim-simulant-specialist",
    "egret",
    "seidr-laboratories-destiny-defined",
    "successful-field-test",
    "marilyn-campaign",
    "mason-bellamy",
    "colossus",
    "hortum",
    "paper-trail",
    "ipo",
  ] as const;

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.14");
  });

  describe("Terminal Directive Cards v1.130.0 set-complete", () => {

    it("wires key td fields (NRDB text)", () => {
      loadCardCatalog(true);
      expect(getCardDef("brute-force-hack").playCostX).toBe(true);
      expect(getCardDef("brute-force-hack").playAdditionalClick).toBe(true);
      expect(getCardDef("syn-attack").playAdditionalClick).toBe(true);
      expect(getCardDef("polyhistor").muBonus).toBe(1);
      expect(getCardDef("polyhistor").link).toBe(1);
      expect(
        getCardDef("polyhistor").polyhistorPassAllHqIceMayDrawForceCorpDraw,
      ).toBe(true);
      expect(getCardDef("careful-planning").playRequiresFirstClick).toBe(true);
      expect(getCardDef("deep-data-mining").runEvent?.bonusAccessUnusedMuCapped).toBe(
        4,
      );
      expect(getCardDef("llds-memory-diamond").handSizeBonus).toBe(1);
      expect(getCardDef("adept").strengthBonusPerUnusedMu).toBe(1);
      expect(getCardDef("savant").strengthBonusPerUnusedMu).toBe(1);
      expect(getCardDef("dhegdheer").daemonHost).toBe(true);
      expect(getCardDef("dhegdheer").daemonHostInstallCreditDiscount).toBe(1);
      expect(getCardDef("dhegdheer").maxHostedCards).toBe(1);
      expect(getCardDef("laguna-velasco-district").basicDrawBonus).toBe(1);
      expect(getCardDef("eli-2-0").bioroidBreakMaxSubs).toBe(2);
      expect(
        getCardDef("skorpios-defense-systems-persuasive-power")
          .skorpiosRfgOneTrashedRunnerCardOncePerTurn,
      ).toBe(true);
      expect(getCardDef("illegal-arms-factory").onTrashWhileRezzedTakeBadPublicity).toBe(
        1,
      );
      expect(getCardDef("mr-stone").meatDamageWhenRunnerTakesTags).toBe(1);
      expect(getCardDef("hunter-seeker").playOnlyIfRunnerStoleAgendaLastTurn).toBe(
        true,
      );
      expect(getCardDef("honeyfarm").mustRevealWhenAccessedFromRd).toBe(true);
      expect(
        getCardDef("long-term-investment").longTermInvestmentGainAbilityAtHostedCredits,
      ).toBe(8);
      expect(getCardDef("ultraviolet-clearance").playAdditionalClicks).toBe(2);
      // Reprints are not written into the td wave directory
      for (const id of REPRINTS) {
        expect(() => getCardDef(id)).not.toThrow();
        expect(getCardDef(id).wave).not.toBe("terminal-directive");
      }
    });
  });
  });
});
