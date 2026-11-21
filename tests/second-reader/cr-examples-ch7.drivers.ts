/**
 * Second reader, batch 1 (CR examples, chapter 7): one driver per case in
 * `cr-examples-ch7.json`. A driver builds the position, plays the listed
 * steps and reports. It does not say what should happen.
 *
 * Not a test file: vitest only runs `*.test.ts`.
 */
import type { GameState } from "../../src/index.js";
import type { ServerId } from "../../src/state/types.js";
import { must } from "../rulings-helpers.js";
import { Board, hasOption, offered, take } from "./harness.js";
import { Report } from "./harness.js";
import {
  accessedSince,
  accessing,
  atAction,
  atEncounter,
  debug,
  drive,
  raw,
  run,
  runnerSees,
  settleTrace,
  through,
  toAction,
} from "./driving.js";
import type { Driver } from "./driving.js";

const playRun = (s: GameState, cardId: string, server: string): GameState =>
  must(s, { type: "play_event", cardId, serverId: server as ServerId });

const accessOffered = (s: GameState): boolean =>
  offered(s, "access_card").length > 0;

const POETRI_HAND = ["scatter-field", "palisade", "offworld-office"];

/**
 * Legwork into HQ with Poétrï. `seed` sets the engine's random stream, which
 * picks the cards a breach of HQ may access.
 */
function poetriOnce(r: Report, extra: string[], install: string, seed: number) {
  const b = new Board(r, "runner", 5);
  b.s.rngState = seed;
  b.identity("corp", "poetri-luxury-brands-all-the-rage");
  const [legwork] = b.grip("legwork");
  const names = [...POETRI_HAND, ...extra];
  const hand = b.hq(...names);
  const order = hand.slice(0, 3);
  const target = hand[names.indexOf(install)]!;
  const done = accessing(playRun(b.s, legwork!, "hq"), {
    choose: (_x, ids) => order.find((id) => ids.includes(id)),
    answers: [`hq-install:${target}`],
  });
  return { s: done.s, accessed: done.accessed, target };
}

/**
 * The position says the random accesses are Scatter Field, Palisade and
 * Offworld Office in that order: take the first seed that gives them.
 */
function poetri(r: Report, extra: string[], install: string) {
  const wanted = ["Scatter Field", "Palisade", "Offworld Office"];
  let seed = 1;
  for (; seed < 200; seed++) {
    const probe = poetriOnce(new Report(), extra, install, seed);
    if (JSON.stringify(probe.accessed) === JSON.stringify(wanted)) break;
  }
  if (seed === 200) {
    throw new Error("no seed gives the accesses the position states");
  }
  const out = poetriOnce(r, extra, install, seed);
  r.fact("accessed", out.accessed);
  // The engine says in its log when the Runner knows the installed card.
  const title = out.s.cards[out.target]!.title;
  const knows =
    runnerSees(out.s, out.target) ||
    out.s.log.some((l) => l.includes(`The Runner knows this is ${title}`));
  return { s: out.s, knows };
}

/** Immolation Script into Archives, with or without Hudson 1.0 in the way. */
function immolation(r: Report, hudson: boolean, alsoHedge: boolean) {
  const b = new Board(r, "runner", 5);
  const [script] = b.grip("immolation-script");
  if (hudson) b.ice("hudson-1-0", "archives");
  const inArchives = b.archives("wall-of-static");
  const hedge = alsoHedge ? b.archives("hedge-fund") : undefined;
  b.ice("wall-of-static", "hq");
  let s = playRun(b.s, script!, "archives");
  s = drive(s, (x) => atEncounter(x) || accessOffered(x) || !x.run);
  if (atEncounter(s)) s = must(s, { type: "pass_window" });
  s = drive(s, (x) => accessOffered(x) || !x.run);
  return { b, s, inArchives, hedge };
}

const iceOn = (s: GameState, server: string): number =>
  s.servers[server as ServerId]!.ice.length;

/** Flagship in the root of HQ, Docklands Pass and Cupellation installed. */
function flagship(r: Report, otoroshi: boolean) {
  const b = new Board(r, "runner", 5);
  b.rig("docklands-pass");
  const cup = b.rig("cupellation");
  const flag = b.root("flagship", "hq", true);
  const hand = b.hq("hedge-fund", "ice-wall", "enigma");
  return { b, cup, flag, hand, otoroshi };
}

export const drivers: Record<string, Driver> = {
  "7.3.1a.ex1#a": (r) => {
    const { s, knows } = poetri(r, [], "palisade");
    r.fact("runnerKnows(Palisade)", knows);
    r.snap("steal", s);
  },

  "7.3.1a.ex1#b": (r) => {
    const { s, knows } = poetri(r, ["pad-campaign"], "pad-campaign");
    r.fact("runnerKnows(PAD Campaign)", knows);
    r.snap("steal", s);
  },

  "7.3.6.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.identity("runner", "zahya-sadeghi-versatile-smuggler");
    const shard = b.rig("hades-shard");
    b.rig("archives-interface");
    const hedge = b.archives("hedge-fund");
    b.archives("pad-campaign");
    b.archives("enigma");
    b.hq("ice-wall");
    const accessed: string[] = [];
    let s = raw(b.s, { type: "basic_run", serverId: "hq" as ServerId });
    debug(
      "initiation:",
      s.timingKey,
      JSON.stringify(offered(s, "use_paid_ability", shard)),
    );
    // If the engine does not offer Hades Shard here, the run goes on without it.
    const hades = offered(s, "use_paid_ability", shard)[0];
    if (hades) s = must(s, hades);
    // Archives Interface on Hedge Fund only.
    const inArchives = (x: GameState) =>
      x.run?.attackedServerId === "archives" ||
      x.timingKey.startsWith("breach") ||
      x.timingKey.startsWith("access");
    let done = accessing(s, {
      into: accessed,
      choose: (_x, ids) => ids.find((id) => id === hedge),
      answers: ["accept", "remove", "rfg"],
      until: (x) =>
        !x.run || (!accessOffered(x) && !inArchives(x) && !x.pendingChoice),
    });
    s = done.s;
    r.snap("hades", s);
    done = accessing(s, { into: accessed, answers: ["accept", "yes", "gain"] });
    s = through(done.s, atAction, ["accept", "yes", "gain"]);
    r.fact("accessed", accessed, "run-over");
    r.snap("run-over", toAction(s));
  },

  "7.3.6.ex2#a": (r) => {
    const { s: start, inArchives, hedge } = immolation(r, true, true);
    const done = accessing(start, {
      choose: (_x, ids) => [inArchives, hedge!].find((id) => ids.includes(id)),
      answers: ["accept", "trash", "immolat", "yes"],
    });
    r.fact("accessed", done.accessed);
    r.fact("iceProtecting(HQ)", iceOn(done.s, "hq"));
    r.snap("breach", toAction(done.s));
  },

  "7.3.6.ex2#b": (r) => {
    const { s: start, inArchives, hedge } = immolation(r, true, true);
    const from = start.log.length;
    let s = must(start, { type: "access_card", cardId: hedge! });
    s = drive(
      s,
      (x) =>
        accessOffered(x) || !x.run || offered(x, "finish_access").length > 0,
    );
    const finish = offered(s, "finish_access")[0];
    if (finish) s = must(s, finish);
    s = drive(s, (x) => accessOffered(x) || !x.run);
    r.fact("accessed", accessedSince(s, from), "breach");
    r.fact("iceProtecting(HQ)", iceOn(s, "hq"), "breach");
    r.fact("legal(after)", offered(s, "access_card", inArchives).length > 0);
    r.snap("breach", s);
    r.snap("after", s);
  },

  "7.3.8.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.rig("raymond-flint");
    const retirements = b.hq("clone-retirement", "clone-retirement");
    const georgia = b.root("georgia-emelyov", "hq");
    const done = accessing(run(b.s, "hq"), {
      choose: (_x, ids) =>
        [...retirements, georgia].find((id) => ids.includes(id)),
    });
    r.fact("accessed", done.accessed);
    r.snap("run", toAction(done.s));
  },

  "7.4.2.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.root("ash-2x3zb9cy", "hq", true);
    b.hq("hedge-fund");
    let s = drive(
      run(b.s, "hq"),
      (x) => Boolean(x.trace) || accessOffered(x) || !x.run,
    );
    s = settleTrace(s);
    const done = accessing(s);
    r.fact("accessed", done.accessed);
    r.snap("run", toAction(done.s));
  },

  "7.4.2a.ex1": (r) => {
    const { b, flag, hand } = flagship(r, false);
    const from = b.s.log.length;
    let s = drive(run(b.s, "hq"), (x) => accessOffered(x) || !x.run);
    const first = hand.find((id) => offered(s, "access_card", id).length > 0);
    if (first) {
      s = must(s, { type: "access_card", cardId: first });
      const finish = offered(s, "finish_access")[0];
      if (finish) s = must(s, finish);
      s = drive(s, (x) => accessOffered(x) || !x.run);
    }
    r.fact(
      "candidatesInHq",
      hand.filter((id) => offered(s, "access_card", id).length > 0).length,
      "first",
    );
    r.snap("first", s);
    if (offered(s, "access_card", flag).length > 0) {
      s = must(s, { type: "access_card", cardId: flag });
      debug(
        "flagship:",
        JSON.stringify(offered(s, "access_host_non_agenda_faceup")),
      );
      const host = offered(s, "access_host_non_agenda_faceup")[0];
      if (host) s = must(s, host);
      else if (offered(s, "finish_access").length) s = take(s, "finish_access");
    }
    r.snap("flagship", s);
    const done = accessing(s);
    r.fact("accessedCount", accessedSince(done.s, from).length, "rest");
    r.snap("rest", toAction(done.s));
  },

  "7.4.2b.ex1#a": (r) => otoroshiFlagship(r, false),
  "7.4.2b.ex1#b": (r) => otoroshiFlagship(r, true),

  "7.4.3.ex1": (r) => {
    const { s: start, inArchives } = immolation(r, false, false);
    const done = accessing(start, {
      choose: (_x, ids) => ids.find((id) => id === inArchives),
      answers: ["accept", "trash", "immolat", "yes"],
    });
    r.fact("accessedCount", done.accessed.length);
    r.fact("accessed", done.accessed);
    r.snap("breach", toAction(done.s));
  },

  "7.4.3.ex2#a": (r) => gagarin(r, "decline"),
  "7.4.3.ex2#b": (r) => gagarin(r, "pay"),

  "7.4.5.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const georgia = b.root("georgia-emelyov", "archives");
    let first = true;
    const done = accessing(run(b.s, "archives"), {
      onAccess: (s, cardId) => {
        if (!first || cardId !== georgia) return undefined;
        first = false;
        return take(s, "trash_accessed", georgia);
      },
    });
    r.fact("accessed", done.accessed);
    r.snap("breach", toAction(done.s));
  },

  "7.4.7a.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const [eye] = b.grip("the-makers-eye");
    const top = b.rd(
      "celebrity-gift",
      "bacterial-programming",
      "hedge-fund",
      "ice-wall",
      "enigma",
      "pad-campaign",
      "wall-of-static",
    );
    // The Corp uses Bacterial Programming and puts every card back in order.
    const keep = top.filter((_, i) => i !== 1);
    const done = accessing(playRun(b.s, eye!, "rd"), {
      answers: [
        "accept",
        "begin",
        "keep-order",
        ...keep.map((id) => `rd-arrange:${id}`),
        "rd-arrange:",
      ],
    });
    r.fact("accessed", done.accessed);
    r.snap("breach", toAction(done.s));
  },

  "7.4.7a.ex2": (r) => {
    const b = new Board(r, "runner", 5);
    b.identity("corp", "seidr-laboratories-destiny-defined");
    b.rig("r-d-interface");
    const [eye] = b.grip("the-makers-eye");
    const box = b.root("strongbox", "rd", true);
    b.rd("hedge-fund", "offworld-office", "ice-wall", "enigma");
    const pad = b.archives("pad-campaign");
    const done = accessing(playRun(b.s, eye!, "rd"), {
      // Strongbox last.
      choose: (_x, ids) => ids.find((id) => id !== box),
      answers: ["pay", "click", "steal", "accept", "yes", pad],
    });
    r.fact("accessed", done.accessed);
    r.snap("breach", toAction(done.s));
  },
};

function otoroshiFlagship(r: Report, host: boolean): void {
  const { b, flag } = flagship(r, true);
  b.ice("otoroshi", "hq");
  const [pad] = b.remote("pad-campaign");
  const accessed: string[] = [];
  let s = drive(run(b.s, "hq"), (x) => atEncounter(x) || !x.run);
  s = must(s, { type: "pass_window" });
  let done = accessing(s, {
    into: accessed,
    answers: [`otoroshi:${pad}:1`, "access-card"],
    until: (x) => !x.run || x.timingKey === "run.jackOutWindow",
  });
  s = done.s;
  r.snap("otoroshi", s);
  done = accessing(s, {
    into: accessed,
    choose: (_x, ids) => ids.find((id) => id === flag),
    onAccess: (x, cardId) => {
      const hostIt = offered(x, "access_host_non_agenda_faceup")[0];
      return host && cardId === flag && hostIt ? must(x, hostIt) : undefined;
    },
  });
  r.fact("accessed", accessed, "breach");
  r.fact("accessedCount", accessed.length, "breach");
  r.snap("breach", toAction(done.s));
}

function gagarin(r: Report, answer: "pay" | "decline"): void {
  const b = new Board(r, "runner", 5);
  b.identity("corp", "gagarin-deep-space-expanding-the-horizon");
  const [pad, remote] = b.remote("pad-campaign");
  let asked = 0;
  const from = b.s.log.length;
  let s = run(b.s, remote);
  for (let i = 0; i < 6 && !(atAction(s) && !s.run); i++) {
    s = drive(s, (x) => accessOffered(x) || !x.run);
    if (s.pendingChoice) {
      asked += 1;
      debug(
        "gagarin:",
        JSON.stringify(s.pendingChoice.options.map((o) => o.id)),
      );
      const want =
        answer === "pay" && asked === 1
          ? ["pay", "accept", "yes"]
          : ["decline", "no"];
      const id = want.find((w) => hasOption(s, w));
      if (!id) break;
      s = through(
        s,
        (x) =>
          accessOffered(x) || !x.run || offered(x, "finish_access").length > 0,
        [id],
      );
      if (offered(s, "finish_access").length) s = take(s, "finish_access");
      continue;
    }
    if (offered(s, "access_card", pad).length) {
      asked += 1;
      const before = s.runner.credits;
      s = must(s, { type: "access_card", cardId: pad });
      debug(
        "gagarin access:",
        s.timingKey,
        before,
        s.runner.credits,
        JSON.stringify(s.pendingChoice?.options.map((o) => o.id)),
      );
      if (s.pendingChoice) {
        const want =
          answer === "pay" ? ["pay", "accept", "yes"] : ["decline", "no"];
        const id = want.find((w) => hasOption(s, w));
        if (id)
          s = through(
            s,
            (x) =>
              accessOffered(x) ||
              !x.run ||
              offered(x, "finish_access").length > 0,
            [id],
          );
      }
      if (offered(s, "finish_access").length) s = take(s, "finish_access");
    }
  }
  r.fact("accessed", accessedSince(s, from));
  if (answer === "decline") r.fact("offeredAgain(PAD Campaign)", asked > 1);
  r.snap(answer, toAction(s));
}
