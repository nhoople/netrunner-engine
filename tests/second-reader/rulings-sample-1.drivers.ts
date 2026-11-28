/**
 * Second reader, batch 2 (a sample of the official rulings): one driver per
 * case in `rulings-sample-1.json`. A driver builds the position, plays the
 * listed steps and reports. It does not say what should happen.
 *
 * Not a test file: vitest only runs `*.test.ts`.
 */
import { cloneState, legalActions } from "../../src/index.js";
import type { GameState } from "../../src/index.js";
import { currentMark } from "../../src/state/keywordsAndCredits/keywords.js";
import { must, optionIds, pick } from "../rulings/rulings-helpers.js";
import { accepts, Board, hasOption, offered, take } from "./harness.js";
import type { Report } from "./harness.js";
import {
  accessedSince,
  atAction,
  atEncounter,
  breakSubs,
  corpTurnBegins,
  corpWindow,
  debug,
  encounterOrOver,
  go,
  handOver,
  idle,
  playRun,
  psi,
  raw,
  run,
  runnerTurnBegins,
  spendClicks,
  what,
} from "./driving.js";
import type { Driver } from "./driving.js";
const CENTRALS = ["hq", "rd", "archives"];

const mark = (s: GameState): string | null => currentMark(s);

/**
 * Whether the engine shuffled between two states: a shuffle draws from the
 * game's random stream, and nothing else in these steps does.
 */
const shuffledSince = (before: number | undefined, s: GameState): boolean =>
  s.rngState !== before;

/** An ability of a card whose id contains `part`, if the engine offers it. */
const ability = (s: GameState, cardId: string, part = "") =>
  offered(s, "use_paid_ability", cardId).find((a) =>
    JSON.stringify(a).includes(part),
  );

/** One rezzed copy of an ice on each central server. */
function iceOnCentrals(b: Board, defId: string): void {
  for (const server of CENTRALS) b.ice(defId, server);
}

/** Backstitching's bypass, if the engine offers it now. */
const bypass = (s: GameState) =>
  legalActions(s).find(
    (a) =>
      a.type === "use_paid_ability" &&
      JSON.stringify(a).includes("backstitching-bypass"),
  );
const bypassOpen = (s: GameState): boolean => Boolean(bypass(s));

/** Inside Job into a server whose only ice has an encounter ability. */
function insideJob(r: Report, iceDef: string, remote: boolean): void {
  const b = new Board(r, "runner", 5);
  const [event] = b.grip("inside-job");
  let server = "hq";
  if (remote) [, server] = b.remote("pad-campaign");
  else b.hq("hedge-fund");
  b.ice(iceDef, server);
  const from = b.s.log.length;
  const s = go(playRun(b.s, event!, server), idle);
  if (remote) r.fact("accessed", accessedSince(s, from));
  r.snap("run", s);
}

/** Seamless Launch on one card; the Corp's identity may be set first. */
function seamless(
  r: Report,
  build: (b: Board) => string,
  identity?: string,
): void {
  const b = new Board(r, "corp", 5);
  if (identity) b.identity("corp", identity);
  const target = build(b);
  const [launch] = b.hq("seamless-launch");
  const can = offered(b.s, "play_operation", launch).length > 0;
  let s = b.s;
  let chosen = false;
  if (can) {
    s = raw(s, { type: "play_operation", cardId: launch! });
    debug("seamless:", what(s));
    chosen = hasOption(s, target);
    if (chosen) s = go(s, idle, [target]);
    else if (!s.pendingChoice) s = go(s, idle);
  }
  // Playable only if the engine offers the named card as the target.
  r.fact("legal(play)", can && chosen);
  r.snap("play", s);
}

/** Spin Doctor's remove-from-game ability with R&D of a given size. */
function spinDoctor(r: Report, archives: boolean, rdCards?: number): void {
  const b = new Board(r, "corp", 5);
  const [doctor] = b.remote("spin-doctor", true);
  if (archives) b.archives("hedge-fund");
  if (rdCards !== undefined) {
    for (const id of b.s.corp.deck) delete b.s.cards[id];
    b.s.corp.deck = [];
    b.rd(...Array.from({ length: rdCards }, () => "pad-campaign"));
  }
  const before = b.s.rngState;
  const use = ability(corpWindow(b.s), doctor);
  r.fact("legal(use)", Boolean(use));
  let s = b.s;
  if (use) {
    s = raw(s, use);
    debug("spin doctor:", what(s));
    s = go(s, (x) => !x.pendingChoice, ["choose-cards-done", "done", "none"]);
  }
  if (rdCards === undefined) r.fact("rdShuffled", shuffledSince(before, s));
  r.snap("use", s);
}

/**
 * Pinhole Threading into HQ, then Ganked! in a remote server forces an
 * encounter with `iceId`, which protects that server.
 */
function pinholeGanked(
  b: Board,
  iceId: string,
  ganked: string,
  hqBreaker?: string,
): GameState {
  const [pinhole] = b.grip("pinhole-threading");
  let s = go(playRun(b.s, pinhole!, "hq"), (x) => atEncounter(x) || !x.run, [
    "pinhole",
    ganked,
    "trash-encounter",
    iceId,
  ]);
  if (hqBreaker && atEncounter(s)) {
    s = breakSubs(s, hqBreaker, 2);
    s = go(must(s, { type: "pass_window" }), (x) => atEncounter(x) || !x.run, [
      "pinhole",
      ganked,
      iceId,
      "trash-encounter",
    ]);
  }
  return s;
}

export const drivers: Record<string, Driver> = {
  "algernon#1": (r) => {
    const b = new Board(r, "corp", 5);
    const algernon = b.rig("algernon");
    b.rig("dr-lovegood");
    b.s.runner.credits = 5;
    const s = runnerTurnBegins(b.s, [
      "Algernon",
      "pay-click",
      `love:${algernon}`,
    ]);
    r.snap("begin", s);
    r.snap("end", corpTurnBegins(spendClicks(s)));
  },

  "archer#1": (r) => {
    const b = new Board(r, "corp", 5);
    const [message] = b.remote("send-a-message");
    b.card(message).advancementCounters = 5;
    const archer = b.ice("archer", "hq", false);
    let s = take(corpWindow(b.s), "score_agenda", message);
    s = go(s, idle, ["accept", archer]);
    r.snap("score", s);
  },

  "archer#2": (r) => {
    const b = new Board(r, "runner", 5);
    const trust = b.scored("corp", "braintrust");
    b.card(trust).agendaCounters = 1;
    const archer = b.ice("archer", "hq", false);
    let s = go(run(b.s, "hq"), (x) => x.timingKey === "run.approachPaw");
    if (!offered(s, "rez_ice", archer).length) s = handOver(s);
    debug("archer:", JSON.stringify(offered(s, "rez_ice", archer)), what(s));
    const rez =
      offered(s, "rez_ice", archer).find((a) =>
        JSON.stringify(a).includes(trust),
      ) ?? offered(s, "rez_ice", archer)[0];
    if (rez) s = go(raw(s, rez), (x) => !x.pendingChoice, [trust]);
    r.snap("rez", s);
  },

  "backstitching#1": (r) => {
    const b = new Board(r, "corp", 5);
    const stitch = b.rig("backstitching");
    iceOnCentrals(b, "ice-wall");
    let s = runnerTurnBegins(b.s);
    const first = mark(s);
    debug("mark:", first);
    r.fact("hasMark", first !== null, "begin");
    r.snap("begin", s);
    s = go(run(s, first ?? "hq"), encounterOrOver);
    debug("backstitching:", what(s), stitch);
    if (bypassOpen(s)) s = raw(s, bypass(s)!);
    r.fact("markKept", mark(s) !== null && mark(s) === first, "bypass");
    r.snap("bypass", s);
  },

  "backstitching#2": (r) => {
    const b = new Board(r, "runner", 5);
    const [stitch] = b.grip("backstitching");
    iceOnCentrals(b, "ice-wall");
    let s = go(take(b.s, "basic_install", stitch), idle);
    r.fact("hasMark", mark(s) !== null, "install");
    r.snap("install", s);
    s = go(run(s, "hq"), encounterOrOver);
    debug("backstitching:", what(s));
    r.fact("legal(bypass)", bypassOpen(s), "run");
    r.snap("run", s);
  },

  "backstitching#3": (r) => {
    const b = new Board(r, "corp", 5);
    b.rig("backstitching");
    b.rig("backstitching");
    iceOnCentrals(b, "ice-wall");
    const from = b.s.log.length;
    let s = runnerTurnBegins(b.s, ["Backstitching", "Backstitching"]);
    r.fact("hasMark", mark(s) !== null, "begin");
    // The engine logs each instruction to identify the mark; one that finds
    // a mark already identified this turn says "already".
    const lines = s.log.slice(from).filter((l) => /identify mark/i.test(l));
    debug("mark log:", JSON.stringify(lines));
    const repeats = lines.filter((l) => /already/.test(l)).length;
    r.fact(
      "marksIdentified",
      mark(s) === null ? 0 : lines.length - repeats || 1,
      "begin",
    );
    r.snap("begin", s);
    s = go(run(s, mark(s) ?? "hq"), encounterOrOver);
    r.fact("legal(bypass)", bypassOpen(s), "run");
    r.snap("run", s);
  },

  "backstitching#4": (r) => {
    const b = new Board(r, "corp", 5);
    b.rig("backstitching");
    iceOnCentrals(b, "konjin");
    const [, remote] = b.remote("pad-campaign");
    const wall = b.ice("ice-wall", remote);
    b.s.runner.credits = 5;
    let s = runnerTurnBegins(b.s);
    s.corp.credits = 5;
    // Backstitching is not used on Konjin itself.
    s = go(run(s, mark(s) ?? "hq"), (x) => Boolean(x.psi) || !x.run);
    debug("psi:", what(s), Boolean(s.psi));
    s = psi(s, 0, 1);
    s = go(
      s,
      (x) => !x.run || (x.run.encounter?.iceId === wall && atEncounter(x)),
      [wall],
    );
    debug("konjin:", what(s), s.run?.encounter?.iceId);
    const enc = s.run?.encounter?.iceId;
    r.fact("encountering", enc ? s.cards[enc]!.title : "none", "konjin");
    r.fact("legal(bypass)", bypassOpen(s), "konjin");
    r.snap("konjin", s);
    if (bypassOpen(s)) s = raw(s, bypass(s)!);
    r.snap("bypass", s);
  },

  "botulus#1": (r) => {
    const b = new Board(r, "runner", 7);
    const engine = b.ice("little-engine", "hq");
    b.hq("hedge-fund");
    const [botulus] = b.grip("botulus");
    // Botulus goes onto the ice through a basic install.
    let s = go(
      take(b.s, "basic_install", botulus, (a) =>
        JSON.stringify(a).includes(engine),
      ),
      idle,
      [engine],
    );
    s.cards[botulus!]!.virusCounters = 2;
    s.runner.clicks = 4;
    s.runner.credits = 5;
    s = go(run(s, "hq"), encounterOrOver);
    debug("botulus:", JSON.stringify(legalActions(s)));
    let broke = 0;
    for (let i = 0; i < 2; i++) {
      const use = ability(s, botulus!);
      if (!use) break;
      s = go(raw(s, use), (x) => !x.pendingChoice, ["0", "1"]);
      broke += 1;
    }
    r.fact("legal(break)", broke > 0, "break");
    s = go(
      must(s, { type: "pass_window" }),
      (x) => !x.run || x.timingKey === "run.jackOutWindow",
    );
    r.snap("break", s);
    r.snap("run-over", go(s, idle));
  },

  "botulus#2": (r) => {
    const b = new Board(r, "runner", 5);
    const wall = b.ice("ice-wall", "hq");
    const [botulus] = b.grip("botulus");
    let s = go(take(b.s, "basic_install", botulus), idle, [wall]);
    s = corpTurnBegins(s);
    b.s = s;
    const [vanilla] = b.hq("vanilla");
    const install = {
      type: "basic_install",
      cardId: vanilla!,
      destination: { kind: "protect", serverId: "hq" },
      trashFirstIds: [wall],
    } as never;
    debug(
      "install:",
      JSON.stringify(offered(b.s, "basic_install", vanilla)).slice(0, 400),
    );
    if (accepts(b.s, install)) s = go(must(b.s, install), idle);
    else {
      const first = offered(b.s, "basic_install", vanilla).find((a) =>
        JSON.stringify(a).includes('"hq"'),
      )!;
      s = raw(b.s, { ...first, trashFirst: true } as never);
      debug("trash first:", what(s));
      s = go(s, idle, [wall, "done"]);
    }
    r.snap("install", s);
  },

  "botulus#2-b": (r) => {
    const b = new Board(r, "runner", 5);
    const wall = b.ice("ice-wall", "hq");
    const enigma = b.ice("enigma", "rd");
    const [botulus] = b.grip("botulus");
    let s = go(
      take(b.s, "basic_install", botulus, (a) =>
        JSON.stringify(a).includes(wall),
      ),
      idle,
      [wall],
    );
    s = corpTurnBegins(s);
    b.s = s;
    const [realloc] = b.hq("realloc");
    s = raw(b.s, { type: "play_operation", cardId: realloc! });
    r.snap("derez", go(s, idle, [wall, enigma, "decline", "decline"]));
  },

  "cezve#1": (r) => {
    const b = new Board(r, "runner", 1);
    const cezve = b.rig("cezve");
    b.card(cezve).recurringCredits = 2;
    b.rig("masterwork-v37");
    const [feeder] = b.grip("cyberfeeder");
    b.hq("hedge-fund");
    let asked = false;
    const s = go(
      run(b.s, "hq"),
      (x) => idle(x),
      [feeder!, "accept", cezve, "decline"],
      (x) => {
        if (x.pendingChoice && hasOption(x, feeder!)) {
          debug("masterwork:", what(x));
          asked = true;
        }
        return undefined;
      },
    );
    r.fact("legal(install)", asked);
    r.snap("run", s);
  },

  "cezve#2": (r) => {
    const b = new Board(r, "runner", 0);
    const cezve = b.rig("cezve");
    b.card(cezve).recurringCredits = 2;
    b.rig("mimic");
    b.rig("corroder");
    const sucker = b.rig("datasucker");
    const [ultra] = b.heap("mkultra");
    b.ice("neural-katana", "hq");
    b.grip("sure-gamble", "sure-gamble", "sure-gamble");
    let s = go(run(b.s, "hq"), (x) => Boolean(x.pendingChoice) || !x.run);
    debug("mkultra:", what(s));
    // Each way is tried on a copy: install, then trash the named program.
    // If the engine never asks which program to trash, neither way exists
    // and both facts read false.
    const trashing = (x: GameState, victim: string): GameState | undefined => {
      try {
        let y = go(
          cloneState(x),
          (z) => Boolean(z.pendingChoice) && hasOption(z, victim),
          ["install", ultra!],
        );
        y = go(y, (z) => !z.pendingChoice || !hasOption(z, victim), [victim]);
        return y;
      } catch (error) {
        debug("mkultra:", (error as Error).message.slice(0, 200));
        return undefined;
      }
    };
    const viaCezve = trashing(s, cezve);
    r.fact(
      "legal(install-trashing-cezve)",
      Boolean(viaCezve) && viaCezve!.cards[ultra!]!.zone === "runner:installed",
    );
    const viaSucker = trashing(s, sucker);
    r.fact(
      "legal(install-trashing-datasucker)",
      Boolean(viaSucker) &&
        viaSucker!.cards[ultra!]!.zone === "runner:installed",
    );
    // With no way to install it, the Runner's attempt is played out as it falls.
    s = viaSucker ?? go(s, idle, ["install"]);
    r.snap("encounter", s);
  },

  "cookbook#1": (r) => cookbook(r, true),
  "cookbook#1-b": (r) => cookbook(r, false),

  "district-99#1": (r) => {
    const b = new Board(r, "runner", 5);
    b.rig("district-99");
    b.ice("tithe", "hq");
    b.grip("corroder");
    let s = go(run(b.s, "hq"), encounterOrOver);
    s = must(s, { type: "pass_window" });
    s = go(s, (x) => !x.run || x.timingKey === "run.jackOutWindow", [
      "accept",
      "place",
    ]);
    r.snap("damage", s);
  },

  "docklands-pass#1": (r) => {
    const b = new Board(r, "corp", 5);
    b.rig("security-testing");
    b.rig("docklands-pass");
    b.hq("hedge-fund", "ice-wall");
    let s = runnerTurnBegins(b.s, ["server:hq"]);
    s.runner.credits = 5;
    let from = s.log.length;
    s = go(run(s, "hq"), idle, ["Security Testing", "security-testing"]);
    r.fact("accessedCount", accessedSince(s, from).length, "first");
    r.snap("first", s);
    from = s.log.length;
    s = go(run(s, "hq"), idle);
    r.fact("accessedCount", accessedSince(s, from).length, "second");
    r.snap("second", s);
  },

  "funhouse#1": (r) => {
    const b = new Board(r, "runner", 5);
    b.ice("funhouse", "hq");
    const decoy = b.rig("decoy");
    let offeredDecoy = false;
    let asks = 0;
    // Each time the engine asks, the Runner takes the tag. The walk stops if
    // the engine is still asking after the third tag.
    const s = go(
      run(b.s, "hq"),
      (x) => encounterOrOver(x) || (asks >= 3 && hasOption(x, "unless-pay")),
      ["unless-pay", "unless-pay", "unless-pay"],
      (x) => {
        if (hasOption(x, "unless-pay")) asks += 1;
        // Decoy is not used: the case asks only whether the engine offers it.
        if (x.pendingTags && offered(x, "use_paid_ability", decoy).length > 0) {
          offeredDecoy = true;
        }
        return undefined;
      },
    );
    r.fact("legal(decoy)", offeredDecoy);
    r.snap("encounter", s);
  },

  "funhouse#2": (r) => {
    const b = new Board(r, "runner", 5);
    b.identity("runner", "jesminder-sareen-girl-behind-the-curtain");
    b.ice("funhouse", "hq");
    let s = go(run(b.s, "hq"), (x) => Boolean(x.pendingChoice) || !x.run);
    debug("funhouse:", what(s));
    const can = hasOption(s, "unless-pay");
    r.fact("legal(take-tag)", can);
    // Offered the tag, the Runner takes it; otherwise the run ends.
    s = go(s, (x) => idle(x) || atEncounter(x), [
      can ? "unless-pay" : "unless-instruction",
      "unless-instruction",
    ]);
    r.snap("encounter", s);
  },

  "funhouse#3": (r) => insideJob(r, "funhouse", false),

  "hyperbaric#1": (r) => {
    const b = new Board(r, "runner", 5);
    const [rigging, hyper] = b.grip("rigging-up", "hyperbaric");
    let s = must(b.s, { type: "play_event", cardId: rigging! });
    let charge = false;
    s = go(s, idle, [hyper!, "charge", "accept"], (x) => {
      if (!x.pendingChoice || hasOption(x, hyper!)) return undefined;
      debug("rigging up:", what(x));
      charge = true;
      return undefined;
    });
    r.fact("legal(charge)", charge);
    r.snap("play", s);
  },

  "inside-job#1": (r) => insideJob(r, "tollbooth", true),

  "jinteki-restoring-humanity#1": (r) => {
    const b = new Board(r, "corp", 5);
    b.identity("corp", "jinteki-restoring-humanity");
    b.hq(
      "hedge-fund",
      "hedge-fund",
      "hedge-fund",
      "hedge-fund",
      "hedge-fund",
      "hedge-fund",
    );
    let s = b.s;
    s.config.stopAfterFirstCycle = false;
    for (let i = 0; i < 3; i++) {
      s = go(must(s, { type: "basic_gain_credit" }), (x) => atAction(x));
    }
    s = go(s, (x) => x.timingKey === "runner.takeAction", ["accept"]);
    r.snap("turn-ends", s);
  },

  "longevity-serum#1": (r) => {
    const b = new Board(r, "corp", 5);
    const [serum] = b.remote("longevity-serum");
    b.card(serum).advancementCounters = 3;
    b.rig("spoilers");
    const fund = b.archives("hedge-fund");
    let s = take(corpWindow(b.s), "score_agenda", serum);
    s = go(s, idle, [fund, "choose-cards-done"], (x) => {
      if (x.pendingChoice) debug("serum:", what(x));
      return undefined;
    });
    r.snap("score", s);
  },

  "meridian#1": (r) => {
    const b = new Board(r, "runner", 5);
    b.ice("meridian", "hq");
    b.hq("hedge-fund");
    let s = go(run(b.s, "hq"), encounterOrOver);
    s = must(s, { type: "pass_window" });
    s = go(s, (x) => !x.pendingChoice && (!x.run || !atEncounter(x)), [
      "take-neg1",
    ]);
    r.snap("sub", s);
    r.snap("run-over", go(s, idle));
  },

  "meridian#2": (r) => lokiMeridian(r, true),
  "meridian#2-b": (r) => lokiMeridian(r, false),

  "moon-pool#1": (r) => {
    const b = new Board(r, "corp", 5);
    const [pool] = b.remote("moon-pool", true);
    const [regenesis] = b.remote("regenesis");
    b.card(regenesis).advancementCounters = 3;
    const takeover = b.archives("hostile-takeover", false);
    const fund = b.archives("hedge-fund", false);
    let s = raw(corpWindow(b.s), ability(corpWindow(b.s), pool)!);
    debug("moon pool:", what(s));
    s = go(s, (x) => !x.pendingChoice, [fund, "choose-cards-done", "decline"]);
    r.snap("moon-pool", s);
    s = take(corpWindow(s), "score_agenda", regenesis);
    debug("regenesis:", what(s));
    r.fact(
      "legal(regenesis)",
      hasOption(s, takeover) || hasOption(s, "accept"),
      "score",
    );
    s = go(s, idle, ["accept", takeover]);
    r.snap("score", s);
  },

  "moon-pool#2": (r) => {
    const b = new Board(r, "corp", 5);
    const [pool] = b.remote("moon-pool", true);
    const before = b.s.rngState;
    let s = raw(corpWindow(b.s), ability(corpWindow(b.s), pool)!);
    s = go(s, (x) => !x.pendingChoice, [
      "choose-cards-done",
      "choose-cards-done",
    ]);
    r.fact("rdShuffled", shuffledSince(before, s));
    r.snap("use", s);
  },

  "no-free-lunch#1": (r) => {
    const b = new Board(r, "runner", 0);
    const lunch = b.rig("no-free-lunch");
    b.ice("hunter", "hq");
    let s = go(run(b.s, "hq"), encounterOrOver);
    s = raw(s, { type: "pass_window" });
    // The steps are taken one at a time so that a trace, if the engine ever
    // stops inside one, is seen.
    let inTrace = false;
    for (let i = 0; i < 12 && s.run && !atAction(s); i++) {
      if (s.trace) {
        debug("trace:", what(s));
        if (ability(s, lunch)) inTrace = true;
      }
      if (s.timingKey === "run.jackOutWindow") break;
      const legal = legalActions(s);
      const next =
        legal.find((a) => a.type === "boost_trace" && a.credits === 0) ??
        legal.find((a) => a.type === "resolve_trace") ??
        legal.find((a) => a.type === "accept_tags") ??
        legal.find((a) => a.type === "pass_window");
      if (!next) break;
      s = raw(s, next);
    }
    r.fact("legal(no-free-lunch)", inTrace);
    r.snap("trace", s);
  },

  "pantograph#1": (r) => {
    const b = new Board(r, "runner", 5);
    b.rig("pantograph");
    const [exer] = b.grip("exer");
    b.rd("hostile-takeover", "hedge-fund");
    const from = b.s.log.length;
    const s = go(run(b.s, "rd"), idle, ["accept", exer!]);
    r.fact("accessed", accessedSince(s, from));
    r.snap("run", s);
  },

  "pantograph#2": (r) => {
    const b = new Board(r, "corp", 5);
    const [takeover] = b.remote("hostile-takeover");
    b.card(takeover).advancementCounters = 2;
    b.rig("pantograph");
    const [maemi] = b.grip("mystic-maemi");
    b.s.runner.credits = 5;
    let s = take(corpWindow(b.s), "score_agenda", takeover);
    s = go(s, idle, ["accept", maemi!]);
    r.snap("score", s);
  },

  "pinhole-threading#1": (r) => {
    const b = new Board(r, "runner", 5);
    b.rig("aumakua");
    const [pinhole] = b.grip("pinhole-threading");
    const [pad] = b.remote("pad-campaign");
    const from = b.s.log.length;
    const s = go(playRun(b.s, pinhole!, "archives"), idle, ["pinhole", pad]);
    r.fact("accessed", accessedSince(s, from));
    r.snap("run", s);
  },

  "pinhole-threading#2": (r) => {
    const b = new Board(r, "runner", 5);
    b.rig("kasi-string");
    const [pinhole] = b.grip("pinhole-threading");
    const [, first] = b.remote("nasx");
    const [pad] = b.remote("pad-campaign");
    const from = b.s.log.length;
    const s = go(playRun(b.s, pinhole!, first), idle, [
      "pinhole",
      pad,
      "decline",
    ]);
    r.fact("accessed", accessedSince(s, from));
    r.snap("run", s);
  },

  "pinhole-threading#3": (r) => {
    const b = new Board(r, "runner", 5);
    const hqControl = b.ice("border-control", "hq");
    const [ganked, remote] = b.remote("ganked");
    const remoteControl = b.ice("border-control", remote);
    const corroder = b.rig("corroder");
    let s = pinholeGanked(b, remoteControl, ganked, corroder);
    debug("ganked:", what(s), s.run?.encounter?.iceId, remoteControl);
    // The Corp holds priority to use a paid ability.
    if (s.run && !ability(s, hqControl) && !ability(s, remoteControl)) {
      s = handOver(s);
    }
    debug("corp:", JSON.stringify(legalActions(s)));
    r.fact("legal(trash-hq-border-control)", Boolean(ability(s, hqControl)));
    r.fact(
      "legal(trash-remote-border-control)",
      Boolean(ability(s, remoteControl)),
    );
    r.snap("ganked", s);
  },

  "pinhole-threading#4": (r) => henry(r, true),
  "pinhole-threading#4-b": (r) => henry(r, false),

  "pinhole-threading#5": (r) => {
    const b = new Board(r, "runner", 3);
    const cezve = b.rig("cezve");
    b.card(cezve).recurringCredits = 2;
    const [pinhole] = b.grip("pinhole-threading");
    const [pad] = b.remote("pad-campaign");
    let s = go(
      playRun(b.s, pinhole!, "archives"),
      (x) =>
        offered(x, "trash_accessed").length > 0 ||
        offered(x, "finish_access").length > 0 ||
        idle(x),
      ["pinhole", pad],
    );
    debug("pinhole:", what(s), JSON.stringify(legalActions(s)));
    const trash = offered(s, "trash_accessed", pad)[0];
    r.fact("legal(trash)", Boolean(trash));
    if (trash) s = go(raw(s, trash), (x) => !x.pendingChoice, [cezve, "2"]);
    r.snap("run", go(s, idle));
  },

  "rene-loup-arcemont-party-animal#1": (r) => {
    const b = new Board(r, "runner", 5);
    b.identity("runner", "rene-loup-arcemont-party-animal");
    b.rig("carnivore");
    b.grip("sure-gamble", "sure-gamble");
    const [pad] = b.hq("pad-campaign");
    let s = go(run(b.s, "hq"), (x) => offered(x, "access_card").length > 0);
    s = raw(s, { type: "access_card", cardId: pad! });
    debug("carnivore:", JSON.stringify(legalActions(s)));
    const eat = offered(s, "access_trash_from_grip")[0];
    if (eat) s = raw(s, eat);
    r.snap("access", go(s, idle, ["sure-gamble", "sure-gamble"]));
  },

  "seamless-launch#1": (r) => seamless(r, (b) => b.remote("pad-campaign")[0]),
  "seamless-launch#2": (r) => seamless(r, (b) => b.rig("corroder")),
  "seamless-launch#3": (r) =>
    seamless(r, (b) => {
      const [oaktown] = b.remote("oaktown-renovation");
      b.card(oaktown).faceup = true;
      return oaktown;
    }),

  "spin-doctor#1": (r) => spinDoctor(r, true),
  "spin-doctor#2": (r) => spinDoctor(r, false),
  "spin-doctor#2-b": (r) => spinDoctor(r, false, 1),

  "svyatogor-excavator#1": (r) => {
    const b = new Board(r, "runner", 5);
    b.identity("corp", "ob-superheavy-logistics-extract-export-excel");
    b.remote("svyatogor-excavator", true);
    const [contract] = b.remote("reconstruction-contract", true);
    const [rashida] = b.rd("rashida-jaheem");
    let offeredRashida = false;
    const s = corpTurnBegins(
      b.s,
      ["trash", contract, "accept", rashida!, "new"],
      (x) => {
        if (!x.pendingChoice) return undefined;
        debug("excavator:", what(x));
        const labels = x.pendingChoice.options.map((o) => o.label ?? "");
        // Rashida Jaheem's own ability, not Ob's choice of what to install.
        if (
          labels.some((l) => /Rashida/.test(l) && /draw|3¢|gain/i.test(l)) ||
          (x.pendingChoice.options.every((o) => o.id.startsWith("trigger:")) &&
            labels.some((l) => /Rashida/.test(l)))
        ) {
          offeredRashida = true;
          return pick(x, optionIds(x).find((id) => /decline/.test(id)) ?? "");
        }
        return undefined;
      },
    );
    r.fact("legal(rashida)", offeredRashida);
    r.snap("turn-begins", s);
  },

  "tollbooth#1": (r) => {
    const b = new Board(r, "runner", 2);
    b.ice("tollbooth", "hq");
    r.snap(
      "encounter",
      go(run(b.s, "hq"), (x) => idle(x) || atEncounter(x)),
    );
  },

  "tollbooth#2": (r) => {
    const b = new Board(r, "runner", 5);
    b.ice("tollbooth", "hq");
    let declinable = false;
    const s = go(
      run(b.s, "hq"),
      (x) => idle(x) || atEncounter(x),
      ["pay", "accept"],
      (x) => {
        if (!x.pendingChoice) return undefined;
        debug("tollbooth:", what(x));
        if (
          optionIds(x).some((id) => /decline|unless-instruction|end/.test(id))
        )
          declinable = true;
        return undefined;
      },
    );
    r.fact("legal(decline)", declinable);
    r.snap("encounter", s);
  },

  "tollbooth#3": (r) => insideJob(r, "tollbooth", false),

  "urtica-cipher#1": (r) => {
    const b = new Board(r, "corp", 5);
    const [urtica] = b.remote("urtica-cipher");
    const can = offered(b.s, "advance", urtica).length > 0;
    r.fact("legal(advance)", can);
    r.snap("advance", can ? go(take(b.s, "advance", urtica), idle) : b.s);
  },

  "urtica-cipher#2": (r) => {
    const b = new Board(r, "runner", 5);
    const [, remote] = b.remote("urtica-cipher");
    b.grip("sure-gamble", "sure-gamble", "sure-gamble");
    r.snap("access", go(run(b.s, remote), idle));
  },

  "urtica-cipher#3": (r) => {
    const b = new Board(r, "runner", 5);
    const [urtica, remote] = b.remote("urtica-cipher");
    b.card(urtica).advancementCounters = 1;
    const [prana] = b.remote("prana-condenser", true);
    b.grip(
      "sure-gamble",
      "sure-gamble",
      "sure-gamble",
      "sure-gamble",
      "sure-gamble",
    );
    const s = go(run(b.s, remote), idle, [], (x) => {
      // The Corp uses Prāna Condenser every time the engine offers it.
      const use = x.pendingDamage ? ability(x, prana) : undefined;
      return use ? raw(x, use) : undefined;
    });
    r.snap("access", s);
  },

  "weyland-consortium-built-to-last#1": (r) => {
    const b = new Board(r, "corp", 5);
    b.identity("corp", "weyland-consortium-built-to-last");
    const [urtica] = b.remote("urtica-cipher");
    // If the engine will not advance the card, the position is reported as it is.
    let s = b.s;
    if (offered(s, "advance", urtica).length) {
      s = go(take(s, "advance", urtica), idle);
    }
    r.snap("first", s);
    if (offered(s, "advance", urtica).length) {
      s = go(take(s, "advance", urtica), idle);
    }
    r.snap("second", s);
  },

  "weyland-consortium-built-to-last#2": (r) =>
    seamless(
      r,
      (b) => b.remote("pad-campaign")[0],
      "weyland-consortium-built-to-last",
    ),

  "weyland-consortium-built-to-last#3": (r) => {
    const b = new Board(r, "corp", 5);
    b.identity("corp", "weyland-consortium-built-to-last");
    const takeover = b.scored("corp", "hostile-takeover");
    const wall = b.ice("ice-wall", "hq");
    const [success] = b.hq("success");
    let s = raw(b.s, { type: "play_operation", cardId: success! });
    debug("success:", what(s));
    s = go(s, idle, [takeover, wall, wall]);
    r.snap("play", s);
  },
};

/** Cookbook and Tranquilizer's 'when installed' abilities in either order. */
function cookbook(r: Report, tranquilizerFirst: boolean): void {
  const b = new Board(r, "runner", 5);
  b.rig("cookbook");
  const hive = b.rig("hivemind");
  b.card(hive).virusCounters = 1;
  const wall = b.ice("ice-wall", "hq");
  const [tranq] = b.grip("tranquilizer");
  let chooser = "nobody";
  const order = tranquilizerFirst
    ? ["Tranquilizer", "Cookbook"]
    : ["Cookbook", "Tranquilizer"];
  const s = go(
    take(b.s, "basic_install", tranq, (a) => JSON.stringify(a).includes(wall)),
    idle,
    [wall, order[0]!, order[1]!, "place"],
    (x) => {
      if (!x.pendingChoice) return undefined;
      debug("cookbook:", what(x));
      if (optionIds(x).every((id) => id.startsWith("trigger:"))) {
        chooser = x.pendingChoice.chooser;
      }
      return undefined;
    },
  );
  if (tranquilizerFirst) r.fact("chooser(order)", chooser);
  r.snap("install", s);
}

/** Loki copies Meridian's subroutine; the Runner takes Loki or not. */
function lokiMeridian(r: Report, takeIt: boolean): void {
  const b = new Board(r, "runner", 5);
  b.ice("loki", "hq");
  b.hq("hedge-fund");
  const meridian = b.ice("meridian", "rd");
  let s = go(run(b.s, "hq"), encounterOrOver, [meridian]);
  if (s.run) s = must(s, { type: "pass_window" });
  // The first choice is the copied subroutine's; a later one is Loki's own.
  s = go(s, (x) => !x.pendingChoice && (!x.run || !atEncounter(x)), [
    takeIt ? "take-neg1" : "suffer",
    "unless-instruction",
  ]);
  r.snap("sub", s);
}

/** Henry Phillips in HQ's root or beside Ganked!, and a subroutine broken. */
function henry(r: Report, inHq: boolean): void {
  const b = new Board(r, "runner", 5);
  const [ganked, remote] = b.remote("ganked");
  const wall = b.ice("ice-wall", remote);
  b.root("henry-phillips", inHq ? "hq" : remote, true);
  const corroder = b.rig("corroder");
  b.s.runner.tags = 1;
  let s = pinholeGanked(b, wall, ganked);
  debug("henry:", what(s), s.run?.encounter?.iceId, wall);
  if (s.run?.encounter?.iceId === wall) s = breakSubs(s, corroder, 1);
  r.snap("break", s);
}
