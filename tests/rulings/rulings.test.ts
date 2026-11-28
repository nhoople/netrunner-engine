/**
 * Official rulings as tests (CR audit tool 1.14).
 *
 * Lists every ruling at the cards pin (vendor/cards-data/rulings/<card>.json,
 * numbered 1, 2, … in file order) and the `it()` titles in
 * tests/rulings/rulings-*.test.ts that cite it. A test cites a ruling by starting its
 * title with the card's title and a colon, and ending it with the ruling
 * number:
 *
 *   it("Account Siphon: the Runner may still use the replacement when the Corp has 0 credits (ruling 2)", …)
 *
 * An identity may be named by the part of its title before the colon when
 * that is unique among the cards with rulings ("Weyland Consortium: …" for
 * Weyland Consortium: Built to Last). `(rulings 1, 2)` cites several, and
 * a filed ruling may go on after a semicolon: `(ruling 1; filed, area 16,
 * CR 1.7.1: …)`.
 *
 * - A ruling the engine plays wrong is a finding, not a fix: an `it.skip`
 *   or `it.todo` whose title names the ruling and the CR rule, filed under
 *   its area in the CR audit plan. It counts as cited, and the generated
 *   table lists it as filed.
 * - Uncited rulings are in tests/baselines/rulings.json, which may only
 *   shrink. `unreachable` holds rulings no supported card can reach, each
 *   with a dated reason; `uncited` holds the rest by card type, for later
 *   batches.
 * - tests/generated/rulings-coverage.json is the per-type table. Regenerate
 *   with UPDATE_RULINGS_COVERAGE=1 npx vitest run tests/rulings/rulings.test.ts
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  cardsDataPresent,
  loadCardCatalog,
} from "../../src/index.js";
import { itCalls } from "../cr-citations/cr-citations.js";

const CARDS_TAG = "v1.147.29";

beforeAll(() => {
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertCardsPinnedTag(CARDS_TAG);
});

const ROOT = process.cwd();
const RULINGS_DIR = join(ROOT, "vendor/cards-data/rulings");
const BASELINE_PATH = join(ROOT, "tests/baselines/rulings.json");
const TABLE_PATH = join(ROOT, "tests/generated/rulings-coverage.json");

type Ruling = { key: string; cardId: string; n: number; type: string };

type Baseline = {
  _comment: string;
  cardsTag: string;
  /** `card#n` -> `YYYY-MM-DD: why no supported card can reach it` */
  unreachable: Record<string, string>;
  /** card type -> `card#n` not yet tested */
  uncited: Record<string, string[]>;
};

type Coverage = {
  _comment: string;
  cardsTag: string;
  totals: {
    rulings: number;
    cards: number;
    tested: number;
    filed: number;
    unreachable: number;
    uncited: number;
  };
  types: Array<{
    type: string;
    rulings: number;
    tested: number;
    filed: number;
    uncited: number;
  }>;
  /** `card#n` -> `file › it title` for each test that cites it */
  rulings: Record<string, string[]>;
  /** `card#n` cited only by it.skip / it.todo: the filed findings */
  filed: string[];
};

/** Lower case, no accents, straight quotes: “Bios” and "Bios" match. */
function norm(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u201c\u201d\u201e]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .toLowerCase()
    .trim();
}

function loadRulings(): Ruling[] {
  const catalog = loadCardCatalog();
  const out: Ruling[] = [];
  for (const file of readdirSync(RULINGS_DIR).sort()) {
    if (!file.endsWith(".json")) continue;
    const data = JSON.parse(readFileSync(join(RULINGS_DIR, file), "utf8")) as {
      cardId: string;
      rulings: unknown[];
    };
    const def = catalog.get(data.cardId);
    if (!def) throw new Error(`rulings/${file}: no card ${data.cardId}`);
    data.rulings.forEach((_, i) => {
      out.push({
        key: `${data.cardId}#${i + 1}`,
        cardId: data.cardId,
        n: i + 1,
        type: def.type,
      });
    });
  }
  return out;
}

/** Card names a title may start with -> card id, longest first. */
function cardNames(cardIds: Set<string>): Array<[string, string]> {
  const catalog = loadCardCatalog();
  const names = new Map<string, string>();
  const short = new Map<string, string[]>();
  for (const id of cardIds) {
    const title = norm(catalog.get(id)!.title);
    names.set(title, id);
    const colon = title.indexOf(": ");
    if (colon > 0) {
      const s = title.slice(0, colon);
      short.set(s, [...(short.get(s) ?? []), id]);
    }
  }
  for (const [s, ids] of short) {
    if (ids.length === 1 && !names.has(s)) names.set(s, ids[0]!);
  }
  return [...names].sort((a, b) => b[0].length - a[0].length);
}

// `(ruling 2)`, `(rulings 1, 2)`, `(ruling 1; filed, area 16, CR 1.7.1: …)`.
const RULING_CITE = /\(rulings? (\d+(?:\s*(?:,|and)\s*\d+)*)[);]/g;

type Citations = {
  tested: Map<string, string[]>;
  filed: Map<string, string[]>;
  problems: string[];
};

function rulingCitations(rulings: Ruling[]): Citations {
  const known = new Set(rulings.map((r) => r.key));
  const names = cardNames(new Set(rulings.map((r) => r.cardId)));
  const tested = new Map<string, string[]>();
  const filed = new Map<string, string[]>();
  const problems: string[] = [];
  const files = readdirSync(join(ROOT, "tests/rulings"))
    .filter((f) => /^rulings-[\w-]+\.test\.ts$/.test(f))
    .sort();
  for (const file of files) {
    const text = readFileSync(join(ROOT, "tests/rulings", file), "utf8");
    for (const call of itCalls(text)) {
      // Source text: `\"` in a title is a quote.
      const title = call.title.replace(/\\(.)/g, "$1");
      const modifier = call.modifier;
      const cites = [...title.matchAll(RULING_CITE)];
      if (cites.length === 0) continue;
      const where = `${file} › ${title}`;
      const t = norm(title);
      const card = names.find(([name]) => t.startsWith(`${name}:`))?.[1];
      if (!card) {
        problems.push(`${where}: does not start with a card title and ":"`);
        continue;
      }
      const isFiled = modifier === "skip" || modifier === "todo";
      if (isFiled && !/\bCR \d+\.\d+/.test(title)) {
        problems.push(`${where}: a filed ruling names the CR rule it breaks`);
      }
      for (const c of cites) {
        for (const n of c[1]!.match(/\d+/g)!) {
          const key = `${card}#${n}`;
          if (!known.has(key)) {
            problems.push(`${where}: ${key} is not a ruling at the pin`);
            continue;
          }
          const into = isFiled ? filed : tested;
          into.set(key, [...(into.get(key) ?? []), where]);
        }
      }
    }
  }
  return { tested, filed, problems };
}

function computeCoverage(
  rulings: Ruling[],
  cites: Citations,
  unreachable: Set<string>,
): Coverage {
  const byRuling: Record<string, string[]> = {};
  for (const r of rulings) {
    byRuling[r.key] = [
      ...(cites.tested.get(r.key) ?? []),
      ...(cites.filed.get(r.key) ?? []),
    ];
  }
  const isTested = (r: Ruling) => cites.tested.has(r.key);
  const isFiled = (r: Ruling) => !isTested(r) && cites.filed.has(r.key);
  const isUncited = (r: Ruling) =>
    byRuling[r.key]!.length === 0 && !unreachable.has(r.key);
  const types = [...new Set(rulings.map((r) => r.type))].sort();
  return {
    _comment:
      "Generated by tests/rulings/rulings.test.ts (CR audit tool 1.14). " +
      "Do not edit by hand; regenerate with UPDATE_RULINGS_COVERAGE=1.",
    cardsTag: CARDS_TAG,
    totals: {
      rulings: rulings.length,
      cards: new Set(rulings.map((r) => r.cardId)).size,
      tested: rulings.filter(isTested).length,
      filed: rulings.filter(isFiled).length,
      unreachable: rulings.filter((r) => unreachable.has(r.key)).length,
      uncited: rulings.filter(isUncited).length,
    },
    types: types
      .map((type) => {
        const mine = rulings.filter((r) => r.type === type);
        return {
          type,
          rulings: mine.length,
          tested: mine.filter(isTested).length,
          filed: mine.filter(isFiled).length,
          uncited: mine.filter(isUncited).length,
        };
      })
      .sort((a, b) => b.rulings - a.rulings || a.type.localeCompare(b.type)),
    rulings: byRuling,
    filed: rulings.filter(isFiled).map((r) => r.key),
  };
}

describe("Official rulings as tests (CR audit 1.14)", () => {
  const rulings = loadRulings();
  const cites = rulingCitations(rulings);
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
  const unreachable = new Set(Object.keys(baseline.unreachable));
  const coverage = computeCoverage(rulings, cites, unreachable);

  it("finds every ruling at the cards pin", () => {
    expect(rulings.length).toBe(275);
    expect(new Set(rulings.map((r) => r.cardId)).size).toBe(134);
    expect(baseline.cardsTag).toBe(CARDS_TAG);
  });

  it("every ruling citation names a card with rulings, a ruling at the pin, and for a filed ruling its CR rule", () => {
    expect(cites.problems).toEqual([]);
  });

  it("every official ruling is cited by a test or listed in the baseline", () => {
    const uncited = rulings
      .filter((r) => !cites.tested.has(r.key) && !cites.filed.has(r.key))
      .map((r) => r.key);
    const listed = [...unreachable, ...Object.values(baseline.uncited).flat()];
    expect(
      uncited.filter((k) => !listed.includes(k)),
      "ruling(s) no it() title in tests/rulings/rulings-*.test.ts cites: add a " +
        "test, or record it in tests/baselines/rulings.json",
    ).toEqual([]);
    expect(
      listed.filter((k) => !uncited.includes(k)),
      "ruling(s) now cited, or not at the pin: remove from " +
        "tests/baselines/rulings.json",
    ).toEqual([]);
    expect(new Set(listed).size, "a ruling listed twice").toBe(listed.length);
  });

  it("the baseline lists uncited rulings under their card type, and unreachable ones with a dated reason", () => {
    const typeOf = new Map(rulings.map((r) => [r.key, r.type]));
    for (const [type, keys] of Object.entries(baseline.uncited)) {
      for (const k of keys) expect(typeOf.get(k), k).toBe(type);
    }
    for (const [k, reason] of Object.entries(baseline.unreachable)) {
      expect(reason, k).toMatch(/^\d{4}-\d{2}-\d{2}: \S/);
    }
  });

  it("the generated per-type table is current", () => {
    const want = `${JSON.stringify(coverage, null, 2)}\n`;
    if (process.env.UPDATE_RULINGS_COVERAGE) {
      mkdirSync(dirname(TABLE_PATH), { recursive: true });
      writeFileSync(TABLE_PATH, want);
    }
    expect(
      readFileSync(TABLE_PATH, "utf8"),
      "tests/generated/rulings-coverage.json is stale; regenerate with " +
        "UPDATE_RULINGS_COVERAGE=1 npx vitest run tests/rulings/rulings.test.ts",
    ).toBe(want);
  });
});
