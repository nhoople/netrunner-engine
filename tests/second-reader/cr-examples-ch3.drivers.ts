/**
 * Second reader, batch 1 (CR examples, chapter 3): one driver per case in
 * `cr-examples-ch3.json`. A driver builds the position, plays the listed
 * steps and reports. It does not say what should happen.
 *
 * Not a test file: vitest only runs `*.test.ts`.
 */
import type { GameState } from "../../src/index.js";
import { must } from "../rulings/rulings-helpers.js";
import { Board, offered } from "./harness.js";
import type { Report } from "./harness.js";
import {
  atAction,
  corpWindow,
  drive,
  passedIce,
  run,
  runnerWindow,
  runOver,
  through,
  toAction,
} from "./driving.js";
import type { Driver } from "./driving.js";

const encounterOrOver = (s: GameState): boolean =>
  s.timingKey === "run.encounterPaw" || !s.run;

/** An encounter outside a run: stop in its paid ability window. */
const encounterOrAction = (s: GameState): boolean =>
  s.timingKey === "run.encounterPaw" || atAction(s);

/** Use a card's paid ability up to `times` times, while the engine offers it. */
function pump(s: GameState, cardId: string, times: number): GameState {
  for (let i = 0; i < times; i++) {
    const next = offered(s, "use_paid_ability", cardId)[0];
    if (!next) return s;
    s = must(s, next);
  }
  return s;
}

/** Break every subroutine of the encountered ice with one breaker. */
function breakAll(s: GameState, breakerId: string): GameState {
  for (let i = 0; i < 6; i++) {
    const next = offered(s, "break_subroutine", breakerId)[0];
    if (!next) return s;
    s = must(s, next);
  }
  return s;
}

/** The Corp scores Vanity Project and Gang Sign has the Runner access Archangel. */
function archangelByGangSign(r: Report, rig: string) {
  const b = new Board(r, "corp", 5);
  const [vanity] = b.remote("vanity-project");
  b.card(vanity).advancementCounters = 6;
  const [archangel] = b.hq("archangel");
  b.rig("gang-sign");
  const other = b.rig(rig);
  const s = must(corpWindow(b.s), { type: "score_agenda", cardId: vanity });
  return { b, s, archangel, other };
}

export const drivers: Record<string, Driver> = {
  "3.4.4a.ex1": (r) => {
    const { s: start } = archangelByGangSign(r, "devil-charm");
    let s = through(start, encounterOrAction, ["pay", "devil", "yes"]);
    r.snap("encounter", s);
    s = toAction(through(s, atAction));
    r.snap("after", s);
  },

  "3.9.5b.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const corroder = b.rig("corroder");
    b.ice("wall-of-static", "hq");
    let s = drive(run(b.s, "hq"), encounterOrOver);
    s = pump(s, corroder, 1);
    r.snap("pump", s);
    s = drive(breakAll(s, corroder), passedIce);
    r.snap("passed", s);
  },

  "3.9.5c.ex1#a": (r) => {
    const b = new Board(r, "runner", 5);
    const blade = b.rig("gordian-blade");
    b.ice("thimblerig", "hq");
    b.ice("enigma", "hq");
    let s = drive(run(b.s, "hq"), encounterOrOver);
    s = pump(s, blade, 1);
    r.snap("pump", s);
    s = through(breakAll(s, blade), passedIce);
    s = drive(must(s, { type: "continue_run" }), encounterOrOver);
    r.snap("next-encounter", s);
    s = toAction(through(breakAll(s, blade), runOver, ["decline"]));
    r.snap("run-over", s);
  },

  "3.9.5c.ex1#b": (r) => {
    const b = new Board(r, "runner", 5);
    const blade = b.rig("gordian-blade");
    b.ice("enigma", "hq");
    let s = drive(run(b.s, "hq"), (x) => x.timingKey === "run.approachPaw");
    const pumpNow = offered(s, "use_paid_ability", blade)[0];
    r.fact("legal(approach-pump)", Boolean(pumpNow));
    if (pumpNow) s = must(s, pumpNow);
    r.snap("approach-pump", s);
    s = drive(s, encounterOrOver);
    r.snap("encounter", s);
    s = toAction(through(breakAll(s, blade), runOver));
    r.snap("run-over", s);
  },

  "3.9.5c.ex1#c": (r) => {
    const { s: start, other: blade } = archangelByGangSign(r, "gordian-blade");
    let s = through(start, encounterOrAction, ["pay"]);
    s = pump(s, blade, 4);
    r.snap("pump", s);
    s = toAction(through(breakAll(s, blade), atAction));
    r.snap("after", s);
  },

  "3.9.5d.ex1#a": (r) => {
    const b = new Board(r, "runner", 5);
    const corroder = b.rig("corroder");
    let s = runnerWindow(b.s);
    const pumpNow = offered(s, "use_paid_ability", corroder)[0];
    r.fact("legal(pump)", Boolean(pumpNow));
    if (pumpNow) s = must(s, pumpNow);
    r.snap("pump", s);
  },

  "3.9.5d.ex1#b": (r) => {
    const b = new Board(r, "runner", 5);
    const corroder = b.rig("corroder");
    b.ice("wall-of-static", "hq");
    let s = drive(run(b.s, "hq"), (x) => x.timingKey === "run.approachPaw");
    const pumpNow = offered(s, "use_paid_ability", corroder)[0];
    r.fact("legal(approach-pump)", Boolean(pumpNow));
    if (pumpNow) s = must(s, pumpNow);
    s = drive(s, encounterOrOver);
    r.snap("encounter", s);
  },
};
