/**
 * The vitest side of the seeded playouts (CR audit tool 1.3). Each test file
 * calls `describePlayouts` for its formats, so vitest runs the formats in
 * parallel workers.
 *
 * A format plays seeds 1..`ciSeeds`, plus every other seed
 * `tests/fixtures/playout-seeds.json` records for it (a seed pinned from a
 * nightly run). Each playout must fail exactly as its fixture entries say:
 * a new failure fails the test, and so does an entry that no longer happens.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
} from "../../src/index.js";
import {
  PLAYOUT_STEPS,
  compareWithSeeds,
  playout,
  readSeeds,
  type Format,
} from "./harness.js";

/** Per-format CI seed counts. `npm run playouts` plays more. */
export const CI_SEEDS: Record<Format, number> = {
  learn_to_play_starter: 4,
  learn_to_play_expanded: 4,
  system_gateway: 4,
  startup: 4,
  core: 2,
  standard: 2,
  eternal: 2,
};

export function describePlayouts(formats: readonly Format[]): void {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.23");
  });

  const seeds = readSeeds();
  for (const format of formats) {
    const pinned = seeds.entries.filter((e) => e.format === format).map((e) => e.deckSeed);
    const list = [...new Set([...Array.from({ length: CI_SEEDS[format] }, (_, i) => i + 1), ...pinned])];
    list.sort((a, b) => a - b);
    describe(`playout ${format}`, () => {
      for (const seed of list) {
        it(`seed ${seed}, ${PLAYOUT_STEPS} steps`, () => {
          const result = playout(format, seed);
          expect(compareWithSeeds(result, seeds.entries)).toEqual([]);
        }, 60_000);
      }
    });
  }
}
