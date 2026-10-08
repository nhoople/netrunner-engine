/**
 * Whispers in Nalubaale (win) set-complete — floor v1.139.0 → v1.140.0.
 * 20/20 Kitara #5 clears (no reprints). CR pin v26.03.
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
  CARD_WAVE_DIRS,
} from "../src/index.js";

const CLEARS = [
  "freedom-khumalo-crypto-anarchist",
  "trypano",
  "contaminate",
  "embezzle",
  "slipstream",
  "laamb",
  "gebrselassie",
  "compile",
  "logic-bomb",
  "jackpot",
  "remote-enforcement",
  "kamali-1-0",
  "warden-fatuma",
  "viral-weaponization",
  "envelope",
  "mwanza-city-grid",
  "standard-procedure",
  "intake",
  "masvingo",
  "overseer-matrix",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.144.0");
});

describe("Whispers in Nalubaale v1.140.0 set-complete", () => {
  it("declares whispers-in-nalubaale supported after the-devil-and-the-dragon with 20 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["whispers-in-nalubaale"].status).toBe("supported");
    expect(pool.waves["whispers-in-nalubaale"].cards).toHaveLength(20);
    expect(pool.corpusOrder[51]).toBe("council-of-the-crest");
    expect(pool.corpusOrder[52]).toBe("the-devil-and-the-dragon");
    expect(pool.corpusOrder[53]).toBe("whispers-in-nalubaale");
    expect(pool.corpusOrder[54]).toBe("kampala-ascendent");
    expect(pool.corpusOrder[55]).toBe("reign-and-reverie");
  });

  it("wires whispers-in-nalubaale in CARD_WAVE_DIRS after the-devil-and-the-dragon", () => {
    const idx = CARD_WAVE_DIRS.indexOf("whispers-in-nalubaale");
    expect(idx).toBeGreaterThan(0);
    expect(CARD_WAVE_DIRS[idx - 1]).toBe("the-devil-and-the-dragon");
    expect(CARD_WAVE_DIRS[idx + 1]).toBe("kampala-ascendent");
  });

  it("clears all 20 new win cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("whispers-in-nalubaale");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onRez) expect(validateEffectTree(def.onRez)).toBeNull();
      if (def.onInstall) expect(validateEffectTree(def.onInstall)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onScoreTurnEnd) {
        expect(validateEffectTree(def.onScoreTurnEnd)).toBeNull();
      }
      if (def.onAgendaScored) {
        expect(validateEffectTree(def.onAgendaScored)).toBeNull();
      }
      if (def.onAgendaAddedToRunnerScore) {
        expect(validateEffectTree(def.onAgendaAddedToRunnerScore)).toBeNull();
      }
      if (def.onAccess) expect(validateEffectTree(def.onAccess)).toBeNull();
      if (def.onPassRezzedIce) {
        expect(validateEffectTree(def.onPassRezzedIce)).toBeNull();
      }
      if (def.runEvent?.onSuccessfulRun) {
        expect(validateEffectTree(def.runEvent.onSuccessfulRun)).toBeNull();
      }
      if (def.runEvent?.onRunEnd) {
        expect(validateEffectTree(def.runEvent.onRunEnd)).toBeNull();
      }
      if (def.runEvent?.onFirstEncounterThisRun) {
        expect(
          validateEffectTree(def.runEvent.onFirstEncounterThisRun),
        ).toBeNull();
      }
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
      if (def.gainsSubroutinesPerAdvancement?.subroutine.effect) {
        expect(
          validateEffectTree(def.gainsSubroutinesPerAdvancement.subroutine.effect),
        ).toBeNull();
      }
    }
  });

  it("wires key win fields (NRDB text)", () => {
    loadCardCatalog(true);
    expect(
      getCardDef("freedom-khumalo-crypto-anarchist")
        .accessTrashNonAgendaWithVirusEqualPrintedCost,
    ).toBe(true);
    expect(getCardDef("trypano").installOnIce).toBe(true);
    expect(getCardDef("trypano").trashHostAtVirus).toBe(5);
    expect(getCardDef("contaminate").onPlay).toBeTruthy();
    expect(getCardDef("embezzle").runEvent?.servers).toBe("hq");
    expect(getCardDef("embezzle").runEvent?.skipBreach).toBe(true);
    expect(getCardDef("slipstream").onPassRezzedIce).toBeTruthy();
    expect(getCardDef("laamb").breaker?.breaksSubtype).toBe("barrier");
    expect(getCardDef("laamb").breaker?.breakMaxSubs).toBe(99);
    expect(
      getCardDef("laamb").onEncounterMayPayCreditsGrantIceSubtype?.subtype,
    ).toBe("barrier");
    expect(getCardDef("gebrselassie").unique).toBe(true);
    expect(
      getCardDef("gebrselassie").hostIcebreakerStrengthIncreasesLastRemainderOfTurn,
    ).toBe(true);
    expect(getCardDef("compile").runEvent?.onFirstEncounterThisRun).toBeTruthy();
    expect(getCardDef("compile").runEvent?.onRunEnd).toBeTruthy();
    expect(getCardDef("logic-bomb").paidAbilities?.length).toBe(1);
    expect(getCardDef("jackpot").onTurnBegin).toBeTruthy();
    expect(getCardDef("jackpot").onAgendaAddedToRunnerScore).toBeTruthy();
    expect(getCardDef("remote-enforcement").onAgendaScored).toBeTruthy();
    expect(getCardDef("kamali-1-0").subroutines?.length).toBe(3);
    expect(
      getCardDef("warden-fatuma").bioroidIceGainsLoseClickSubroutineBeforeOthers,
    ).toBe(true);
    expect(getCardDef("viral-weaponization").onScoreTurnEnd).toBeTruthy();
    expect(getCardDef("envelope").subroutines?.length).toBe(2);
    expect(getCardDef("mwanza-city-grid").hqOrRdRootOnly).toBe(true);
    expect(getCardDef("mwanza-city-grid").bonusAccessOnHqBreach).toBe(3);
    expect(getCardDef("mwanza-city-grid").bonusAccessOnRdBreach).toBe(3);
    expect(
      getCardDef("mwanza-city-grid").gainCreditsPerCardAccessedDuringBreach,
    ).toBe(2);
    expect(getCardDef("standard-procedure").playRequiresSuccessfulRunLastTurn).toBe(
      true,
    );
    expect(getCardDef("intake").mustRevealWhenAccessedFromRd).toBe(true);
    expect(getCardDef("intake").skipOnAccessFromArchives).toBe(true);
    expect(getCardDef("masvingo").canAdvance).toBe(true);
    expect(getCardDef("masvingo").gainsSubroutinesPerAdvancement).toBeTruthy();
    expect(getCardDef("overseer-matrix").persistent).toBe(true);
    expect(
      getCardDef("overseer-matrix")
        .mayPayCreditsToTagWhenRunnerTrashesFromThisServerOrRoot?.credits,
    ).toBe(1);
  });
});
