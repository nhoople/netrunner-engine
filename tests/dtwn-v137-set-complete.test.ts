/**
 * Down the White Nile (dtwn) set-complete — floor v1.136.0 → v1.137.0.
 * 20/20 Kitara #2 clears (no reprints). CR pin v26.03.
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
  "acacia",
  "plague",
  "credit-kiting",
  "wari",
  "kabonesa-wu-netspace-thrillseeker",
  "takobi",
  "kongamato",
  "emergent-creativity",
  "rng-key",
  "nightdancer",
  "jinja-city-grid",
  "aimor",
  "bacterial-programming",
  "jua",
  "threat-assessment",
  "economic-warfare",
  "forced-connection",
  "ssl-endorsement",
  "ngo-front",
  "distract-the-masses",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.142.2");
});

describe("Down the White Nile v1.137.0 set-complete", () => {
  it("declares down-the-white-nile supported after sovereign-sight with 20 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["down-the-white-nile"].status).toBe("supported");
    expect(pool.waves["down-the-white-nile"].cards).toHaveLength(20);
    expect(pool.corpusOrder[48]).toBe("revised-core");
    expect(pool.corpusOrder[49]).toBe("sovereign-sight");
    expect(pool.corpusOrder[50]).toBe("down-the-white-nile");
    expect(pool.corpusOrder[51]).toBe("council-of-the-crest");
    expect(pool.corpusOrder[52]).toBe("the-devil-and-the-dragon");
    expect(pool.corpusOrder[53]).toBe("whispers-in-nalubaale");
    expect(pool.corpusOrder[54]).toBe("kampala-ascendent");
    expect(pool.corpusOrder[55]).toBe("reign-and-reverie");
  });

  it("clears all 20 new dtwn cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("down-the-white-nile");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onRez) expect(validateEffectTree(def.onRez)).toBeNull();
      if (def.onInstall) expect(validateEffectTree(def.onInstall)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onSuccessfulRun) {
        expect(validateEffectTree(def.onSuccessfulRun)).toBeNull();
      }
      if (def.onFirstSuccessfulHqRunThisTurn) {
        expect(validateEffectTree(def.onFirstSuccessfulHqRunThisTurn)).toBeNull();
      }
      if (def.onFirstSuccessfulHqOrRdRunThisTurn) {
        expect(
          validateEffectTree(def.onFirstSuccessfulHqOrRdRunThisTurn),
        ).toBeNull();
      }
      if (def.onEncounter) expect(validateEffectTree(def.onEncounter)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onSteal) expect(validateEffectTree(def.onSteal)).toBeNull();
      if (def.onAccess) expect(validateEffectTree(def.onAccess)).toBeNull();
      if (def.onFullyBreak) expect(validateEffectTree(def.onFullyBreak)).toBeNull();
      if (def.onVirusPurge) expect(validateEffectTree(def.onVirusPurge)).toBeNull();
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
    }
  });

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
