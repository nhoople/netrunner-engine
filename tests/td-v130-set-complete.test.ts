/**
 * Terminal Directive Cards (td) set-complete — floor v1.129.0 → v1.130.0.
 * 43/43 Red Sand deluxe clears (14 reprint skips). Defer tdc. CR pin v26.03.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
  loadCardCatalog,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";

const CLEARS = [
  "brute-force-hack",
  "syn-attack",
  "polyhistor",
  "lustig",
  "mammon",
  "charlatan",
  "maxwell-james",
  "careful-planning",
  "deep-data-mining",
  "llds-memory-diamond",
  "ubax",
  "adept",
  "savant",
  "dhegdheer",
  "levy-advanced-research-lab",
  "laguna-velasco-district",
  "process-automation",
  "officer-frank",
  "dean-lister",
  "biometric-spoofing",
  "the-shadow-net",
  "brain-rewiring",
  "elective-upgrade",
  "estelle-moon",
  "eli-2-0",
  "executive-functioning",
  "holmegaard",
  "tapestry",
  "ultraviolet-clearance",
  "black-level-clearance",
  "skorpios-defense-systems-persuasive-power",
  "armored-servers",
  "illicit-sales",
  "graft",
  "illegal-arms-factory",
  "mr-stone",
  "bloodletter",
  "hailstorm",
  "hunter-seeker",
  "k-p-lynn",
  "honeyfarm",
  "long-term-investment",
  "weir",
] as const;

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
  assertCardsPinnedTag("v1.143.0");
});

describe("Terminal Directive Cards v1.130.0 set-complete", () => {
  it("declares terminal-directive supported after station-one with 57 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["terminal-directive"].status).toBe("supported");
    expect(pool.waves["terminal-directive"].cards).toHaveLength(57);
    expect(pool.corpusOrder[41]).toBe("daedalus-complex");
    expect(pool.corpusOrder[42]).toBe("station-one");
    expect(pool.corpusOrder[43]).toBe("terminal-directive");
    expect(pool.corpusOrder[44]).toBe("earths-scion");
    expect(pool.corpusOrder[45]).toBe("blood-and-water");
    expect(pool.corpusOrder[46]).toBe("free-mars");
    expect(pool.corpusOrder[47]).toBe("crimson-dust");
    expect(pool.corpusOrder[48]).toBe("revised-core");
    expect(pool.corpusOrder[49]).toBe("sovereign-sight");
    expect(pool.corpusOrder[50]).toBe("down-the-white-nile");
    expect(pool.corpusOrder[51]).toBe("council-of-the-crest");
    expect(pool.corpusOrder[52]).toBe("the-devil-and-the-dragon");
    expect(pool.corpusOrder[53]).toBe("whispers-in-nalubaale");
    expect(pool.corpusOrder[54]).toBe("kampala-ascendent");
    expect(pool.corpusOrder[55]).toBe("reign-and-reverie");
  });

  it("clears all 43 new td cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("terminal-directive");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onRez) expect(validateEffectTree(def.onRez)).toBeNull();
      if (def.onInstall) expect(validateEffectTree(def.onInstall)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onRunnerTurnBegin) {
        expect(validateEffectTree(def.onRunnerTurnBegin)).toBeNull();
      }
      if (def.onDiscardPhaseEnd) {
        expect(validateEffectTree(def.onDiscardPhaseEnd)).toBeNull();
      }
      if (def.onSuccessfulRun) {
        expect(validateEffectTree(def.onSuccessfulRun)).toBeNull();
      }
      if (def.onSuccessfulRunThisServer) {
        expect(validateEffectTree(def.onSuccessfulRunThisServer)).toBeNull();
      }
      if (def.onAccess) expect(validateEffectTree(def.onAccess)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onEncounter) expect(validateEffectTree(def.onEncounter)).toBeNull();
      if (def.onPass) expect(validateEffectTree(def.onPass)).toBeNull();
      if (def.onPassAllIceProtectingServer) {
        expect(validateEffectTree(def.onPassAllIceProtectingServer)).toBeNull();
      }
      if (def.runEvent?.onRunEnd) {
        expect(validateEffectTree(def.runEvent.onRunEnd)).toBeNull();
      }
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
    }
  });

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
