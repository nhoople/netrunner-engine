/**
 * jnet `game.core.scenarios-test` multi-card scenarios classified by CR
 * audit session P1-l (tool 1.8). Each board comes from mtgred/netrunner at
 * bc9e2fca073a5b21d247e72877804118e81d5472 (MIT; tests/jnet/NOTICE.md), and
 * each expectation is checked against the pinned CR v26.03 and printed card
 * text, not against jnet. The class of each scenario is recorded in
 * tests/jnet/manifest.json.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getPublicView,
  legalActions,
} from "../src/index.js";
import { iceStrength } from "../src/effects/continuous/iceStrength.js";
import type { GameState } from "../src/state/types/game.js";
import type { ServerId } from "../src/state/types/servers.js";
import {
  board,
  card,
  choose,
  corpInstall,
  driveRun,
  must,
  optionLabels,
  pass,
  passUntil,
  playEvent,
  playOperation,
  rezNow,
  runnerInstall,
  settle,
  toAction,
} from "./jnet-boards.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.29");
});

const noAction = (labels: string[]): string =>
  labels.find((l) => /No action|Decline|^No$|Do not/.test(l)) ?? labels[0]!;

describe("paying with hosted credits (CR 1.10.5)", () => {
  // jnet: game.core.scenarios-test/mantle-cupellation-interaction-zero-credits
  // Engine bug, filed under area 15 (1.10 credits): with an empty credit
  // pool, Cupellation's access ability is not offered, though Mantle's
  // hosted credit can pay for it ("spend hosted credits to use ... programs").
  it.skip("with no credits in their pool, the Runner pays Cupellation's 1 credit with Mantle's recurring credit and hosts the accessed IPO", () => {
    let s = board({
      corpHand: ["IPO"],
      runnerHand: ["Mantle", "Cupellation"],
      runnerCredits: 2,
    });
    s = toAction(s, "runner");
    s = runnerInstall(s, "Mantle");
    s = runnerInstall(s, "Cupellation");
    const mantle = card(s, "Mantle").id;
    const cup = card(s, "Cupellation").id;
    const ipo = card(s, "IPO").id;
    expect(s.runner.credits).toBe(0);
    expect(s.cards[mantle]!.recurringCredits).toBe(1);
    s = must(settle(s), { type: "basic_run", serverId: "hq" });
    s = passUntil(s, (x) => x.timingKey === "breach.awaitAccess", "breach");
    s = must(s, { type: "access_card", cardId: ipo });
    const host = legalActions(s).find(
      (a) => a.type === "use_paid_ability" && a.cardId === cup,
    );
    expect(host).toBeTruthy();
    s = must(s, host!);
    if (s.pendingChoice) s = choose(s, "Mantle");
    expect(s.cards[cup]!.hostedCardIds ?? []).toContain(ipo);
    expect(s.cards[mantle]!.recurringCredits ?? 0).toBe(0);
    s = driveRun(s, noAction);
    expect(s.pendingChoice).toBeNull();
  });
});

/**
 * HQ: Tithe protecting it and Vovô Ozetti in its root, both unrezzed. The
 * Corp rezzes Vovô in the run's approach window, before Tithe: rezzing it
 * on the Corp's turn would reach Vovô's turn-end loop (the test below).
 */
function titheWithVovo(corpCredits: number, runnerHand: string[]) {
  let s = board({
    corpHand: ["Tithe", "Vovô Ozetti"],
    corpCredits,
    runnerHand,
    runnerCredits: 10,
  });
  s = corpInstall(s, "Tithe", "hq");
  s = corpInstall(s, "Vovô Ozetti", "hq");
  s = toAction(s, "runner");
  return { s, tithe: card(s, "Tithe").id, vovo: card(s, "Vovô Ozetti").id };
}

/** In the approach window: rez Vovô Ozetti, then Tithe; return Tithe's cost. */
function rezVovoThenTithe(
  s: GameState,
  vovo: string,
  tithe: string,
): { s: GameState; paid: number } {
  s = passUntil(
    s,
    (x) =>
      legalActions(x).some((a) => a.type === "rez_ice" && a.cardId === tithe),
    "approach window",
  );
  const rezVovo = legalActions(s).find(
    (a) => a.type === "rez_asset" && a.cardId === vovo,
  );
  expect(rezVovo).toBeTruthy();
  s = must(s, rezVovo!);
  s = passUntil(
    s,
    (x) =>
      legalActions(x).some((a) => a.type === "rez_ice" && a.cardId === tithe),
    "approach window after Vovô",
  );
  const before = s.corp.credits;
  s = must(s, { type: "rez_ice", cardId: tithe });
  return { s, paid: before - s.corp.credits };
}

describe("rez cost modifiers and additional costs (CR 1.16.2a, 1.16.10)", () => {
  // jnet: game.core.scenarios-test/tread-lightly-vovo-combine-well
  it("Tithe costs 2 to rez under Tread Lightly with Vovô Ozetti: 1 + 3 − 2 (CR 1.16.2a)", () => {
    const b = titheWithVovo(5, ["Tread Lightly"]);
    let { s } = b;
    const { tithe, vovo } = b;
    s = playEvent(s, "Tread Lightly", "hq");
    if (s.pendingChoice) s = choose(s, "hq");
    const { paid } = rezVovoThenTithe(s, vovo, tithe);
    expect(paid).toBe(2);
  });

  // jnet: game.core.scenarios-test/hernando-cortez-vovo-combine-not-well
  // Engine bug, filed under area 11 (1.16 costs): the engine adds Hernando
  // Cortez's additional cost to the rez cost before Vovô lowers it, so the
  // Corp pays 1 (1 + 2 − 2), not 0 + 2.
  it.skip("with Hernando Cortez and Vovô Ozetti, Tithe's rez cost floors at 0 and the additional cost of 2 (its subroutines) is paid on top (CR 1.16.2a, 1.16.10)", () => {
    const b = titheWithVovo(20, ["Hernando Cortez"]);
    let { s } = b;
    const { tithe, vovo } = b;
    s = runnerInstall(s, "Hernando Cortez");
    s = must(settle(s), { type: "basic_run", serverId: "hq" });
    const { paid } = rezVovoThenTithe(s, vovo, tithe);
    expect(paid).toBe(2);
  });

  // Engine bug, listed as a fix-now finding: declining Vovô Ozetti's
  // "you may move this upgrade" opens the same choice again, forever, so
  // the Corp's turn never ends.
  it.skip("declining Vovô Ozetti's move when the Corp's turn ends lets the turn end (Vovô Ozetti's printed text)", () => {
    let s = board({ corpHand: ["Vovô Ozetti"], corpCredits: 10 });
    s = corpInstall(s, "Vovô Ozetti", "hq");
    const vovo = card(s, "Vovô Ozetti").id;
    const rez = legalActions(s).find(
      (a) => a.type === "rez_asset" && a.cardId === vovo,
    );
    s = must(s, rez!);
    s = toAction(s, "runner");
    expect(s.cards[vovo]!.zone).toBe("server:hq:root");
  });
});

describe("ordering the Runner's simultaneous abilities (CR 9.2.8d)", () => {
  // jnet: game.core.scenarios-test/maxx-annicam-buffer-drive-one-card-in-stack
  // Adapted: jnet builds the one-card stack with Labor Rights, which this
  // engine trashes instead of removing from the game (the test below), so
  // the stack here is set directly.
  it("when MaxX trashes the only card in the stack, the Runner resolves Buffer Drive first to bottom it, then Aniccam draws it (CR 9.2.8d)", () => {
    let s = board({
      runnerId: "MaxX: Maximum Punk Rock",
      runnerHand: ["Buffer Drive", "Aniccam"],
      // MaxX trashes the two Easy Marks on the first turn and draws
      // Hacktivist Meeting, leaving Sure Gamble alone in the stack.
      runnerDeck: [
        "Easy Mark",
        "Easy Mark",
        "Hacktivist Meeting",
        "Sure Gamble",
      ],
      runnerCredits: 10,
    });
    s = toAction(s, "runner");
    s = runnerInstall(s, "Buffer Drive");
    s = runnerInstall(s, "Aniccam");
    const sg = card(s, "Sure Gamble").id;
    expect(s.runner.deck).toEqual([sg]);
    s = toAction(s, "corp");
    const offered: string[][] = [];
    for (let i = 0; i < 60 && s.timingKey !== "runner.takeAction"; i++) {
      if (s.pendingChoice) {
        offered.push(optionLabels(s));
        const labels = optionLabels(s);
        s = choose(
          s,
          labels.find((l) => /Buffer Drive/.test(l)) ??
            labels.find((l) => /Sure Gamble/.test(l)) ??
            labels[0]!,
        );
        continue;
      }
      if (s.timingKey === "corp.takeAction") {
        s = must(s, { type: "basic_gain_credit" });
        continue;
      }
      if (legalActions(s).some((a) => a.type === "discard_to_hand_size")) {
        s = must(s, { type: "discard_to_hand_size" });
        continue;
      }
      s = pass(s);
    }
    expect(s.timingKey).toBe("runner.takeAction");
    expect(offered.some((o) => o.some((l) => /Buffer Drive/.test(l)))).toBe(
      true,
    );
    expect(s.runner.hand).toContain(sg);
  });

  // jnet: game.core.scenarios-test/maxx-annicam-buffer-drive-one-card-in-stack
  // Engine bug, listed as a fix-now finding: Labor Rights declares
  // rfgInsteadOfTrashing, but the engine trashes it, so Aniccam draws.
  it.skip("Labor Rights is removed from the game instead of trashed, so Aniccam does not draw (Labor Rights' printed text)", () => {
    let s = board({
      runnerHand: ["Labor Rights", "Aniccam"],
      runnerDiscard: ["Hacktivist Meeting", "Sure Gamble"],
      runnerDeck: [],
      runnerCredits: 10,
    });
    s = toAction(s, "runner");
    s = runnerInstall(s, "Aniccam");
    s = playEvent(s, "Labor Rights");
    for (let i = 0; i < 6 && s.pendingChoice; i++) {
      s = choose(s, optionLabels(s)[0]!);
    }
    s = settle(s);
    expect(card(s, "Labor Rights").zone).toBe("removed-from-game");
    expect(s.runner.hand).toHaveLength(1);
    expect(s.runner.deck).toHaveLength(1);
  });
});

describe("purging during a breach (CR 10.1.2)", () => {
  // jnet: game.core.scenarios-test/degree-mill-cvs
  it("Cyberdex Virus Suite's purge on access clears Aumakua, which then gains 1 for a breach with no steal or trash; stealing Degree Mill in the next breach leaves it at 0 (CR 10.1.2, 1.16.10)", () => {
    let s = board({
      corpHand: ["Degree Mill"],
      corpDiscard: ["Cyberdex Virus Suite"],
      runnerHand: ["Aumakua", "Clone Chip", "Clone Chip"],
      runnerCredits: 10,
    });
    s = toAction(s, "runner");
    s.runner.clicks += 10;
    s = runnerInstall(s, "Aumakua");
    s = runnerInstall(s, "Clone Chip");
    s = runnerInstall(s, "Clone Chip");
    const aum = card(s, "Aumakua").id;
    const cvs = card(s, "Cyberdex Virus Suite").id;
    const yes = (labels: string[]) =>
      labels.find((l) => /Purge/.test(l)) ?? noAction(labels);
    for (let i = 0; i < 2; i++) {
      s = must(settle(s), { type: "basic_run", serverId: "rd" });
      s = driveRun(s, noAction);
    }
    expect(s.cards[aum]!.virusCounters).toBe(2);
    s = must(settle(s), { type: "basic_run", serverId: "archives" });
    s = driveRun(s, yes);
    expect(s.cards[cvs]!.zone).toBe("corp:archives");
    expect(s.cards[aum]!.virusCounters).toBe(1);
    for (let i = 0; i < 2; i++) {
      s = must(settle(s), { type: "basic_run", serverId: "rd" });
      s = driveRun(s, noAction);
    }
    // Board setup: jnet trashes Degree Mill from HQ with a helper.
    const dm = card(s, "Degree Mill").id;
    s.corp.hand = s.corp.hand.filter((id) => id !== dm);
    s.corp.discardPile = [...s.corp.discardPile, dm];
    s.cards[dm]!.zone = "corp:archives";
    s.cards[dm]!.faceup = true;
    s = must(settle(s), { type: "basic_run", serverId: "archives" });
    s = passUntil(s, (x) => x.timingKey === "breach.awaitAccess", "breach");
    s = must(s, { type: "access_card", cardId: dm });
    const steal = legalActions(s).find(
      (a) => a.type === "steal_agenda" && a.cardId === dm,
    );
    expect(steal).toBeTruthy();
    s = must(s, steal!);
    for (let i = 0; i < 4 && s.pendingChoice; i++) {
      s = choose(
        s,
        optionLabels(s).find((l) => /Clone Chip/.test(l)) ??
          optionLabels(s)[0]!,
      );
    }
    s = driveRun(s, yes);
    expect(s.cards[dm]!.zone).toBe("runner:score");
    expect(s.cards[aum]!.virusCounters ?? 0).toBe(0);
    expect(s.run).toBeNull();
  });
});

describe("companions (printed text)", () => {
  // jnet: game.core.scenarios-test/companions
  for (const title of ["Fencer Fueno", "Trickster Taka", "Mystic Maemi"]) {
    it(`${title} gains 1 credit when the Runner steals an agenda, and none for a run without a steal`, () => {
      let s = board({ corpHand: ["Hostile Takeover"], runnerHand: [title] });
      s = toAction(s, "runner");
      s = runnerInstall(s, title);
      const cc = card(s, title).id;
      expect(s.cards[cc]!.hostedCredits ?? 0).toBe(0);
      s = must(settle(s), { type: "basic_run", serverId: "hq" });
      s = passUntil(s, (x) => x.timingKey === "breach.awaitAccess", "breach");
      const ht = card(s, "Hostile Takeover").id;
      s = must(s, { type: "access_card", cardId: ht });
      const steal = legalActions(s).find((a) => a.type === "steal_agenda");
      if (steal) s = must(s, steal);
      s = driveRun(s, noAction);
      expect(s.cards[ht]!.zone).toBe("runner:score");
      expect(s.cards[cc]!.hostedCredits ?? 0).toBe(1);
      s = must(settle(s), { type: "basic_run", serverId: "archives" });
      s = driveRun(s, noAction);
      expect(s.cards[cc]!.hostedCredits ?? 0).toBe(1);
    });
  }
});

/** Steal the agenda being accessed, if the engine offers it now. */
function stealIfOffered(s: GameState): GameState {
  const steal = legalActions(s).find((a) => a.type === "steal_agenda");
  return steal ? must(s, steal) : s;
}

describe("hidden information after a breach (CR 1.21.1, 10.12.2a)", () => {
  // jnet: game.core.scenarios-test/poetri-hidden-info-game
  it("the ice Poétrï installs from HQ after a steal is facedown, and the Runner's view does not name it even though they accessed it this breach (CR 1.21.1)", () => {
    let s = board({
      corpId: "Poétrï Luxury Brands: All the Rage",
      corpHand: ["Hostile Takeover", "Ice Wall", "Tollbooth"],
      corpCredits: 10,
      runnerHand: ["Legwork"],
    });
    s = toAction(s, "runner");
    const iw = card(s, "Ice Wall").id;
    const ht = card(s, "Hostile Takeover").id;
    s = playEvent(s, "Legwork", "hq");
    s = passUntil(s, (x) => x.timingKey === "breach.awaitAccess", "breach");
    s = must(s, { type: "access_card", cardId: iw });
    if (legalActions(s).some((a) => a.type === "finish_access")) {
      s = must(s, { type: "finish_access" });
    }
    s = passUntil(
      s,
      (x) => x.timingKey === "breach.awaitAccess",
      "next access",
    );
    s = must(s, { type: "access_card", cardId: ht });
    s = stealIfOffered(s);
    s = passUntil(
      s,
      (x) => x.pendingChoice?.chooser === "corp",
      "Poétrï's install",
    );
    s = choose(s, "Install Ice Wall");
    for (let i = 0; i < 4 && s.pendingChoice; i++) {
      s = choose(
        s,
        optionLabels(s).find((l) => /new|New/.test(l)) ?? optionLabels(s)[0]!,
      );
    }
    expect(s.cards[iw]!.zone).toMatch(/:ice$/);
    expect(s.cards[iw]!.faceup).toBe(false);
    const view = JSON.stringify(getPublicView(s, "runner").servers ?? {});
    expect(view).not.toContain("Ice Wall");
  });

  // jnet: game.core.scenarios-test/esa-v-thule-hidden-info-known
  it("cards Esâ Afontov's sabotage trashes go to Archives facedown (CR 10.12.2a)", () => {
    let { s } = esaIntoSabotage();
    const hq = [...s.corp.hand];
    for (let i = 0; i < 4 && s.pendingChoice; i++) {
      s = choose(s, optionLabels(s)[0]!);
    }
    s = settle(s);
    const trashed = hq.filter((id) => s.cards[id]!.zone === "corp:archives");
    expect(trashed).toHaveLength(2);
    for (const id of trashed) expect(s.cards[id]!.faceup).toBe(false);
  });

  // jnet: game.core.scenarios-test/esa-v-thule-hidden-info-known
  // Engine bug, filed under area 15 (10.12 sabotage): the Corp must pick
  // the cards from HQ one by one and cannot choose to trash fewer from HQ
  // and the rest from the top of R&D.
  it.skip("the Corp may sabotage from the top of R&D instead of HQ, and Vanilla, which the Runner accessed, still goes to Archives facedown (CR 10.12.2, 10.12.2a)", () => {
    const b = esaIntoSabotage();
    let { s } = b;
    const { vanilla, iw } = b;
    s = choose(
      s,
      optionLabels(s).find((l) => /Done|R&D|none/i.test(l))!,
    );
    s = settle(s);
    expect(s.cards[vanilla]!.zone).toBe("corp:archives");
    expect(s.cards[iw]!.zone).toBe("corp:archives");
    expect(s.cards[vanilla]!.faceup).toBe(false);
    expect(s.cards[iw]!.faceup).toBe(false);
  });
});

/**
 * Esâ Afontov against Thule Subsea: Jailbreak on R&D accesses Vanilla, then
 * steals Project Atlas; the Runner takes Thule's core damage and uses Esâ.
 * Returns at the Corp's sabotage choice.
 */
function esaIntoSabotage() {
  let s = board({
    corpId: "Thule Subsea: Safety Below",
    corpHand: ["IPO"],
    // The Corp draws the Hedge Fund at the start of its turn.
    corpDeck: ["Hedge Fund", "Vanilla", "Project Atlas", "Ice Wall"],
    runnerId: "Esâ Afontov: Eco-Insurrectionist",
    runnerHand: ["Ika", "Jailbreak"],
  });
  s = toAction(s, "runner");
  const vanilla = card(s, "Vanilla").id;
  const iw = card(s, "Ice Wall").id;
  expect(s.corp.deck.slice(0, 2)).toEqual([
    vanilla,
    card(s, "Project Atlas").id,
  ]);
  s = playEvent(s, "Jailbreak", "rd");
  for (let i = 0; i < 80 && s.pendingChoice?.chooser !== "corp"; i++) {
    if (s.pendingChoice) {
      const labels = optionLabels(s);
      s = choose(
        s,
        labels.find((l) => /Resolve the instruction/.test(l)) ??
          labels.find((l) => /sabotage/i.test(l)) ??
          noAction(labels),
      );
      continue;
    }
    const legal = legalActions(s);
    const steal = legal.find((a) => a.type === "steal_agenda");
    const access = legal.find((a) => a.type === "access_card");
    if (s.pendingDamage) s = must(s, { type: "accept_damage" });
    else if (steal) s = must(s, steal);
    else if (legal.some((a) => a.type === "pass_window")) s = pass(s);
    else if (access) s = must(s, access);
    else if (legal.some((a) => a.type === "finish_access"))
      s = must(s, { type: "finish_access" });
    else break;
  }
  expect(s.log.join("\n")).toMatch(/Sabotage 2 pending/);
  return { s, vanilla, iw };
}

describe("prevention (CR 9.9.5)", () => {
  // jnet: game.core.scenarios-test/minigame-prevent-netdmg-resourcetrash
  it("Net Shield prevents Neural EMP's net damage for 1 credit; the Corp pays 2 more under Wireless Net Pavilion to trash Off-Campus Apartment, and Fall Guy hosted on it prevents that trash (CR 9.9.5, 1.16.10)", () => {
    let s = board({
      corpHand: ["Neural EMP", "SEA Source"],
      corpCredits: 14,
      runnerHand: [
        "Fall Guy",
        "Off-Campus Apartment",
        "Net Shield",
        "Wireless Net Pavilion",
        "Sure Gamble",
      ],
      runnerCredits: 10,
    });
    s = toAction(s, "runner");
    s.runner.clicks += 2;
    s = must(settle(s), { type: "basic_run", serverId: "archives" });
    s = driveRun(s, noAction);
    s = runnerInstall(s, "Off-Campus Apartment");
    const oca = card(s, "Off-Campus Apartment").id;
    s = runnerInstall(s, "Wireless Net Pavilion");
    s = runnerInstall(s, "Net Shield");
    s = runnerInstall(s, "Fall Guy", oca);
    const fg = card(s, "Fall Guy").id;
    s = toAction(s, "corp");
    const runnerCredits = s.runner.credits;
    const grip = s.runner.hand.length;
    s = playOperation(s, "Neural EMP");
    // legalActions does not list this prevention (the skipped test below),
    // but the engine accepts it, so the board uses it directly.
    s = must(s, {
      type: "use_paid_ability",
      cardId: card(s, "Net Shield").id,
      abilityId: "net-shield-prevent",
    });
    if (s.pendingDamage) s = must(s, { type: "accept_damage" });
    s = settle(s);
    expect(s.runner.credits).toBe(runnerCredits - 1);
    expect(s.runner.hand).toHaveLength(grip);
    s = playOperation(s, "SEA Source");
    for (let i = 0; i < 10 && s.runner.tags === 0; i++) {
      const legal = legalActions(s);
      if (legal.some((a) => a.type === "boost_trace")) {
        s = must(s, {
          type: "boost_trace",
          credits:
            s.timingKey.includes("corp") || s.pendingChoice?.chooser === "corp"
              ? 3
              : 0,
        } as never);
        continue;
      }
      if (legal.some((a) => a.type === "resolve_trace")) {
        s = must(s, { type: "resolve_trace" });
        continue;
      }
      if (s.pendingChoice) {
        s = choose(s, optionLabels(s)[0]!);
        continue;
      }
      if (legal.some((a) => a.type === "pass_window")) s = pass(s);
      else break;
    }
    expect(s.runner.tags).toBe(1);
    s = settle(s);
    const corpCredits = s.corp.credits;
    s = must(settle(s), { type: "basic_trash_resource", cardId: oca });
    expect(s.corp.credits).toBe(corpCredits - 4);
    // As with Net Shield, the prevention is applied directly.
    s = must(s, {
      type: "use_paid_ability",
      cardId: fg,
      abilityId: "fall-guy-prevent",
    });
    s = settle(s);
    expect(s.cards[oca]!.zone).toBe("runner:installed");
    expect(s.cards[fg]!.zone).toBe("runner:heap");
  });
});

describe("offering prevention while damage is pending (CR 9.9.4d)", () => {
  // Fixed in FX-legal-moves: the paid ability window's priority (the Corp's,
  // on its turn) no longer hides a Runner interrupt. An interrupt window
  // gives both players priority (CR 9.2.9c).
  it("while net damage is pending, Net Shield's prevention is a legal move: legalActions offers it while Neural EMP's net damage is pending (CR 9.9.4d)", () => {
    let s = board({
      corpHand: ["Neural EMP"],
      runnerHand: ["Net Shield", "Sure Gamble"],
      runnerCredits: 10,
    });
    s = toAction(s, "runner");
    s = must(settle(s), { type: "basic_run", serverId: "archives" });
    s = driveRun(s, noAction);
    s = runnerInstall(s, "Net Shield");
    s = toAction(s, "corp");
    s = playOperation(s, "Neural EMP");
    expect(s.pendingDamage).toBeTruthy();
    expect(
      legalActions(s).some(
        (a) =>
          a.type === "use_paid_ability" && a.abilityId === "net-shield-prevent",
      ),
    ).toBe(true);
  });
});

/** Walk to `side`'s action step, answering each choice with `pick`. */
function walkTo(
  s: GameState,
  side: "corp" | "runner",
  pick: (labels: string[]) => string,
): GameState {
  for (let i = 0; i < 300; i++) {
    if (s.timingKey === `${side}.takeAction` && !s.pendingChoice) return s;
    if (s.pendingChoice) {
      s = choose(s, pick(optionLabels(s)));
      continue;
    }
    const legal = legalActions(s);
    if (legal.some((a) => a.type === "discard_to_hand_size")) {
      s = must(s, { type: "discard_to_hand_size" });
    } else if (
      s.timingKey.endsWith(".takeAction") &&
      legal.some((a) => a.type === "basic_gain_credit")
    ) {
      s = must(s, { type: "basic_gain_credit" });
    } else s = pass(s);
  }
  throw new Error(`Could not reach ${side}.takeAction`);
}

describe("installing with Masterwork (CR 10.3.1d, Boomerang's printed text)", () => {
  // jnet: game.core.scenarios-test/masterwork-overinstall-boomerang-complex-case
  // Engine bugs: the Boomerang that Masterwork installs never asks for its
  // ice (chosenIceId stays unset), filed under area 6 (Runner install); and
  // The Class Act's "add 1 to the bottom of your stack" leaves an Easy Mark
  // in runner:stack but out of the stack list (NO_ZONE), filed under area 13.
  it.skip("Masterwork installs a second Boomerang as a run begins: the first, unique copy is trashed, the new one chooses its ice, and no choice is left open (CR 10.3.1d)", () => {
    let s = board({
      corpId: "Weyland Consortium: Building a Better World",
      corpHand: ["Tree Line", "Winchester", "Surveyor"],
      corpCredits: 20,
      runnerId: "Zahya Sadeghi: Versatile Smuggler",
      runnerHand: [
        "The Class Act",
        "Masterwork (v37)",
        "Boomerang",
        "Boomerang",
      ],
      runnerDeck: Array(10).fill("Easy Mark"),
      runnerCredits: 20,
    });
    s = corpInstall(s, "Tree Line", "rd");
    s = corpInstall(s, "Winchester", "hq");
    s = corpInstall(s, "Surveyor", "hq");
    const treeLine = card(s, "Tree Line").id;
    const surveyor = card(s, "Surveyor").id;
    s = rezNow(s, card(s, "Winchester").id);
    s = rezNow(s, treeLine);
    s = toAction(s, "runner");
    s = runnerInstall(s, "Masterwork (v37)");
    const first = card(s, "Boomerang", 1).id;
    s = runnerInstall(s, "Boomerang");
    s = choose(s, "unrezzed ice");
    expect(s.cards[first]!.chosenIceId).toBe(surveyor);
    s = runnerInstall(s, "The Class Act");
    const easyMark = (l: string[]) =>
      l.find((x) => /Easy Mark/.test(x)) ?? l[0]!;
    s = walkTo(s, "corp", easyMark);
    s = walkTo(s, "runner", easyMark);
    const second = card(s, "Boomerang", 2).id;
    expect(s.runner.hand).toContain(second);
    s = must(settle(s), { type: "basic_run", serverId: "rd" });
    for (let i = 0; i < 20 && s.timingKey !== "run.approachPaw"; i++) {
      if (s.pendingChoice) {
        const l = optionLabels(s);
        s = choose(
          s,
          l.find((x) => /Install Boomerang/.test(x)) ??
            l.find((x) => /Tree Line/.test(x)) ??
            easyMark(l),
        );
        continue;
      }
      s = pass(s);
    }
    expect(s.cards[first]!.zone).toBe("runner:heap");
    expect(s.cards[second]!.zone).toBe("runner:installed");
    expect(s.cards[second]!.chosenIceId).toBe(treeLine);
    expect(s.pendingChoice).toBeNull();
  });
});

describe("an HB Glacier server (printed text of each card)", () => {
  // jnet: game.core.scenarios-test/hb-glacier
  // Condensed: the cross-card points of the upstream mini-game, each checked
  // on one board.
  it("Breaker Bay Grid makes Adonis Campaign free to rez, HB pays 1 for the first install, Desperado and Lamprey pay out on a successful HQ run, and Turing has +3 strength on a remote", () => {
    let s = board({
      corpId: "Haas-Bioroid: Engineering the Future",
      corpHand: ["Adonis Campaign", "Breaker Bay Grid", "Turing"],
      corpCredits: 10,
      runnerHand: ["Desperado", "Lamprey"],
      runnerCredits: 20,
    });
    let credits = s.corp.credits;
    s = corpInstall(s, "Adonis Campaign", "new");
    expect(s.corp.credits).toBe(credits + 1);
    const adonis = card(s, "Adonis Campaign").id;
    const remote = s.cards[adonis]!.zone.split(":")[1]! as ServerId;
    s = corpInstall(s, "Breaker Bay Grid", remote);
    const bbg = card(s, "Breaker Bay Grid").id;
    for (const id of [bbg, adonis]) {
      const rez = legalActions(s).find(
        (a) => a.type === "rez_asset" && a.cardId === id,
      );
      expect(rez).toBeTruthy();
      credits = s.corp.credits;
      s = must(s, rez!);
      if (id === adonis) expect(s.corp.credits).toBe(credits);
    }
    s = toAction(s, "runner");
    s = runnerInstall(s, "Desperado");
    s = runnerInstall(s, "Lamprey");
    const runner = s.runner.credits;
    const corp = s.corp.credits;
    s = must(settle(s), { type: "basic_run", serverId: "hq" });
    s = driveRun(s, noAction);
    expect(s.runner.credits).toBe(runner + 1);
    expect(s.corp.credits).toBe(corp - 1);
    s = toAction(s, "corp");
    s = corpInstall(s, "Turing", remote);
    const turing = card(s, "Turing").id;
    expect(iceStrength(s, turing)).toBe((s.cards[turing]!.strength ?? 0) + 3);
  });

  // jnet: game.core.scenarios-test/hb-glacier
  // Engine bug, filed under area 14 and listed as a fix-now finding: after
  // Caprice Nisei's psi game ends the run, the run goes on, the pass-ice
  // step runs again, and Caprice starts another psi game, over and over.
  it.skip("Caprice Nisei, behind an unrezzed Turing, ends the run after one psi game when the bids differ (CR 6.1.4, 10.14)", () => {
    let s = board({
      corpHand: ["Turing", "Caprice Nisei", "PAD Campaign"],
      corpCredits: 10,
      runnerCredits: 20,
    });
    s = corpInstall(s, "PAD Campaign", "new");
    const remote = s.cards[card(s, "PAD Campaign").id]!.zone.split(
      ":",
    )[1]! as ServerId;
    s = corpInstall(s, "Caprice Nisei", remote);
    s = corpInstall(s, "Turing", remote);
    const caprice = card(s, "Caprice Nisei").id;
    s = toAction(s, "runner");
    s = must(settle(s), { type: "basic_run", serverId: remote });
    const rezCaprice = (x: GameState) =>
      legalActions(x).find(
        (a) => a.type === "rez_asset" && a.cardId === caprice,
      );
    s = passUntil(s, (x) => rezCaprice(x) != null, "a window to rez Caprice");
    s = must(s, rezCaprice(s)!);
    let games = 0;
    for (let i = 0; i < 60 && s.run; i++) {
      const legal = legalActions(s);
      if (legal.some((a) => a.type === "psi_corp_bid")) {
        s = must(s, { type: "psi_corp_bid", amount: 1 });
      } else if (legal.some((a) => a.type === "psi_runner_bid")) {
        games++;
        s = must(s, { type: "psi_runner_bid", amount: 2 });
      } else if (legal.some((a) => a.type === "pass_window")) s = pass(s);
      else if (legal.some((a) => a.type === "continue_run"))
        s = must(s, { type: "continue_run" });
      else break;
    }
    expect(games).toBe(1);
    expect(s.run).toBeNull();
    expect(s.turn.unsuccessfulRunThisTurn).toBe(true);
  });
});
