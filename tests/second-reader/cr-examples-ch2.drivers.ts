/**
 * Second reader, batch 1 (CR examples, chapter 2): one driver per case in
 * `cr-examples-ch2.json`. A driver builds the position, plays the listed
 * steps and reports. It does not say what should happen.
 *
 * Not a test file: vitest only runs `*.test.ts`.
 */
import { toCorpTurn } from "../rulings/rulings-helpers.js";
import { Board, take } from "./harness.js";
import { atAction, through, toAction } from "./driving.js";
import type { Driver } from "./driving.js";

export const drivers: Record<string, Driver> = {
  "2.16.5.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const lycan = b.ice("lycan", "hq");
    b.card(lycan).advancementCounters = 1;
    const [tinkering] = b.grip("tinkering");
    r.snap("before", b.s);
    let s = take(b.s, "play_event", tinkering);
    s = toAction(through(s, atAction, [lycan]));
    r.snap("tinker", s);
    s = toCorpTurn(s);
    r.snap("turn-end", s);
  },
};
