/**
 * Martial Law (ml) set-complete — floor v1.125.0 → v1.126.0.
 * 20/20 Flashpoint #5 clears (no reprints). CR pin v26.03.
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
  "mkultra",
  "on-the-lam",
  "cold-read",
  "equivocation",
  "misdirection",
  "reaver",
  "interdiction",
  "baba-yaga",
  "fairchild",
  "friends-in-high-places",
  "manta-grid",
  "mind-game",
  "nihongai-grid",
  "ip-block",
  "thoth",
  "anson-rose",
  "mausolus",
  "sapper",
  "show-of-force",
  "enforced-curfew",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.130.0");
});

describe("Martial Law v1.126.0 set-complete", () => {
  it("declares martial-law supported after intervention with 20 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["martial-law"].status).toBe("supported");
    expect(pool.waves["martial-law"].cards).toHaveLength(20);
    expect(pool.corpusOrder[38]).toBe("intervention");
    expect(pool.corpusOrder[39]).toBe("martial-law");
    expect(pool.corpusOrder[40]).toBe("quorum");
    expect(pool.corpusOrder[41]).toBe("daedalus-complex");
    expect(pool.corpusOrder[42]).toBe("station-one");
    expect(pool.corpusOrder[43]).toBe("terminal-directive");
    expect(pool.corpusOrder[44]).toBe("reign-and-reverie");
  });

  it("clears all 20 new ml cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("martial-law");
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

  it("wires key ml fields (NRDB text)", () => {
    loadCardCatalog(true);
    expect(getCardDef("mkultra").mayInstallSelfFromHeapOnEncounterSentry).toBe(
      true,
    );
    expect(getCardDef("mkultra").breaker?.breaksSubtype).toBe("sentry");
    expect(getCardDef("cold-read").runEvent?.placeEventCredits).toBe(4);
    expect(getCardDef("reaver").drawOnFirstTrashInstalledEachTurn).toBe(true);
    expect(getCardDef("interdiction").cannotRezNonIceDuringRunnerTurn).toBe(
      true,
    );
    expect(getCardDef("interdiction").lingerAsCurrent).toBe(true);
    expect(getCardDef("baba-yaga").hostNonAiIcebreaker).toBe(true);
    expect(getCardDef("baba-yaga").gainsPaidAbilitiesOfHostedIcebreakers).toBe(
      true,
    );
    expect(getCardDef("fairchild").bioroidBreakMaxSubs).toBe(4);
    expect(getCardDef("friends-in-high-places").endsActionPhase).toBe(true);
    expect(
      getCardDef("manta-grid")
        .additionalClickNextTurnOnSuccessfulRunEndIfRunnerLt6cOrNoClicks,
    ).toBe(true);
    expect(getCardDef("sapper").mustRevealWhenAccessedFromRd).toBe(true);
    expect(getCardDef("mausolus").canAdvance).toBe(true);
    expect(
      getCardDef("anson-rose").mayMoveAnyAdvancementsFromSelfToRezzedIce,
    ).toBe(true);
    expect(getCardDef("enforced-curfew").runnerHandSizeBonus).toBe(-1);
    expect(getCardDef("enforced-curfew").lingerAsCurrent).toBe(true);
  });
});
