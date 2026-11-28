/**
 * Second reader, batch 1 (CR examples, chapter 5): one driver per case in
 * `cr-examples-ch5.json`. A driver builds the position, plays the listed
 * steps and reports. It does not say what should happen.
 *
 * Not a test file: vitest only runs `*.test.ts`.
 */
import type { GameState } from "../../src/index.js";
import type { ServerId } from "../../src/state/types/servers.js";
import { must, pick } from "../rulings/rulings-helpers.js";
import { accepts, Board, offered, take } from "./harness.js";
import {
  atAction,
  atEncounter,
  drive,
  raw,
  run,
  runOver,
  through,
  toAction,
} from "./driving.js";
import type { Driver } from "./driving.js";

/** Whether the engine has stopped on a choice that MirrorMorph gives. */
function mirrorMorphOffered(s: GameState): boolean {
  return (
    Boolean(s.pendingChoice) &&
    (s.pendingChoice as { sourceId?: string }).sourceId === s.corp.identityId
  );
}

export const drivers: Record<string, Driver> = {
  "5.2.1a.ex1#a": (r) => {
    const b = new Board(r, "runner", 5);
    const contacts = b.rig("professional-contacts");
    b.stack("diesel", "diesel", "diesel");
    let s = toAction(take(b.s, "use_paid_ability", contacts));
    r.snap("use", s);
    s = raw(s, { type: "basic_run", serverId: "hq" as ServerId });
    r.fact(
      "legal(in-run)",
      offered(s, "use_paid_ability", contacts).length > 0,
    );
    r.snap("in-run", s);
  },

  "5.2.1a.ex1#b": (r) => {
    const b = new Board(r, "runner", 5);
    b.ice("eli-1-0", "hq");
    let s = drive(run(b.s, "hq"), (x) => atEncounter(x) || !x.run);
    const lose = { type: "break_bioroid_subroutine", subIndex: 0 } as const;
    r.fact("legal(break)", accepts(s, lose));
    s = must(s, lose);
    s = must(s, { type: "break_bioroid_subroutine", subIndex: 1 });
    r.snap("break", s);
    s = toAction(through(s, runOver));
    r.snap("run-over", s);
  },

  "5.2.2b.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const [stimhack] = b.grip("stimhack", "diesel", "diesel");
    let s = raw(b.s, {
      type: "play_event",
      cardId: stimhack!,
      serverId: "archives" as ServerId,
    });
    r.snap("in-run", s);
    r.fact("legal(mid-action)", accepts(s, { type: "basic_gain_credit" }));
    s = toAction(through(s, atAction));
    r.fact("runner.coreDamage", s.runner.coreDamage ?? 0, "done");
    r.snap("done", s);
  },

  "5.2.5b.ex1#a": (r) => {
    const b = new Board(r, "corp", 5);
    b.identity("corp", "mirrormorph-endless-iteration");
    const [hedge, growth] = b.hq("hedge-fund", "lateral-growth");
    let s = toAction(through(take(b.s, "play_operation", hedge), atAction));
    s = toAction(
      through(take(s, "play_operation", growth), atAction, ["decline", "no"]),
    );
    s = must(s, { type: "basic_gain_credit" });
    r.fact("offered(MirrorMorph)", mirrorMorphOffered(s));
    r.snap("third", s);
  },

  "5.2.5b.ex1#b": (r) => {
    const b = new Board(r, "corp", 5);
    b.identity("corp", "mirrormorph-endless-iteration");
    const [hedge] = b.hq("hedge-fund");
    let s = toAction(through(take(b.s, "play_operation", hedge), atAction));
    s = toAction(must(s, { type: "basic_gain_credit" }));
    s = must(s, { type: "basic_draw" });
    r.fact("offered(MirrorMorph)", mirrorMorphOffered(s));
    if (s.pendingChoice) {
      s = pick(s, "gain-1");
    }
    r.snap("third", s);
  },
};
