/**
 * Creation and Control (cac) set-complete — floor v1.93.0 → v1.95.0.
 * 46/46 CAC-only clears; 9 reprints absorbed. CR pin v26.03.
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

const CAC_CLEARS = [
  "cerebral-imaging-infinite-frontiers",
  "custom-biotics-engineered-for-success",
  "next-design-guarding-the-net",
  "director-haas-pet-project",
  "efficiency-committee",
  "project-wotan",
  "sentinel-defense-program",
  "alix-t4lb07",
  "director-haas",
  "haas-arcology-ai",
  "thomas-haas",
  "bioroid-efficiency-research",
  "successful-demonstration",
  "heimdall-2-0",
  "howler",
  "ichi-2-0",
  "minelayer",
  "viktor-2-0",
  "zed-1-0",
  "awakening-center",
  "tyrs-hand",
  "gila-hands-arcology",
  "levy-university",
  "server-diagnostics",
  "bastion",
  "datapike",
  "the-professor-keeper-of-knowledge",
  "exile-streethawk",
  "escher",
  "exploratory-romp",
  "freelance-coding-contract",
  "scavenge",
  "levy-ar-lab-access",
  "monolith",
  "feedback-filter",
  "clone-chip",
  "omni-drive",
  "cloak",
  "dagger",
  "chakana",
  "cyber-cypher",
  "sahasrara",
  "inti",
  "borrowed-satellite",
  "same-old-thing",
  "the-source",
] as const;

const CAC_REPRINTS = [
  "cerebral-overwriter",
  "rielle-kit-peddler-transhuman",
  "atman",
  "paricia",
  "self-modifying-code",
  "professional-contacts",
  "ice-analyzer",
  "dirty-laundry",
  "daily-casts",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.95.0");
});

describe("Creation and Control v1.95.0 set-complete", () => {
  it("declares creation-and-control supported after future-proof with 55 cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["creation-and-control"].status).toBe("supported");
    expect(pool.waves["creation-and-control"].cards).toHaveLength(55);
    expect(pool.corpusOrder[6]).toBe("future-proof");
    expect(pool.corpusOrder[7]).toBe("creation-and-control");
    expect(pool.corpusOrder[8]).toBe("opening-moves");
    expect(pool.corpusOrder[9]).toBe("reign-and-reverie");
    expect(pool.waves["future-proof"].status).toBe("supported");
  });

  it("clears all 46 CAC-only cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of CAC_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("creation-and-control");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onGameStart) expect(validateEffectTree(def.onGameStart)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onSufferCoreDamage) {
        expect(validateEffectTree(def.onSufferCoreDamage)).toBeNull();
      }
      if (def.onTrashWhileAccessed) {
        expect(validateEffectTree(def.onTrashWhileAccessed)).toBeNull();
      }
      if (def.onInstallProgramFromHeap) {
        expect(validateEffectTree(def.onInstallProgramFromHeap)).toBeNull();
      }
      if (def.onSuccessfulRunOnRd) {
        expect(validateEffectTree(def.onSuccessfulRunOnRd)).toBeNull();
      }
      if (def.onHostFullyBrokenThisEncounter) {
        expect(validateEffectTree(def.onHostFullyBrokenThisEncounter)).toBeNull();
      }
      if (def.onAgendaScoredOrStolen) {
        expect(validateEffectTree(def.onAgendaScoredOrStolen)).toBeNull();
      }
      if (def.onInstall) expect(validateEffectTree(def.onInstall)).toBeNull();
      if (def.playAdditionalCost) {
        expect(validateEffectTree(def.playAdditionalCost)).toBeNull();
      }
      if (def.runEvent?.onSuccessfulRun) {
        expect(validateEffectTree(def.runEvent.onSuccessfulRun)).toBeNull();
      }
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
    }
  });

  it("absorbs 9 reprints from earlier waves", () => {
    for (const id of CAC_REPRINTS) {
      const def = getCardDef(id);
      expect(def.wave).not.toBe("creation-and-control");
      expect(def.unsupported ?? []).toEqual([]);
    }
  });

  it("maps key CAC fields and primitives", () => {
    expect(getCardDef("cerebral-imaging-infinite-frontiers").handSizeEqualsCredits).toBe(
      true,
    );
    expect(getCardDef("heimdall-2-0").bioroidBreakMaxSubs).toBe(2);
    expect(getCardDef("awakening-center").hostsBioroidIceIgnoreInstallCost).toBe(true);
    expect(getCardDef("tyrs-hand").preventSubroutineBreakOnBioroidByTrash).toBe(true);
    expect(getCardDef("director-haas").allottedClicksBonus).toBe(1);
    expect(getCardDef("the-source").stealAdditionalCreditsWhileRezzed).toBe(3);
    expect(getCardDef("the-source").agendaAdvancementRequirementBonus).toBe(1);
    expect(JSON.stringify(getCardDef("escher").runEvent)).toContain(
      "escher_may_instead_of_breach",
    );
    expect(JSON.stringify(getCardDef("bioroid-efficiency-research").onPlay)).toContain(
      "ber_rez_bioroid_and_host",
    );
    expect(getCardDef("cyber-cypher").interfaceRequiresChosenServer).toBe(true);
    expect(getCardDef("omni-drive").hostsAnyProgramMemoryCostLte).toBe(1);
  });
});
