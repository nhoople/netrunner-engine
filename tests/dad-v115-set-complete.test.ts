/**
 * Data and Destiny (dad) set-complete — floor v1.114.0 → v1.115.0.
 * 54/54 DAD-only clears (spark-agency-worldswide-reach reprint). CR pin v26.03.
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

const DAD_CLEARS = [
  "sync-everything-everywhere",
  "new-angeles-sol-your-news",
  "15-minutes",
  "improved-tracers",
  "rebranding-team",
  "quantum-predictive-model",
  "lily-lockwell",
  "news-team",
  "shannon-claire",
  "victoria-jenkins",
  "reality-threedee",
  "archangel",
  "news-hound",
  "resistor",
  "special-offer",
  "tl-dr",
  "turnpike",
  "24-7-news-cycle",
  "ad-blitz",
  "media-blitz",
  "the-all-seeing-i",
  "surveillance-sweep",
  "keegan-lane",
  "rutherford-grid",
  "global-food-initiative",
  "launch-campaign",
  "assassin",
  "apex-invasive-predator",
  "apocalypse",
  "prey",
  "heartbeat",
  "endless-hunger",
  "harbinger",
  "hunting-grounds",
  "wasteland",
  "adam-compulsive-hacker",
  "independent-thinking",
  "brain-chip",
  "multithreader",
  "always-be-running",
  "dr-lovegood",
  "neutralize-all-threats",
  "safety-first",
  "sunny-lebeau-security-specialist",
  "security-chip",
  "security-nexus",
  "gs-striker-m1",
  "gs-shrike-m2",
  "gs-sherman-m3",
  "globalsec-security-clearance",
  "jak-sinclair",
  "employee-strike",
  "windfall",
  "technical-writer",
] as const;

const DAD_REPRINTS = ["spark-agency-worldswide-reach"] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.143.0");
});

describe("Data and Destiny v1.115.0 set-complete", () => {
  it("declares data-and-destiny supported after the-universe-of-tomorrow with 55 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["data-and-destiny"].status).toBe("supported");
    expect(pool.waves["data-and-destiny"].cards).toHaveLength(55);
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

  it("clears all 54 DAD cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of DAD_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("data-and-destiny");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onEncounter) expect(validateEffectTree(def.onEncounter)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onRez) expect(validateEffectTree(def.onRez)).toBeNull();
      if (def.onAccess) expect(validateEffectTree(def.onAccess)).toBeNull();
      if (def.onAgendaScoredOrStolen) {
        expect(validateEffectTree(def.onAgendaScoredOrStolen)).toBeNull();
      }
      if (def.onTrashWhileAccessed) {
        expect(validateEffectTree(def.onTrashWhileAccessed)).toBeNull();
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

  it("skips spark-agency-worldswide-reach reprint", () => {
    loadCardCatalog(true);
    for (const id of DAD_REPRINTS) {
      const def = getCardDef(id);
      expect(def.wave).not.toBe("data-and-destiny");
    }
  });

  it("wires key DAD fields", () => {
    loadCardCatalog(true);
    expect(
      getCardDef("sync-everything-everywhere")
        .basicRemoveTagAdditionalCostCreditsWhileUnflipped,
    ).toBe(1);
    expect(
      getCardDef("sync-everything-everywhere")
        .basicTrashResourceCreditReductionWhileFlipped,
    ).toBe(2);
    expect(getCardDef("new-angeles-sol-your-news").onAgendaScoredOrStolen).toBeTruthy();
    expect(getCardDef("15-minutes").paidAbilities?.[0]?.usableFromRunnerScoreArea).toBe(
      true,
    );
    expect(getCardDef("improved-tracers").iceStrengthBonusForSubtype?.subtype).toBe(
      "tracer",
    );
    expect(getCardDef("improved-tracers").subroutineTraceBaseStrengthBonus).toBe(1);
    expect(getCardDef("rebranding-team").assetsGainSubtype).toBe("advertisement");
    expect(
      getCardDef("quantum-predictive-model").addToCorpScoreOnAccessIfRunnerTagged,
    ).toBe(true);
    expect(getCardDef("victoria-jenkins").runnerAllottedClicksBonus).toBe(-1);
    expect(getCardDef("news-hound").gainsEtrSubroutineWhileCurrentActive).toBe(true);
    expect(getCardDef("resistor").strengthBonusPerRunnerTag).toBe(1);
    expect(getCardDef("24-7-news-cycle").playAdditionalCostForfeitAgenda).toBe(true);
    expect(getCardDef("ad-blitz").playCostX).toBe(true);
    expect(getCardDef("surveillance-sweep").runnerSpendsFirstForTracesDuringRun).toBe(
      true,
    );
    expect(
      getCardDef("rutherford-grid").traceBaseStrengthBonusDuringRunOnThisServer,
    ).toBe(2);
    expect(
      getCardDef("global-food-initiative").agendaPointsModifierInRunnerScoreArea,
    ).toBe(-1);
    expect(getCardDef("apex-invasive-predator").cannotInstallNonVirtualResources).toBe(
      true,
    );
    expect(getCardDef("apocalypse").playRequiresSuccessfulAllCentralsThisTurn).toBe(
      true,
    );
    expect(
      getCardDef("prey").runEvent?.onPassIceMayTrashEqualStrengthToTrashIce,
    ).toBe(true);
    expect(getCardDef("harbinger").turnFacedownInsteadOfHeapWhenTrashed).toBe(true);
    expect(getCardDef("adam-compulsive-hacker").startWithDirectiveCards).toBe(3);
    expect(getCardDef("brain-chip").muEqualsAgendaPoints).toBe(true);
    expect(getCardDef("always-be-running").firstClickMustBeRunOrRunEvent).toBe(true);
    expect(getCardDef("gs-striker-m1").memoryCostZeroIfLinkGte).toBe(2);
    expect(getCardDef("gs-striker-m1").breaker?.breakMaxSubs).toBe(99);
    expect(getCardDef("employee-strike").blankCorpIdentityPrintedAbilities).toBe(true);
    expect(
      getCardDef("technical-writer").hostedCreditsOnProgramOrHardwareInstall,
    ).toBe(1);
    expect(getCardDef("sunny-lebeau-security-specialist").link).toBe(2);
  });
});
