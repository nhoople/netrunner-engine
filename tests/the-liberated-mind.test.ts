/**
 * the-liberated-mind play tests.
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

describe("the-liberated-mind", () => {
  describe("tlm-v120-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.17");
  });

  describe("The Liberated Mind v1.120.0 set-complete", () => {

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
        getCardDef("brainstorm").continuousGainedSubDecls?.find(
          (d) => d.kind === "grip_size_on_encounter",
        )?.subroutine?.id,
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
  });
});
