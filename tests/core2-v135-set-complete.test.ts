/**
 * Revised Core Set (core2) reprints absorb — floor v1.134.0 → v1.135.0.
 * 132/132 reprints absorbed; 0 new clears. CR pin v26.03.
 * Defer tdc.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
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

const EXPECTED_REPRINTS = 132;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.144.0");
});

describe("Revised Core Set (core2) v1.135.0 reprints absorb", () => {
  it("declares revised-core supported after crimson-dust with 132 reprint pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["revised-core"].status).toBe("supported");
    expect(pool.waves["revised-core"].cards).toHaveLength(EXPECTED_REPRINTS);
    expect(pool.corpusOrder[47]).toBe("crimson-dust");
    expect(pool.corpusOrder[48]).toBe("revised-core");
    expect(pool.corpusOrder[49]).toBe("sovereign-sight");
    expect(pool.corpusOrder[50]).toBe("down-the-white-nile");
    expect(pool.corpusOrder[51]).toBe("council-of-the-crest");
    expect(pool.corpusOrder[52]).toBe("the-devil-and-the-dragon");
    expect(pool.corpusOrder[53]).toBe("whispers-in-nalubaale");
    expect(pool.corpusOrder[54]).toBe("kampala-ascendent");
    expect(pool.corpusOrder[55]).toBe("reign-and-reverie");
    expect(pool.corpusOrder[56]).toBe("magnum-opus");
    expect(pool.corpusOrder[57]).toBe("system-core-2019");
  });

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
    // Absorb-only: wave dir has no card JSON (manifest only).
    const waveDir = join(process.cwd(), "vendor/cards-data/revised-core");
    const cardFiles = readdirSync(waveDir).filter(
      (n) => n.endsWith(".json") && n !== "_manifest.json",
    );
    expect(cardFiles).toEqual([]);
  });

  it("absorbs all 132 reprints from earlier waves (0 new clears)", () => {
    loadCardCatalog(true);
    const pool = loadCardPool(true);
    const ids = pool.waves["revised-core"].cards;
    expect(ids).toHaveLength(EXPECTED_REPRINTS);
    for (const id of ids) {
      const def = getCardDef(id);
      // Card JSON lives in an earlier wave; wave field is the owning clear wave.
      expect(def.wave).not.toBe("revised-core");
      expect(def.unsupported ?? []).toEqual([]);
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
