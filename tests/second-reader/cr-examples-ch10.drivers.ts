/**
 * Second reader, batch 1 (CR examples, chapter 10): one driver per case in
 * `cr-examples-ch10.json`. A driver builds the position, plays the listed
 * steps and reports. It does not say what should happen.
 *
 * Not a test file: vitest only runs `*.test.ts`.
 */
import { getPublicView, legalActions } from "../../src/index.js";
import type { GameState } from "../../src/index.js";
import type { ServerId } from "../../src/state/types.js";
import { must, pick, toCorpTurn } from "../rulings-helpers.js";
import { accepts, Board, hasOption, offered, take } from "./harness.js";
import { Report } from "./harness.js";
import {
  accessedSince,
  accessing,
  atAction,
  atEncounter,
  corpWindow,
  debug,
  drive,
  passedIce,
  psi,
  run,
  settleTrace,
  through,
  toAction,
} from "./driving.js";
import type { Driver } from "./driving.js";

const encounterOrOver = (s: GameState): boolean => atEncounter(s) || !s.run;

const playRun = (s: GameState, cardId: string, server: string): GameState =>
  must(s, { type: "play_event", cardId, serverId: server as ServerId });

const options = (s: GameState): string =>
  JSON.stringify(s.pendingChoice?.options.map((o) => o.id) ?? []);

/** Use a card's paid ability up to `times` times, while the engine offers it. */
function pump(s: GameState, cardId: string, times: number): GameState {
  for (let i = 0; i < times; i++) {
    const next = offered(s, "use_paid_ability", cardId)[0];
    if (!next) return s;
    s = must(s, next);
  }
  return s;
}

function breakAll(s: GameState, breakerId: string): GameState {
  for (let i = 0; i < 6; i++) {
    const next = offered(s, "break_subroutine", breakerId)[0];
    if (!next) return s;
    s = must(s, next);
  }
  return s;
}

/** The title the Corp's view gives for Femme Fatale's chosen ice, if any. */
function corpSeesChosenIce(s: GameState, femmeId: string): string {
  let found = "";
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    const o = node as Record<string, unknown>;
    if (o.cardId === femmeId && typeof o.iceId === "string") {
      found = s.cards[o.iceId]?.title ?? o.iceId;
    }
    Object.values(o).forEach(walk);
  };
  walk(getPublicView(s, "corp"));
  return found || "not shown";
}

/** Drafter on HQ, Ganked! in its root, Georgia Emelyov in HQ. */
function gankedDrafter(r: Report, candidate: boolean): void {
  const b = new Board(r, "runner", 5);
  const drafter = b.ice("drafter", "hq");
  const ganked = b.root("ganked", "hq");
  const [georgia] = b.hq("georgia-emelyov");
  const from = b.s.log.length;
  let s = drive(run(b.s, "hq"), encounterOrOver);
  s = must(s, { type: "pass_window" });
  // On the way in the Corp declines both subroutines.
  s = through(s, (x) => !x.run || offered(x, "access_card").length > 0, [
    "decline",
    "choose-cards-done",
  ]);
  s = take(s, "access_card", ganked);
  s = through(s, (x) => atEncounter(x) || atAction(x), [
    "trash-encounter",
    drafter,
  ]);
  if (atEncounter(s)) s = must(s, { type: "pass_window" });
  s = through(
    s,
    (x) =>
      !x.run ||
      offered(x, "access_card").length > 0 ||
      Boolean(x.pendingChoice),
    ["decline", `choose-card:${georgia}`, "install-dest:hq"],
  );
  r.snap("ganked", s);
  debug("candidate:", s.timingKey, s.pendingChoice?.chooser, options(s));
  const asked =
    Boolean(s.pendingChoice) &&
    (hasOption(s, "candidate") || hasOption(s, georgia!));
  r.fact("chooser(declare)", asked ? s.pendingChoice!.chooser : "nobody");
  r.fact("legal(declare)", asked);
  const yes = ["candidate-yes", "yes", "accept", "candidate"];
  const no = ["candidate-no", "no", "decline"];
  const done = accessing(s, { answers: candidate ? yes : no });
  r.fact("accessed", accessedSince(done.s, from), "declare");
  r.snap("declare", toAction(done.s));
}

/** Gemini's trace with the given spending. */
function gemini(r: Report, corp: number, runner: number): void {
  const b = new Board(r, "runner", 5);
  b.grip("diesel", "diesel", "diesel");
  b.ice("gemini", "hq");
  let s = drive(run(b.s, "hq"), encounterOrOver);
  s = must(s, { type: "pass_window" });
  s = drive(s, (x) => Boolean(x.trace) || !x.run || passedIce(x));
  let asked = Boolean(s.trace);
  for (let i = 0; i < 4 && s.trace; i++) {
    const legal = legalActions(s);
    debug(
      "trace:",
      JSON.stringify(
        legal.map((a) => a.type + ((a as { credits?: number }).credits ?? "")),
      ).slice(0, 200),
    );
    const want = i === 0 ? corp : runner;
    const boost = legal.find(
      (a) => a.type === "boost_trace" && a.credits === want,
    );
    const resolve = legal.find((a) => a.type === "resolve_trace");
    if (i < 2 && boost) s = must(s, boost);
    else if (resolve) s = must(s, resolve);
    else {
      asked = false;
      break;
    }
  }
  r.fact("legal(trace)", asked);
  s = through(s, (x) => passedIce(x), []);
  r.snap("trace", s);
}

/** Chastushka into HQ with the given hand and R&D sizes. */
function chastushka(r: Report, hq: number, rd: number) {
  const b = new Board(r, "runner", 5);
  const [song] = b.grip("chastushka");
  for (const id of b.s.corp.deck) delete b.s.cards[id];
  b.s.corp.deck = [];
  b.rd(...Array.from({ length: rd }, () => "hedge-fund"));
  const hand = b.hq(...Array.from({ length: hq }, () => "ice-wall"));
  const from = b.s.log.length;
  const s = drive(
    playRun(b.s, song!, "hq"),
    (x) =>
      Boolean(x.pendingSabotage) ||
      !x.run ||
      offered(x, "access_card").length > 0,
  );
  debug(
    "sabotage:",
    s.timingKey,
    JSON.stringify(s.pendingSabotage),
    options(s),
  );
  return { s, hand, from };
}

const sabotage = (hqCardIds: string[]) =>
  ({ type: "resolve_sabotage", hqCardIds }) as const;

/** Adrian Seis alone in a remote; returns the state at the Psi Game. */
function adrianSeis(
  r: Report,
  credits: number,
  build: (b: Board, remote: string) => void,
) {
  const b = new Board(r, "runner", credits);
  const [, remote] = b.remote("adrian-seis", true);
  build(b, remote);
  const from = b.s.log.length;
  let s = drive(
    run(b.s, remote),
    (x) => atEncounter(x) || Boolean(x.psi) || !x.run,
  );
  if (atEncounter(s)) {
    s = must(s, { type: "pass_window" });
    s = drive(s, (x) => Boolean(x.psi) || !x.run);
  }
  debug("psi:", s.timingKey, Boolean(s.psi));
  return { s, from };
}

const bid = (amount: number) => ({ type: "psi_runner_bid", amount }) as const;

const PSI_AGAIN =
  "the run never ends: Adrian Seis's Psi Game starts again each time it resolves";

/**
 * Play Adrian Seis's Psi Game, and again if the engine opens it again, up to
 * four times. Returns what was accessed, or `PSI_AGAIN` when the game is
 * still open after that and the steps cannot be finished.
 */
function seisGame(
  s: GameState,
  from: number,
  corp: number,
  runner: number,
): { s: GameState; accessed: string[] | string } {
  for (let i = 0; i < 4 && s.psi; i++) {
    const want = accepts(s, bid(runner)) ? runner : 0;
    s = drive(psi(s, corp, want), (x) => Boolean(x.psi) || !x.run);
  }
  if (s.psi) return { s, accessed: PSI_AGAIN };
  s = toAction(accessing(s).s);
  return { s, accessed: accessedSince(s, from) };
}

export const drivers: Record<string, Driver> = {
  "10.1.5.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const kitsune = b.ice("kitsune", "archives");
    const [hedge] = b.hq("hedge-fund");
    const from = b.s.log.length;
    let s = drive(run(b.s, "archives"), encounterOrOver);
    s = must(s, { type: "pass_window" });
    let done = accessing(s, {
      answers: [hedge!, "accept", "yes"],
      until: (x) => !x.run || !x.cards[kitsune]!.zone.startsWith("server:"),
    });
    s = done.s;
    r.snap("kitsune", s);
    done = accessing(s);
    r.fact("accessed", accessedSince(done.s, from), "run-over");
    r.snap("run-over", toAction(done.s));
  },

  "10.1.5.ex2": (r) => {
    const b = new Board(r, "runner", 5);
    const enigma = b.ice("enigma", "hq");
    const [old] = b.heap("boomerang");
    const [boomerang] = b.grip("boomerang");
    // Boomerang goes in through the engine so that Enigma is its chosen ice.
    let s = take(b.s, "basic_install", boomerang);
    s = toAction(through(s, atAction, [enigma]));
    s.runner.clicks = 4;
    s = drive(run(s, "hq"), encounterOrOver);
    // Anything else the engine offers for Boomerang here is declined.
    if (s.pendingChoice && hasOption(s, "decline")) {
      debug("boomerang:", options(s));
      s = drive(pick(s, "decline"), encounterOrOver);
    }
    const use = offered(s, "use_paid_ability", boomerang)[0];
    debug("boomerang:", Boolean(use));
    if (use) s = must(s, use);
    s = through(s, (x) => passedIce(x), ["sub:0", "sub:1", "0", "1", "done"]);
    r.snap("use", s);
    s = drive(s, (x) => Boolean(x.pendingChoice) || (!x.run && atAction(x)));
    debug("shuffle:", options(s));
    r.fact("legal(shuffle-other-copy)", hasOption(s, old!));
    if (hasOption(s, old!)) s = pick(s, old!);
    else if (s.pendingChoice) s = through(s, atAction, ["accept", "yes"]);
    // If the engine has no move left here the state is reported as it is.
    try {
      s = toAction(accessing(s).s);
    } catch (error) {
      debug((error as Error).message);
    }
    r.fact(
      "boomerangsInStack",
      s.runner.deck.filter((id) => s.cards[id]?.title === "Boomerang").length,
      "run-over",
    );
    r.snap("run-over", s);
  },

  "10.1.6a.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.ice("wormhole", "hq");
    b.ice("wormhole", "rd");
    b.hq("hedge-fund");
    const from = b.s.log.length;
    let s = drive(run(b.s, "hq"), encounterOrOver);
    s = must(s, { type: "pass_window" });
    s = drive(s, (x) => Boolean(x.pendingChoice) || passedIce(x));
    debug(
      "loop:",
      s.pendingChoice?.chooser,
      options(s),
      s.pendingChoice?.loopCount,
    );
    let chooser = "nobody";
    for (let i = 0; i < 6 && s.pendingChoice && s.run; i++) {
      if (s.pendingChoice.loopCount || i > 0) chooser = s.pendingChoice.chooser;
      s = drive(pick(s, ""), (x) => Boolean(x.pendingChoice) || passedIce(x));
    }
    r.fact("chooser(loop)", chooser);
    const done = accessing(s);
    r.fact("accessed", accessedSince(done.s, from), "run-over");
    r.snap("run-over", toAction(done.s));
  },

  "10.2.3b.ex1": (r) => {
    const b = new Board(r, "runner", 10);
    const enigma = b.ice("enigma", "hq");
    b.ice("ice-wall", "hq", false);
    const [femme] = b.grip("femme-fatale");
    let s = take(b.s, "basic_install", femme);
    s = toAction(through(s, atAction, [`chosen-ice:${enigma}`]));
    r.fact("corpSeesChosenIce", corpSeesChosenIce(s, femme!), "install");
    r.snap("install", s);
    s = toCorpTurn(s);
    r.fact("corpSeesChosenIce", corpSeesChosenIce(s, femme!), "later");
    r.snap("later", s);
  },

  "10.3.1b.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const corroder = b.rig("corroder");
    b.ice("wall-of-static", "hq");
    let s = drive(run(b.s, "hq"), encounterOrOver);
    s = breakAll(pump(s, corroder, 2), corroder);
    r.snap("pump", s);
    s = drive(s, passedIce);
    r.snap("after", s);
  },

  "10.3.1b.ex2": (r) => {
    const b = new Board(r, "runner", 5);
    const [current] = b.hq("targeted-marketing");
    b.s.corp.hand = b.s.corp.hand.filter((id) => id !== current);
    b.card(current!).zone = "corp:play-area";
    b.card(current!).faceup = true;
    b.s.corp.playArea.push(current!);
    b.hq("offworld-office");
    const s = toAction(accessing(run(b.s, "hq")).s);
    r.snap("steal", s);
  },

  "10.3.1e.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.s.corp.credits = 9;
    const tithonium = b.ice("tithonium", "hq", false);
    const [chisel] = b.grip("chisel");
    let s = take(b.s, "basic_install", chisel, (a) =>
      JSON.stringify(a).includes(tithonium),
    );
    s = toAction(through(s, atAction, [tithonium]));
    s.runner.clicks = 4;
    s = drive(run(s, "hq"), (x) => x.timingKey === "run.approachPaw" || !x.run);
    s = must(s, { type: "rez_ice", cardId: tithonium });
    s = through(s, encounterOrOver, ["pay", "credits", "decline"]);
    r.snap("rez", s);
  },

  "10.3.1e.ex2": (r) => {
    const b = new Board(r, "corp", 5);
    b.s.runner.tags = 1;
    const corroder = b.rig("corroder");
    const blade = b.rig("gordian-blade");
    const smc = b.rig("self-modifying-code");
    const harbinger = b.rig("harbinger");
    const [bad] = b.hq("bad-times");
    let s = take(b.s, "play_operation", bad);
    s = drive(s, (x) => Boolean(x.pendingChoice) || atAction(x));
    debug(
      "bad times:",
      s.timingKey,
      s.pendingChoice?.chooser,
      options(s),
      JSON.stringify(legalActions(s)).slice(0, 300),
    );
    r.fact("chooser(trash-two)", s.pendingChoice?.chooser ?? "nobody");
    // The engine offers whole sets: a set is legal when an option lists
    // exactly its cards.
    const tryset = (ids: string[]): { ok: boolean; s: GameState } => {
      const option = (s.pendingChoice?.options ?? []).find((o) => {
        const listed = /^restrict:([^|]*)/.exec(o.id)?.[1]?.split(",") ?? [];
        return (
          listed.length === ids.length && ids.every((id) => listed.includes(id))
        );
      });
      if (!option) return { ok: false, s };
      return {
        ok: true,
        s: must(s, { type: "choose_option", optionId: option.id }),
      };
    };
    r.fact("legal(trash-zero)", tryset([harbinger]).ok);
    r.fact("legal(trash-one)", tryset([corroder]).ok);
    r.fact("legal(trash-three)", tryset([smc, corroder]).ok);
    r.fact("legal(trash-ones)", tryset([corroder, blade]).ok);
    const two = tryset([smc]);
    r.fact("legal(trash-two)", two.ok);
    r.snap("trash-two", two.ok ? toAction(two.s) : s);
  },

  "10.3.1j.ex1#a": (r) => gankedDrafter(r, true),
  "10.3.1j.ex1#b": (r) => gankedDrafter(r, false),

  "10.3.6.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.identity("runner", "jesminder-sareen-girl-behind-the-curtain");
    const [office, remote] = b.remote("offworld-office");
    b.root("amaze-amusements", remote, true);
    let s = accessing(run(b.s, remote), {
      choose: (_x, ids) => ids.find((id) => id === office),
    }).s;
    s = through(s, atAction, []);
    if (offered(s, "accept_tags").length) s = take(s, "accept_tags");
    r.snap("run", toAction(s));
  },

  "10.4.1.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.identity("corp", "argus-security-protection-guaranteed");
    b.scored("corp", "the-cleaners");
    b.grip("diesel", "diesel", "diesel", "diesel", "diesel");
    b.rd("hostile-takeover");
    const [punitive] = b.hq("punitive-counterstrike");
    let s = accessing(run(b.s, "rd"), {
      answers: ["damage", "meat", "suffer"],
    }).s;
    debug("argus:", s.timingKey, options(s));
    for (let i = 0; i < 4 && !atAction(s); i++) {
      if (offered(s, "accept_damage").length) s = take(s, "accept_damage");
      s = through(s, atAction, ["damage", "meat", "suffer"]);
    }
    r.snap("steal", s);
    s = toCorpTurn(s);
    s = toAction(through(s, atAction));
    // The mandatory draw may have brought more cards: play the one named.
    s = take(s, "play_operation", punitive);
    for (let i = 0; i < 6 && !atAction(s); i++) {
      s = settleTrace(
        drive(
          s,
          (x) =>
            Boolean(x.trace) ||
            atAction(x) ||
            offered(x, "accept_damage").length > 0,
        ),
      );
      if (offered(s, "accept_damage").length) s = take(s, "accept_damage");
    }
    r.snap("punitive", s);
  },

  "10.4.3.ex1#a": (r) => boom(r, false),
  "10.4.3.ex1#b": (r) => boom(r, true),

  "10.4.3a.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.identity("corp", "chronos-protocol-selective-mind-mapping");
    const [corroder] = b.grip("corroder", "diesel", "diesel", "diesel");
    const [snare, remote] = b.remote("snare");
    let s = drive(
      run(b.s, remote),
      (x) => offered(x, "access_card").length > 0,
    );
    s = take(s, "access_card", snare);
    let chooser = "nobody";
    for (let i = 0; i < 8 && !(atAction(s) && !s.run); i++) {
      s = drive(
        s,
        (x) =>
          Boolean(x.pendingChoice) ||
          (!x.run && atAction(x)) ||
          offered(x, "accept_damage").length > 0 ||
          offered(x, "accept_tags").length > 0,
      );
      if (s.pendingChoice) {
        debug("snare:", s.pendingChoice.chooser, options(s));
        if (hasOption(s, corroder!)) {
          chooser = s.pendingChoice.chooser;
          s = pick(s, corroder!);
        } else {
          const want = ["pay", "accept", "yes"].find((w) => hasOption(s, w));
          if (!want) break;
          s = pick(s, want);
        }
      } else if (offered(s, "accept_tags").length) s = take(s, "accept_tags");
      else if (offered(s, "accept_damage").length) s = take(s, "accept_damage");
      else if (offered(s, "finish_access").length) s = take(s, "finish_access");
    }
    r.fact("chooser(snare)", chooser);
    r.snap("snare", s);
  },

  "10.8.5.ex1#a": (r) => gemini(r, 3, 0),
  "10.8.5.ex1#b": (r) => gemini(r, 0, 0),
  "10.8.5.ex1#c": (r) => gemini(r, 3, 5),

  "10.9.2.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const [crowd] = b.grip("crowdfunding");
    b.stack("diesel", "diesel", "diesel");
    const s = toAction(through(take(b.s, "basic_install", crowd), atAction));
    r.snap("install", s);
  },

  "10.11.5.ex1": (r) => {
    // The position says the mark comes out as HQ: take the first seed that does.
    const play = (rep: Report, seed: number) => {
      const b = new Board(rep, "runner", 5);
      b.s.rngState = seed;
      const [jailbreak, carpe] = b.grip("jailbreak", "carpe-diem");
      for (const id of b.s.runner.deck) delete b.s.cards[id];
      b.s.runner.deck = [];
      const [virtuoso] = b.stack("virtuoso", "diesel", "diesel");
      b.hq("hedge-fund", "ice-wall", "enigma", "wall-of-static", "tollbooth");
      let from = b.s.log.length;
      let s = toAction(accessing(playRun(b.s, jailbreak!, "hq")).s);
      const first = accessedSince(s, from).length;
      const afterFirst = s;
      s = toAction(through(take(s, "basic_install", virtuoso), atAction));
      from = s.log.length;
      s = take(s, "play_event", carpe);
      s = through(s, (x) => Boolean(x.run) || atAction(x), [
        "run",
        "accept",
        "yes",
      ]);
      const onHq = s.run?.attackedServerId === "hq";
      s = toAction(accessing(s, { answers: ["run", "accept", "yes"] }).s);
      return {
        afterFirst,
        s,
        first,
        second: accessedSince(s, from).length,
        onHq,
      };
    };
    let seed = 1;
    for (; seed < 60 && !play(new Report(), seed).onHq; seed++);
    if (seed === 60) throw new Error("no seed makes HQ the mark");
    const out = play(r, seed);
    r.fact("accessedCount", out.first, "jailbreak");
    r.snap("jailbreak", out.afterFirst);
    r.fact("accessedCount", out.second, "carpe");
    r.snap("carpe", out.s);
  },

  "10.12.3b.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.identity("runner", "esa-afontov-eco-insurrectionist");
    const [stimhack] = b.grip("stimhack", "diesel", "diesel");
    b.stack("diesel", "diesel", "diesel");
    for (const id of b.s.corp.deck) delete b.s.cards[id];
    b.s.corp.deck = [];
    b.rd(...Array.from({ length: 30 }, () => "hedge-fund"));
    const hand = b.hq("ice-wall", "ice-wall");
    let s = playRun(b.s, stimhack!, "archives");
    s = through(s, (x) => Boolean(x.pendingSabotage) || atAction(x), [
      "accept",
      "yes",
      "sabotage",
    ]);
    debug(
      "sabotage:",
      s.timingKey,
      JSON.stringify(s.pendingSabotage),
      options(s),
    );
    r.fact("chooser(one)", s.pendingSabotage ? "corp" : "nobody");
    r.fact("legal(none)", accepts(s, sabotage([])));
    r.fact("legal(both)", accepts(s, sabotage(hand)));
    r.fact("legal(one)", accepts(s, sabotage([hand[0]!])));
    if (accepts(s, sabotage([hand[0]!]))) s = must(s, sabotage([hand[0]!]));
    s = toAction(through(s, atAction));
    r.fact("corp.rd", s.corp.deck.length, "one");
    r.snap("one", s);
  },

  "10.12.3b.ex2": (r) => {
    const { s: asked, hand, from } = chastushka(r, 5, 2);
    r.fact("legal(one)", accepts(asked, sabotage(hand.slice(0, 1))));
    r.fact("legal(two)", accepts(asked, sabotage(hand.slice(0, 2))));
    let s = asked;
    if (accepts(s, sabotage(hand.slice(0, 2))))
      s = must(s, sabotage(hand.slice(0, 2)));
    s = toAction(accessing(s).s);
    r.fact("corp.rd", s.corp.deck.length, "two");
    r.fact("accessed", accessedSince(s, from), "two");
    r.snap("two", s);
  },

  "10.12.3b.ex3": (r) => {
    const { s: asked, hand } = chastushka(r, 2, 1);
    let s = asked;
    if (s.pendingSabotage && accepts(s, sabotage(hand)))
      s = must(s, sabotage(hand));
    s = s.done ? s : toAction(accessing(s).s);
    r.fact("corp.rd", s.corp.deck.length);
    r.fact("winner", s.winner ?? "none");
    r.snap("all", s);
  },

  "10.13.1.ex1": (r) => {
    const b = new Board(r, "corp", 5);
    const [report] = b.remote("embedded-reporting");
    b.card(report).advancementCounters = 5;
    let s = must(corpWindow(b.s), { type: "score_agenda", cardId: report });
    s = toAction(through(s, atAction));
    r.snap("score", s);
  },

  "10.13.2.ex1": (r) => {
    const b = new Board(r, "corp", 5);
    const [ingatan, remote] = b.remote("project-ingatan");
    b.card(ingatan).advancementCounters = 3;
    b.root("sansan-city-grid", remote, true);
    let s = must(corpWindow(b.s), { type: "score_agenda", cardId: ingatan });
    s = toAction(through(s, atAction));
    r.snap("score", s);
  },

  "10.14.3.ex1": (r) => {
    const { s: asked, from } = adrianSeis(r, 0, (b) => {
      const fencer = b.rig("fencer-fueno");
      b.card(fencer).hostedCredits = 1;
    });
    r.fact("legal(bid-two)", accepts(asked, bid(2)));
    r.fact("legal(bid-one)", accepts(asked, bid(1)));
    const out = seisGame(asked, from, 0, 1);
    r.fact("accessed", out.accessed, "bid-one");
    r.snap("bid-one", out.s);
  },

  "10.14.3.ex2": (r) => {
    const { s: asked, from } = adrianSeis(r, 5, (b, remote) => {
      b.ice("rsvp", remote);
    });
    r.fact("legal(bid-one)", accepts(asked, bid(1)));
    r.fact("legal(bid-zero)", accepts(asked, bid(0)));
    const out = seisGame(asked, from, 0, 0);
    r.fact("accessed", out.accessed, "bid-zero");
    r.snap("bid-zero", out.s);
  },
};

function boom(r: Report, plascrete: boolean): void {
  const b = new Board(r, "corp", 5);
  b.s.runner.tags = 2;
  b.grip("ive-had-worse", "diesel", "diesel", "diesel");
  b.stack("diesel", "diesel", "diesel");
  let shell = "";
  if (plascrete) {
    shell = b.rig("plascrete-carapace");
    b.card(shell).powerCounters = 4;
  }
  const [boomCard] = b.hq("boom");
  let s = take(b.s, "play_operation", boomCard);
  for (let i = 0; i < 8 && !s.done && !atAction(s); i++) {
    s = drive(
      s,
      (x) =>
        Boolean(x.done) ||
        atAction(x) ||
        Boolean(x.pendingDamage) ||
        Boolean(x.pendingChoice),
    );
    debug(
      "boom:",
      s.timingKey,
      JSON.stringify(s.pendingDamage),
      options(s),
      JSON.stringify(legalActions(s).map((a) => a.type)),
    );
    if (s.pendingDamage) {
      const prevent = offered(s, "use_paid_ability", shell)[0];
      const left = (s.cards[shell]?.powerCounters ?? 0) > 1;
      if (plascrete && prevent && left) s = must(s, prevent);
      else if (offered(s, "accept_damage").length) s = take(s, "accept_damage");
      else break;
    } else if (s.pendingChoice) {
      const want = ["accept", "yes", "draw"].find((w) => hasOption(s, w));
      if (!want) break;
      s = pick(s, want);
    }
  }
  r.fact("winner", s.winner ?? "none");
  r.snap("boom", s);
}
