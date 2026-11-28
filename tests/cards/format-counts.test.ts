/**
 * Card format counts may only shrink (CR audit Phase 2, guard 4).
 *
 * Three numbers measure how much of the card format is one-off:
 *   - knownPrimitiveKinds: kinds in KNOWN_PRIMITIVE_KINDS (src/effects/ir/knownKinds.ts);
 *   - oneCardKinds: kinds that exactly one card's JSON uses;
 *   - cardDefFlags: optional boolean and number fields on CardDef, as tool
 *     1.10 counts them (tests/baselines/card-flags.json, which
 *     tests/state/cardFlags/card-flag-inventory.test.ts keeps in step with src/).
 *
 * tests/baselines/format-counts.json keeps a dated history. The last entry
 * must equal what the code has now:
 *   - a lower count fails until a new entry records it
 *       UPDATE_FORMAT_COUNTS=1 npx vitest run tests/cards/format-counts.test.ts
 *     (refuses to record a higher count);
 *   - a higher count fails unless a new entry, added by hand, records it with
 *     a date and a reason that says why the format had to grow.
 * No target is set. Each Phase 3 area records the counts it leaves behind.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
} from "../../src/index.js";
import { KNOWN_PRIMITIVE_KINDS } from "../../src/effects/ir/knownKinds.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.29");
});

const ROOT = process.cwd();
const BASELINE_PATH = join(ROOT, "tests/baselines/format-counts.json");

type Counts = {
  knownPrimitiveKinds: number;
  oneCardKinds: number;
  cardDefFlags: number;
};
type Entry = {
  date: string;
  engine: string;
  cards: string;
  counts: Counts;
  reason: string;
};
type Baseline = { _comment: string; history: Entry[] };

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (entry.name.endsWith(".json")) out.push(path);
  }
  return out;
}

function collectKinds(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const v of node) collectKinds(v, out);
    return;
  }
  if (node !== null && typeof node === "object") {
    const rec = node as Record<string, unknown>;
    if (typeof rec.kind === "string") out.add(rec.kind);
    for (const v of Object.values(rec)) collectKinds(v, out);
  }
}

function oneCardKinds(): number {
  const byKind = new Map<string, number>();
  for (const side of ["corp", "runner"]) {
    for (const file of walk(join(ROOT, "vendor/cards-data", side))) {
      const card = JSON.parse(readFileSync(file, "utf8")) as { id?: unknown };
      if (typeof card.id !== "string") continue;
      const kinds = new Set<string>();
      collectKinds(card, kinds);
      for (const k of kinds) byKind.set(k, (byKind.get(k) ?? 0) + 1);
    }
  }
  return [...byKind.values()].filter((n) => n === 1).length;
}

function current(): Counts {
  const flags = JSON.parse(
    readFileSync(join(ROOT, "tests/baselines/card-flags.json"), "utf8"),
  ) as { counts: { cardDefFlags: number } };
  return {
    knownPrimitiveKinds: KNOWN_PRIMITIVE_KINDS.size,
    oneCardKinds: oneCardKinds(),
    cardDefFlags: flags.counts.cardDefFlags,
  };
}

const readBaseline = (): Baseline =>
  JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
const KEYS = ["knownPrimitiveKinds", "oneCardKinds", "cardDefFlags"] as const;

if (process.env.UPDATE_FORMAT_COUNTS) {
  const base = readBaseline();
  const last = base.history.at(-1)!;
  const now = current();
  const raised = KEYS.filter((k) => now[k] > last.counts[k]);
  if (raised.length > 0) {
    throw new Error(
      `refusing to record a raised count (${raised.join(", ")}); add the entry by hand with a reason`,
    );
  }
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    version: string;
  };
  const cards = JSON.parse(
    readFileSync(join(ROOT, "vendor/cards-data/PIN.json"), "utf8"),
  ) as {
    tag: string;
  };
  base.history.push({
    date: new Date().toISOString().slice(0, 10),
    engine: `v${pkg.version}`,
    cards: cards.tag,
    counts: now,
    reason: process.env.FORMAT_COUNTS_REASON ?? "shrink",
  });
  writeFileSync(BASELINE_PATH, JSON.stringify(base, null, 2) + "\n");
}

describe("card format counts (CR audit Phase 2)", () => {
  it("each history entry is dated and explained, and a raise says why", () => {
    const { history } = readBaseline();
    expect(history.length).toBeGreaterThan(0);
    history.forEach((e, i) => {
      expect(e.date, JSON.stringify(e)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.reason.length, JSON.stringify(e)).toBeGreaterThan(0);
      if (i === 0) return;
      const prev = history[i - 1]!;
      expect(e.date >= prev.date, `history out of order at ${e.date}`).toBe(
        true,
      );
      const raised = KEYS.filter((k) => e.counts[k] > prev.counts[k]);
      if (raised.length > 0) {
        expect(
          e.reason.length,
          `entry ${e.date} raises ${raised.join(", ")}: give the reason the format had to grow`,
        ).toBeGreaterThanOrEqual(20);
        expect(e.reason, `entry ${e.date} raises a count`).not.toBe("shrink");
      }
    });
  });

  it("the counts match the last recorded entry (they may only shrink)", () => {
    const last = readBaseline().history.at(-1)!.counts;
    const now = current();
    const up = KEYS.filter((k) => now[k] > last[k]).map(
      (k) => `${k}: ${last[k]} → ${now[k]}`,
    );
    const down = KEYS.filter((k) => now[k] < last[k]).map(
      (k) => `${k}: ${last[k]} → ${now[k]}`,
    );
    expect(
      up,
      "the card format grew: merge into an existing kind or field instead, or add a " +
        "dated history entry with the reason (tests/baselines/format-counts.json)",
    ).toEqual([]);
    expect(
      down,
      "a count went down: record it with UPDATE_FORMAT_COUNTS=1 npx vitest run tests/cards/format-counts.test.ts",
    ).toEqual([]);
  });
});
