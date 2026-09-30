/**
 * Fear the Masses (ftm) set-complete — floor v1.120.0 → v1.121.0.
 * 18/19 FTM clears (reprint skip magnet). CR pin v26.03.
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

const FTM_CLEARS = [
  "fear-the-masses",
  "aghora",
  "bhagat",
  "the-black-file",
  "the-price-of-freedom",
  "ankusa",
  "rigged-results",
  "lateral-growth",
  "improved-protein-source",
  "voter-intimidation",
  "harishchandra-ent-where-youre-the-star",
  "full-immersion-recstudio",
  "ibrahim-salem",
  "navi-mumbai-city-grid",
  "zealous-judge",
  "election-day",
  "subcontract",
  "merger",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.134.0");
});

describe("Fear the Masses v1.121.0 set-complete", () => {
  it("declares fear-the-masses supported after the-liberated-mind with 19 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["fear-the-masses"].status).toBe("supported");
    expect(pool.waves["fear-the-masses"].cards).toHaveLength(19);
    expect(pool.corpusOrder[33]).toBe("the-liberated-mind");
    expect(pool.corpusOrder[34]).toBe("fear-the-masses");
    expect(pool.corpusOrder[35]).toBe("twenty-three-seconds");
    expect(pool.corpusOrder[36]).toBe("blood-money");
    expect(pool.corpusOrder[37]).toBe("escalation");
    expect(pool.corpusOrder[38]).toBe("intervention");
    expect(pool.corpusOrder[39]).toBe("martial-law");
    expect(pool.corpusOrder[40]).toBe("quorum");
    expect(pool.corpusOrder[41]).toBe("daedalus-complex");
    expect(pool.corpusOrder[42]).toBe("station-one");
    expect(pool.corpusOrder[43]).toBe("terminal-directive");
    expect(pool.corpusOrder[44]).toBe("earths-scion");
    expect(pool.corpusOrder[45]).toBe("blood-and-water");
    expect(pool.corpusOrder[46]).toBe("free-mars");
    expect(pool.corpusOrder[47]).toBe("crimson-dust");
    expect(pool.corpusOrder[48]).toBe("reign-and-reverie");
  });

  it("clears all 18 new FTM cards with empty unsupported (magnet reprint)", () => {
    loadCardCatalog(true);
    for (const id of FTM_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("fear-the-masses");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onRez) expect(validateEffectTree(def.onRez)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onSteal) expect(validateEffectTree(def.onSteal)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onFullyBreak) expect(validateEffectTree(def.onFullyBreak)).toBeNull();
      if (def.playAdditionalCost) {
        expect(validateEffectTree(def.playAdditionalCost)).toBeNull();
      }
      if (def.onPowerCountersGte?.effect) {
        expect(validateEffectTree(def.onPowerCountersGte.effect)).toBeNull();
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
      if (def.onFirstSuccessfulHqRunThisTurn) {
        expect(
          validateEffectTree(def.onFirstSuccessfulHqRunThisTurn),
        ).toBeNull();
      }
    }
    // Reprint lives in another wave
    expect(getCardDef("magnet").wave).not.toBe("fear-the-masses");
  });

  it("wires key FTM fields", () => {
    loadCardCatalog(true);
    expect(getCardDef("fear-the-masses").runEvent?.servers).toBe("hq");
    expect(getCardDef("fear-the-masses").runEvent?.skipBreach).toBe(true);
    expect(getCardDef("fear-the-masses").deckLimit).toBe(6);
    expect(
      getCardDef("aghora").breaker?.breakRequiresIceRezCostGte,
    ).toBe(5);
    expect(getCardDef("bhagat").onFirstSuccessfulHqRunThisTurn).toBeTruthy();
    expect(getCardDef("the-black-file").corpCannotWinExceptFlatline).toBe(true);
    expect(getCardDef("the-black-file").deckLimit).toBe(1);
    expect(getCardDef("the-price-of-freedom").rfgInsteadOfTrashing).toBe(true);
    expect(getCardDef("ankusa").onFullyBreak).toBeTruthy();
    expect(getCardDef("improved-protein-source").onScore).toBeTruthy();
    expect(getCardDef("improved-protein-source").onSteal).toBeTruthy();
    expect(
      getCardDef("voter-intimidation").playRequiresAgendaInRunnerScoreArea,
    ).toBe(true);
    expect(
      getCardDef("harishchandra-ent-where-youre-the-star")
        .revealGripWhileRunnerTagged,
    ).toBe(true);
    expect(getCardDef("full-immersion-recstudio").maxHostedCards).toBe(2);
    expect(getCardDef("full-immersion-recstudio").hostAssetsOrAgendas).toBe(
      true,
    );
    expect(
      getCardDef("full-immersion-recstudio").trashCostIncreasePerHostedCard,
    ).toBe(3);
    expect(
      getCardDef("ibrahim-salem").zeroInfluenceIfNonAllianceFactionCardsGte,
    ).toEqual({ faction: "nbn", threshold: 6 });
    expect(getCardDef("ibrahim-salem").rezAdditionalCostForfeitAgenda).toBe(
      true,
    );
    expect(getCardDef("navi-mumbai-city-grid").limitOnePerServer).toBe(true);
    expect(
      getCardDef("navi-mumbai-city-grid")
        .blockRunnerPaidAbilitiesExceptIcebreakersAndMidAccess,
    ).toBe(true);
    expect(getCardDef("zealous-judge").rezRequiresTagged).toBe(true);
    expect(getCardDef("subcontract").playRequiresTagged).toBe(true);
    expect(
      getCardDef("merger").agendaPointsModifierInRunnerScoreArea,
    ).toBe(1);
  });
});
