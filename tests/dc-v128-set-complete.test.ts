/**
 * Daedalus Complex (dc) set-complete — floor v1.128.0 → v1.128.0.
 * 20/20 Red Sand #1 clears (no reprints). CR pin v26.03.
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
  "pushing-the-envelope",
  "maw",
  "the-archivist",
  "exploit",
  "spot-the-prey",
  "bio-modeled-network",
  "network-exchange",
  "mad-dash",
  "next-wave-2",
  "zed-2-0",
  "defense-construct",
  "synth-dna-modification",
  "kakugo",
  "net-analytics",
  "sync-bre",
  "jemison-astronautics-sacrifice-audacity-success",
  "quarantine-system",
  "oberth-protocol",
  "khondi-plaza",
  "signal-jamming",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.142.0");
});

describe("Daedalus Complex v1.128.0 set-complete", () => {
  it("declares daedalus-complex supported after quorum with 20 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["daedalus-complex"].status).toBe("supported");
    expect(pool.waves["daedalus-complex"].cards).toHaveLength(20);
    expect(pool.corpusOrder[40]).toBe("quorum");
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

  it("clears all 20 new dc cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("daedalus-complex");
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

  it("wires key dc fields (NRDB text)", () => {
    loadCardCatalog(true);
    expect(getCardDef("maw").muBonus).toBe(2);
    expect(
      getCardDef("maw").mawFirstAccessNotArchivesNoStealOrTrashForceCorpTrashHq,
    ).toBe(true);
    expect(getCardDef("the-archivist").link).toBe(1);
    expect(
      getCardDef("the-archivist").archivistOnCorpScoresInitiativeOrSecurityTrace,
    ).toBe(1);
    expect(getCardDef("exploit").playRequiresSuccessfulAllCentralsThisTurn).toBe(
      true,
    );
    expect(getCardDef("network-exchange").iceNotInnermostInstallCostIncrease).toBe(
      1,
    );
    expect(getCardDef("zed-2-0").bioroidBreakMaxSubs).toBe(2);
    expect(getCardDef("defense-construct").canAdvance).toBe(true);
    expect(
      getCardDef("synth-dna-modification").synthDnaFirstApSubBrokenEachTurnNetDamage,
    ).toBe(1);
    expect(
      getCardDef("net-analytics").netAnalyticsMayDrawWhenRunnerAvoidsOrRemovesTags,
    ).toBe(true);
    expect(
      getCardDef("jemison-astronautics-sacrifice-audacity-success")
        .jemisonOnForfeitPlaceAdvancementsEqualAgendaPointsPlus1,
    ).toBe(true);
    expect(getCardDef("oberth-protocol").rezAdditionalCostForfeitAgenda).toBe(
      true,
    );
    expect(
      getCardDef("oberth-protocol").oberthFirstAdvanceThisServerAdditionalAdvancement,
    ).toBe(1);
    expect(
      getCardDef("khondi-plaza").recurringCreditsMaxEqualsRemoteServers,
    ).toBe(true);
    expect(getCardDef("next-wave-2").subtypes).toContain("next");
  });
});
