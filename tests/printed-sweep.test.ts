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
 *         "result": "matches" | "wrong" | "filed",
 *         "abilities": ["which ability is off, in words"],   // wrong, filed
 *         "note": "what was checked or what is wrong",
 *         "cr": ["1.2.1"]                                     // wrong: required
 *       }
 *     }
 *   }
 *
 * "wrong" is the card's own mistake, fixed by the batch's fix session.
 * "filed" is a bug in a shared procedure; its note names the area ("area 8").
 *
 * Later sessions only add: one `sessions` row and its cycle's cards. A card
 * reprinted in a later cycle keeps the entry of the cycle that first swept it.
 * This test checks that the file is well formed, that every card id exists,
 * that each entry's cycle is one the card was printed in, that each session
 * covers every card printed in its cycle, and that a "matches" card has no
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
} from "../src/cards/load.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CARDS_DIR = join(ROOT, "vendor/cards-data");
const CR_NODES = join(ROOT, "vendor/cr-data/nodes.json");
const SWEEP_PATH = join(ROOT, "tests/baselines/printed-sweep.json");
const PHRASES_PATH = join(ROOT, "tests/baselines/printed-phrases.json");

const RESULTS = ["matches", "wrong", "filed"] as const;
const ENTRY_KEYS = new Set(["cycle", "result", "abilities", "note", "cr"]);
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
}

interface Sweep {
  cardsPin: string;
  crPin: string;
  sessions: Session[];
  cards: Record<string, Entry>;
}

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;

/**
 * A printing's `pack` is usually a set id, but some printings use an older
 * name: a set's `legacyCode` (`core`), the set id without `-set`
 * (`revised-core`), or a cycle id (`terminal-directive`). These two match
 * neither and are a gap in the cards data (cards v1.147.24); their cards are
 * Eternal-only, so they matter from S3 on. A new unresolved pack fails below.
 */
const UNRESOLVED_PACKS = ["stalwart", "twenty-three-seconds"];

/** Card id → the cycles it was printed in, from printings and card sets. */
function cyclesByCard(): {
  byCard: Map<string, Set<string>>;
  unresolved: Set<string>;
} {
  const sets = readJson<
    Array<{ id: string; legacyCode?: string; cardCycleId: string }>
  >(join(CARDS_DIR, "card-sets.json"));
  const cycleIds = new Set(
    readJson<Array<{ id: string }>>(join(CARDS_DIR, "card-cycles.json")).map(
      (c) => c.id,
    ),
  );
  const cycleOfSet = new Map<string, string>();
  for (const s of sets) {
    cycleOfSet.set(s.id, s.cardCycleId);
    if (s.legacyCode && !cycleOfSet.has(s.legacyCode)) {
      cycleOfSet.set(s.legacyCode, s.cardCycleId);
    }
  }
  const resolve = (pack: string): string | undefined =>
    cycleOfSet.get(pack) ??
    cycleOfSet.get(`${pack}-set`) ??
    (cycleIds.has(pack) ? pack : undefined);
  const byCard = new Map<string, Set<string>>();
  const unresolved = new Set<string>();
  const dir = join(CARDS_DIR, "printings");
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

  it("finds the cycle of every printing but the known gaps", () => {
    expect([...unresolvedPacks].sort()).toEqual(UNRESOLVED_PACKS);
  });

  it("lists each session once, with a known cycle", () => {
    const knownCycles = new Set(
      readJson<Array<{ id: string }>>(join(CARDS_DIR, "card-cycles.json")).map(
        (c) => c.id,
      ),
    );
    const ids = sweep.sessions.map((s) => s.id);
    const cyc = sweep.sessions.map((s) => s.cycle);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(cyc).size).toBe(cyc.length);
    for (const s of sweep.sessions) {
      expect(s.id, s.id).toMatch(SESSION_ID);
      expect(knownCycles.has(s.cycle), s.cycle).toBe(true);
      expect(Number.isInteger(s.cards) && s.cards > 0, s.id).toBe(true);
    }
  });

  it("covers every card printed in each session's cycle", () => {
    for (const s of sweep.sessions) {
      const printed = [...cycles]
        .filter(([, cs]) => cs.has(s.cycle))
        .map(([id]) => id);
      expect(printed.length, `${s.id} card count`).toBe(s.cards);
      const missing = printed.filter((id) => !sweep.cards[id]);
      expect(missing, `${s.id} cards with no entry`).toEqual([]);
    }
  });

  it("has well-formed entries for cards that exist", () => {
    const sessionCycles = new Set(sweep.sessions.map((s) => s.cycle));
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
      if (e.result === "filed") {
        const m = AREA.exec(e.note ?? "");
        if (!m) bad('a filed card names its area ("area 8")');
      }
    }
    expect(problems).toEqual([]);
  });

  it("leaves no 1.12 baseline entry on a card that matches", () => {
    const phrases = readJson<{ entries: Record<string, string[]> }>(
      PHRASES_PATH,
    );
    const stale = Object.entries(sweep.cards)
      .filter(([id, e]) => e.result === "matches" && phrases.entries[id])
      .map(([id]) => id);
    expect(stale).toEqual([]);
  });
});
