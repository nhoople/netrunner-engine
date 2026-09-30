/**
 * Democracy and Dogma (dag) set-complete — floor v1.117.0 → v1.118.0.
 * 19/19 DAG clears (no reprints). CR pin v26.03.
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

const DAG_CLEARS = [
  "political-graffiti",
  "nero-severn-information-broker",
  "reflection",
  "spy-camera",
  "political-operative",
  "sadyojata",
  "freedom-through-equality",
  "akshara-sareen",
  "councilman",
  "voting-machine-initiative",
  "clone-suffrage-movement",
  "bio-ethics-association",
  "political-dealings",
  "clones-are-not-people",
  "sensie-actors-union",
  "commercial-bankers-group",
  "mumbad-city-hall",
  "bailiff",
  "surat-city-grid",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.140.0");
});

describe("Democracy and Dogma v1.118.0 set-complete", () => {
  it("declares democracy-and-dogma supported after business-first with 19 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["democracy-and-dogma"].status).toBe("supported");
    expect(pool.waves["democracy-and-dogma"].cards).toHaveLength(19);
    expect(pool.corpusOrder[30]).toBe("business-first");
    expect(pool.corpusOrder[31]).toBe("democracy-and-dogma");
    expect(pool.corpusOrder[32]).toBe("salsette-island");
    expect(pool.corpusOrder[33]).toBe("the-liberated-mind");
    expect(pool.corpusOrder[34]).toBe("fear-the-masses");
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
    expect(pool.corpusOrder[54]).toBe("reign-and-reverie");
  });

  it("clears all 19 DAG cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of DAG_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("democracy-and-dogma");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onRez) expect(validateEffectTree(def.onRez)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onRunnerTurnBegin) {
        expect(validateEffectTree(def.onRunnerTurnBegin)).toBeNull();
      }
      if (def.onAgendaScored) {
        expect(validateEffectTree(def.onAgendaScored)).toBeNull();
      }
      if (def.onStealAgenda) {
        expect(validateEffectTree(def.onStealAgenda)).toBeNull();
      }
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

  it("wires key DAG fields", () => {
    loadCardCatalog(true);
    expect(getCardDef("political-graffiti").hostAgendaPointsModifier).toBe(-1);
    expect(getCardDef("political-graffiti").trashOnVirusPurge).toBe(true);
    expect(
      getCardDef("nero-severn-information-broker")
        .mayJackOutOnEncounterSentryOncePerTurn,
    ).toBe(true);
    expect(getCardDef("reflection").revealRandomHqOnJackOut).toBe(true);
    expect(getCardDef("reflection").muBonus).toBe(1);
    expect(getCardDef("reflection").maxConsole).toBe(1);
    expect(getCardDef("spy-camera").deckLimit).toBe(6);
    expect(
      getCardDef("political-operative").installRequiresSuccessfulHqRunThisTurn,
    ).toBe(true);
    expect(
      getCardDef("sadyojata").breaker?.breakRequiresIceSubtypeCountGte,
    ).toBe(3);
    expect(getCardDef("freedom-through-equality").lingerAsCurrent).toBe(true);
    expect(getCardDef("akshara-sareen").allottedClicksBonus).toBe(1);
    expect(
      getCardDef("akshara-sareen").corpAllottedClicksBonusWhileInstalled,
    ).toBe(1);
    expect(
      getCardDef("councilman")
        .onCorpRezAssetOrUpgradeMayPayRezCostTrashSelfDerez,
    ).toBe(true);
    expect(getCardDef("voting-machine-initiative").onScore).toBeTruthy();
    expect(
      getCardDef("voting-machine-initiative").onRunnerTurnBegin,
    ).toBeTruthy();
    expect(
      getCardDef("political-dealings").onDrawAgendaMayRevealAndInstall,
    ).toBe(true);
    expect(getCardDef("clones-are-not-people").lingerAsCurrent).toBe(true);
    expect(
      getCardDef("bailiff").gainCreditWheneverRunnerBreaksSubroutine,
    ).toBe(true);
    expect(
      getCardDef("surat-city-grid").onRezOtherCardInRootOrProtectingMayRezDiscount,
    ).toBe(2);
  });
});
