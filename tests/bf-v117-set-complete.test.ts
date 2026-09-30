/**
 * Business First (bf) set-complete — floor v1.116.0 → v1.117.0.
 * 19/19 BF clears (no reprints). CR pin v26.03.
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

const BF_CLEARS = [
  "emp-device",
  "diwan",
  "cbi-raid",
  "tech-trader",
  "netchip",
  "corporate-scandal",
  "populist-rally",
  "advanced-assembly-lines",
  "lakshmi-smartfabrics",
  "product-recall",
  "palana-foods-sustainable-growth",
  "palana-agroplex",
  "harvester",
  "remote-data-farm",
  "disposable-hq",
  "new-construction",
  "mumbad-construction-co",
  "corporate-sales-team",
  "pad-factory",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.130.0");
});

describe("Business First v1.117.0 set-complete", () => {
  it("declares business-first supported after kala-ghoda with 19 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["business-first"].status).toBe("supported");
    expect(pool.waves["business-first"].cards).toHaveLength(19);
    expect(pool.corpusOrder[29]).toBe("kala-ghoda");
    expect(pool.corpusOrder[30]).toBe("business-first");
    expect(pool.corpusOrder[31]).toBe("democracy-and-dogma");
    expect(pool.corpusOrder[32]).toBe("salsette-island");
    expect(pool.corpusOrder[33]).toBe("the-liberated-mind");
    expect(pool.corpusOrder[34]).toBe("fear-the-masses");
    expect(pool.corpusOrder[43]).toBe("terminal-directive");
    expect(pool.corpusOrder[44]).toBe("reign-and-reverie");
  });

  it("clears all 19 BF cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of BF_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("business-first");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onRez) expect(validateEffectTree(def.onRez)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onRunnerTurnBegin) {
        expect(validateEffectTree(def.onRunnerTurnBegin)).toBeNull();
      }
      if (def.onAdvance) expect(validateEffectTree(def.onAdvance)).toBeNull();
      if (def.onAccess) expect(validateEffectTree(def.onAccess)).toBeNull();
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
      if (def.runEvent?.onSuccessfulRun) {
        expect(validateEffectTree(def.runEvent.onSuccessfulRun)).toBeNull();
      }
    }
  });

  it("wires key BF fields", () => {
    loadCardCatalog(true);
    expect(getCardDef("diwan").chooseServerOnInstall).toBe(true);
    expect(getCardDef("diwan").trashOnVirusPurge).toBe(true);
    expect(getCardDef("diwan").additionalCreditCostToInstallInChosenServer).toBe(
      1,
    );
    expect(getCardDef("tech-trader").gainCreditOnTrashAbilityUse).toBe(true);
    expect(getCardDef("netchip").daemonHost).toBe(true);
    expect(getCardDef("netchip").daemonHostMaxMuFromInstalledCopiesOfSelf).toBe(
      true,
    );
    expect(getCardDef("netchip").hostedProgramMemoryDoesNotCount).toBe(true);
    expect(getCardDef("corporate-scandal").lingerAsCurrent).toBe(true);
    expect(getCardDef("corporate-scandal").corpAdditionalBadPublicity).toBe(1);
    expect(getCardDef("populist-rally").playRequiresInstalledSubtype).toBe(
      "seedy",
    );
    expect(
      getCardDef("palana-foods-sustainable-growth")
        .gainCreditOnFirstRunnerDrawEachTurn,
    ).toBe(true);
    expect(getCardDef("remote-data-farm").handSizeBonus).toBe(2);
    expect(getCardDef("new-construction").installFaceup).toBe(true);
    expect(getCardDef("new-construction").onAdvance).toBeTruthy();
    expect(getCardDef("corporate-sales-team").onScore).toBeTruthy();
    expect(getCardDef("corporate-sales-team").onRunnerTurnBegin).toBeTruthy();
    expect(getCardDef("pad-factory").zeroInfluenceIfCardCopiesGte).toEqual({
      cardId: "pad-campaign",
      threshold: 3,
    });
    expect(getCardDef("lakshmi-smartfabrics").placePowerCounterOnAnyCardRez).toBe(
      true,
    );
    expect(getCardDef("disposable-hq").mustRevealWhenAccessedFromRd).toBe(true);
    expect(getCardDef("cbi-raid").runEvent?.servers).toBe("hq");
  });
});
