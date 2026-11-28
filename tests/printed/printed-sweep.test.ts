/**
 * Printed-text sweep record (CR audit program, "Printed-text sweep").
 *
 * Card text wins over the model (CR 1.2.1). The sweep reads every card's
 * printed text against its Effect IR, one cycle per session, and records the
 * result in tests/baselines/printed-sweep.json:
 *
 *   {
 *     "cardsPin": "<cards tag the session read>",
 *     "crPin": "<CR tag the session read>",
 *     "sessions": [{ "id": "S1a", "cycle": "system-gateway", "cards": 77 }],
 *     "cards": {
 *       "<card id>": {
 *         "cycle": "<the session's cycle>",
 *         "result": "matches" | "wrong" | "filed" | "fixed",
 *         "abilities": ["which ability is off, in words"],   // not matches
 *         "note": "what was checked or what is wrong",
 *         "cr": ["1.2.1"],                                    // wrong, fixed
 *         "fixedIn": "engine#948",                            // fixed
 *         "test": "the test name that proves the fix"         // fixed
 *       }
 *     }
 *   }
 *
 * "wrong" is the card's own mistake, fixed by the batch's fix session.
 * "filed" is a bug in a shared procedure; its note names the area ("area 8").
 * "fixed" is a card a fix session (PF-S1, …) made play as printed: it names
 * the engine PR and a test in tests/ whose name states the printed behavior.
 *
 * Later sessions only add: one `sessions` row per cycle they read and those
 * cards. A card reprinted in a later cycle keeps the entry of the cycle that
 * first swept it. A cycle may have more than one row when sessions read it
 * in parts (S3d read Spin before Second Thoughts could be placed in it; S3m
 * read Second Thoughts).
 * This test checks that the file is well formed, that every card id exists,
 * that each entry's cycle is one the card was printed in, that a cycle's rows
 * together cover every card printed in it, and that a "matches" card has no
 * entry left in the 1.12 baseline (tests/baselines/printed-phrases.json), so
 * 1.12 guards it from then on.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
  cardsDataPresent,
  loadCardCatalog,
  loadCardsPin,
} from "../../src/cards/load.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CARDS_DIR = join(ROOT, "vendor/cards-data");
const CR_NODES = join(ROOT, "vendor/cr-data/nodes.json");
const SWEEP_PATH = join(ROOT, "tests/baselines/printed-sweep.json");
const PHRASES_PATH = join(ROOT, "tests/baselines/printed-phrases.json");

const RESULTS = ["matches", "wrong", "filed", "fixed"] as const;
const ENTRY_KEYS = new Set([
  "cycle",
  "result",
  "abilities",
  "note",
  "cr",
  "fixedIn",
  "test",
]);
const FIXED_IN = /^engine#\d+$/;
const SESSION_ID = /^S[1-3][a-z]+$/;
const AREA = /\barea (\d+)\b/i;

interface Session {
  id: string;
  cycle: string;
  cards: number;
}

interface Entry {
  cycle: string;
  result: (typeof RESULTS)[number];
  abilities?: string[];
  note: string;
  cr?: string[];
  fixedIn?: string;
  test?: string;
}

interface Sweep {
  cardsPin: string;
  crPin: string;
  sessions: Session[];
  cards: Record<string, Entry>;
}

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;

/** The text of every test file `npm test` runs (not tests/jnet), to find a fixed card's test by its name. */
function testSources(): string {
  const dir = join(ROOT, "tests");
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .map((f) => f.split("\\").join("/"))
    .filter((f) => f.endsWith(".test.ts") && !f.startsWith("jnet/"))
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");
}

/**
 * A printing's `pack` is usually a set id, but some printings use an older
 * name: a set's `legacyCode` (`core`), the set id without `-set`
 * (`revised-core`), or a cycle id (`terminal-directive`). Two packs match
 * none of these, a gap in the cards data (cards v1.147.25). Their printing
 * codes place them: `stalwart` is 04021–04040, the second Spin data pack,
 * Second Thoughts; `twenty-three-seconds` is 11001–11020, the first
 * Flashpoint data pack, 23 Seconds. Each card set lists 20 cards, as these
 * packs do. A new unresolved pack fails below.
 */
const PACK_SETS: Record<string, string> = {
  stalwart: "second-thoughts",
  "twenty-three-seconds": "23-seconds",
};

/** Card id → the cycles it was printed in, from printings and card sets. */
function cyclesByCard(): {
  byCard: Map<string, Set<string>>;
  unresolved: Set<string>;
} {
  const sets = readJson<
    Array<{ id: string; legacyCode?: string; cardCycleId: string }>
  >(join(CARDS_DIR, "print/card-sets.json"));
  const cycleIds = new Set(
    readJson<Array<{ id: string }>>(
      join(CARDS_DIR, "print/card-cycles.json"),
    ).map((c) => c.id),
  );
  const cycleOfSet = new Map<string, string>();
  for (const s of sets) {
    cycleOfSet.set(s.id, s.cardCycleId);
    if (s.legacyCode && !cycleOfSet.has(s.legacyCode)) {
      cycleOfSet.set(s.legacyCode, s.cardCycleId);
    }
  }
  const resolve = (pack: string): string | undefined =>
    cycleOfSet.get(PACK_SETS[pack] ?? pack) ??
    cycleOfSet.get(`${pack}-set`) ??
    (cycleIds.has(pack) ? pack : undefined);
  const byCard = new Map<string, Set<string>>();
  const unresolved = new Set<string>();
  const dir = join(CARDS_DIR, "print/printings");
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const p = readJson<{ cardId: string; pack: string }>(join(dir, f));
    const cycle = resolve(p.pack);
    if (!cycle) {
      unresolved.add(p.pack);
      continue;
    }
    if (!byCard.has(p.cardId)) byCard.set(p.cardId, new Set());
    byCard.get(p.cardId)!.add(cycle);
  }
  return { byCard, unresolved };
}

describe("printed-text sweep record", () => {
  let sweep: Sweep;
  let cardIds: Set<string>;
  let cycles: Map<string, Set<string>>;
  let crNumbers: Set<string>;
  let unresolvedPacks: Set<string>;

  beforeAll(() => {
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    if (!existsSync(CR_NODES)) throw new Error("Run npm run fetch-cr");
    sweep = readJson<Sweep>(SWEEP_PATH);
    cardIds = new Set(loadCardCatalog().keys());
    const printed = cyclesByCard();
    cycles = printed.byCard;
    unresolvedPacks = printed.unresolved;
    crNumbers = new Set(
      readJson<Array<{ number?: string }>>(CR_NODES)
        .map((n) => n.number)
        .filter((n): n is string => typeof n === "string"),
    );
  });

  it("names the pins it was read at", () => {
    expect(sweep.cardsPin).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(sweep.crPin).toMatch(/^v\d+\.\d+$/);
    const crPin = readJson<{ tag: string }>(join(ROOT, "data/cr-pin.json"));
    // A CR bump re-reads the cited rules; the cards pin may move ahead.
    expect(sweep.crPin).toBe(crPin.tag);
    expect(loadCardsPin().tag).toMatch(/^v\d+\.\d+\.\d+$/);
  });

  it("finds the cycle of every printing", () => {
    expect([...unresolvedPacks].sort()).toEqual([]);
  });

  it("lists each session once, with a known cycle", () => {
    const knownCycles = new Set(
      readJson<Array<{ id: string }>>(
        join(CARDS_DIR, "print/card-cycles.json"),
      ).map((c) => c.id),
    );
    const ids = sweep.sessions.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of sweep.sessions) {
      expect(s.id, s.id).toMatch(SESSION_ID);
      expect(knownCycles.has(s.cycle), s.cycle).toBe(true);
      expect(Number.isInteger(s.cards) && s.cards > 0, s.id).toBe(true);
    }
  });

  it("covers every card printed in each session's cycle", () => {
    const rowsByCycle = new Map<string, Session[]>();
    for (const s of sweep.sessions) {
      rowsByCycle.set(s.cycle, [...(rowsByCycle.get(s.cycle) ?? []), s]);
    }
    for (const [cycle, rows] of rowsByCycle) {
      const label = rows.map((s) => s.id).join("+");
      const printed = [...cycles]
        .filter(([, cs]) => cs.has(cycle))
        .map(([id]) => id);
      const counted = rows.reduce((sum, s) => sum + s.cards, 0);
      expect(counted, `${label} card count`).toBe(printed.length);
      const missing = printed.filter((id) => !sweep.cards[id]);
      expect(missing, `${label} cards with no entry`).toEqual([]);
    }
  });

  it("has well-formed entries for cards that exist", () => {
    const sessionCycles = new Set(sweep.sessions.map((s) => s.cycle));
    const sources = testSources();
    const problems: string[] = [];
    for (const [id, e] of Object.entries(sweep.cards)) {
      const bad = (why: string) => problems.push(`${id}: ${why}`);
      if (!cardIds.has(id)) bad("no such card in the pinned catalog");
      for (const k of Object.keys(e)) {
        if (!ENTRY_KEYS.has(k)) bad(`unknown key ${k}`);
      }
      if (!sessionCycles.has(e.cycle)) bad(`cycle ${e.cycle} has no session`);
      if (!cycles.get(id)?.has(e.cycle)) bad(`not printed in ${e.cycle}`);
      if (!RESULTS.includes(e.result)) bad(`result ${String(e.result)}`);
      if (typeof e.note !== "string" || e.note.trim() === "") bad("no note");
      if (e.abilities !== undefined) {
        if (
          !Array.isArray(e.abilities) ||
          e.abilities.length === 0 ||
          e.abilities.some((a) => typeof a !== "string" || a.trim() === "")
        ) {
          bad("abilities must be non-empty strings");
        }
      }
      if (e.cr !== undefined) {
        if (!Array.isArray(e.cr) || e.cr.length === 0)
          bad("cr must list rules");
        for (const n of e.cr ?? []) {
          if (!crNumbers.has(n)) bad(`CR ${n} is not in ${sweep.crPin}`);
        }
      }
      if (e.result !== "matches" && !e.abilities) bad("name the abilities");
      if (e.result === "wrong" && !e.cr) bad("a wrong card cites the CR");
      if (e.result === "fixed") {
        if (!e.cr) bad("a fixed card cites the CR");
        if (!FIXED_IN.test(e.fixedIn ?? "")) bad('fixedIn is "engine#N"');
        if (!e.test || !sources.includes(e.test)) {
          bad(`no test named ${JSON.stringify(e.test)} in tests/`);
        }
      } else if (e.fixedIn !== undefined || e.test !== undefined) {
        bad("only a fixed card names fixedIn and test");
      }
      if (e.result === "filed") {
        const m = AREA.exec(e.note ?? "");
        if (!m) bad('a filed card names its area ("area 8")');
      }
    }
    expect(problems).toEqual([]);
  });

  it("leaves no 1.12 baseline entry on a card that matches or is fixed", () => {
    const phrases = readJson<{ entries: Record<string, string[]> }>(
      PHRASES_PATH,
    );
    const stale = Object.entries(sweep.cards)
      .filter(
        ([id, e]) =>
          (e.result === "matches" || e.result === "fixed") &&
          phrases.entries[id],
      )
      .map(([id]) => id);
    expect(stale).toEqual([]);
  });
});
