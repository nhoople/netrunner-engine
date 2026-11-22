/**
 * The vitest side of the seeded playouts (CR audit tool 1.3). Each test file
 * calls `describePlayouts` for its formats, so vitest runs the formats in
 * parallel workers.
 *
 * A format plays seeds 1..`ciSeeds`, plus every other seed
 * `tests/fixtures/playout-seeds.json` records for it (a seed pinned from a
 * nightly run). Each playout must fail exactly as its fixture entries say:
 * a new failure fails the test, and so does an entry that no longer happens.
 *
 * Each format also records which card abilities fired (CR audit tool 1.18,
 * tests/ability-fire/recorder.ts) and checks them against
 * `tests/generated/ability-fire-coverage.json`, so the never-fired list in
 * tests/ability-fire-coverage.test.ts is what these playouts really do.
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
import { setSink } from "../ability-fire/recorder.js";
import {
  REGENERATE,
  readGenerated,
  writePlayoutRecord,
} from "../ability-fire/coverage.js";

/** Per-format CI seed counts. `npm run playouts` plays more. */
const CI_SEEDS: Record<Format, number> = {
  learn_to_play_starter: 4,
  learn_to_play_expanded: 4,
  startup: 4,
  core: 2,
  standard: 2,
  eternal: 2,
};

/**
 * The seeds CI plays for `format`: 1..`CI_SEEDS`, then every other seed
 * `tests/fixtures/playout-seeds.json` records for it, in order.
 */
export function playoutSeedList(format: Format, seeds = readSeeds()): number[] {
  const pinned = seeds.entries
    .filter((e) => e.format === format)
    .map((e) => e.deckSeed);
  const list = [
    ...new Set([
      ...Array.from({ length: CI_SEEDS[format] }, (_, i) => i + 1),
      ...pinned,
    ]),
  ];
  return list.sort((a, b) => a - b);
}

export function describePlayouts(formats: readonly Format[]): void {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.28");
  });

  const seeds = readSeeds();
  for (const format of formats) {
    const list = playoutSeedList(format, seeds);
    describe(`playout ${format}`, () => {
      const fired = new Set<string>();
      for (const seed of list) {
        it(`seed ${seed}, ${PLAYOUT_STEPS} steps`, () => {
          const previous = setSink((key) => fired.add(key));
          let result: ReturnType<typeof playout>;
          try {
            result = playout(format, seed);
          } finally {
            setSink(previous);
          }
          expect(compareWithSeeds(result, seeds.entries)).toEqual([]);
        }, 60_000);
      }
      it("fires the abilities tests/generated/ability-fire-coverage.json lists for it", () => {
        const outDir = process.env.ABILITY_FIRE_OUT;
        if (outDir) {
          writePlayoutRecord(outDir, format, list, fired);
          return;
        }
        const recorded = readGenerated().playouts[format];
        expect(
          { seeds: list, fired: [...fired].sort() },
          `the abilities playout ${format} fires changed: regenerate with ${REGENERATE}`,
        ).toEqual(recorded ?? { seeds: [], fired: [] });
      });
    });
  }
}
