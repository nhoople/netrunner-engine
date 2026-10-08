/**
 * Free Mars (fm) set-complete — floor v1.132.0 → v1.133.0.
 * 20/20 Red Sand #5 clears (no reprints). CR pin v26.03.
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
  "mars-for-martians",
  "god-of-war",
  "leave-no-trace",
  "rip-deal",
  "flashbang",
  "lean-and-mean",
  "maven",
  "nanotk",
  "bloo-moose",
  "o2-shortage",
  "helheim-servers",
  "mandatory-seed-replacement",
  "water-monopoly",
  "metamorph",
  "data-loop",
  "biased-reporting",
  "open-forum",
  "tithonium",
  "transparency-initiative",
  "rover-algorithm",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.144.0");
});

describe("Free Mars v1.133.0 set-complete", () => {
  it("declares free-mars supported after blood-and-water with 20 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["free-mars"].status).toBe("supported");
    expect(pool.waves["free-mars"].cards).toHaveLength(20);
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

  it("clears all 20 new fm cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("free-mars");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onRez) expect(validateEffectTree(def.onRez)).toBeNull();
      if (def.onInstall) expect(validateEffectTree(def.onInstall)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onSuccessfulRun) {
        expect(validateEffectTree(def.onSuccessfulRun)).toBeNull();
      }
      if (def.onEncounter) expect(validateEffectTree(def.onEncounter)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.afterMandatoryDraw) {
        expect(validateEffectTree(def.afterMandatoryDraw)).toBeNull();
      }
      if (def.onAdvance) expect(validateEffectTree(def.onAdvance)).toBeNull();
      if (def.onPassHost) expect(validateEffectTree(def.onPassHost)).toBeNull();
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

  it("wires key fm fields (NRDB text)", () => {
    loadCardCatalog(true);
    expect(getCardDef("mars-for-martians").playRequiresFirstClick).toBe(true);
    expect(getCardDef("god-of-war").breaker?.breaksSubtype).toBe("*");
    expect(getCardDef("leave-no-trace").runEvent?.onRunEnd).toBeTruthy();
    expect(getCardDef("rip-deal").ripDealHeapInsteadOfHqAccess).toBe(true);
    expect(getCardDef("rip-deal").rfgSelfOnRunEnd).toBe(true);
    expect(getCardDef("flashbang").breaker?.breaksSubtype).toBe("sentry");
    expect(
      getCardDef("lean-and-mean").runEvent
        ?.icebreakerStrengthBonusIfInstalledProgramsLte,
    ).toEqual({ programsMax: 3, bonus: 2 });
    expect(getCardDef("maven").strengthBonusPerInstalledProgram).toBe(1);
    expect(
      getCardDef("nanotk").strengthBonusPerIceProtectingAttackedServerDuringRun,
    ).toBe(1);
    expect(getCardDef("nanotk").breaker?.breaksSubtype).toBe("sentry");
    expect(getCardDef("bloo-moose").unique).toBe(true);
    expect(getCardDef("water-monopoly").nonVirtualResourceInstallCostIncrease).toBe(
      1,
    );
    expect(getCardDef("tithonium").cannotHostCards).toBe(true);
    expect(getCardDef("tithonium").rezCostCreditDiscountOnForfeitAgenda).toBe(9);
    expect(getCardDef("open-forum").afterMandatoryDraw).toBeTruthy();
    expect(getCardDef("transparency-initiative").hostAgendaGainsPublic).toBe(true);
    expect(getCardDef("rover-algorithm").hostStrengthPerPowerCounter).toBe(1);
    expect(getCardDef("rover-algorithm").onPassHost).toBeTruthy();
  });
});
