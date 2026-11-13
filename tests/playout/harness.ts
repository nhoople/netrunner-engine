/**
 * Seeded random playouts (CR audit tool 1.3).
 *
 * A playout deals two decks, then applies a seeded random pick from the legal
 * actions (`queryLegality`) until the game ends or the step budget runs out.
 * After every action it runs the state invariant checker
 * (`src/debug/invariants.ts`). It reports four kinds of failure:
 * - `CRASH`: `queryLegality` or `applyAction` threw;
 * - `REFUSED`: `applyAction` refused an action `queryLegality` offered;
 * - `NO_LEGAL_ACTION`: the game is not over and nothing is legal;
 * - an invariant `ProblemCode`, at the first step it appears.
 * The first three end the playout. Invariant problems do not.
 *
 * Decks come from two places:
 * - the Learn to play lists (the System Gateway starter and expanded lists,
 *   copied from netrunner-game `src/decks.ts`; the cards data has no deck
 *   lists);
 * - random legal decks per format, built from the pinned `pool.json`, the
 *   format's current card pool and its restriction (CR 1.4, 1.4.8).
 *
 * One seed decides the decks, the deal, the engine's random stream and every
 * pick, so a `(format, seed)` pair replays the same match.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  agendaPointBand,
  applyAction,
  checkInvariants,
  createInitialState,
  deckbuildingReport,
  instantiateCard,
  loadCardCatalog,
  queryLegality,
  seedRng,
  startingHandSizeFor,
  type DeckEntry,
} from "../../src/index.js";
import { setApplyHook } from "../../src/debug/applyHook.js";
import { fireOnGameStartSetup } from "../../src/state/createGame.js";
import type { CardDef, CardInstance, GameState } from "../../src/state/types.js";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const CARDS = join(ROOT, "vendor/cards-data");

export const SEEDS_PATH = join(ROOT, "tests/fixtures/playout-seeds.json");

/** Steps per playout (tool 1.3c). */
export const PLAYOUT_STEPS = 200;

/** The Learn to play lists, then the formats in the order the plan covers them. */
export const FORMATS = [
  "learn_to_play_starter",
  "learn_to_play_expanded",
  "system_gateway",
  "startup",
  "core",
  "standard",
  "eternal",
] as const;
export type Format = (typeof FORMATS)[number];

export type FailureCode = "CRASH" | "REFUSED" | "NO_LEGAL_ACTION" | string;

export interface Failure {
  code: FailureCode;
  /** 0-based index of the action that led to it. */
  step: number;
  detail: string;
}

/** One entry of `tests/fixtures/playout-seeds.json`. */
export interface SeedEntry {
  format: Format;
  deckSeed: number;
  step: number;
  code: FailureCode;
  /** First time this entry was recorded (YYYY-MM-DD). */
  recorded: string;
  detail: string;
}

export interface SeedsFile {
  steps: number;
  entries: SeedEntry[];
}

export function readSeeds(): SeedsFile {
  return JSON.parse(readFileSync(SEEDS_PATH, "utf8")) as SeedsFile;
}

/** Key a failure compares on. The detail is for people, not for matching. */
export function failureKey(f: { code: string; step: number }): string {
  return `${f.code}@${f.step}`;
}

// ---------------------------------------------------------------- random

/** mulberry32, the same stream the engine and the game use. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)]!;
}

function shuffle<T>(items: T[], random: () => number): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const swap = items[i]!;
    items[i] = items[j]!;
    items[j] = swap;
  }
}

// ---------------------------------------------------------------- decks

export interface Deck {
  identityId: string;
  /** Card ids, one per copy. */
  cards: string[];
}

/** netrunner-game `src/decks.ts`, Corp starter list. 34 cards. */
const LTP_CORP: Record<string, number> = {
  "offworld-office": 3,
  "send-a-message": 2,
  "superconducting-hub": 2,
  "nico-campaign": 2,
  "urtica-cipher": 2,
  "regolith-mining-license": 2,
  "bran-1-0": 2,
  diviner: 2,
  karuna: 2,
  palisade: 3,
  tithe: 2,
  whitespace: 2,
  "seamless-launch": 2,
  "government-subsidy": 2,
  "hedge-fund": 3,
  "manegarm-skunkworks": 1,
};

/** netrunner-game `src/decks.ts`, Corp booster cards. 10 cards. */
const LTP_CORP_BOOSTER: Record<string, number> = {
  "orbital-superiority": 2,
  funhouse: 2,
  "public-trail": 2,
  "predictive-planogram": 2,
  retribution: 1,
  "amaze-amusements": 1,
};

/** netrunner-game `src/decks.ts`, Runner starter list. 30 cards. */
const LTP_RUNNER: Record<string, number> = {
  "tread-lightly": 2,
  "creative-commission": 2,
  vrcation: 2,
  overclock: 2,
  jailbreak: 3,
  "sure-gamble": 3,
  "docklands-pass": 1,
  pennyshaver: 1,
  cleaver: 2,
  carmen: 2,
  unity: 2,
  mayfly: 2,
  "red-team": 1,
  "telework-contract": 2,
  "smartware-distributor": 2,
  "verbal-plasticity": 1,
};

/** netrunner-game `src/decks.ts`, Runner booster cards. 10 cards. */
const LTP_RUNNER_BOOSTER: Record<string, number> = {
  "wildcat-strike": 2,
  "mutual-favor": 2,
  "dzmz-optimizer": 2,
  leech: 2,
  conduit: 2,
};

/** The Gateway starter identities, legal only with their own lists (CR 1.4.1a). */
const STARTER_IDENTITIES = new Set([
  "the-syndicate-profit-over-principle",
  "the-catalyst-convention-breaker",
]);

function flat(...lists: Record<string, number>[]): string[] {
  const out: string[] = [];
  for (const list of lists) {
    for (const [id, count] of Object.entries(list)) {
      for (let n = 0; n < count; n++) out.push(id);
    }
  }
  return out;
}

export function learnToPlayDecks(list: "starter" | "expanded"): { corp: Deck; runner: Deck } {
  const expanded = list === "expanded";
  return {
    corp: {
      identityId: "the-syndicate-profit-over-principle",
      cards: expanded ? flat(LTP_CORP, LTP_CORP_BOOSTER) : flat(LTP_CORP),
    },
    runner: {
      identityId: "the-catalyst-convention-breaker",
      cards: expanded ? flat(LTP_RUNNER, LTP_RUNNER_BOOSTER) : flat(LTP_RUNNER),
    },
  };
}

interface Restriction {
  id: string;
  banned?: string[];
  /** Startup: at most this many copies of 3-point agendas. */
  max3PointAgendas?: number;
  /** Eternal: points per card; the deck's unique pointed cards may total `pointLimit`. */
  points?: Record<string, string[]>;
  pointLimit?: number;
  [key: string]: unknown;
}

/** Restriction fields this builder applies. Any other field fails loudly. */
const KNOWN_RESTRICTION_FIELDS = new Set([
  "id",
  "name",
  "formatId",
  "dateStart",
  "banned",
  "max3PointAgendas",
  "points",
  "pointLimit",
]);

export interface FormatPool {
  format: string;
  cardPoolId: string;
  restriction: Restriction | null;
  /** Card ids legal in the format, both sides, identities included. */
  cards: string[];
}

function readJson<T>(rel: string): T {
  return JSON.parse(readFileSync(join(CARDS, rel), "utf8")) as T;
}

const poolCache = new Map<string, FormatPool>();

/** The format's latest snapshot: its card pool, and its restriction if any. */
export function formatPool(format: string): FormatPool {
  const cached = poolCache.get(format);
  if (cached) return cached;
  const def = readJson<{ snapshots: { cardPoolId: string; restrictionId?: string }[] }>(
    `formats/${format}.json`,
  );
  const snapshot = def.snapshots[def.snapshots.length - 1]!;
  const cardPool = readJson<{ waves: string[] }>(`card-pools/${snapshot.cardPoolId}.json`);
  const pool = readJson<{ waves: Record<string, { cards: string[] }> }>("pool.json");
  const restriction = snapshot.restrictionId
    ? readJson<Restriction>(`restrictions/${snapshot.restrictionId}.json`)
    : null;
  for (const key of Object.keys(restriction ?? {})) {
    if (!KNOWN_RESTRICTION_FIELDS.has(key)) {
      throw new Error(`${snapshot.restrictionId}: the playout deck builder does not apply "${key}"`);
    }
  }
  const banned = new Set(restriction?.banned ?? []);
  const catalog = loadCardCatalog();
  const cards = new Set<string>();
  for (const wave of cardPool.waves) {
    const listed = pool.waves[wave];
    if (!listed) throw new Error(`pool.json has no wave ${wave} (card pool ${snapshot.cardPoolId})`);
    for (const id of listed.cards) {
      if (!banned.has(id) && catalog.has(id)) cards.add(id);
    }
  }
  const out = {
    format,
    cardPoolId: snapshot.cardPoolId,
    restriction,
    cards: [...cards].sort(),
  };
  poolCache.set(format, out);
  return out;
}

const NEUTRAL = new Set(["neutral-corp", "neutral-runner"]);

function deckEntry(def: CardDef, identityFaction: string | undefined): DeckEntry {
  // Only out-of-faction cards cost influence (CR 1.4.5).
  const inFaction = def.faction === identityFaction;
  const influence = inFaction || NEUTRAL.has(def.faction ?? "") ? 0 : def.influence;
  return {
    defId: def.id,
    influence,
    faction: def.faction,
    type: def.type,
    agendaPoints: def.agendaPoints,
    deckLimit: def.deckLimit,
    deckLimitOne: def.deckLimitOne,
    zeroInfluenceIfIceInDeckLte: def.zeroInfluenceIfIceInDeckLte,
    zeroInfluenceIfCardsInDeckGte: def.zeroInfluenceIfCardsInDeckGte,
    zeroInfluenceIfAssetsInDeckGte: def.zeroInfluenceIfAssetsInDeckGte,
    zeroInfluenceIfNonAllianceFactionCardsGte:
      def.zeroInfluenceIfNonAllianceFactionCardsGte?.threshold,
    zeroInfluenceIfCardCopiesGte: def.zeroInfluenceIfCardCopiesGte?.threshold,
  };
}

function copyLimit(def: CardDef): number {
  return def.deckLimitOne ? 1 : (def.deckLimit ?? 3);
}

function eternalPoints(restriction: Restriction | null): Map<string, number> {
  const out = new Map<string, number>();
  for (const [points, ids] of Object.entries(restriction?.points ?? {})) {
    for (const id of ids) out.set(id, Number(points));
  }
  return out;
}

/**
 * Why the deck is not legal in the format, or [] when it is. Checks CR 1.4.3
 * (size), 1.4.4 (side, identities, out-of-faction cards with no influence
 * cost), 1.4.5 (influence), 1.4.6 (agenda points), 1.4.7 (copies), and the
 * format's restriction (CR 1.4.8).
 */
export function deckProblems(format: FormatPool, deck: Deck): string[] {
  const catalog = loadCardCatalog();
  const identity = catalog.get(deck.identityId);
  if (!identity) return [`unknown identity ${deck.identityId}`];
  const problems: string[] = [];
  const legal = new Set(format.cards);
  if (!legal.has(deck.identityId)) problems.push(`${deck.identityId} is not in ${format.format}`);
  if (STARTER_IDENTITIES.has(deck.identityId)) problems.push(`${deck.identityId}: CR 1.4.1a`);
  const entries: DeckEntry[] = [];
  for (const id of deck.cards) {
    const def = catalog.get(id);
    if (!def) {
      problems.push(`unknown card ${id}`);
      continue;
    }
    if (!legal.has(id)) problems.push(`${id} is not in ${format.format}`);
    if (def.type === "identity") problems.push(`${id} is an identity (CR 1.4.4)`);
    if (def.side !== identity.side) problems.push(`${id} is from the wrong side (CR 1.4.4)`);
    const outOfFaction = def.faction !== identity.faction && !NEUTRAL.has(def.faction ?? "");
    if (outOfFaction && def.influence === undefined) {
      problems.push(`${id} is out of faction with no influence cost (CR 1.4.4)`);
    }
    entries.push(deckEntry(def, identity.faction));
  }
  const report = deckbuildingReport(entries, {
    side: identity.side,
    faction: identity.faction,
    minimumDeckSize: identity.minimumDeckSize,
    influenceLimit: identity.influenceLimit,
  });
  if (report.underMinimum) problems.push(`${report.deckSize} cards is under the minimum (CR 1.4.3)`);
  if (report.overInfluence) problems.push(`influence ${report.influence} is over the limit (CR 1.4.5)`);
  if (report.agendaOutOfRange) problems.push(`${report.agendaPoints} agenda points (CR 1.4.6)`);
  for (const id of report.overLimit) problems.push(`too many copies of ${id} (CR 1.4.7)`);
  const restriction = format.restriction;
  if (restriction?.max3PointAgendas !== undefined) {
    const threes = deck.cards.filter((id) => catalog.get(id)?.agendaPoints === 3).length;
    if (threes > restriction.max3PointAgendas) problems.push(`${threes} 3-point agendas (${restriction.id})`);
  }
  if (restriction?.pointLimit !== undefined) {
    const points = eternalPoints(restriction);
    let total = 0;
    for (const id of new Set(deck.cards)) total += points.get(id) ?? 0;
    if (total > restriction.pointLimit) problems.push(`${total} points (${restriction.id})`);
  }
  return problems;
}

/**
 * A random legal deck for `side` in `format`. The deck is exactly the
 * identity's minimum size; a Corp deck takes agendas first until it is in the
 * agenda band (CR 1.4.6), then fills with non-agenda cards. A draft that
 * cannot finish is thrown away and redrafted from the same stream.
 */
export function randomDeck(format: FormatPool, side: "corp" | "runner", random: () => number): Deck {
  const catalog = loadCardCatalog();
  const defs = format.cards.map((id) => catalog.get(id)!).filter((def) => def.side === side);
  const identities = defs.filter((def) => def.type === "identity" && !STARTER_IDENTITIES.has(def.id));
  if (identities.length === 0) throw new Error(`${format.format} has no ${side} identity`);
  const points = eternalPoints(format.restriction);
  for (let attempt = 0; attempt < 200; attempt++) {
    const identity = pick(identities, random);
    const size = identity.minimumDeckSize ?? (side === "corp" ? 45 : 40);
    const influenceLimit = identity.influenceLimit ?? 15;
    const usable = defs.filter((def) => {
      if (def.type === "identity") return false;
      const inFaction = def.faction === identity.faction || NEUTRAL.has(def.faction ?? "");
      return inFaction || def.influence !== undefined;
    });
    const agendas = usable.filter((def) => def.type === "agenda");
    const others = usable.filter((def) => def.type !== "agenda");
    const counts = new Map<string, number>();
    let influence = 0;
    let pointTotal = 0;
    let threes = 0;
    let cards = 0;
    const cost = (def: CardDef) =>
      def.faction === identity.faction || NEUTRAL.has(def.faction ?? "") ? 0 : (def.influence ?? 0);
    const fits = (def: CardDef): boolean => {
      const have = counts.get(def.id) ?? 0;
      if (have >= copyLimit(def)) return false;
      if (influence + cost(def) > influenceLimit) return false;
      if (have === 0 && pointTotal + (points.get(def.id) ?? 0) > (format.restriction?.pointLimit ?? Infinity)) {
        return false;
      }
      if (def.agendaPoints === 3 && threes >= (format.restriction?.max3PointAgendas ?? Infinity)) return false;
      return true;
    };
    const add = (def: CardDef, copies: number) => {
      for (let n = 0; n < copies && cards < size && fits(def); n++) {
        if ((counts.get(def.id) ?? 0) === 0) pointTotal += points.get(def.id) ?? 0;
        counts.set(def.id, (counts.get(def.id) ?? 0) + 1);
        influence += cost(def);
        if (def.agendaPoints === 3) threes += 1;
        cards += 1;
      }
    };
    if (side === "corp") {
      const band = agendaPointBand(size);
      let agendaPoints = 0;
      for (let tries = 0; tries < 200 && agendaPoints < band.min; tries++) {
        const def = pick(agendas, random);
        const room = band.max - agendaPoints;
        if ((def.agendaPoints ?? 0) > room || !fits(def)) continue;
        add(def, 1);
        agendaPoints += def.agendaPoints ?? 0;
      }
      if (agendaPoints < band.min || agendaPoints > band.max) continue;
    }
    for (let tries = 0; tries < 2000 && cards < size; tries++) {
      add(pick(others, random), 1 + Math.floor(random() * 3));
    }
    if (cards < size) continue;
    const deck: Deck = { identityId: identity.id, cards: [] };
    for (const [id, n] of counts) for (let i = 0; i < n; i++) deck.cards.push(id);
    deck.cards.sort();
    if (deckProblems(format, deck).length === 0) return deck;
  }
  throw new Error(`could not build a legal ${side} deck for ${format.format}`);
}

export function decksFor(format: Format, seed: number): { corp: Deck; runner: Deck } {
  if (format === "learn_to_play_starter") return learnToPlayDecks("starter");
  if (format === "learn_to_play_expanded") return learnToPlayDecks("expanded");
  const pool = formatPool(format);
  const random = rng(seed ^ 0x5eed);
  return { corp: randomDeck(pool, "corp", random), runner: randomDeck(pool, "runner", random) };
}

// ---------------------------------------------------------------- deal

/**
 * Deals a match the way netrunner-game `dealSetup` does: shuffled decks,
 * opening hands at the identity's starting hand size, Corp first. The
 * Learn to play lists play to 6 agenda points, as the game does; random decks
 * play to 7 (CR 1.7.2).
 */
export function dealMatch(format: Format, seed: number): GameState {
  const decks = decksFor(format, seed);
  const learnToPlay = format.startsWith("learn_to_play");
  const state = createInitialState({
    agendaPointsToWin: learnToPlay ? 6 : 7,
    stopAfterFirstCycle: false,
  });
  const random = rng(seed);
  const cards: Record<string, CardInstance> = {};
  const put = (card: CardInstance) => {
    cards[card.id] = card;
  };
  put(instantiateCard(decks.corp.identityId, "corp-id", "corp:hq"));
  put(instantiateCard(decks.runner.identityId, "runner-id", "runner:grip"));
  const pile = (side: "corp" | "runner", deck: Deck) => {
    const ids = deck.cards.map((defId, n) => ({ defId, id: `${side}:${defId}:${n}` }));
    shuffle(ids, random);
    return ids;
  };
  const corpPile = pile("corp", decks.corp);
  const runnerPile = pile("runner", decks.runner);
  seedRng(state, Math.floor(random() * 4294967296));
  for (const card of corpPile) put(instantiateCard(card.defId, card.id, "corp:rd"));
  for (const card of runnerPile) put(instantiateCard(card.defId, card.id, "runner:stack"));
  const corpDeck = corpPile.map((card) => card.id);
  const runnerDeck = runnerPile.map((card) => card.id);
  const corpHand = corpDeck.splice(0, startingHandSizeFor(cards["corp-id"]));
  const runnerHand = runnerDeck.splice(0, startingHandSizeFor(cards["runner-id"]));
  for (const id of corpHand) cards[id]!.zone = "corp:hq";
  for (const id of runnerHand) {
    cards[id]!.zone = "runner:grip";
    cards[id]!.faceup = true;
  }
  state.cards = cards;
  for (const [player, identityId, deck, hand] of [
    [state.corp, "corp-id", corpDeck, corpHand],
    [state.runner, "runner-id", runnerDeck, runnerHand],
  ] as const) {
    player.identityId = identityId;
    player.deck = deck;
    player.hand = hand;
    player.discardPile = [];
    player.scoreArea = [];
    player.installed = [];
    player.playArea = [];
    player.credits = 5;
    player.clicks = 0;
    player.tags = 0;
  }
  state.runner.link = cards["runner-id"]?.link ?? 0;
  for (const server of Object.values(state.servers)) {
    server.ice = [];
    server.root = [];
  }
  state.done = false;
  state.winner = null;
  state.winReason = null;
  state.log = [`Playout ${format} seed ${seed}.`];
  fireOnGameStartSetup(state);
  return state;
}

// ---------------------------------------------------------------- play

export interface PlayoutResult {
  format: Format;
  seed: number;
  /** Actions applied. */
  steps: number;
  /** True when the game ended inside the budget. */
  finished: boolean;
  failures: Failure[];
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Plays `format` from `seed` for up to `steps` actions. The global
 * invariant hook (`tests/setup/invariants.ts`) is paused while it runs: this
 * function checks the same invariants after every action and reports them as
 * failures, so the playouts keep one baseline (`tests/fixtures/playout-seeds.json`)
 * instead of two.
 */
export function playout(format: Format, seed: number, steps = PLAYOUT_STEPS): PlayoutResult {
  const previousHook = setApplyHook(null);
  try {
    return play(format, seed, steps);
  } finally {
    setApplyHook(previousHook);
  }
}

function play(format: Format, seed: number, steps: number): PlayoutResult {
  const failures: Failure[] = [];
  const seenInvariant = new Set<string>();
  const noteInvariants = (state: GameState, step: number) => {
    for (const problem of checkInvariants(state)) {
      if (seenInvariant.has(problem.code)) continue;
      seenInvariant.add(problem.code);
      failures.push({ code: problem.code, step, detail: problem.message });
    }
  };
  let state = dealMatch(format, seed);
  noteInvariants(state, -1);
  const random = rng(seed * 2654435761);
  let step = 0;
  for (; step < steps && !state.winner && !state.done; step++) {
    let legal: ReturnType<typeof queryLegality>["legal"];
    try {
      legal = queryLegality(state).legal;
    } catch (error) {
      failures.push({ code: "CRASH", step, detail: `queryLegality at ${state.timingKey}: ${message(error)}` });
      break;
    }
    if (legal.length === 0) {
      failures.push({ code: "NO_LEGAL_ACTION", step, detail: `at ${state.timingKey}` });
      break;
    }
    const action = pick(legal, random).action;
    let result: ReturnType<typeof applyAction>;
    try {
      result = applyAction(state, action);
    } catch (error) {
      failures.push({ code: "CRASH", step, detail: `${action.type} at ${state.timingKey}: ${message(error)}` });
      break;
    }
    if (!result.ok) {
      failures.push({ code: "REFUSED", step, detail: `${action.type} at ${state.timingKey}: ${result.error}` });
      break;
    }
    state = result.state;
    noteInvariants(state, step);
  }
  return {
    format,
    seed,
    steps: step,
    finished: Boolean(state.winner || state.done),
    failures,
  };
}

/**
 * The differences between a playout and its recorded entries. A failure no
 * entry lists is new; an entry that no longer happens must leave the fixture
 * (the fixture only shrinks).
 */
export function compareWithSeeds(result: PlayoutResult, entries: readonly SeedEntry[]): string[] {
  const recorded = entries.filter((e) => e.format === result.format && e.deckSeed === result.seed);
  const found = new Map(result.failures.map((f) => [failureKey(f), f]));
  const listed = new Set(recorded.map(failureKey));
  const errors: string[] = [];
  for (const [key, failure] of found) {
    if (!listed.has(key)) errors.push(`new playout failure ${key}: ${failure.detail}`);
  }
  for (const entry of recorded) {
    if (!found.has(failureKey(entry))) {
      errors.push(
        `${failureKey(entry)} is in tests/fixtures/playout-seeds.json but no longer happens: ` +
          "remove the entry (npm run playouts -- --write)",
      );
    }
  }
  return errors;
}
