/**
 * Old Hollywood (oh) set-complete — floor v1.112.0 → v1.113.0.
 * 19/19 OH-only clears (explode-a-palooza reprint). CR pin v26.03.
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

const OH_CLEARS = [
  "trope",
  "spoilers",
  "drug-dealer",
  "rolodex",
  "fan-site",
  "film-critic",
  "paparazzi",
  "ronald-five",
  "enforcer-1-0",
  "its-a-trap",
  "an-offer-you-cant-refuse",
  "haarpsichord-studios-entertainment-unleashed",
  "award-bait",
  "early-premiere",
  "casting-call",
  "old-hollywood-grid",
  "hollywood-renovation",
  "back-channels",
  "vanity-project",
] as const;

const OH_REPRINTS = ["explode-a-palooza"] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.145.0");
});

describe("Old Hollywood v1.113.0 set-complete", () => {
  it("declares old-hollywood supported after the-underway with 20 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["old-hollywood"].status).toBe("supported");
    expect(pool.waves["old-hollywood"].cards).toHaveLength(20);
    expect(pool.corpusOrder[25]).toBe("the-underway");
    expect(pool.corpusOrder[26]).toBe("old-hollywood");
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

  it("clears all 19 OH cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of OH_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("old-hollywood");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onEncounter) expect(validateEffectTree(def.onEncounter)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onCorpTurnBegin) {
        expect(validateEffectTree(def.onCorpTurnBegin)).toBeNull();
      }
      if (def.onInstall) expect(validateEffectTree(def.onInstall)).toBeNull();
      if (def.onTrash) expect(validateEffectTree(def.onTrash)).toBeNull();
      if (def.onAgendaScored) {
        expect(validateEffectTree(def.onAgendaScored)).toBeNull();
      }
      if (def.onExposeWhileInstalled) {
        expect(validateEffectTree(def.onExposeWhileInstalled)).toBeNull();
      }
      if (def.onAccess) expect(validateEffectTree(def.onAccess)).toBeNull();
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
    }
  });

  it("skips explode-a-palooza reprint", () => {
    loadCardCatalog(true);
    for (const id of OH_REPRINTS) {
      const def = getCardDef(id);
      expect(def.wave).not.toBe("old-hollywood");
    }
  });

  it("wires key OH fields", () => {
    loadCardCatalog(true);
    expect(getCardDef("trope").onTurnBegin).toBeTruthy();
    expect(getCardDef("trope").paidAbilities?.[0]?.cost?.rfgSelf).toBe(true);
    expect(getCardDef("spoilers").onAgendaScored).toBeTruthy();
    expect(getCardDef("drug-dealer").onCorpTurnBegin).toBeTruthy();
    expect(getCardDef("rolodex").onInstall).toBeTruthy();
    expect(getCardDef("rolodex").onTrash).toBeTruthy();
    expect(getCardDef("fan-site").onAgendaScored).toBeTruthy();
    expect(getCardDef("film-critic").hostAgendaCapacity).toBe(1);
    expect(getCardDef("film-critic").mayHostAccessedAgenda).toBe(true);
    expect(getCardDef("paparazzi").countsAsTagged).toBe(true);
    expect(getCardDef("paparazzi").preventAllMeatDamage).toBe(true);
    expect(getCardDef("ronald-five").runnerLosesClickWhenTrashesCorpCard).toBe(
      true,
    );
    expect(getCardDef("enforcer-1-0").rezAdditionalCostForfeitAgenda).toBe(true);
    expect(getCardDef("enforcer-1-0").bioroidBreakMaxSubs).toBe(1);
    expect(getCardDef("enforcer-1-0").subroutines).toHaveLength(4);
    expect(getCardDef("its-a-trap").onExposeWhileInstalled).toBeTruthy();
    expect(getCardDef("an-offer-you-cant-refuse").onPlay).toBeTruthy();
    expect(
      getCardDef("haarpsichord-studios-entertainment-unleashed")
        .cannotStealMoreThanOneAgendaPerTurn,
    ).toBe(true);
    expect(getCardDef("award-bait").mustRevealWhenAccessedFromRd).toBe(true);
    expect(getCardDef("early-premiere").onTurnBegin).toBeTruthy();
    expect(getCardDef("casting-call").onPlay).toBeTruthy();
    expect(getCardDef("old-hollywood-grid").persistent).toBe(true);
    expect(getCardDef("old-hollywood-grid").cannotStealUnlessCopyInRunnerScore).toBe(
      true,
    );
    expect(getCardDef("hollywood-renovation").installFaceup).toBe(true);
    expect(
      getCardDef("hollywood-renovation").placeAdvancementOnAnotherOnAdvance
        ?.default,
    ).toBe(1);
    expect(getCardDef("back-channels").onPlay).toBeTruthy();
    expect(getCardDef("vanity-project").advancementRequirement).toBe(6);
    expect(getCardDef("vanity-project").agendaPoints).toBe(4);
  });
});
