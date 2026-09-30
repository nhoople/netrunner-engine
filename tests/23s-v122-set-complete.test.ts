/**
 * 23 Seconds (23s) set-complete — floor v1.121.0 → v1.122.0.
 * 20/20 Flashpoint #1 clears (no reprints). CR pin v26.03.
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
  "system-outage",
  "null-whistleblower",
  "gpi-net-tap",
  "hernando-cortez",
  "mirror",
  "dai-v",
  "another-day-another-paycheck",
  "deuces-wild",
  "injection-attack",
  "fairchild-1-0",
  "sherlock-2-0",
  "hyoubu-research-facility",
  "chrysalis",
  "georgia-emelyov",
  "watchdog",
  "hard-hitting-news",
  "nbn-controlling-the-message",
  "crisis-management",
  "stock-buy-back",
  "sandburg",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.125.0");
});

describe("23 Seconds v1.122.0 set-complete", () => {
  it("declares twenty-three-seconds supported after fear-the-masses with 20 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["twenty-three-seconds"].status).toBe("supported");
    expect(pool.waves["twenty-three-seconds"].cards).toHaveLength(20);
    expect(pool.corpusOrder[34]).toBe("fear-the-masses");
    expect(pool.corpusOrder[35]).toBe("twenty-three-seconds");
    expect(pool.corpusOrder[36]).toBe("blood-money");
    expect(pool.corpusOrder[37]).toBe("escalation");
    expect(pool.corpusOrder[38]).toBe("intervention");
    expect(pool.corpusOrder[39]).toBe("reign-and-reverie");
  });

  it("clears all 20 new 23s cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("twenty-three-seconds");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onRez) expect(validateEffectTree(def.onRez)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onSteal) expect(validateEffectTree(def.onSteal)).toBeNull();
      if (def.onStealAgenda) {
        expect(validateEffectTree(def.onStealAgenda)).toBeNull();
      }
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onTurnBeginIfRunnerTagged) {
        expect(validateEffectTree(def.onTurnBeginIfRunnerTagged)).toBeNull();
      }
      if (def.onAccess) expect(validateEffectTree(def.onAccess)).toBeNull();
      if (def.onEncounterAnyIceOncePerTurn) {
        expect(validateEffectTree(def.onEncounterAnyIceOncePerTurn)).toBeNull();
      }
      if (def.onUnsuccessfulRunOnThisServer) {
        expect(
          validateEffectTree(def.onUnsuccessfulRunOnThisServer),
        ).toBeNull();
      }
      if (def.onFirstCorpCardTrashEachTurn) {
        expect(
          validateEffectTree(def.onFirstCorpCardTrashEachTurn),
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

  it("wires key 23s fields (NRDB text)", () => {
    loadCardCatalog(true);
    expect(getCardDef("system-outage").lingerAsCurrent).toBe(true);
    expect(getCardDef("system-outage").corpLosesCreditsOnNonFirstDrawThisTurn).toBe(
      1,
    );
    expect(getCardDef("null-whistleblower").onEncounterAnyIceOncePerTurn).toBeTruthy();
    expect(
      getCardDef("gpi-net-tap").mayExposeApproachedIceThenMayTrashSelfToJackOut,
    ).toBe(true);
    expect(
      getCardDef("hernando-cortez")
        .additionalIceRezCostEqualToSubroutineCountWhenCorpCreditsGte,
    ).toBe(10);
    expect(getCardDef("mirror").muBonus).toBe(2);
    expect(getCardDef("mirror").maxConsole).toBe(1);
    expect(
      getCardDef("mirror").onSuccessfulRdRunMayReplaceSpentRecurringCredit,
    ).toBe(true);
    expect(getCardDef("dai-v").breaker?.breakMaxSubs).toBe(99);
    expect(getCardDef("another-day-another-paycheck").lingerAsCurrent).toBe(
      true,
    );
    expect(getCardDef("another-day-another-paycheck").onStealAgenda).toBeTruthy();
    expect(getCardDef("fairchild-1-0").bioroidBreakMaxSubs).toBe(1);
    expect(getCardDef("sherlock-2-0").bioroidBreakMaxSubs).toBe(2);
    expect(
      getCardDef("hyoubu-research-facility")
        .firstRevealSecretlySpentCreditsGainThatManyEachTurn,
    ).toBe(true);
    expect(getCardDef("chrysalis").mustRevealWhenAccessedFromRd).toBe(true);
    expect(getCardDef("georgia-emelyov").onUnsuccessfulRunOnThisServer).toBeTruthy();
    expect(getCardDef("watchdog").firstIceRezCostReductionPerRunnerTag).toBe(
      true,
    );
    expect(getCardDef("hard-hitting-news").endsActionPhase).toBe(true);
    expect(
      getCardDef("hard-hitting-news").playRequiresRunnerMadeRunLastTurn,
    ).toBe(true);
    expect(
      getCardDef("nbn-controlling-the-message").onFirstCorpCardTrashEachTurn,
    ).toBeTruthy();
    expect(getCardDef("crisis-management").onTurnBeginIfRunnerTagged).toBeTruthy();
    expect(getCardDef("stock-buy-back").endsActionPhase).toBe(true);
    expect(
      getCardDef("sandburg").iceStrengthBonusPerFiveCorpCreditsWhenCorpCreditsGte,
    ).toEqual({ threshold: 10, perCredits: 5, bonus: 1 });
  });
});
