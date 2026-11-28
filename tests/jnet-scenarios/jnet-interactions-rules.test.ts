/**
 * jnet `game.core.rules-test`, `engine-test` and `costs-test` scenarios
 * classified by CR audit session P1-l (tool 1.8). Each board comes from
 * mtgred/netrunner at bc9e2fca073a5b21d247e72877804118e81d5472 (MIT;
 * tests/jnet/NOTICE.md), and each expectation is checked against the pinned
 * CR v26.03 and printed card text, not against jnet. The class of each
 * scenario is recorded in tests/jnet/manifest.json.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getPublicView,
  legalActions,
} from "../../src/index.js";
import { trashCard } from "../../src/state/hostingAndTrash/trash.js";
import {
  memoryLimit,
  usedMemory,
} from "../../src/state/turnAndActions/turn.js";
import type { GameState } from "../../src/state/types/game.js";
import type { ServerId } from "../../src/state/types/servers.js";
import { applyIntent } from "../../src/index.js";
import {
  board,
  card,
  choose,
  corpInstall,
  driveRun,
  logText,
  must,
  optionLabels,
  paid,
  pass,
  passUntil,
  playEvent,
  playOperation,
  rezNow,
  runnerInstall,
  settle,
  toAction,
} from "./jnet-boards.js";
import type { Action } from "../../src/state/types/actions.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.29");
});

const remoteOf = (s: GameState, cardId: string): ServerId =>
  s.cards[cardId]!.zone.split(":")[1]! as ServerId;

function hostedOn(s: GameState, hostId: string): string[] {
  return s.cards[hostId]!.hostedCardIds ?? [];
}

describe("uniqueness on a host (CR 10.3.1d)", () => {
  function katiBoard(): GameState {
    let s = board({
      runnerHand: ["Kati Jones", "Kati Jones", "Off-Campus Apartment"],
      runnerCredits: 100,
    });
    s = toAction(s, "runner");
    return runnerInstall(s, "Off-Campus Apartment");
  }

  // jnet: game.core.rules-test/installing-second-unique-on-off-campus-apartment-trashes-first-test
  it("installing a second Kati Jones on Off-Campus Apartment trashes the first, in the rig (CR 10.3.1d)", () => {
    let s = katiBoard();
    const oca = card(s, "Off-Campus Apartment").id;
    s = runnerInstall(s, "Kati Jones");
    const first = card(s, "Kati Jones", 1).id;
    s = runnerInstall(s, "Kati Jones", oca);
    const second = card(s, "Kati Jones", 2).id;
    s = settle(s);
    expect(s.cards[first]!.zone).toBe("runner:heap");
    expect(hostedOn(s, oca)).toEqual([second]);
  });

  // jnet: game.core.rules-test/installing-second-unique-on-off-campus-apartment-trashes-first-test
  it("installing a second Kati Jones in the rig trashes the first, hosted on Off-Campus Apartment (CR 10.3.1d)", () => {
    let s = katiBoard();
    const oca = card(s, "Off-Campus Apartment").id;
    s = runnerInstall(s, "Kati Jones", oca);
    const first = card(s, "Kati Jones", 1).id;
    s = runnerInstall(s, "Kati Jones");
    const second = card(s, "Kati Jones", 2).id;
    s = settle(s);
    expect(s.cards[first]!.zone).toBe("runner:heap");
    expect(hostedOn(s, oca)).toEqual([]);
    expect(s.cards[second]!.zone).toBe("runner:installed");
  });

  // jnet: game.core.rules-test/installing-second-unique-on-off-campus-apartment-trashes-first-test
  it("the trashed Kati Jones is the older one: the credits on it go with it, and the new one starts empty (CR 10.3.1d)", () => {
    let s = katiBoard();
    const oca = card(s, "Off-Campus Apartment").id;
    s = runnerInstall(s, "Kati Jones", oca);
    const first = card(s, "Kati Jones", 1).id;
    s = paid(s, first, "kati-jones-load");
    expect(s.cards[first]!.hostedCredits ?? 0).toBe(3);
    s = runnerInstall(s, "Kati Jones", oca);
    const second = card(s, "Kati Jones", 2).id;
    s = settle(s);
    expect(s.cards[first]!.zone).toBe("runner:heap");
    expect(hostedOn(s, oca)).toEqual([second]);
    expect(s.cards[second]!.hostedCredits ?? 0).toBe(0);
  });

  // jnet: game.core.rules-test/installing-second-hivemind-trashes-hosted-hivemind-test
  it("installing a second Hivemind in the rig trashes the Hivemind hosted on Scheherazade (CR 10.3.1d)", () => {
    let s = board({
      runnerHand: ["Scheherazade", "Hivemind", "Hivemind"],
      runnerCredits: 100,
    });
    s = toAction(s, "runner");
    s = runnerInstall(s, "Scheherazade");
    const sch = card(s, "Scheherazade").id;
    s = runnerInstall(s, "Hivemind", sch);
    const first = card(s, "Hivemind", 1).id;
    expect(hostedOn(s, sch)).toEqual([first]);
    s = runnerInstall(s, "Hivemind");
    s = settle(s);
    expect(s.cards[first]!.zone).toBe("runner:heap");
    expect(hostedOn(s, sch)).toEqual([]);
  });
});

describe("memory and consoles (CR 10.3.1d, 10.3.1e)", () => {
  // jnet: game.core.rules-test/deactivate-program
  it("trashing an installed program frees its memory (CR 10.3.1e)", () => {
    let s = board({ runnerHand: ["Gordian Blade"], runnerCredits: 10 });
    s = toAction(s, "runner");
    s = runnerInstall(s, "Gordian Blade");
    const gb = card(s, "Gordian Blade").id;
    expect(usedMemory(s)).toBe(1);
    trashCard(s, gb, { by: "runner" });
    expect(usedMemory(s)).toBe(0);
    expect(memoryLimit(s)).toBe(4);
  });

  // jnet: game.core.engine-test/trash-existing-programs-test
  it("trashing Akamatsu Mem Chip leaves the Runner over their memory limit, so they trash a program of their choice at the checkpoint (CR 10.3.1e)", () => {
    let s = board({
      runnerHand: ["Akamatsu Mem Chip", "Endless Hunger", "Corroder"],
      runnerCredits: 100,
    });
    s = toAction(s, "runner");
    s = runnerInstall(s, "Akamatsu Mem Chip");
    s = runnerInstall(s, "Endless Hunger");
    s = runnerInstall(s, "Corroder");
    const chip = card(s, "Akamatsu Mem Chip").id;
    const eh = card(s, "Endless Hunger").id;
    const cor = card(s, "Corroder").id;
    expect(usedMemory(s)).toBe(memoryLimit(s));
    trashCard(s, chip, { by: "runner" });
    s = passUntil(
      s,
      (x) =>
        x.pendingChoice != null ||
        legalActions(x).some((a) => a.type === "choose_trash_program"),
      "memory checkpoint",
    );
    const trash = legalActions(s).find(
      (a) => a.type === "choose_trash_program" && a.cardId === cor,
    );
    s = trash ? must(s, trash) : choose(s, "Corroder");
    s = passUntil(
      s,
      (x) =>
        !x.pendingChoice &&
        !legalActions(x).some((a) => a.type === "choose_trash_program"),
      "checkpoint done",
    );
    expect(s.cards[cor]!.zone).toBe("runner:heap");
    expect(s.cards[eh]!.zone).toBe("runner:installed");
    expect(usedMemory(s)).toBeLessThanOrEqual(memoryLimit(s));
  });

  // jnet: game.core.engine-test/trash-existing-programs-not-enough-test
  it("trashing Box-E leaves the Runner 2 MU over, and they choose which set of programs to trash (CR 10.3.1e)", () => {
    let s = board({
      runnerHand: ["Box-E", "Corroder", "Dagger", "Endless Hunger"],
      runnerCredits: 100,
    });
    s = toAction(s, "runner");
    s.runner.clicks += 10;
    s = runnerInstall(s, "Box-E");
    s = runnerInstall(s, "Corroder");
    s = runnerInstall(s, "Dagger");
    s = runnerInstall(s, "Endless Hunger");
    const box = card(s, "Box-E").id;
    const eh = card(s, "Endless Hunger").id;
    const cor = card(s, "Corroder").id;
    const dag = card(s, "Dagger").id;
    expect(usedMemory(s)).toBe(6);
    trashCard(s, box, { by: "runner" });
    s = passUntil(s, (x) => x.pendingChoice != null, "memory checkpoint");
    // CR 10.3.1e: the appropriate sets are {Corroder, Dagger} and
    // {Endless Hunger}; the Runner controls both and picks one.
    expect(optionLabels(s)).toEqual(
      expect.arrayContaining([
        "Trash Corroder and Dagger",
        "Trash Endless Hunger",
      ]),
    );
    s = choose(s, "Trash Corroder and Dagger");
    s = settle(s);
    expect(s.cards[cor]!.zone).toBe("runner:heap");
    expect(s.cards[dag]!.zone).toBe("runner:heap");
    expect(s.cards[eh]!.zone).toBe("runner:installed");
  });

  // jnet: game.core.engine-test/trash-previous-consoles-test
  // Fixed in RF-1: facedown Runner cards are not active (CR 8.1.4a).
  it("facedown Box-Es are not consoles; when Assimilator turns one faceup, Mirror, the console that was active first, is trashed (CR 8.1.4a, 10.3.1d)", () => {
    let s = board({
      runnerHand: ["Mirror", "Assimilator", "Hunting Grounds"],
      runnerDeck: ["Box-E", "Box-E", "Box-E", "Box-E", "Box-E"],
      runnerCredits: 100,
    });
    s = toAction(s, "runner");
    s.runner.clicks += 10;
    s = runnerInstall(s, "Mirror");
    s = runnerInstall(s, "Assimilator");
    s = runnerInstall(s, "Hunting Grounds");
    const mirror = card(s, "Mirror").id;
    s = paid(s, card(s, "Hunting Grounds").id, "hunting-grounds-install");
    const facedown = s.runner.installed.filter((id) => !s.cards[id]!.faceup);
    expect(facedown).toHaveLength(3);
    expect(s.cards[mirror]!.zone).toBe("runner:installed");
    s = paid(s, card(s, "Assimilator").id, "assimilator-faceup");
    if (s.pendingChoice)
      s = must(s, {
        type: "choose_option",
        optionId: s.pendingChoice.options.find(
          (o) => o.label.includes("Box-E") || o.id.includes(facedown[0]!),
        )!.id,
      });
    s = settle(s);
    expect(s.cards[mirror]!.zone).toBe("runner:heap");
  });
});

describe("forfeiting agendas (CR 3.2.3, 8.2.5)", () => {
  // jnet: game.core.rules-test/agenda-forfeit-runner
  it("the Runner forfeiting a stolen Mandatory Upgrades with Data Dealer changes nobody's clicks: it was never active in their score area (CR 3.2.3, 8.2.5)", () => {
    let s = board({
      corpHand: ["Mandatory Upgrades"],
      runnerHand: ["Data Dealer"],
    });
    s = toAction(s, "runner");
    s = runnerInstall(s, "Data Dealer");
    s = must(settle(s), { type: "basic_run", serverId: "hq" });
    s = driveRun(s, (l) => l[0]!);
    if (s.run) {
      const steal = legalActions(s).find((a) => a.type === "steal_agenda");
      if (steal) s = must(s, steal);
      s = driveRun(s, (l) => l[0]!);
    }
    const mu = card(s, "Mandatory Upgrades").id;
    expect(s.cards[mu]!.zone).toBe("runner:score");
    const clicks = s.runner.clicks;
    s = paid(s, card(s, "Data Dealer").id, "data-dealer-forfeit");
    if (s.pendingChoice) s = choose(s, "Mandatory Upgrades");
    s = settle(s);
    expect(s.cards[mu]!.zone).toBe("removed-from-game");
    expect(s.runner.clicks).toBe(clicks - 1);
    s = toAction(s, "corp");
    expect(s.corp.clicks).toBe(3);
    s = toAction(s, "runner");
    expect(s.runner.clicks).toBe(4);
  });

  // jnet: game.core.rules-test/agenda-forfeit-corp
  it("the Corp forfeiting its scored Mandatory Upgrades to rez Corporate Town takes away the extra click (CR 8.2.5)", () => {
    let s = board({
      corpHand: ["Mandatory Upgrades", "Corporate Town"],
      corpCredits: 20,
    });
    s = corpInstall(s, "Mandatory Upgrades", "new");
    const mu = card(s, "Mandatory Upgrades").id;
    s.cards[mu]!.advancementCounters = 6;
    s = passUntil(
      s,
      (x) =>
        legalActions(x).some(
          (a) => a.type === "score_agenda" && a.cardId === mu,
        ),
      "a scoring window",
    );
    s = must(s, { type: "score_agenda", cardId: mu });
    // The default Corp identity offers an Archives recursion on scoring.
    if (s.pendingChoice) s = choose(s, "Decline");
    s = toAction(s, "runner");
    s = toAction(s, "corp");
    expect(s.corp.clicks).toBe(4);
    s = corpInstall(s, "Corporate Town", "new");
    const ct = card(s, "Corporate Town").id;
    const rez = legalActions(s).find(
      (a) => a.type === "rez_asset" && a.cardId === ct,
    );
    expect(rez).toBeTruthy();
    s = must(s, { ...rez!, costCardIds: [mu] } as never);
    if (s.pendingChoice) s = choose(s, "Mandatory Upgrades");
    s = settle(s);
    expect(s.cards[mu]!.zone).toBe("removed-from-game");
    s = toAction(s, "runner");
    // Corporate Town's turn-begin trash is optional; the Corp declines it.
    s = toAction(s, "corp", { declineOptional: true });
    expect(s.corp.clicks).toBe(3);
  });
});

describe("recurring credits on a hosted card (CR 1.10.5c)", () => {
  // jnet: game.core.rules-test/refresh-recurring-credits-hosted
  it("Compromised Employee hosted on Off-Campus Apartment gains 1 credit when ice is rezzed, and its spent recurring credit is refilled when the Runner's turn begins (CR 1.10.5c)", () => {
    let s = board({
      corpHand: ["Ice Wall"],
      runnerHand: ["Compromised Employee", "Off-Campus Apartment"],
      runnerCredits: 10,
    });
    s = corpInstall(s, "Ice Wall", "hq");
    const iw = card(s, "Ice Wall").id;
    s = toAction(s, "runner");
    s = runnerInstall(s, "Off-Campus Apartment");
    const oca = card(s, "Off-Campus Apartment").id;
    s = runnerInstall(s, "Compromised Employee", oca);
    const ce = card(s, "Compromised Employee").id;
    expect(hostedOn(s, oca)).toEqual([ce]);
    expect(s.cards[ce]!.recurringCredits).toBe(1);
    s = must(settle(s), { type: "basic_run", serverId: "hq" });
    s = passUntil(
      s,
      (x) =>
        legalActions(x).some((a) => a.type === "rez_ice" && a.cardId === iw),
      "rez window",
    );
    const credits = s.runner.credits;
    s = must(s, { type: "rez_ice", cardId: iw });
    expect(s.runner.credits).toBe(credits + 1);
    // Board setup: the trace credit has been spent.
    s.cards[ce]!.recurringCredits = 0;
    s = driveRun(s, (l) => l[0]!);
    s = toAction(s, "corp");
    s = toAction(s, "runner");
    expect(s.cards[ce]!.recurringCredits).toBe(1);
  });
});

describe("scoring (CR 1.17.3a)", () => {
  // jnet: game.core.rules-test/invalid-score-attempt
  it("Ancestral Imager with fewer advancement counters than its requirement cannot be scored and stays installed (CR 1.17.3a)", () => {
    let s = board({ corpHand: ["Ancestral Imager"] });
    s = corpInstall(s, "Ancestral Imager", "new");
    const ai = card(s, "Ancestral Imager").id;
    const req = s.cards[ai]!.advancementRequirement ?? 0;
    expect(
      legalActions(s).some((a) => a.type === "score_agenda" && a.cardId === ai),
    ).toBe(false);
    s = must(settle(s), { type: "advance", cardId: ai });
    expect(s.cards[ai]!.advancementCounters).toBe(1);
    expect(1).toBeLessThan(req);
    const refused = applyIntent(s, { type: "score_agenda", cardId: ai });
    expect(refused.ok).toBe(false);
    expect(s.cards[ai]!.zone).toMatch(/^server:remote/);
  });
});

describe("hosted Corp cards (CR 1.13, 8.2.5)", () => {
  // jnet: game.core.rules-test/trash-corp-hosted
  // Engine bug, filed under area 5 (Corp install): CR 1.13.6a makes Full
  // Immersion RecStudio an install destination for assets, but the engine
  // offers no Corp install onto a host card, so the board cannot be built.
  it.skip("trashing Director Haas hosted on Worlds Plaza, itself hosted on Full Immersion RecStudio, takes away the Corp's extra click (CR 9.1.7)", () => {
    let s = board({
      corpHand: ["Full Immersion RecStudio", "Worlds Plaza", "Director Haas"],
      corpCredits: 20,
      runnerCredits: 10,
    });
    s = corpInstall(s, "Full Immersion RecStudio", "new");
    const fir = card(s, "Full Immersion RecStudio").id;
    s = rezNow(s, fir);
    const wp = card(s, "Worlds Plaza").id;
    s = must(settle(s), {
      type: "basic_install",
      cardId: wp,
      destination: { kind: "host_card", hostId: fir },
    });
    expect(hostedOn(s, fir)).toContain(wp);
    s = rezNow(s, wp);
    s = paid(s, wp, "worlds-plaza-install");
    if (s.pendingChoice) s = choose(s, "Director Haas");
    const dh = card(s, "Director Haas").id;
    expect(hostedOn(s, wp)).toContain(dh);
    expect(s.cards[dh]!.rezzed).toBe(true);
    s = toAction(s, "runner");
    s = toAction(s, "corp");
    expect(s.corp.clicks).toBe(4);
    s = toAction(s, "runner");
    s.runner.credits = 10;
    s = must(settle(s), { type: "basic_run", serverId: remoteOf(s, fir) });
    s = passUntil(s, (x) => x.timingKey === "breach.awaitAccess", "breach");
    s = must(s, { type: "access_card", cardId: dh });
    const trash = legalActions(s).find(
      (a) => a.type === "trash_accessed" && a.cardId === dh,
    );
    expect(trash).toBeTruthy();
    s = must(s, trash!);
    s = driveRun(s, (l) => l.find((x) => /No action|Decline/.test(x)) ?? l[0]!);
    expect(s.cards[dh]!.zone).toBe("runner:score");
    s = toAction(s, "corp");
    expect(s.corp.clicks).toBe(3);
  });

  // jnet: game.core.rules-test/reinstall-seen-asset
  it("a PAD Campaign the Runner trashed, installed again from Archives by Interns, is a new facedown card the Runner's view does not name (CR 1.12.2, 1.21.1)", () => {
    let s = board({ corpHand: ["PAD Campaign", "Interns"], runnerCredits: 10 });
    s = corpInstall(s, "PAD Campaign", "new");
    const pad = card(s, "PAD Campaign").id;
    const remote = remoteOf(s, pad);
    s = toAction(s, "runner");
    s = must(settle(s), { type: "basic_run", serverId: remote });
    s = passUntil(s, (x) => x.timingKey === "breach.awaitAccess", "breach");
    s = must(s, { type: "access_card", cardId: pad });
    const trash = legalActions(s).find(
      (a) => a.type === "trash_accessed" && a.cardId === pad,
    );
    s = must(s, trash!);
    s = driveRun(s, (l) => l[0]!);
    expect(s.cards[pad]!.zone).toBe("corp:archives");
    expect(s.cards[pad]!.faceup).toBe(true);
    s = toAction(s, "corp");
    s = playOperation(s, "Interns");
    if (s.pendingChoice) s = choose(s, "PAD Campaign");
    if (s.pendingChoice) s = choose(s, "new");
    expect(s.cards[pad]!.zone).toMatch(/^server:remote/);
    expect(s.cards[pad]!.faceup).toBe(false);
    expect(s.cards[pad]!.rezzed).toBe(false);
    const view = JSON.stringify(getPublicView(s, "runner").servers ?? {});
    expect(view).not.toContain("PAD Campaign");
  });
});

describe("bad publicity credits (CR 10.6.2, 10.6.3a)", () => {
  // jnet: game.core.rules-test/run-bad-publicity-credits
  // Engine bug, filed under area 15 (10.6 bad publicity): the basic trash
  // ability's cost is paid from the credit pool only, never from the fund.
  it.skip("the Runner pays Cyberdex Virus Suite's trash cost from the bad publicity fund on each of three runs, keeping their own credits (CR 10.6.3a, 10.6.2)", () => {
    let s = board({
      corpHand: [
        "Cyberdex Virus Suite",
        "Cyberdex Virus Suite",
        "Cyberdex Virus Suite",
      ],
      runnerId: "Valencia Estevez: The Angel of Cayambe",
      runnerCredits: 5,
      // Board setup: the board swaps in Valencia after game setup, so it
      // applies her "starts the game with 1 bad publicity" itself.
      corpBadPublicity: 1,
    });
    s = corpInstall(s, "Cyberdex Virus Suite", "new");
    const remote = remoteOf(s, card(s, "Cyberdex Virus Suite", 1).id);
    s = corpInstall(s, "Cyberdex Virus Suite", "rd");
    s = corpInstall(s, "Cyberdex Virus Suite", "hq");
    s = toAction(s, "runner");
    const credits = s.runner.credits;
    const servers: ServerId[] = [remote, "hq", "rd"];
    for (const [i, server] of servers.entries()) {
      const cvs =
        server === remote
          ? card(s, "Cyberdex Virus Suite", 1).id
          : server === "rd"
            ? card(s, "Cyberdex Virus Suite", 2).id
            : card(s, "Cyberdex Virus Suite", 3).id;
      s = must(settle(s), { type: "basic_run", serverId: server });
      s = passUntil(
        s,
        (x) => x.timingKey === "breach.awaitAccess",
        `breach ${i}`,
      );
      s = must(s, { type: "access_card", cardId: cvs });
      if (s.pendingChoice) s = choose(s, "Decline");
      s = passUntil(
        s,
        (x) =>
          legalActions(x).some(
            (a) => a.type === "trash_accessed" && a.cardId === cvs,
          ),
        "trash option",
      );
      s = must(s, { type: "trash_accessed", cardId: cvs });
      if (s.pendingChoice)
        s = choose(
          s,
          s.pendingChoice.options.find((o) => /bad publicity/i.test(o.label))
            ?.label ?? optionLabels(s)[0]!,
        );
      s = driveRun(
        s,
        (l) => l.find((x) => /No action|Decline/.test(x)) ?? l[0]!,
      );
      expect(s.cards[cvs]!.zone).toBe("corp:archives");
      expect(s.runner.credits).toBe(credits);
    }
  });
});

describe("purging virus counters (CR 10.1.2)", () => {
  // jnet: game.core.rules-test/purge-nested
  it("Cyberdex Trial purges the counters on Imp hosted on Djinn (CR 10.1.2)", () => {
    let s = board({
      corpHand: ["Cyberdex Trial"],
      runnerHand: ["Djinn", "Imp"],
      runnerCredits: 100,
    });
    s = toAction(s, "runner");
    s = runnerInstall(s, "Djinn");
    const djinn = card(s, "Djinn").id;
    s = runnerInstall(s, "Imp", djinn);
    const imp = card(s, "Imp").id;
    expect(hostedOn(s, djinn)).toEqual([imp]);
    expect(s.cards[imp]!.virusCounters).toBe(2);
    s = toAction(s, "corp");
    s = playOperation(s, "Cyberdex Trial");
    expect(s.cards[imp]!.virusCounters ?? 0).toBe(0);
  });

  // jnet: game.core.rules-test/purge-nested
  // Engine bug, filed under area 6 (Runner install): the engine refuses
  // "a daemon on a daemon", which neither Leprechaun's text ("can host up to
  // 2 programs") nor the CR forbids (CR 1.2.1, 1.13.5).
  it.skip("Djinn can be hosted on Leprechaun, and Cyberdex Trial purges Imp hosted two levels down (CR 1.13.5, 10.1.2)", () => {
    let s = board({
      corpHand: ["Cyberdex Trial"],
      runnerHand: ["Djinn", "Imp", "Leprechaun"],
      runnerCredits: 100,
    });
    s = toAction(s, "runner");
    s = runnerInstall(s, "Leprechaun");
    const lep = card(s, "Leprechaun").id;
    s = runnerInstall(s, "Djinn", lep);
    const djinn = card(s, "Djinn").id;
    s = runnerInstall(s, "Imp", djinn);
    const imp = card(s, "Imp").id;
    expect(hostedOn(s, lep)).toEqual([djinn]);
    expect(hostedOn(s, djinn)).toEqual([imp]);
    s = toAction(s, "corp");
    s = playOperation(s, "Cyberdex Trial");
    expect(s.cards[imp]!.virusCounters ?? 0).toBe(0);
  });

  // jnet: game.core.rules-test/purge-corp
  it("purging also removes virus counters on Corp cards (CR 10.1.2)", () => {
    let s = board({ corpHand: ["Cyberdex Trial", "Ice Wall"] });
    s = corpInstall(s, "Ice Wall", "hq");
    const iw = card(s, "Ice Wall").id;
    // Board setup: jnet places the counters with a chat command.
    s.cards[iw]!.virusCounters = 2;
    s = playOperation(s, "Cyberdex Trial");
    expect(s.cards[iw]!.virusCounters ?? 0).toBe(0);
  });
});

describe("ending the run (CR 6.1.4, 6.8.4)", () => {
  // jnet: game.core.rules-test/end-the-run-test
  it("Ice Wall's End the run ends the run on HQ, and the run is declared unsuccessful (CR 6.1.4, 6.8.4)", () => {
    let s = board({ corpHand: ["Ice Wall"] });
    s = corpInstall(s, "Ice Wall", "hq");
    const iw = card(s, "Ice Wall").id;
    s = toAction(s, "runner");
    s = must(settle(s), { type: "basic_run", serverId: "hq" });
    expect(s.run?.attackedServerId).toBe("hq");
    s = passUntil(
      s,
      (x) =>
        legalActions(x).some((a) => a.type === "rez_ice" && a.cardId === iw),
      "rez window",
    );
    s = must(s, { type: "rez_ice", cardId: iw });
    s = passUntil(s, (x) => !x.run, "run ends");
    expect(s.turn.unsuccessfulRunThisTurn).toBe(true);
  });
});

describe("interrupts and simultaneous abilities on trash (CR 9.9.4, 9.2.8d)", () => {
  // jnet: game.core.rules-test/simultaneous-trash-effects
  // Engine bug, filed under RA-1 (9.2.8, 9.6.9, 9.9): Marilyn Campaign's
  // optional interrupt is applied without asking the Corp; it needs the
  // trash procedure to pause for the Corp's choice (area 2). Since RF-1b the
  // Corp orders Hostile Infrastructure and Calvin B4L3Y (timing-fixes-rf1b).
  it.skip("when Apocalypse trashes the Corp's cards, Marilyn Campaign's interrupt comes first, then the Corp orders Hostile Infrastructure and Calvin B4L3Y (CR 9.9.4b, 9.2.8d)", () => {
    let s = board({
      corpHand: ["Hostile Infrastructure", "Marilyn Campaign", "Calvin B4L3Y"],
      corpDeck: Array(5).fill("Hedge Fund"),
      corpCredits: 20,
      // Enough grip to survive Hostile Infrastructure's net damage.
      runnerHand: ["Apocalypse", ...Array(6).fill("Sure Gamble")],
    });
    s = corpInstall(s, "Hostile Infrastructure", "new");
    s = corpInstall(s, "Marilyn Campaign", "new");
    s = corpInstall(s, "Calvin B4L3Y", "new");
    for (const t of [
      "Hostile Infrastructure",
      "Marilyn Campaign",
      "Calvin B4L3Y",
    ]) {
      s = rezNow(s, card(s, t).id);
    }
    s = toAction(s, "runner");
    for (const server of ["archives", "rd", "hq"] as const) {
      s = must(settle(s), { type: "basic_run", serverId: server });
      s = driveRun(
        s,
        (l) => l.find((x) => /No action|Decline/.test(x)) ?? l[0]!,
      );
    }
    s = playEvent(s, "Apocalypse");
    const prompts: string[][] = [];
    for (let i = 0; i < 12 && s.timingKey !== "runner.actionPhaseEnd"; i++) {
      if (s.pendingChoice) {
        prompts.push(optionLabels(s));
        const pick =
          optionLabels(s).find((l) => /Shuffle|shuffle/.test(l)) ??
          optionLabels(s).find((l) => /Calvin/.test(l)) ??
          optionLabels(s).find((l) => /^Yes|Draw/.test(l)) ??
          optionLabels(s)[0]!;
        s = choose(s, pick);
        continue;
      }
      if (!legalActions(s).some((a) => a.type === "pass_window")) break;
      s = pass(s);
    }
    expect(prompts.length).toBeGreaterThan(0);
    expect(prompts[0]!.some((l) => /Marilyn|Shuffle|shuffle/.test(l))).toBe(
      true,
    );
    expect(
      prompts.some(
        (p) =>
          p.some((l) => /Hostile Infrastructure/.test(l)) &&
          p.some((l) => /Calvin/.test(l)),
      ),
    ).toBe(true);
    expect(s.corp.deck).toContain(card(s, "Marilyn Campaign").id);
  });
});

describe("abilities of a derezzed card (CR 9.1.7)", () => {
  // jnet: game.core.rules-test/events-after-derez
  // Engine bug, filed under area 2 (uninstall): Saker's "add this program
  // to your grip" cost leaves it listed as installed too (MULTIPLE_ZONES).
  it.skip("after Saker derezzes Kakugo, passing Kakugo does no net damage, so Saker stays in the grip (CR 9.1.7)", () => {
    let s = board({
      corpHand: ["Kakugo"],
      runnerHand: ["Saker"],
      runnerCredits: 10,
    });
    s = corpInstall(s, "Kakugo", "hq");
    const kk = card(s, "Kakugo").id;
    s = toAction(s, "runner");
    s = runnerInstall(s, "Saker");
    const saker = card(s, "Saker").id;
    s = must(settle(s), { type: "basic_run", serverId: "hq" });
    s = passUntil(
      s,
      (x) =>
        legalActions(x).some((a) => a.type === "rez_ice" && a.cardId === kk),
      "rez window",
    );
    s = must(s, { type: "rez_ice", cardId: kk });
    s = passUntil(
      s,
      (x) =>
        x.run?.encounter?.iceId === kk && x.timingKey === "run.encounterPaw",
      "encounter Kakugo",
    );
    for (let i = 0; i < 4; i++) {
      const brk = legalActions(s).find(
        (a) => a.type === "break_subroutine" && a.breakerId === saker,
      );
      if (brk) {
        s = must(s, brk);
        break;
      }
      s = paid(
        s,
        saker,
        legalActions(s).find(
          (a): a is Extract<Action, { type: "use_paid_ability" }> =>
            a.type === "use_paid_ability" &&
            a.cardId === saker &&
            a.abilityId !== "saker-derez",
        )!.abilityId,
      );
    }
    s = paid(s, saker, "saker-derez");
    if (s.pendingChoice) s = choose(s, "Kakugo");
    expect(s.cards[kk]!.rezzed).toBe(false);
    expect(s.runner.hand).toContain(saker);
    s = driveRun(s, (l) => l.find((x) => /No action|Decline/.test(x)) ?? l[0]!);
    expect(s.runner.hand).toContain(saker);
    expect(logText(s)).not.toMatch(/Kakugo[^\n]*net damage/);
  });
});

describe("reveal as a cost (CR 1.16)", () => {
  // jnet: game.core.costs-test/expend-costs-reveal-the-discarded-card
  // Engine bug waiting on the cards data: Slash and Burn Agriculture's cost
  // trashes it without revealing it, so Hyoubu Institute never sees a reveal.
  it.skip("revealing Slash and Burn Agriculture from HQ to pay its cost is Hyoubu Institute's first reveal this turn, so the Corp gains 1 credit", () => {
    let s = board({
      corpId: "Hyoubu Institute: Absolute Clarity",
      corpHand: ["Slash and Burn Agriculture", "Ice Wall"],
    });
    s = corpInstall(s, "Ice Wall", "hq");
    const sba = card(s, "Slash and Burn Agriculture").id;
    const credits = s.corp.credits;
    const use = legalActions(settle(s)).find(
      (a) => a.type === "use_paid_ability" && a.cardId === sba,
    );
    expect(use).toBeTruthy();
    s = must(settle(s), use!);
    if (s.pendingChoice) s = choose(s, "Ice Wall");
    expect(s.corp.credits).toBe(credits - 1 + 1);
  });
});
