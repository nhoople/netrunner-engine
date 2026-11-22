/**
 * Second reader (CR audit tool 1.16).
 *
 * A model other than the one that writes engine fixes read the Comprehensive
 * Rules, the printed card text and the rulings, and wrote what should happen
 * in each position (tests/second-reader/<batch>.json), before this test and
 * its drivers existed. This test runs the engine on each position and
 * compares. See tests/second-reader/README.md.
 *
 * - A case the engine agrees with is a passing test.
 * - A difference is recorded in tests/second-reader/differences.json with
 *   cr-checker's verdict. One the engine gets wrong, or the CR leaves open, is
 *   a skipped test naming the rule, and "recorded differences" below fails
 *   when the engine stops differing in the recorded way, so the entry is
 *   removed when the engine is fixed.
 * - A difference that was the reader's mistake is corrected in the batch
 *   file, and its record stays in differences.json.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  compare,
  loadBatch,
  loadDifferences,
  Report,
} from "./second-reader/harness.js";
import type { Case, Comparison } from "./second-reader/harness.js";
import { drivers as ch1 } from "./second-reader/cr-examples-ch1.drivers.js";
import { drivers as ch2 } from "./second-reader/cr-examples-ch2.drivers.js";
import { drivers as ch3 } from "./second-reader/cr-examples-ch3.drivers.js";
import { drivers as ch4 } from "./second-reader/cr-examples-ch4.drivers.js";
import { drivers as ch5 } from "./second-reader/cr-examples-ch5.drivers.js";
import { drivers as ch6 } from "./second-reader/cr-examples-ch6.drivers.js";
import { drivers as ch7 } from "./second-reader/cr-examples-ch7.drivers.js";
import { drivers as ch8 } from "./second-reader/cr-examples-ch8.drivers.js";
import { drivers as ch9 } from "./second-reader/cr-examples-ch9.drivers.js";
import { drivers as ch10 } from "./second-reader/cr-examples-ch10.drivers.js";
import { drivers as rulings1 } from "./second-reader/rulings-sample-1.drivers.js";
import type { Driver } from "./second-reader/driving.js";

/**
 * Each batch and its drivers. A batch of CR examples names its chapter. A
 * batch with no chapter is a sample of the official rulings, and its file
 * lists the sampled cards.
 */
const BATCHES: Array<{
  name: string;
  chapter?: string;
  drivers: Record<string, Driver>;
}> = [
  { name: "cr-examples-ch1", chapter: "1", drivers: ch1 },
  { name: "cr-examples-ch2", chapter: "2", drivers: ch2 },
  { name: "cr-examples-ch3", chapter: "3", drivers: ch3 },
  { name: "cr-examples-ch4", chapter: "4", drivers: ch4 },
  { name: "cr-examples-ch5", chapter: "5", drivers: ch5 },
  { name: "cr-examples-ch6", chapter: "6", drivers: ch6 },
  { name: "cr-examples-ch7", chapter: "7", drivers: ch7 },
  { name: "cr-examples-ch8", chapter: "8", drivers: ch8 },
  { name: "cr-examples-ch9", chapter: "9", drivers: ch9 },
  { name: "cr-examples-ch10", chapter: "10", drivers: ch10 },
  { name: "rulings-sample-1", drivers: rulings1 },
];

/**
 * A case whose run meets a recorded invariant problem needs its name written
 * out here: tests/invariants-baseline.test.ts looks for a baseline entry's
 * test name in this file's source.
 */
const WRITTEN_TITLES: Record<string, string> = {
  "1.12.3.ex1":
    "CR 1.12.3.ex1: The Foundry's search shuffles away the cards Accelerated Beta Test was looking at, so they are not installed or trashed",
  "6.2.3.ex2":
    "CR 6.2.3.ex2: Slipstream moves the Runner to the innermost ice of a central server, whatever ice is outward of it",
  "7.4.7a.ex1":
    "CR 7.4.7a.ex1: after Bacterial Programming rearranges R&D the breach goes on from the top and Celebrity Gift is accessed again",
  "8.3.3b.ex1":
    "CR 8.3.3b.ex1: Cultivate trashes one of the top five cards of R&D, adds one to HQ and arranges the rest",
  "9.1.4.ex1":
    "CR 9.1.4.ex1: Compile puts Mayfly on the bottom of the stack first, so Mayfly's own end-of-run trash finds nothing",
  "9.1.4.ex1#b":
    "CR 9.1.4.ex1#b: Mayfly's end-of-run trash resolves first, so Compile has no program left to put back",
  "9.6.5b.ex2":
    "CR 9.6.5b.ex2: Tranquility Home Grid installed and rezzed by Architect Deployment Test gives nothing for its own install",
  "9.6.5d.ex1":
    "CR 9.6.5d.ex1: The Supplier installs Dyson Mem Chip first, so Underworld Contact sees 2 link when it resolves",
  "9.6.5d.ex1#b":
    "CR 9.6.5d.ex1#b: Underworld Contact resolves first with 1 link and gives nothing",
  "backstitching#4":
    "Ruling backstitching#4: Backstitching can bypass the ice Konjin makes the Runner encounter, because the run is still on the mark",
  "pinhole-threading#4":
    "Ruling pinhole-threading#4: Henry Phillips in HQ's root pays out when a subroutine is broken on ice Ganked! forced, during a Pinhole Threading run on HQ",
  "pinhole-threading#4-b":
    "Ruling pinhole-threading#4-b: Henry Phillips beside Ganked! pays nothing, because the run is on HQ",
};

/**
 * Observations the engine's state cannot show. They are not compared, so
 * they are named here and do not count as agreement.
 */
const UNOBSERVED: Record<string, string[]> = {
  "cr-examples-ch1": [
    "1.10.3c.ex1 legal(spend-two)",
    "1.10.3c.ex1 legal(spend-one)",
    "1.17.1a.ex1 threat",
  ],
  // 4.8.7.ex1 is a recorded difference: its entry is checked once it passes.
  "cr-examples-ch4": ["4.8.7.ex1 runnerCanTell"],
  "cr-examples-ch8": ["8.3.3b.ex1 runnerCanTell"],
  "cr-examples-ch9": [
    "9.1.6c.ex1 used(Mimic)",
    "9.1.6c.ex1 used(Cyberfeeder)",
    "9.5.3a.ex1 legal(imp)",
    "9.5.3a.ex1 legal(decline)",
    "9.5.3a.ex1#b legal(imp)",
  ],
};

const differences = loadDifferences();
/** Verdicts that leave the engine and the expectation apart. */
const OPEN = new Set(["pending", "engine-wrong", "cr-open"]);

function runCase(c: Case, driver: Driver): Comparison[] {
  const report = new Report();
  driver(report);
  return compare(c, report);
}

function differing(rows: Comparison[]) {
  return rows
    .filter((row) => !row.agrees && !row.unobserved)
    .map(({ key, expected, engine }) => ({ key, expected, engine }));
}

function exampleNumbers(chapter: string): string[] {
  const nodes = JSON.parse(
    readFileSync(join(process.cwd(), "vendor/cr-data/nodes.json"), "utf8"),
  ) as Array<{ kind: string; number: string }>;
  return nodes
    .filter((n) => n.kind === "example" && n.number.startsWith(`${chapter}.`))
    .map((n) => n.number);
}

/** Every ruling on the given cards at the cards pin, as `<card id>#<n>`. */
function rulingNames(cardIds: string[]): string[] {
  return cardIds.flatMap((id) => {
    const file = join(process.cwd(), "vendor/cards-data/rulings", `${id}.json`);
    const { rulings } = JSON.parse(readFileSync(file, "utf8")) as {
      rulings: unknown[];
    };
    return rulings.map((_, i) => `${id}#${i + 1}`);
  });
}

for (const { name, chapter, drivers } of BATCHES) {
  const batch = loadBatch(name);
  const open = new Map(
    differences
      .filter((d) => d.batch === name && OPEN.has(d.verdict))
      .map((d) => [d.case, d]),
  );

  describe(`the engine agrees with a blind reading of ${batch.title} (read by ${batch.reader.name})`, () => {
    const scope = chapter
      ? `every example of CR chapter ${chapter} at the pin`
      : "every ruling on the sampled cards at the pin";
    it(`${scope} has an entry, and every position has a driver`, () => {
      const have = new Set(batch.cases.map((c) => c.example));
      const wanted = chapter
        ? exampleNumbers(chapter)
        : rulingNames((batch as unknown as { cards: string[] }).cards);
      expect(wanted.length).toBeGreaterThan(0);
      expect(wanted.filter((n) => !have.has(n))).toEqual([]);
      const toRun = batch.cases.filter((c) => c.run !== false);
      expect(toRun.filter((c) => !drivers[c.id]).map((c) => c.id)).toEqual([]);
      for (const c of batch.cases.filter((c) => c.run === false)) {
        expect(c.skip, `${c.id} gives its reason`).toBeTruthy();
      }
    });

    for (const c of batch.cases) {
      if (c.run === false) continue;
      const title =
        WRITTEN_TITLES[c.id] ??
        `${chapter ? "CR" : "Ruling"} ${c.id}: ${c.steps!.map((s) => s.do).join(" ")}`;
      const known = open.get(c.id);
      if (known) {
        const filed =
          known.verdict === "engine-wrong"
            ? `filed, area ${known.area}`
            : known.verdict === "cr-open"
              ? "the CR leaves it open: on the disagreement list"
              : "not yet read by cr-checker";
        it.skip(`${title} (second reader differs; ${filed}, CR ${known.rule}: ${known.note})`, () => {
          expect(differing(runCase(c, drivers[c.id]!))).toEqual([]);
        });
        continue;
      }
      it(title, () => {
        const rows = runCase(c, drivers[c.id]!);
        expect(differing(rows)).toEqual([]);
        expect(
          rows
            .filter((row) => row.unobserved)
            .map((row) => `${c.id} ${row.key.split("::")[1]}`),
        ).toEqual(
          (UNOBSERVED[name] ?? []).filter((u) => u.startsWith(`${c.id} `)),
        );
      });
    }

    it("recorded differences still differ in the recorded way (remove the entry when the engine is fixed)", () => {
      for (const [id, known] of open) {
        const c = batch.cases.find((x) => x.id === id);
        expect(c, `differences.json names ${id}`).toBeTruthy();
        expect(differing(runCase(c!, drivers[id]!)), id).toEqual(
          known.observations,
        );
      }
    });
  });
}

describe("second reader: differences.json", () => {
  it("names a batch, a case, a rule and a note for every difference, and an area for each engine-wrong one", () => {
    const names = new Set(BATCHES.map((b) => b.name));
    for (const d of differences) {
      expect(names.has(d.batch), `${d.case}: batch`).toBe(true);
      expect(d.rule, `${d.case}: rule`).toMatch(/^\d+\.\d+/);
      expect(d.note.length, `${d.case}: note`).toBeGreaterThan(10);
      if (d.verdict === "engine-wrong") {
        expect(d.area, `${d.case}: area`).toBeTruthy();
      }
    }
  });
});
