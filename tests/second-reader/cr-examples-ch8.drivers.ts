/**
 * Second reader, batch 1 (CR examples, chapter 8): one driver per case in
 * `cr-examples-ch8.json`. A driver builds the position, plays the listed
 * steps and reports. It does not say what should happen.
 *
 * Not a test file: vitest only runs `*.test.ts`.
 */
import type { GameState } from "../../src/index.js";
import { must, pick, toCorpTurn } from "../rulings/rulings-helpers.js";
import { Board, hasOption, offered, take } from "./harness.js";
import type { Report } from "./harness.js";
import {
  accessing,
  atAction,
  atEncounter,
  debug,
  drive,
  passedIce,
  raw,
  revealed,
  run,
  runnerWindow,
  runOver,
  through,
  toAction,
} from "./driving.js";
import type { Driver } from "./driving.js";

const encounterOrOver = (s: GameState): boolean => atEncounter(s) || !s.run;

const installDestination = (a: unknown): { kind: string; serverId?: string } =>
  (a as { destination: { kind: string; serverId?: string } }).destination;

/** The server an installed Corp card is in the root of or protecting. */
function serverOf(s: GameState, cardId: string): string {
  return (
    /^server:(.+):(root|ice)$/.exec(s.cards[cardId]?.zone ?? "")?.[1] ?? ""
  );
}

const sameServer = (s: GameState, a: string, b: string): boolean =>
  serverOf(s, a) !== "" && serverOf(s, a) === serverOf(s, b);

/** Break every subroutine of the encountered ice with one breaker. */
function breakAll(s: GameState, breakerId: string): GameState {
  for (let i = 0; i < 6; i++) {
    const next = offered(s, "break_subroutine", breakerId)[0];
    if (!next) return s;
    s = must(s, next);
  }
  return s;
}

/** The Corp's basic install of `cardId` into the root of `server`. */
function installInRoot(s: GameState, cardId: string, server: string) {
  return offered(s, "basic_install", cardId).filter(
    (a) => installDestination(a).serverId === server,
  );
}

/** Ad Blitz with X = 1 from HQ holding Ad Blitz and PAD Campaign. */
function adBlitz(r: Report, credits: number) {
  const b = new Board(r, "corp", credits);
  const [blitz, pad] = b.hq("ad-blitz", "pad-campaign");
  let s = take(b.s, "play_operation", blitz);
  debug(
    "ad blitz:",
    s.timingKey,
    JSON.stringify(s.pendingChoice?.options.map((o) => o.id)),
  );
  // X = 1, whichever way the engine asks for it.
  if (s.pendingChoice && !hasOption(s, pad!)) {
    s = through(s, (x) => atAction(x) || hasOption(x, pad!), [
      "x:1",
      "x-1",
      "1",
    ]);
  }
  debug(
    "ad blitz:",
    s.timingKey,
    JSON.stringify(s.pendingChoice?.options.map((o) => o.id)),
  );
  return { s, pad: pad! };
}

/** SMC and Patchwork with exactly 2 credits and Imp in the stack. */
function smcPatchwork(r: Report, grip: string[]) {
  const b = new Board(r, "runner", 2);
  const smc = b.rig("self-modifying-code");
  b.rig("patchwork");
  const inGrip = b.grip(...grip);
  const [imp] = b.stack("imp");
  const s = take(runnerWindow(b.s), "use_paid_ability", smc);
  debug(
    "smc:",
    s.timingKey,
    JSON.stringify(s.pendingChoice?.options.map((o) => o.id)),
  );
  return { s, imp: imp!, inGrip };
}

export const drivers: Record<string, Driver> = {
  "8.2.2.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const harbinger = b.rig("harbinger");
    b.rig("wasteland");
    const [corroder] = b.grip("corroder");
    // The engine's install is played as it is offered: any chance it gives
    // to trash a program first is taken, with Harbinger.
    let s = take(b.s, "basic_install", corroder);
    s = toAction(through(s, atAction, [harbinger, "trash", "done"]));
    r.snap("install", s);
  },

  "8.2.2a.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const corroder = b.rig("corroder");
    const construct = b.rig("sacrificial-construct");
    const district = b.rig("district-99");
    b.ice("rototurret", "hq");
    const oneRun = (s: GameState, prevent: boolean): GameState => {
      s = drive(run(s, "hq"), (x) => Boolean(x.pendingTrashProgram) || !x.run);
      if (s.pendingTrashProgram) {
        s = must(s, { type: "choose_trash_program", cardId: corroder });
      }
      const interrupt = offered(
        s,
        "trigger_pending_trash_interrupt",
        construct,
      )[0];
      const paid = offered(s, "use_paid_ability", construct)[0];
      debug(
        "trash:",
        s.timingKey,
        JSON.stringify(s.pendingChoice?.options.map((o) => o.id)),
        Boolean(interrupt),
        Boolean(paid),
      );
      if (prevent && interrupt) s = must(s, interrupt);
      else if (prevent && paid) s = must(s, paid);
      else if (prevent && hasOption(s, construct)) s = pick(s, construct);
      return toAction(
        through(s, atAction, [district, "accept", "yes", "place"]),
      );
    };
    let s = oneRun(b.s, true);
    r.snap("first-run", s);
    s = oneRun(s, false);
    r.snap("second-run", s);
  },

  "8.3.3b.ex1": (r) => {
    const b = new Board(r, "corp", 5);
    const [cultivate] = b.hq("cultivate");
    const [hedge, wall, enigma, pad, wos] = b.rd(
      "hedge-fund",
      "ice-wall",
      "enigma",
      "pad-campaign",
      "wall-of-static",
    );
    let s = take(b.s, "play_operation", cultivate);
    s = toAction(
      through(s, atAction, [
        `trash:${enigma}`,
        enigma!,
        `hq:${hedge}`,
        hedge!,
        `rd-arrange:${wos}`,
        `rd-arrange:${pad}`,
        `rd-arrange:${wall}`,
        wos!,
        pad!,
        wall!,
      ]),
    );
    r.fact(
      "rdTop",
      s.corp.deck.slice(0, 3).map((id) => s.cards[id]!.title),
    );
    r.cannotObserve(
      "runnerCanTell",
      "The comparison reads the engine's state, not what a seat is shown, so it cannot say what the Runner learns about where a card came from.",
    );
    r.snap("cultivate", s);
  },

  "8.4.3b.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.remote("daily-business-show", true);
    b.remote("raman-rai", true);
    const [, enigma] = b.rd("wraparound", "enigma");
    const tollbooth = b.archives("tollbooth", false);
    let s = toCorpTurn(b.s);
    s = through(s, atAction, [
      "raman",
      "accept",
      "yes",
      enigma!,
      tollbooth,
      `dbs-bottom:${tollbooth}`,
    ]);
    // Any further stop is Daily Business Show asking again: answer it.
    for (let i = 0; i < 10 && hasOption(s, "dbs-bottom") && !s.done; i++) {
      s = through(pick(s, "dbs-bottom"), atAction);
    }
    r.fact("rdBottom", s.cards[s.corp.deck[s.corp.deck.length - 1]!]?.title);
    r.snap("draw", s);
  },

  "8.5.5.ex1": (r) => {
    const b = new Board(r, "runner", 8);
    const [mass, dheg, blade, corroder] = b.grip(
      "mass-install",
      "dhegdheer",
      "gordian-blade",
      "corroder",
    );
    let s = b.s;
    const play = offered(s, "play_event", mass)[0];
    r.fact("legal(mass)", Boolean(play));
    if (play) {
      s = must(s, play);
      s = toAction(
        through(s, atAction, [
          dheg!,
          `host:${dheg}`,
          blade!,
          dheg!,
          corroder!,
          "rig",
          "done",
        ]),
      );
    }
    r.snap("mass", s);
  },

  "8.5.13a.ex1#a": (r) => {
    const b = new Board(r, "corp", 5);
    const [, remote] = b.remote("pad-campaign");
    const [ash] = b.hq("ash-2x3zb9cy");
    const ways = installInRoot(b.s, ash!, remote);
    r.fact("legal(install)", ways.length > 0);
    let s: GameState = b.s;
    if (ways[0])
      s = toAction(through(must(s, ways[0]), atAction, ["done", "none"]));
    r.fact(
      "sameServer(Ash 2X3ZB9CY,PAD Campaign)",
      sameServer(s, ash!, b.report.ids.get("PAD Campaign")!),
    );
    r.fact("revealed(Ash 2X3ZB9CY)", revealed(s, "Ash 2X3ZB9CY"));
    r.fact("revealed(PAD Campaign)", revealed(s, "PAD Campaign"));
    r.snap("install", s);
  },

  "8.5.13a.ex1#b": (r) => {
    const b = new Board(r, "corp", 5);
    const [, remote] = b.remote("pad-campaign");
    const [quest] = b.hq("daily-quest");
    const ways = installInRoot(b.s, quest!, remote);
    let s: GameState = b.s;
    if (ways[0])
      s = toAction(through(must(s, ways[0]), atAction, ["done", "none"]));
    r.fact("revealed(Daily Quest)", revealed(s, "Daily Quest"));
    r.fact("revealed(PAD Campaign)", revealed(s, "PAD Campaign"));
    r.snap("install", s);
  },

  "8.5.13a.ex2": (r) => {
    const b = new Board(r, "runner", 5);
    b.ice("bran-1-0", "rd");
    const [wall] = b.hq("wall-of-static");
    let s = drive(run(b.s, "rd"), encounterOrOver);
    s = must(s, { type: "break_bioroid_subroutine", subIndex: 1 });
    s = must(s, { type: "break_bioroid_subroutine", subIndex: 2 });
    s = must(s, { type: "pass_window" });
    s = through(s, passedIce, [wall!]);
    r.fact("revealed(Wall of Static)", revealed(s, "Wall of Static"));
    r.snap("bran", s);
  },

  "8.5.13b.ex1#a": (r) => {
    const b = new Board(r, "corp", 5);
    const [zato, remote] = b.remote("zato-city-grid", true);
    const [ash] = b.hq("ash-2x3zb9cy");
    const ways = installInRoot(b.s, ash!, remote);
    r.fact("legal(install)", ways.length > 0);
    let s: GameState = b.s;
    if (ways[0])
      s = toAction(through(must(s, ways[0]), atAction, ["done", "none"]));
    r.fact(
      "sameServer(Ash 2X3ZB9CY,ZATO City Grid)",
      sameServer(s, ash!, zato),
    );
    r.fact("revealed(Ash 2X3ZB9CY)", revealed(s, "Ash 2X3ZB9CY"));
    r.snap("install", s);
  },

  "8.5.13b.ex1#b": (r) => {
    const b = new Board(r, "corp", 5);
    const [zato, remote] = b.remote("zato-city-grid", true);
    const [grid] = b.hq("nanisivik-grid");
    const ways = installInRoot(b.s, grid!, remote);
    debug("region:", JSON.stringify(ways));
    // Each way the engine offers, played out: does ZATO City Grid survive it?
    const outcomes = ways.map((way) => {
      let s = must(b.s, way);
      s = through(s, atAction, ["choose-cards-done", "none"]);
      if (s.pendingChoice) s = through(s, atAction, [zato, "done"]);
      s = toAction(s);
      return {
        s,
        kept: serverOf(s, zato) === remote && serverOf(s, grid!) === remote,
      };
    });
    r.fact(
      "legal(keep)",
      outcomes.some((o) => o.kept),
    );
    const replaced = outcomes.find(
      (o) => !o.kept && serverOf(o.s, grid!) === remote,
    );
    r.fact("legal(replace)", Boolean(replaced));
    const s = replaced?.s ?? outcomes[0]?.s ?? b.s;
    r.fact(
      "revealed(Nanisivik Grid)",
      revealed(s, "Nanisivik Grid"),
      "replace",
    );
    r.snap("replace", s);
  },

  "8.5.13c.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.identity("corp", "ob-superheavy-logistics-extract-export-excel");
    b.remote("svyatogor-excavator", true);
    const portal = b.ice("cell-portal", "hq");
    b.scored("corp", "vanity-project");
    const [archer] = b.rd("archer");
    let s = toCorpTurn(b.s);
    s = through(s, atAction, [
      portal,
      "accept",
      "search",
      "yes",
      `choose-card:${archer}`,
      archer!,
      "install-dest:hq",
      "decline",
      "no",
    ]);
    debug(
      "ob:",
      s.timingKey,
      JSON.stringify(s.pendingChoice?.options.map((o) => o.id)),
    );
    r.fact("revealed(Archer)", revealed(s, "Archer"));
    r.snap("ob", s);
  },

  "8.5.13d.ex1": (r) => {
    const b = new Board(r, "corp", 5);
    b.s.runner.tags = 1;
    const sign = b.rig("gang-sign");
    const [trust] = b.hq("trust-operation");
    const office = b.archives("offworld-office", false);
    let s = take(b.s, "play_operation", trust);
    s = toAction(
      through(s, atAction, [
        sign,
        office,
        `choose-card:${office}`,
        "install-dest:__new_remote__",
        "new",
      ]),
    );
    r.fact("revealed(Offworld Office)", revealed(s, "Offworld Office"));
    r.snap("trust", s);
  },

  "8.5.13d.ex2#a": (r) => {
    const { s: asked, pad } = adBlitz(r, 5);
    const s = toAction(
      through(asked, atAction, [
        pad,
        `choose-card:${pad}`,
        "install-dest:__new_remote__",
        "new",
        "done",
      ]),
    );
    r.snap("blitz", s);
  },

  "8.5.13d.ex2#b": (r) => {
    const { s, pad } = adBlitz(r, 1);
    r.fact("legal(install)", hasOption(s, pad));
    r.snap("blitz", s);
    r.snap("install", s);
  },

  "8.5.14.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const [, remote] = b.remote("nanisivik-grid", true);
    const bran = b.archives("bran-1-0", false);
    const [wall] = b.hq("wall-of-static");
    let s = run(b.s, remote);
    s = through(s, (x) => Boolean(x.cards[bran]!.faceup) || !x.run, [
      `flip:${bran}:0`,
    ]);
    s = toAction(accessing(through(s, runOver, [wall!, "decline"])).s);
    r.snap("nanisivik", s);
  },

  "8.6.3.ex1": (r) => {
    const b = new Board(r, "corp", 5);
    b.s.runner.tags = 1;
    const [sub, hedge, growth] = b.hq(
      "subcontract",
      "hedge-fund",
      "lateral-growth",
    );
    const play = offered(b.s, "play_operation", sub)[0];
    r.fact("legal(subcontract)", Boolean(play));
    let s: GameState = b.s;
    if (play) {
      s = toAction(
        through(must(s, play), atAction, [hedge!, growth!, "decline", "done"]),
      );
    }
    r.snap("subcontract", s);
  },

  "8.6.4.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const [testRun] = b.grip("test-run");
    const [corroder] = b.stack("corroder", "diesel", "diesel", "diesel");
    let s = take(b.s, "play_event", testRun);
    s = toAction(through(s, atAction, ["stack", corroder!]));
    r.snap("play", s);
    s = toCorpTurn(s);
    r.fact("stackTop", s.cards[s.runner.deck[0]!]?.title, "turn-end");
    r.snap("turn-end", s);
  },

  "8.6.6a.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    const [epilogue] = b.grip("ashen-epilogue", "diesel", "diesel");
    b.heap("diesel", "diesel", "diesel");
    for (const id of b.s.runner.deck) delete b.s.cards[id];
    b.s.runner.deck = [];
    b.stack(...Array.from({ length: 10 }, () => "diesel"));
    let s = take(b.s, "play_event", epilogue);
    s = toAction(through(s, atAction));
    r.fact("runner.stack", s.runner.deck.length);
    r.snap("play", s);
  },

  "8.7.2b.ex1": (r) => {
    const b = new Board(r, "runner", 2);
    const colony = b.rig("artist-colony");
    const office = b.scored("runner", "offworld-office");
    const [corroder, femme, gamble] = b.stack(
      "corroder",
      "femme-fatale",
      "sure-gamble",
    );
    let s = take(runnerWindow(b.s), "use_paid_ability", colony);
    if (s.pendingChoice && hasOption(s, office)) s = pick(s, office);
    debug(
      "artist colony:",
      s.timingKey,
      JSON.stringify(s.pendingChoice?.options.map((o) => o.id)),
    );
    r.fact("legal(find-event)", hasOption(s, gamble!));
    r.fact("legal(find-femme)", hasOption(s, femme!));
    r.fact("legal(find-corroder)", hasOption(s, corroder!));
    if (hasOption(s, corroder!)) s = through(s, atAction, [corroder!]);
    r.snap("find-corroder", toAction(s));
  },

  "8.7.2b.ex2#a": (r) => {
    const { s: asked, imp, inGrip } = smcPatchwork(r, ["sure-gamble"]);
    let s = asked;
    if (hasOption(s, imp)) {
      s = through(s, atAction, [imp, inGrip[0]!, "patchwork", "accept", "yes"]);
    }
    s = toAction(s);
    // With one program to find the engine may ask nothing: the search was
    // legal if Imp could be chosen or ended up installed.
    r.fact(
      "legal(smc)",
      hasOption(asked, imp) || s.cards[imp]!.zone === "runner:installed",
    );
    r.snap("smc", s);
  },

  "8.7.2b.ex2#b": (r) => {
    const { s, imp } = smcPatchwork(r, []);
    r.fact("legal(find-imp)", hasOption(s, imp));
    r.snap("smc", s);
    r.snap("find-imp", s);
  },

  "8.7.2b.ex3": (r) => {
    const b = new Board(r, "runner", 5);
    b.s.corp.credits = 0;
    const [office, remote] = b.remote("offworld-office");
    b.root("tucana", remote, true);
    const [pharos] = b.rd("pharos");
    const done = accessing(run(b.s, remote), {
      choose: (_s, ids) => ids.find((id) => id === office),
      answers: [
        "search",
        "accept",
        "yes",
        pharos!,
        `install-dest:${remote}`,
        remote,
      ],
    });
    r.fact("revealed(Pharos)", revealed(done.s, "Pharos"));
    r.snap("steal", toAction(done.s));
  },

  "8.7.3.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.identity("corp", "near-earth-hub-broadcast-center");
    b.remote("tech-startup", true);
    const [pad] = b.rd("pad-campaign");
    let s = toCorpTurn(b.s);
    s = through(s, (x) => x.timingKey === "corp.mandatoryDraw" || atAction(x), [
      "accept",
      pad!,
      "install-dest:__new_remote__",
    ]);
    // The engine's log gives the order of the shuffle and the install.
    const log = s.log.join("\n");
    const shuffle = log.search(/shuffle R&D/);
    const install = log.search(/Corp installs a card/);
    debug("tech startup:", shuffle, install, s.timingKey);
    r.fact(
      "shuffledBeforeInstall",
      shuffle >= 0 && install >= 0 && shuffle < install,
    );
    r.fact("revealed(PAD Campaign)", revealed(s, "PAD Campaign"));
    // Before the mandatory draw: the hand the turn began with plus the draw.
    r.snap("startup", s);
  },

  "8.8.2.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.ice("metamorph", "hq");
    const [office] = b.remote("offworld-office");
    const [pad, remoteB] = b.remote("pad-campaign");
    const ash = b.root("ash-2x3zb9cy", remoteB);
    let s = drive(run(b.s, "hq"), encounterOrOver);
    s = raw(s, { type: "pass_window" });
    s = drive(s, (x) => Boolean(x.pendingChoice) || !x.run);
    debug(
      "metamorph:",
      JSON.stringify(s.pendingChoice?.options.map((o) => o.id)),
    );
    // The engine asks for the kind of swap, then for each card in turn. A
    // swap is legal when, having picked the agenda, the other card is offered.
    let stage = s;
    if (hasOption(stage, "meta-nonice")) stage = pick(stage, "meta-nonice");
    debug(
      "metamorph:",
      JSON.stringify(stage.pendingChoice?.options.map((o) => o.id)),
    );
    const pair = (other: string) =>
      (stage.pendingChoice?.options ?? []).some(
        (o) => o.id.includes(office!) && o.id.includes(other),
      );
    let afterOffice = stage;
    if (!pair(pad!) && !pair(ash) && hasOption(stage, office!)) {
      afterOffice = pick(stage, office!);
      debug(
        "metamorph:",
        JSON.stringify(afterOffice.pendingChoice?.options.map((o) => o.id)),
      );
    }
    // Offered is not enough: the engine must also carry the swap out.
    const carriedOut = (other: string): boolean => {
      if (afterOffice === stage || !hasOption(afterOffice, other)) return false;
      const done = pick(afterOffice, other);
      return serverOf(done, office!) !== serverOf(stage, office!);
    };
    const can = (other: string) => pair(other) || carriedOut(other);
    r.fact("legal(bad-swap)", can(ash));
    r.fact("legal(good-swap)", can(pad!));
    if (pair(pad!)) {
      s = pick(
        stage,
        stage.pendingChoice!.options.find(
          (o) => o.id.includes(office!) && o.id.includes(pad!),
        )!.id,
      );
    } else if (can(pad!)) s = pick(afterOffice, pad!);
    s = through(s, passedIce);
    r.fact(
      "sameServer(Offworld Office,Ash 2X3ZB9CY)",
      sameServer(s, office!, ash),
      "good-swap",
    );
    r.fact(
      "sameServer(Offworld Office,PAD Campaign)",
      sameServer(s, office!, pad!),
      "good-swap",
    );
    r.snap("good-swap", s);
  },

  "8.8.3a.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.ice("thimblerig", "hq");
    const [, remote] = b.remote("pad-campaign");
    const palisade = b.ice("palisade", remote);
    // Botulus goes onto Palisade through the engine's own install.
    const [botulus] = b.grip("botulus");
    let s = take(b.s, "basic_install", botulus, (a) =>
      JSON.stringify(a).includes(palisade),
    );
    s = toAction(through(s, atAction, [palisade]));
    s = toCorpTurn(s);
    s = toAction(through(s, atAction, [`swap-ice:${palisade}`, palisade]));
    r.snap("swap", s);
  },

  "8.8.4b.ex1": (r) => {
    const b = new Board(r, "runner", 5);
    b.identity("corp", "a-teia-ip-recovery");
    const corroder = b.rig("corroder");
    const [pad, remote] = b.remote("pad-campaign");
    b.ice("tatu-bola", remote);
    const [enigma, ash] = b.hq("enigma", "ash-2x3zb9cy");
    let s = drive(run(b.s, remote), encounterOrOver);
    s = breakAll(s, corroder);
    s = raw(s, { type: "pass_window" });
    s = drive(s, (x) => Boolean(x.pendingChoice) || passedIce(x));
    let teia = false;
    for (let i = 0; i < 8 && s.run && s.pendingChoice; i++) {
      const fromTeia =
        (s.pendingChoice as { sourceId?: string }).sourceId ===
        s.corp.identityId;
      teia ||= fromTeia;
      debug(
        "tatu-bola:",
        fromTeia,
        JSON.stringify(s.pendingChoice.options.map((o) => o.id)),
      );
      const want = [
        enigma!,
        "accept",
        "yes",
        ash!,
        "install-dest:__new_remote__",
        "new",
        `swap`,
      ].find((w) => hasOption(s, w));
      if (!want) break;
      s = drive(pick(s, want), (x) => Boolean(x.pendingChoice) || passedIce(x));
    }
    r.fact("offered(A Teia)", teia);
    r.fact("sameServer(Ash 2X3ZB9CY,PAD Campaign)", sameServer(s, ash!, pad));
    r.snap("pass", s);
  },
};
