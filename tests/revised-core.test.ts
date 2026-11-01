/**
 * revised-core play tests.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  CARD_WAVE_DIRS,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
  loadCardCatalog,
  loadCardPool,
} from "../src/index.js";

describe("revised-core", () => {
  describe("core2-v135-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.16");
  });

  describe("Revised Core Set (core2) v1.135.0 reprints absorb", () => {

    it("wires revised-core in CARD_WAVE_DIRS after crimson-dust (+1 wave, +0 cards)", () => {
      const idx = CARD_WAVE_DIRS.indexOf("revised-core");
      expect(idx).toBeGreaterThan(-1);
      expect(CARD_WAVE_DIRS[idx - 1]).toBe("crimson-dust");
      expect(CARD_WAVE_DIRS[idx + 1]).toBe("sovereign-sight");
      expect(CARD_WAVE_DIRS[idx + 2]).toBe("down-the-white-nile");
      expect(CARD_WAVE_DIRS[idx + 3]).toBe("council-of-the-crest");
      expect(CARD_WAVE_DIRS[idx + 4]).toBe("the-devil-and-the-dragon");
      expect(CARD_WAVE_DIRS[idx + 5]).toBe("whispers-in-nalubaale");
      expect(CARD_WAVE_DIRS[idx + 6]).toBe("kampala-ascendent");
      expect(CARD_WAVE_DIRS[idx + 7]).toBe("reign-and-reverie");
      expect(CARD_WAVE_DIRS[idx + 8]).toBe("magnum-opus");
      // Absorb-only: every listed title already lives under an earlier wave.
      const pool = loadCardPool(true);
      for (const id of pool.waves["revised-core"].cards) {
        expect(getCardDef(id).wave).not.toBe("revised-core");
      }
    });

    it("resolves known apostrophe/umlaut slug mismatches to corpus ids", () => {
      loadCardCatalog(true);
      for (const id of [
        "doppelganger",
        "chaos-theory-wunderkind",
        "the-makers-eye",
        "aesops-pawnshop",
        "hadrians-wall",
      ]) {
        expect(getCardDef(id).id).toBe(id);
        expect(
          loadCardPool(true).waves["revised-core"].cards.includes(id),
        ).toBe(true);
      }
    });
  });
  });
});
