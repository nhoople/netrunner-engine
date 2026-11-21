/**
 * Second reader (CR audit tool 1.16): how a driver plays a position on.
 *
 * Shared by every batch's drivers file. These helpers take the obvious step
 * and answer the choices a driver names; they never say what should happen.
 *
 * Not a test file: vitest only runs `*.test.ts`.
 */
import {
  applyAction,
  cloneState,
  getPublicView,
  legalActions,
} from "../../src/index.js";
import type { Action, GameState } from "../../src/index.js";
import type { ServerId } from "../../src/state/types.js";
import { approachedIceId } from "../../src/actions/rez.js";
import { must, optionIds, pick } from "../rulings-helpers.js";
import type { Report } from "./harness.js";

export type Driver = (r: Report) => void;

const WALK: Action["type"][] = [
  "continue_run",
  "access_card",
  "finish_access",
  "finish_breach",
  "accept_installed_trash",
  "pass_window",
  "discard_to_hand_size",
];

/**
 * Take the obvious step (continue, access, finish, pass) until `stop` holds
 * or a choice opens. With nothing obvious left it throws, so a driver cannot
 * report a state it did not mean to stop in.
 */
export function drive(
  s: GameState,
  stop: (s: GameState) => boolean,
): GameState {
  for (let i = 0; i < 200; i++) {
    if (stop(s) || s.pendingChoice || s.done) return s;
    const legal = legalActions(s);
    const next = WALK.map((t) => legal.find((a) => a.type === t)).find(Boolean);
    if (!next) {
      throw new Error(
        `stuck at ${s.timingKey}: ${legal.map((a) => a.type).join(", ")}`,
      );
    }
    note(s);
    if (process.env.SR_DEBUG === "2") debug(`${s.timingKey}: ${next.type}`);
    s = must(s, next);
  }
  throw new Error(`no stop at ${s.timingKey}`);
}

export const run = (s: GameState, server: string): GameState =>
  must(s, { type: "basic_run", serverId: server as ServerId });

export const runOver = (s: GameState): boolean => !s.run;
/** The window after an encounter, where the Runner may jack out (CR 6.9.4c). */
export const passedIce = (s: GameState): boolean =>
  !s.run || s.timingKey === "run.jackOutWindow";
export const atAction = (s: GameState): boolean =>
  s.timingKey === "runner.takeAction" || s.timingKey === "corp.takeAction";
export const toAction = (s: GameState): GameState => drive(s, atAction);

export const debug = (...parts: unknown[]): void => {
  if (process.env.SR_DEBUG) console.log("   ·", ...parts);
};

/**
 * Play on to `stop`, answering each choice on the way with the first entry
 * of `answers` (a part of an option's id) that one of its options matches.
 * Each answer is used once. A choice no answer fits stops the walk, and the
 * driver reports the state as it is.
 */
export function through(
  s: GameState,
  stop: (s: GameState) => boolean,
  answers: string[] = [],
): GameState {
  const left = [...answers];
  for (let i = 0; i < 30; i++) {
    s = drive(s, stop);
    if (!s.pendingChoice) return s;
    const ids = optionIds(s);
    const at = left.findIndex((a) => ids.some((id) => id.includes(a)));
    debug(
      `choice[${s.pendingChoice.chooser}] ${s.pendingChoice.prompt ?? ""}: ${s.pendingChoice.options
        .map((o) => `${o.id} "${o.label}"`)
        .join(" | ")} -> ${at < 0 ? "(stop)" : left[at]}`,
    );
    if (at < 0) return s;
    s = pick(s, left.splice(at, 1)[0]!);
  }
  return s;
}

/** The Runner's paid ability window in the action phase. */
export function runnerWindow(s: GameState): GameState {
  s.timingKey = "runner.actionPaw";
  return s;
}

/** The Corp's paid ability window in its action phase, where it may score and rez. */
export function corpWindow(s: GameState): GameState {
  s.timingKey = "corp.actionPaw";
  return s;
}

/** Apply an action and stay where it lands: no idle window is passed. */
export function raw(s: GameState, action: Action): GameState {
  const result = applyAction(s, action);
  if (!result.ok) throw new Error(`${action.type}: ${result.error}`);
  return result.state;
}

/** The paid ability window of an encounter, in or outside a run. */
export const atEncounter = (s: GameState): boolean =>
  s.timingKey === "run.encounterPaw";

/** Whether a card of that title was revealed to the Runner (CR 1.21.3). */
export function revealed(s: GameState, title: string): boolean {
  return (s.reveals ?? []).some((e) => e.cards.some((c) => c.title === title));
}

/** Resolve an open trace with neither player spending. */
export function settleTrace(s: GameState): GameState {
  for (let i = 0; i < 6 && s.trace; i++) {
    const legal = legalActions(s);
    const next =
      legal.find((a) => a.type === "resolve_trace") ??
      legal.find((a) => a.type === "boost_trace" && a.credits === 0);
    if (!next) break;
    s = must(s, next);
  }
  return s;
}

/**
 * Where the game has stopped while a driver played it on: one entry per
 * stop, as `<timing key>:<title of the ice approached or encountered>`.
 */
let trail: string[] = [];

function note(s: GameState): void {
  const iceId = s.run?.encounter?.iceId ?? approachedIceId(s);
  trail.push(`${s.timingKey}:${iceId ? (s.cards[iceId]?.title ?? "") : ""}`);
}

/** Forget the stops seen so far. A driver calls it before the steps it watches. */
export function resetTrail(): void {
  trail = [];
}

/** How many stops were approach windows for the ice of that title. */
export function approaches(title: string): number {
  return trail.filter((t) => t === `run.approachPaw:${title}`).length;
}

/** How many times an encounter with the ice of that title was entered. */
export function encounters(title: string): number {
  let count = 0;
  let last = "";
  for (const t of trail) {
    const now = t === `run.encounterPaw:${title}`;
    if (now && last !== t) count += 1;
    last = t;
  }
  return count;
}

/** The titles the engine's log says were accessed, from log line `from` on. */
export function accessedSince(s: GameState, from: number): string[] {
  // An access logged in both shapes, one line after the other, is one access.
  return s.log
    .slice(from)
    .filter(
      (line, i, all) =>
        !(
          / — Runner accesses /.test(line) &&
          /^Accessed /.test(all[i + 1] ?? "")
        ),
    )
    .map(
      (line) =>
        /^Accessed (.+?) (\(CR 7\.2\.1|in HQ at random)/.exec(line) ??
        / — Runner accesses (.+)\.$/.exec(line),
    )
    .filter(Boolean)
    .map((m) => m![1]!);
}

/**
 * Carry out a breach, or what is left of the game up to `until`: choose the
 * card `choose` names (the first candidate when it names none), then do what
 * `onAccess` says or else steal an agenda and leave anything else. Returns
 * the titles the engine's log says were accessed on the way, in order: a
 * chosen card whose access was replaced or refused is not one of them.
 */
export function accessing(
  s: GameState,
  opts: {
    until?: (s: GameState) => boolean;
    choose?: (s: GameState, ids: string[]) => string | undefined;
    onAccess?: (s: GameState, cardId: string) => GameState | undefined;
    answers?: string[];
    into?: string[];
  } = {},
): { s: GameState; accessed: string[] } {
  const accessed = opts.into ?? [];
  const from = s.log.length;
  const until = opts.until ?? ((x: GameState) => !x.run && atAction(x));
  const answers = [...(opts.answers ?? [])];
  const candidates = (x: GameState) =>
    legalActions(x)
      .filter((a) => a.type === "access_card")
      .map((a) => (a as { cardId: string }).cardId);
  for (let i = 0; i < 40; i++) {
    s = drive(s, (x) => until(x) || candidates(x).length > 0);
    if (s.pendingChoice) {
      const ids = optionIds(s);
      const at = answers.findIndex((a) => ids.some((id) => id.includes(a)));
      debug(
        `choice[${s.pendingChoice.chooser}] ${ids.join(" | ")} -> ${at < 0 ? "(stop)" : answers[at]}`,
      );
      if (at < 0) break;
      s = pick(s, answers.splice(at, 1)[0]!);
      continue;
    }
    const ids = candidates(s);
    if (until(s) || ids.length === 0) break;
    const cardId = opts.choose?.(s, ids) ?? ids[0]!;
    s = must(s, { type: "access_card", cardId });
    const done = opts.onAccess?.(s, cardId);
    if (done) {
      s = done;
      continue;
    }
    const legal = legalActions(s);
    const steal = legal.find((a) => a.type === "steal_agenda");
    const finish = legal.find((a) => a.type === "finish_access");
    if (steal) s = must(s, steal);
    else if (finish) s = must(s, finish);
  }
  accessed.push(...accessedSince(s, from));
  return { s, accessed };
}

/** Both players bid in an open Psi Game, each bid made if the engine accepts it. */
export function psi(s: GameState, corp: number, runner: number): GameState {
  for (let i = 0; i < 2 && s.psi; i++) {
    const next: Action =
      s.psi.runnerBid == null
        ? { type: "psi_runner_bid", amount: runner }
        : { type: "psi_corp_bid", amount: corp };
    if (!applyAction(cloneState(s), next).ok) break;
    s = must(s, next);
  }
  return s;
}

/**
 * Whether the Runner's own view of the game names the card: the view shows
 * a title for it wherever it is. Read from `getPublicView`, the view a host
 * hands a seat.
 */
export function runnerSees(s: GameState, cardId: string): boolean {
  let named = false;
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    const o = node as Record<string, unknown>;
    if (o.id === cardId && typeof o.title === "string") named = true;
    Object.values(o).forEach(walk);
  };
  walk(getPublicView(s, "runner"));
  return named;
}
