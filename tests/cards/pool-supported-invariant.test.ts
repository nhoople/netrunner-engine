/**
 * Pool invariant: every wave with status `supported` must have empty
 * `unsupported` on each listed card.
 *
 * The cards repo may allowlist a deferral in
 * `bookkeeping/supported-unsupported-allowlist.json`, which its own validator
 * reads. That file is the dataset's bookkeeping, outside `data/`, so it is not
 * vendored here (cards v1.148.0 and later), and the engine allows no deferral:
 * a supported card with `unsupported` notes fails here until the engine clears
 * it or the wave leaves `supported`.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  CARD_WAVE_DIRS,
  cardsDataPresent,
  getCardDef,
  loadCardPool,
} from "../../src/index.js";

beforeAll(() => {
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertCardsPinnedTag("v1.148.0");
});

describe("supported-wave pool invariant", () => {
  it("supported waves have empty unsupported", () => {
    const pool = loadCardPool(true);
    const failures: string[] = [];

    for (const [waveName, wave] of Object.entries(pool.waves)) {
      if (wave.status !== "supported") continue;
      for (const id of wave.cards) {
        const notes = getCardDef(id).unsupported ?? [];
        if (notes.length === 0) continue;
        failures.push(
          `${waveName}/${id}: unsupported=${JSON.stringify(notes)}; clear the card, or take its wave out of supported`,
        );
      }
    }

    expect(failures).toEqual([]);
  });

  it("lists every wave in corpus order and marks each wave supported", () => {
    const pool = loadCardPool(true);
    expect(pool.corpusOrder).toEqual([...CARD_WAVE_DIRS]);
    for (const waveName of CARD_WAVE_DIRS) {
      expect(pool.waves[waveName]?.status, waveName).toBe("supported");
    }
  });

  it("keeps each card's printed wave as a wave that lists that card", () => {
    const pool = loadCardPool(true);
    const failures: string[] = [];
    for (const [waveName, wave] of Object.entries(pool.waves)) {
      for (const id of wave.cards) {
        const printed = getCardDef(id).wave;
        if (!printed || !pool.waves[printed]?.cards.includes(id)) {
          failures.push(
            `${waveName}/${id}: printed wave ${printed ?? "missing"}`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
