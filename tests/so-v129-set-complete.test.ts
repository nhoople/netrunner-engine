/**
 * Station One (so) set-complete — floor v1.128.0 → v1.129.0.
 * 20/20 Red Sand #2 clears (no reprints). CR pin v26.03.
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
  "severnius-stim-implant",
  "clan-vengeance",
  "counter-surveillance",
  "mobius",
  "los-data-hijacker",
  "system-seizure",
  "customized-secretary",
  "build-script",
  "seidr-adaptive-barrier",
  "nerine-2-0",
  "load-testing",
  "bloom",
  "replanting",
  "cpc-generator",
  "free-lunch",
  "mca-informant",
  "clyde-van-rite",
  "watchtower",
  "sacrifice",
  "self-adapting-code-wall",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.131.0");
});

describe("Station One v1.129.0 set-complete", () => {
  it("declares station-one supported after daedalus-complex with 20 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["station-one"].status).toBe("supported");
    expect(pool.waves["station-one"].cards).toHaveLength(20);
    expect(pool.corpusOrder[40]).toBe("quorum");
    expect(pool.corpusOrder[41]).toBe("daedalus-complex");
    expect(pool.corpusOrder[42]).toBe("station-one");
    expect(pool.corpusOrder[43]).toBe("terminal-directive");
    expect(pool.corpusOrder[44]).toBe("earths-scion");
    expect(pool.corpusOrder[45]).toBe("reign-and-reverie");
  });

  it("clears all 20 new so cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("station-one");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onRez) expect(validateEffectTree(def.onRez)).toBeNull();
      if (def.onInstall) expect(validateEffectTree(def.onInstall)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onRunnerTurnBegin) {
        expect(validateEffectTree(def.onRunnerTurnBegin)).toBeNull();
      }
      if (def.onSuccessfulRun) {
        expect(validateEffectTree(def.onSuccessfulRun)).toBeNull();
      }
      if (def.onAccess) expect(validateEffectTree(def.onAccess)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onEncounter) expect(validateEffectTree(def.onEncounter)).toBeNull();
      if (def.onPass) expect(validateEffectTree(def.onPass)).toBeNull();
      if (def.onFirstIceRezEachTurn) {
        expect(validateEffectTree(def.onFirstIceRezEachTurn)).toBeNull();
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

  it("wires key so fields (NRDB text)", () => {
    loadCardCatalog(true);
    expect(getCardDef("clan-vengeance").placePowerCounterOnSufferAnyDamage).toBe(
      true,
    );
    expect(
      getCardDef("seidr-adaptive-barrier").strengthBonusPerIceProtectingThisServer,
    ).toBe(1);
    expect(
      getCardDef("system-seizure").systemSeizureFirstPumpStrengthLastsRemainderOfRun,
    ).toBe(true);
    expect(getCardDef("system-seizure").lingerAsCurrent).toBe(true);
    expect(getCardDef("nerine-2-0").bioroidBreakMaxSubs).toBe(2);
    expect(
      getCardDef("cpc-generator").corpGainsOnFirstRunnerBasicGainCreditEachTurn,
    ).toBe(1);
    expect(getCardDef("mca-informant").endsActionPhase).toBe(true);
    expect(getCardDef("sacrifice").playAdditionalCostForfeitAgenda).toBe(true);
    expect(getCardDef("self-adapting-code-wall").strengthCannotBeLowered).toBe(
      true,
    );
    expect(getCardDef("replanting").playAdditionalClick).toBe(true);
    expect(getCardDef("los-data-hijacker").type).toBe("identity");
  });
});
