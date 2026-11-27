/**
 * Printed-text sweep S3g and S3h fixes (CR audit program, slice PF-S3d).
 *
 * Each describe block is one SanSan or Mumbad card the S3 sweep found
 * playing against its printed text (tests/baselines/printed-sweep.json).
 * The card text wins over the model (CR 1.2.1). Each test name states the
 * printed behavior and cites the rule it follows. Cards whose fix is card
 * JSON read the pinned catalog, so these tests also prove the paired cards
 * release.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  evalEffect,
  getCardDef,
  getPublicView,
  queryLegality,
} from "../src/index.js";
import type { GameState } from "../src/index.js";
import type { ServerId } from "../src/state/types.js";
import type { Effect } from "../src/effects/ir.js";
import { fx } from "../src/effects/ir.js";
import { paidAbilityOpenIn } from "../src/state/costs.js";
import { effectiveRunnerTags, runnerIsTagged } from "../src/state/tags.js";
import { trashCard } from "../src/state/procedures/trash.js";
import { trashCorpCardSet } from "../src/effects/kinds/trashKinds.js";
import { stealForbiddenThisAccess } from "../src/actions/access.js";
import { usePaidAbility } from "../src/actions/paidAbility.js";
import { breakSubroutine } from "../src/actions/breakSubroutine.js";
import { onRunnerTurnEnds } from "../src/state/staticFlags.js";
import { fireSiAfterPaidAbilityClicks } from "../src/effects/primitives/lookTrashAdd.js";
import { blankAbilitiesUntilCorpTurnEnd } from "../src/state/lingeringEffects.js";
import { iceAtRunnerPosition } from "../src/state/runPosition.js";
import { coversKind, expectStateDelta, snapshot } from "./kind-coverage.js";
import {
  clearCorpHand,
  clearRd,
  corpTurn,
  drive,
  fresh,
  installIce,
  installRoot,
  installRunner,
  must,
  optionIds,
  put,
  runnerTurn,
  setIdentity,
  stackRd,
  toHand,
} from "./rulings-helpers.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.29");
});

/** Evaluate an effect as `sourceId`'s ability. */
function evalAs(s: GameState, sourceId: string, effect: Effect): void {
  const r = evalEffect({ state: s, sourceId }, effect);
  expect(r.ok, r.ok ? "" : r.error).toBe(true);
}

/** Resolve one option of the open choice directly (unit level). */
function choose(s: GameState, optionId: string): void {
  const choice = s.pendingChoice;
  const option = choice?.options.find((o) => o.id === optionId);
  if (!choice || !option) {
    throw new Error(`No option ${optionId}; open: ${optionIds(s).join(", ")}`);
  }
  s.pendingChoice = null;
  evalAs(s, choice.sourceId, option.effect);
}

/** The instructions of a card's ability (from the pinned card data). */
function instructions(
  defId: string,
  match: (a: Record<string, unknown>) => boolean,
): Effect {
  const abilities = (
    getCardDef(defId) as unknown as { abilities: Record<string, unknown>[] }
  ).abilities;
  const found = abilities.find(match);
  if (!found) throw new Error(`${defId}: no such ability`);
  return found.instructions as Effect;
}

/** A card's subroutine effect by index. */
function sub(s: GameState, iceId: string, index: number): Effect {
  return s.cards[iceId]!.subroutines![index]!.effect;
}

function remote(s: GameState, id: string, ice: string[] = []): ServerId {
  (s.servers as Record<string, unknown>)[id] = {
    id,
    kind: "remote",
    root: [],
    ice,
  };
  return id as ServerId;
}

/** A run in progress on `serverId`, encountering nothing. */
function runOn(s: GameState, serverId: ServerId): void {
  s.run = {
    attackedServerId: serverId,
    phase: "approach_ice",
    position: null,
    successful: false,
    accessedCardIds: [],
    accessCandidates: [],
    randomAccessLimit: null,
    encounter: null,
    endedTheRun: false,
    cannotJackOut: false,
    accessingCardId: null,
  };
}

/** The position in the game's random stream: a shuffle moves it. */
function shuffles(s: GameState): number {
  return s.rngState ?? 0;
}

describe("Bandwidth", () => {
  it("its tag goes through the tag procedure, so Jesminder Sareen prevents it, and 1 tag is still removed if the run is successful (CR 9.9.6a)", () => {
    const s = fresh();
    setIdentity(s, "runner", "jesminder-sareen-girl-behind-the-curtain");
    installIce(s, "bandwidth", "bw-1", "hq");
    runOn(s, "hq");
    evalAs(s, "bw-1", sub(s, "bw-1", 0));
    expect(s.runner.tags).toBe(0);
    expect(s.run!.bandwidthTagsToRemoveOnSuccess).toBe(1);
  });
});

describe("Dorm Computer", () => {
  it("prevents every tag during the run it makes, and a tag after that run ends in the same turn is taken (CR 9.10.1)", () => {
    let s = runnerTurn(fresh());
    const dc = installRunner(s, "dorm-computer", "dc-1");
    dc.powerCounters = 4;
    s = must(s, {
      type: "use_paid_ability",
      cardId: "dc-1",
      abilityId: "dorm-computer-run",
    });
    s = must(s, { type: "choose_option", optionId: "run:hq" });
    expect(s.run?.preventAllTagsThisRun).toBe(true);
    evalAs(s, s.corp.identityId, fx.giveTags(2));
    expect(s.runner.tags).toBe(0);

    // A tag that cannot be avoided is not prevented (CR 1.2.2, 9.9.5).
    evalAs(
      s,
      s.corp.identityId,
      fx.do({ kind: "give_tags", amount: 1, cannotBeAvoided: true }),
    );
    expect(s.runner.tags).toBe(1);
    s.runner.tags = 0;

    // The run ends; a tag later that turn is not prevented.
    s.run = null;
    evalAs(s, s.corp.identityId, fx.giveTags(1));
    expect(s.runner.tags).toBe(1);
  });
});

describe("Jesminder Sareen: Girl Behind the Curtain", () => {
  it("prevents 1 tag the first time tags would be taken in each run, so a second run in the same turn prevents again (CR 1.2.1, 9.9.5a)", () => {
    const s = fresh();
    setIdentity(s, "runner", "jesminder-sareen-girl-behind-the-curtain");
    runOn(s, "hq");
    evalAs(s, s.corp.identityId, fx.giveTags(1));
    expect(s.runner.tags).toBe(0);
    // The second time in the same run is not the first.
    evalAs(s, s.corp.identityId, fx.giveTags(1));
    expect(s.runner.tags).toBe(1);

    // A second run that turn: its first tags are prevented by 1 again.
    s.run = null;
    runOn(s, "rd");
    evalAs(s, s.corp.identityId, fx.giveTags(2));
    expect(s.runner.tags).toBe(2);
    // Outside a run nothing is prevented.
    s.run = null;
    evalAs(s, s.corp.identityId, fx.giveTags(1));
    expect(s.runner.tags).toBe(3);
  });
});

describe("Paparazzi", () => {
  it('"You are tagged" makes the Runner tagged without giving a tag: tag counts stay 0 (CR 10.5.2)', () => {
    const s = fresh();
    installRunner(s, "paparazzi", "pz-1");
    expect(s.runner.tags).toBe(0);
    expect(runnerIsTagged(s)).toBe(true);
    expect(effectiveRunnerTags(s)).toBe(0);
  });
});

describe("Ronald Five", () => {
  it("the Runner loses a click when they trash Ronald Five itself, and not when the Corp trashes a Corp card (CR 9.1.8g, 1.14.5a)", () => {
    const s = runnerTurn(fresh());
    installRoot(s, "ronald-five", "r5-1");
    installRoot(s, "pad-campaign", "pad-1");
    trashCard(s, "pad-1", { by: "corp" });
    expect(s.runner.clicks).toBe(4);
    trashCard(s, "r5-1", { by: "runner" });
    expect(s.runner.clicks).toBe(3);
  });

  it("the click is lost through the lose-click procedure, during the Corp's turn too (CR 1.14.5a)", () => {
    const s = corpTurn(fresh());
    s.runner.clicks = 2;
    installRoot(s, "ronald-five", "r5-1");
    installRoot(s, "pad-campaign", "pad-1");
    trashCard(s, "pad-1", { by: "runner" });
    expect(s.runner.clicks).toBe(1);
    expect(s.log.some((l) => /runner loses 1 click/.test(l))).toBe(true);
  });
});

describe("Ronald Five (trashed set)", () => {
  it("when the Runner trashes a set of Corp cards with Ronald Five among them, they lose a click for each card of the set (CR 9.12.2a, 9.1.8g)", () => {
    const s = runnerTurn(fresh());
    installRoot(s, "ronald-five", "r5-1");
    installRoot(s, "pad-campaign", "pad-1");
    installRoot(s, "pad-campaign", "pad-2");
    trashCorpCardSet(s, ["r5-1", "pad-1", "pad-2"], {
      by: "runner",
      instruction: "test set",
    });
    expect(s.runner.clicks).toBe(1);
  });
});

describe("Lab Dog", () => {
  it("the Runner chooses which hardware to trash, and the choice is the Runner's seat (CR 1.14.5)", () => {
    const s = runnerTurn(fresh());
    installIce(s, "lab-dog", "ld-1", "hq");
    installRunner(s, "the-toolbox", "hw-1");
    installRunner(s, "dyson-mem-chip", "hw-2");
    runOn(s, "hq");
    evalAs(s, "ld-1", sub(s, "ld-1", 0));
    expect(s.pendingTrashProgram?.chooser).toBe("runner");
    const legal = queryLegality(s).legal.filter(
      (e) => e.action.type === "choose_trash_program",
    );
    expect(legal.map((e) => e.actor)).toEqual(["runner", "runner"]);
    const r = applyAction(s, { type: "choose_trash_program", cardId: "hw-2" });
    if (!r.ok) throw new Error(r.error);
    expect(r.state.runner.discardPile).toContain("hw-2");
    expect(r.state.runner.installed).toContain("hw-1");
  });
});

describe("Corporate Town", () => {
  it('"Trashing a resource this way cannot be prevented": no trash interrupt opens, from the choice or with one resource (CR 1.2.1)', () => {
    const effect = instructions(
      "corporate-town",
      (a) => a.trigger === "turn_begin",
    ) as Extract<Effect, { op: "choose" }>;
    const trash = effect.options.find((o) => o.id === "trash")!.effect;
    const s = corpTurn(fresh());
    installRoot(s, "corporate-town", "ct-1");
    installRunner(s, "fall-guy", "fg-1");
    installRunner(s, "kati-jones", "kj-1");
    evalAs(s, "ct-1", trash);
    const r = applyAction(s, { type: "choose_trash_program", cardId: "kj-1" });
    if (!r.ok) throw new Error(r.error);
    expect(r.state.pendingTrashPrevent ?? null).toBeNull();
    expect(r.state.runner.discardPile).toContain("kj-1");
  });
});

describe("Drive By", () => {
  it("offers only cards that can be exposed: a card in an Underway Grid server is not offered (CR 1.21.4)", () => {
    const s = runnerTurn(fresh());
    const a = remote(s, "remote-a");
    put(s, "pad-campaign", "pad-a", `server:${a}:root`);
    s.servers[a]!.root.push("pad-a");
    const b = remote(s, "remote-b");
    put(s, "pad-campaign", "pad-b", `server:${b}:root`);
    const ug = put(s, "underway-grid", "ug-1", `server:${b}:root`);
    ug.rezzed = true;
    ug.faceup = true;
    s.servers[b]!.root.push("pad-b", "ug-1");
    put(s, "drive-by", "db-1", "runner:play-area");
    evalAs(s, "db-1", fx.do({ kind: "expose_and_trash_remote_root" }));
    expect(optionIds(s)).toEqual(["driveby:pad-a"]);
    // The Runner's labels name the place, not the facedown card (CR 10.2.2a).
    const labels = JSON.stringify(getPublicView(s, "runner").pendingChoice);
    expect(labels).not.toContain("PAD Campaign");
    expect(labels).toContain("root of Remote a");
  });

  it('trashes the card only once it is exposed: an expose the Corp prevents trashes nothing, even for a card an earlier expose left faceup ("If you do", CR 1.21.4)', () => {
    let s = runnerTurn(fresh());
    const a = remote(s, "remote-a");
    const pad = put(s, "pad-campaign", "pad-a", `server:${a}:root`);
    s.servers[a]!.root.push("pad-a");
    // Exposed earlier this turn: it stays faceup.
    pad.faceup = true;
    s.turn.exposureCounts = { "pad-a": 1 };
    // A rezzed Zaibatsu Loyalty can prevent the expose.
    const zb = put(s, "zaibatsu-loyalty", "zb-1", `server:${a}:root`);
    zb.rezzed = true;
    zb.faceup = true;
    s.servers[a]!.root.push("zb-1");
    s.corp.credits = 5;
    put(s, "drive-by", "db-1", "runner:play-area");
    s.runner.playArea.push("db-1");
    evalAs(s, "db-1", fx.do({ kind: "expose_and_trash_remote_root" }));
    s = must(s, { type: "choose_option", optionId: "driveby:pad-a" });
    expect(s.pendingExpose?.cardId).toBe("pad-a");
    const prevent = queryLegality(s).legal.find(
      (e) => e.action.type === "use_paid_ability" && e.action.cardId === "zb-1",
    );
    expect(prevent).toBeDefined();
    s = must(s, prevent!.action);
    expect(s.corp.discardPile).not.toContain("pad-a");
    expect(s.cards["pad-a"]!.zone).toBe(`server:${a}:root`);
  });
});

describe("Election Day and Game Day", () => {
  it("Election Day draws through the draw procedure: the cards are set aside and checked before reaching HQ (CR 8.4.2)", () => {
    const s = corpTurn(fresh());
    clearCorpHand(s);
    clearRd(s);
    toHand(s, "corp", "hedge-fund", "hq-1");
    stackRd(s, [
      ["ice-wall", "rd-1"],
      ["ice-wall", "rd-2"],
    ]);
    put(s, "election-day", "ed-1", "corp:play-area");
    evalAs(s, "ed-1", fx.do({ kind: "trash_hq_draw", amount: 5 }));
    expect(s.corp.discardPile).toContain("hq-1");
    expect(s.corp.hand).toEqual(["rd-1", "rd-2"]);
    expect(s.log.some((l) => l.includes("CR 8.4.5a"))).toBe(true);
    // R&D ran out before the fifth card: the Runner wins (CR 1.7.2c).
    expect(s.winner).toBe("runner");
  });

  it("Game Day draws through the draw procedure, so Genetics Pavilion's limit applies (CR 8.4.2)", () => {
    const s = runnerTurn(fresh());
    installRoot(s, "genetics-pavilion", "gp-1");
    for (let i = 0; i < 5; i++) {
      put(s, "sure-gamble", `st-${i}`, "runner:stack");
      s.runner.deck.unshift(`st-${i}`);
    }
    put(s, "game-day", "gd-1", "runner:play-area");
    evalAs(s, "gd-1", fx.do({ kind: "draw_until_grip_equals_max_hand_size" }));
    expect(s.runner.hand).toHaveLength(2);
  });
});

describe("Off-Campus Apartment", () => {
  it("installing a connection on it draws 1 card through the draw procedure, as a pending conditional ability (CR 9.6.2, 8.4.2)", () => {
    let s = runnerTurn(fresh());
    installRunner(s, "off-campus-apartment", "oca-1");
    toHand(s, "runner", "kati-jones", "kj-1");
    put(s, "sure-gamble", "st-1", "runner:stack");
    s.runner.deck.unshift("st-1");
    s = must(s, {
      type: "basic_install",
      cardId: "kj-1",
      destination: { kind: "host_card", hostId: "oca-1" },
    } as never);
    s = drive(s, (x) => x.timingKey === "runner.takeAction");
    expect(s.cards["kj-1"]!.hostId).toBe("oca-1");
    expect(s.runner.hand).toEqual(["st-1"]);
    expect(
      s.log.some((l) => l.includes("Off-Campus Apartment becomes pending")),
    ).toBe(true);
  });
});

describe("Patron", () => {
  it("the chosen server lasts until the turn ends, so declining on a later turn leaves no server chosen (CR 9.10.3b)", () => {
    const s = runnerTurn(fresh());
    const patron = installRunner(s, "patron", "pt-1");
    patron.namedServerId = "hq";
    onRunnerTurnEnds(s);
    expect(patron.namedServerId).toBeUndefined();
  });

  it("draws 2 through the draw procedure instead of breaching the chosen server, so Genetics Pavilion's limit applies (CR 8.4.2)", () => {
    let s = runnerTurn(fresh());
    installRoot(s, "genetics-pavilion", "gp-1");
    s.turn.uotRunnerCardsDrawnThisTurn = 1;
    const patron = installRunner(s, "patron", "pt-1");
    patron.namedServerId = "archives";
    for (let i = 0; i < 3; i++) {
      put(s, "sure-gamble", `st-${i}`, "runner:stack");
      s.runner.deck.unshift(`st-${i}`);
    }
    s = must(s, { type: "basic_run", serverId: "archives" });
    s = drive(s, (x) => x.timingKey === "runner.takeAction" && !x.run);
    expect(s.runner.hand).toHaveLength(1);
    expect(s.cards["pt-1"]!.namedServerId).toBeUndefined();
  });
});

describe("EMP Device", () => {
  it("after it is used the Corp can rez only 1 more piece of ice that run (CR 1.2.2)", () => {
    let s = runnerTurn(fresh());
    s.corp.credits = 20;
    const server = remote(s, "remote-x");
    installIce(s, "ice-wall", "iw-in", server, false);
    installIce(s, "bandwidth", "bw-out", server, false);
    installRunner(s, "emp-device", "emp-1");
    s = must(s, { type: "basic_run", serverId: server });
    s = drive(s, (x) => x.timingKey === "run.approachPaw");
    s = must(s, {
      type: "use_paid_ability",
      cardId: "emp-1",
      abilityId: "emp-device-limit-rez",
    });
    s = must(s, { type: "rez_ice", cardId: "bw-out" });
    expect(s.cards["bw-out"]!.rezzed).toBe(true);
    // On to the inner ice's approach.
    s = drive(
      s,
      (x) =>
        x.timingKey === "run.approachPaw" && iceAtRunnerPosition(x) === "iw-in",
    );
    // A second use does not lift the limit (CR 1.2.2).
    evalAs(s, "emp-1", fx.do({ kind: "rez_emp_device_limit_ice_this_run" }));
    const r = applyAction(s, { type: "rez_ice", cardId: "iw-in" });
    expect(r.ok).toBe(false);
  });
});

describe("Lakshmi Smartfabrics", () => {
  it("the Runner cannot steal copies of the revealed agenda for the rest of the turn (CR 1.2.2)", () => {
    const s = corpTurn(fresh());
    clearCorpHand(s);
    const lak = installRoot(s, "lakshmi-smartfabrics", "lak-1");
    lak.powerCounters = 2;
    toHand(s, "corp", "hostile-takeover", "ht-1");
    put(s, "hostile-takeover", "ht-2", "corp:rd");
    s.corp.deck.unshift("ht-2");
    put(s, "project-beale", "pb-1", "corp:rd");
    s.corp.deck.unshift("pb-1");
    evalAs(
      s,
      "lak-1",
      fx.do({ kind: "cannot_steal_copies_of_revealed_agenda" }),
    );
    expect(lak.powerCounters).toBe(1);
    expect(stealForbiddenThisAccess(s, "ht-2")).toBe(true);
    expect(stealForbiddenThisAccess(s, "pb-1")).toBe(false);
  });
});

describe("Magnet", () => {
  it("offers only programs hosted on a piece of ice, not one hosted on a Runner card (CR 1.2.1)", () => {
    const s = corpTurn(fresh());
    installIce(s, "magnet", "mg-1", "hq");
    installIce(s, "ice-wall", "iw-1", "rd");
    installRunner(s, "dinosaurus", "dino-1");
    const onDino = installRunner(s, "corroder", "cor-1");
    onDino.hostId = "dino-1";
    const onIce = installRunner(s, "gordian-blade", "gb-1");
    onIce.hostId = "iw-1";
    installRunner(s, "femme-fatale", "ff-1");
    const onIce2 = s.cards["ff-1"]!;
    onIce2.hostId = "iw-1";
    evalAs(s, "mg-1", fx.do({ kind: "host_ice_program_on_self" }));
    expect(optionIds(s).sort()).toEqual(["magnet:ff-1", "magnet:gb-1"]);
  });
});

describe("Ravana 1.0", () => {
  it("the Corp chooses which subroutine on another rezzed bioroid ice resolves (CR 1.15.2)", () => {
    const s = corpTurn(fresh());
    installIce(s, "ravana-1-0", "rav-1", "hq");
    installIce(s, "viktor-1-0", "vik-1", "rd");
    evalAs(s, "rav-1", sub(s, "rav-1", 0));
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(optionIds(s)).toEqual(["sub:vik-1:0", "sub:vik-1:1"]);
    // The subroutine resolves as Viktor 1.0's own.
    coversKind("resolve_ice_subroutine");
    const before = snapshot(s);
    choose(s, "sub:vik-1:0");
    expectStateDelta(before, s, { "runner.coreDamage": 1 });
    expect(s.log).toContain(
      'Resolve "Do 1 core damage." on Viktor 1.0 (via Ravana 1.0).',
    );
  });

  it("two Ravanas and no other bioroid are a mandatory loop whose length the Corp names (CR 10.1.6a)", () => {
    const s = corpTurn(fresh());
    installIce(s, "ravana-1-0", "rav-1", "hq");
    installIce(s, "ravana-1-0", "rav-2", "rd");
    evalAs(s, "rav-1", sub(s, "rav-1", 0));
    expect(s.pendingChoice?.loopCount).toBe(true);
  });
});

describe("Upayoga", () => {
  it("resolving a subroutine on a rezzed psi ice is not optional: no Decline, and its own psi subroutine is offered (CR 1.2.1)", () => {
    const s = corpTurn(fresh());
    installIce(s, "upayoga", "up-1", "hq");
    evalAs(s, "up-1", sub(s, "up-1", 1));
    expect(optionIds(s)).toEqual(["sub:up-1:0", "sub:up-1:1"]);
  });
});

describe("Vikram 1.0", () => {
  it("after its first subroutine the Runner cannot use programs this run: no pump, no break (CR 9.1.6, 1.2.2)", () => {
    let s = runnerTurn(fresh());
    installIce(s, "vikram-1-0", "vk-1", "hq");
    const brk = installRunner(s, "corroder", "cor-1");
    brk.faceup = true;
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, (x) => x.timingKey === "run.encounterPaw");
    evalAs(s, "vk-1", sub(s, "vk-1", 0));
    expect(s.run?.kgCannotUsePrograms).toBe(true);
    expect(usePaidAbility(s, "cor-1", "corroder-pump").ok).toBe(false);
    expect(breakSubroutine(s, "cor-1", 1).ok).toBe(false);
  });
});

describe("Jeeves Model Bioroids", () => {
  it("a blanked Jeeves gives no click (CR 9.1.9a)", () => {
    const s = corpTurn(fresh());
    installRoot(s, "jeeves-model-bioroids", "jv-1");
    blankAbilitiesUntilCorpTurnEnd(s, {
      createdBy: s.runner.identityId,
      cardId: "jv-1",
    });
    fireSiAfterPaidAbilityClicks(s, 3);
    expect(s.corp.clicks).toBe(3);
  });
});

describe("R&D searches", () => {
  it("Recruiting Trip: the Corp chooses up to X different sysops by title and may find fewer; R&D is shuffled (CR 8.7.2e, 8.7.3)", () => {
    const s = corpTurn(fresh());
    clearRd(s);
    clearCorpHand(s);
    stackRd(s, [
      ["tori-hanzo", "th-1"],
      ["tori-hanzo", "th-2"],
      ["midori", "mi-1"],
      ["hedge-fund", "hf-1"],
    ]);
    put(s, "recruiting-trip", "rt-1", "corp:play-area");
    s.turn.lastPlayCostX = 2;
    const before = shuffles(s);
    evalAs(
      s,
      "rt-1",
      fx.do({ kind: "search_rd_up_to_x_subtype_to_hq", subtype: "sysop" }),
    );
    // The Corp looks at all of R&D (CR 8.7.1); the Runner sees one hidden
    // option, whatever R&D holds (CR 10.2.2b).
    expect(s.cards["hf-1"]!.lookedBy).toBe("corp");
    expect(getPublicView(s, "runner").pendingChoice?.options).toHaveLength(1);
    choose(s, "choose-card:th-2");
    // A second Tori Hanzo is not offered: different titles only.
    expect(optionIds(s)).toEqual(["choose-card:mi-1", "choose-cards-done"]);
    choose(s, "choose-cards-done");
    expect(s.corp.hand).toEqual(["th-2"]);
    expect(shuffles(s)).not.toBe(before);
  });

  it("Localized Product Line: the Corp may take fewer than every copy, all of one title (CR 8.7.2e)", () => {
    const s = corpTurn(fresh());
    clearRd(s);
    clearCorpHand(s);
    stackRd(s, [
      ["hedge-fund", "hf-1"],
      ["hedge-fund", "hf-2"],
      ["ice-wall", "iw-1"],
    ]);
    put(s, "localized-product-line", "lpl-1", "corp:play-area");
    evalAs(s, "lpl-1", fx.do({ kind: "search_rd_copies_to_hq" }));
    choose(s, "choose-card:hf-1");
    expect(optionIds(s)).toEqual(["choose-card:hf-2", "choose-cards-done"]);
    choose(s, "choose-cards-done");
    expect(s.corp.hand).toEqual(["hf-1"]);
    expect(s.corp.deck.sort()).toEqual(["hf-2", "iw-1"]);
  });

  it("The Future is Now: the card found goes to HQ without being revealed, and R&D is shuffled (CR 8.7.2c, 10.2.2a)", () => {
    const s = corpTurn(fresh());
    clearRd(s);
    clearCorpHand(s);
    stackRd(s, [
      ["hedge-fund", "hf-1"],
      ["ice-wall", "iw-1"],
      ["pad-campaign", "pc-1"],
      ["enigma", "en-1"],
    ]);
    put(s, "the-future-is-now", "tfn-1", "corp:score");
    const before = shuffles(s);
    const revealsBefore = (s.reveals ?? []).length;
    evalAs(s, "tfn-1", fx.do({ kind: "search_rd_any_card_to_hq" }));
    choose(s, "choose-card:iw-1");
    expect(s.corp.hand).toEqual(["iw-1"]);
    expect((s.reveals ?? []).length).toBe(revealsBefore);
    expect(shuffles(s)).not.toBe(before);
  });

  it("Mumbad City Hall: the Corp may find no alliance card, and R&D is still shuffled (CR 8.7.2e, 8.7.3)", () => {
    const s = corpTurn(fresh());
    clearRd(s);
    clearCorpHand(s);
    stackRd(s, [
      ["product-recall", "pr-1"],
      ["hedge-fund", "hf-1"],
    ]);
    installRoot(s, "mumbad-city-hall", "mch-1");
    const before = shuffles(s);
    evalAs(s, "mch-1", fx.do({ kind: "search_alliance_play_or_install" }));
    expect(s.pendingChoice?.chooser).toBe("corp");
    choose(s, "choose-cards-done");
    expect(s.corp.hand).toEqual([]);
    expect(s.corp.deck).toHaveLength(2);
    expect(shuffles(s)).not.toBe(before);
  });
});

describe("Disposable HQ", () => {
  it("the Corp chooses which HQ cards go to the bottom of R&D and their order, and may keep the rest (CR 1.14.5)", () => {
    const s = corpTurn(fresh());
    clearRd(s);
    clearCorpHand(s);
    stackRd(s, [["ice-wall", "rd-1"]]);
    toHand(s, "corp", "hedge-fund", "h-1");
    toHand(s, "corp", "ice-wall", "h-2");
    toHand(s, "corp", "pad-campaign", "h-3");
    put(s, "disposable-hq", "dhq-1", "server:hq:root");
    evalAs(s, "dhq-1", fx.do({ kind: "add_hq_to_bottom_rd" }));
    expect(s.pendingChoice?.hiddenFromOpponent).toBe(true);
    choose(s, "choose-card:h-3");
    choose(s, "choose-card:h-1");
    choose(s, "choose-cards-done");
    expect(s.corp.hand).toEqual(["h-2"]);
    expect(s.corp.deck).toEqual(["rd-1", "h-3", "h-1"]);
  });
});

describe("Ibrahim Salem", () => {
  it("the Corp looks at the grip; no grip card is turned faceup or revealed (CR 1.21.2)", () => {
    const s = corpTurn(fresh());
    toHand(s, "runner", "sure-gamble", "g-1");
    toHand(s, "runner", "corroder", "g-2");
    installRoot(s, "ibrahim-salem", "ib-1");
    s.cards["g-1"]!.faceup = false;
    s.cards["g-2"]!.faceup = false;
    evalAs(s, "ib-1", fx.do({ kind: "trash_named_type", cardType: "event" }));
    expect(s.runner.discardPile).toContain("g-1");
    expect(s.cards["g-2"]!.faceup).toBe(false);
    expect(s.cards["g-2"]!.lookedBy).toBe("corp");
    expect(s.looks?.at(-1)?.by).toBe("corp");
  });
});

describe("PAD Factory", () => {
  it("the card cannot be scored until the Corp's next turn begins, and can still be rezzed (CR 1.2.1)", () => {
    let s = corpTurn(fresh());
    const ag = installRoot(s, "project-beale", "pb-1", false);
    ag.advancementCounters = 2;
    installRoot(s, "pad-factory", "pf-1");
    const asset = installRoot(s, "pad-campaign", "pc-1", false);
    evalAs(
      s,
      "pf-1",
      fx.do({ kind: "place_advancement_resolve", cardId: "pb-1" }),
    );
    evalAs(
      s,
      "pf-1",
      fx.do({ kind: "place_advancement_resolve", cardId: "pc-1" }),
    );
    expect(ag.advancementCounters).toBe(3);
    expect(applyAction(s, { type: "score_agenda", cardId: "pb-1" }).ok).toBe(
      false,
    );
    expect(asset.advancementCounters).toBe(1);
    s.timingKey = "corp.actionPaw";
    s = must(s, { type: "rez_asset", cardId: "pc-1" });
    expect(s.cards["pc-1"]!.rezzed).toBe(true);
  });
});

describe("New Construction", () => {
  it("does not offer ice: ice is not installed in the root of a server (CR 3.4.2)", () => {
    const s = corpTurn(fresh());
    clearCorpHand(s);
    toHand(s, "corp", "ice-wall", "iw-1");
    toHand(s, "corp", "pad-campaign", "pc-1");
    installRoot(s, "new-construction", "nc-1");
    evalAs(s, "nc-1", fx.do({ kind: "install_from_hq_new_remote" }));
    expect(optionIds(s)).toEqual(["nc-install:pc-1"]);
  });
});

describe("Bookmark", () => {
  it("hosts up to 3 cards each time it is used, with no limit on how many it hosts in all (CR 1.2.1)", () => {
    const s = runnerTurn(fresh());
    installRunner(s, "bookmark", "bm-1");
    for (let i = 0; i < 5; i++) toHand(s, "runner", "sure-gamble", `g-${i}`);
    evalAs(s, "bm-1", fx.do({ kind: "host_up_to_3_from_grip_facedown" }));
    for (let i = 0; i < 3; i++) choose(s, `bookmark-host:g-${i}`);
    expect(s.pendingChoice).toBeNull();
    evalAs(s, "bm-1", fx.do({ kind: "host_up_to_3_from_grip_facedown" }));
    choose(s, "bookmark-host:g-3");
    expect(s.cards["bm-1"]!.hostedCardIds).toHaveLength(4);
  });
});

describe("Advanced Assembly Lines", () => {
  it("installs a non-agenda card from HQ with no Decline once its ability resolves (CR 1.2.1, 1.15.2e)", () => {
    const s = corpTurn(fresh());
    clearCorpHand(s);
    toHand(s, "corp", "pad-campaign", "pc-1");
    toHand(s, "corp", "hostile-takeover", "ht-1");
    installRoot(s, "advanced-assembly-lines", "aal-1");
    const effect = instructions(
      "advanced-assembly-lines",
      (a) => a.id === "aal-install",
    );
    coversKind("install_from_hq_paying_costs");
    const before = snapshot(s);
    evalAs(s, "aal-1", effect);
    expect(optionIds(s)).toEqual(["hq-install:pc-1"]);
    // The Runner does not learn how many HQ cards could be installed
    // (CR 10.2.2a).
    expect(getPublicView(s, "runner").pendingChoice?.options).toHaveLength(1);
    choose(s, "hq-install:pc-1");
    expectStateDelta(before, s, { "corp.hand": { to: ["ht-1"] } });
    expect(s.cards["pc-1"]!.zone).toMatch(/^server:remote-.*:root$/);
  });
});

describe("Study Guide", () => {
  it("its 2-credit power counter ability is open in every paid ability window (CR 9.2.7b)", () => {
    const ability = getCardDef("study-guide").paidAbilities!.find(
      (a) => a.id === "study-guide-power",
    )!;
    for (const paw of [
      "corp_action_paw",
      "runner_action_paw",
      "approach_paw",
      "encounter_paw",
      "run_movement_paw",
    ] as const) {
      expect(paidAbilityOpenIn(ability, paw), paw).toBe(true);
    }
  });
});

describe("High-Stakes Job", () => {
  it("the 12 credits come when the run ends, after the breach, so they cannot pay a trash cost in it (CR 6.8.5, 6.9.5a)", () => {
    let s = runnerTurn(fresh(), 6);
    const server = remote(s, "remote-x");
    installIce(s, "ice-wall", "iw-1", server, false);
    put(s, "pad-campaign", "pc-1", `server:${server}:root`);
    s.servers[server]!.root.push("pc-1");
    toHand(s, "runner", "high-stakes-job", "hsj-1");
    s = must(s, { type: "play_event", cardId: "hsj-1", serverId: server });
    s = drive(s, (x) => x.timingKey === "breach.awaitAccess");
    expect(s.run?.successful).toBe(true);
    expect(s.runner.credits).toBe(0);
    s = drive(s, (x) => x.timingKey === "runner.takeAction" && !x.run);
    expect(s.runner.credits).toBe(12);
  });
});
