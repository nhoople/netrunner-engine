/**
 * Loader for matches exported from the netrunner-game debug page
 * (verification table V5). A bug found by hand on the table becomes a
 * regression test by dropping its fixture in `tests/fixtures/game-exports/`.
 *
 * A fixture holds the opening state and every engine action the host
 * applied, in order, including the empty priority windows the host passed
 * without a log line. Each step is `applyAction` then `autoWalk`, which is
 * all the host does, so the replay needs no game code.
 *
 * Failures use the playout seed fixtures' shape (CR audit tool 1.3,
 * `tests/fixtures/playout-seeds.json`): `{ code, step, detail }`, keyed on
 * `code@step`. `step` is the 0-based index of the action after which an
 * invariant problem first appears; -1 means the opening already had it. A
 * refused step ends the replay as `REFUSED`, as in a playout.
 *
 * The final state is compared by `stateHash`: sha256 of the state's JSON
 * with object keys sorted, without its text log. netrunner-game
 * `src/export.ts` computes the same hash when it writes the fixture.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyAction, autoWalk, checkInvariants } from "../../src/index.js";
import type { Action, GameState } from "../../src/state/types.js";
import { failureKey, type Failure } from "../playout/harness.js";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const GAME_EXPORTS_DIR = join(ROOT, "tests/fixtures/game-exports");

export const FIXTURE_FORMAT = "netrunner-game-export";
export const FIXTURE_VERSION = 1;

export interface GameExportStep {
  action: Action;
  /** The game's log entry for a seat's intent, or null for a window the host passed. */
  logSeq: number | null;
}

export interface GameExportFinal {
  stateHash: string;
  timingKey: string;
  turnNumber: number;
  activeSide: string;
  done: boolean;
  winner: string | null;
  /** Invariant problem codes on the final state, sorted. */
  invariants: string[];
  [field: string]: unknown;
}

export interface GameExport {
  format: typeof FIXTURE_FORMAT;
  version: typeof FIXTURE_VERSION;
  /** Where and when it was exported, and the release tags the game pinned. */
  source: { matchId: string; exportedAt: string; engine: string; cards: string; cr: string; [field: string]: unknown };
  opening: GameState;
  steps: GameExportStep[];
  failures: Failure[];
  final: GameExportFinal;
}

export function readGameExport(path: string): GameExport {
  const fixture = JSON.parse(readFileSync(path, "utf8")) as GameExport;
  if (fixture.format !== FIXTURE_FORMAT || fixture.version !== FIXTURE_VERSION) {
    throw new Error(`${path} is not a ${FIXTURE_FORMAT} v${FIXTURE_VERSION} fixture`);
  }
  return fixture;
}

/** Every fixture file in `tests/fixtures/game-exports/`, by file name. */
export function gameExportFiles(dir = GAME_EXPORTS_DIR): string[] {
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .sort();
  } catch {
    return [];
  }
}

/** JSON with object keys sorted and undefined values dropped. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(item).sort()) sorted[key] = (item as Record<string, unknown>)[key];
    return sorted;
  });
}

/** sha256 of a state's canonical JSON without its text log. */
export function stateHash(state: GameState): string {
  const { log: _log, ...rest } = state;
  return createHash("sha256").update(canonicalJson(rest)).digest("hex");
}

export interface GameExportReplay {
  state: GameState;
  failures: Failure[];
  /** Steps applied before a refusal, or all of them. */
  applied: number;
}

/** Replay a fixture from its opening and collect failures in the playout shape. */
export function replayGameExport(fixture: GameExport): GameExportReplay {
  let state = structuredClone(fixture.opening);
  const failures: Failure[] = [];
  const seen = new Set<string>();
  const note = (step: number) => {
    for (const problem of checkInvariants(state)) {
      const key = `${problem.code}:${problem.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      failures.push({ code: problem.code, step, detail: problem.message });
    }
  };
  note(-1);
  for (const [index, step] of fixture.steps.entries()) {
    const applied = applyAction(state, step.action);
    if (!applied.ok) {
      failures.push({ code: "REFUSED", step: index, detail: `${step.action.type} at ${state.timingKey}: ${applied.error}` });
      return { state, failures, applied: index };
    }
    state = applied.state;
    autoWalk(state);
    note(index);
  }
  return { state, failures, applied: fixture.steps.length };
}

/** Differences between a replay and its fixture. Empty when the replay matches. */
export function compareGameExport(fixture: GameExport, replay: GameExportReplay): string[] {
  const errors: string[] = [];
  const found = new Map(replay.failures.map((f) => [failureKey(f), f]));
  const listed = new Set(fixture.failures.map(failureKey));
  for (const [key, failure] of found) {
    if (!listed.has(key)) errors.push(`new failure ${key}: ${failure.detail}`);
  }
  for (const failure of fixture.failures) {
    if (!found.has(failureKey(failure))) errors.push(`${failureKey(failure)} is in the fixture but no longer happens`);
  }
  if (replay.applied !== fixture.steps.length) return errors;
  const state = replay.state;
  const fields: Array<[string, unknown, unknown]> = [
    ["timingKey", state.timingKey, fixture.final.timingKey],
    ["turnNumber", state.turnNumber, fixture.final.turnNumber],
    ["activeSide", state.activeSide, fixture.final.activeSide],
    ["done", state.done, fixture.final.done],
    ["winner", state.winner ?? null, fixture.final.winner],
  ];
  for (const [name, actual, expected] of fields) {
    if (actual !== expected) errors.push(`final ${name} is ${String(actual)}, fixture says ${String(expected)}`);
  }
  const invariants = [...new Set(checkInvariants(state).map((p) => p.code))].sort();
  if (invariants.join(",") !== fixture.final.invariants.join(",")) {
    errors.push(`final invariants are [${invariants.join(", ")}], fixture says [${fixture.final.invariants.join(", ")}]`);
  }
  const hash = stateHash(state);
  if (hash !== fixture.final.stateHash) errors.push(`final state hash ${hash} differs from the fixture's ${fixture.final.stateHash}`);
  return errors;
}
