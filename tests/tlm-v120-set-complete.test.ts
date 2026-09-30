/**
 * The Liberated Mind (tlm) set-complete — floor v1.119.0 → v1.120.0.
 * 18/19 TLM clears (reprint skip ravana-1-0). CR pin v26.03.
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

const TLM_CLEARS = [
  "the-noble-path",
  "emptied-mind",
  "information-sifting",
  "out-of-the-ashes",
  "liberated-chela",
  "temple-of-the-liberated-mind",
  "rebirth",
  "guru-davinder",
  "the-turning-wheel",
  "brainstorm",
  "dedicated-neural-net",
  "chetana",
  "puppet-master",
  "waiver",
  "exchange-of-information",
  "red-tape",
  "consulting-visit",
  "vanilla",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.129.0");
});

describe("The Liberated Mind v1.120.0 set-complete", () => {
  it("declares the-liberated-mind supported after salsette-island with 19 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["the-liberated-mind"].status).toBe("supported");
    expect(pool.waves["the-liberated-mind"].cards).toHaveLength(19);
    expect(pool.corpusOrder[32]).toBe("salsette-island");
    expect(pool.corpusOrder[33]).toBe("the-liberated-mind");
    expect(pool.corpusOrder[34]).toBe("fear-the-masses");
    expect(pool.corpusOrder[43]).toBe("reign-and-reverie");
  });

  it("clears all 18 new TLM cards with empty unsupported (ravana-1-0 reprint)", () => {
    loadCardCatalog(true);
    for (const id of TLM_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("the-liberated-mind");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onRez) expect(validateEffectTree(def.onRez)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
      if (def.runEvent?.onSuccessfulRun) {
        expect(validateEffectTree(def.runEvent.onSuccessfulRun)).toBeNull();
      }
      if (def.gainsSubroutinesOnEncounterEqualGripSize?.effect) {
        expect(
          validateEffectTree(def.gainsSubroutinesOnEncounterEqualGripSize.effect),
        ).toBeNull();
      }
    }
    // Reprint lives in another wave
    expect(getCardDef("ravana-1-0").wave).not.toBe("the-liberated-mind");
  });

  it("wires key TLM fields", () => {
    loadCardCatalog(true);
    expect(getCardDef("the-noble-path").runEvent?.preventAllDamageThisRun).toBe(
      true,
    );
    expect(getCardDef("emptied-mind").onTurnBegin).toBeTruthy();
    expect(getCardDef("information-sifting").runEvent?.servers).toBe("hq");
    expect(getCardDef("information-sifting").runEvent?.skipBreach).toBe(true);
    expect(getCardDef("out-of-the-ashes").deckLimit).toBe(6);
    expect(getCardDef("out-of-the-ashes").heapOnTurnBeginMayRfgSelfToMakeRun).toBe(
      true,
    );
    expect(getCardDef("rebirth").rfgInsteadOfTrashing).toBe(true);
    expect(getCardDef("rebirth").deckLimit).toBe(1);
    expect(getCardDef("guru-davinder").autoPreventNetOrMeatDamagePayOrTrash).toBe(
      4,
    );
    expect(
      getCardDef("the-turning-wheel").placePowerOnHqOrRdRunEndIfNoAgendaStolen,
    ).toBe(true);
    expect(
      getCardDef("brainstorm").gainsSubroutinesOnEncounterEqualGripSize?.id,
    ).toBe("brainstorm-core");
    expect(
      getCardDef("dedicated-neural-net")
        .firstSuccessfulHqRunEachTurnPsiCorpChoosesAccess,
    ).toBe(true);
    expect(
      getCardDef("puppet-master")
        .onSuccessfulRunMayPlaceAdvancementOnCanBeAdvanced,
    ).toBe(true);
    expect(getCardDef("exchange-of-information").playRequiresTagged).toBe(true);
    expect(getCardDef("consulting-visit").playAdditionalClick).toBe(true);
    expect(
      getCardDef("consulting-visit").zeroInfluenceIfNonAllianceFactionCardsGte,
    ).toEqual({ faction: "weyland-consortium", threshold: 6 });
    expect(getCardDef("vanilla").subroutines?.[0]?.text).toMatch(/End the run/i);
  });
});
