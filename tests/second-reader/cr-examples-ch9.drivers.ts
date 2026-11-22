/**
 * Second reader, batch 1 (CR examples, chapter 9): one driver per case in
 * `cr-examples-ch9.json`. A driver builds the position, plays the listed
 * steps and reports. It does not say what should happen.
 *
 * Not a test file: vitest only runs `*.test.ts`.
 */
import { cloneState, getPublicView, legalActions } from "../../src/index.js";
import type { GameState } from "../../src/index.js";
import { must, optionIds, pick } from "../rulings-helpers.js";
import { accepts, Board, hasOption, offered, take } from "./harness.js";
import type { Report } from "./harness.js";
import {
  accessedSince,
  atAction,
  atEncounter,
  corpWindow,
  breakSubs,
  corpTurnBegins,
  debug,
  encounterOrOver,
  go,
  handOver,
  idle,
  playRun,
  raw,
  runnerTurnBegins,
  spendClicks,
  using,
  what,
  run,
  runnerWindow,
} from "./driving.js";
import type { Driver } from "./driving.js";

/**
 * `run.outcome` is read from the turn's record of runs. A case that makes an
 * earlier run only to ask what was legal clears the record before the run it
 * reports on.
 */
function forgetRuns(s: GameState): GameState {
  s.turn.successfulRunThisTurn = false;
  s.turn.unsuccessfulRunThisTurn = false;
  return s;
}

/**
 * Gebrselassie goes onto its host through its own click ability, so the
 * engine hosts it the way it would in play. The click is given back.
 */
function gebrselassieOn(b: Board, hostId: string): string {
  const geb = b.rig("gebrselassie");
  b.s = go(take(b.s, "use_paid_ability", geb), idle, [hostId]);
  b.s.runner.clicks = 4;
  return geb;
}

const PASS_ICE_AGAIN =
  "the run never goes on: the window after the encounter opens again each time it closes";

/**
 * A stop for a walk that may never leave the window after an encounter: it
 * holds once that window has been seen `limit` times.
 */
function passIceAgain(limit = 8): (s: GameState) => boolean {
  let seen = 0;
  return (s) => {
    if (s.timingKey === "run.passIcePaw") seen += 1;
    return seen > limit;
  };
}

/** Use a card's paid ability up to `times` times, while the engine offers it. */
function pump(s: GameState, cardId: string, times: number): GameState {
  for (let i = 0; i < times; i++) {
    const next = offered(s, "use_paid_ability", cardId)[0];
    if (!next) return s;
    s = must(s, next);
  }
  return s;
}

const subCount = (s: GameState, iceId: string): number =>
  s.cards[iceId]?.subroutines?.length ?? 0;

/** Unbroken subroutines of the ice being encountered. */
function unbroken(s: GameState, iceId: string): number | string {
  const enc = s.run?.encounter;
  if (!enc || enc.iceId !== iceId) return "no encounter with it";
  return (s.cards[iceId]?.subroutines ?? []).filter((_, i) => !enc.broken[i])
    .length;
}

const title = (s: GameState, id: string | undefined): string =>
  (id && s.cards[id]?.title) || "none";

const stackBottom = (s: GameState): string =>
  title(s, s.runner.deck[s.runner.deck.length - 1]);

/** Zahya Sadeghi: two runs on HQ, using the identity after the named ones. */
function zahya(r: Report, useFirst: boolean, direct: boolean): void {
  const b = new Board(r, "runner", 5);
  b.identity("runner", "zahya-sadeghi-versatile-smuggler");
  b.hq("hedge-fund");
  const [event] = direct ? b.grip("direct-access") : [undefined];
  const zahyaAsked = (s: GameState): boolean =>
    Boolean(s.pendingChoice) &&
    (JSON.stringify(s.pendingChoice).includes("zahya") ||
      offered(s, "use_identity_ability").length > 0);
  const oneRun = (s: GameState, label: string, use: boolean): GameState => {
    let asked = false;
    s = go(s, idle, [], (x) => {
      if (!zahyaAsked(x)) return undefined;
      debug("zahya:", what(x));
      asked = true;
      const want = use ? ["accept", "yes", "gain"] : ["decline", "no", "pass"];
      const found = want.find((w) => hasOption(x, w));
      return found ? pick(x, found) : undefined;
    });
    // A choice left open (the shuffle of Direct Access) is declined.
    s = go(s, idle, ["decline", "no"]);
    if (label !== "first" || direct) r.fact("legal(zahya)", asked, label);
    r.snap(label, s);
    return s;
  };
  let s = direct ? playRun(b.s, event!, "hq") : run(b.s, "hq");
  s = oneRun(s, direct ? "direct" : "first", direct ? true : useFirst);
  oneRun(run(s, "hq"), "second", true);
}

/** Wendigo names Imp, then the Runner accesses Mumbad Virtual Tour. */
function wendigoImp(r: Report, credits: number): void {
  const b = new Board(r, "runner", credits);
  const imp = b.rig("imp");
  b.card(imp).virusCounters = 2;
  const [tour, remote] = b.remote("mumbad-virtual-tour", true);
  b.ice("wendigo", remote);
  let s = go(run(b.s, remote), encounterOrOver);
  s = must(s, { type: "pass_window" });
  s = go(s, (x) => offered(x, "access_card").length > 0 || !x.run, [imp]);
  r.snap("wendigo", s);
  s = raw(s, { type: "access_card", cardId: tour });
  debug("tour:", what(s));
  // The engine settles this access in one step and never stops inside it, so
  // what it would have offered cannot be read. The outcome is compared.
  const unseen = "the engine resolves the access without stopping inside it";
  r.cannotObserve("legal(imp)", unseen);
  r.cannotObserve("legal(decline)", unseen);
  const pay = offered(s, "trash_accessed")[0];
  if (pay) s = must(s, pay);
  r.snap("access", go(s, idle));
}

export const drivers: Record<string, Driver> = {
  "9.1.2a.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.identity("runner", "armand-geist-walker-tech-lord");
    const decoy = b.rig("decoy");
    b.grip("sure-gamble", "sure-gamble");
    b.rd("snare");
    const s = go(run(b.s, "rd"), idle, ["pay", "yes", "accept"], using(decoy));
    r.fact("winner", s.winner ?? "none");
    r.snap("snare", s);
  },

  "9.1.2b.ex1": (r) => attini(r, true),
  "9.1.2b.ex1#b": (r) => attini(r, false),
  "9.1.2b.ex2": (r) => zahya(r, false, true),

  "9.1.4.ex1": (r) => compileMayfly(r, "compile"),
  "9.1.4.ex1#b": (r) => compileMayfly(r, "mayfly"),

  "9.1.6c.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const mimic = b.rig("mimic");
    const feeder = b.rig("cyberfeeder");
    b.card(feeder).recurringCredits = 1;
    b.grip("sure-gamble", "sure-gamble", "sure-gamble");
    b.ice("neural-katana", "hq");
    b.hq("hedge-fund");
    let s = go(run(b.s, "hq"), encounterOrOver);
    debug("feeder:", JSON.stringify(b.card(feeder)).slice(0, 400));
    s = breakSubs(s, mimic, 1);
    s = go(s, encounterOrOver, [feeder, "cyberfeeder", "recurring"]);
    r.cannotObserve(
      "used(Mimic)",
      "the state has no record of a card having been used",
    );
    r.cannotObserve(
      "used(Cyberfeeder)",
      "the state has no record of a card having been used",
    );
    r.snap("break", go(s, idle));
  },

  "9.1.8b.ex1": (r) => worse(r, false),
  "9.1.8b.ex1#b": (r) => worse(r, true),

  "9.1.8g.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const [event] = b.grip("singularity");
    b.grip("sure-gamble", "sure-gamble", "sure-gamble", "sure-gamble");
    const [, remote] = b.remote("hostile-infrastructure", true);
    b.root("tori-hanzo", remote);
    b.root("amaze-amusements", remote);
    r.snap(
      "singularity",
      go(playRun(b.s, event!, remote), idle, ["singularity"]),
    );
  },

  "9.1.8g.ex2": (r) => {
    const b = new Board(r, "runner", 5);
    const [event] = b.grip("test-run");
    const [nanuq] = b.stack("nanuq");
    let s = must(b.s, { type: "play_event", cardId: event! });
    s = go(s, idle, ["stack", nanuq!]);
    r.snap("play", s);
    s.config.stopAfterFirstCycle = false;
    s.runner.clicks = 1;
    s = must(s, { type: "basic_gain_credit" });
    r.snap(
      "turn-ends",
      go(s, (x) => x.timingKey === "corp.takeAction"),
    );
  },

  "9.1.8h.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const mimic = b.rig("mimic");
    const [angel] = b.hq("archangel");
    let met = false;
    const s = go(run(b.s, "hq"), idle, ["pay", "yes", "accept", mimic], (x) => {
      if (x.run?.encounter?.iceId === angel) met = true;
      return undefined;
    });
    r.fact("encountered(Archangel)", met);
    r.snap("access", s);
  },

  "9.2.8f.ex1": (r) => {
    const b = new Board(r, "runner", 14);
    const toll = b.ice("tollbooth", "hq");
    b.hq("hedge-fund");
    const [femme] = b.grip("femme-fatale");
    // Femme Fatale goes in through the engine so that Tollbooth is its chosen ice.
    let s = take(b.s, "basic_install", femme);
    s = go(s, idle, [toll]);
    s.runner.clicks = 4;
    s.runner.credits = 5;
    const from = s.log.length;
    s = go(run(s, "hq"), (x) => Boolean(x.pendingChoice) || !x.run);
    debug("femme:", what(s));
    if (hasOption(s, "bypass")) s = pick(s, "bypass");
    r.snap("encounter", s);
    s = go(s, idle, ["accept", "yes", "pay"]);
    r.fact("accessed", accessedSince(s, from), "run-over");
    r.snap("run-over", s);
  },

  "9.3.6g.ex1": (r) => zahya(r, false, false),
  "9.3.6g.ex1#b": (r) => zahya(r, true, false),

  "9.4.4.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const puffer = b.rig("puffer");
    b.card(puffer).powerCounters = 1;
    gebrselassieOn(b, puffer);
    b.ice("neural-katana", "hq");
    b.hq("hedge-fund");
    let s = go(run(b.s, "hq"), encounterOrOver);
    debug("puffer:", JSON.stringify(offered(s, "use_paid_ability", puffer)));
    s = take(
      s,
      "use_paid_ability",
      puffer,
      (a) => !JSON.stringify(a).includes("counter"),
    );
    s = breakSubs(s, puffer, 1);
    r.snap("pump", s);
    s = go(s, idle);
    r.snap("run-over", s);
    debug("puffer:", JSON.stringify(offered(s, "use_paid_ability", puffer)));
    s = go(take(s, "use_paid_ability", puffer), idle, ["remove"]);
    r.snap("remove", s);
    s.config.stopAfterFirstCycle = false;
    s.runner.clicks = 1;
    s = must(s, { type: "basic_gain_credit" });
    r.snap(
      "turn-ends",
      go(s, (x) => x.timingKey === "corp.takeAction"),
    );
  },

  "9.4.5.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.scored("corp", "the-cleaners");
    b.ice("flare", "hq");
    const spoof = b.rig("biometric-spoofing");
    const feeder = b.rig("cyberfeeder");
    b.grip("sure-gamble", "sure-gamble", "sure-gamble", "sure-gamble");
    let prevent = false;
    const s = go(run(b.s, "hq"), idle, [feeder], (x) => {
      if (!x.pendingDamage) return undefined;
      debug("flare:", what(x), JSON.stringify(x.pendingDamage));
      if (
        offered(x, "use_paid_ability", spoof).length > 0 ||
        offered(x, "prevent_damage").length > 0
      ) {
        prevent = true;
      }
      return undefined;
    });
    r.fact("legal(prevent)", prevent);
    r.snap("flare", s);
  },

  "9.5.3a.ex1": (r) => wendigoImp(r, 5),
  "9.5.3a.ex1#b": (r) => wendigoImp(r, 4),

  "9.5.5.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const fermenter = b.rig("fermenter");
    b.card(fermenter).virusCounters = 4;
    r.snap("use", go(take(b.s, "use_paid_ability", fermenter), idle));
  },

  "9.5.5.ex2": (r) => {
    const b = new Board(r, "runner", 5);
    const peddler = b.rig("street-peddler");
    const corroder = b.hostedOn("corroder", peddler);
    b.hostedOn("mimic", peddler);
    b.hostedOn("sure-gamble", peddler);
    for (const c of Object.values(b.s.cards)) {
      if ((c as { hostId?: string }).hostId === peddler) c.faceup = false;
    }
    debug(
      "peddler:",
      JSON.stringify(offered(runnerWindow(b.s), "use_paid_ability", peddler)),
    );
    let s = take(runnerWindow(b.s), "use_paid_ability", peddler);
    s = go(s, idle, [corroder]);
    r.snap("use", s);
  },

  "9.5.5.ex3": (r) => {
    const b = new Board(r, "corp", 5);
    const [contract] = b.remote("reconstruction-contract", true);
    b.card(contract).advancementCounters = 2;
    const wall = b.ice("ice-wall", "hq");
    b.s.timingKey = "corp.actionPaw";
    debug(
      "contract:",
      JSON.stringify(offered(b.s, "use_paid_ability", contract)),
    );
    let s = raw(b.s, offered(b.s, "use_paid_ability", contract)[0]!);
    debug("contract:", what(s), JSON.stringify(s.cards[wall]).slice(0, 300));
    s = go(
      s,
      (x) => !x.pendingChoice && (idle(x) || x.timingKey === "corp.actionPaw"),
      [`rc:${wall}:2`],
    );
    r.snap("use", s);
  },

  "9.5.6b.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const wotan = b.scored("corp", "project-wotan");
    b.card(wotan).agendaCounters = 3;
    b.ice("ice-wall", "rd");
    const eli = b.ice("eli-1-0", "hq");
    const can = (s: GameState): boolean =>
      offered(s, "use_paid_ability", wotan).length > 0;
    // The Runner passes priority in the action window so that the Corp holds it.
    let waiting = runnerWindow(cloneState(b.s));
    if (!can(waiting)) waiting = handOver(waiting);
    debug("wotan idle:", what(waiting));
    r.fact("legal(wotan)", can(waiting), "idle");
    r.snap("idle", b.s);
    b.s.timingKey = "runner.takeAction";
    let s = go(
      run(b.s, "rd"),
      (x) => x.timingKey === "run.approachPaw" || !x.run,
    );
    if (!can(s)) s = handOver(s);
    debug("wotan at ice wall:", what(s));
    r.fact("legal(wotan)", can(s), "ice-wall");
    s = go(s, idle);
    r.snap("ice-wall", s);
    s = go(run(s, "hq"), (x) => x.timingKey === "run.approachPaw" || !x.run);
    if (!can(s)) s = handOver(s);
    debug("wotan at eli:", what(s));
    r.fact("legal(wotan)", can(s), "eli");
    if (can(s)) s = take(s, "use_paid_ability", wotan);
    r.fact("subroutineCount(Eli 1.0)", subCount(s, eli), "eli");
    r.snap("eli", s);
  },

  "9.5.6c.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const crew = b.rig("arruaceiras-crew");
    b.ice("ice-wall", "hq");
    // The first ability, by the id the engine gives it.
    const weaken = (s: GameState) =>
      offered(s, "use_paid_ability", crew).find((a) =>
        JSON.stringify(a).includes("weaken"),
      );
    debug(
      "crew idle:",
      JSON.stringify(offered(runnerWindow(b.s), "use_paid_ability", crew)),
    );
    r.fact("legal(crew)", Boolean(weaken(runnerWindow(b.s))), "idle");
    r.snap("idle", b.s);
    b.s.timingKey = "runner.takeAction";
    let s = go(run(b.s, "hq"), encounterOrOver);
    debug("crew:", JSON.stringify(offered(s, "use_paid_ability", crew)));
    const use = weaken(s);
    r.fact("legal(crew)", Boolean(use), "encounter");
    if (use) s = must(s, use);
    r.snap("encounter", s);
  },

  "9.5.6c.ex2": (r) => {
    const b = new Board(r, "runner", 5);
    const abagnale = b.rig("abagnale");
    b.ice("ice-wall", "rd");
    b.ice("marker", "hq");
    b.hq("hedge-fund");
    const bypass = (s: GameState) =>
      offered(s, "use_paid_ability", abagnale).find((a) =>
        JSON.stringify(a).includes("bypass"),
      );
    let s = go(run(b.s, "rd"), encounterOrOver);
    debug(
      "abagnale:",
      JSON.stringify(offered(s, "use_paid_ability", abagnale)),
    );
    r.fact("legal(bypass)", Boolean(bypass(s)), "barrier");
    r.fact(
      "legal(interface)",
      offered(s, "break_subroutine", abagnale).length > 0,
      "barrier",
    );
    s = go(s, idle);
    r.snap("barrier", s);
    s = go(run(forgetRuns(s), "hq"), encounterOrOver);
    debug(
      "abagnale:",
      JSON.stringify(offered(s, "use_paid_ability", abagnale)),
    );
    r.fact(
      "legal(interface)",
      offered(s, "break_subroutine", abagnale).length > 0,
      "gate",
    );
    r.fact("legal(bypass)", Boolean(bypass(s)), "gate");
    const use = bypass(s);
    if (use) s = must(s, use);
    r.snap("gate", s);
    r.snap("run-over", go(s, idle));
  },

  "9.6.4b.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const [event] = b.grip("singularity");
    b.grip("sure-gamble", "sure-gamble", "sure-gamble", "sure-gamble");
    b.remote("hostile-infrastructure", true);
    const [, remote] = b.remote("pad-campaign");
    b.root("tori-hanzo", remote);
    b.root("amaze-amusements", remote);
    r.snap(
      "singularity",
      go(playRun(b.s, event!, remote), idle, ["singularity"]),
    );
  },

  "9.6.4b.ex2": (r) => {
    const b = new Board(r, "runner", 5);
    b.rig("blackguard");
    const [uplink] = b.grip("satellite-uplink");
    const [pad] = b.remote("pad-campaign");
    const wall = b.ice("ice-wall", "hq", false);
    let s = must(b.s, { type: "play_event", cardId: uplink! });
    s = go(s, idle, [pad, wall, "done", "rez", "rez"]);
    r.snap("uplink", s);
  },

  "9.6.5b.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.identity("corp", "ob-superheavy-logistics-extract-export-excel");
    const [reaper] = b.remote("reaper-function", true);
    const [nico] = b.rd("nico-campaign");
    b.grip("sure-gamble", "sure-gamble", "sure-gamble");
    const s = corpTurnBegins(b.s, ["trash-net", "accept", nico!, "new"]);
    debug("ob:", reaper, what(s));
    r.snap("turn-begins", s);
  },

  "9.6.5b.ex2": (r) => {
    const b = new Board(r, "corp", 5);
    const [adt] = b.remote("architect-deployment-test");
    b.card(adt).advancementCounters = 4;
    const [grid] = b.rd("tranquility-home-grid");
    let s = take(corpWindow(b.s), "score_agenda", adt);
    s = go(s, idle, [grid!, "new", "rez", "accept"]);
    r.snap("score", s);
  },

  "9.6.5c.ex1": (r) => {
    const b = new Board(r, "corp", 5);
    const [call, qpm] = b.hq("casting-call", "quantum-predictive-model");
    // Casting Call goes in through the engine so that it is hosted as the
    // condition counter the card describes.
    let s = take(b.s, "play_operation", call);
    s = go(s, idle, [qpm!, "new"]);
    s = runnerTurnBegins(s);
    const server = /^server:(.+):root$/.exec(s.cards[qpm!]!.zone)?.[1];
    debug("qpm:", s.cards[qpm!]!.zone, JSON.stringify(s.cards[call!]));
    s = go(run(s, server!), idle, ["accept", "yes"]);
    r.snap("access", s);
  },

  "9.6.5d.ex1": (r) => supplier(r, true),
  "9.6.5d.ex1#b": (r) => supplier(r, false),

  "9.6.6a.ex1": (r) => {
    const b = new Board(r, "corp", 5);
    b.identity("corp", "weyland-consortium-built-to-last");
    const wall = b.ice("ice-wall", "hq");
    let s = go(take(b.s, "advance", wall), idle, ["accept", "yes"]);
    r.snap("first", s);
    s = go(take(s, "advance", wall), idle, ["accept", "yes"]);
    r.snap("second", s);
  },

  "9.6.7d.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.ice("architect", "hq");
    const [parasite] = b.grip("parasite");
    // Parasite goes in through the engine so that it is hosted on the ice.
    let s = go(take(b.s, "basic_install", parasite), idle, []);
    s.cards[parasite!]!.virusCounters = 3;
    s.runner.clicks = 4;
    s.runner.credits = 5;
    s = go(must(s, { type: "basic_gain_credit" }), idle);
    r.snap("click", s);
  },

  "9.6.10.ex1": (r) => pawnshop(r, true),
  "9.6.10.ex1#b": (r) => pawnshop(r, false),

  "9.6.13b.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const [groove, corroder, mimic, construct] = b.grip(
      "in-the-groove",
      "corroder",
      "mimic",
      "sacrificial-construct",
    );
    let s = go(must(b.s, { type: "play_event", cardId: groove! }), idle);
    r.snap("groove", s);
    s = go(take(s, "basic_install", corroder), idle, ["gain"]);
    r.snap("first", s);
    s = go(take(s, "basic_install", mimic), idle, ["gain"]);
    r.snap("second", s);
    s = go(take(s, "basic_install", construct), idle, ["gain"]);
    r.snap("zero", s);
  },

  "9.6.13c.ex1": (r) => {
    const b = new Board(r, "corp", 5);
    b.rig("joshua-b");
    let s = runnerTurnBegins(b.s, ["gain-click"]);
    r.snap("begin", s);
    s = corpTurnBegins(spendClicks(s));
    r.snap("end", s);
    s = runnerTurnBegins(s, ["decline"]);
    s = corpTurnBegins(spendClicks(s));
    r.snap("next-end", s);
  },

  "9.6.13d.ex1": (r) => {
    const b = new Board(r, "corp", 5);
    const [takeover] = b.remote("hostile-takeover");
    b.card(takeover).advancementCounters = 2;
    const [chrysalis] = b.hq("chrysalis");
    b.rig("gang-sign");
    const mayfly = b.rig("mayfly");
    b.grip("sure-gamble", "sure-gamble", "sure-gamble");
    b.s.runner.credits = 5;
    let met = false;
    let s = take(corpWindow(b.s), "score_agenda", takeover);
    s = go(s, idle, ["accept", "yes"], (x) => {
      if (x.run?.encounter?.iceId !== chrysalis || met) return undefined;
      debug("chrysalis:", what(x));
      met = true;
      return breakSubs(pump(x, mayfly, 1), mayfly, 1);
    });
    debug("gang sign: encounter", met, what(s));
    r.snapFor("encounter", "run.active", s);
    r.snap("encounter", s);
    s.config.stopAfterFirstCycle = false;
    s.timingKey = "corp.takeAction";
    s.corp.clicks = 1;
    s = must(s, { type: "basic_gain_credit" });
    r.snap(
      "turn-ends",
      go(s, (x) => x.timingKey === "runner.takeAction"),
    );
  },

  "9.6.14d.ex1": (r) => newsCycle(r, "market-research", 0),
  "9.6.14d.ex1#b": (r) => newsCycle(r, "astroscript-pilot-program", 1),
  "9.6.14d.ex1#c": (r) => newsCycle(r, "astroscript-pilot-program", 0),

  "9.7.1.ex1": (r) => oppo(r, true, false),
  "9.7.1.ex1#b": (r) => oppo(r, false, false),
  "9.7.1.ex1#c": (r) => oppo(r, true, true),

  "9.8.2c.ex1": (r) => lancelot(r, "last"),
  "9.8.2c.ex1#b": (r) => lancelot(r, "first"),

  "9.8.3a.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const loki = b.ice("loki", "hq");
    const tithe = b.ice("tithe", "rd");
    b.remote("warden-fatuma", true);
    b.rig("stick-and-poke");
    b.grip("sure-gamble", "sure-gamble", "sure-gamble");
    let s = go(run(b.s, "hq"), encounterOrOver, [tithe]);
    debug("loki:", JSON.stringify(s.cards[loki]!.subroutines));
    r.fact("subroutineOrder(Loki)", subSources(s, loki));
    r.snapFor("encounter", "hasSubtype(Loki,sentry)", s);
    s = must(s, { type: "pass_window" });
    r.snap("encounter", go(s, idle, ["unless-instruction"]));
  },

  "9.8.3d.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const ashigaru = b.ice("ashigaru", "hq");
    const panic = b.root("panic-button", "hq", true);
    b.hq("hedge-fund", "hedge-fund", "hedge-fund");
    const corroder = b.rig("corroder");
    const gbahali = b.rig("gbahali");
    let s = go(run(b.s, "hq"), encounterOrOver);
    s = breakSubs(pump(s, corroder, 2), corroder, 3);
    r.fact("unbrokenSubs(Ashigaru)", unbroken(s, ashigaru), "break3");
    r.snap("break3", s);
    s = handOver(s);
    debug("panic:", what(s));
    s = raw(s, offered(s, "use_paid_ability", panic)[0]!);
    debug("after panic:", what(s));
    r.fact("subroutineCount(Ashigaru)", subCount(s, ashigaru), "panic");
    r.fact("unbrokenSubs(Ashigaru)", unbroken(s, ashigaru), "panic");
    r.snap("panic", s);
    if (!offered(s, "use_paid_ability", gbahali).length) s = handOver(s);
    debug("gbahali:", what(s));
    s = raw(s, offered(s, "use_paid_ability", gbahali)[0]!);
    r.fact("unbrokenSubs(Ashigaru)", unbroken(s, ashigaru), "gbahali");
    r.snap("gbahali", s);
    r.snap("run-over", go(s, idle));
  },

  "9.8.3d.ex2": (r) => {
    const b = new Board(r, "runner", 5);
    const ashigaru = b.ice("ashigaru", "hq");
    b.hq("hedge-fund", "hedge-fund", "hedge-fund");
    const corroder = b.rig("corroder");
    const shard = b.rig("utopia-shard");
    let s = go(run(b.s, "hq"), encounterOrOver);
    s = breakSubs(pump(s, corroder, 2), corroder, 1);
    r.fact("unbrokenSubs(Ashigaru)", unbroken(s, ashigaru), "break1");
    r.snap("break1", s);
    s = raw(s, offered(s, "use_paid_ability", shard)[0]!);
    debug("shard:", what(s), JSON.stringify(s.run?.encounter));
    r.fact("subroutineCount(Ashigaru)", subCount(s, ashigaru), "shard");
    r.fact("unbrokenSubs(Ashigaru)", unbroken(s, ashigaru), "shard");
    r.snap("shard", s);
    r.snap("run-over", go(s, idle));
  },

  "9.8.3e.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const brainstorm = b.ice("brainstorm", "hq");
    const marker = b.ice("marker", "hq");
    b.grip("sure-gamble", "sure-gamble");
    let s = go(run(b.s, "hq"), encounterOrOver);
    s = must(s, { type: "pass_window" });
    s = go(s, (x) => x.run?.encounter?.iceId !== marker);
    r.snap("marker", s);
    s = go(s, (x) => !x.run || x.run.encounter?.iceId === brainstorm);
    s = go(s, encounterOrOver);
    debug("brainstorm:", JSON.stringify(s.cards[brainstorm]!.subroutines));
    r.fact(
      "subroutineOrder(Brainstorm)",
      subSources(s, brainstorm),
      "brainstorm",
    );
    if (s.run) s = must(s, { type: "pass_window" });
    s = go(s, idle);
    r.fact("runner.coreDamage", s.runner.coreDamage ?? 0, "brainstorm");
    r.snap("brainstorm", s);
  },

  "9.8.6b.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const first = b.rig("grappling-hook");
    const second = b.rig("grappling-hook");
    const heimdall = b.ice("heimdall-1-0", "hq");
    b.hq("hedge-fund");
    b.grip("sure-gamble", "sure-gamble");
    let s = go(run(b.s, "hq"), encounterOrOver);
    debug("hook:", JSON.stringify(offered(s, "use_paid_ability", first)));
    s = raw(s, offered(s, "use_paid_ability", first)[0]!);
    debug("hook:", what(s));
    // The first Grappling Hook leaves 'Do 1 core damage.', the first subroutine.
    s = go(s, (x) => atEncounter(x) && !x.pendingChoice, ["0"]);
    r.fact("unbrokenSubs(Heimdall 1.0)", unbroken(s, heimdall), "first");
    r.snap("first", s);
    const again = offered(s, "use_paid_ability", second)[0];
    if (again) {
      s = raw(s, again);
      debug("hook 2:", what(s));
      const broken = optionIds(s).find((id) => /1$|2$/.test(id));
      r.fact("legal(choose-broken)", Boolean(broken), "second");
      s = go(s, (x) => (atEncounter(x) || !x.run) && !x.pendingChoice, [
        broken ?? "0",
      ]);
    } else {
      r.fact("legal(choose-broken)", false, "second");
    }
    r.fact("unbrokenSubs(Heimdall 1.0)", unbroken(s, heimdall), "second");
    r.snap("second", s);
    r.snap("run-over", go(s, idle));
  },

  "9.8.7c.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.ice("little-engine", "hq");
    let s = go(run(b.s, "hq"), encounterOrOver);
    s = must(s, { type: "pass_window" });
    r.snap("encounter", go(s, idle));
  },

  "9.8.9.ex1": (r) => {
    const b = new Board(r, "corp", 5);
    b.rig("tsakhia-bankhar-gantulga");
    b.rig("persephone");
    b.ice("bloop", "hq");
    b.grip("sure-gamble", "sure-gamble", "sure-gamble", "sure-gamble");
    let s = runnerTurnBegins(b.s, ["hq"]);
    s = go(run(s, "hq"), encounterOrOver);
    s = must(s, { type: "pass_window" });
    s = go(s, (x) => Boolean(x.pendingChoice) || !x.run, []);
    debug("persephone:", what(s));
    r.fact("runner.coreDamage", s.runner.coreDamage ?? 0, "bloop");
    r.snap("bloop", s);
    r.snap("pass", go(s, idle, ["accept"]));
  },

  "9.9.2.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const [event] = b.grip("process-automation");
    r.snap("play", go(must(b.s, { type: "play_event", cardId: event! }), idle));
  },

  "9.9.2.ex2": (r) => {
    const b = new Board(r, "runner", 5);
    b.ice("lockdown", "hq");
    b.hq("hedge-fund");
    const [event] = b.grip("process-automation");
    let s = go(run(b.s, "hq"), encounterOrOver);
    s = go(must(s, { type: "pass_window" }), idle);
    r.snap("lockdown", s);
    const can = offered(s, "play_event", event).length > 0;
    r.fact("legal(play)", can, "play");
    if (can) s = go(must(s, { type: "play_event", cardId: event! }), idle);
    r.snap("play", s);
  },

  "9.9.3d.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.rig("the-class-act");
    const [corroder] = stackTop(b, "corroder", "mimic");
    const draw = (s: GameState, label: string): GameState => {
      let asked = false;
      s = go(must(s, { type: "basic_draw" }), idle, [corroder!], (x) => {
        if (x.pendingChoice) {
          debug("class act:", what(x));
          asked = true;
        }
        return undefined;
      });
      r.fact("legal(class-act)", asked, label);
      return s;
    };
    let s = draw(b.s, "draw");
    r.fact("stackBottom", stackBottom(s), "draw");
    r.snap("draw", s);
    s = draw(s, "draw-again");
    r.snap("draw-again", s);
  },

  "9.9.4c.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const harbinger = b.rig("harbinger");
    const construct = b.rig("sacrificial-construct");
    b.ice("rototurret", "hq");
    let s = go(run(b.s, "hq"), encounterOrOver);
    s = must(s, { type: "pass_window" });
    s = go(
      s,
      (x) =>
        !x.run ||
        offered(x, "trigger_pending_trash_interrupt").length > 0 ||
        offered(x, "use_paid_ability", construct).length > 0 ||
        offered(x, "accept_installed_trash").length > 0,
      [harbinger],
      (x) =>
        x.pendingTrashProgram
          ? must(x, { type: "choose_trash_program", cardId: harbinger })
          : undefined,
    );
    debug("trash:", what(s), JSON.stringify(legalActions(s)));
    const prevent =
      offered(s, "trigger_pending_trash_interrupt", construct)[0] ??
      offered(s, "use_paid_ability", construct)[0];
    if (prevent) s = raw(s, prevent);
    debug("after construct:", what(s), JSON.stringify(legalActions(s)));
    r.fact(
      "legal(harbinger)",
      offered(s, "trigger_pending_trash_interrupt", harbinger).length > 0 ||
        offered(s, "use_paid_ability", harbinger).length > 0 ||
        hasOption(s, harbinger),
    );
    r.snap("trash", go(s, idle));
  },

  "9.9.4c.ex2": (r) => castingCallTags(r, "no-one-home"),
  "9.9.4d.ex1": (r) => castingCallTags(r, "decoy"),

  "9.9.5a.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const tori = b.root("tori-hanzo", "hq", true);
    const katana = b.ice("neural-katana", "hq");
    b.ice("tithe", "hq");
    const filter = b.rig("feedback-filter");
    b.grip("sure-gamble", "sure-gamble", "sure-gamble", "sure-gamble");
    let s = go(run(b.s, "hq"), encounterOrOver);
    s = must(s, { type: "pass_window" });
    let prevented = false;
    const again = passIceAgain();
    s = go(
      s,
      (x) =>
        !x.run ||
        again(x) ||
        (atEncounter(x) && x.run.encounter?.iceId === katana),
      ["decline"],
      (x) => {
        if (!x.pendingDamage || prevented) return undefined;
        debug("tithe damage:", what(x), JSON.stringify(legalActions(x)));
        prevented = true;
        const net = offered(x, "use_paid_ability", filter).find(
          (a) => !JSON.stringify(a).includes("core"),
        );
        return net ? raw(x, net) : undefined;
      },
    );
    r.snap("tithe", s);
    if (s.timingKey === "run.passIcePaw") {
      // The encounter with Neural Katana is never reached.
      r.fact("legal(tori)", PASS_ICE_AGAIN, "katana");
      r.fact("runner.coreDamage", PASS_ICE_AGAIN, "katana");
      r.snap("katana", s);
      return;
    }
    s = must(s, { type: "pass_window" });
    let toriOffered = false;
    s = go(s, idle, ["decline", "decline"], (x) => {
      if (!x.pendingDamage) return undefined;
      debug("katana damage:", what(x), JSON.stringify(legalActions(x)));
      if (offered(x, "use_paid_ability", tori).length > 0) toriOffered = true;
      return undefined;
    });
    r.fact("legal(tori)", toriOffered, "katana");
    r.fact("runner.coreDamage", s.runner.coreDamage ?? 0, "katana");
    r.snap("katana", s);
  },

  "9.9.6c.ex1": (r) => {
    const b = new Board(r, "runner", 3);
    b.rig("patchwork");
    const [gamble, mimic] = b.grip("sure-gamble", "mimic");
    const play = {
      type: "play_event",
      cardId: gamble!,
      trashGripForDiscountCardId: mimic!,
    } as const;
    const can = accepts(b.s, play);
    r.fact("legal(play)", can);
    r.snap("play", can ? go(must(b.s, play), idle) : b.s);
  },

  "9.9.7a.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.scored("corp", "the-cleaners");
    b.scored("corp", "the-cleaners");
    b.remote("mr-stone", true);
    b.ice("data-raven", "hq");
    const spoof = b.rig("biometric-spoofing");
    b.grip("sure-gamble", "sure-gamble", "sure-gamble");
    const prevent = using(spoof);
    const s = go(run(b.s, "hq"), encounterOrOver, ["tag", "tag"], (x) => {
      if (x.pendingDamage)
        debug("stone:", what(x), JSON.stringify(x.pendingDamage));
      return prevent(x);
    });
    r.snap("tag", s);
  },

  "9.9.7b.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.scored("corp", "the-cleaners");
    b.rig("chrome-parlor");
    const [eyes] = b.grip("net-ready-eyes");
    b.grip("sure-gamble", "sure-gamble", "sure-gamble");
    const s = go(take(b.s, "basic_install", eyes), idle, [], (x) => {
      if (x.pendingDamage)
        debug("eyes:", what(x), JSON.stringify(x.pendingDamage));
      return undefined;
    });
    r.snap("install", s);
  },

  "9.9.7d.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const [, remote] = b.remote("breached-dome");
    const spoof = b.rig("biometric-spoofing");
    b.grip("sure-gamble", "sure-gamble", "sure-gamble");
    stackTop(b, "corroder");
    r.snap("access", go(run(b.s, remote), idle, [], using(spoof)));
  },

  "9.9.7e.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.scored("corp", "the-cleaners");
    b.ice("flare", "hq");
    b.rig("guru-davinder");
    b.grip("sure-gamble", "sure-gamble", "sure-gamble", "sure-gamble");
    let s = go(run(b.s, "hq"), encounterOrOver);
    s = must(s, { type: "pass_window" });
    r.snap("flare", go(s, idle));
  },

  "9.9.7f.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.scored("corp", "the-cleaners");
    const [, remote] = b.remote("angelique-garza-correa", true);
    const carapace = b.rig("plascrete-carapace");
    b.card(carapace).powerCounters = 4;
    const guru = b.rig("guru-davinder");
    b.grip("sure-gamble", "sure-gamble", "sure-gamble");
    const plascrete = using(carapace, 2);
    let guruUsed = false;
    // If the engine asks about Guru Davinder's second ability, it is trashed.
    const s = go(run(b.s, remote), idle, ["pay", "trash"], (x) => {
      if (!x.pendingDamage) return undefined;
      debug("angelique:", what(x), JSON.stringify(x.pendingDamage));
      const first = plascrete(x);
      if (first) return first;
      const next =
        offered(x, "use_paid_ability", guru)[0] ??
        offered(x, "prevent_damage").find((a) =>
          JSON.stringify(a).includes(guru),
        );
      if (!next || guruUsed) return undefined;
      guruUsed = true;
      return raw(x, next);
    });
    debug("guru used:", guruUsed);
    r.snap("access", s);
  },

  "9.9.9a.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const puffer = b.rig("puffer");
    const geb = gebrselassieOn(b, puffer);
    const mimic = b.rig("mimic");
    b.ice("neural-katana", "hq");
    b.hq("hedge-fund");
    let s = go(run(b.s, "hq"), encounterOrOver);
    s = breakSubs(pump(s, puffer, 1), puffer, 1);
    s = go(s, idle);
    r.snap("run", s);
    s = go(take(s, "use_paid_ability", geb), idle, [mimic]);
    r.snap("move", s);
  },

  "9.9.9c.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.hq("project-vacheron");
    r.snap("steal", go(run(b.s, "hq"), idle));
  },

  "9.9.10.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const tori = b.root("tori-hanzo", "hq", true);
    b.ice("neural-katana", "hq");
    const filter = b.rig("feedback-filter");
    b.grip("sure-gamble", "sure-gamble", "sure-gamble", "sure-gamble");
    let s = go(run(b.s, "hq"), encounterOrOver);
    s = must(s, { type: "pass_window" });
    s = go(
      s,
      (x) => Boolean(x.pendingDamage) || Boolean(x.pendingChoice) || !x.run,
    );
    debug("katana:", what(s), JSON.stringify(legalActions(s)));
    // The Runner passes; the Corp uses Tori Hanzō however the engine offers it.
    for (let i = 0; i < 3 && s.run; i++) {
      const use = offered(s, "use_paid_ability", tori)[0];
      if (use) {
        s = raw(s, use);
        break;
      }
      const option = optionIds(s).find(
        (id) => id.includes(tori) || id.includes("tori") || id === "accept",
      );
      if (option) {
        s = raw(s, { type: "choose_option", optionId: option });
        break;
      }
      if (!offered(s, "pass_window").length) break;
      s = handOver(s);
      debug("handed over:", what(s), JSON.stringify(legalActions(s)));
    }
    debug("after tori:", what(s), JSON.stringify(legalActions(s)));
    const abilities = offered(s, "use_paid_ability", filter).map((a) =>
      JSON.stringify(a),
    );
    r.fact(
      "legal(prevent-net)",
      abilities.some((a) => a.includes("net")),
      "tori",
    );
    r.fact(
      "legal(prevent-core)",
      abilities.some((a) => a.includes("core")),
      "tori",
    );
    r.snap("tori", s);
    // Read as soon as the damage has resolved, before the run is played on.
    s = go(s, (x) => !x.pendingDamage && !x.pendingChoice, ["decline"]);
    r.fact("runner.coreDamage", s.runner.coreDamage ?? 0, "damage");
    r.snap("damage", s);
  },

  "9.9.11a.ex1": (r) => testing(r, "account-siphon", "hq", "Security Testing"),
  "9.9.11a.ex1#b": (r) => testing(r, "account-siphon", "hq", "Account Siphon"),
  "9.9.11a.ex2": (r) => testing(r, "showing-off", "rd", "Security Testing"),
  "9.9.11a.ex2#b": (r) => testing(r, "showing-off", "rd", "Showing Off"),

  "9.10.3a.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const pelangi = b.rig("pelangi");
    b.card(pelangi).virusCounters = 2;
    const mimic = b.rig("mimic");
    b.ice("ice-wall", "hq");
    b.hq("hedge-fund");
    let s = go(run(b.s, "hq"), encounterOrOver);
    s = go(
      take(s, "use_paid_ability", pelangi),
      (x) => !x.pendingChoice && encounterOrOver(x),
      ["pelangi:sentry"],
    );
    s = breakSubs(s, mimic, 1);
    r.snap("pelangi", s);
    s = go(s, (x) => !x.run || x.timingKey === "run.jackOutWindow");
    r.snap("passed", s);
    r.snap("run-over", go(s, idle));
  },

  "9.10.3b.ex1": (r) => {
    const b = new Board(r, "corp", 5);
    b.rig("security-testing");
    b.hq("hedge-fund");
    b.s.runner.credits = 5;
    let s = runnerTurnBegins(b.s, ["hq"]);
    s = corpTurnBegins(spendClicks(s), [], undefined, true);
    r.snap("turn-1", s);
    s = runnerTurnBegins(s, ["decline"]);
    const from = s.log.length;
    s = go(run(s, "hq"), idle);
    r.fact("accessedCount", accessedSince(s, from).length, "turn-2");
    r.snap("turn-2", s);
  },

  "9.10.3c.ex1": (r) => {
    const b = new Board(r, "runner", 14);
    const wall = b.ice("ice-wall", "hq");
    b.hq("hedge-fund");
    const [femme] = b.grip("femme-fatale");
    // Femme Fatale goes in through the engine so that Ice Wall is its chosen ice.
    let s = go(take(b.s, "basic_install", femme), idle, [wall]);
    s.runner.clicks = 4;
    s.runner.credits = 5;
    const oneRun = (x: GameState, label: string): GameState => {
      x = go(run(x, "hq"), (y) => Boolean(y.pendingChoice) || !y.run);
      const can = hasOption(x, "bypass");
      if (label === "second") r.fact("legal(bypass)", can, label);
      x = go(x, idle, can ? ["bypass"] : []);
      r.snap(label, x);
      return x;
    };
    s = oneRun(s, "first");
    oneRun(s, "second");
  },

  "9.10.5.ex1": (r) => {
    const b = new Board(r, "runner", 10);
    const breaker = b.rig("nanotk");
    gebrselassieOn(b, breaker);
    b.ice("vanilla", "hq");
    b.ice("ice-wall", "hq");
    b.ice("tithe", "hq");
    b.ice("enigma", "rd");
    let s = go(run(b.s, "hq"), encounterOrOver);
    s = pump(s, breaker, 1);
    r.snap("pump", s);
    s = breakSubs(s, breaker, 2);
    s = go(s, (x) => !x.run || x.timingKey === "run.jackOutWindow");
    s = go(must(s, { type: "jack_out" }), idle);
    r.snap("after-run", s);
    s = go(run(s, "rd"), (x) => x.timingKey === "run.approachPaw" || !x.run);
    r.snap("second-run", s);
  },

  "9.11.4b.ex1": (r) => {
    const b = new Board(r, "corp", 5);
    const [shipment, wall, vanilla, pad] = b.hq(
      "shipment-from-mirrormorph",
      "ice-wall",
      "vanilla",
      "pad-campaign",
    );
    let s = raw(b.s, { type: "play_operation", cardId: shipment! });
    let prompts = 0;
    let stopOffered = false;
    const installs = [
      `hq-ice:${wall}:hq`,
      `hq-ice:${vanilla}:hq`,
      `hq-root:${pad}:new`,
    ];
    s = go(s, idle, installs, (x) => {
      if (!x.pendingChoice) return undefined;
      prompts += 1;
      if (prompts === 3) stopOffered = hasOption(x, "done-hq-installs");
      return undefined;
    });
    r.fact("legal(stop-after-two)", stopOffered);
    r.snap("play", s);
  },

  "9.11.4c.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const [tinkering] = b.grip("tinkering");
    const wall = b.ice("ice-wall", "hq");
    let s = must(b.s, { type: "play_event", cardId: tinkering! });
    s = go(s, idle, [wall]);
    r.snap("play", s);
    r.snap("turn-ends", corpTurnBegins(s));
  },

  "9.11.4d.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.scored("corp", "personality-profiles");
    const djinn = b.rig("djinn");
    const [sucker] = b.stack("datasucker");
    b.grip("sure-gamble");
    const s = go(take(b.s, "use_paid_ability", djinn), idle, [sucker!]);
    r.snap("search", s);
  },

  "9.11.4e.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.ice("architect", "hq");
    b.hq("hedge-fund");
    const [, , pad] = b.rd("ice-wall", "enigma", "pad-campaign");
    let s = go(run(b.s, "hq"), encounterOrOver);
    s = must(s, { type: "pass_window" });
    s = go(s, (x) => Boolean(x.pendingChoice) || !x.run);
    debug("architect:", what(s));
    r.fact(
      "legal(install-nothing)",
      optionIds(s).some((id) => /decline|done|none/.test(id)),
      "first-sub",
    );
    s = go(
      s,
      (x) =>
        !x.run ||
        (Boolean(x.pendingChoice) &&
          !optionIds(x).some((i) => i.includes(pad!)) &&
          !optionIds(x).some((i) => /dest|server|remote|new/.test(i))),
      [pad!, "new"],
    );
    debug("architect second:", what(s));
    r.snap("first-sub", s);
    r.snap("run-over", go(s, idle, ["decline", "done"]));
  },

  "9.11.4g.ex1": (r) => dataRaven(r, "tag"),
  "9.11.4g.ex1#b": (r) => dataRaven(r, "end"),

  "9.12.1c.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.identity("corp", "chronos-protocol-selective-mind-mapping");
    b.rig("titanium-ribs");
    b.ice("tithe", "hq");
    const [, corroder] = b.grip("sure-gamble", "corroder");
    let s = go(run(b.s, "hq"), encounterOrOver);
    s = must(s, { type: "pass_window" });
    r.snap("damage", chosenDamage(r, s, corroder!, true));
  },

  "9.12.1c.ex1#b": (r) => {
    const b = new Board(r, "corp", 5);
    b.identity("corp", "chronos-protocol-selective-mind-mapping");
    b.rig("titanium-ribs");
    const [prana] = b.remote("prana-condenser", true);
    b.card(prana).powerCounters = 1;
    const [gamble] = b.grip("sure-gamble", "corroder");
    debug("prana:", JSON.stringify(offered(b.s, "use_paid_ability", prana)));
    const s = raw(b.s, offered(b.s, "use_paid_ability", prana)[0]!);
    debug("prana used:", what(s), JSON.stringify(s.pendingDamage));
    r.snap("damage", chosenDamage(r, s, gamble!, false));
  },

  "9.12.1e.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const goddess = b.ice("mother-goddess", "hq");
    const ansel = b.ice("ansel-1-0", "rd");
    b.remote("warden-fatuma", true);
    let s = hushOn(b, goddess);
    // The engine brings an ice's gained subroutines up to date when the ice
    // is encountered, so each count is read in an encounter with that ice.
    s = go(run(s, "hq"), encounterOrOver);
    r.fact("subroutineCount(Mother Goddess)", subCount(s, goddess));
    s = go(must(s, { type: "pass_window" }), idle);
    s = go(run(s, "rd"), encounterOrOver);
    r.fact("subroutineCount(Ansel 1.0)", subCount(s, ansel));
    r.snap("look", s);
  },

  "9.12.1e.ex2": (r) => {
    const b = new Board(r, "runner", 5);
    const magnet = b.ice("magnet", "hq");
    const wall = b.ice("ice-wall", "rd");
    let s = hushOn(b, magnet);
    const hush = b.report.ids.get("Hush")!;
    const move = offered(s, "use_paid_ability", hush)[0];
    r.fact("legal(hush-move)", Boolean(move));
    if (move) s = go(must(s, move), idle, [wall]);
    r.snap("move", s);
  },

  "9.12.2a.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const [, remote] = b.remote("hostile-infrastructure", true);
    b.root("warroid-tracker", remote, true);
    const mimic = b.rig("mimic");
    const corroder = b.rig("corroder");
    b.rig("cyberfeeder");
    const [event] = b.grip("singularity");
    b.grip("sure-gamble", "sure-gamble", "sure-gamble", "sure-gamble");
    const s = go(
      playRun(b.s, event!, remote),
      idle,
      [
        "singularity",
        "Hostile Infrastructure",
        "Hostile Infrastructure",
        "Warroid Tracker",
        mimic,
        corroder,
      ],
      (x) => {
        if (x.pendingChoice) debug("warroid:", what(x));
        return undefined;
      },
    );
    r.snap("singularity", s);
  },

  "9.12.2b.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.rig("the-class-act");
    const [ritual] = b.grip("ritual");
    const [corroder] = stackTop(b, "corroder", "mimic", "cyberfeeder", "decoy");
    let resolved = 0;
    const s = go(
      must(b.s, { type: "play_event", cardId: ritual! }),
      idle,
      [corroder!],
      (x) => {
        if (x.pendingChoice) {
          debug("class act:", what(x));
          resolved += 1;
        }
        return undefined;
      },
    );
    r.fact("classActResolved", resolved);
    r.snap("ritual", s);
  },

  "9.12.2b.ex2": (r) => {
    const b = new Board(r, "runner", 5);
    const [urtica, remote] = b.remote("urtica-cipher");
    b.card(urtica).advancementCounters = 3;
    const [prana] = b.remote("prana-condenser", true);
    b.grip(
      "sure-gamble",
      "sure-gamble",
      "sure-gamble",
      "sure-gamble",
      "sure-gamble",
    );
    const s = go(
      run(b.s, remote),
      idle,
      ["accept", "accept", "accept", "accept", "accept"],
      (x) => {
        if (!x.pendingDamage) return undefined;
        debug("urtica:", what(x), JSON.stringify(legalActions(x)));
        // The Corp uses Prāna Condenser every time the engine offers it.
        const use = offered(x, "use_paid_ability", prana)[0];
        return use ? raw(x, use) : undefined;
      },
    );
    r.snap("access", s);
  },

  "9.12.2b.ex3": (r) => {
    const b = new Board(r, "corp", 5);
    b.remote("nasx", true);
    const wall = b.ice("ice-wall", "hq");
    const enigma = b.ice("enigma", "rd");
    const [realloc] = b.hq("realloc");
    let s = raw(b.s, { type: "play_operation", cardId: realloc! });
    // Each time NASX asks, the Corp spends as much as the engine allows, up to 2.
    const spend = [
      "nasx-power:2",
      "nasx-power:1",
      "nasx-power:2",
      "nasx-power:1",
    ];
    s = go(s, idle, [wall, enigma, ...spend], (x) => {
      if (x.pendingChoice) debug("realloc:", what(x));
      return undefined;
    });
    r.snap("play", s);
  },

  "9.12.2d.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.ice("troll", "hq");
    b.hq("hedge-fund");
    const [forked] = b.grip("forked");
    const s = go(
      playRun(b.s, forked!, "hq"),
      (x) => !x.run || x.timingKey === "run.jackOutWindow" || atEncounter(x),
      ["click"],
    );
    debug("troll:", what(s));
    r.snap("troll", s);
    r.snap("run-over", go(s, idle));
  },

  "9.12.2e.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const [, remote] = b.remote("zato-city-grid", true);
    b.ice("surveyor", remote);
    const from = b.s.log.length;
    const s = go(run(b.s, remote), idle, ["zato:0"]);
    // The trace is over before the engine next stops: its base strength is
    // read from the engine's log of the trace being initiated.
    const line = s.log
      .slice(from)
      .map((l) => /^Trace initiated strength (-?\d+)/.exec(l))
      .find(Boolean);
    r.fact("traceBase", line ? Number(line[1]) : "no trace");
    r.snap("zato", s);
  },

  "9.12.2e.ex2": (r) => {
    const b = new Board(r, "runner", 5);
    const wall = b.ice("ice-wall", "hq");
    const surveyor = b.ice("surveyor", "hq");
    let s = hushOn(b, surveyor);
    r.snap("hushed", s);
    const hush = b.report.ids.get("Hush")!;
    s = go(take(s, "use_paid_ability", hush), idle, [wall]);
    r.snap("moved", s);
  },

  "9.12.3a.ex1": (r) => tourWithImp(r, true),
  "9.12.3a.ex1#b": (r) => tourWithImp(r, false),

  "9.12.3b.ex1": (r) => {
    const b = new Board(r, "runner", 3);
    const imp = b.rig("imp");
    b.card(imp).virusCounters = 2;
    b.rig("neutralize-all-threats");
    const [pad, remote] = b.remote("pad-campaign");
    let s = go(run(b.s, remote), (x) => offered(x, "access_card").length > 0);
    s = raw(s, { type: "access_card", cardId: pad });
    debug("neutralize:", what(s), JSON.stringify(legalActions(s)));
    r.fact("legal(decline)", offered(s, "finish_access").length > 0);
    r.fact("legal(imp)", offered(s, "access_trash_with_virus").length > 0);
    r.snap("access", go(s, idle));
  },

  "9.12.3c.ex1": (r) => {
    const b = new Board(r, "runner", 3);
    b.ice("fairchild-2-0", "hq");
    b.hq("hedge-fund");
    b.grip("sure-gamble", "sure-gamble", "sure-gamble");
    let s = go(run(b.s, "hq"), encounterOrOver);
    s = must(s, { type: "pass_window" });
    s = go(s, (x) => !x.run || x.timingKey === "run.jackOutWindow", [
      "pay",
      "pay",
    ]);
    r.fact("runner.coreDamage", s.runner.coreDamage ?? 0, "subs");
    r.snap("subs", s);
    r.snap("run-over", go(s, idle));
  },

  "9.12.3d.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.ice("data-raven", "hq");
    const decoy = b.rig("decoy");
    r.snap(
      "choice",
      // Asked a second time, the Runner takes the tag again.
      go(run(b.s, "hq"), encounterOrOver, ["tag", "tag"], using(decoy)),
    );
  },

  "9.12.3e.ex1": (r) => {
    const b = new Board(r, "corp", 5);
    b.rig("always-be-running");
    const [outage] = b.hq("service-outage");
    let s = go(take(b.s, "play_operation", outage), idle);
    s = runnerTurnBegins(s);
    s.runner.credits = 5;
    debug("outage:", JSON.stringify(legalActions(s)).slice(0, 600));
    r.fact("legal(gain-credit)", offered(s, "basic_gain_credit").length > 0);
    r.fact("legal(run)", offered(s, "basic_run").length > 0);
    if (offered(s, "basic_gain_credit").length) {
      s = go(must(s, { type: "basic_gain_credit" }), idle);
    }
    r.snap("first-click", s);
  },

  "9.12.3e.ex1#b": (r) => falseEcho(r, true),
  "9.12.3e.ex1#c": (r) => falseEcho(r, false),

  "9.12.5d.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const [takeover, remote] = b.remote("hostile-takeover");
    const amaze = b.root("amaze-amusements", remote, true);
    b.hq("market-research");
    b.rig("doppelganger");
    let s = go(run(b.s, remote), (x) => offered(x, "access_card").length > 0);
    s = raw(s, { type: "access_card", cardId: amaze });
    s = take(s, "trash_accessed", amaze);
    s = go(s, (x) => offered(x, "access_card").length > 0 || !x.run);
    if (s.run) s = raw(s, { type: "access_card", cardId: takeover });
    s = go(s, (x) => Boolean(x.pendingChoice) || idle(x));
    debug("run ends:", what(s), s.runner.tags);
    r.snap("first-run", s);
    s = go(s, idle, ["Doppelg", "accept", "hq", "accept"], (x) => {
      if (x.pendingChoice) debug("doppelganger:", what(x), x.runner.tags);
      return undefined;
    });
    // The engine does not stop between the end of the second run and the
    // pending ability from the first: both labels read the final state.
    r.snap("second-run", s);
    r.snap("resolved", s);
  },
};

/** Attini with nothing broken; the Runner pays for each subroutine if allowed. */
function attini(r: Report, threat: boolean): void {
  const b = new Board(r, "runner", 10);
  if (threat) b.scored("corp", "global-food-initiative");
  b.ice("attini", "hq");
  const caldera = b.rig("caldera");
  b.grip("sure-gamble", "sure-gamble", "sure-gamble", "sure-gamble");
  let pay = false;
  let prevent = false;
  let s = go(run(b.s, "hq"), encounterOrOver);
  s = must(s, { type: "pass_window" });
  s = go(
    s,
    (x) => !x.run || x.timingKey === "run.jackOutWindow",
    ["pay", "pay", "pay"],
    (x) => {
      if (x.pendingChoice && hasOption(x, "pay")) pay = true;
      if (x.pendingDamage) {
        debug("attini:", what(x));
        if (offered(x, "use_paid_ability", caldera).length > 0) prevent = true;
      }
      return undefined;
    },
  );
  r.fact("legal(pay-2)", pay);
  if (threat) r.fact("legal(caldera)", prevent);
  r.snap("subs", s);
}

/** Compile into Archives fetching Mayfly, then the two end-of-run abilities. */
function compileMayfly(r: Report, first: "compile" | "mayfly"): void {
  const b = new Board(r, "runner", 5);
  const [compile] = b.grip("compile");
  const [mayfly] = b.stack("mayfly");
  b.ice("ice-wall", "archives");
  let s = go(playRun(b.s, compile!, "archives"), encounterOrOver, [
    "accept",
    "yes",
    "stack",
    mayfly!,
  ]);
  s = breakSubs(s, mayfly!, 1);
  s = go(s, (x) => !x.run || Boolean(x.pendingChoice));
  r.snap("run", s);
  debug("end of run:", what(s));
  const order = Boolean(s.pendingChoice) && optionIds(s).length > 1;
  if (first === "compile") {
    r.fact("chooser(order)", order ? s.pendingChoice!.chooser : "nobody");
  }
  s = go(s, idle, [first === "compile" ? "compile-first" : "trash-first"]);
  if (first === "compile") r.fact("stackBottom", stackBottom(s));
  r.snap("end", s);
}

/** Neural Katana's 3 net damage into a grip holding I've Had Worse. */
function worse(r: Report, skorpios: boolean): void {
  const b = new Board(r, "runner", 5);
  if (skorpios) {
    b.identity("corp", "skorpios-defense-systems-persuasive-power");
  }
  b.ice("neural-katana", "hq");
  const [ihw] = b.grip("ive-had-worse");
  b.grip("sure-gamble", "sure-gamble");
  let s = go(run(b.s, "hq"), encounterOrOver);
  s = must(s, { type: "pass_window" });
  s = go(s, (x) => idle(x) || Boolean(x.done), [
    `skorpios-rfg:${ihw}`,
    "skorpios-heap",
    "skorpios-heap",
  ]);
  if (skorpios) r.fact("winner", s.winner ?? "none");
  r.snap("damage", s);
}

/**
 * For each subroutine on the ice, in the engine's order, the card it came
 * from: the ice itself for a printed one, else the card whose title the
 * engine's record of the subroutine names.
 */
function subSources(s: GameState, iceId: string): string[] {
  const ice = s.cards[iceId]!;
  const titles = Object.values(s.cards)
    .map((c) => c.title)
    .filter((t) => t !== ice.title);
  return (ice.subroutines ?? []).map((sub) => {
    const record = JSON.stringify(sub).toLowerCase();
    const from = titles.find(
      (t) =>
        record.includes(t.toLowerCase()) ||
        record.includes(t.toLowerCase().replace(/[^a-z0-9]+/g, "-")),
    );
    return from ?? ice.title;
  });
}

/** The Supplier and Underworld Contact at the start of the Runner's turn. */
function supplier(r: Report, supplierFirst: boolean): void {
  const b = new Board(r, "runner", 5);
  b.identity("runner", "armand-geist-walker-tech-lord");
  const contact = b.rig("underworld-contact");
  const sup = b.rig("the-supplier");
  const [chip] = b.grip("dyson-mem-chip");
  // Dyson Mem Chip goes onto The Supplier through its own ability.
  let s = go(take(b.s, "use_paid_ability", sup), idle, [chip!]);
  s = corpTurnBegins(s);
  s.runner.credits = 5;
  let chooser = "nobody";
  const order = supplierFirst
    ? ["The Supplier", "Underworld Contact"]
    : ["Underworld Contact", "The Supplier"];
  s = runnerTurnBegins(s, [order[0]!, order[1]!, chip!, "accept"], (x) => {
    if (!x.pendingChoice) return undefined;
    debug("turn begins:", what(x), contact);
    if (optionIds(x).every((i) => i.startsWith("trigger:"))) {
      chooser = x.pendingChoice.chooser;
    }
    return undefined;
  });
  if (supplierFirst) r.fact("chooser(order)", chooser);
  r.snap("turn-begins", s);
}

/** Aesop's Pawnshop and Drug Dealer at the start of the Runner's turn. */
function pawnshop(r: Report, pawnshopFirst: boolean): void {
  const b = new Board(r, "corp", 5);
  const shop = b.rig("aesops-pawnshop");
  const dealer = b.rig("drug-dealer");
  b.s.runner.credits = 5;
  const order = pawnshopFirst
    ? ["Pawnshop", "Drug Dealer"]
    : ["Drug Dealer", "Pawnshop"];
  const s = runnerTurnBegins(
    b.s,
    [order[0]!, order[1]!, "trash", dealer],
    (x) => {
      if (x.pendingChoice) debug("turn begins:", what(x), shop);
      return undefined;
    },
  );
  r.snap("turn-begins", s);
}

/** 24/7 News Cycle forfeiting one of the two scored agendas. */
function newsCycle(r: Report, forfeit: string, tags: number): void {
  const b = new Board(r, "corp", 5);
  const astro = b.scored("corp", "astroscript-pilot-program");
  b.card(astro).agendaCounters = 1;
  const research = b.scored("corp", "market-research");
  const [news] = b.hq("24-7-news-cycle");
  b.s.runner.tags = tags;
  const lost = forfeit === "market-research" ? research : astro;
  const kept = forfeit === "market-research" ? astro : research;
  debug("news:", JSON.stringify(offered(b.s, "play_operation", news)));
  let s = raw(b.s, { type: "play_operation", cardId: news! });
  debug("news:", what(s));
  s = go(s, idle, [lost, kept, "accept"]);
  r.snap("play", s);
}

/** Oppo Research on the Corp's turn after the Runner's turn. */
function oppo(r: Report, trashedLastTurn: boolean, threat: boolean): void {
  const b = new Board(r, "runner", 5);
  if (threat) b.scored("corp", "global-food-initiative");
  const [pad, remote] = b.remote("pad-campaign");
  const [research] = b.hq("oppo-research");
  let s = b.s;
  if (trashedLastTurn) {
    s = go(run(s, remote), (x) => offered(x, "trash_accessed").length > 0);
    s = go(take(s, "trash_accessed", pad), idle);
  }
  s = corpTurnBegins(s);
  s.corp.credits = threat ? 10 : 5;
  const can = offered(s, "play_operation", research).length > 0;
  if (!threat) r.fact("legal(play)", can);
  if (can) {
    s = raw(s, { type: "play_operation", cardId: research! });
    debug("oppo:", what(s));
    s = go(s, (x) => !x.pendingChoice && (atAction(x) || Boolean(x.done)), [
      threat ? "pay" : "decline",
      "accept",
    ]);
    debug("after oppo:", s.activeSide, s.timingKey, s.corp.clicks);
    r.fact(
      "actionPhaseOver",
      s.activeSide !== "corp" || s.timingKey !== "corp.takeAction",
    );
  }
  r.snap("play", s);
}

/** Lancelot with Sub Boost; the Corp reveals Merlin and places its subroutine. */
function lancelot(r: Report, place: "first" | "last"): void {
  const b = new Board(r, "corp", 5);
  const lance = b.ice("lancelot", "hq");
  const [boost] = b.hq("sub-boost");
  // Sub Boost goes in through the engine so that it is hosted as a condition counter.
  let s = go(take(b.s, "play_operation", boost), idle, [lance]);
  b.s = s;
  const [merlin] = b.hq("merlin");
  b.grip("sure-gamble", "sure-gamble", "sure-gamble", "sure-gamble");
  s = runnerTurnBegins(b.s);
  // The three places the engine offers for the new subroutine, by option id.
  const places = {
    first: "grail-at:0",
    between: "grail-at:1",
    last: "grail-at:2",
  };
  let chooser = "nobody";
  let seen: string[] = [];
  s = go(run(s, "hq"), encounterOrOver, [merlin!, places[place]], (x) => {
    if (!x.pendingChoice || !hasOption(x, "grail-at")) return undefined;
    chooser = x.pendingChoice.chooser;
    seen = optionIds(x);
    return undefined;
  });
  debug("lancelot subs:", JSON.stringify(s.cards[lance]!.subroutines));
  if (place === "last") {
    r.fact("chooser(order)", chooser);
    r.fact("legal(place-first)", seen.includes(places.first));
    r.fact("legal(place-between)", seen.includes(places.between));
    r.fact("legal(place-last)", seen.includes(places.last));
  }
  if (s.run) s = must(s, { type: "pass_window" });
  r.snap("encounter", go(s, idle));
}

/** Put cards on top of the stack, the first one on top. */
function stackTop(b: Board, ...defIds: string[]): string[] {
  const ids = b.stack(...defIds);
  b.s.runner.deck = [
    ...ids,
    ...b.s.runner.deck.filter((id) => !ids.includes(id)),
  ];
  return ids;
}

/** Hush goes onto the ice through a basic install; the click and credit are given back. */
function hushOn(b: Board, iceId: string): GameState {
  const [hush] = b.grip("hush");
  const s = go(
    take(b.s, "basic_install", hush, (a) => JSON.stringify(a).includes(iceId)),
    idle,
    [iceId],
  );
  s.runner.clicks = 4;
  s.runner.credits = 5;
  b.s = s;
  return s;
}

/**
 * Casting Call's 2 tags on access, with Decoy and Thunder Art Gallery
 * installed and one card in the grip to install with the gallery.
 */
function castingCallTags(r: Report, inGrip: "no-one-home" | "decoy"): void {
  const b = new Board(r, "corp", 5);
  const decoy = b.rig("decoy");
  b.rig("thunder-art-gallery");
  const [second] = b.grip(inGrip);
  const [call, agenda] = b.hq("casting-call", "hostile-takeover");
  // Casting Call goes in through the engine so that it is hosted as the
  // condition counter the card describes.
  let s = go(take(b.s, "play_operation", call), idle, [agenda!]);
  s = runnerTurnBegins(s);
  s.runner.credits = 5;
  const server = /^server:(.+):root$/.exec(s.cards[agenda!]!.zone)?.[1];
  let usedFirst = false;
  let secondOffered = false;
  s = go(run(s, server!), idle, [second!, "accept"], (x) => {
    if (!x.pendingTags) return undefined;
    debug("tags:", what(x), JSON.stringify(legalActions(x)));
    if (!usedFirst) {
      const use = offered(x, "use_paid_ability", decoy)[0];
      if (!use) return undefined;
      usedFirst = true;
      return raw(x, use);
    }
    if (x.pendingChoice) return undefined;
    const again =
      offered(x, "use_paid_ability", second)[0] ??
      legalActions(x).find(
        (a) => a.type !== "accept_tags" && JSON.stringify(a).includes(second!),
      );
    if (!again || secondOffered) return undefined;
    secondOffered = true;
    return raw(x, again);
  });
  r.fact(
    inGrip === "decoy" ? "legal(second-decoy)" : "legal(no-one-home)",
    secondOffered,
  );
  r.snap("tags", s);
}

/**
 * Security Testing with its server chosen as the turn began, then a run
 * event whose replacement effect meets Security Testing's.
 */
function testing(
  r: Report,
  eventDef: string,
  server: string,
  first: string,
): void {
  const b = new Board(r, "corp", 5);
  b.rig("security-testing");
  const [event] = b.grip(eventDef);
  if (server === "hq") b.hq("hedge-fund");
  let s = runnerTurnBegins(b.s, [`server:${server}`]);
  s.runner.credits = 5;
  s.corp.credits = 5;
  const from = s.log.length;
  let chooser = "nobody";
  s = go(
    playRun(s, event!, server),
    idle,
    [first, "5", "accept", "siphon"],
    (x) => {
      if (!x.pendingChoice) return undefined;
      debug("replace:", what(x));
      const labels = x.pendingChoice.options
        .map((o) => o.label ?? "")
        .join("|");
      if (labels.includes("Security Testing"))
        chooser = x.pendingChoice.chooser;
      return undefined;
    },
  );
  if (eventDef === "account-siphon" && first === "Security Testing") {
    r.fact("chooser(order)", chooser);
  }
  r.fact("accessed", accessedSince(s, from));
  r.snap(eventDef === "account-siphon" ? "siphon" : "run", s);
}

/** Data Raven's choice on encounter. */
function dataRaven(r: Report, choose: "tag" | "end"): void {
  const b = new Board(r, "runner", 5);
  b.ice("data-raven", "hq");
  let chooser = "nobody";
  const answer = choose === "tag" ? "unless-pay" : "unless-instruction";
  const s = go(run(b.s, "hq"), encounterOrOver, [answer], (x) => {
    if (x.pendingChoice) {
      debug("raven:", what(x));
      chooser = x.pendingChoice.chooser;
    }
    return undefined;
  });
  if (choose === "tag") r.fact("chooser(tag-or-end)", chooser);
  r.snap("choice", s);
}

/**
 * 1 net damage with Chronos Protocol and Titanium Ribs both active: who is
 * asked to choose the trashed card, and whether the Corp is shown the grip
 * while the choice is open.
 */
function chosenDamage(
  r: Report,
  s: GameState,
  cardId: string,
  runnersTurn: boolean,
): GameState {
  let chooser = "nobody";
  let shown = false;
  s = go(
    s,
    (x) =>
      !x.pendingChoice &&
      !x.pendingDamage &&
      (idle(x) || x.timingKey === "run.jackOutWindow" || !runnersTurn),
    [cardId],
    (x) => {
      if (!x.pendingChoice || !hasOption(x, cardId)) return undefined;
      chooser = x.pendingChoice.chooser;
      // The Corp is shown the grip when its own view of the game, the one a
      // host hands that seat, names every card in it.
      const view = JSON.stringify(getPublicView(x, "corp"));
      shown = x.runner.hand.every((id) => view.includes(x.cards[id]!.title));
      debug("damage choice:", what(x), "corp sees the grip:", shown);
      return undefined;
    },
  );
  r.fact("chooser(trashed-card)", chooser);
  if (runnersTurn) r.fact("corpLooksAtGrip", shown);
  return s;
}

/** Mumbad Virtual Tour accessed with Imp, Scrubber and 4 credits. */
function tourWithImp(r: Report, useImp: boolean): void {
  const b = new Board(r, "runner", 4);
  const imp = b.rig("imp");
  b.card(imp).virusCounters = 2;
  const scrubber = b.rig("scrubber");
  b.card(scrubber).recurringCredits = 2;
  const [tour, remote] = b.remote("mumbad-virtual-tour", true);
  let s = go(run(b.s, remote), (x) => offered(x, "access_card").length > 0);
  s = raw(s, { type: "access_card", cardId: tour });
  debug("tour:", what(s), JSON.stringify(legalActions(s)));
  if (useImp) {
    r.fact(
      "legal(decline)",
      offered(s, "finish_access").length > 0 || hasOption(s, "decline"),
    );
    r.fact("legal(imp)", hasOption(s, "must-trash:imp"));
    r.fact("legal(pay-with-scrubber)", hasOption(s, "must-trash:pay"));
  }
  s = go(s, idle, [useImp ? "must-trash:imp" : "must-trash:pay"]);
  if (!useImp) {
    r.fact(
      "poolPlusScrubber",
      s.runner.credits + (s.cards[scrubber]?.recurringCredits ?? 0),
    );
  }
  r.snap("access", s);
}

/** False Echo trashed as the Runner passes an unrezzed Archer. */
function falseEcho(r: Report, rez: boolean): void {
  const b = new Board(r, "runner", 5);
  b.rig("false-echo");
  const archer = b.ice("archer", "hq", false);
  const takeover = b.scored("corp", "hostile-takeover");
  let s = go(run(b.s, "hq"), (x) => Boolean(x.pendingChoice) || !x.run);
  debug("false echo:", what(s));
  s = go(
    s,
    (x) =>
      (Boolean(x.pendingChoice) && x.pendingChoice!.chooser === "corp") ||
      !x.run,
    ["trash"],
  );
  debug("corp choice:", what(s), JSON.stringify(s.pendingChoice?.options));
  if (rez) {
    const ids = optionIds(s);
    r.fact(
      "legal(add-to-hq)",
      ids.some((id) => /hq|hand|add/.test(id)),
    );
    r.fact(
      "legal(rez-without-forfeit)",
      ids.some((id) => /rez/.test(id) && /no-forfeit|without|decline/.test(id)),
    );
  }
  s = go(s, (x) => !x.pendingChoice, rez ? ["rez", takeover] : ["hq"]);
  debug("after:", what(s), archer);
  r.snap("pass", s);
}
