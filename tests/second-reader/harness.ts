/**
 * Second reader (CR audit tool 1.16): shared pieces for the comparison.
 *
 * A driver builds a position with the engine's public API, plays the steps a
 * case lists, and hands back snapshots of the state plus the few facts a
 * snapshot cannot show (whether a move was legal, who was asked to choose).
 * The comparison reads the standard observations (credits, zones, counters)
 * from the snapshots here, not in the driver, so a driver cannot colour them.
 *
 * Not a test file: vitest only runs `*.test.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyAction,
  cloneState,
  effectiveBreakerStrength,
  effectiveIceStrength,
  effectiveIceSubtypes,
  legalActions,
} from "../../src/index.js";
import type { Action, GameState } from "../../src/index.js";
import { agendaPointsFor } from "../../src/state/turnAndActions/scoring.js";
import {
  memoryLimit,
  usedMemory,
} from "../../src/state/turnAndActions/turn.js";
import { hostCard } from "../../src/state/hostingAndTrash/host.js";
import { isInstalled } from "../../src/state/uninstallAndPosition/uninstall.js";
import {
  corpTurn,
  fresh,
  installIce,
  installRoot,
  installRunner,
  must,
  optionIds,
  put,
  runnerTurn,
  serverOf,
  setIdentity,
  stackRd,
  toHand,
} from "../rulings/rulings-helpers.js";
import type { ServerId } from "../../src/state/types/servers.js";

type Expectation = {
  at?: string;
  observe: string;
  equals: unknown;
  why?: string;
  confidence?: string;
};

export type Case = {
  id: string;
  example: string;
  run?: boolean;
  skip?: string;
  confidence?: string;
  rules: string[];
  cards: string[];
  position?: string;
  steps?: Array<{ label: string; do: string }>;
  expect?: Expectation[];
};

export type Batch = {
  batch: string;
  title: string;
  reader: { model: string; name: string };
  sources: { cr: string; cards: string };
  /** A rulings batch: the ids of the cards whose rulings it samples. */
  cards?: string[];
  /** A batch of jinteki scenarios: their names. */
  scenarios?: string[];
  cases: Case[];
};

/** `pending`: found by the comparison and not yet read by cr-checker. */
type Verdict = "pending" | "engine-wrong" | "reader-wrong" | "cr-open";

export type Difference = {
  batch: string;
  case: string;
  /** Each observation that differed: its `at::observe` key and both values. */
  observations: Array<{ key: string; expected: unknown; engine: unknown }>;
  verdict: Verdict;
  /** The CR rule that decides it. */
  rule: string;
  /** For engine-wrong: the area that owns the rule (tests/cr-citations/cr-section-owners.json). */
  area?: string;
  /** In plain words: what the rule says and what the engine does. */
  note: string;
};

const DIR = join(process.cwd(), "tests", "second-reader");

export function loadBatch(name: string): Batch {
  return JSON.parse(readFileSync(join(DIR, `${name}.json`), "utf8")) as Batch;
}

export function loadDifferences(): Difference[] {
  return JSON.parse(
    readFileSync(join(DIR, "differences.json"), "utf8"),
  ) as Difference[];
}

/** What a driver hands back. */
export class Report {
  readonly snaps = new Map<string, GameState>();
  readonly facts = new Map<string, unknown>();
  /** Card title to instance id, filled by `Board`. */
  readonly ids = new Map<string, string>();
  /** Observations the engine's state cannot show, with the reason. */
  readonly unobserved = new Map<string, string>();
  /** Titles the position holds more than one copy of. */
  readonly duplicates = new Set<string>();
  /** A snapshot that one observation at one step is read from. */
  readonly snapsFor = new Map<string, GameState>();

  /** Keep the state as it is after the step `label`. */
  snap(label: string, s: GameState): GameState {
    this.snaps.set(label, cloneState(s));
    return s;
  }

  /**
   * Read one standard observation at `label` from this state, not from the
   * step's snapshot: for a fact that holds only between two stops.
   */
  snapFor(label: string, observe: string, s: GameState): void {
    this.snapsFor.set(`${label}::${observe}`, cloneState(s));
  }

  /**
   * Record a fact a snapshot cannot show (a legal move, who chooses). A
   * standard observation cannot be set this way. `at` is the step label.
   */
  fact(observe: string, value: unknown, at?: string): void {
    this.facts.set(`${at ?? ""}::${observe}`, value);
  }

  cannotObserve(observe: string, reason: string): void {
    this.unobserved.set(observe, reason);
  }
}

const SERVER_NAMES: Record<string, string> = {
  hq: "HQ",
  rd: "R&D",
  archives: "Archives",
};

function serverName(id: string): string {
  return SERVER_NAMES[id] ?? "remote";
}

function zoneOf(s: GameState, id: string): string {
  const card = s.cards[id];
  if (!card) return "gone";
  if (s.removedFromGame?.includes(id)) return "removed";
  const zone = card.zone as string;
  const hostId = (card as { hostId?: string }).hostId;
  const inPlay = zone === "runner:installed" || zone.startsWith("server:");
  if (hostId && s.cards[hostId] && inPlay) {
    return `hosted:${s.cards[hostId]!.title}`;
  }
  const server = /^server:(.+):(root|ice)$/.exec(zone);
  if (server) return `${server[2]}:${serverName(server[1]!)}`;
  const hosted = /^hosted:(.+)$/.exec(zone);
  if (hosted) return `hosted:${s.cards[hosted[1]!]?.title ?? hosted[1]}`;
  const names: Record<string, string> = {
    "runner:grip": "grip",
    "runner:stack": "stack",
    "runner:heap": "heap",
    "runner:installed": "rig",
    "runner:score": "runner-score",
    "corp:hq": "hq",
    "corp:rd": "rd",
    "corp:archives": "archives",
    "corp:score": "corp-score",
    "removed-from-game": "removed",
  };
  return names[zone] ?? zone;
}

const COUNTER_FIELDS: Record<string, string[]> = {
  advancement: ["advancementCounters"],
  power: ["powerCounters"],
  virus: ["virusCounters"],
  agenda: ["agendaCounters"],
  credit: ["hostedCredits", "recurringCredits"],
  badPublicity: ["badPublicityCounters"],
};

const NOT_STANDARD = Symbol("not a standard observation");

/** Read one standard observation from a snapshot. */
function standard(
  s: GameState,
  observe: string,
  ids: Map<string, string>,
  duplicates: Set<string> = new Set(),
): unknown {
  const simple: Record<string, () => unknown> = {
    "runner.credits": () => s.runner.credits,
    "corp.credits": () => s.corp.credits,
    "runner.clicks": () => s.runner.clicks,
    "corp.clicks": () => s.corp.clicks,
    "runner.tags": () => s.runner.tags,
    "corp.badPublicity": () =>
      (s.corp as { badPublicity?: number }).badPublicity ?? 0,
    "runner.grip": () => s.runner.hand.length,
    "corp.hq": () => s.corp.hand.length,
    "corp.archives": () => s.corp.discardPile.length,
    "runner.heap": () => s.runner.discardPile.length,
    "runner.score": () => agendaPointsFor(s, "runner"),
    "corp.score": () => agendaPointsFor(s, "corp"),
    "runner.memoryLimit": () => memoryLimit(s),
    "runner.memoryUsed": () => usedMemory(s),
    "run.active": () => Boolean(s.run),
    "run.outcome": () => {
      if (s.run) return "in-progress";
      if (s.turn.successfulRunThisTurn && s.turn.unsuccessfulRunThisTurn) {
        return "both kinds of run happened this turn";
      }
      if (s.turn.successfulRunThisTurn) return "successful";
      if (s.turn.unsuccessfulRunThisTurn) return "unsuccessful";
      return "neither";
    },
    badPublicityFund: () => s.badPublicityFund ?? 0,
  };
  if (simple[observe]) return simple[observe]!();

  const call = /^(\w+)\((.+)\)$/.exec(observe);
  if (!call) return NOT_STANDARD;
  const [, fn, rawArgs] = call;
  const comma = rawArgs!.lastIndexOf(",");
  const twoArgs = ["counters", "hasSubtype"].includes(fn!);
  const title = twoArgs ? rawArgs!.slice(0, comma) : rawArgs!;
  const arg = twoArgs ? rawArgs!.slice(comma + 1).trim() : "";
  if (
    ![
      "zone",
      "installed",
      "rezzed",
      "faceup",
      "counters",
      "hostedCards",
      "strength",
      "hasSubtype",
    ].includes(fn!)
  ) {
    return NOT_STANDARD;
  }
  const named = ids.get(title);
  if (!named) throw new Error(`driver did not name the card "${title}"`);
  if (duplicates.has(title)) {
    throw new Error(`the position has more than one "${title}"`);
  }
  // A card the engine made a new object of (CR 1.12.3, for one arranged in
  // R&D) has a new id: follow it by its title.
  const renamed = Object.values(s.cards).filter((c) => c.title === title);
  const id = s.cards[named] || renamed.length !== 1 ? named : renamed[0]!.id;
  const card = s.cards[id];
  switch (fn) {
    case "zone":
      return zoneOf(s, id);
    case "installed":
      return Boolean(card) && isInstalled(s, id);
    case "rezzed":
      return Boolean(card?.rezzed);
    case "faceup":
      return Boolean(card?.faceup);
    case "counters": {
      const fields = COUNTER_FIELDS[arg];
      if (!fields) throw new Error(`unknown counter kind "${arg}"`);
      const bag = (card ?? {}) as unknown as Record<string, number>;
      // Credits placed on a run event (Stimhack) are kept on the run.
      const onRunEvent =
        arg === "credit" && s.playedRunEventId === id
          ? ((s.run as { eventCredits?: number } | null)?.eventCredits ?? 0)
          : 0;
      return fields.reduce((sum, f) => sum + (bag[f] ?? 0), onRunEvent);
    }
    case "hostedCards":
      return Object.values(s.cards).filter(
        (c) => (c as { hostId?: string }).hostId === id,
      ).length;
    case "strength":
      return card?.type === "ice"
        ? effectiveIceStrength(s, id)
        : effectiveBreakerStrength(s, id);
    case "hasSubtype":
      return (
        card?.type === "ice" ? effectiveIceSubtypes(s, id) : card?.subtypes
      )
        ?.map((t) => t.toLowerCase())
        .includes(arg.toLowerCase());
    default:
      return NOT_STANDARD;
  }
}

export type Comparison = {
  key: string;
  expected: unknown;
  engine: unknown;
  agrees: boolean;
  unobserved?: string;
};

/** Compare every expectation of a case with what the driver reported. */
export function compare(c: Case, report: Report): Comparison[] {
  const last = c.steps![c.steps!.length - 1]!.label;
  return (c.expect ?? []).map((e) => {
    const key = `${e.at ?? ""}::${e.observe}`;
    const unobserved = report.unobserved.get(e.observe);
    if (unobserved) {
      return {
        key,
        expected: e.equals,
        engine: undefined,
        agrees: false,
        unobserved,
      };
    }
    const label = e.at ?? last;
    const snap =
      report.snapsFor.get(`${label}::${e.observe}`) ?? report.snaps.get(label);
    let engine = snap
      ? standard(snap, e.observe, report.ids, report.duplicates)
      : NOT_STANDARD;
    const fact = [key, `${last}::${e.observe}`, `::${e.observe}`].find((k) =>
      report.facts.has(k),
    );
    if (engine !== NOT_STANDARD && fact) {
      throw new Error(
        `${c.id}: "${e.observe}" is a standard observation; the driver may not set it`,
      );
    }
    if (engine === NOT_STANDARD) {
      if (!fact) {
        throw new Error(
          `${c.id}: the driver reported nothing for "${e.observe}" at "${label}"`,
        );
      }
      engine = report.facts.get(fact);
    }
    return {
      key,
      expected: e.equals,
      engine,
      agrees: JSON.stringify(engine) === JSON.stringify(e.equals),
    };
  });
}

/**
 * Position builder. It wraps the shared fixture helpers, gives each card an
 * id, and remembers the id by title so the comparison can find the card.
 */
export class Board {
  s: GameState;
  private n = 0;

  constructor(
    readonly report: Report,
    side: "corp" | "runner",
    credits = 5,
  ) {
    const s = fresh();
    setIdentity(s, "corp", "the-syndicate-profit-over-principle");
    // Only filler and the cards a case names sit in HQ, R&D and the stack.
    const filler = (id: string) => id.includes("-fill-");
    for (const id of [...s.corp.hand, ...s.corp.deck, ...s.runner.deck]) {
      if (!filler(id)) delete s.cards[id];
    }
    s.corp.hand = [];
    s.corp.deck = s.corp.deck.filter(filler);
    s.runner.deck = s.runner.deck.filter(filler);
    s.corp.credits = 5;
    s.runner.credits = 5;
    this.s = side === "corp" ? corpTurn(s, credits) : runnerTurn(s, credits);
  }

  private name(defId: string): string {
    this.n += 1;
    return `${defId}-${this.n}`;
  }

  private remember(id: string): string {
    const title = this.s.cards[id]!.title;
    if (this.report.ids.has(title)) this.report.duplicates.add(title);
    else this.report.ids.set(title, id);
    return id;
  }

  identity(side: "corp" | "runner", defId: string): string {
    return this.remember(setIdentity(this.s, side, defId).id);
  }

  rig(defId: string): string {
    return this.remember(installRunner(this.s, defId, this.name(defId)).id);
  }

  /** Ice on a server; the first one placed is innermost. */
  ice(defId: string, server: string, rezzed = true): string {
    const id = this.name(defId);
    installIce(this.s, defId, id, server as ServerId, rezzed);
    return this.remember(id);
  }

  /** A card alone in the root of a new remote server. Returns [cardId, serverId]. */
  remote(defId: string, rezzed = false): [string, string] {
    const id = this.name(defId);
    installRoot(this.s, defId, id, rezzed);
    return [this.remember(id), serverOf(this.s, id)];
  }

  /** Another card in the root of an existing server. */
  root(defId: string, server: string, rezzed = false): string {
    const id = this.name(defId);
    const card = put(this.s, defId, id, `server:${server}:root`);
    card.rezzed = rezzed;
    card.faceup = rezzed;
    this.s.servers[server as ServerId]!.root.push(id);
    return this.remember(id);
  }

  grip(...defIds: string[]): string[] {
    return defIds.map((d) => {
      const id = this.name(d);
      toHand(this.s, "runner", d, id);
      return this.remember(id);
    });
  }

  hq(...defIds: string[]): string[] {
    return defIds.map((d) => {
      const id = this.name(d);
      toHand(this.s, "corp", d, id);
      return this.remember(id);
    });
  }

  /** Cards on top of R&D, first on top. */
  rd(...defIds: string[]): string[] {
    const pairs = defIds.map((d) => [d, this.name(d)] as [string, string]);
    stackRd(this.s, pairs);
    return pairs.map(([, id]) => this.remember(id));
  }

  stack(...defIds: string[]): string[] {
    return defIds.map((d) => {
      const id = this.name(d);
      put(this.s, d, id, "runner:stack");
      this.s.runner.deck.push(id);
      return this.remember(id);
    });
  }

  heap(...defIds: string[]): string[] {
    return defIds.map((d) => {
      const id = this.name(d);
      put(this.s, d, id, "runner:heap");
      this.s.runner.discardPile.push(id);
      return this.remember(id);
    });
  }

  archives(defId: string, faceup = true): string {
    const id = this.name(defId);
    const card = put(this.s, defId, id, "corp:archives");
    card.faceup = faceup;
    this.s.corp.discardPile.push(id);
    return this.remember(id);
  }

  scored(side: "corp" | "runner", defId: string): string {
    const id = this.name(defId);
    const card = put(this.s, defId, id, `${side}:score`);
    card.faceup = true;
    (side === "corp" ? this.s.corp : this.s.runner).scoreArea.push(id);
    return this.remember(id);
  }

  /** A card hosted faceup on an installed card, not installed itself (Detente). */
  hostedOn(defId: string, hostId: string): string {
    const id = this.name(defId);
    const card = put(this.s, defId, id, `hosted:${hostId}`);
    hostCard(this.s, id, hostId, { installed: true, faceup: true });
    card.zone = `hosted:${hostId}` as typeof card.zone;
    card.rezzed = false;
    return this.remember(id);
  }

  card(id: string) {
    return this.s.cards[id]!;
  }
}

/** The legal actions of one type, optionally for one card. */
export function offered(
  s: GameState,
  type: Action["type"],
  cardId?: string,
): Action[] {
  return legalActions(s).filter(
    (a) =>
      a.type === type &&
      (cardId === undefined ||
        (a as { cardId?: string }).cardId === cardId ||
        (a as { breakerId?: string }).breakerId === cardId),
  );
}

/** Whether the engine accepts an action, without changing the state. */
export function accepts(s: GameState, action: Action): boolean {
  return applyAction(cloneState(s), action).ok;
}

/** Apply the first offered action of a type (for a card), or throw. */
export function take(
  s: GameState,
  type: Action["type"],
  cardId?: string,
  pickAction: (a: Action) => boolean = () => true,
): GameState {
  const action = offered(s, type, cardId).find(pickAction);
  if (!action) {
    throw new Error(
      `no ${type}${cardId ? ` for ${cardId}` : ""} at ${s.timingKey}: ${describe(s)}`,
    );
  }
  return must(s, action);
}

/** Whether an open choice has an option whose id or label contains `part`. */
export function hasOption(s: GameState, part: string): boolean {
  return (s.pendingChoice?.options ?? []).some(
    (o) =>
      o.id.includes(part) ||
      ((o as { label?: string }).label ?? "").includes(part),
  );
}

/** What the engine is waiting for: used in error messages. */
function describe(s: GameState): string {
  const choice = s.pendingChoice
    ? ` choice[${s.pendingChoice.chooser}] ${optionIds(s).join(" | ")}`
    : "";
  const legal = legalActions(s)
    .map((a) => JSON.stringify(a))
    .join(" ");
  return `${s.timingKey}${choice} legal: ${legal}`;
}
