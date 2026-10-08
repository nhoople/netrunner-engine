/**
 * Council of the Crest (cotc) set-complete — floor v1.137.0 → v1.138.0.
 * 20/20 Kitara #3 clears (no reprints). CR pin v26.03.
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
  "exer",
  "friday-chip",
  "crypt",
  "corporate-grant",
  "no-one-home",
  "marathon",
  "gbahali",
  "white-hat",
  "kuwinda-k4h1u3",
  "next-sapphire",
  "anansi",
  "code-replicator",
  "reverse-infection",
  "azmari-edtech-shaping-the-future",
  "degree-mill",
  "personalized-portal",
  "armed-intimidation",
  "death-and-taxes",
  "trojan-horse",
  "technoco",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.144.0");
});

describe("Council of the Crest v1.138.0 set-complete", () => {
  it("declares council-of-the-crest supported after down-the-white-nile with 20 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["council-of-the-crest"].status).toBe("supported");
    expect(pool.waves["council-of-the-crest"].cards).toHaveLength(20);
    expect(pool.corpusOrder[49]).toBe("sovereign-sight");
    expect(pool.corpusOrder[50]).toBe("down-the-white-nile");
    expect(pool.corpusOrder[51]).toBe("council-of-the-crest");
    expect(pool.corpusOrder[52]).toBe("the-devil-and-the-dragon");
    expect(pool.corpusOrder[53]).toBe("whispers-in-nalubaale");
    expect(pool.corpusOrder[54]).toBe("kampala-ascendent");
    expect(pool.corpusOrder[55]).toBe("reign-and-reverie");
  });

  it("clears all 20 new cotc cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("council-of-the-crest");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onRez) expect(validateEffectTree(def.onRez)).toBeNull();
      if (def.onInstall) expect(validateEffectTree(def.onInstall)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onCorpTurnEnd) {
        expect(validateEffectTree(def.onCorpTurnEnd)).toBeNull();
      }
      if (def.onSuccessfulRun) {
        expect(validateEffectTree(def.onSuccessfulRun)).toBeNull();
      }
      if (def.onBreachRd) expect(validateEffectTree(def.onBreachRd)).toBeNull();
      if (def.onVirusPurge) expect(validateEffectTree(def.onVirusPurge)).toBeNull();
      if (def.onEncounterEndIfNotFullyBroken) {
        expect(validateEffectTree(def.onEncounterEndIfNotFullyBroken)).toBeNull();
      }
      if (def.onPassRezzedIceProtectingThisServer) {
        expect(
          validateEffectTree(def.onPassRezzedIceProtectingThisServer),
        ).toBeNull();
      }
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.stealAdditionalCost) {
        expect(validateEffectTree(def.stealAdditionalCost)).toBeNull();
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

  it("wires key cotc fields (NRDB text)", () => {
    loadCardCatalog(true);
    expect(getCardDef("exer").onBreachRd).toBeTruthy();
    expect(getCardDef("exer").onVirusPurge).toBeTruthy();
    expect(getCardDef("friday-chip").mayPlaceVirusCounterWhenCorpCardTrashed).toBe(
      true,
    );
    expect(getCardDef("crypt").subtypes).toContain("virtual");
    expect(getCardDef("corporate-grant").lingerAsCurrent).toBe(true);
    expect(
      getCardDef("corporate-grant").corpLosesCreditsOnFirstRunnerInstallEachTurn,
    ).toBe(1);
    expect(getCardDef("no-one-home").paidAbilities?.length).toBeGreaterThanOrEqual(
      2,
    );
    expect(getCardDef("marathon").runEvent?.servers).toBe("remote");
    expect(getCardDef("gbahali").subtypes).toContain("virtual");
    expect(getCardDef("white-hat").playRequiresSuccessfulCentralRunThisTurn).toBe(
      true,
    );
    expect(getCardDef("kuwinda-k4h1u3").unique).toBe(true);
    expect(getCardDef("next-sapphire").subtypes).toContain("next");
    expect(getCardDef("anansi").onEncounterEndIfNotFullyBroken).toBeTruthy();
    expect(
      getCardDef("code-replicator").onPassRezzedIceProtectingThisServer,
    ).toBeTruthy();
    expect(getCardDef("reverse-infection").onPlay).toBeTruthy();
    expect(getCardDef("azmari-edtech-shaping-the-future").type).toBe("identity");
    expect(
      getCardDef("azmari-edtech-shaping-the-future")
        .gainCreditsOnFirstRunnerPlayOrInstallNamedType,
    ).toBe(2);
    expect(getCardDef("degree-mill").stealAdditionalCost).toBeTruthy();
    expect(getCardDef("personalized-portal").onTurnBegin).toBeTruthy();
    expect(getCardDef("armed-intimidation").onScore).toBeTruthy();
    expect(getCardDef("death-and-taxes").lingerAsCurrent).toBe(true);
    expect(
      getCardDef("death-and-taxes").mayGainCreditWhenRunnerInstallsOrTrashesInstalled,
    ).toBe(true);
    expect(
      getCardDef("trojan-horse").playRequiresRunnerAccessedCardLastTurn,
    ).toBe(true);
    expect(getCardDef("technoco").programInstallCostIncrease).toBe(1);
    expect(getCardDef("technoco").hardwareInstallCostIncrease).toBe(1);
    expect(getCardDef("technoco").virtualResourceInstallCostIncrease).toBe(1);
  });
});
