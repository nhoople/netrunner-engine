/**
 * Second reader, batch 1 (CR examples, chapter 6): one driver per case in
 * `cr-examples-ch6.json`. A driver builds the position, plays the listed
 * steps and reports. It does not say what should happen.
 *
 * Not a test file: vitest only runs `*.test.ts`.
 */
import type { GameState } from "../../src/index.js";
import type { ServerId } from "../../src/state/types/servers.js";
import { must } from "../rulings-helpers.js";
import { accepts, Board, hasOption, offered, take } from "./harness.js";
import type { Report } from "./harness.js";
import {
  accessing,
  approaches,
  atAction,
  atEncounter,
  debug,
  drive,
  encounters,
  passedIce,
  psi,
  raw,
  resetTrail,
  run,
  runOver,
  settleTrace,
  through,
  toAction,
} from "./driving.js";
import type { Driver } from "./driving.js";

const encounterOrOver = (s: GameState): boolean => atEncounter(s) || !s.run;

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

/** The server the run is against, in the words the expectations use. */
function attacked(s: GameState): string {
  const id = s.run?.attackedServerId;
  if (!id) return "none";
  return (
    { hq: "HQ", rd: "R&D", archives: "Archives" }[id as string] ?? "remote"
  );
}

const playRun = (s: GameState, cardId: string, server: string): GameState =>
  must(s, { type: "play_event", cardId, serverId: server as ServerId });

/**
 * Bullfrog's subroutine with the Corp spending 0 and the Runner 1, then the
 * Corp's choice of the server it moves to.
 */
function bullfrogTo(s: GameState, server: string): GameState {
  s = drive(s, (x) => Boolean(x.psi) || !x.run);
  s = psi(s, 0, 1);
  return through(s, passedIce, [server]);
}

/** Because I Can on remote A, whose Bullfrog the Corp moves to `to`. */
function becauseICan(
  r: Report,
  build: (b: Board) => string,
): { s: GameState; offeredShuffle: boolean; accessed: string[] } {
  const b = new Board(r, "runner", 5);
  const [bic] = b.grip("because-i-can");
  const [, a] = b.remote("pad-campaign");
  b.ice("bullfrog", a);
  const to = build(b);
  let s = bullfrogTo(playRun(b.s, bic!, a), to);
  r.snap("moved", s);
  s = must(s, { type: "continue_run" });
  s = drive(
    s,
    (x) => !x.run || offered(x, "access_card").length > 0 || atAction(x),
  );
  const offeredShuffle =
    Boolean(s.pendingChoice) &&
    (s.pendingChoice as { sourceId?: string }).sourceId === bic;
  debug("because i can:", JSON.stringify(s.pendingChoice?.options ?? []));
  if (offeredShuffle) {
    s = through(s, (x) => !x.run || offered(x, "access_card").length > 0, [
      "shuffle",
      "accept",
      "yes",
    ]);
  }
  const done = accessing(s);
  return { s: toAction(done.s), offeredShuffle, accessed: done.accessed };
}

/** Account Siphon into HQ with Ash rezzed, up to the end of Ash's trace. */
function siphonIntoAsh(r: Report) {
  const b = new Board(r, "runner", 5);
  const [siphon] = b.grip("account-siphon");
  const ash = b.root("ash-2x3zb9cy", "hq", true);
  b.hq("hedge-fund");
  let s = playRun(b.s, siphon!, "hq");
  // Stop at the first thing the engine asks: the trace, or the Runner's
  // choice between the breach and Account Siphon's effect.
  s = drive(
    s,
    (x) => Boolean(x.trace) || !x.run || offered(x, "access_card").length > 0,
  );
  // Asked to choose before any trace has opened.
  const askedFirst = Boolean(s.pendingChoice) && !s.trace;
  debug("first stop:", s.timingKey, Boolean(s.trace), ash);
  return { s, askedFirst };
}

/** Project Yagi-Uda scored with one counter, Wall of Static on R&D, Eli 1.0 in HQ. */
function yagiUda(r: Report, credits: number) {
  const b = new Board(r, "runner", credits);
  const yagi = b.scored("corp", "project-yagi-uda");
  b.card(yagi).agendaCounters = 1;
  const wall = b.ice("wall-of-static", "rd");
  const [eli] = b.hq("eli-1-0");
  return { b, yagi, wall, eli: eli! };
}

export const drivers: Record<string, Driver> = {
  "6.1.2d.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const sneak = b.rig("sneakdoor-beta");
    b.ice("wall-of-static", "hq");
    b.hq("nisei-mk-ii");
    resetTrail();
    const { s, accessed } = accessing(take(b.s, "use_paid_ability", sneak));
    r.fact("encountered(Wall of Static)", encounters("Wall of Static") > 0);
    r.fact("accessed", accessed);
    r.snap("sneak", toAction(s));
  },

  "6.1.3e.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const inv = b.rig("inversificator");
    const miraju = b.ice("miraju", "archives");
    b.ice("wall-of-static", "hq");
    const swapOffered = (s: GameState) =>
      Boolean(s.pendingChoice) &&
      (s.pendingChoice as { sourceId?: string }).sourceId === inv;
    let s = drive(run(b.s, "archives"), encounterOrOver);
    s = breakAll(s, inv);
    // Up to the next approach of Mirāju, or the end of the run.
    s = through(
      s,
      (x) => !x.run || x.timingKey === "run.approachPaw" || swapOffered(x),
      ["continue", "decline", "stay"],
    );
    r.fact("offered(Inversificator)", swapOffered(s), "first");
    r.snap("first", s);
    if (s.run && accepts(s, { type: "rez_ice", cardId: miraju })) {
      s = must(s, { type: "rez_ice", cardId: miraju });
    }
    s = through(
      s,
      (x) => !x.run || x.timingKey === "run.jackOutWindow" || swapOffered(x),
      ["decline", "no"],
    );
    r.fact("offered(Inversificator)", swapOffered(s), "second");
    r.snap("second", s);
    s = toAction(through(s, runOver, ["decline"]));
    r.snap("run-over", s);
  },

  "6.1.4b.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const detente = b.rig("detente");
    const loot = b.ice("loot-box", "hq");
    b.stack("diesel", "diesel", "diesel");
    // Two copies of Ganked! hosted faceup on Detente, as its first ability
    // leaves them.
    b.hostedOn("ganked", detente);
    b.hostedOn("ganked", detente);
    let s = take(b.s, "use_paid_ability", detente);
    s = through(s, (x) => atEncounter(x) || atAction(x), [
      "access",
      "yes",
      "trash",
      loot,
    ]);
    const done = accessing(s, { answers: ["trash", loot, "yes"] });
    s = through(done.s, (x) => atEncounter(x) || atAction(x), [
      "end",
      "decline",
      "no",
    ]);
    if (atEncounter(s)) {
      s = through(must(s, { type: "pass_window" }), atAction, [
        "end",
        "decline",
        "no",
        "unless-instruction",
      ]);
    }
    r.fact("encounter.active", Boolean(s.run?.encounter));
    r.snap("detente", s);
  },

  "6.1.4c.ex1": (r) => {
    const b = new Board(r, "corp", 5);
    b.s.runner.tags = 1;
    const [unleash] = b.hq("unleash");
    const lycian = b.ice("lycian-multi-munition", "hq", false);
    let s = take(b.s, "play_operation", unleash);
    s = toAction(
      through(s, atAction, [lycian, "barrier", "done", "sub:2", "2", "yes"]),
    );
    r.snap("unleash", s);
    // The Corp's turn ends when it has spent its clicks.
    s.corp.clicks = 1;
    s = must(s, { type: "basic_gain_credit" });
    s = drive(s, (x) => x.activeSide === "runner");
    r.snap("turn-end", s);
  },

  "6.2.3.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const wall = b.ice("wall-of-static", "hq");
    const enigma = b.ice("enigma", "hq");
    const tollbooth = b.ice("tollbooth", "rd");
    const eli = b.ice("eli-1-0", "rd");
    const drafter = b.ice("drafter", "rd");
    const troll = b.ice("troll", "archives");
    // Rook goes onto Enigma through the engine's own install.
    const [rook] = b.grip("rook");
    let s = take(b.s, "basic_install", rook, (a) =>
      JSON.stringify(a).includes(enigma),
    );
    s = toAction(through(s, atAction, [enigma]));
    s.runner.clicks = 4;
    s = take(s, "use_paid_ability", rook);
    // With a choice open, a host is legal when it is offered. With none, the
    // engine has picked the host itself, and only that one can be reached.
    const landed = (s.cards[rook!] as { hostId?: string }).hostId;
    const can = (iceId: string) =>
      s.pendingChoice ? hasOption(s, iceId) : landed === iceId;
    r.fact("legal(to-same-server)", can(wall));
    r.fact("legal(to-innermost-rd)", can(tollbooth));
    r.fact("legal(to-outermost-rd)", can(drafter));
    r.fact("legal(to-single)", can(troll));
    r.fact("legal(move)", can(eli));
    if (hasOption(s, eli)) s = through(s, atAction, [eli]);
    r.snap("move", toAction(s));
  },

  "6.2.3.ex2": (r) => {
    const b = new Board(r, "runner", 5);
    const slip = b.rig("slipstream");
    const corroder = b.rig("corroder");
    const [, remote] = b.remote("pad-campaign");
    b.ice("wall-of-static", remote);
    const enigma = b.ice("enigma", "hq", false);
    const tollbooth = b.ice("tollbooth", "hq");
    b.hq("hedge-fund");
    const ice = b.ice("ice-wall", "rd", false);
    let s = drive(run(b.s, remote), encounterOrOver);
    s = breakAll(pump(s, corroder, 1), corroder);
    const slipAsked = (x: GameState) =>
      Boolean(x.pendingChoice) &&
      (x.pendingChoice as { sourceId?: string }).sourceId === slip;
    s = drive(s, (x) => slipAsked(x) || passedIce(x));
    debug("slipstream:", JSON.stringify(s.pendingChoice?.options));
    // Trash Slipstream, then read which ice the engine lets the Runner choose.
    if (slipAsked(s) && !hasOption(s, enigma) && !hasOption(s, ice)) {
      s = through(s, (x) => hasOption(x, enigma) || hasOption(x, ice), [
        "accept",
        "yes",
        "trash",
      ]);
    }
    debug("slipstream:", JSON.stringify(s.pendingChoice?.options));
    r.snap("pass", s);
    r.fact("legal(choose-outer)", hasOption(s, tollbooth));
    r.fact("legal(choose-rd)", hasOption(s, ice));
    r.fact("legal(move)", hasOption(s, enigma));
    if (hasOption(s, enigma)) {
      s = through(
        s,
        (x) =>
          x.timingKey === "run.approachPaw" ||
          x.timingKey === "run.jackOutWindow" ||
          !x.run,
        [enigma, "continue", "decline"],
      );
    }
    r.fact("attackedServer", attacked(s), "move");
    r.snap("move", s);
    const done = accessing(s, { answers: ["continue", "decline"] });
    r.fact("accessed", done.accessed, "run-over");
    r.snap("run-over", toAction(done.s));
  },

  "6.2.5d.ex1": (r) => {
    const b = new Board(r, "runner", 10);
    const blade = b.rig("gordian-blade");
    const portal = b.ice("cell-portal", "hq");
    const ganked = b.root("ganked", "hq");
    let s = drive(run(b.s, "hq"), encounterOrOver);
    s = breakAll(pump(s, blade, 5), blade);
    s = drive(s, (x) => !x.run || offered(x, "access_card").length > 0);
    s = take(s, "access_card", ganked);
    resetTrail();
    s = through(s, (x) => encounterOrOver(x) || atAction(x), [
      "trash",
      "yes",
      portal,
    ]);
    // The forced encounter: the Runner breaks nothing. Only an approach
    // after this point is an approach "again".
    resetTrail();
    if (atEncounter(s)) s = must(s, { type: "pass_window" });
    s = through(
      s,
      (x) =>
        !x.run || !x.cards[portal]!.rezzed || x.timingKey === "run.approachPaw",
      ["decline", "continue", "stay"],
    );
    r.snap("breach", s);
    s = toAction(accessing(through(s, runOver, ["decline", "continue"])).s);
    r.fact("approachedAgain(Cell Portal)", approaches("Cell Portal") > 0);
    r.snap("run-over", s);
  },

  "6.2.6a.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const wall = b.ice("wall-of-static", "hq");
    const drafter = b.ice("drafter", "hq", false);
    const [tollbooth] = b.hq("tollbooth", "hedge-fund");
    resetTrail();
    let s = drive(run(b.s, "hq"), (x) => x.timingKey === "run.approachPaw");
    s = must(s, { type: "rez_ice", cardId: drafter });
    s = drive(s, encounterOrOver);
    s = must(s, { type: "pass_window" });
    s = through(s, passedIce, [
      "decline",
      tollbooth!,
      "install-dest-trash:hq",
      "protect:hq",
      "hq",
      wall,
      drafter,
      "done",
    ]);
    s = through(s, passedIce, [wall, drafter, "done"]);
    s = through(s, passedIce, [wall, drafter, "done"]);
    r.snap("drafter", s);
    const done = accessing(s);
    r.fact("approached(Tollbooth)", approaches("Tollbooth") > 0);
    r.fact("accessed", done.accessed, "run-over");
    r.snap("run-over", toAction(done.s));
  },

  "6.2.6b.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.ice("bran-1-0", "rd");
    const [wall] = b.hq("wall-of-static");
    resetTrail();
    let s = drive(run(b.s, "rd"), encounterOrOver);
    s = must(s, { type: "break_bioroid_subroutine", subIndex: 1 });
    s = must(s, { type: "break_bioroid_subroutine", subIndex: 2 });
    s = must(s, { type: "pass_window" });
    s = through(s, passedIce, [wall!, "accept", "yes"]);
    r.snap("bran", s);
    s = drive(s, (x) => x.timingKey === "run.approachPaw" || !x.run);
    if (s.run && accepts(s, { type: "rez_ice", cardId: wall! })) {
      s = must(s, { type: "rez_ice", cardId: wall! });
    }
    s = toAction(through(s, runOver));
    r.fact("approached(Wall of Static)", approaches("Wall of Static") > 0);
    r.snap("inner", s);
  },

  "6.2.7d.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const corroder = b.rig("corroder");
    const [, remote] = b.remote("pad-campaign");
    b.ice("bullfrog", remote);
    b.ice("wall-of-static", "archives");
    b.archives("hedge-fund");
    let s = bullfrogTo(run(b.s, remote), "archives");
    r.fact("attackedServer", attacked(s), "bullfrog");
    r.snap("bullfrog", s);
    s = drive(must(s, { type: "continue_run" }), encounterOrOver);
    s = breakAll(pump(s, corroder, 1), corroder);
    const done = accessing(s);
    r.fact("accessed", done.accessed, "run-over");
    r.snap("run-over", toAction(done.s));
  },

  "6.2.7e.ex1": (r) => {
    const { b, yagi, wall, eli } = yagiUda(r, 5);
    let s = raw(b.s, { type: "basic_run", serverId: "rd" as ServerId });
    // The Runner passes priority in the initiation window; the Corp acts.
    if (!offered(s, "use_paid_ability", yagi).length) {
      s = raw(s, { type: "pass_window" });
    }
    debug(
      "initiation:",
      s.timingKey,
      JSON.stringify(offered(s, "use_paid_ability", yagi)),
    );
    s = take(s, "use_paid_ability", yagi);
    s = through(s, (x) => x.timingKey === "run.approachPaw" || !x.run, [
      eli,
      wall,
      "decline",
      "continue",
    ]);
    r.snap("swap", s);
    if (s.run && accepts(s, { type: "rez_ice", cardId: eli })) {
      s = must(s, { type: "rez_ice", cardId: eli });
    }
    s = toAction(through(s, runOver));
    r.snap("approach", s);
  },

  "6.2.7e.ex2": (r) => {
    const { b, yagi, wall, eli } = yagiUda(r, 5);
    const corroder = b.rig("corroder");
    b.rd("hedge-fund");
    resetTrail();
    let s = drive(run(b.s, "rd"), encounterOrOver);
    s = breakAll(pump(s, corroder, 1), corroder);
    // Leave the encounter without passing the pass-ice window for the Corp.
    s = raw(s, { type: "pass_window" });
    for (
      let i = 0;
      i < 4 && s.run && !offered(s, "use_paid_ability", yagi).length;
      i++
    ) {
      debug("after encounter:", s.timingKey);
      if (s.timingKey === "run.jackOutWindow") break;
      s = raw(s, { type: "pass_window" });
    }
    debug(
      "pass-ice window:",
      s.timingKey,
      JSON.stringify(offered(s, "use_paid_ability", yagi)),
    );
    if (offered(s, "use_paid_ability", yagi).length) {
      s = take(s, "use_paid_ability", yagi);
      s = through(s, passedIce, [eli, wall, "decline", "continue"]);
    }
    r.snap("swap", s);
    const done = accessing(s);
    r.fact("approached(Eli 1.0)", approaches("Eli 1.0") > 0);
    r.fact("accessed", done.accessed, "run-over");
    r.snap("run-over", toAction(done.s));
  },

  "6.3.2a.ex1#a": (r) => {
    const b = new Board(r, "runner", 5);
    const [, remote] = b.remote("off-the-grid", true);
    const runs = (server: string) =>
      accepts(b.s, { type: "basic_run", serverId: server as ServerId });
    r.fact("legal(run-remote)", runs(remote));
    r.fact("legal(run-hq)", runs("hq"));
    r.snap("run-hq", b.s);
  },

  "6.3.2a.ex1#b": (r) => {
    const b = new Board(r, "runner", 5);
    const [, remote] = b.remote("off-the-grid", true);
    const frog = b.ice("bullfrog", "hq");
    let s = drive(run(b.s, "hq"), (x) => Boolean(x.psi) || !x.run);
    s = psi(s, 0, 1);
    debug(
      "bullfrog:",
      JSON.stringify(s.pendingChoice?.options.map((o) => o.id)),
    );
    const allowed = hasOption(s, remote);
    if (allowed) s = through(s, passedIce, [remote]);
    r.fact(
      "legal(moved)",
      allowed || s.cards[frog]!.zone === `server:${remote}:ice`,
    );
    r.fact("attackedServer", attacked(s), "moved");
    r.snap("moved", s);
    const done = accessing(s);
    r.fact("accessed", done.accessed, "run-over");
    r.snap("run-over", toAction(done.s));
  },

  "6.3.4.ex1#a": (r) => {
    const b = new Board(r, "runner", 5);
    const [elp] = b.hq("enhanced-login-protocol");
    // The current is in play, as the Corp left it on its turn.
    b.s.corp.hand = b.s.corp.hand.filter((id) => id !== elp);
    b.card(elp!).zone = "corp:play-area";
    b.card(elp!).faceup = true;
    b.s.corp.playArea.push(elp!);
    const [, remote] = b.remote("heinlein-grid", true);
    let s = raw(b.s, { type: "basic_run", serverId: remote as ServerId });
    r.snap("run", s);
    s = toAction(accessing(s).s);
    r.snap("run-over", s);
  },

  "6.3.4.ex1#b": (r) => {
    const b = new Board(r, "runner", 5);
    const [, remote] = b.remote("heinlein-grid", true);
    b.ice("eli-1-0", remote);
    let s = drive(run(b.s, remote), encounterOrOver);
    s = must(s, { type: "break_bioroid_subroutine", subIndex: 0 });
    r.snap("break", s);
  },

  "6.5.8c.ex1": (r) => {
    const b = new Board(r, "runner", 14);
    const troll = b.ice("troll", "hq");
    const [femme, forked] = b.grip("femme-fatale", "forked");
    // Install Femme Fatale through the engine so that Troll is its chosen ice.
    let s = take(b.s, "basic_install", femme);
    s = toAction(through(s, atAction, [`chosen-ice:${troll}`]));
    s.runner.credits = 5;
    s.runner.clicks = 4;
    s = playRun(s, forked!, "hq");
    s = drive(s, (x) => encounterOrOver(x) || Boolean(x.trace));
    debug(
      "troll:",
      s.timingKey,
      JSON.stringify(s.pendingChoice?.options),
      Boolean(s.trace),
    );
    const choice = hasOption(s, "bypass") || hasOption(s, "pay");
    const paid = offered(s, "use_paid_ability", femme)[0];
    r.fact("legal(bypass)", choice || Boolean(paid));
    if (choice)
      s = must(s, {
        type: "choose_option",
        optionId: s.pendingChoice!.options.find(
          (o) => o.id.includes("bypass") || o.id.includes("pay"),
        )!.id,
      });
    else if (paid) s = must(s, paid);
    s = settleTrace(s);
    s = through(s, passedIce, ["lose", "click"]);
    r.snap("bypass", s);
    s = toAction(accessing(s).s);
    r.snap("run-over", s);
  },

  "6.5.9a.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.grip("diesel", "diesel", "diesel");
    b.ice("shiro", "hq");
    b.hq("hedge-fund");
    const top = b.rd("chrysalis", "ice-wall", "enigma");
    const accessed: string[] = [];
    let s = drive(run(b.s, "hq"), encounterOrOver);
    s = must(s, { type: "pass_window" });
    // First subroutine: leave the order. Second: the Corp does not pay.
    let done = accessing(s, {
      until: (x) => passedIce(x),
      answers: [...top.map((id) => `rd-arrange:${id}`), "breach"],
      into: accessed,
      onAccess: (x) => {
        // Chrysalis: the forced encounter, with nothing broken.
        let y = drive(
          x,
          (z) =>
            atEncounter(z) ||
            passedIce(z) ||
            offered(z, "finish_access").length > 0,
        );
        if (atEncounter(y)) y = must(y, { type: "pass_window" });
        y = drive(
          y,
          (z) => passedIce(z) || offered(z, "finish_access").length > 0,
        );
        const finish = offered(y, "finish_access")[0];
        return finish ? must(y, finish) : y;
      },
    });
    s = done.s;
    r.snap("shiro", s);
    done = accessing(s, { into: accessed });
    r.fact("accessed", accessed, "run-over");
    r.snap("run-over", toAction(done.s));
  },

  "6.5.9b.ex1": (r) => {
    const b = new Board(r, "runner", 2);
    const corroder = b.rig("corroder");
    b.root("the-twins", "hq", true);
    b.ice("wall-of-static", "hq");
    const [copy] = b.hq("wall-of-static");
    let s = drive(run(b.s, "hq"), encounterOrOver);
    s = breakAll(pump(s, corroder, 1), corroder);
    s = through(s, (x) => !x.run || x.timingKey === "run.jackOutWindow", [
      copy!,
      "accept",
      "yes",
    ]);
    if (atEncounter(s)) {
      s = through(
        must(s, { type: "pass_window" }),
        (x) => !x.run || x.timingKey === "run.jackOutWindow",
      );
    }
    r.snap("twins", s);
  },

  "6.7.4a.ex1#a": (r) => {
    const out = becauseICan(r, (b) => {
      b.archives("hedge-fund");
      return "archives";
    });
    r.fact("offered(Because I Can)", out.offeredShuffle, "run-over");
    r.fact("accessed", out.accessed, "run-over");
    r.snap("run-over", out.s);
  },

  "6.7.4a.ex1#b": (r) => {
    const out = becauseICan(r, (b) => b.remote("tech-startup")[1]);
    r.fact("offered(Because I Can)", out.offeredShuffle, "run-over");
    r.fact("accessed", out.accessed, "run-over");
    r.snap("run-over", out.s);
  },

  "6.7.4c.ex1#a": (r) => {
    const { s: first, askedFirst } = siphonIntoAsh(r);
    let s = settleTrace(first);
    r.fact("decided(Account Siphon)", askedFirst, "trace");
    r.snap("trace", s);
    s = drive(s, (x) => !x.run || offered(x, "access_card").length > 0);
    r.fact("legal(siphon)", hasOption(s, "siphon:5"));
    let done = accessing(s, { answers: ["siphon:5"] });
    // A trace that comes only now is still resolved with no spending.
    done = accessing(settleTrace(done.s), { into: done.accessed });
    r.fact("accessed", done.accessed, "siphon");
    r.snap("siphon", toAction(done.s));
  },

  "6.7.4c.ex1#b": (r) => {
    const { s: first } = siphonIntoAsh(r);
    let s = settleTrace(first);
    r.snap("trace", s);
    s = drive(s, (x) => !x.run || offered(x, "access_card").length > 0);
    r.fact(
      "legal(breach)",
      hasOption(s, "decline") ||
        hasOption(s, "breach") ||
        offered(s, "access_card").length > 0,
    );
    let done = accessing(s, { answers: ["breach"] });
    done = accessing(settleTrace(done.s), { into: done.accessed });
    r.fact("accessed", done.accessed, "breach");
    r.snap("breach", toAction(done.s));
  },

  "6.8.2a.ex1": (r) => {
    const b = new Board(r, "runner", 0);
    (b.s.corp as { badPublicity?: number }).badPublicity = 2;
    const nisei = b.scored("corp", "nisei-mk-ii");
    b.card(nisei).agendaCounters = 1;
    const smc = b.rig("self-modifying-code");
    b.stack("corroder");
    let s = raw(b.s, { type: "basic_run", serverId: "hq" as ServerId });
    r.snap("window", s);
    debug(
      "window:",
      s.timingKey,
      JSON.stringify(offered(s, "use_paid_ability", smc)),
    );
    if (!offered(s, "use_paid_ability", nisei).length) {
      s = raw(s, { type: "pass_window" });
    }
    const end = offered(s, "use_paid_ability", nisei)[0];
    if (end) s = raw(s, end);
    debug("after nisei:", s.timingKey, Boolean(s.run));
    r.fact("legal(smc)", offered(s, "use_paid_ability", smc).length > 0);
    s = toAction(through(s, atAction));
    r.snap("nisei", s);
    r.snap("smc", s);
  },

  "6.8.2b.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.rig("security-nexus");
    b.ice("tollbooth", "hq");
    let s = drive(
      run(b.s, "hq"),
      (x) => encounterOrOver(x) || Boolean(x.trace),
    );
    debug("tollbooth:", s.timingKey, JSON.stringify(s.pendingChoice?.options));
    // Use Security Nexus first, whichever way the engine offers it.
    s = through(s, (x) => Boolean(x.trace) || !x.run, ["nexus-trace"]);
    s = settleTrace(s);
    s = toAction(through(s, runOver, ["pay"]));
    r.snap("nexus", s);
  },

  "6.8.2c.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.grip("diesel", "diesel", "diesel");
    const [grid, remote] = b.remote("nanisivik-grid", true);
    const wall = b.archives("wall-of-static", false);
    const ant = b.ice("formicary", "hq", false);
    let s = run(b.s, remote);
    s = drive(s, (x) => !x.run || atAction(x));
    debug("approach:", s.timingKey, JSON.stringify(s.pendingChoice?.options));
    // Nanisivik Grid first.
    s = through(s, (x) => Boolean(x.cards[wall]!.faceup) || atAction(x), [
      grid,
      "nanisivik",
      wall,
    ]);
    debug(
      "after nanisivik:",
      s.timingKey,
      Boolean(s.run),
      JSON.stringify(s.pendingChoice?.options),
    );
    const antAsked =
      Boolean(s.pendingChoice) &&
      ((s.pendingChoice as { sourceId?: string }).sourceId === ant ||
        hasOption(s, ant) ||
        hasOption(s, "formicary"));
    r.fact("offered(Formicary)", antAsked);
    s = toAction(
      through(s, atAction, [ant, "formicary", "accept", "yes", "rez"]),
    );
    r.snap("approach", s);
  },

  "6.8.4a.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const crisium = b.root("crisium-grid", "hq", true);
    b.hq("hedge-fund");
    const done = accessing(run(b.s, "hq"), {
      choose: (_s, ids) => ids.find((id) => id !== crisium),
    });
    r.fact("accessed", done.accessed);
    r.snap("run", toAction(done.s));
  },

  "6.8.5.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const [path] = b.grip("the-noble-path", "diesel", "diesel");
    b.ice("wall-of-static", "hq");
    b.ice("chum", "hq");
    b.root("georgia-emelyov", "hq", true);
    let s = playRun(b.s, path!, "hq");
    s = through(s, (x) => !x.run || Boolean(x.done), ["continue"]);
    for (let i = 0; i < 6 && !s.done && !atAction(s); i++) {
      s = through(s, (x) => atAction(x) || Boolean(x.done), ["continue"]);
      if (offered(s, "accept_damage").length) s = take(s, "accept_damage");
    }
    r.fact("winner", s.winner ?? "none");
    r.snap("run", s);
  },

  "6.8.5.ex2": (r) => {
    const b = new Board(r, "runner", 5);
    const [path] = b.grip("the-noble-path");
    b.ice("funhouse", "archives");
    b.remote("dedicated-response-team", true);
    let s = playRun(b.s, path!, "archives");
    s = through(s, (x) => atEncounter(x) || !x.run, ["tag", "take"]);
    if (atEncounter(s)) s = must(s, { type: "pass_window" });
    s = through(s, (x) => atAction(x) || Boolean(x.done), [
      "pay",
      "unless-pay",
    ]);
    for (let i = 0; i < 6 && !s.done && !atAction(s); i++) {
      if (offered(s, "accept_damage").length) s = take(s, "accept_damage");
      if (offered(s, "accept_tags").length) s = take(s, "accept_tags");
      s = through(s, (x) => atAction(x) || Boolean(x.done), ["pay"]);
    }
    r.fact("winner", s.winner ?? "none");
    r.snap("run", s);
  },
};
