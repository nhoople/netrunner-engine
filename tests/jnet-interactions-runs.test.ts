/**
 * jnet `game.core.runs-test` scenarios classified by CR audit session P1-l
 * (tool 1.8). Each board comes from mtgred/netrunner at
 * bc9e2fca073a5b21d247e72877804118e81d5472 (MIT; tests/jnet/NOTICE.md), and
 * each expectation is checked against the pinned CR v26.03 and printed card
 * text, not against jnet. The run-timing and forced-encounter boards are
 * evidence for area 14 (run flow) and RA-1 (timing); the replace-access
 * boards for area 8 (access). The class of each scenario is recorded in
 * tests/jnet/manifest.json.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  evalEffect,
  legalActions,
} from "../src/index.js";
import { trashCard } from "../src/state/procedures/trash.js";
import { breakerStrength } from "../src/effects/iceStrength.js";
import type { GameState, ServerId } from "../src/state/types.js";
import {
  approaching,
  board,
  card,
  choose,
  corpInstall,
  currentIce,
  driveRun,
  encountering,
  logText,
  must,
  paid,
  pass,
  passUntil,
  playEvent,
  rezNow,
  runnerInstall,
  settle,
  toAction,
} from "./jnet-boards.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.25");
});

function run(s: GameState, serverId: ServerId): GameState {
  return must(settle(s), { type: "basic_run", serverId });
}

/** Pass until the Corp may rez `iceId` in the approach window, then rez it. */
function rezOnApproach(s: GameState, iceId: string): GameState {
  s = passUntil(
    s,
    (x) =>
      legalActions(x).some((a) => a.type === "rez_ice" && a.cardId === iceId),
    `rez window for ${iceId}`,
  );
  return must(s, { type: "rez_ice", cardId: iceId });
}

function breakSub(s: GameState, breakerId: string, subIndex = 0): GameState {
  return must(s, { type: "break_subroutine", breakerId, subIndex });
}

function strength(s: GameState, cardId: string): number {
  return breakerStrength(s, cardId);
}

describe("run timing (CR 6.9): approach, encounter, movement", () => {
  // jnet: game.core.runs-test/run-timing-with-ice-and-a-breaker
  it("after the Runner breaks Ice Wall's only subroutine, the run passes the ice, reaches R&D and ends after the access (CR 6.5.5, 6.6.2, 6.7)", () => {
    let s = board({ corpHand: ["Ice Wall"], runnerHand: ["Corroder"] });
    s = corpInstall(s, "Ice Wall", "rd");
    s = toAction(s, "runner");
    s = runnerInstall(s, "Corroder");
    const iw = card(s, "Ice Wall").id;
    const cor = card(s, "Corroder").id;
    s = run(s, "rd");
    s = rezOnApproach(s, iw);
    s = passUntil(s, encountering(iw), "encounter Ice Wall");
    s = breakSub(s, cor, 0);
    s = passUntil(s, (x) => x.run?.phase === "movement", "movement");
    expect(s.run?.endedTheRun).toBe(false);
    s = passUntil(
      s,
      (x) => x.timingKey === "breach.awaitAccess" || !x.run,
      "R&D access",
    );
    expect(s.run?.successful).toBe(true);
  });

  // jnet: game.core.runs-test/run-timing-with-ice-with-on-encounter-effect
  it("Tollbooth charges 3 credits as the encounter begins, then its End the run subroutine ends the run (CR 6.5.2, 6.5.5)", () => {
    let s = board({ corpHand: ["Tollbooth"], corpCredits: 20 });
    s = corpInstall(s, "Tollbooth", "new");
    s = toAction(s, "runner");
    const tb = card(s, "Tollbooth").id;
    const remote = s.cards[tb]!.zone.split(":")[1]!;
    s = run(s, remote);
    s = rezOnApproach(s, tb);
    const before = s.runner.credits;
    s = passUntil(s, encountering(tb), "encounter Tollbooth");
    expect(s.runner.credits).toBe(before - 3);
    s = passUntil(s, (x) => !x.run, "run ends");
    expect(logText(s)).toMatch(/Resolve subroutine "End the run/);
    expect(s.turn.unsuccessfulRunThisTurn).toBe(true);
  });

  // jnet: game.core.runs-test/run-timing-with-paid-ability-before-ice-with-on-encounter-effect
  it("credits spent in the approach window are gone when Tollbooth asks for 3, so it ends the run (CR 6.9.2b, 1.2.3)", () => {
    let s = board({
      corpHand: ["Tollbooth"],
      corpCredits: 20,
      runnerHand: ["Self-modifying Code"],
      runnerDeck: ["Corroder"],
      runnerCredits: 4,
    });
    s = corpInstall(s, "Tollbooth", "new");
    s = toAction(s, "runner");
    s = runnerInstall(s, "Self-modifying Code");
    const tb = card(s, "Tollbooth").id;
    const smc = card(s, "Self-modifying Code").id;
    s = run(s, s.cards[tb]!.zone.split(":")[1]!);
    s = rezOnApproach(s, tb);
    s = passUntil(
      s,
      (x) =>
        legalActions(x).some(
          (a) => a.type === "use_paid_ability" && a.cardId === smc,
        ),
      "Runner priority in the approach window",
    );
    expect(s.run?.phase).toBe("approach_ice");
    s = paid(s, smc, "smc-search");
    if (s.pendingChoice) s = choose(s, "Corroder");
    expect(s.runner.credits).toBe(0);
    expect(card(s, "Corroder").zone).toBe("runner:installed");
    expect(s.run?.phase).toBe("approach_ice");
    s = passUntil(s, (x) => !x.run, "run ends");
    expect(s.runner.credits).toBe(0);
  });
});

describe("bypass (CR 6.5.8)", () => {
  // jnet: game.core.runs-test/run-timing-with-bypass
  it("Inside Job bypasses the first ice encountered: the Runner passes Ice Wall without its subroutine resolving (CR 6.5.8a)", () => {
    let s = board({ corpHand: ["Ice Wall"], runnerHand: ["Inside Job"] });
    s = corpInstall(s, "Ice Wall", "new");
    const iw = card(s, "Ice Wall").id;
    const remote = s.cards[iw]!.zone.split(":")[1]! as ServerId;
    s = rezNow(s, iw);
    s = toAction(s, "runner");
    s = playEvent(s, "Inside Job", remote);
    if (s.pendingChoice) s = choose(s, remote);
    s = passUntil(s, (x) => x.run?.phase === "movement", "movement");
    expect(s.run?.endedTheRun).toBe(false);
    expect(logText(s)).not.toMatch(/Resolve subroutine "End the run/);
    s = passUntil(
      s,
      (x) => legalActions(x).some((a) => a.type === "jack_out"),
      "jack-out window",
    );
    s = must(s, { type: "jack_out" });
    s = passUntil(s, (x) => !x.run, "run ends");
    expect(s.run).toBeNull();
  });

  // jnet: game.core.runs-test/run-timing-with-bypass-vs-cannot-be-bypassed
  it("Inside Job cannot bypass Guard, so the Runner encounters it and its subroutine ends the run (CR 1.2.2, 6.5.8a)", () => {
    let s = board({ corpHand: ["Guard"], runnerHand: ["Inside Job"] });
    s = corpInstall(s, "Guard", "new");
    s = toAction(s, "runner");
    const guard = card(s, "Guard").id;
    const remote = s.cards[guard]!.zone.split(":")[1]! as ServerId;
    s = playEvent(s, "Inside Job", remote);
    if (s.pendingChoice) s = choose(s, remote);
    s = rezOnApproach(s, guard);
    s = passUntil(s, encountering(guard), "encounter Guard");
    s = passUntil(s, (x) => !x.run, "run ends");
    expect(logText(s)).toMatch(/Resolve subroutine "End the run/);
    expect(s.turn.unsuccessfulRunThisTurn).toBe(true);
  });

  // jnet: game.core.runs-test/run-timing-with-bypass-vs-ice-with-on-encounter-effect
  it("Inside Job's bypass resolves before Tollbooth's toll, so the Runner keeps their credits (CR 6.5.8b, Inside Job ruling 2022-04-23)", () => {
    let s = board({
      corpHand: ["Tollbooth"],
      corpCredits: 20,
      runnerHand: ["Inside Job"],
    });
    s = corpInstall(s, "Tollbooth", "new");
    s = toAction(s, "runner");
    const tb = card(s, "Tollbooth").id;
    const remote = s.cards[tb]!.zone.split(":")[1]! as ServerId;
    s = playEvent(s, "Inside Job", remote);
    if (s.pendingChoice) s = choose(s, remote);
    s = rezOnApproach(s, tb);
    const credits = s.runner.credits;
    s = passUntil(s, (x) => x.run?.phase === "movement" || !x.run, "movement");
    expect(s.run?.phase).toBe("movement");
    expect(s.runner.credits).toBe(credits);
  });
});

describe("ending the run in the approach window (CR 6.1.4)", () => {
  // jnet: game.core.runs-test/run-timing-with-paid-ability-that-ends-the-run-during-encounter-border-control
  it("Border Control's trash ability ends the run before the Runner reaches Tollbooth, so no toll is paid (CR 6.1.4)", () => {
    let s = board({
      corpHand: ["Border Control", "Tollbooth"],
      corpCredits: 20,
    });
    s = corpInstall(s, "Tollbooth", "new");
    const tb = card(s, "Tollbooth").id;
    const remote = s.cards[tb]!.zone.split(":")[1]! as ServerId;
    s = rezNow(s, tb);
    s = corpInstall(s, "Border Control", remote);
    s = toAction(s, "runner");
    const bc = card(s, "Border Control").id;
    s = run(s, remote);
    s = rezOnApproach(s, bc);
    const credits = s.runner.credits;
    s = passUntil(
      s,
      (x) =>
        legalActions(x).some(
          (a) => a.type === "use_paid_ability" && a.cardId === bc,
        ),
      "Corp priority",
    );
    s = paid(s, bc, "border-control-trash-etr");
    s = passUntil(s, (x) => !x.run, "run ends");
    expect(s.runner.credits).toBe(credits);
    expect(s.cards[bc]!.zone).toBe("corp:archives");
  });
});

describe("the attacked server ceasing to exist (CR 4.6.8e)", () => {
  // jnet: game.core.runs-test/run-timing-trashing-a-solo-ice-on-an-empty-server-4940
  // Engine bug, filed under area 2 (the remote-deleted-mid-run crash):
  // passing the vacated position reads the deleted server and throws.
  it.skip("when Knifed trashes the only card in a remote, the server ceases to exist and the run ends (CR 4.6.8e)", () => {
    let s = board({
      corpHand: ["Ice Wall"],
      runnerHand: ["Corroder", "Knifed"],
      runnerCredits: 10,
    });
    s = corpInstall(s, "Ice Wall", "new");
    s = toAction(s, "runner");
    s = runnerInstall(s, "Corroder");
    const iw = card(s, "Ice Wall").id;
    const cor = card(s, "Corroder").id;
    const remote = s.cards[iw]!.zone.split(":")[1]! as ServerId;
    s = playEvent(s, "Knifed", remote);
    if (s.pendingChoice) s = choose(s, remote);
    s = rezOnApproach(s, iw);
    s = passUntil(s, encountering(iw), "encounter Ice Wall");
    s = breakSub(s, cor, 0);
    s = passUntil(s, (x) => !x.run, "run ends");
    expect(s.cards[iw]!.zone).toBe("corp:archives");
    expect(s.servers[remote]).toBeUndefined();
    expect(s.run).toBeNull();
  });
});

describe("moving the Runner to another server (CR 6.2.8b)", () => {
  // jnet: game.core.runs-test/run-timing-redirection-updates-current-ice-5047
  // Adapted: jnet calls its redirect-run helper; Susanoo-no-Mikoto's
  // subroutine is the card that moves the Runner here.
  // Engine bug, filed under area 2 beside Proprionegation's row:
  // redirect_susanoo_to_archives sets only the attacked server, so the
  // Runner passes Archives' outermost ice instead of approaching it.
  it.skip("after Susanoo-no-Mikoto moves the Runner to Archives, they approach the ice protecting Archives (CR 6.2.8b)", () => {
    let s = board({
      corpHand: ["Susanoo-no-Mikoto", "Ice Wall"],
      corpCredits: 20,
    });
    s = corpInstall(s, "Susanoo-no-Mikoto", "hq");
    s = corpInstall(s, "Ice Wall", "archives");
    const su = card(s, "Susanoo-no-Mikoto").id;
    const iw = card(s, "Ice Wall").id;
    s = rezNow(s, iw);
    s = toAction(s, "runner");
    s = run(s, "hq");
    s = rezOnApproach(s, su);
    s = passUntil(s, encountering(su), "encounter Susanoo");
    s = passUntil(
      s,
      (x) => x.run?.attackedServerId === "archives",
      "moved to Archives",
    );
    s = passUntil(s, approaching(iw), "approach Ice Wall");
    expect(s.run?.attackedServerId).toBe("archives");
    expect(currentIce(s)).toBe(iw);
    expect(logText(s)).toMatch(/Approach ice Ice Wall/);
  });

  // jnet: game.core.runs-test/run-timing-changing-phases-fires-end-of-encounter-events
  it("a breaker boosted during the encounter that moved the Runner is back to base strength once that encounter ends (CR 3.9.5b, 6.2.8b)", () => {
    let s = board({
      corpHand: ["Susanoo-no-Mikoto", "Ice Wall"],
      corpCredits: 20,
      runnerHand: ["Corroder"],
      runnerCredits: 10,
    });
    s = corpInstall(s, "Susanoo-no-Mikoto", "hq");
    s = corpInstall(s, "Ice Wall", "archives");
    const su = card(s, "Susanoo-no-Mikoto").id;
    const iw = card(s, "Ice Wall").id;
    s = rezNow(s, iw);
    s = toAction(s, "runner");
    s = runnerInstall(s, "Corroder");
    const cor = card(s, "Corroder").id;
    s = run(s, "hq");
    s = rezOnApproach(s, su);
    s = passUntil(s, encountering(su), "encounter Susanoo");
    const base = strength(s, cor);
    s = paid(s, cor, "corroder-pump");
    expect(strength(s, cor)).toBe(base + 1);
    s = passUntil(s, (x) => x.run?.encounter == null, "Susanoo encounter ends");
    expect(s.run?.attackedServerId).toBe("archives");
    expect(strength(s, cor)).toBe(base);
  });
});

/**
 * R&D protected by a rezzed Ice Wall with Ganked! in its root. The Runner
 * has Corroder, breaks Ice Wall on the way in, reaches the breach, and
 * accesses Ganked!; the Corp trashes it to force an encounter with Ice Wall.
 */
function gankedOnRd(): { s: GameState; iw: string; cor: string } {
  let s = board({
    corpHand: ["Ice Wall", "Ganked!"],
    runnerHand: ["Corroder"],
    runnerCredits: 10,
  });
  s = corpInstall(s, "Ice Wall", "rd");
  s = corpInstall(s, "Ganked!", "rd");
  const iw = card(s, "Ice Wall").id;
  s = rezNow(s, iw);
  s = toAction(s, "runner");
  s = runnerInstall(s, "Corroder");
  const cor = card(s, "Corroder").id;
  s = run(s, "rd");
  s = passUntil(s, encountering(iw), "encounter Ice Wall");
  s = breakSub(s, cor, 0);
  s = passUntil(s, (x) => x.timingKey === "breach.awaitAccess", "breach");
  s = must(s, { type: "access_card", cardId: card(s, "Ganked!").id });
  s = choose(s, "Trash Ganked!");
  s = passUntil(s, encountering(iw), "forced encounter with Ice Wall");
  return { s, iw, cor };
}

const accessOffered = (s: GameState, cardId: string): boolean =>
  legalActions(s).some((a) => a.type === "access_card" && a.cardId === cardId);

describe("forced encounters during a breach (CR 6.5.9)", () => {
  // jnet: game.core.runs-test/forced-encounters-forced-encounters-during-run
  it("after Ganked!'s forced encounter ends, the Runner goes on to access the rest of R&D (CR 6.5.9a, 6.5.9c)", () => {
    const b = gankedOnRd();
    let { s } = b;
    const { cor } = b;
    s = breakSub(s, cor, 0);
    s = passUntil(
      s,
      (x) =>
        !x.run ||
        (x.timingKey === "breach.awaitAccess" && !x.run.accessingCardId) ||
        legalActions(x).some((a) => a.type === "finish_access"),
      "back in the breach",
    );
    if (legalActions(s).some((a) => a.type === "finish_access")) {
      s = must(s, { type: "finish_access" });
    }
    s = passUntil(
      s,
      (x) => x.timingKey === "breach.awaitAccess" || !x.run,
      "next access",
    );
    const topOfRd = s.corp.deck[0]!;
    expect(s.run).not.toBeNull();
    expect(accessOffered(s, topOfRd)).toBe(true);
  });

  // Engine bug, filed under area 11 (6.5.9 forced encounters): the
  // Ganked!-class re-encounter sends the run back to the approach of the
  // ice and then through the pass-ice step at its position.
  it.skip("a forced encounter neither approaches nor passes the ice and leaves the Runner's position alone (CR 6.5.9a)", () => {
    let s = board({
      corpHand: ["Ice Wall", "Ganked!"],
      runnerHand: ["Corroder"],
      runnerCredits: 10,
    });
    s = corpInstall(s, "Ice Wall", "rd");
    s = corpInstall(s, "Ganked!", "rd");
    const iw = card(s, "Ice Wall").id;
    s = rezNow(s, iw);
    s = toAction(s, "runner");
    s = runnerInstall(s, "Corroder");
    const cor = card(s, "Corroder").id;
    s = run(s, "rd");
    s = passUntil(s, encountering(iw), "encounter Ice Wall");
    s = breakSub(s, cor, 0);
    s = passUntil(s, (x) => x.timingKey === "breach.awaitAccess", "breach");
    const positionAtBreach = s.run!.position;
    s = must(s, { type: "access_card", cardId: card(s, "Ganked!").id });
    const from = s.log.length;
    s = choose(s, "Trash Ganked!");
    s = passUntil(s, encountering(iw), "forced encounter");
    expect(s.run!.position).toBe(positionAtBreach);
    s = breakSub(s, cor, 0);
    s = passUntil(s, (x) => x.run?.encounter == null, "encounter ends");
    const after = s.log.slice(from).join("\n");
    expect(after).not.toMatch(/Approach ice/);
    expect(after).not.toMatch(/Pass ice/);
    expect(s.run!.position).toBe(positionAtBreach);
    expect(s.run!.phase).not.toBe("movement");
  });

  // jnet: game.core.runs-test/forced-encounters-forced-encounters-during-run
  it("End the run in Ganked!'s forced encounter ends the run and its breach, so nothing more in R&D is accessed (CR 6.5.9b, 6.1.4a)", () => {
    let { s } = gankedOnRd();
    s = passUntil(s, (x) => !x.run, "run ends");
    expect(s.run).toBeNull();
    expect(s.log.join("\n")).not.toMatch(/Accessed Hedge Fund/);
  });

  // Engine bug, filed under area 14 (6.8.4a): the run reached the Success
  // Phase, but ending it from the forced encounter declares it unsuccessful.
  it.skip("a run ended from a forced encounter in its breach is not declared unsuccessful (CR 6.8.4a)", () => {
    let { s } = gankedOnRd();
    s = passUntil(s, (x) => !x.run, "run ends");
    expect(s.turn.unsuccessfulRunThisTurn).toBe(false);
    expect(s.log.join("\n")).not.toMatch(
      /run is unsuccessful|declared unsuccessful/,
    );
  });

  // jnet: game.core.runs-test/forced-encounters-forced-encounters-during-run (Remote)
  it("End the run in Ganked!'s forced encounter on a remote stops the breach before the other root card is accessed (CR 6.5.9b, 6.1.4a)", () => {
    let s = board({
      corpHand: ["Ice Wall", "Ganked!", "PAD Campaign"],
      runnerHand: ["Corroder"],
      runnerCredits: 10,
    });
    s = corpInstall(s, "Ice Wall", "new");
    const iw = card(s, "Ice Wall").id;
    const remote = s.cards[iw]!.zone.split(":")[1]! as ServerId;
    s = corpInstall(s, "Ganked!", remote);
    s = rezNow(s, iw);
    s = toAction(s, "corp");
    s = corpInstall(s, "PAD Campaign", remote);
    s = toAction(s, "runner");
    s = runnerInstall(s, "Corroder");
    const cor = card(s, "Corroder").id;
    const pad = card(s, "PAD Campaign").id;
    s = run(s, remote);
    s = passUntil(s, encountering(iw), "encounter Ice Wall");
    s = breakSub(s, cor, 0);
    s = passUntil(s, (x) => x.timingKey === "breach.awaitAccess", "breach");
    expect(accessOffered(s, pad)).toBe(true);
    s = must(s, { type: "access_card", cardId: card(s, "Ganked!").id });
    s = choose(s, "Trash Ganked!");
    s = passUntil(s, encountering(iw), "forced encounter");
    s = passUntil(s, (x) => !x.run, "run ends");
    expect(s.log.join("\n")).not.toMatch(/Accessed PAD Campaign/);
  });

  // jnet: game.core.runs-test/forced-encounters-ice-breakers-and-broken-subroutines-reset-after-a-forced-encounter-ends
  it("a breaker boosted in a forced encounter is back to base strength when it ends, and access goes on (CR 3.9.5b, 6.5.9a)", () => {
    const b = gankedOnRd();
    let { s } = b;
    const { cor } = b;
    const base = strength(s, cor);
    s = paid(s, cor, "corroder-pump");
    expect(strength(s, cor)).toBe(base + 1);
    s = breakSub(s, cor, 0);
    s = passUntil(s, (x) => x.run?.encounter == null, "encounter ends");
    expect(strength(s, cor)).toBe(base);
    expect(s.run).not.toBeNull();
  });
});

/** Answer an open psi game: the Runner bids `runner`, the Corp `corp`. */
function psi(s: GameState, runner: number, corp: number): GameState {
  for (let i = 0; i < 4; i++) {
    const legal = legalActions(s);
    if (legal.some((a) => a.type === "psi_runner_bid")) {
      s = must(s, { type: "psi_runner_bid", amount: runner });
    } else if (legal.some((a) => a.type === "psi_corp_bid")) {
      s = must(s, { type: "psi_corp_bid", amount: corp });
    } else return s;
  }
  return s;
}

const psiOpen = (s: GameState): boolean =>
  legalActions(s).some(
    (a) => a.type === "psi_runner_bid" || a.type === "psi_corp_bid",
  );

/** HQ: Konjin. R&D: Bullfrog or Cell Portal. Archives: Ice Wall. All rezzed. */
function konjinBoard(other: "Bullfrog" | "Cell Portal", extra: string[] = []) {
  let s = board({
    corpHand: ["Ice Wall", "Konjin", other, ...extra],
    corpCredits: 20,
    runnerCredits: 10,
  });
  s = corpInstall(s, "Ice Wall", "archives");
  s = corpInstall(s, other, "rd");
  s = corpInstall(s, "Konjin", "hq");
  const ids = {
    iw: card(s, "Ice Wall").id,
    other: card(s, other).id,
    kj: card(s, "Konjin").id,
  };
  for (const id of Object.values(ids)) s = rezNow(s, id);
  s = toAction(s, "runner");
  return { s, ...ids };
}

// Engine bugs block these boards, both filed under area 11 (6.5 encounters):
// matching Konjin bids restart the Konjin encounter, so another psi game
// starts each time; and Konjin's forced encounters are not marked as forced,
// so the encounter runs through an approach and a pass-ice step and trips
// the ENCOUNTER_ICE_MISMATCH invariant (CR 6.5.9a). Each test states the
// CR result; the Bullfrog and Cell Portal end states already match it.
describe("forced encounters that move the Runner (CR 6.5.9d)", () => {
  // jnet: game.core.runs-test/forced-encounters-forced-encounters-redirection
  // (the first two testing blocks are the same board)
  it.skip("when Bullfrog, forced by Konjin, moves itself to Archives, the run goes on from Bullfrog's new position: Konjin's encounter finishes, then the Runner meets Ice Wall (CR 6.5.9d, 6.2.7d)", () => {
    const b = konjinBoard("Bullfrog");
    let { s } = b;
    const { iw, other: bf, kj } = b;
    s = run(s, "hq");
    s = passUntil(s, psiOpen, "Konjin's psi game");
    s = psi(s, 1, 0);
    s = choose(s, "Bullfrog");
    s = passUntil(
      s,
      (x) => x.run?.encounter?.iceId === bf && psiOpen(x),
      "Bullfrog's psi game",
    );
    s = psi(s, 1, 0);
    s = choose(s, "archives");
    expect(s.servers.archives!.ice[0]).toBe(bf);
    expect(s.run?.attackedServerId).toBe("archives");
    s = passUntil(s, encountering(iw), "encounter Ice Wall");
    expect(s.run?.attackedServerId).toBe("archives");
    expect(s.cards[kj]!.zone).toBe("server:hq:ice");
  });

  // jnet: game.core.runs-test/forced-encounters-forced-encounters-redirection
  it.skip("when Cell Portal, forced by Konjin, moves the Runner to the outermost position of HQ, they approach and encounter Konjin again (CR 6.5.9d, 6.2.8b)", () => {
    const b = konjinBoard("Cell Portal");
    let { s } = b;
    const { other: cp, kj } = b;
    s = run(s, "hq");
    s = passUntil(s, psiOpen, "Konjin's psi game");
    s = psi(s, 1, 0);
    s = choose(s, "Cell Portal");
    s = passUntil(
      s,
      (x) =>
        x.run?.encounter?.iceId === cp && x.timingKey === "run.encounterPaw",
      "encounter Cell Portal",
    );
    s = passUntil(
      s,
      (x) => x.pendingChoice != null || x.run?.encounter == null,
      "Cell Portal's subroutine",
    );
    if (s.pendingChoice) s = choose(s, "Continue the run");
    s = passUntil(s, (x) => x.run?.encounter == null, "encounters end");
    expect(s.run?.attackedServerId).toBe("hq");
    expect(s.cards[cp]!.rezzed).toBe(false);
    s = passUntil(s, psiOpen, "Konjin's psi game again");
    expect(s.run?.encounter?.iceId).toBe(kj);
  });

  // jnet: game.core.runs-test/forced-encounters-forced-encounters-redirection
  it.skip("in the breach, Bullfrog moving itself does not move the Runner: the run stays on HQ and the access goes on (CR 6.2.8c, 6.5.9d)", () => {
    const b = konjinBoard("Bullfrog", ["Ganked!"]);
    let { s } = b;
    const { other: bf, kj } = b;
    s = run(s, "hq");
    s = passUntil(s, psiOpen, "Konjin's psi game");
    s = psi(s, 0, 0);
    s = passUntil(s, (x) => x.timingKey === "breach.awaitAccess", "breach");
    s = must(s, { type: "access_card", cardId: card(s, "Ganked!").id });
    s = choose(s, "Trash Ganked!");
    if (s.pendingChoice) s = choose(s, "Konjin");
    s = passUntil(s, psiOpen, "Konjin's psi game in the forced encounter");
    expect(s.run?.encounter?.iceId).toBe(kj);
    s = psi(s, 1, 0);
    s = choose(s, "Bullfrog");
    s = passUntil(
      s,
      (x) => x.run?.encounter?.iceId === bf && psiOpen(x),
      "Bullfrog's psi game",
    );
    s = psi(s, 1, 0);
    s = choose(s, "archives");
    expect(s.servers.archives!.ice[0]).toBe(bf);
    expect(s.run?.attackedServerId).toBe("hq");
    expect(s.run?.successful).toBe(true);
  });
});

describe("Konjin's psi game (CR 10.14, Konjin's printed text)", () => {
  // Engine bug, filed under area 11 and listed as a fix-now finding: with
  // matching bids the Konjin encounter starts again and so does its psi game.
  it.skip("when the Konjin bids match, nothing more happens and the Runner goes on past Konjin after one psi game (CR 10.14.6, 6.5.6)", () => {
    const b = konjinBoard("Bullfrog");
    let { s } = b;
    const { kj } = b;
    s = run(s, "hq");
    s = passUntil(s, psiOpen, "Konjin's psi game");
    s = psi(s, 0, 0);
    expect(psiOpen(s)).toBe(false);
    s = passUntil(s, (x) => x.run?.phase === "movement", "movement");
    expect(s.run?.encounter).toBeNull();
    expect(s.log.filter((l) => /Psi game initiated/.test(l))).toHaveLength(1);
    expect(s.cards[kj]!.zone).toBe("server:hq:ice");
  });

  // jnet: game.core.runs-test/forced-encounters-forced-encounters-during-run (stacked)
  // Blocked by the same two bugs as the boards above.
  it.skip("a forced encounter inside a forced encounter in the breach: End the run from the inner one ends the run and stops the access (CR 6.5.9b, 6.1.4a)", () => {
    let s = board({
      corpHand: ["Konjin", "Ice Wall", "Ganked!"],
      corpCredits: 20,
      runnerCredits: 10,
    });
    s = corpInstall(s, "Konjin", "rd");
    s = corpInstall(s, "Ice Wall", "hq");
    s = corpInstall(s, "Ganked!", "rd");
    const kj = card(s, "Konjin").id;
    const iw = card(s, "Ice Wall").id;
    s = rezNow(s, kj);
    s = rezNow(s, iw);
    s = toAction(s, "runner");
    s = run(s, "rd");
    s = passUntil(s, psiOpen, "Konjin's psi game");
    s = psi(s, 0, 0);
    s = passUntil(s, (x) => x.timingKey === "breach.awaitAccess", "breach");
    s = must(s, { type: "access_card", cardId: card(s, "Ganked!").id });
    s = choose(s, "Trash Ganked!");
    if (s.pendingChoice) s = choose(s, "Konjin");
    s = passUntil(s, psiOpen, "Konjin's psi game in the forced encounter");
    s = psi(s, 1, 0);
    s = choose(s, "Ice Wall");
    s = passUntil(s, encountering(iw), "inner forced encounter with Ice Wall");
    s = passUntil(s, (x) => !x.run, "run ends");
    expect(s.log.join("\n")).not.toMatch(/Accessed Hedge Fund/);
  });
});

/** Runner with Security Testing set on HQ at the start of their turn. */
function securityTestingOnHq(extraGrip: string[] = []): GameState {
  let s = board({
    corpHand: ["Hedge Fund"],
    runnerHand: ["Security Testing", ...extraGrip],
  });
  s = toAction(s, "runner");
  s = runnerInstall(s, "Security Testing");
  s = toAction(s, "corp");
  for (let i = 0; i < 40 && s.timingKey !== "runner.takeAction"; i++) {
    if (s.pendingChoice) {
      s = choose(s, "Choose hq");
      continue;
    }
    if (s.timingKey === "corp.takeAction") {
      s = must(s, { type: "basic_gain_credit" });
      continue;
    }
    const legal = legalActions(s);
    if (legal.some((a) => a.type === "discard_to_hand_size")) {
      s = must(s, { type: "discard_to_hand_size" });
      continue;
    }
    s = pass(s);
  }
  expect(s.timingKey).toBe("runner.takeAction");
  return s;
}

describe("replacing the breach (CR 6.7.4c, 9.9.11)", () => {
  // jnet: game.core.runs-test/replace-access-you-may-only
  it("Account Siphon lets the Runner choose its effect instead of breaching HQ; then nothing in HQ is accessed (CR 6.7.4c)", () => {
    let s = board({ corpHand: ["Hedge Fund"], runnerHand: ["Account Siphon"] });
    s = toAction(s, "runner");
    s = playEvent(s, "Account Siphon", "hq");
    let offered: string[] = [];
    const corp = s.corp.credits;
    const runner = s.runner.credits;
    s = driveRun(s, (labels) => {
      offered = labels;
      return labels.find((l) => /loses 5/.test(l)) ?? labels[0]!;
    });
    expect(offered).toContain("Breach HQ");
    expect(s.corp.credits).toBe(corp - 5);
    expect(s.runner.credits).toBe(runner + 10);
    expect(s.runner.tags).toBe(2);
    expect(logText(s)).not.toMatch(/Accessed Hedge Fund/);
  });

  // jnet: game.core.runs-test/replace-access-you-may-only
  it("choosing to breach HQ instead of Account Siphon's effect gives the normal access (CR 6.7.4c)", () => {
    let s = board({ corpHand: ["Hedge Fund"], runnerHand: ["Account Siphon"] });
    s = toAction(s, "runner");
    s = playEvent(s, "Account Siphon", "hq");
    const runner = s.runner.credits;
    s = driveRun(s, () => "Breach HQ");
    expect(logText(s)).toMatch(/Accessed Hedge Fund/);
    expect(s.runner.tags).toBe(0);
    expect(s.runner.credits).toBe(runner);
  });

  // jnet: game.core.runs-test/replace-access-must-replacement-effects-only
  it("Security Testing's gain replaces the breach on the chosen server with no choice offered (CR 9.9.8b)", () => {
    let s = securityTestingOnHq();
    const runner = s.runner.credits;
    s = run(s, "hq");
    let asked = false;
    s = driveRun(s, (labels) => {
      asked = true;
      return labels[0]!;
    });
    expect(asked).toBe(false);
    expect(s.runner.credits).toBe(runner + 2);
    expect(logText(s)).not.toMatch(/Accessed Hedge Fund/);
  });

  // jnet: game.core.runs-test/replace-access-you-may-and-must-replacement-effects
  it("with Account Siphon and Security Testing both able to replace the breach, the Runner picks one and the other no longer applies (CR 9.9.11, 9.9.11a)", () => {
    let s = securityTestingOnHq(["Account Siphon"]);
    s = playEvent(s, "Account Siphon", "hq");
    const corp = s.corp.credits;
    const runner = s.runner.credits;
    let first: string[] | null = null;
    s = driveRun(s, (labels) => {
      first ??= labels;
      return (
        labels.find((l) => /Apply Account Siphon/.test(l)) ??
        labels.find((l) => /loses 5/.test(l)) ??
        labels[0]!
      );
    });
    expect(first).toEqual(
      expect.arrayContaining([
        "Apply Security Testing",
        "Apply Account Siphon",
      ]),
    );
    expect(first).not.toContain("Breach HQ");
    expect(s.corp.credits).toBe(corp - 5);
    expect(s.runner.credits).toBe(runner + 10);
    expect(s.runner.tags).toBe(2);
    expect(logText(s)).not.toMatch(/Accessed Hedge Fund/);
  });
});

describe("end the run with no run in progress (CR 6.1.4c)", () => {
  // jnet: game.core.runs-test/etr-outside-of-runs-does-not-prevent-new-runs
  // Adapted: jnet fires Ice Wall's subroutine with its debug command; here
  // the subroutine's effect is resolved directly, as no card does this.
  it("Ice Wall's End the run resolved outside any run does nothing, and the Runner can still start a run (CR 6.1.4c)", () => {
    let s = board({ corpHand: ["Ice Wall"] });
    s = corpInstall(s, "Ice Wall", "hq");
    const iw = card(s, "Ice Wall").id;
    s = rezNow(s, iw);
    s = toAction(s, "runner");
    const result = evalEffect(
      { state: s, sourceId: iw },
      s.cards[iw]!.subroutines![0]!.effect,
    );
    expect(result.ok).toBe(true);
    expect(s.run).toBeNull();
    s = run(s, "rd");
    expect(s.run?.attackedServerId).toBe("rd");
    expect(s.run?.endedTheRun).toBe(false);
  });
});

/**
 * HQ protected, outermost to innermost, by Wall of Static, Ice Wall and
 * Vanilla, all rezzed. The Runner has Corroder and credits to break them.
 */
function threeIceOnHq() {
  let s = board({
    corpHand: ["Vanilla", "Ice Wall", "Wall of Static"],
    corpCredits: 10,
    runnerHand: ["Corroder"],
    runnerCredits: 20,
  });
  s = corpInstall(s, "Vanilla", "hq");
  s = corpInstall(s, "Ice Wall", "hq");
  s = corpInstall(s, "Wall of Static", "hq");
  const ids = {
    vanilla: card(s, "Vanilla").id,
    iw: card(s, "Ice Wall").id,
    ws: card(s, "Wall of Static").id,
  };
  for (const id of Object.values(ids)) s = rezNow(s, id);
  s = toAction(s, "runner");
  s = runnerInstall(s, "Corroder");
  const cor = card(s, "Corroder").id;
  expect(s.servers.hq!.ice).toEqual([ids.ws, ids.iw, ids.vanilla]);
  return { s, cor, ...ids };
}

/** Pump Corroder to the encountered ice's strength and break its subroutine. */
function breakThrough(s: GameState, cor: string): GameState {
  for (let i = 0; i < 4; i++) {
    const brk = legalActions(s).find(
      (a) => a.type === "break_subroutine" && a.breakerId === cor,
    );
    if (brk) return must(s, brk);
    s = paid(s, cor, "corroder-pump");
  }
  throw new Error("Corroder could not break");
}

describe("ice trashed during a run (CR 6.2.7)", () => {
  // jnet: game.core.runs-test/ice-trashed-during-approach-does-not-reapproach-passed-ice
  it("trashing the approached middle ice sends the Runner to the Movement Phase, and they next approach the ice inward of it, not the ice already passed (CR 6.2.7a, 6.6.4)", () => {
    const b = threeIceOnHq();
    let { s } = b;
    const { cor, ws, iw, vanilla } = b;
    s = run(s, "hq");
    s = passUntil(s, encountering(ws), "encounter Wall of Static");
    s = breakThrough(s, cor);
    s = passUntil(s, approaching(iw), "approach Ice Wall");
    trashCard(s, iw, { by: "corp" });
    s = passUntil(s, (x) => x.run?.phase === "movement", "movement");
    s = passUntil(s, approaching(vanilla), "approach Vanilla");
    expect(currentIce(s)).toBe(vanilla);
    expect(logText(s).match(/Approach ice Wall of Static/g)).toHaveLength(1);
  });

  // jnet: game.core.runs-test/ice-trashed-during-approach-does-not-reapproach-passed-ice
  it("trashing the approached innermost ice sends the Runner to the Movement Phase and then to the server (CR 6.2.7a, 6.6.6)", () => {
    const b = threeIceOnHq();
    let { s } = b;
    const { cor, ws, iw, vanilla } = b;
    s = run(s, "hq");
    s = passUntil(s, encountering(ws), "encounter Wall of Static");
    s = breakThrough(s, cor);
    s = passUntil(s, encountering(iw), "encounter Ice Wall");
    s = breakThrough(s, cor);
    s = passUntil(s, approaching(vanilla), "approach Vanilla");
    trashCard(s, vanilla, { by: "corp" });
    s = passUntil(
      s,
      (x) => x.run?.phase === "success" || x.timingKey === "breach.awaitAccess",
      "success",
    );
    expect(s.run?.successful).toBe(true);
  });

  // jnet: game.core.runs-test/ice-trashed-during-encounter-does-not-reapproach-passed-ice
  it("trashing the encountered middle ice ends the encounter, and the Runner next approaches the ice inward of it (CR 6.2.7c, 6.6.4)", () => {
    const b = threeIceOnHq();
    let { s } = b;
    const { cor, ws, iw, vanilla } = b;
    s = run(s, "hq");
    s = passUntil(s, encountering(ws), "encounter Wall of Static");
    s = breakThrough(s, cor);
    s = passUntil(s, encountering(iw), "encounter Ice Wall");
    trashCard(s, iw, { by: "corp" });
    s = passUntil(s, (x) => x.run?.phase === "movement", "movement");
    s = passUntil(s, approaching(vanilla), "approach Vanilla");
    expect(logText(s).match(/Approach ice Wall of Static/g)).toHaveLength(1);
  });

  // jnet: game.core.runs-test/ice-trashed-during-encounter-does-not-reapproach-passed-ice
  it("trashing the encountered innermost ice ends the encounter and the Runner goes on to the server (CR 6.2.7c, 6.6.6)", () => {
    const b = threeIceOnHq();
    let { s } = b;
    const { cor, ws, iw, vanilla } = b;
    s = run(s, "hq");
    s = passUntil(s, encountering(ws), "encounter Wall of Static");
    s = breakThrough(s, cor);
    s = passUntil(s, encountering(iw), "encounter Ice Wall");
    s = breakThrough(s, cor);
    s = passUntil(s, encountering(vanilla), "encounter Vanilla");
    trashCard(s, vanilla, { by: "corp" });
    s = passUntil(
      s,
      (x) => x.run?.phase === "success" || x.timingKey === "breach.awaitAccess",
      "success",
    );
    expect(s.run?.successful).toBe(true);
  });
});

// jnet: game.core.runs-test/forced-encounters-forced-encounters-outside-of-run
// Engine bug, filed under area 14 (6.1.4b): Quest Completed's access
// outside a run is modelled as a run on the remote, so ending the forced
// encounter from it declares an unsuccessful run. CR 6.1.4b resolves no
// other Run Ends step. (Quest Completed itself was fixed by FX-salem.)
describe.skip("forced encounters outside a run (CR 6.1.4b, 6.5.9a)", () => {
  function questCompletedIntoLittleEngine(runnerHand: string[]) {
    let s = board({
      corpHand: ["Little Engine", "Ganked!"],
      corpCredits: 20,
      runnerHand: [...runnerHand, "Quest Completed"],
      runnerCredits: 20,
    });
    s = corpInstall(s, "Little Engine", "new");
    const le = card(s, "Little Engine").id;
    const remote = s.cards[le]!.zone.split(":")[1]! as ServerId;
    s = corpInstall(s, "Ganked!", remote);
    s = rezNow(s, le);
    s = toAction(s, "runner");
    for (const t of runnerHand) s = runnerInstall(s, t);
    s = toAction(s, "corp");
    s = toAction(s, "runner");
    for (const server of ["archives", "rd", "hq"] as const) {
      s = run(s, server);
      s = driveRun(s, (labels) => labels[0]!);
    }
    s = playEvent(s, "Quest Completed");
    // The option does not name the facedown card (CR 1.21.1).
    s = choose(s, "Access unrezzed card");
    s = passUntil(s, (x) => x.timingKey === "breach.awaitAccess", "the access");
    s = must(s, { type: "access_card", cardId: card(s, "Ganked!").id });
    s = choose(s, "Trash Ganked!");
    s = passUntil(s, encountering(le), "forced encounter with Little Engine");
    return { s, le };
  }

  it("End the run in a forced encounter outside a run ends only that encounter: the third subroutine does not resolve and no run is declared unsuccessful (CR 6.1.4b)", () => {
    let { s } = questCompletedIntoLittleEngine([]);
    const credits = s.runner.credits;
    s = passUntil(s, (x) => !x.run, "encounter ends");
    expect(s.runner.credits).toBe(credits);
    expect(s.turn.unsuccessfulRunThisTurn).toBe(false);
  });

  it("jacking out with Flip Switch in a forced encounter outside a run ends that encounter (CR 6.1.5, 6.1.4b)", () => {
    let { s } = questCompletedIntoLittleEngine(["Flip Switch"]);
    const credits = s.runner.credits;
    s = paid(s, card(s, "Flip Switch").id, "flip-switch-jack-out");
    s = passUntil(s, (x) => !x.run, "encounter ends");
    expect(s.runner.credits).toBe(credits);
    expect(s.turn.unsuccessfulRunThisTurn).toBe(false);
  });
});
