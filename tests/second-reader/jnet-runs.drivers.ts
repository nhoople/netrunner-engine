/**
 * Second reader, batch 3 (the jinteki run scenarios): one driver per case in
 * `jnet-runs.json`. A driver builds the position, plays the listed steps and
 * reports. It does not say what should happen.
 *
 * Not a test file: vitest only runs `*.test.ts`.
 */
import type { GameState } from "../../src/index.js";
import { approachedIceId } from "../../src/actions/rez.js";
import { must } from "../rulings-helpers.js";
import { Board, offered } from "./harness.js";
import type { Report } from "./harness.js";
import {
  accessedSince,
  atAction,
  atEncounter,
  breakSubs,
  debug,
  encounterOrOver,
  go,
  handOver,
  idle,
  playRun,
  psi,
  pump,
  raw,
  run,
  runnerTurnBegins,
  what,
} from "./driving.js";
import type { Driver } from "./driving.js";

const KONJIN_AGAIN =
  "the steps cannot be finished: after equal bids Konjin's Psi Game starts again";

const title = (s: GameState, id: string | undefined | null): string =>
  (id && s.cards[id]?.title) || "none";

/** The title of the ice being encountered, in or outside a run. */
const encountering = (s: GameState): string =>
  title(s, s.run?.encounter?.iceId);

/** The title of the ice being approached. */
const approaching = (s: GameState): string =>
  s.timingKey === "run.approachPaw" ? title(s, approachedIceId(s)) : "none";

/** The server the run is against, in the words the expectations use. */
function attacked(s: GameState, last = "none"): string {
  const id = (s.run?.attackedServerId as string | undefined) ?? last;
  return { hq: "HQ", rd: "R&D", archives: "Archives" }[id] ?? id;
}

const atApproach = (s: GameState): boolean =>
  s.timingKey === "run.approachPaw" || !s.run;

const passed = (s: GameState): boolean =>
  !s.run || s.timingKey === "run.jackOutWindow";

/** At the approach of an unrezzed ice the Corp rezzes it, if the engine lets it. */
function rezOnApproach(s: GameState, iceId: string): GameState {
  s = go(s, atApproach);
  if (s.run && !offered(s, "rez_ice", iceId).length) s = handOver(s);
  const rez = offered(s, "rez_ice", iceId)[0];
  debug("rez on approach:", Boolean(rez), what(s));
  return rez ? raw(s, rez) : s;
}

/** The unbroken subroutines of the ice being encountered. */
function unbroken(s: GameState, iceId: string): number | string {
  const enc = s.run?.encounter;
  if (!enc || enc.iceId !== iceId) return "no encounter with it";
  return (s.cards[iceId]?.subroutines ?? []).filter((_, i) => !enc.broken[i])
    .length;
}

/** A remote server holding PAD Campaign behind one piece of ice. */
function padBehind(b: Board, iceDef: string, rezzed: boolean) {
  const [, remote] = b.remote("pad-campaign");
  const ice = b.ice(iceDef, remote, rezzed);
  return { remote, ice };
}

/** Inside Job into a remote server behind one piece of ice, to the first stop. */
function insideJob(r: Report, iceDef: string, rezzed: boolean, corp = 5) {
  const b = new Board(r, "runner", 5);
  b.s.corp.credits = corp;
  const { remote, ice } = padBehind(b, iceDef, rezzed);
  const [job] = b.grip("inside-job");
  let s = playRun(b.s, job!, remote);
  if (!rezzed) s = rezOnApproach(s, ice);
  // Past the approach: on to the encounter, or to the window after the ice.
  if (s.timingKey === "run.approachPaw") {
    s = go(
      must(s, { type: "pass_window" }),
      (x) => passed(x) || atEncounter(x),
    );
  } else s = go(s, (x) => passed(x) || atEncounter(x));
  return { s, ice };
}

/** Account Siphon into HQ; Security Testing may be installed with HQ chosen. */
function siphon(r: Report, testing: boolean, answer: string): void {
  const b = new Board(r, testing ? "corp" : "runner", 5);
  if (testing) b.rig("security-testing");
  const [event] = b.grip("account-siphon");
  b.hq("hedge-fund");
  let s = testing ? runnerTurnBegins(b.s, ["server:hq"]) : b.s;
  s.runner.credits = 5;
  s.corp.credits = 5;
  const from = s.log.length;
  let chooser = "nobody";
  s = go(playRun(s, event!, "hq"), idle, [answer, "siphon:5"], (x) => {
    if (x.pendingChoice && chooser === "nobody") {
      debug("replace:", what(x));
      chooser = x.pendingChoice.chooser;
    }
    return undefined;
  });
  r.fact(testing ? "chooser(order)" : "chooser(breach-or-siphon)", chooser);
  r.fact("accessed", accessedSince(s, from));
  r.snap("run", s);
}

/**
 * R&D behind Ice Wall with Ganked! in its root: the Runner breaks Ice Wall,
 * accesses Ganked! first and is made to encounter Ice Wall again. Returns
 * the state at that encounter.
 */
function gankedInRd(r: Report, credits: number) {
  const b = new Board(r, "runner", credits);
  const wall = b.ice("ice-wall", "rd");
  const ganked = b.root("ganked", "rd");
  b.rd("hedge-fund");
  const corroder = b.rig("corroder");
  const from = b.s.log.length;
  let s = go(run(b.s, "rd"), encounterOrOver);
  s = breakSubs(s, corroder, 1);
  s = go(
    must(s, { type: "pass_window" }),
    (x) => !x.run || offered(x, "access_card", ganked).length > 0,
  );
  s = raw(s, { type: "access_card", cardId: ganked });
  s = go(s, (x) => atEncounter(x) || idle(x), ["trash-encounter", wall]);
  return { s, wall, corroder, from };
}

/** Three successful runs, then Quest Completed onto Ganked! in a remote. */
function questCompleted(
  r: Report,
  iceDef: string,
  credits: number,
  rig: string[],
) {
  const b = new Board(r, "runner", credits);
  const [ganked, remote] = b.remote("ganked");
  const ice = b.ice(iceDef, remote);
  const programs = rig.map((d) => b.rig(d));
  const [quest] = b.grip("quest-completed");
  b.hq("hedge-fund");
  b.rd("hedge-fund");
  let s = b.s;
  for (const server of ["archives", "rd", "hq"]) s = go(run(s, server), idle);
  // Without the event there is no position to report on.
  if (!offered(s, "play_event", quest).length) {
    throw new Error("the engine does not offer Quest Completed");
  }
  s = raw(s, { type: "play_event", cardId: quest! });
  s = go(s, (x) => atEncounter(x) || idle(x), [ganked, "trash-encounter", ice]);
  return { s, ice, programs };
}

/** Konjin on HQ sends the Runner to a deflector on R&D; returns the state there. */
function konjinInto(r: Report, iceDef: string, ganked: boolean) {
  const b = new Board(r, "runner", 5);
  const konjin = b.ice("konjin", "hq");
  const other = b.ice(iceDef, "rd");
  if (iceDef === "bullfrog") b.ice("ice-wall", "archives");
  const upgrade = ganked ? b.root("ganked", "hq") : undefined;
  // Called where the walk has stopped: an open Psi Game not yet counted is
  // one more that Konjin started.
  let games = 0;
  const counted = new Set<number>();
  const count = (x: GameState): void => {
    if (x.psi && !counted.has(x.log.length)) {
      counted.add(x.log.length);
      games += 1;
    }
  };
  let s = go(run(b.s, "hq"), (x) => Boolean(x.psi) || !x.run);
  if (ganked) {
    // First Konjin on the way in: equal bids, nothing happens.
    s = psi(s, 0, 0);
    s = go(
      s,
      (x) => !x.run || Boolean(x.psi) || offered(x, "access_card").length > 0,
    );
    if (s.psi)
      return { s, konjin, other, games: () => games, count, again: true };
    s = raw(s, { type: "access_card", cardId: upgrade! });
    s = go(s, (x) => Boolean(x.psi) || idle(x), ["trash-encounter", konjin]);
  }
  // A Psi Game open here is one Konjin started.
  count(s);
  s = psi(s, 0, 1);
  s = go(
    s,
    (x) => !x.run || (x.run.encounter?.iceId === other && atEncounter(x)),
    [other],
  );
  debug("konjin into:", what(s), encountering(s));
  return { s, konjin, other, games: () => games, count, again: false };
}

export const drivers: Record<string, Driver> = {
  "run-timing-with-ice-and-a-breaker": (r) => {
    const b = new Board(r, "runner", 5);
    const wall = b.ice("ice-wall", "rd", false);
    b.rd("hedge-fund");
    const corroder = b.rig("corroder");
    const from = b.s.log.length;
    let s = rezOnApproach(run(b.s, "rd"), wall);
    s = go(s, encounterOrOver);
    s = breakSubs(s, corroder, 1);
    s = go(s, idle);
    r.fact("accessed", accessedSince(s, from));
    r.snap("run", s);
  },

  "run-timing-with-ice-with-on-encounter-effect": (r) => {
    const b = new Board(r, "runner", 5);
    b.s.corp.credits = 10;
    const { remote, ice } = padBehind(b, "tollbooth", false);
    let s = rezOnApproach(run(b.s, remote), ice);
    s = go(s, idle, ["pay", "accept"]);
    r.snap("run", s);
  },

  "run-timing-with-paid-ability-before-ice-with-on-encounter-effect": (r) => {
    const b = new Board(r, "runner", 4);
    b.s.corp.credits = 10;
    const { remote, ice } = padBehind(b, "tollbooth", false);
    const smc = b.rig("self-modifying-code");
    const [corroder] = b.stack("corroder");
    let s = rezOnApproach(run(b.s, remote), ice);
    // Priority comes back to the Runner in the same window.
    if (!offered(s, "use_paid_ability", smc).length) s = handOver(s);
    debug("smc:", what(s));
    const use = offered(s, "use_paid_ability", smc)[0];
    if (use) s = go(raw(s, use), (x) => !x.pendingChoice, [corroder!]);
    r.snap("approach", s);
    r.snap(
      "encounter",
      go(s, (x) => idle(x) || atEncounter(x), ["pay"]),
    );
  },

  "run-timing-with-bypass": (r) => {
    const { s } = insideJob(r, "ice-wall", true);
    r.fact("legal(jack-out)", offered(s, "jack_out").length > 0, "bypass");
    r.snap("bypass", s);
    const out = offered(s, "jack_out")[0];
    r.snap("jack-out", out ? go(must(s, out), idle) : s);
  },

  "run-timing-with-bypass-vs-cannot-be-bypassed": (r) => {
    let { s } = insideJob(r, "guard", false);
    if (atEncounter(s)) s = must(s, { type: "pass_window" });
    r.snap("run", go(s, idle));
  },

  "run-timing-with-bypass-vs-ice-with-on-encounter-effect": (r) => {
    const { s } = insideJob(r, "tollbooth", false, 10);
    r.snap("bypass", s);
    const out = offered(s, "jack_out")[0];
    r.snap("jack-out", out ? go(must(s, out), idle) : s);
  },

  "run-timing-with-paid-ability-that-ends-the-run-during-encounter-border-control":
    (r) => {
      const b = new Board(r, "runner", 5);
      b.s.corp.credits = 10;
      const [, remote] = b.remote("pad-campaign");
      b.ice("tollbooth", remote);
      const control = b.ice("border-control", remote, false);
      let s = rezOnApproach(run(b.s, remote), control);
      const use = offered(s, "use_paid_ability", control)[0];
      debug("border control:", Boolean(use), what(s));
      if (use) s = raw(s, use);
      r.snap("run", go(s, idle, ["pay"]));
    },

  "run-timing-trashing-a-solo-ice-on-an-empty-server-4940": (r) => {
    const b = new Board(r, "corp", 5);
    const corroder = b.rig("corroder");
    const [knifed] = b.grip("knifed");
    const [wall] = b.hq("ice-wall");
    // The server is made by the Corp installing the ice, so that it has no root.
    const install = offered(b.s, "basic_install", wall).find((a) =>
      JSON.stringify(a).includes("new_remote"),
    )!;
    let s = go(must(b.s, install), (x) => atAction(x));
    const remote = /^server:(.+):ice$/.exec(s.cards[wall!]!.zone)![1]!;
    s = runnerTurnBegins(s);
    s.runner.credits = 5;
    s.corp.credits = 5;
    s = rezOnApproach(playRun(s, knifed!, remote), wall!);
    s = go(s, encounterOrOver);
    try {
      s = breakSubs(s, corroder, 1);
      s = go(s, (x) => idle(x) || Boolean(x.done), ["accept", "trash"]);
    } catch (error) {
      // Under the test suite's state check (src/debug/invariants.ts) the
      // step throws once the attacked server is gone: nothing can be read.
      const fromCheck =
        error instanceof TypeError &&
        (error.stack ?? "").includes("invariants");
      if (!fromCheck) throw error;
      const why =
        "the engine's state check throws when the attacked remote server ceases to exist";
      for (const observe of [
        "zone(Ice Wall)",
        "run.active",
        "run.outcome",
        "runner.credits",
      ]) {
        r.cannotObserve(observe, why);
      }
    }
    r.snap("run", s);
  },

  "run-timing-redirection-updates-current-ice-5047": (r) => {
    const b = new Board(r, "runner", 5);
    b.ice("susanoo-no-mikoto", "hq");
    b.ice("ice-wall", "archives");
    let s = go(run(b.s, "hq"), encounterOrOver);
    s = go(
      must(s, { type: "pass_window" }),
      (x) => !x.run || x.timingKey === "run.approachPaw" || passed(x),
    );
    debug("susanoo:", what(s), attacked(s));
    r.fact("attackedServer", attacked(s));
    r.fact("approaching", approaching(s));
    r.snap("moved", s);
  },

  "run-timing-changing-phases-fires-end-of-encounter-events": (r) => {
    const b = new Board(r, "runner", 5);
    b.ice("susanoo-no-mikoto", "hq");
    const wall = b.ice("ice-wall", "archives");
    const corroder = b.rig("corroder");
    let s = go(run(b.s, "hq"), encounterOrOver);
    s = pump(s, corroder, 1);
    r.snap("pumped", s);
    s = go(
      must(s, { type: "pass_window" }),
      (x) =>
        !x.run ||
        passed(x) ||
        (atEncounter(x) && x.run.encounter?.iceId === wall),
    );
    r.fact("encountering", encountering(s), "next");
    r.snap("next", s);
  },

  "replace-access-you-may-only": (r) => siphon(r, false, "siphon:5"),
  "replace-access-you-may-only#b": (r) => siphon(r, false, "breach"),

  "replace-access-must-replacement-effects-only": (r) => {
    const b = new Board(r, "corp", 5);
    b.rig("security-testing");
    b.hq("hedge-fund");
    let s = runnerTurnBegins(b.s, ["server:hq"]);
    s.runner.credits = 5;
    const from = s.log.length;
    s = go(run(s, "hq"), idle);
    r.fact("accessed", accessedSince(s, from));
    r.snap("run", s);
  },

  "replace-access-you-may-and-must-replacement-effects": (r) =>
    siphon(r, true, "Account Siphon"),

  "forced-encounters-forced-encounters-during-run": (r) => {
    const { s: at, corroder, from } = gankedInRd(r, 5);
    r.fact("encountering", encountering(at), "encounter");
    r.snap("encounter", at);
    let s = breakSubs(at, corroder, 1);
    s = go(s, idle);
    r.fact("accessed", accessedSince(s, from), "run-over");
    r.snap("run-over", s);
  },

  "forced-encounters-forced-encounters-during-run#b": (r) => {
    const { s: at, from } = gankedInRd(r, 5);
    let s = at;
    if (atEncounter(s)) s = must(s, { type: "pass_window" });
    s = go(s, idle);
    r.fact("accessed", accessedSince(s, from));
    r.snap("run-over", s);
  },

  "forced-encounters-forced-encounters-during-run#c": (r) => {
    const b = new Board(r, "runner", 5);
    const konjin = b.ice("konjin", "rd");
    const ganked = b.root("ganked", "rd");
    b.rd("hedge-fund");
    const wall = b.ice("ice-wall", "hq");
    const from = b.s.log.length;
    let s = go(run(b.s, "rd"), (x) => Boolean(x.psi) || !x.run);
    s = psi(s, 0, 0);
    s = go(
      s,
      (x) =>
        !x.run ||
        Boolean(x.psi) ||
        offered(x, "access_card", ganked).length > 0,
    );
    if (s.psi) {
      // The steps cannot be finished: the breach is never reached.
      r.fact("accessed", KONJIN_AGAIN);
      r.snap("run-over", s);
      return;
    }
    s = raw(s, { type: "access_card", cardId: ganked });
    s = go(s, (x) => Boolean(x.psi) || idle(x), ["trash-encounter", konjin]);
    s = psi(s, 0, 1);
    s = go(s, (x) => atEncounter(x) || idle(x), [wall]);
    debug("stacked:", what(s), encountering(s));
    if (atEncounter(s)) s = must(s, { type: "pass_window" });
    s = go(s, idle);
    r.fact("accessed", accessedSince(s, from));
    r.snap("run-over", s);
  },

  "forced-encounters-forced-encounters-during-run#d": (r) => {
    const b = new Board(r, "runner", 5);
    const [, remote] = b.remote("pad-campaign");
    const ganked = b.root("ganked", remote);
    const wall = b.ice("ice-wall", remote);
    const corroder = b.rig("corroder");
    const from = b.s.log.length;
    let s = go(run(b.s, remote), encounterOrOver);
    s = breakSubs(s, corroder, 1);
    s = go(
      must(s, { type: "pass_window" }),
      (x) => !x.run || offered(x, "access_card", ganked).length > 0,
    );
    s = raw(s, { type: "access_card", cardId: ganked });
    s = go(s, (x) => atEncounter(x) || idle(x), ["trash-encounter", wall]);
    if (atEncounter(s)) s = must(s, { type: "pass_window" });
    s = go(s, idle);
    r.fact("accessed", accessedSince(s, from));
    r.snap("run-over", s);
  },

  "forced-encounters-ice-breakers-and-broken-subroutines-reset-after-a-forced-encounter-ends":
    (r) => {
      const { s: at, wall, corroder, from } = gankedInRd(r, 6);
      let s = breakSubs(pump(at, corroder, 1), corroder, 1);
      r.fact("unbrokenSubs(Ice Wall)", unbroken(s, wall), "forced");
      r.snap("forced", s);
      s = go(s, idle);
      r.fact("accessed", accessedSince(s, from), "after");
      r.snap("after", s);
    },

  "forced-encounters-forced-encounters-outside-of-run": (r) => {
    const { s: at, programs } = questCompleted(r, "ice-wall", 10, [
      "corroder",
      "gordian-blade",
    ]);
    const [corroder, blade] = programs;
    let s = breakSubs(pump(at, corroder!, 1), corroder!, 1);
    s = pump(s, blade!, 1);
    r.fact("encountering", encountering(s), "forced");
    r.snap("forced", s);
    r.snap("after", go(s, idle));
  },

  "forced-encounters-forced-encounters-outside-of-run#b": (r) => {
    const { s: at } = questCompleted(r, "little-engine", 5, []);
    let s = at;
    if (atEncounter(s)) s = must(s, { type: "pass_window" });
    s = go(s, idle);
    r.fact("encountering", encountering(s));
    r.snap("forced", s);
  },

  "forced-encounters-forced-encounters-redirection": (r) => {
    const { s: at, other } = konjinInto(r, "bullfrog", false);
    let s = at;
    if (atEncounter(s)) s = raw(s, { type: "pass_window" });
    s = go(s, (x) => Boolean(x.psi) || !x.run || passed(x));
    s = psi(s, 0, 1);
    s = go(
      s,
      (x) => !x.run || x.cards[other]!.zone !== "server:rd:ice" || passed(x),
      ["archives"],
    );
    debug("bullfrog moved:", what(s), s.cards[other]!.zone);
    r.fact("attackedServer", attacked(s), "moved");
    r.snap("moved", s);
    s = go(s, (x) => !x.run || x.timingKey === "run.approachPaw", ["archives"]);
    r.fact("approaching", approaching(s), "next");
    r.snap("next", s);
  },

  "forced-encounters-forced-encounters-redirection#c": (r) => {
    const { s: at, other, games, count } = konjinInto(r, "cell-portal", false);
    let s = at;
    if (atEncounter(s)) s = raw(s, { type: "pass_window" });
    // The Runner does not jack out when Cell Portal offers it.
    s = go(
      s,
      (x) => !x.run || Boolean(x.psi) || !x.cards[other]!.rezzed || passed(x),
      ["continue"],
    );
    debug("cell portal:", what(s), s.cards[other]!.rezzed);
    r.fact("attackedServer", attacked(s), "portal");
    r.snap("portal", s);
    s = go(s, (x) => !x.run || Boolean(x.psi) || passed(x), ["decline"]);
    count(s);
    r.fact("konjinPsiGames", games(), "again");
    r.snap("again", s);
  },

  "forced-encounters-forced-encounters-redirection#d": (r) => {
    const { s: at, other, again } = konjinInto(r, "bullfrog", true);
    let s = at;
    if (again) {
      // The steps cannot be finished: the breach is never reached.
      r.fact("attackedServer", KONJIN_AGAIN);
      r.snap("moved", s);
      return;
    }
    const server = (s.run?.attackedServerId as string | undefined) ?? "none";
    if (atEncounter(s)) s = raw(s, { type: "pass_window" });
    s = go(s, (x) => Boolean(x.psi) || idle(x));
    s = psi(s, 0, 1);
    let last = server;
    s = go(s, idle, ["archives"], (x) => {
      if (x.run) last = x.run.attackedServerId as string;
      return undefined;
    });
    debug("bullfrog:", s.cards[other]!.zone, last);
    r.fact("attackedServer", attacked(s, last));
    r.snap("moved", s);
  },

  "etr-outside-of-runs-does-not-prevent-new-runs": (r) => {
    const b = new Board(r, "corp", 5);
    const wall = b.ice("ice-wall", "hq", false);
    const [unleash] = b.hq("unleash");
    b.s.runner.tags = 1;
    let s = raw(b.s, { type: "play_operation", cardId: unleash! });
    debug("unleash:", what(s));
    s = go(s, (x) => atAction(x) && !x.pendingChoice, [
      wall,
      "accept",
      "sub:0",
      "0",
    ]);
    r.snap("unleash", s);
    s = runnerTurnBegins(s);
    const can = offered(s, "basic_run").length > 0;
    r.fact("legal(run)", can, "run");
    if (can) s = raw(s, { type: "basic_run", serverId: "rd" as never });
    r.snap("run", s);
  },

  "ice-trashed-during-encounter-does-not-reapproach-passed-ice": (r) => {
    const b = new Board(r, "runner", 10);
    b.ice("vanilla", "hq");
    const wall = b.ice("ice-wall", "hq");
    b.ice("wall-of-static", "hq");
    const corroder = b.rig("corroder");
    const crew = b.rig("arruaceiras-crew");
    const ability = (s: GameState, part: string) =>
      offered(s, "use_paid_ability", crew).find((a) =>
        JSON.stringify(a).includes(part),
      );
    const outer = b.report.ids.get("Wall of Static")!;
    // Each time the walk comes to the approach of Wall of Static from
    // somewhere else, that is one approach of it.
    let approachesOfOuter = 0;
    let at = "";
    const watch = (x: GameState): undefined => {
      const now =
        x.timingKey === "run.approachPaw" ? (approachedIceId(x) ?? "") : "";
      if (now === outer && at !== outer) approachesOfOuter += 1;
      at = now;
      return undefined;
    };
    let s = raw(b.s, { type: "basic_run", serverId: "hq" as never });
    watch(s);
    s = go(s, encounterOrOver, [], watch);
    s = breakSubs(pump(s, corroder, 1), corroder, 1);
    s = go(
      must(s, { type: "pass_window" }),
      (x) => !x.run || (atEncounter(x) && x.run.encounter?.iceId === wall),
    );
    const weaken = ability(s, "weaken");
    if (weaken)
      s = go(raw(s, weaken), (x) => !x.pendingTags && !x.pendingChoice);
    const trash = ability(s, "trash-ice");
    debug("crew:", Boolean(weaken), Boolean(trash), what(s));
    if (trash) s = raw(s, trash);
    r.snap("trashed", s);
    s = go(s, (x) => !x.run || x.timingKey === "run.approachPaw", [], watch);
    r.fact("approaching", approaching(s), "next");
    r.fact("approaches(Wall of Static)", approachesOfOuter, "next");
    r.snap("next", s);
  },
};
