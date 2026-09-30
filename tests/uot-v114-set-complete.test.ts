/**
 * The Universe of Tomorrow (uot) set-complete — floor v1.113.0 → v1.114.0.
 * 18/18 UOT-only clears (product-placement, public-support reprints). CR pin v26.03.
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

const UOT_CLEARS = [
  "power-to-the-people",
  "surfer",
  "ddos",
  "laramy-fisk-savvy-investor",
  "fisk-investment-seminar",
  "bookmark",
  "davinci",
  "wireless-net-pavilion",
  "cybernetics-court",
  "team-sponsorship",
  "chronos-protocol-selective-mind-mapping",
  "ancestral-imager",
  "genetics-pavilion",
  "franchise-city",
  "worlds-plaza",
  "tour-guide",
  "expo-grid",
  "the-future-is-now",
] as const;

const UOT_REPRINTS = ["product-placement", "public-support"] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.133.0");
});

describe("The Universe of Tomorrow v1.114.0 set-complete", () => {
  it("declares the-universe-of-tomorrow supported after old-hollywood with 20 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["the-universe-of-tomorrow"].status).toBe("supported");
    expect(pool.waves["the-universe-of-tomorrow"].cards).toHaveLength(20);
    expect(pool.corpusOrder[26]).toBe("old-hollywood");
    expect(pool.corpusOrder[27]).toBe("the-universe-of-tomorrow");
    expect(pool.corpusOrder[28]).toBe("data-and-destiny");
    expect(pool.corpusOrder[29]).toBe("kala-ghoda");
    expect(pool.corpusOrder[30]).toBe("business-first");
    expect(pool.corpusOrder[31]).toBe("democracy-and-dogma");
    expect(pool.corpusOrder[32]).toBe("salsette-island");
    expect(pool.corpusOrder[33]).toBe("the-liberated-mind");
    expect(pool.corpusOrder[34]).toBe("fear-the-masses");
    expect(pool.corpusOrder[43]).toBe("terminal-directive");
    expect(pool.corpusOrder[44]).toBe("earths-scion");
    expect(pool.corpusOrder[45]).toBe("blood-and-water");
    expect(pool.corpusOrder[46]).toBe("free-mars");
    expect(pool.corpusOrder[47]).toBe("reign-and-reverie");
  });

  it("clears all 18 UOT cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of UOT_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("the-universe-of-tomorrow");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onSuccessfulRun) {
        expect(validateEffectTree(def.onSuccessfulRun)).toBeNull();
      }
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onAgendaScored) {
        expect(validateEffectTree(def.onAgendaScored)).toBeNull();
      }
      if (def.onFirstSuccessfulCentralRunThisTurn) {
        expect(
          validateEffectTree(def.onFirstSuccessfulCentralRunThisTurn),
        ).toBeNull();
      }
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
    }
  });

  it("skips product-placement and public-support reprints", () => {
    loadCardCatalog(true);
    for (const id of UOT_REPRINTS) {
      const def = getCardDef(id);
      expect(def.wave).not.toBe("the-universe-of-tomorrow");
    }
  });

  it("wires key UOT fields", () => {
    loadCardCatalog(true);
    expect(getCardDef("power-to-the-people").playRequiresFirstClick).toBe(true);
    expect(getCardDef("power-to-the-people").onPlay).toBeTruthy();
    expect(getCardDef("surfer").paidAbilities?.[0]?.requireEncounterSubtype).toBe(
      "barrier",
    );
    expect(getCardDef("ddos").paidAbilities?.[0]?.cost?.trashSelf).toBe(true);
    expect(
      getCardDef("laramy-fisk-savvy-investor").onFirstSuccessfulCentralRunThisTurn,
    ).toBeTruthy();
    expect(getCardDef("fisk-investment-seminar").playRequiresFirstClick).toBe(
      true,
    );
    expect(getCardDef("bookmark").maxHostedCards).toBe(3);
    expect(getCardDef("davinci").onSuccessfulRun).toBeTruthy();
    expect(
      getCardDef("wireless-net-pavilion").basicTrashResourceAdditionalCostCredits,
    ).toBe(2);
    expect(getCardDef("cybernetics-court").handSizeBonus).toBe(4);
    expect(getCardDef("team-sponsorship").onAgendaScored).toBeTruthy();
    expect(
      getCardDef("chronos-protocol-selective-mind-mapping")
        .corpChoosesFirstNetDamageCardEachTurn,
    ).toBe(true);
    expect(getCardDef("ancestral-imager").netDamageOnJackOut).toBe(1);
    expect(getCardDef("genetics-pavilion").runnerCannotDrawMoreThanPerTurn).toBe(
      2,
    );
    expect(getCardDef("franchise-city").mustRevealAgendasAccessedFromRd).toBe(
      true,
    );
    expect(
      getCardDef("franchise-city").addSelfToCorpScoreOnAgendaAccess?.agendaPoints,
    ).toBe(1);
    expect(getCardDef("worlds-plaza").maxHostedCards).toBe(3);
    expect(getCardDef("worlds-plaza").hostAssetsOnly).toBe(true);
    expect(getCardDef("tour-guide").etrSubroutinesPerRezzedAsset).toBe(true);
    expect(getCardDef("expo-grid").onTurnBegin).toBeTruthy();
    expect(getCardDef("the-future-is-now").onScore).toBeTruthy();
  });
});
