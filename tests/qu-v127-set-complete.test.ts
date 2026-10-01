/**
 * Quorum (qu) set-complete — floor v1.126.0 → v1.128.0.
 * 20/20 Flashpoint #6 cycle closer clears (no reprints). CR pin v26.03.
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
  "sifr",
  "sunya",
  "recon-drone",
  "tapwrm",
  "tracker",
  "aaron-marron",
  "encore",
  "fawkes",
  "peace-in-our-time",
  "sensor-net-activation",
  "violet-level-clearance",
  "chiyashi",
  "psychokinesis",
  "net-quarantine",
  "herald",
  "veritas",
  "bryan-stinson",
  "nasx",
  "macrophage",
  "tribunal",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.142.0");
});

describe("Quorum v1.128.0 set-complete", () => {
  it("declares quorum supported after martial-law with 20 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["quorum"].status).toBe("supported");
    expect(pool.waves["quorum"].cards).toHaveLength(20);
    expect(pool.corpusOrder[39]).toBe("martial-law");
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

  it("clears all 20 new qu cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("quorum");
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
      if (def.onSuccessfulRunOnRd) {
        expect(validateEffectTree(def.onSuccessfulRunOnRd)).toBeNull();
      }
      if (def.onSuccessfulRunOnThisServer) {
        expect(validateEffectTree(def.onSuccessfulRunOnThisServer)).toBeNull();
      }
      if (def.onAccess) expect(validateEffectTree(def.onAccess)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onEncounter) expect(validateEffectTree(def.onEncounter)).toBeNull();
      if (def.onAgendaScoredOrStolen) {
        expect(validateEffectTree(def.onAgendaScoredOrStolen)).toBeNull();
      }
      if (def.onFullyBreak) {
        expect(validateEffectTree(def.onFullyBreak)).toBeNull();
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

  it("wires key qu fields (NRDB text)", () => {
    loadCardCatalog(true);
    expect(getCardDef("sifr").muBonus).toBe(2);
    expect(getCardDef("sifr").sifrMayZeroEncounterIceStrengthOncePerTurn).toBe(
      true,
    );
    expect(getCardDef("sunya").strengthPerPowerCounter).toBe(true);
    expect(getCardDef("sunya").breaker?.breaksSubtype).toBe("sentry");
    expect(
      getCardDef("tapwrm").installRequiresSuccessfulCentralRunThisTurn,
    ).toBe(true);
    expect(getCardDef("tapwrm").trashOnVirusPurge).toBe(true);
    expect(getCardDef("encore").playRequiresSuccessfulAllCentralsThisTurn).toBe(
      true,
    );
    expect(getCardDef("encore").rfgInsteadOfTrashing).toBe(true);
    expect(getCardDef("peace-in-our-time").playRequiresFirstClick).toBe(true);
    expect(
      getCardDef("peace-in-our-time").playRequiresCorpScoredNoAgendasLastTurn,
    ).toBe(true);
    expect(getCardDef("violet-level-clearance").endsActionPhase).toBe(true);
    expect(getCardDef("chiyashi").trashTopOfStackOnBreakSubIfRunnerHasAi).toBe(
      2,
    );
    expect(getCardDef("herald").mustRevealWhenAccessedFromRd).toBe(true);
    expect(
      getCardDef("net-quarantine").firstTraceEachTurnRunnerLinkTreatedAs0,
    ).toBe(true);
    expect(
      getCardDef("bryan-stinson").bryanStinsonPlayArchivesTransactionWhileRunnerLt6c,
    ).toBe(true);
    expect(
      getCardDef("nasx").nasxMaySpendUpTo2OnAbilityCreditGainToPlacePower,
    ).toBe(true);
  });
});
