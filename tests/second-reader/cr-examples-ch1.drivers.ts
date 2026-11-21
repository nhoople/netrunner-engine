/**
 * Second reader, batch 1 (CR examples, chapter 1): one driver per case in
 * `cr-examples-ch1.json`. A driver builds the position, plays the listed
 * steps and reports. It does not say what should happen: the expectations
 * were written and committed first, from the rules alone.
 *
 * Not a test file: vitest only runs `*.test.ts`.
 */
import type { GameState } from "../../src/index.js";
import type { ServerId } from "../../src/state/types.js";
import {
  must,
  optionIds,
  pick,
  toCorpTurn,
  toRunnerTurn,
} from "../rulings-helpers.js";
import { accepts, Board, hasOption, offered, take } from "./harness.js";
import type { Report } from "./harness.js";
import { legalActions } from "../../src/index.js";
import type { Action } from "../../src/index.js";

export type Driver = (r: Report) => void;

const WALK: Action["type"][] = [
  "continue_run",
  "access_card",
  "finish_access",
  "finish_breach",
  "accept_installed_trash",
  "pass_window",
  "discard_to_hand_size",
];

/**
 * Take the obvious step (continue, access, finish, pass) until `stop` holds
 * or a choice opens. With nothing obvious left it throws, so a driver cannot
 * report a state it did not mean to stop in.
 */
function drive(s: GameState, stop: (s: GameState) => boolean): GameState {
  for (let i = 0; i < 200; i++) {
    if (stop(s) || s.pendingChoice || s.done) return s;
    const legal = legalActions(s);
    const next = WALK.map((t) => legal.find((a) => a.type === t)).find(Boolean);
    if (!next) {
      throw new Error(
        `stuck at ${s.timingKey}: ${legal.map((a) => a.type).join(", ")}`,
      );
    }
    s = must(s, next);
  }
  throw new Error(`no stop at ${s.timingKey}`);
}

const run = (s: GameState, server: string): GameState =>
  must(s, { type: "basic_run", serverId: server as ServerId });

const runOver = (s: GameState): boolean => !s.run;
/** The window after an encounter, where the Runner may jack out (CR 6.9.4c). */
const passedIce = (s: GameState): boolean =>
  !s.run || s.timingKey === "run.jackOutWindow";
const atAction = (s: GameState): boolean =>
  s.timingKey === "runner.takeAction" || s.timingKey === "corp.takeAction";
const toAction = (s: GameState): GameState => drive(s, atAction);

export const debug = (...parts: unknown[]): void => {
  if (process.env.SR_DEBUG) console.log("   ·", ...parts);
};

/**
 * Play on to `stop`, answering each choice on the way with the first entry
 * of `answers` (a part of an option's id) that one of its options matches.
 * Each answer is used once. A choice no answer fits stops the walk, and the
 * driver reports the state as it is.
 */
function through(
  s: GameState,
  stop: (s: GameState) => boolean,
  answers: string[] = [],
): GameState {
  const left = [...answers];
  for (let i = 0; i < 30; i++) {
    s = drive(s, stop);
    if (!s.pendingChoice) return s;
    const ids = optionIds(s);
    const at = left.findIndex((a) => ids.some((id) => id.includes(a)));
    debug(
      `choice[${s.pendingChoice.chooser}] ${s.pendingChoice.prompt ?? ""}: ${s.pendingChoice.options
        .map((o) => `${o.id} "${o.label}"`)
        .join(" | ")} -> ${at < 0 ? "(stop)" : left[at]}`,
    );
    if (at < 0) return s;
    s = pick(s, left.splice(at, 1)[0]!);
  }
  return s;
}

/** The Runner's paid ability window in the action phase. */
function runnerWindow(s: GameState): GameState {
  s.timingKey = "runner.actionPaw";
  return s;
}

/** The Corp's paid ability window in its action phase, where it may score and rez. */
function corpWindow(s: GameState): GameState {
  s.timingKey = "corp.actionPaw";
  return s;
}

export const drivers: Record<string, Driver> = {
  "1.10.3b.ex1": (r) => {
    const b = new Board(r, "runner", 3);
    b.grip("diesel", "diesel", "diesel", "diesel", "diesel");
    b.ice("dna-tracker", "rd");
    const s = drive(run(b.s, "rd"), passedIce);
    r.snap("encounter", s);
  },

  "1.10.3c.ex1": (r) => {
    const b = new Board(r, "runner", 3);
    const feeder = b.rig("cyberfeeder");
    b.card(feeder).recurringCredits = 1;
    const [atman] = b.grip("atman");
    let s = take(b.s, "basic_install", atman);
    // The engine asks nothing here: it spends what is available. So what
    // it would accept or refuse cannot be seen, only what it did.
    const noChoice =
      "The engine does not ask how many credits to spend on Atman; it spends all that are available.";
    r.cannotObserve("legal(spend-two)", noChoice);
    r.cannotObserve("legal(spend-one)", noChoice);
    if (s.pendingChoice) s = pick(s, "1");
    r.snap("spend-one", s);
  },

  "1.10.3c.ex2": (r) => {
    const b = new Board(r, "runner", 0);
    const ghost = b.rig("ghost-runner");
    b.card(ghost).hostedCredits = 3;
    b.hq("the-future-perfect");
    let s = drive(run(b.s, "hq"), (x) => Boolean(x.psi));
    r.fact("legal(psi)", accepts(s, { type: "psi_runner_bid", amount: 2 }));
    s = must(s, { type: "psi_runner_bid", amount: 2 });
    s = must(s, { type: "psi_corp_bid", amount: 2 });
    const steal = offered(s, "steal_agenda")[0];
    if (steal) s = must(s, steal);
    s = drive(s, runOver);
    r.snap("psi", s);
  },

  "1.10.3c.ex3": (r) => {
    const b = new Board(r, "runner", 1);
    const ghost = b.rig("ghost-runner");
    b.card(ghost).hostedCredits = 3;
    b.ice("tollbooth", "hq");
    b.hq("hedge-fund");
    let s = run(b.s, "hq");
    s = drive(s, (x) => x.timingKey === "run.encounterPaw" || !x.run);
    // A choice that lets the Runner not pay would be a way to decline.
    r.fact(
      "legal(decline)",
      Boolean(s.pendingChoice) && optionIds(s).length > 1,
    );
    if (s.pendingChoice) s = pick(s, "pay");
    r.fact(
      "poolPlusGhostRunner",
      s.runner.credits + (s.cards[ghost]?.hostedCredits ?? 0),
      "toll",
    );
    r.snap("toll", s);
  },

  "1.10.5d.ex1": (r) => {
    const b = new Board(r, "runner", 6);
    const corroder = b.rig("corroder");
    const [modem] = b.grip("spinal-modem");
    b.ice("ice-wall", "archives");
    let s = take(b.s, "basic_install", modem);
    r.snap("install", s);
    s = drive(s, (x) => x.timingKey === "runner.takeAction");
    // The engine offers the pump only during an encounter, so the credit
    // is spent while encountering Ice Wall.
    s = drive(run(s, "archives"), (x) => x.timingKey === "run.encounterPaw");
    s = take(s, "use_paid_ability", corroder);
    if (s.pendingChoice) s = pick(s, modem);
    r.snap("spend", s);
    s = toAction(drive(s, runOver));
    s = toCorpTurn(s);
    s = toRunnerTurn(s);
    r.snap("next-turn", s);
  },

  "1.12.2.ex1": (r) => {
    const b = new Board(r, "corp", 5);
    const [fab, server] = b.remote("vaporframe-fabricator", true);
    const [pad, restore, wall] = b.hq("pad-campaign", "restore", "ice-wall");
    let s = take(b.s, "use_paid_ability", fab);
    s = through(s, atAction, [`hq-install:${pad}:${server}`]);
    r.snap("first-use", s);
    s = take(s, "play_operation", restore);
    s = through(s, atAction, [fab, "new"]);
    r.snap("restore", s);
    const again = offered(s, "use_paid_ability", fab)[0];
    r.fact("legal(second-use)", Boolean(again));
    if (again) s = through(must(s, again), atAction, [`hq-install:${wall}:hq`]);
    r.snap("second-use", s);
  },

  "1.12.2a.ex1": (r) => {
    const b = new Board(r, "corp", 5);
    const [pc, wall] = b.hq("priority-construction", "ice-wall");
    let s = take(b.s, "play_operation", pc);
    s = through(s, atAction, [`pc:${wall}:new`]);
    r.snap("play", s);
  },

  "1.12.3.ex1": (r) => {
    const b = new Board(r, "corp", 5);
    b.identity("corp", "the-foundry-refining-the-process");
    const [abt] = b.remote("accelerated-beta-test");
    b.card(abt).advancementCounters = 3;
    for (const id of b.s.corp.deck) delete b.s.cards[id];
    b.s.corp.deck = [];
    const [top] = b.rd(
      "ice-wall",
      "wall-of-static",
      "hedge-fund",
      "pad-campaign",
      "ice-wall",
      "pad-campaign",
    );
    let s = must(corpWindow(b.s), { type: "score_agenda", cardId: abt });
    s = through(s, atAction, [`abt-ice:${top}:hq`, "search"]);
    r.snap("score", s);
  },

  "1.12.4.ex1": (r) => {
    const b = new Board(r, "runner", 14);
    const roto = b.ice("rototurret", "hq");
    b.ice("thimblerig", "rd");
    const [femme] = b.grip("femme-fatale");
    b.hq("hedge-fund");
    let s = take(b.s, "basic_install", femme);
    s = through(s, atAction, [`chosen-ice:${roto}`]);
    s = toCorpTurn(s);
    s = through(s, atAction, [`swap-ice:${roto}`]);
    r.snap("swap", s);
    s = toRunnerTurn(s);
    s = toAction(s);
    s = drive(run(s, "rd"), (x) => x.timingKey === "run.encounterPaw");
    const before = s.runner.credits;
    const choice = hasOption(s, "bypass") || hasOption(s, "pay");
    const paid = offered(s, "use_paid_ability", femme)[0];
    r.fact("legal(bypass)", choice || Boolean(paid));
    if (choice) s = pick(s, hasOption(s, "bypass") ? "bypass" : "pay");
    else if (paid) s = must(s, paid);
    s = drive(s, passedIce);
    r.fact("creditsSpentOnBypass", before - s.runner.credits, "bypass");
    r.snap("bypass", s);
  },

  "1.12.5.ex1": (r) => {
    const b = new Board(r, "corp", 10);
    const [fab, server] = b.remote("vaporframe-fabricator", true);
    const [roto, divert] = b.hq("rototurret", "divert-power");
    let s = take(b.s, "use_paid_ability", fab);
    s = through(s, atAction, [`hq-install:${roto}:${server}`]);
    s = take(s, "play_operation", divert);
    s = through(s, atAction, [
      `derez-any:${fab}`,
      "done-derez-any",
      `rez-discount:${roto}`,
    ]);
    s = must(corpWindow(s), { type: "rez_asset", cardId: fab });
    s = toAction(s);
    r.snap("rez-again", s);
    r.fact("legal(second-use)", offered(s, "use_paid_ability", fab).length > 0);
  },

  "1.12.6.ex1": (r) => {
    const b = new Board(r, "runner", 3);
    b.ice("drafter", "hq");
    const wall = b.ice("ice-wall", "hq", false);
    const [wos] = b.hq("wall-of-static", "hedge-fund");
    const [bravado] = b.grip("bravado");
    let s = must(b.s, {
      type: "play_event",
      cardId: bravado!,
      serverId: "hq" as ServerId,
    });
    s = through(s, runOver, [
      "decline",
      `choose-card:${wos}`,
      "install-dest-trash:hq",
      wall,
    ]);
    s = through(s, runOver, ["done"]);
    s = toAction(s);
    r.snap("run", s);
  },

  "1.12.6.ex2": (r) => {
    const b = new Board(r, "runner", 5);
    b.rig("r-d-interface");
    const [pad] = b.rd("pad-campaign", "hedge-fund", "ice-wall");
    const accessed: string[] = [];
    let s = run(b.s, "rd");
    for (let i = 0; i < 40 && s.run; i++) {
      s = drive(
        s,
        (x) =>
          !x.run ||
          offered(x, "access_card").length > 0 ||
          offered(x, "trash_accessed").length > 0,
      );
      const access = offered(s, "access_card")[0] as
        { cardId: string } | undefined;
      const trash = offered(s, "trash_accessed", pad)[0];
      if (trash) s = must(s, trash);
      else if (access) {
        accessed.push(s.cards[access.cardId]!.title);
        s = must(s, { type: "access_card", cardId: access.cardId });
        if (access.cardId !== pad && offered(s, "finish_access").length) {
          s = take(s, "finish_access");
        }
      } else break;
    }
    s = drive(s, runOver);
    r.fact("accessed", accessed);
    r.snap("breach", s);
  },

  "1.12.6a.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const [abt, server] = b.remote("accelerated-beta-test");
    const amaze = b.root("amaze-amusements", server, true);
    let s = run(b.s, server);
    s = drive(s, (x) => offered(x, "access_card").length > 0);
    s = take(s, "access_card", abt);
    s = take(s, "steal_agenda", abt);
    s = drive(s, (x) => offered(x, "access_card").length > 0);
    s = take(s, "access_card", amaze);
    s = take(s, "trash_accessed", amaze);
    s = toAction(through(s, runOver));
    r.snap("run", s);
  },

  "1.13.3.ex1": (r) => {
    const b = new Board(r, "runner", 2);
    const ghost = b.rig("ghost-runner");
    b.card(ghost).hostedCredits = 3;
    b.ice("whitespace", "hq");
    b.hq("hedge-fund");
    const s = drive(run(b.s, "hq"), runOver);
    r.snap("run", s);
  },

  "1.13.3.ex2": (r) => {
    const b = new Board(r, "corp", 10);
    const [bore] = b.remote("superdeep-borehole");
    let s = must(corpWindow(b.s), { type: "rez_asset", cardId: bore });
    s = toAction(s);
    r.snap("rez", s);
    s = toRunnerTurn(s);
    s = toAction(s);
    s = run(s, "archives");
    r.snap("run-1", s);
    s = toAction(drive(s, runOver));
    s = toCorpTurn(s);
    s = toAction(s);
    r.snap("corp-turn", s);
    s = toRunnerTurn(s);
    s = toAction(s);
    s = run(s, "archives");
    r.snap("run-2", s);
  },

  "1.13.3.ex3": (r) => {
    const b = new Board(r, "corp", 5);
    const [bore] = b.remote("superdeep-borehole", true);
    (
      b.card(bore) as unknown as { badPublicityCounters: number }
    ).badPublicityCounters = 5;
    (b.s.corp as { badPublicity?: number }).badPublicity = 1;
    const [goat] = b.hq("scapegoat");
    let s = take(b.s, "play_operation", goat);
    s = through(s, atAction, ["remove"]);
    r.snap("play", s);
  },

  "1.13.6a.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const oca = b.rig("off-campus-apartment");
    const [guy, ghost] = b.grip("fall-guy", "ghost-runner");
    const onto = (cardId: string) =>
      offered(b.s, "basic_install", cardId).some((a) =>
        JSON.stringify((a as { destination?: unknown }).destination).includes(
          oca,
        ),
      );
    const direct = (cardId: string) =>
      offered(b.s, "basic_install", cardId).some(
        (a) =>
          (a as { destination?: { kind: string } }).destination?.kind ===
          "installed",
      );
    r.fact("legal(ghost-on-apartment)", onto(ghost!));
    r.fact("legal(fall-guy-direct)", direct(guy!));
    r.fact("legal(fall-guy-on-apartment)", onto(guy!));
    let s = take(b.s, "basic_install", guy, (a) =>
      JSON.stringify(a).includes(oca),
    );
    s = toAction(s);
    r.snap("fall-guy-on-apartment", s);
  },

  "1.13.6b.ex1": (r) => {
    const b = new Board(r, "corp", 5);
    const glenn = b.scored("corp", "glenn-station");
    const [pad, wall] = b.hq("pad-campaign", "ice-wall");
    r.fact(
      "legal(install-onto)",
      offered(b.s, "basic_install", pad).some((a) =>
        JSON.stringify(a).includes(glenn),
      ),
    );
    let s = take(b.s, "use_paid_ability", glenn, (a) =>
      JSON.stringify(a).toLowerCase().includes("host"),
    );
    s = through(s, atAction, [pad!]);
    r.snap("host", s);
    const again = offered(s, "use_paid_ability", glenn).find((a) =>
      JSON.stringify(a).toLowerCase().includes("host"),
    );
    if (again) s = through(must(s, again), atAction, [wall!]);
    r.snap("host-second", s);
  },

  "1.13.6c.ex1#a": (r) => {
    const b = new Board(r, "runner", 5);
    b.ice("ice-wall", "hq", false);
    const [egret] = b.grip("egret");
    r.fact("legal(install)", offered(b.s, "basic_install", egret).length > 0);
    r.snap("install", b.s);
  },

  "1.13.6c.ex1#b": (r) => {
    const b = new Board(r, "runner", 5);
    b.ice("ice-wall", "hq", true);
    const [egret] = b.grip("egret");
    r.fact("legal(install)", offered(b.s, "basic_install", egret).length > 0);
    const s = toAction(through(take(b.s, "basic_install", egret), atAction));
    r.snap("install", s);
  },

  "1.13.9.ex1": (r) => {
    const b = new Board(r, "runner", 10);
    const dheg = b.rig("dhegdheer");
    const [lep, atman] = b.grip("leprechaun", "atman");
    const onto = (s: GameState, cardId: string, hostId: string) =>
      offered(s, "basic_install", cardId).find((a) =>
        JSON.stringify(a).includes(hostId),
      ) ?? offered(s, "basic_install", cardId)[0]!;
    let s = must(b.s, onto(b.s, lep!, dheg));
    s = toAction(through(s, atAction));
    r.snap("leprechaun", s);
    s = must(s, onto(s, atman!, lep!));
    s = toAction(through(s, atAction, ["0"]));
    r.snap("atman", s);
  },

  "1.13.12.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const madani = b.rig("madani");
    const [corroder, atman] = b.grip("corroder", "atman", "diesel");
    let s = take(b.s, "use_paid_ability", madani, (a) =>
      JSON.stringify(a).toLowerCase().includes("host"),
    );
    s = through(s, atAction, [corroder!, atman!, "done"]);
    s = toAction(s);
    r.snap("host", s);
  },

  "1.13.13.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const detente = b.rig("detente");
    const [rejig] = b.grip("rejig");
    b.hq("hedge-fund");
    let s = through(run(b.s, "hq"), runOver, ["host"]);
    s = toAction(through(s, atAction));
    r.snap("run", s);
    s = take(s, "play_event", rejig);
    s = toAction(through(s, atAction, [detente, detente]));
    r.snap("rejig", s);
  },

  "1.13.13.ex2": (r) => {
    const b = new Board(r, "corp", 10);
    const nbt = b.scored("runner", "next-big-thing");
    b.card(nbt).agendaCounters = 1;
    b.s.runner.tags = 4;
    const [ip] = b.hq("ip-enforcement");
    let s = take(b.s, "play_operation", ip);
    s = through(s, atAction, ["remove-3"]);
    try {
      s = toAction(through(s, atAction, [nbt, "new"]));
    } catch (error) {
      // The engine refuses the install; report the state where it stopped.
      debug((error as Error).message);
    }
    r.snap("play", s);
  },

  "1.13.13.ex3": (r) => {
    const b = new Board(r, "corp", 5);
    const nbt = b.scored("runner", "next-big-thing");
    b.card(nbt).agendaCounters = 1;
    const abt = b.scored("corp", "accelerated-beta-test");
    b.s.runner.tags = 1;
    const [eoi] = b.hq("exchange-of-information");
    let s = take(b.s, "play_operation", eoi);
    s = toAction(through(s, atAction, [abt, nbt]));
    r.snap("play", s);
  },

  "1.14.5.ex1#rototurret": (r) => {
    const b = new Board(r, "runner", 5);
    b.rig("corroder");
    b.rig("atman");
    b.ice("rototurret", "hq");
    b.hq("hedge-fund");
    let s = drive(
      run(b.s, "hq"),
      (x) => Boolean(x.pendingTrashProgram) || !x.run,
    );
    r.fact(
      "chooser(trash)",
      s.pendingTrashProgram?.chooser ?? s.pendingChoice?.chooser ?? "nobody",
    );
    if (s.pendingTrashProgram) {
      s = must(s, {
        type: "choose_trash_program",
        cardId: s.pendingTrashProgram.candidates[0]!,
      });
    } else if (s.pendingChoice) s = pick(s, "");
    // The trash waits for the Runner to decline to prevent it.
    if (offered(s, "accept_installed_trash").length > 0) {
      debug("prevention offered:", JSON.stringify(legalActions(s)));
      s = take(s, "accept_installed_trash");
    }
    r.snap("trash", s);
  },

  "1.14.5.ex1#bulwark": (r) => {
    const b = new Board(r, "runner", 5);
    b.rig("corroder");
    b.rig("llds-energy-regulator");
    b.ice("bulwark", "hq");
    b.hq("hedge-fund");
    let s = drive(
      run(b.s, "hq"),
      (x) => Boolean(x.pendingTrashProgram) || !x.run,
    );
    r.fact(
      "chooser(trash)",
      s.pendingTrashProgram?.chooser ?? s.pendingChoice?.chooser ?? "nobody",
      "trash",
    );
    if (s.pendingTrashProgram) {
      s = must(s, {
        type: "choose_trash_program",
        cardId: s.pendingTrashProgram.candidates[0]!,
      });
    } else if (s.pendingChoice) s = pick(s, "");
    // The trash waits for the Runner to decline to prevent it.
    if (offered(s, "accept_installed_trash").length > 0) {
      debug("prevention offered:", JSON.stringify(legalActions(s)));
      s = take(s, "accept_installed_trash");
    }
    r.snap("trash", s);
    s = toAction(drive(s, runOver));
    r.snap("rest", s);
  },

  "1.14.5a.ex1": (r) => {
    const b = new Board(r, "runner", 3);
    b.rig("corroder");
    const [apocalypse] = b.grip(
      "apocalypse",
      "diesel",
      "diesel",
      "diesel",
      "diesel",
    );
    b.hq("hedge-fund");
    b.rd("hedge-fund");
    const [, server] = b.remote("hostile-infrastructure", true);
    b.ice("whitespace", server, false);
    b.ice("rototurret", server, false);
    let s = b.s;
    for (const server of ["hq", "rd", "archives"]) {
      s = toAction(through(run(s, server), runOver));
    }
    r.snap("runs", s);
    s = take(s, "play_event", apocalypse);
    s = toAction(through(s, atAction));
    r.snap("apocalypse", s);
  },

  "1.14.5a.ex2": (r) => {
    const b = new Board(r, "runner", 5);
    b.identity("runner", "alice-merchant-clan-agitator");
    b.grip("diesel", "diesel", "diesel");
    b.remote("hostile-infrastructure", true);
    const [hedge] = b.hq("hedge-fund", "hedge-fund");
    let s = through(run(b.s, "archives"), runOver, [hedge!]);
    s = toAction(s);
    r.snap("run", s);
  },

  "1.15.1.ex3": (r) => {
    const b = new Board(r, "corp", 5);
    const [abt] = b.remote("accelerated-beta-test");
    const wall = b.ice("ice-wall", "hq", false);
    b.card(wall).advancementCounters = 1;
    const logjam = b.ice("logjam", "rd", false);
    b.card(logjam).advancementCounters = 1;
    const [trick] = b.hq("trick-of-light");
    let s = take(b.s, "play_operation", trick);
    s = through(s, atAction, [abt, wall]);
    // Any further offer is a chance to move more counters: take it.
    for (let i = 0; i < 4 && s.pendingChoice; i++) {
      const more = optionIds(s).find(
        (id) => id.includes(logjam) || id.includes("2"),
      );
      s = pick(s, more ?? optionIds(s)[0]!);
      s = drive(s, atAction);
    }
    s = toAction(s);
    r.snap("play", s);
  },

  "1.15.2c.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.rig("corroder");
    b.grip("atman", "femme-fatale");
    b.stack("leprechaun");
    b.ice("burke-bugs", "hq");
    b.hq("hedge-fund");
    let s = drive(run(b.s, "hq"), (x) => Boolean(x.trace) || passedIce(x));
    if (s.trace) {
      s = must(s, { type: "boost_trace", credits: 1 });
      if (accepts(s, { type: "boost_trace", credits: 0 })) {
        s = must(s, { type: "boost_trace", credits: 0 });
      }
      if (accepts(s, { type: "resolve_trace" })) {
        s = must(s, { type: "resolve_trace" });
      }
    }
    s = drive(s, (x) => Boolean(x.pendingTrashProgram) || !x.run);
    if (s.pendingTrashProgram) {
      s = must(s, {
        type: "choose_trash_program",
        cardId: s.pendingTrashProgram.candidates[0]!,
      });
    }
    s = toAction(through(s, runOver));
    r.snap("sub", s);
  },

  "1.15.2e.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.rig("corroder");
    b.rig("atman");
    const [sec, server] = b.remote("aggressive-secretary");
    b.card(sec).advancementCounters = 3;
    let s = through(run(b.s, server), runOver, ["pay"]);
    for (let i = 0; i < 3 && s.pendingTrashProgram; i++) {
      s = must(s, {
        type: "choose_trash_program",
        cardId: s.pendingTrashProgram.candidates[0]!,
      });
      s = through(s, runOver);
    }
    s = toAction(through(s, runOver, ["corroder", "atman"]));
    r.snap("access", s);
  },

  "1.15.4.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.ice("howler", "hq");
    const [eli] = b.hq("eli-1-0", "hedge-fund");
    let s = through(run(b.s, "hq"), passedIce, [eli!]);
    r.snap("howler", s);
    s = toAction(through(s, runOver));
    r.snap("run-ends", s);
  },

  "1.16.1a.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const chip = b.rig("clone-chip");
    const llds = b.rig("llds-energy-regulator");
    const [corroder] = b.heap("corroder");
    let s = take(runnerWindow(b.s), "use_paid_ability", chip);
    // Any stop that names LLDS Energy Regulator before the program is
    // installed would be a chance to prevent the trash.
    let prevent = false;
    for (
      let i = 0;
      i < 6 && s.cards[corroder!]!.zone !== "runner:installed";
      i++
    ) {
      prevent ||=
        Boolean(s.pendingTrashPrevent) ||
        offered(s, "trigger_pending_trash_interrupt").length > 0 ||
        offered(s, "use_paid_ability", llds).length > 0 ||
        hasOption(s, llds);
      if (s.pendingChoice) s = pick(s, corroder!);
      else s = drive(s, (x) => Boolean(x.pendingChoice) || atAction(x));
    }
    r.fact("legal(prevent)", prevent);
    s = toAction(through(s, atAction));
    r.snap("clone-chip", s);
  },

  "1.16.1b.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.rig("guru-davinder");
    b.grip("diesel", "diesel", "diesel", "diesel", "diesel");
    const [obokata] = b.hq("obokata-protocol");
    let s = drive(run(b.s, "hq"), (x) => offered(x, "access_card").length > 0);
    s = take(s, "access_card", obokata);
    s = drive(
      s,
      (x) =>
        Boolean(x.pendingChoice) ||
        !x.run ||
        offered(x, "steal_agenda").length > 0 ||
        offered(x, "finish_access").length > 0,
    );
    r.fact(
      "legal(steal)",
      offered(s, "steal_agenda", obokata).length > 0 ||
        hasOption(s, "pay") ||
        hasOption(s, "steal"),
    );
    s = toAction(through(s, runOver, ["decline"]));
    r.snap("steal", s);
  },

  "1.16.1b.ex2": (r) => {
    const b = new Board(r, "runner", 5);
    b.identity("runner", "jesminder-sareen-girl-behind-the-curtain");
    b.ice("funhouse", "hq");
    b.hq("hedge-fund");
    let s = drive(
      run(b.s, "hq"),
      (x) =>
        Boolean(x.pendingChoice) ||
        !x.run ||
        x.timingKey === "run.encounterPaw",
    );
    r.fact("legal(take-tag)", hasOption(s, "tag"));
    if (s.pendingChoice) s = pick(s, hasOption(s, "end") ? "end" : "");
    s = toAction(through(s, runOver));
    r.snap("encounter", s);
  },

  "1.16.1c.ex1": (r) => {
    const b = new Board(r, "runner", 0);
    const zer0 = b.rig("zer0");
    b.rig("clan-vengeance");
    b.grip("diesel", "diesel", "diesel");
    b.stack("diesel", "diesel", "diesel", "diesel", "diesel");
    let s = take(b.s, "use_paid_ability", zer0);
    s = toAction(through(s, atAction));
    r.snap("first", s);
    const again = offered(s, "use_paid_ability", zer0)[0];
    r.fact("legal(second)", Boolean(again));
    if (again) s = toAction(through(must(s, again), atAction));
    r.snap("second", s);
  },

  "1.16.1c.ex2#a": (r) => {
    const b = new Board(r, "corp", 5);
    const [azef, server] = b.remote("azef-protocol");
    b.card(azef).advancementCounters = 2;
    b.root("sansan-city-grid", server, true);
    b.grip("diesel", "diesel", "diesel");
    const s = corpWindow(b.s);
    // The engine lists the score as legal and then refuses it; whether the
    // score can be carried out is what the example is about.
    r.fact("legal(score)", accepts(s, { type: "score_agenda", cardId: azef }));
    r.fact("listedAsLegal(score)", offered(s, "score_agenda", azef).length > 0);
    r.snap("score", s);
  },

  "1.16.1c.ex2#b": (r) => {
    const b = new Board(r, "corp", 5);
    const [azef, server] = b.remote("azef-protocol");
    b.card(azef).advancementCounters = 2;
    const sansan = b.root("sansan-city-grid", server, true);
    const white = b.ice("whitespace", "hq", false);
    b.grip("diesel", "diesel", "diesel");
    let s = corpWindow(b.s);
    const score = { type: "score_agenda", cardId: azef } as const;
    r.fact("legal(score)", accepts(s, score));
    s = must(s, score);
    // With one card that can pay the cost the engine asks nothing.
    r.fact("legal(trash-sansan)", hasOption(s, sansan));
    if (s.pendingChoice) s = pick(s, white);
    s = toAction(through(s, atAction));
    r.snap("score", s);
  },

  "1.16.1d.ex1": (r) => {
    const b = new Board(r, "runner", 0);
    b.identity("runner", "freedom-khumalo-crypto-anarchist");
    const [beanstalk] = b.rd("beanstalk-royalties");
    let s = drive(run(b.s, "rd"), (x) => offered(x, "access_card").length > 0);
    s = take(s, "access_card", beanstalk);
    // The engine offers Freedom Khumalo's ability as a choice on access.
    r.fact("legal(freedom)", hasOption(s, "khumalo"));
    s = toAction(through(s, runOver, ["khumalo"]));
    r.snap("freedom", s);
  },

  "1.16.2b.ex1": (r) => {
    const b = new Board(r, "runner", 10);
    b.identity("corp", "gamenet-where-dreams-are-real");
    const [, server] = b.remote("cayambe-grid", true);
    for (let i = 0; i < 3; i++) {
      const wall = b.ice("ice-wall", server, false);
      b.card(wall).advancementCounters = 1;
    }
    const s = through(
      run(b.s, server),
      (x) =>
        !x.run ||
        x.timingKey.startsWith("breach") ||
        offered(x, "access_card").length > 0,
      ["pay"],
    );
    r.snap("approach", s);
  },

  "1.16.2c.ex1": (r) => {
    const b = new Board(r, "corp", 10);
    const [abt] = b.remote("accelerated-beta-test");
    b.s.runner.tags = 3;
    const [psycho] = b.hq("psychographics");
    let s = take(b.s, "play_operation", psycho);
    const ids = optionIds(s);
    r.fact(
      "legal(x4)",
      ids.some((id) => /(^|[^0-9])4$/.test(id)),
    );
    r.fact(
      "legal(x0)",
      ids.some((id) => /(^|[^0-9])0$/.test(id)),
    );
    r.fact(
      "legal(x3)",
      ids.some((id) => /(^|[^0-9])3$/.test(id)),
    );
    s = pick(s, ids.find((id) => /(^|[^0-9])3$/.test(id)) ?? "3");
    s = toAction(through(s, atAction, [abt]));
    r.snap("x3", s);
  },

  "1.16.2e.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const abt = b.scored("corp", "accelerated-beta-test");
    const [grid, server] = b.remote("mahkota-langit-grid", true);
    b.card(grid).recurringCredits = 2;
    const biawak = b.ice("biawak", server, false);
    b.s.corp.credits = 2;
    let s = drive(run(b.s, server), (x) => x.timingKey === "run.approachPaw");
    const plain = { type: "rez_ice", cardId: biawak } as const;
    const forfeit = { ...plain, costCardIds: [abt] };
    r.fact("legal(rez-plain)", rezzesWithoutForfeit(s, biawak));
    const way = accepts(s, forfeit)
      ? forfeit
      : accepts(s, plain)
        ? plain
        : null;
    r.fact("legal(rez)", Boolean(way));
    if (way) {
      s = must(s, way);
      s = through(s, (x) => x.timingKey === "run.encounterPaw" || !x.run, [
        "rez-forfeit-discount",
        abt,
      ]);
    }
    r.snap("rez", s);
  },

  "1.16.2f.ex1": (r) => {
    const b = new Board(r, "corp", 10);
    const [glenn, server] = b.remote("glenn-station");
    b.card(glenn).advancementCounters = 4;
    b.root("tucana", server, true);
    b.ice("whitespace", "hq", false);
    const [logjam] = b.rd("logjam");
    let s = must(corpWindow(b.s), { type: "score_agenda", cardId: glenn });
    s = toAction(
      through(s, atAction, ["search", logjam!, "hq", "split-install:1"]),
    );
    r.snap("score", s);
  },

  "1.16.4d.ex1": (r) => {
    const b = new Board(r, "corp", 5);
    b.remote("jeeves-model-bioroids", true);
    const [beanstalk, blue] = b.hq(
      "beanstalk-royalties",
      "blue-level-clearance",
    );
    let s = toAction(through(take(b.s, "play_operation", beanstalk), atAction));
    r.snap("beanstalk", s);
    s = take(s, "play_operation", blue);
    s = through(
      s,
      (x) =>
        atAction(x) ||
        x.timingKey.startsWith("corp.discard") ||
        x.activeSide === "runner",
    );
    r.snap("blue-level", s);
  },

  "1.16.10a.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.grip("diesel", "diesel", "diesel", "diesel", "diesel");
    const [obokata] = b.hq("obokata-protocol");
    let s = drive(run(b.s, "hq"), (x) => offered(x, "access_card").length > 0);
    s = take(s, "access_card", obokata);
    s = drive(
      s,
      (x) =>
        Boolean(x.pendingChoice) ||
        !x.run ||
        offered(x, "steal_agenda").length > 0 ||
        offered(x, "finish_access").length > 0,
    );
    r.fact(
      "legal(pay)",
      offered(s, "steal_agenda", obokata).length > 0 ||
        hasOption(s, "pay") ||
        hasOption(s, "steal"),
    );
    r.fact(
      "legal(decline)",
      offered(s, "finish_access").length > 0 || hasOption(s, "decline"),
    );
    if (s.pendingChoice) s = pick(s, "decline");
    else s = take(s, "finish_access");
    s = toAction(through(s, runOver));
    r.snap("decline", s);
  },

  "1.16.10b.ex1#short": (r) => obokataMusashi(r, 1),
  "1.16.10b.ex1#paid": (r) => obokataMusashi(r, 2),

  "1.16.10c.ex1": (r) => {
    const b = new Board(r, "corp", 5);
    b.identity("corp", "ob-superheavy-logistics-extract-export-excel");
    const [azef] = b.remote("azef-protocol");
    b.card(azef).advancementCounters = 3;
    const [grid] = b.remote("mahkota-langit-grid", true);
    const [howler] = b.rd("howler");
    b.grip("diesel", "diesel", "diesel");
    let s = must(corpWindow(b.s), { type: "score_agenda", cardId: azef });
    if (s.pendingChoice && hasOption(s, grid)) s = pick(s, grid);
    // The engine does not stop between Ob's install and the rest of the
    // score. So the state "while Ob's ability resolves" is read at Ob's
    // last choice (where to install Howler), and Howler's rez right after.
    s = through(s, atAction, ["search", "yes", `choose-card:${howler}`]);
    r.snap("ob", s);
    const obOpen = Boolean(s.pendingChoice) && hasOption(s, "install-dest");
    s = through(s, atAction, ["install-dest:hq"]);
    if (obOpen) r.snapFor("ob", "rezzed(Howler)", s);
    s = toAction(through(s, atAction));
    r.snap("scored", s);
  },

  "1.16.11b.ex1#pay": (r) => paywall(r, "pay"),
  "1.16.11b.ex1#decline": (r) => paywall(r, "decline"),

  "1.17.1a.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.scored("runner", "accelerated-beta-test");
    b.scored("runner", "glenn-station");
    b.scored("corp", "next-big-thing");
    r.cannotObserve(
      "threat",
      "The engine has no accessor for the threat level; it is read where a Threat ability checks it.",
    );
    r.snap("read", b.s);
  },

  "1.18.2.ex1": (r) => {
    const b = new Board(r, "corp", 5);
    const [mushin, oaktown] = b.hq("mushin-no-shin", "oaktown-renovation");
    let s = take(b.s, "play_operation", mushin);
    s = toAction(through(s, atAction, [`mushin:${oaktown}`, "mushin-new"]));
    r.snap("mushin", s);
    s = toAction(
      through(
        take(s, "advance", oaktown),
        (x) =>
          atAction(x) ||
          x.activeSide === "runner" ||
          x.timingKey.startsWith("corp.discard"),
      ),
    );
    r.snap("advance", s);
  },

  "1.19.4.ex1": (r) => {
    const b = new Board(r, "runner", 0);
    const guy = b.rig("fall-guy");
    let s = take(
      runnerWindow(b.s),
      "use_paid_ability",
      guy,
      (a) => !JSON.stringify(a).toLowerCase().includes("prevent"),
    );
    s = toAction(through(s, atAction));
    r.snap("use", s);
  },

  "1.20.2.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.rig("t400-memory-diamond");
    for (const p of [
      "corroder",
      "atman",
      "femme-fatale",
      "llds-energy-regulator",
      "leprechaun",
    ])
      b.rig(p);
    // A basic action brings a checkpoint.
    const s = toAction(must(b.s, { type: "basic_gain_credit" }));
    r.snap("read", s);
  },
};

/** Whether rezzing with no forfeit is accepted and leaves the ice rezzed. */
function rezzesWithoutForfeit(s: GameState, iceId: string): boolean {
  try {
    const after = must(s, { type: "rez_ice", cardId: iceId });
    return Boolean(after.cards[iceId]?.rezzed) && !after.pendingChoice;
  } catch {
    return false;
  }
}

function obokataMusashi(r: Report, credits: number): void {
  const b = new Board(r, "runner", credits);
  b.grip("diesel", "diesel", "diesel", "diesel", "diesel", "diesel", "diesel");
  const [obokata, server] = b.remote("obokata-protocol");
  b.root("ben-musashi", server, true);
  const current = b.hq("predictive-algorithm")[0]!;
  // Put the current into play as the Corp would have on its turn.
  b.s.corp.hand = b.s.corp.hand.filter((id) => id !== current);
  b.card(current).zone = "corp:play-area";
  b.card(current).faceup = true;
  b.s.corp.playArea.push(current);
  let s = drive(run(b.s, server), (x) => offered(x, "access_card").length > 0);
  s = take(s, "access_card", obokata);
  s = drive(
    s,
    (x) =>
      Boolean(x.pendingChoice) ||
      !x.run ||
      offered(x, "steal_agenda").length > 0 ||
      offered(x, "finish_access").length > 0,
  );
  const steal = offered(s, "steal_agenda", obokata)[0];
  r.fact(
    "legal(steal)",
    Boolean(steal) || hasOption(s, "pay") || hasOption(s, "steal"),
  );
  if (credits >= 2) {
    if (steal) s = must(s, steal);
    s = through(s, (x) => !x.run || offered(x, "access_card").length > 0, [
      "pay",
    ]);
  }
  r.snap("steal", s);
}

function paywall(r: Report, answer: "pay" | "decline"): void {
  const b = new Board(r, "runner", 3);
  b.ice("paywall", "hq");
  b.hq("hedge-fund");
  let s = through(run(b.s, "hq"), passedIce, [
    answer === "pay" ? "unless-pay" : "unless-instruction",
  ]);
  if (answer === "decline") s = toAction(through(s, runOver));
  r.snap("sub", s);
}
