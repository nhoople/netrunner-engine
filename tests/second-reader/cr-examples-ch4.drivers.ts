/**
 * Second reader, batch 1 (CR examples, chapter 4): one driver per case in
 * `cr-examples-ch4.json`. A driver builds the position, plays the listed
 * steps and reports. It does not say what should happen.
 *
 * Not a test file: vitest only runs `*.test.ts`.
 */
import type { GameState } from "../../src/index.js";
import { must, pick, toCorpTurn } from "../rulings/rulings-helpers.js";
import { Board, offered, take } from "./harness.js";
import {
  atAction,
  drive,
  revealed,
  run,
  runOver,
  settleTrace,
  through,
  toAction,
} from "./driving.js";
import type { Driver } from "./driving.js";

const installDestination = (a: unknown): { kind: string; serverId?: string } =>
  (a as { destination: { kind: string; serverId?: string } }).destination;

export const drivers: Record<string, Driver> = {
  "4.1.2a.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.remote("clone-suffrage-movement", true);
    const fast = b.archives("fast-break", false);
    let s = toCorpTurn(b.s);
    s = through(s, atAction, ["accept", fast]);
    r.fact("revealed(Fast Break)", revealed(s, "Fast Break"));
    r.snap("csm", s);
  },

  "4.6.6i.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const [tracker, server] = b.remote("warroid-tracker", true);
    const corroder = b.rig("corroder");
    const blade = b.rig("gordian-blade");
    b.rig("gang-sign");
    let s = drive(
      run(b.s, server),
      (x) => offered(x, "access_card").length > 0,
    );
    s = take(s, "access_card", tracker);
    s = take(s, "trash_accessed", tracker);
    r.snap("trash", s);
    let traced = Boolean(s.trace);
    let chooser = "nobody";
    for (let i = 0; i < 8 && !atAction(s); i++) {
      s = drive(s, (x) => Boolean(x.trace) || atAction(x));
      traced ||= Boolean(s.trace);
      s = settleTrace(s);
      if (s.pendingChoice) {
        chooser = s.pendingChoice.chooser;
        s = through(s, (x) => Boolean(x.trace) || atAction(x), [
          corroder,
          blade,
        ]);
      }
    }
    r.fact("triggered(Warroid Tracker)", traced);
    r.fact("chooser(trace)", chooser);
    r.snap("trace", s);
  },

  "4.6.6i.ex2": (r) => {
    const b = new Board(r, "runner", 5);
    const [, server] = b.remote("zato-city-grid", true);
    b.ice("ice-wall", server);
    const border = b.ice("border-control", server);
    let s = run(b.s, server);
    s = through(
      s,
      (x) => !x.run || !x.cards[border]!.zone.startsWith("server:"),
      ["sub:0", "sub-0", "0", "trash", "yes"],
    );
    r.snap("zato", s);
  },

  "4.6.6i.ex3": (r) => {
    const b = new Board(r, "runner", 5);
    const [, server] = b.remote("nanisivik-grid", true);
    b.ice("ice-wall", "archives", false);
    b.ice("enigma", "archives", false);
    const border = b.archives("border-control", false);
    let s = run(b.s, server);
    s = through(s, (x) => Boolean(x.cards[border]!.faceup) || !x.run, [
      border,
      "yes",
    ]);
    s = through(s, runOver, ["sub:0", "sub-0", "0"]);
    r.snap("nanisivik", s);
  },

  "4.6.8f.ex1#a": (r) => {
    const b = new Board(r, "corp", 5);
    b.identity("corp", "earth-station-sea-headquarters");
    const [, server] = b.remote("pad-campaign");
    const [wall] = b.hq("ice-wall");
    const installs = offered(b.s, "basic_install", wall);
    r.fact(
      "legal(new-remote)",
      installs.some((a) => installDestination(a).kind === "new_remote"),
    );
    const existing = installs.find(
      (a) => installDestination(a).serverId === server,
    );
    r.fact("legal(existing)", Boolean(existing));
    let s: GameState = b.s;
    if (existing) s = toAction(through(must(s, existing), atAction));
    r.snap("existing", s);
  },

  "4.6.8f.ex1#b": (r) => {
    const b = new Board(r, "corp", 5);
    b.identity("corp", "earth-station-sea-headquarters");
    const [wall] = b.hq("ice-wall");
    const fresh = offered(b.s, "basic_install", wall).find(
      (a) => installDestination(a).kind === "new_remote",
    );
    r.fact("legal(new-remote)", Boolean(fresh));
    let s: GameState = b.s;
    if (fresh) s = toAction(through(must(s, fresh), atAction));
    r.snap("new-remote", s);
  },

  "4.8.3.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.identity("runner", "exile-streethawk");
    const [testRun] = b.grip("test-run");
    const [corroder] = b.heap("corroder");
    b.stack("diesel", "diesel", "diesel");
    let s = take(b.s, "play_event", testRun);
    s = toAction(through(s, atAction, ["heap", corroder!]));
    r.snap("test-run", s);
    s = toCorpTurn(s);
    r.snap("turn-end", s);
  },

  "4.8.7.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.remote("daily-business-show", true);
    const [hedge] = b.rd("hedge-fund", "ice-wall");
    let s = toCorpTurn(b.s);
    s = through(s, atAction, [hedge!]);
    // Each further stop is Daily Business Show asking again: answer it, so
    // the state reported is the one the Corp's first action starts from.
    for (let i = 0; i < 10 && s.pendingChoice && !s.done; i++) {
      s = through(pick(s, "dbs-bottom"), atAction);
    }
    r.fact("rdBottom", s.cards[s.corp.deck[s.corp.deck.length - 1]!]?.title);
    r.cannotObserve(
      "runnerCanTell",
      "The comparison reads the engine's state, not what a seat is shown, so it cannot say what the Runner learns about the set-aside cards.",
    );
    r.snap("draw", s);
  },
};
