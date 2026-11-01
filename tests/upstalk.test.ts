/**
 * upstalk play tests.
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

describe("upstalk", () => {
  describe("up-v102-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.17");
  });

  describe("Upstalk v1.103.0 set-complete", () => {

    it("wires key UP fields", () => {
      loadCardCatalog(true);
      expect(getCardDef("next-silver").dynamicEtrSubroutineCountFromRezzedIceSubtype).toBe(
        "next",
      );
      expect(
        getCardDef("mother-goddess").continuousSubtypeGrants?.[0]?.kind,
      ).toBe("copy_other_rezzed_ice_subtypes");
      expect(getCardDef("leprechaun").daemonHost).toBe(true);
      expect(getCardDef("eden-shard").onGripRdSuccessInstallSelfIgnoringCosts).toBe(
        true,
      );
    });
  });
  });
});
