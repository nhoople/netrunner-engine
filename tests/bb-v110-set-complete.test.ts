/**
 * Breaker Bay (bb) set-complete — floor v1.109.0 → v1.110.0.
 * 18/18 BB-only clears (career-fair + turing reprints). CR pin v26.03.
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

const BB_CLEARS = [
  "hacktivist-meeting",
  "off-campus-apartment",
  "dorm-computer",
  "hayley-kaplan-universal-scholar",
  "game-day",
  "comet",
  "study-guide",
  "london-library",
  "tyson-observatory",
  "beach-party",
  "research-grant",
  "crick",
  "recruiting-trip",
  "blacklist",
  "gutenberg",
  "student-loans",
  "meru-mati",
  "breaker-bay-grid",
] as const;

const BB_REPRINTS = ["career-fair", "turing"] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.131.0");
});

describe("Breaker Bay v1.110.0 set-complete", () => {
  it("declares breaker-bay supported after the-valley with 20 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["breaker-bay"].status).toBe("supported");
    expect(pool.waves["breaker-bay"].cards).toHaveLength(20);
    expect(pool.corpusOrder[22]).toBe("the-valley");
    expect(pool.corpusOrder[23]).toBe("breaker-bay");
    expect(pool.corpusOrder[24]).toBe("chrome-city");
    expect(pool.corpusOrder[25]).toBe("the-underway");
    expect(pool.corpusOrder[26]).toBe("old-hollywood");
    expect(pool.corpusOrder[28]).toBe("data-and-destiny");
    expect(pool.corpusOrder[29]).toBe("kala-ghoda");
    expect(pool.corpusOrder[30]).toBe("business-first");
    expect(pool.corpusOrder[31]).toBe("democracy-and-dogma");
    expect(pool.corpusOrder[32]).toBe("salsette-island");
    expect(pool.corpusOrder[33]).toBe("the-liberated-mind");
    expect(pool.corpusOrder[34]).toBe("fear-the-masses");
    expect(pool.corpusOrder[43]).toBe("terminal-directive");
    expect(pool.corpusOrder[44]).toBe("earths-scion");
    expect(pool.corpusOrder[45]).toBe("reign-and-reverie");
  });

  it("clears all 18 BB cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of BB_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("breaker-bay");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onEncounter) expect(validateEffectTree(def.onEncounter)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onInstall) expect(validateEffectTree(def.onInstall)).toBeNull();
      if (def.onFirstInstallEachTurn) {
        expect(validateEffectTree(def.onFirstInstallEachTurn)).toBeNull();
      }
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
    }
  });

  it("skips career-fair and turing reprints", () => {
    loadCardCatalog(true);
    for (const id of BB_REPRINTS) {
      const def = getCardDef(id);
      expect(def.wave).not.toBe("breaker-bay");
    }
  });

  it("wires key BB fields", () => {
    loadCardCatalog(true);
    expect(getCardDef("hacktivist-meeting").lingerAsCurrent).toBe(true);
    expect(getCardDef("hacktivist-meeting").rezNonIceAdditionalCostRandomTrashHq).toBe(
      true,
    );
    expect(getCardDef("off-campus-apartment").hostsConnectionResources).toBe(true);
    expect(getCardDef("off-campus-apartment").drawOnHostConnectionInstall).toBe(1);
    expect(getCardDef("dorm-computer").powerCountersOnInstall).toBe(4);
    expect(getCardDef("game-day").playAdditionalClick).toBe(true);
    expect(getCardDef("comet").muBonus).toBe(1);
    expect(getCardDef("comet").maxConsole).toBe(1);
    expect(getCardDef("comet").onFirstEventEachTurnMayPlayAnother).toBe(true);
    expect(getCardDef("study-guide").strengthPerPowerCounter).toBe(true);
    expect(getCardDef("london-library").trashHostedProgramsOnTurnEnd).toBe(true);
    expect(getCardDef("beach-party").handSizeBonus).toBe(5);
    expect(getCardDef("crick").strengthBonusProtectingArchives).toBe(3);
    expect(getCardDef("recruiting-trip").playCostX).toBe(true);
    expect(getCardDef("blacklist").cardsCannotLeaveRunnerHeap).toBe(true);
    expect(getCardDef("gutenberg").strengthBonusProtectingRd).toBe(3);
    expect(getCardDef("student-loans").eventPlayExtraCostIfCopyInHeap).toBe(2);
    expect(getCardDef("meru-mati").strengthBonusProtectingHq).toBe(3);
    expect(getCardDef("breaker-bay-grid").rootRezCostReductionThisServer).toBe(5);
    expect(getCardDef("hayley-kaplan-universal-scholar").onFirstInstallEachTurn).toBeTruthy();
  });
});
