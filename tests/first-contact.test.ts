/**
 * first-contact play tests.
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

describe("first-contact", () => {
  describe("fc-v104-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.16");
  });

  describe("First Contact v1.105.0 set-complete", () => {

    it("wires key FC fields", () => {
      loadCardCatalog(true);
      expect(getCardDef("iq").strengthPerCorpCardInHq).toBe(1);
      expect(getCardDef("rachel-beckman").allottedClicksBonus).toBe(1);
      expect(getCardDef("box-e").muBonus).toBe(2);
      expect(getCardDef("refractor").paidAbilitiesUseStealthCreditsOnly).toBe(true);
      expect(getCardDef("hades-shard").onGripArchivesSuccessInstallSelfIgnoringCosts).toBe(
        true,
      );
    });
  });
  });
});
