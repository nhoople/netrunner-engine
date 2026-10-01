/**
 * Earth's Scion (eas) set-complete — floor v1.130.0 → v1.131.0.
 * 20/20 Red Sand #3 clears (no reprints). CR pin v26.03.
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
  "berserker",
  "persephone",
  "rubicon-switch",
  "aeneas-informant",
  "rosetta-2-0",
  "adjusted-matrix",
  "dedicated-processor",
  "inversificator",
  "dadiana-chacon",
  "next-opal",
  "bioroid-work-crew",
  "aginfusion-new-miracles-for-a-new-world",
  "bamboo-dome",
  "ben-musashi",
  "authenticator",
  "henry-phillips",
  "battlement",
  "audacity",
  "red-planet-couriers",
  "owl",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.142.1");
});

describe("Earth's Scion v1.131.0 set-complete", () => {
  it("declares earths-scion supported after terminal-directive with 20 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["earths-scion"].status).toBe("supported");
    expect(pool.waves["earths-scion"].cards).toHaveLength(20);
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

  it("clears all 20 new eas cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("earths-scion");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onRez) expect(validateEffectTree(def.onRez)).toBeNull();
      if (def.onInstall) expect(validateEffectTree(def.onInstall)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onPassRezzedIce) {
        expect(validateEffectTree(def.onPassRezzedIce)).toBeNull();
      }
      if (def.onEncounter) expect(validateEffectTree(def.onEncounter)).toBeNull();
      if (def.stealAdditionalCostFromProtectingServer) {
        expect(
          validateEffectTree(def.stealAdditionalCostFromProtectingServer),
        ).toBeNull();
      }
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
      if (def.gainsSubroutinesPerRezzedIceWithSubtype?.subroutine.effect) {
        expect(
          validateEffectTree(
            def.gainsSubroutinesPerRezzedIceWithSubtype.subroutine.effect,
          ),
        ).toBeNull();
      }
    }
  });

  it("wires key eas fields (NRDB text)", () => {
    loadCardCatalog(true);
    expect(
      getCardDef("berserker").strengthBonusPerSubroutineOnEncounteredBarrier,
    ).toBe(1);
    expect(getCardDef("berserker").breaker?.breakMaxSubs).toBe(2);
    expect(
      getCardDef("aeneas-informant").aeneasInformantRevealGainOnAccessWithoutTrash,
    ).toBe(true);
    expect(getCardDef("adjusted-matrix").hostGainsAiSubtype).toBe(true);
    expect(
      getCardDef("adjusted-matrix").hostGainsLoseClickBreakAnySubroutine,
    ).toBe(true);
    expect(getCardDef("dedicated-processor").hostGainsPumpAbility).toEqual({
      credits: 2,
      strength: 4,
    });
    expect(
      getCardDef("inversificator").inversificatorSwapIceAfterFullyBrokeOncePerTurn,
    ).toBe(true);
    expect(
      getCardDef("dadiana-chacon").trashSelfAndMeatDamageWhenCreditsZero,
    ).toBe(3);
    expect(
      getCardDef("next-opal").gainsSubroutinesPerRezzedIceWithSubtype?.subtype,
    ).toBe("next");
    expect(
      getCardDef("bioroid-work-crew").bioroidWorkCrewRequireAfterOperationPaidWindow,
    ).toBe(true);
    expect(getCardDef("bamboo-dome").installServers).toEqual(["rd"]);
    expect(getCardDef("ben-musashi").persistent).toBe(true);
    expect(getCardDef("henry-phillips").gainCreditsOnBreakSubThisServerIfTagged).toBe(
      2,
    );
    expect(getCardDef("audacity").playRequiresOtherCardsInHq).toBe(2);
    expect(getCardDef("red-planet-couriers").playAdditionalClicks).toBe(2);
    expect(
      getCardDef("aginfusion-new-miracles-for-a-new-world").type,
    ).toBe("identity");
  });
});
