/**
 * Intervention (in) set-complete — floor v1.124.0 → v1.125.0.
 * 18/20 Flashpoint #4 clears (reprint skips en-passant, HB:AOT). CR pin v26.03.
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
  "frantic-coding",
  "the-gauntlet",
  "saker",
  "blockade-runner",
  "ele-smoke-scovak-cynosure-of-the-net",
  "top-hat",
  "blackstone",
  "government-investigations",
  "citadel-sanctuary",
  "wetwork-refit",
  "fumiko-yamamori",
  "hasty-relocation",
  "data-ward",
  "drone-screen",
  "chief-slee",
  "bulwark",
  "best-defense",
  "preemptive-action",
] as const;

const REPRINTS = [
  "en-passant",
  "haas-bioroid-architects-of-tomorrow",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.142.1");
});

describe("Intervention v1.125.0 set-complete", () => {
  it("declares intervention supported after escalation with 20 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["intervention"].status).toBe("supported");
    expect(pool.waves["intervention"].cards).toHaveLength(20);
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
    expect(pool.corpusOrder[48]).toBe("revised-core");
    expect(pool.corpusOrder[49]).toBe("sovereign-sight");
    expect(pool.corpusOrder[50]).toBe("down-the-white-nile");
    expect(pool.corpusOrder[51]).toBe("council-of-the-crest");
    expect(pool.corpusOrder[52]).toBe("the-devil-and-the-dragon");
    expect(pool.corpusOrder[53]).toBe("whispers-in-nalubaale");
    expect(pool.corpusOrder[54]).toBe("kampala-ascendent");
    expect(pool.corpusOrder[55]).toBe("reign-and-reverie");
  });

  it("clears all 18 new in cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("intervention");
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
      if (def.onDiscardPhaseEnd) {
        expect(validateEffectTree(def.onDiscardPhaseEnd)).toBeNull();
      }
      if (def.playAdditionalCost) {
        expect(validateEffectTree(def.playAdditionalCost)).toBeNull();
      }
      if (def.onRunDeclaredOnThisServerIfTagged) {
        expect(
          validateEffectTree(def.onRunDeclaredOnThisServerIfTagged),
        ).toBeNull();
      }
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
      for (const sub of def.hostGainsSubroutinesBeforePrinted ?? []) {
        expect(validateEffectTree(sub.effect)).toBeNull();
      }
    }
  });

  it("absorbs reprint ids from earlier waves", () => {
    loadCardCatalog(true);
    for (const id of REPRINTS) {
      const def = getCardDef(id);
      expect(def.wave).not.toBe("intervention");
      expect(def.unsupported ?? []).toEqual([]);
    }
  });

  it("wires key in fields (NRDB text)", () => {
    loadCardCatalog(true);
    expect(getCardDef("the-gauntlet").muBonus).toBe(2);
    expect(
      getCardDef("the-gauntlet").bonusAccessOnHqBreachPerFullyBrokenProtectingIce,
    ).toBe(true);
    expect(getCardDef("saker").breaker?.breaksSubtype).toBe("barrier");
    expect(
      getCardDef("blackstone").paidAbilities?.some(
        (a) => a.cost?.minCreditsFromStealth === 1,
      ),
    ).toBe(true);
    expect(getCardDef("ele-smoke-scovak-cynosure-of-the-net").recurringCreditsMax).toBe(
      1,
    );
    expect(getCardDef("top-hat").mayInsteadOfBreachRdAccessOneOfTopN).toBe(5);
    expect(getCardDef("government-investigations").secretSpendCannotEqual).toBe(
      2,
    );
    expect(getCardDef("government-investigations").lingerAsCurrent).toBe(true);
    expect(
      getCardDef("fumiko-yamamori").meatDamageWhenSecretSpendAmountsDiffer,
    ).toBe(1);
    expect(
      getCardDef("chief-slee").placePowerPerUnbrokenSubOnAnyEncounterEnd,
    ).toBe(true);
    expect(getCardDef("bulwark").badPublicityOnRez).toBe(1);
    expect(getCardDef("preemptive-action").endsActionPhase).toBe(true);
    expect(getCardDef("preemptive-action").rfgInsteadOfTrashing).toBe(true);
    expect(
      getCardDef("wetwork-refit").hostGainsSubroutinesBeforePrinted?.[0]?.text,
    ).toMatch(/core damage/i);
    expect(
      getCardDef("drone-screen").onRunDeclaredOnThisServerIfTagged,
    ).toBeTruthy();
  });
});
