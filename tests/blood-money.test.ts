/**
 * blood-money play tests.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
  loadCardCatalog,
} from "../src/index.js";

describe("blood-money", () => {
  describe("bm-v123-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.13");
  });

  describe("Blood Money v1.124.0 set-complete", () => {

    it("wires key bm fields (NRDB text)", () => {
      loadCardCatalog(true);
      expect(
        getCardDef("credit-crash").runEvent
          ?.trashFirstNonAgendaAccessCorpMayPayRezOrPlayCostToPrevent,
      ).toBe(true);
      expect(getCardDef("rumor-mill").lingerAsCurrent).toBe(true);
      expect(
        getCardDef("rumor-mill").blankUniqueNonRegionAssetUpgradePrintedAbilities,
      ).toBe(true);
      expect(getCardDef("nfr").strengthPerPowerCounter).toBe(true);
      expect(getCardDef("nfr").onFullyBreak).toBeTruthy();
      expect(
        getCardDef("paperclip").mayInstallSelfFromHeapOnEncounterBarrier,
      ).toBe(true);
      expect(getCardDef("golden").breaker?.breaksSubtype).toBe("sentry");
      expect(getCardDef("temujin-contract").hostedCreditsOnInstall).toBe(20);
      expect(getCardDef("temujin-contract").onInstall).toBeTruthy();
      expect(getCardDef("khan-savvy-skiptracer").onFirstPassIceEachTurn).toBeTruthy();
      expect(getCardDef("data-breach").runEvent?.servers).toBe("rd");
      expect(getCardDef("fairchild-2-0").bioroidBreakMaxSubs).toBe(2);
      expect(getCardDef("enforcing-loyalty").playAdditionalClick).toBe(true);
      expect(getCardDef("hatchet-job").playAdditionalClick).toBe(true);
      expect(getCardDef("liquidation").playAdditionalClick).toBe(true);
      expect(
        getCardDef("weyland-consortium-builder-of-nations")
          .firstAdvancedIceEncounterEndMeatDamageEachTurn,
      ).toBe(true);
      expect(getCardDef("financial-collapse").playRequiresRunnerCreditsGte).toBe(
        6,
      );
      expect(getCardDef("prisec").onAccessRequiresInstalled).toBe(true);
    });
  });
  });
});
