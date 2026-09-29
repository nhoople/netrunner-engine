/**
 * RWR v0.97: Sebastião / Cloud Eater / Descent / Nuvem / Sisyphus.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
  loadCardCatalog,
  validateEffectTree,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.38.1");
});

describe("RWR v0.97 Sebastião / Cloud Eater / Descent / Nuvem / Sisyphus", () => {
  it("loads five clear cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of [
      "sebastiao-souza-pessoa-activist-organizer",
      "cloud-eater",
      "descent",
      "nuvem-sa-law-of-the-land",
      "sisyphus-protocol",
    ]) {
      expect(catalog.get(id)!.unsupported ?? [], id).toEqual([]);
    }
  });

  it("Sebastião installs connection on tags and gates connection trash", () => {
    const def = getCardDef("sebastiao-souza-pessoa-activist-organizer");
    expect(validateEffectTree(def.onTakeTagsWhenUntagged!)).toBeNull();
    expect(def.connectionBasicTrashAdditionalCostTrashHq).toBe(true);
    expect(JSON.stringify(def.onTakeTagsWhenUntagged)).toContain("connection");
  });

  it("Cloud Eater forces encounter-end choice and has three subs", () => {
    const def = getCardDef("cloud-eater");
    expect(validateEffectTree(def.onEncounterEndIfRezzedThisTurn!)).toBeNull();
    expect(def.subroutines?.length).toBe(3);
    expect(validateEffectTree(def.subroutines![0]!.effect!)).toBeNull();
  });

  it("Descent returns to HQ and expends from HQ", () => {
    const def = getCardDef("descent");
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    expect(def.paidAbilities?.[0]?.usableFromHq).toBe(true);
    expect(validateEffectTree(def.paidAbilities![0]!.effect!)).toBeNull();
    expect(JSON.stringify(def.paidAbilities)).toContain(
      "may_reveal_shuffle_agendas_into_rd",
    );
  });

  it("Nuvem looks at R&D after ops/expendables", () => {
    const def = getCardDef("nuvem-sa-law-of-the-land");
    expect(validateEffectTree(def.onAfterOperationOrExpendable!)).toBeNull();
    expect(def.creditsOnFirstRdTrashThisTurn).toBe(2);
  });

  it("Sisyphus offers reencounter on first CG/sentry pass", () => {
    const def = getCardDef("sisyphus-protocol");
    expect(
      validateEffectTree(def.onFirstPassRezzedCodeGateOrSentryThisTurn!),
    ).toBeNull();
    expect(
      JSON.stringify(def.onFirstPassRezzedCodeGateOrSentryThisTurn),
    ).toContain("pay_credits_reencounter_passed_ice");
  });
});
