/**
 * The files of ability fire coverage (CR audit tool 1.18). Not a test file.
 *
 * - `tests/generated/ability-fire-coverage.json`, written by
 *   scripts/update-ability-fire.ts: the abilities each playout format
 *   fired, and per supported card the abilities no playout fired, each with
 *   the number of hand-built tests that resolve it.
 * - `tests/baselines/ability-fire.json`, shrink-only: the abilities no
 *   playout fires, by area. Each area's evidence step reads its list.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

export const GENERATED_PATH = join(
  ROOT,
  "tests/generated/ability-fire-coverage.json",
);
export const BASELINE_PATH = join(ROOT, "tests/baselines/ability-fire.json");

export const REGENERATE = "npx tsx scripts/update-ability-fire.ts";

/**
 * A test that resolves abilities on this many cards or more is a sweep
 * (card-executes, choice-timing): it runs every card's instructions to see
 * they do not throw, and checks nothing a given ability does. At engine
 * v1.147.273 the 12 such tests resolve abilities on 28 to 1,064 cards, and
 * every other test on 6 or fewer.
 */
export const SWEEP_CARDS = 20;

export interface NeverFired {
  /** `card-id#n`. */
  ability: string;
  class: string;
  name?: string;
  area: string;
  /**
   * Targeted tests that resolve it: tests outside the seeded playouts that
   * resolve abilities on fewer than `SWEEP_CARDS` cards.
   */
  tests: number;
  /** Sweep tests that resolve it, without checking what it does. */
  sweeps: number;
}

export interface Generated {
  _comment: string;
  cardsTag: string;
  crTag: string;
  summary: {
    supportedCards: number;
    cardsWithAbilities: number;
    abilities: number;
    firedInPlayouts: number;
    neverFired: number;
    /** Never fired, and no targeted test resolves it. */
    neverFiredNoTest: number;
    /** Never fired, and no test of any kind resolves it. */
    neverRun: number;
    byArea: Record<
      string,
      { neverFired: number; noTest: number; neverRun: number }
    >;
  };
  /** Format → seeds played → ability keys that fired, sorted. */
  playouts: Record<string, { seeds: number[]; fired: string[] }>;
  /** Tests that resolve abilities on this many cards or more are sweeps. */
  sweepCards: number;
  /** The sweep tests, and how many cards' abilities each resolves. */
  sweeps: Record<string, number>;
  /** Ability key → targeted tests that resolve it (only those with one). */
  handBuiltTests: Record<string, number>;
  /** Ability key → sweep tests that resolve it (only those with one). */
  sweepTests: Record<string, number>;
  /** Card → its abilities no playout fired. */
  neverFired: Record<string, NeverFired[]>;
}

export interface Baseline {
  _comment: string;
  cardsTag: string;
  /** Area → ability keys no playout fires, sorted. */
  neverFired: Record<string, string[]>;
}

export function readGenerated(): Generated {
  return JSON.parse(readFileSync(GENERATED_PATH, "utf8")) as Generated;
}

export function readBaseline(): Baseline {
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
}

/** Where a playout file writes what its formats fired, in a regenerating run. */
export function writePlayoutRecord(
  outDir: string,
  format: string,
  seeds: number[],
  fired: Iterable<string>,
): void {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, `playout-${format}.json`),
    JSON.stringify({ format, seeds, fired: [...fired].sort() }),
  );
}
