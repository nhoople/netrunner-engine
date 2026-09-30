/**
 * The Underway (uw) set-complete — floor v1.111.0 → v1.112.0.
 * 17/17 UW-only clears (chameleon + contract-killer + spiderweb reprints). CR pin v26.03.
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

const UW_CLEARS = [
  "faust",
  "street-peddler",
  "armand-geist-walker-tech-lord",
  "drive-by",
  "forger",
  "shiv",
  "gang-sign",
  "muertos-gang-member",
  "hyperdriver",
  "test-ground",
  "defective-brainchips",
  "allele-repression",
  "marcus-batty",
  "expose",
  "pachinko",
  "underway-renovation",
  "underway-grid",
] as const;

const UW_REPRINTS = ["chameleon", "contract-killer", "spiderweb"] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.129.0");
});

describe("The Underway v1.112.0 set-complete", () => {
  it("declares the-underway supported after chrome-city with 20 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["the-underway"].status).toBe("supported");
    expect(pool.waves["the-underway"].cards).toHaveLength(20);
    expect(pool.corpusOrder[24]).toBe("chrome-city");
    expect(pool.corpusOrder[25]).toBe("the-underway");
    expect(pool.corpusOrder[26]).toBe("old-hollywood");
    expect(pool.corpusOrder[28]).toBe("data-and-destiny");
    expect(pool.corpusOrder[29]).toBe("kala-ghoda");
    expect(pool.corpusOrder[30]).toBe("business-first");
    expect(pool.corpusOrder[31]).toBe("democracy-and-dogma");
    expect(pool.corpusOrder[32]).toBe("salsette-island");
    expect(pool.corpusOrder[33]).toBe("the-liberated-mind");
    expect(pool.corpusOrder[34]).toBe("fear-the-masses");
    expect(pool.corpusOrder[43]).toBe("reign-and-reverie");
  });

  it("clears all 17 UW cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of UW_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("the-underway");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onEncounter) expect(validateEffectTree(def.onEncounter)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onInstall) expect(validateEffectTree(def.onInstall)).toBeNull();
      if (def.onUninstall) expect(validateEffectTree(def.onUninstall)).toBeNull();
      if (def.onAgendaScored) {
        expect(validateEffectTree(def.onAgendaScored)).toBeNull();
      }
      if (def.runEvent?.onSuccessfulRun) {
        expect(validateEffectTree(def.runEvent.onSuccessfulRun)).toBeNull();
      }
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
    }
  });

  it("skips chameleon, contract-killer, and spiderweb reprints", () => {
    loadCardCatalog(true);
    for (const id of UW_REPRINTS) {
      const def = getCardDef(id);
      expect(def.wave).not.toBe("the-underway");
    }
  });

  it("wires key UW fields", () => {
    loadCardCatalog(true);
    expect(getCardDef("faust").breaker?.breakViaPaidAbilityOnly).toBe(true);
    expect(getCardDef("faust").paidAbilities?.[0]?.cost?.trashFromGrip).toBe(1);
    expect(getCardDef("street-peddler").onInstall).toBeTruthy();
    expect(getCardDef("armand-geist-walker-tech-lord").drawOnUseTrashAbility).toBe(
      1,
    );
    expect(getCardDef("drive-by").playAdditionalClick).toBe(true);
    expect(getCardDef("forger").link).toBe(1);
    expect(getCardDef("forger").maxConsole).toBe(1);
    expect(getCardDef("shiv").memoryCostZeroIfLinkGte).toBe(2);
    expect(getCardDef("shiv").strengthBonusPerIcebreaker).toBe(1);
    expect(getCardDef("gang-sign").onAgendaScored).toBeTruthy();
    expect(getCardDef("muertos-gang-member").onInstall).toBeTruthy();
    expect(getCardDef("muertos-gang-member").onUninstall).toBeTruthy();
    expect(getCardDef("hyperdriver").onTurnBegin).toBeTruthy();
    expect(getCardDef("test-ground").canAdvance).toBe(true);
    expect(getCardDef("defective-brainchips").increaseFirstCoreDamagePerTurn).toBe(
      1,
    );
    expect(getCardDef("allele-repression").canAdvance).toBe(true);
    expect(getCardDef("marcus-batty").paidAbilities?.[0]?.requireThisServer).toBe(
      true,
    );
    expect(getCardDef("expose").canAdvance).toBe(true);
    expect(getCardDef("pachinko").subroutines).toHaveLength(2);
    expect(getCardDef("underway-renovation").installFaceup).toBe(true);
    expect(getCardDef("underway-renovation").trashTopOfStackOnAdvance?.default).toBe(
      1,
    );
    expect(getCardDef("underway-grid").iceCannotBeBypassedThisServer).toBe(true);
    expect(getCardDef("underway-grid").cardsCannotBeExposedThisServer).toBe(true);
  });
});
