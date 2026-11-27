/**
 * Printed-text sweep S3c and S3d fixes (CR audit program, slice PF-S3b).
 *
 * Each describe block is one Creation and Control, Honor and Profit or Spin
 * card the S3 sweep found playing against its printed text
 * (tests/baselines/printed-sweep.json). The card text wins over the model
 * (CR 1.2.1). Each test name states the printed behavior and cites the rule
 * it follows. Cards whose fix is card JSON read the pinned catalog, so these
 * tests also prove the paired cards release.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  applyAction,
  evalEffect,
  getCardDef,
  getPublicView,
  legalActions,
} from "../src/index.js";
import type { GameState } from "../src/index.js";
import type { Action, ServerId } from "../src/state/types.js";
import type { Effect } from "../src/effects/ir.js";
import { fx } from "../src/effects/ir.js";
import { effectiveBreakerStrength } from "../src/cards/stubs.js";
import {
  declaredBreakBlock,
  interfaceBlock,
} from "../src/state/procedures/break.js";
import {
  mayAdvanceInstalledCard,
  printsCanBeAdvanced,
} from "../src/state/counters/advanceable.js";
import { paidAbilityOpenIn } from "../src/state/costs.js";
import { operationAndEventPlayCostIncreaseTotal } from "../src/state/costs.js";
import { firePowerCounterOnAnyCorpInstall } from "../src/state/counters/powerCounters.js";
import { computeRunnerMaxHandSize } from "../src/state/continuous/handSize.js";
import { effectiveAdvancementRequirement } from "../src/state/scoring.js";
import { collectBadPublicityGainedSubs } from "../src/state/continuous/continuousSubs.js";
import { psiCorpBid, psiRunnerBid, startPsiGame } from "../src/state/psi.js";
import { effectiveIceSubtypes } from "../src/cards/stubs.js";
import { stealDecision } from "../src/legality/candidatePending.js";
import { hostCard } from "../src/state/hostingAndTrash/host.js";
import { usedMemory } from "../src/state/turn.js";
import { coversKind, expectStateDelta, snapshot } from "./kind-coverage.js";
import {
  atRunnerAction,
  corpTurn,
  drive,
  fresh,
  installIce,
  installRoot,
  installRunner,
  must,
  optionIds,
  pick,
  put,
  runnerTurn,
  stackRd,
  toCorpTurn,
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

/** The card data's instructions for one of a card's abilities. */
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

const playOf = (defId: string) =>
  instructions(defId, (a) => a.class === "play");

/** A run in progress on `serverId`, at its success step. */
function successfulRun(s: GameState, serverId: ServerId): void {
  s.run = {
    attackedServerId: serverId,
    phase: "success",
    position: null,
    successful: true,
    accessedCardIds: [],
    accessCandidates: [],
    randomAccessLimit: null,
    encounter: null,
    endedTheRun: false,
    cannotJackOut: false,
    accessingCardId: null,
  };
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

const runIs = (step: string) => (s: GameState) => s.timingKey === step;

/** Play on to the Runner's next action, taking damage and first options. */
function finishRun(s: GameState): GameState {
  for (let i = 0; i < 60 && !atRunnerAction(s); i++) {
    if (s.pendingChoice) {
      s = must(s, { type: "choose_option", optionId: optionIds(s)[0]! });
    } else if (s.pendingDamage) {
      s = must(s, { type: "accept_damage" });
    } else {
      s = drive(s, (x) => atRunnerAction(x) || Boolean(x.pendingDamage));
    }
  }
  return s;
}

// ---------------------------------------------------------------------------
// Icebreakers
// ---------------------------------------------------------------------------

describe("Alias, Breach, Passport", () => {
  it("cannot interface with ice protecting a remote server, but can with ice protecting a central server (CR 9.3.6c)", () => {
    for (const [defId, iceDef] of [
      ["alias", "enigma"],
      ["breach", "ice-wall"],
      ["passport", "enigma"],
    ] as const) {
      const s = runnerTurn(fresh());
      installRunner(s, defId, "brk-1");
      const server = remote(s, "remote-9");
      installIce(s, iceDef, "far-1", server, true);
      installIce(s, iceDef, "hq-1", "hq" as ServerId, true);
      const far = interfaceBlock(s, "brk-1", "far-1");
      expect(far?.error, defId).toMatch(/remote server/);
      const near = interfaceBlock(s, "brk-1", "hq-1");
      expect(near?.error ?? "", defId).not.toMatch(/remote server/);
    }
  });
});

describe("Alpha, Omega", () => {
  it("break a subroutine on any ice, not only sentries: the printed ability names no subtype (CR 3.9.5h)", () => {
    for (const defId of ["alpha", "omega"]) {
      const s = runnerTurn(fresh());
      installRunner(s, defId, "brk-1");
      installIce(s, "ice-wall", "iw-1", "hq" as ServerId, true);
      expect(declaredBreakBlock(s, "brk-1", "iw-1"), defId).toBeNull();
    }
  });
});

describe("Sharpshooter", () => {
  it("breaks destroyer subroutines only by trashing itself, and that ability is not once per turn (CR 9.3.6g, 1.2.1)", () => {
    const def = getCardDef("sharpshooter");
    expect(def.breaker?.breakViaPaidAbilityOnly).toBe(true);
    const s = runnerTurn(fresh());
    const card = installRunner(s, "sharpshooter", "ss-1");
    const trash = card.paidAbilities?.find(
      (a) => a.id === "sharpshooter-trash-break",
    );
    expect(trash).toBeDefined();
    expect(JSON.stringify(trash)).not.toMatch(/once_per_turn/);
  });
});

describe("Overmind", () => {
  it("pays a hosted power counter to break 1 subroutine and 1 credit for +1 strength, and its counters do not add strength (CR 1.2.1, 3.9.5b)", () => {
    const s = runnerTurn(fresh());
    const card = installRunner(s, "overmind", "om-1");
    card.powerCounters = 3;
    expect(effectiveBreakerStrength(s, "om-1")).toBe(0);
    expect(card.breaker?.breakViaPaidAbilityOnly).toBe(true);
    const ids = (card.paidAbilities ?? []).map((a) => a.id);
    expect(ids).toEqual(
      expect.arrayContaining(["overmind-break", "overmind-pump"]),
    );
    const brk = card.paidAbilities!.find((a) => a.id === "overmind-break")!;
    expect(brk.cost?.powerCounters).toBe(1);
    expect(brk.cost?.credits ?? 0).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Ice
// ---------------------------------------------------------------------------

describe("Himitsu-Bako, Snoop, Viktor 2.0", () => {
  it("their paid abilities can be used in every paid ability window, as printed with no restriction (CR 9.2.7b)", () => {
    for (const [defId, abilityId] of [
      ["himitsu-bako", "himitsu-bako-hq"],
      ["snoop", "snoop-counter-reveal"],
      ["viktor-2-0", "viktor-2-0-core"],
    ] as const) {
      const s = fresh();
      const ice = installIce(s, defId, "ice-1", "hq" as ServerId, true);
      const ability = ice.paidAbilities!.find((a) => a.id === abilityId)!;
      for (const paw of [
        "corp_action_paw",
        "runner_action_paw",
        "approach_paw",
        "encounter_paw",
        "run_movement_paw",
      ] as const) {
        expect(paidAbilityOpenIn(ability, paw), `${defId} ${paw}`).toBe(true);
      }
    }
  });
});

describe("Hive", () => {
  it("has 5 printed 'End the run' subroutines and loses 1 for each agenda point (CR 9.8.2b)", () => {
    const s = fresh();
    const hive = installIce(s, "hive", "hive-1", "hq" as ServerId, true);
    expect(hive.subroutines).toHaveLength(5);
  });
});

describe("Shinobi", () => {
  it("its third subroutine does 3 net damage and ends the run when the trace succeeds (CR 1.2.1)", () => {
    const s = runnerTurn(fresh());
    const ice = installIce(s, "shinobi", "sh-1", "hq" as ServerId, true);
    for (let i = 0; i < 4; i++) toHand(s, "runner", "sure-gamble", `sg-${i}`);
    successfulRun(s, "hq" as ServerId);
    const sub = ice.subroutines![2]!.effect as Extract<Effect, { op: "do" }>;
    const onSuccess = (sub.action as { onSuccess: Effect }).onSuccess;
    evalAs(s, "sh-1", onSuccess);
    expect(s.run?.endedTheRun).toBe(true);
    expect(s.pendingDamage?.remaining ?? 3).toBe(3);
  });
});

describe("Ichi 2.0", () => {
  it("the Corp chooses which installed program its subroutine trashes (CR 1.14.5)", () => {
    const s = runnerTurn(fresh());
    const ice = installIce(s, "ichi-2-0", "ichi-1", "hq" as ServerId, true);
    installRunner(s, "corroder", "cor-1");
    installRunner(s, "gordian-blade", "gb-1");
    evalAs(s, "ichi-1", ice.subroutines![0]!.effect);
    expect(s.pendingTrashProgram?.chooser).toBe("corp");
  });
});

describe("Zed 1.0", () => {
  it("can be broken by losing a click at once, and its subroutine does core damage only if the Runner has lost a click to break this run (CR 1.2.1, 9.8.5)", () => {
    const s = runnerTurn(fresh());
    const ice = installIce(s, "zed-1-0", "zed-1", "hq" as ServerId, true);
    expect(
      ice.subroutines!.some(
        (sub) =>
          (sub as { requireLostClickToBreakThisRun?: boolean })
            .requireLostClickToBreakThisRun,
      ),
    ).toBe(false);
    successfulRun(s, "hq" as ServerId);
    const before = s.runner.coreDamage ?? 0;
    evalAs(s, "zed-1", ice.subroutines![0]!.effect);
    expect(s.pendingDamage).toBeFalsy();
    expect(s.runner.coreDamage ?? 0).toBe(before);
    s.run!.lostClickToBreakThisRun = true;
    evalAs(s, "zed-1", ice.subroutines![1]!.effect);
    expect(
      s.pendingDamage?.type === "core" || (s.runner.coreDamage ?? 0) > before,
    ).toBe(true);
  });
});

describe("Ireress", () => {
  it("gains one 'The Runner loses 1 credit' subroutine for each bad publicity, each broken on its own (CR 9.8.3d)", () => {
    const s = fresh();
    installIce(s, "ireress", "ir-1", "hq" as ServerId, true);
    s.corp.badPublicity = 0;
    expect(collectBadPublicityGainedSubs(s, "ir-1")).toHaveLength(0);
    s.corp.badPublicity = 3;
    const subs = collectBadPublicityGainedSubs(s, "ir-1");
    expect(subs).toHaveLength(3);
    expect(subs.every((sub) => sub.text.includes("loses 1"))).toBe(true);
  });
});

describe("Swarm", () => {
  it("can be advanced while unrezzed, as 'You can advance this ice' allows (CR 1.18.3)", () => {
    const s = fresh();
    const ice = installIce(s, "swarm", "sw-1", "hq" as ServerId, false);
    expect(mayAdvanceInstalledCard(ice)).toBe(true);
  });
});

describe("Susanoo-no-Mikoto", () => {
  it("moves the Runner to the outermost position of Archives, and the Runner cannot jack out until they encounter a piece of ice (CR 6.2.8b, 1.2.1)", () => {
    let s = runnerTurn(fresh());
    installIce(s, "susanoo-no-mikoto", "su-1", "hq" as ServerId, true);
    installIce(s, "ice-wall", "arc-1", "archives" as ServerId, false);
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, runIs("run.encounterPaw"));
    s = drive(s, (x) => x.run?.attackedServerId === "archives");
    expect(s.run?.attackedServerId).toBe("archives");
    expect(s.run?.cannotJackOut).toBe(true);
    expect(s.run?.clearCannotJackOutOnNextEncounterBegin).toBe(true);
  });
});

describe("Komainu", () => {
  it("gains X net damage subroutines on each encounter for the remainder of the run, and loses them when the run ends (CR 9.10.1)", () => {
    let s = runnerTurn(fresh());
    installIce(s, "komainu", "ko-1", "hq" as ServerId, true);
    for (let i = 0; i < 2; i++) toHand(s, "runner", "sure-gamble", `sg-${i}`);
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, runIs("run.encounterPaw"));
    expect(s.cards["ko-1"]!.subroutines).toHaveLength(2);
    // A second encounter this run adds X more instead of replacing them.
    evalAs(s, "ko-1", fx.do({ kind: "add_net_subs_for_rezzed_ice" }));
    expect(s.cards["ko-1"]!.subroutines).toHaveLength(4);
    evalAs(s, "ko-1", fx.do({ kind: "end_the_run" }));
    s = finishRun(s);
    expect(s.cards["ko-1"]!.subroutines ?? []).toHaveLength(0);
  });
});

describe("Marker", () => {
  it("the 'End the run' it gives the next ice lasts only for the remainder of that run (CR 9.10.1)", () => {
    let s = runnerTurn(fresh());
    installIce(s, "enigma", "en-1", "hq" as ServerId, true);
    installIce(s, "marker", "mk-1", "hq" as ServerId, true);
    s.runner.clicks = 4;
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, (x) => (x.cards["en-1"]!.subroutines ?? []).length === 3);
    expect(s.cards["en-1"]!.subroutines!.at(-1)?.text).toBe("End the run.");
    s = drive(s, (x) => !x.run && x.timingKey === "runner.takeAction");
    expect(s.cards["en-1"]!.subroutines).toHaveLength(2);
  });
});

describe("Howler", () => {
  it("the Corp may decline to install a bioroid ice, even when there is only one (CR 9.6.9)", () => {
    const s = runnerTurn(fresh());
    installIce(s, "howler", "how-1", "hq" as ServerId, true);
    toHand(s, "corp", "eli-1-0", "eli-1");
    successfulRun(s, "hq" as ServerId);
    evalAs(s, "how-1", fx.do({ kind: "may_install_rez_bioroid_inward" }));
    expect(optionIds(s)).toEqual(["howler:eli-1", "decline"]);
    choose(s, "decline");
    expect(s.corp.hand).toContain("eli-1");
  });
});

// ---------------------------------------------------------------------------
// Assets, upgrades, agendas, operations, identities
// ---------------------------------------------------------------------------

describe("Alix T4LB07", () => {
  it("places a power counter for an install only while it is rezzed: installed unrezzed, it does not count its own install (CR 1.8.3a, 9.1.8)", () => {
    const s = corpTurn(fresh());
    const alix = installRoot(s, "alix-t4lb07", "alix-1", false);
    firePowerCounterOnAnyCorpInstall(s, "alix-1");
    expect(alix.powerCounters ?? 0).toBe(0);
    alix.rezzed = true;
    alix.faceup = true;
    installRoot(s, "pad-campaign", "pad-1", false);
    firePowerCounterOnAnyCorpInstall(s, "pad-1");
    expect(alix.powerCounters).toBe(1);
  });
});

describe("Haas Arcology AI", () => {
  it("can be advanced while unrezzed, and not once rezzed (CR 1.18.3)", () => {
    const s = fresh();
    const haas = installRoot(s, "haas-arcology-ai", "haas-1", false);
    expect(mayAdvanceInstalledCard(haas)).toBe(true);
    haas.rezzed = true;
    expect(mayAdvanceInstalledCard(haas)).toBe(false);
    // Effects that place counters on "a card that can be advanced" read the
    // same rule.
    expect(printsCanBeAdvanced(haas)).toBe(false);
  });
});

describe("Chairman Hiro", () => {
  it("trashed while accessed, it becomes an agenda worth 2 points in the Runner's score area (CR 1.2.1)", () => {
    const s = runnerTurn(fresh());
    installRoot(s, "chairman-hiro", "hiro-1", true);
    evalAs(
      s,
      "hiro-1",
      instructions(
        "chairman-hiro",
        (a) => a.trigger === "trash_while_accessed",
      ),
    );
    expect(s.runner.scoreArea).toContain("hiro-1");
    expect(s.cards["hiro-1"]!.agendaPoints).toBe(2);
  });
});

describe("Medical Breakthrough", () => {
  it("a copy in the Runner's score area lowers its advancement requirement too, as printed (CR 9.1.8b)", () => {
    const s = fresh();
    const mb = installRoot(s, "medical-breakthrough", "mb-1", false);
    const alone = effectiveAdvancementRequirement(s, mb);
    put(s, "medical-breakthrough", "mb-r", "runner:score");
    s.runner.scoreArea.push("mb-r");
    expect(effectiveAdvancementRequirement(s, mb)).toBe(alone - 1);
  });
});

describe("Strongbox", () => {
  it("while rezzed, stealing an agenda from its server costs an additional click, and the Runner cannot steal without one (CR 1.16.10)", () => {
    const board = (rezzed: boolean): GameState => {
      let s = runnerTurn(fresh());
      installRoot(s, "strongbox", "sb-1", rezzed);
      const server = "remote-sb-1" as ServerId;
      put(s, "hostile-takeover", "ht-1", `server:${server}:root`);
      s.servers[server]!.root.push("ht-1");
      s = must(s, { type: "basic_run", serverId: server });
      return drive(s, (x) =>
        legalActions(x).some((a) => a.type === "steal_agenda"),
      );
    };
    let s = board(true);
    const clicks = s.runner.clicks;
    s = must(s, { type: "steal_agenda", cardId: "ht-1" });
    expect(s.runner.clicks).toBe(clicks - 1);
    expect(s.runner.scoreArea).toContain("ht-1");

    const none = board(true);
    none.runner.clicks = 0;
    expect(stealDecision(none, "ht-1").stealLegal).toBe(false);

    const unrezzed = board(false);
    expect(stealDecision(unrezzed, "ht-1")).toEqual({
      stealLegal: true,
      additionalCost: false,
    });
  });
});

describe("Plan B", () => {
  it("the Corp may decline to score an agenda from HQ (CR 9.6.9)", () => {
    const s = runnerTurn(fresh());
    const pb = installRoot(s, "plan-b", "pb-1", false);
    pb.advancementCounters = 2;
    toHand(s, "corp", "hostile-takeover", "ht-1");
    evalAs(s, "pb-1", fx.do({ kind: "may_reveal_score_from_hq" }));
    expect(optionIds(s)).toEqual(["pb:ht-1", "decline"]);
    choose(s, "decline");
    expect(s.corp.hand).toContain("ht-1");
  });
});

describe("Toshiyuki Sakai", () => {
  it("the Corp may decline to swap him with a card from HQ (CR 9.6.9)", () => {
    const s = runnerTurn(fresh());
    installRoot(s, "toshiyuki-sakai", "sak-1", false);
    toHand(s, "corp", "hostile-takeover", "ht-1");
    evalAs(s, "sak-1", fx.do({ kind: "may_swap_with_hq" }));
    expect(optionIds(s)).toEqual(["toshiyuki-swap:ht-1", "decline"]);
  });
});

describe("Tenma Line", () => {
  it("can swap any 2 pieces of installed ice, however many are installed (CR 1.15.2)", () => {
    const s = corpTurn(fresh());
    // Six copies of the same ice: each is still its own choice.
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) {
      const server = remote(s, `remote-t${i}`);
      installIce(s, "ice-wall", `iw-${i}`, server, true);
      ids.push(`iw-${i}`);
    }
    installRoot(s, "tenma-line", "tl-1", true);
    evalAs(s, "tl-1", fx.do({ kind: "may_swap_two_installed_ice" }));
    const all = optionIds(s);
    for (const id of ids) expect(all).toContain(`tenma:${id}`);
    choose(s, "tenma:iw-4");
    expect(optionIds(s)).not.toContain("tenma:iw-4");
    expect(optionIds(s)).toContain("tenma:iw-5");
    choose(s, "tenma:iw-5");
    expect(s.servers["remote-t4" as ServerId]!.ice).toEqual(["iw-5"]);
    expect(s.servers["remote-t5" as ServerId]!.ice).toEqual(["iw-4"]);
  });
});

describe("Tennin Institute: The Secrets Within", () => {
  it("the Corp may decline to place an advancement counter when its turn begins (CR 9.6.9c; already fixed by RF-1b)", () => {
    const s = corpTurn(fresh());
    installRoot(s, "pad-campaign", "pad-1", false);
    evalAs(
      s,
      s.corp.identityId,
      fx.do({ kind: "tennin_place_advancement_on_installed" }),
    );
    expect(optionIds(s)).toContain("decline");
  });
});

describe("Cerebral Cast", () => {
  it("bids are 0 to 2 credits, matching bids do nothing, and differing bids make the Runner choose 1 core damage or 1 tag (CR 10.14.5, 10.14.6b)", () => {
    const s = corpTurn(fresh());
    put(s, "cerebral-cast", "cc-1", "corp:play-area");
    evalAs(s, "cc-1", playOf("cerebral-cast"));
    expect(s.psi?.maxBid).toBe(2);
    expect(psiRunnerBid(s, 3)).not.toBeNull();
    expect(psiRunnerBid(s, 1)).toBeNull();
    expect(psiCorpBid(s, 2)).toBeNull();
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(optionIds(s)).toEqual(["core", "tag"]);

    const same = corpTurn(fresh());
    put(same, "cerebral-cast", "cc-1", "corp:play-area");
    evalAs(same, "cc-1", playOf("cerebral-cast"));
    psiRunnerBid(same, 1);
    psiCorpBid(same, 1);
    expect(same.pendingChoice).toBeNull();
    expect(same.pendingDamage).toBeFalsy();
    expect(same.runner.tags ?? 0).toBe(0);
  });
});

describe("Psychic Field", () => {
  it("bids are 0 to 2 credits, matching bids do nothing, and differing bids do 1 net damage for each card in the grip (CR 10.14.5, 10.14.6b)", () => {
    const differ = runnerTurn(fresh());
    installRoot(differ, "psychic-field", "pf-1", false);
    for (let i = 0; i < 3; i++)
      toHand(differ, "runner", "sure-gamble", `sg-${i}`);
    const access = instructions(
      "psychic-field",
      (a) => a.trigger === "access_while_installed",
    );
    evalAs(differ, "pf-1", access);
    expect(differ.psi?.maxBid).toBe(2);
    psiRunnerBid(differ, 0);
    psiCorpBid(differ, 2);
    expect(
      differ.pendingDamage?.remaining ?? differ.runner.discardPile.length,
    ).toBe(3);

    const same = runnerTurn(fresh());
    installRoot(same, "psychic-field", "pf-1", false);
    toHand(same, "runner", "sure-gamble", "sg-0");
    evalAs(same, "pf-1", access);
    psiRunnerBid(same, 1);
    psiCorpBid(same, 1);
    expect(same.pendingDamage).toBeFalsy();
    expect(same.runner.hand).toEqual(["sg-0"]);
  });
});

describe("The Future Perfect", () => {
  it("when the bids differ the Runner cannot steal it during this access; when they match nothing happens and the Runner steals it (CR 10.14.6d, 1.2.1)", () => {
    for (const [corpBid, stealable] of [
      [2, false],
      [0, true],
    ] as const) {
      const s = runnerTurn(fresh());
      toHand(s, "corp", "the-future-perfect", "tfp-1");
      successfulRun(s, "hq" as ServerId);
      s.run!.accessingCardId = "tfp-1";
      coversKind("forbid_steal_accessed_agenda");
      const before = snapshot(s);
      evalAs(
        s,
        "tfp-1",
        instructions(
          "the-future-perfect",
          (a) => a.trigger === "access_while_uninstalled",
        ),
      );
      psiRunnerBid(s, 0);
      psiCorpBid(s, corpBid);
      expect(s.pendingDamage, `bid ${corpBid}`).toBeFalsy();
      expect(stealDecision(s, "tfp-1").stealLegal, `bid ${corpBid}`).toBe(
        stealable,
      );
      if (!stealable) {
        expectStateDelta(before, s, {
          "run.stealForbiddenAccessCardId": { to: "tfp-1" },
        });
        // The steal action itself is refused too, not only left off the
        // legal moves (CR 1.2.2).
        s.timingKey = "access.stealAgenda";
        expect(
          applyAction(s, { type: "steal_agenda", cardId: "tfp-1" }).ok,
        ).toBe(false);
      }
    }
  });
});

describe("Nisei Division: The Next Generation", () => {
  it("gains 1 credit when both players reveal secretly spent credits, and not when the Corp only guesses (CR 10.14.5)", () => {
    const s = corpTurn(fresh(), 5);
    const id = s.cards[s.corp.identityId]!;
    Object.assign(
      id,
      structuredClone(
        put(
          s,
          "nisei-division-the-next-generation",
          "nisei-tmp",
          "corp:identity",
        ),
      ),
      { id: s.corp.identityId },
    );
    delete s.cards["nisei-tmp"];
    const noop = fx.do({ kind: "gain_credits", side: "corp", amount: 0 });
    startPsiGame(s, "x", 2, noop, noop, { corpGuess: "parity" });
    psiRunnerBid(s, 1);
    psiCorpBid(s, 0);
    expect(s.corp.credits).toBe(5);
    startPsiGame(s, "x", 2, noop, noop);
    psiRunnerBid(s, 0);
    psiCorpBid(s, 0);
    expect(s.corp.credits).toBe(6);
  });
});

describe("Sweeps Week", () => {
  it("the Corp gains 1 credit for each card in the Runner's grip (CR 1.2.1)", () => {
    const s = corpTurn(fresh(), 0);
    for (let i = 0; i < 4; i++) toHand(s, "runner", "sure-gamble", `sg-${i}`);
    const runner = s.runner.credits;
    put(s, "sweeps-week", "sw-1", "corp:play-area");
    evalAs(s, "sw-1", playOf("sweeps-week"));
    expect(s.corp.credits).toBe(4);
    expect(s.runner.credits).toBe(runner);
  });
});

describe("Corporate Shuffle", () => {
  it("draws the top 5 cards of R&D through the draw procedure (CR 5.1.2)", () => {
    const s = corpTurn(fresh());
    s.corp.hand = [];
    for (const id of [...s.corp.deck]) delete s.cards[id];
    s.corp.deck = [];
    stackRd(
      s,
      ["a", "b", "c", "d", "e", "f"].map((x) => ["hedge-fund", `rd-${x}`]),
    );
    put(s, "corporate-shuffle", "cs-1", "corp:play-area");
    evalAs(s, "cs-1", playOf("corporate-shuffle"));
    expect([...s.corp.hand].sort()).toEqual(
      ["rd-a", "rd-b", "rd-c", "rd-d", "rd-e"].sort(),
    );
    expect(s.corp.deck).toEqual(["rd-f"]);
  });
});

describe("Subliminal Messaging", () => {
  it("when the Corp's turn begins after a Runner turn with no run, the Corp may reveal it and add it from Archives to HQ, or leave it (CR 9.6.9, 1.21.3)", () => {
    let s = runnerTurn(fresh());
    put(s, "subliminal-messaging", "sm-1", "corp:archives").faceup = true;
    s.corp.discardPile.push("sm-1");
    s = toCorpTurn(s);
    expect(s.pendingChoice?.sourceId).toBe("sm-1");
    expect(optionIds(s)).toEqual(["add", "decline"]);
    s = pick(s, "decline");
    expect(s.corp.discardPile).toContain("sm-1");
  });

  it("a facedown copy in Archives is not named to the Runner by its choice (CR 10.2.2a)", () => {
    let s = runnerTurn(fresh());
    put(s, "subliminal-messaging", "sm-1", "corp:archives").faceup = false;
    s.corp.discardPile.push("sm-1");
    s = toCorpTurn(s);
    expect(s.pendingChoice?.sourceId).toBe("sm-1");
    const runnerView = getPublicView(s, "runner");
    expect(JSON.stringify(runnerView.pendingChoice ?? null)).not.toMatch(
      /Subliminal|Archives/,
    );
  });
});

describe("Gyri Labyrinth", () => {
  it("each resolution lowers the Runner's maximum hand size by 2 until the Corp's next turn begins, and all of it ends then (CR 9.10.1)", () => {
    let s = runnerTurn(fresh());
    installIce(s, "gyri-labyrinth", "gy-1", "hq" as ServerId, true);
    const sub = s.cards["gy-1"]!.subroutines![0]!.effect;
    evalAs(s, "gy-1", sub);
    evalAs(s, "gy-1", sub);
    expect(s.runner.maxHandSize).toBe(1);
    expect(computeRunnerMaxHandSize(s)).toBe(1);
    s = toCorpTurn(s);
    expect(s.runner.maxHandSize).toBe(5);
  });
});

describe("Theophilius Bagbiter", () => {
  it("sets the maximum hand size to the credits in the pool first, then other increases apply (CR 9.12.1a)", () => {
    const s = runnerTurn(fresh(), 2);
    installRunner(s, "theophilius-bagbiter", "tb-1");
    installRunner(s, "brain-cage", "bc-1");
    expect(computeRunnerMaxHandSize(s)).toBe(2 + 3);
  });
});

describe("Donut Taganes", () => {
  it("while installed, raises the play cost of operations and events by 1 (CR 1.16.2a)", () => {
    const s = runnerTurn(fresh());
    expect(operationAndEventPlayCostIncreaseTotal(s)).toBe(0);
    installRunner(s, "donut-taganes", "dt-1");
    expect(operationAndEventPlayCostIncreaseTotal(s)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Runner programs, hardware, resources, events
// ---------------------------------------------------------------------------

describe("Bug", () => {
  it("can be installed only after a successful run on HQ this turn (CR 1.2.1)", () => {
    const s = runnerTurn(fresh());
    toHand(s, "runner", "bug", "bug-1");
    const installs = (x: GameState) =>
      legalActions(x).some(
        (a) => a.type === "basic_install" && a.cardId === "bug-1",
      );
    expect(installs(s)).toBe(false);
    s.turn.successfulHqRunThisTurn = true;
    expect(installs(s)).toBe(true);
  });
});

describe("LLDS Processor", () => {
  it("gives +1 strength until the end of the turn to every icebreaker installed, AI ones too (CR 1.2.1)", () => {
    let s = runnerTurn(fresh());
    installRunner(s, "llds-processor", "llds-1");
    toHand(s, "runner", "crypsis", "cry-1");
    const before = getCardDef("crypsis").strength ?? 0;
    s = must(s, {
      type: "basic_install",
      cardId: "cry-1",
      destination: { kind: "installed" },
    });
    expect(effectiveBreakerStrength(s, "cry-1")).toBe(before + 1);
  });
});

describe("Omni-drive", () => {
  it("the memory cost of its hosted program does not count against the memory limit (CR 1.20.3)", () => {
    const s = runnerTurn(fresh());
    installRunner(s, "omni-drive", "od-1");
    const used = usedMemory(s);
    installRunner(s, "corroder", "cor-1");
    hostCard(s, "cor-1", "od-1");
    expect(usedMemory(s)).toBe(used);
  });
});

describe("Capstone", () => {
  it("trashes the chosen grip cards together, then draws 1 for each with a copy installed; cards it draws cannot be trashed (CR 9.12.2a)", () => {
    let s = runnerTurn(fresh());
    for (const id of s.runner.deck) delete s.cards[id];
    s.runner.deck = [];
    installRunner(s, "capstone", "cap-1");
    installRunner(s, "corroder", "cor-in");
    toHand(s, "runner", "corroder", "cor-gr");
    toHand(s, "runner", "sure-gamble", "sg-gr");
    for (const id of ["st-1", "st-2"]) {
      put(s, "corroder", id, "runner:stack");
      s.runner.deck.push(id);
    }
    s = must(s, {
      type: "use_paid_ability",
      cardId: "cap-1",
      abilityId: "capstone-trash-grip",
    });
    s = pick(s, "choose-card:cor-gr");
    s = pick(s, "choose-card:sg-gr");
    expect(s.runner.discardPile).toEqual(
      expect.arrayContaining(["cor-gr", "sg-gr"]),
    );
    expect(s.runner.hand).toEqual(["st-1"]);
    expect(s.pendingChoice).toBeNull();
  });
});

describe("Clone Chip", () => {
  it("installs a program from the heap with no 'may': there is no Decline once its cost is paid (CR 1.2.4)", () => {
    const s = runnerTurn(fresh());
    installRunner(s, "clone-chip", "cc-1");
    for (const id of ["cor-h", "gb-h"]) {
      put(s, id === "cor-h" ? "corroder" : "gordian-blade", id, "runner:heap");
      s.runner.discardPile.push(id);
    }
    evalAs(
      s,
      "cc-1",
      instructions("clone-chip", (a) => a.id === "clone-chip-install"),
    );
    expect(optionIds(s).length).toBe(2);
    expect(optionIds(s)).not.toContain("decline");
  });
});

describe("Same Old Thing", () => {
  it("plays an event from the heap with no 'may': there is no Decline once its cost is paid (CR 1.2.4)", () => {
    const s = runnerTurn(fresh());
    installRunner(s, "same-old-thing", "sot-1");
    put(s, "sure-gamble", "sg-h", "runner:heap");
    s.runner.discardPile.push("sg-h");
    evalAs(s, "sot-1", fx.do({ kind: "play_event_from_heap_paying_costs" }));
    expect(optionIds(s)).toEqual(["play-heap:sg-h"]);
  });
});

describe("Early Bird", () => {
  it("gains a click and makes a run, with no option to decline the run (CR 1.2.1)", () => {
    let s = runnerTurn(fresh());
    toHand(s, "runner", "early-bird", "eb-1");
    s = must(s, {
      type: "play_event",
      cardId: "eb-1",
      serverId: "hq",
    } as Action);
    expect(s.run?.attackedServerId).toBe("hq");
    expect(s.runner.clicks).toBe(4);
  });
});

describe("Frame Job", () => {
  it("can be played with no scored agenda, and gives bad publicity only if the Runner forfeits one (CR 1.16.1, 1.2.1)", () => {
    const none = runnerTurn(fresh());
    toHand(none, "runner", "frame-job", "fj-1");
    expect(
      legalActions(none).some(
        (a) => a.type === "play_event" && a.cardId === "fj-1",
      ),
    ).toBe(true);
    const bp = none.corp.badPublicity ?? 0;
    put(none, "frame-job", "fj-2", "runner:play-area");
    evalAs(none, "fj-2", playOf("frame-job"));
    expect(none.corp.badPublicity ?? 0).toBe(bp);

    const one = runnerTurn(fresh());
    put(one, "hostile-takeover", "ht-1", "runner:score");
    one.runner.scoreArea.push("ht-1");
    put(one, "frame-job", "fj-2", "runner:play-area");
    evalAs(one, "fj-2", playOf("frame-job"));
    expect(one.runner.scoreArea).not.toContain("ht-1");
    expect(one.corp.badPublicity ?? 0).toBe(bp + 1);
  });
});

describe("Executive Wiretaps", () => {
  it("reveals all cards in HQ (CR 1.21.3)", () => {
    const s = runnerTurn(fresh());
    s.corp.hand = [];
    toHand(s, "corp", "hedge-fund", "hq-1");
    toHand(s, "corp", "ice-wall", "hq-2");
    put(s, "executive-wiretaps", "ew-1", "runner:play-area");
    coversKind("reveal_hq");
    const before = snapshot(s);
    evalAs(s, "ew-1", playOf("executive-wiretaps"));
    expectStateDelta(before, s, { revealSeq: { to: 1 } });
    expect(s.reveals?.at(-1)?.cards.map((c) => c.title)).toEqual([
      "Hedge Fund",
      "Ice Wall",
    ]);
  });
});

describe("Expert Schedule Analyzer", () => {
  it("on a successful HQ run the Runner may breach normally instead of revealing HQ (CR 6.7.4c, 9.6.9)", () => {
    const s = runnerTurn(fresh());
    installRunner(s, "expert-schedule-analyzer", "esa-1");
    successfulRun(s, "hq" as ServerId);
    evalAs(
      s,
      "esa-1",
      fx.do({ kind: "may_breach_instead_expert_schedule_analyzer" }),
    );
    expect(optionIds(s)).toEqual(["breach", "reveal"]);
    choose(s, "breach");
    expect(s.run?.skipBreach ?? false).toBe(false);
  });
});

describe("Singularity", () => {
  it("instead of breaching the remote server it trashes all cards in its root, with no option to breach (CR 6.7.4c)", () => {
    const s = runnerTurn(fresh());
    installRoot(s, "pad-campaign", "pad-1", true);
    put(s, "singularity", "sing-1", "runner:play-area");
    successfulRun(s, "remote-pad-1" as ServerId);
    evalAs(
      s,
      "sing-1",
      fx.do({ kind: "breach_instead_singularity_trash_root" }),
    );
    expect(s.pendingChoice).toBeNull();
    expect(s.run?.skipBreach).toBe(true);
    expect(s.corp.discardPile).toContain("pad-1");
  });
});

describe("Hostage", () => {
  it("the Runner chooses which connection to find, or none, and the stack is shuffled before the install offer (CR 8.7.2e, 8.7.3)", () => {
    const s = runnerTurn(fresh());
    s.runner.deck = [];
    for (const [defId, id] of [
      ["kati-jones", "kj-1"],
      ["data-dealer", "dd-1"],
      ["sure-gamble", "sg-1"],
    ] as const) {
      put(s, defId, id, "runner:stack");
      s.runner.deck.push(id);
    }
    put(s, "hostage", "hos-1", "runner:play-area");
    evalAs(s, "hos-1", playOf("hostage"));
    expect(optionIds(s)).toEqual([
      "choose-card:kj-1",
      "choose-card:dd-1",
      "choose-cards-done",
    ]);
    expect(s.pendingChoice?.hiddenFromOpponent).toBe(true);
    choose(s, "choose-card:dd-1");
    expect(s.runner.hand).toContain("dd-1");
    expect(s.runner.deck).not.toContain("dd-1");
    expect(s.log.some((l) => l.includes("Data Dealer"))).toBe(true);
  });
});

describe("Oracle May", () => {
  it("on a match it draws the revealed top card and gains 2 credits (CR 5.1.2)", () => {
    const s = runnerTurn(fresh(), 0);
    s.runner.deck = [];
    put(s, "corroder", "st-1", "runner:stack");
    s.runner.deck.push("st-1");
    installRunner(s, "oracle-may", "om-1");
    evalAs(s, "om-1", fx.do({ kind: "choose_card_type_reveal_stack_top" }));
    choose(s, "om:program");
    expect(s.runner.hand).toContain("st-1");
    expect(s.runner.credits).toBe(2);
  });
});

describe("Tallie Perrault", () => {
  it("its [trash] ability draws 1 card for each bad publicity the Corp has (CR 1.2.1)", () => {
    const s = runnerTurn(fresh());
    s.runner.deck = [];
    for (const id of ["st-1", "st-2", "st-3"]) {
      put(s, "sure-gamble", id, "runner:stack");
      s.runner.deck.push(id);
    }
    s.corp.badPublicity = 2;
    installRunner(s, "tallie-perrault", "tp-1");
    evalAs(
      s,
      "tp-1",
      instructions("tallie-perrault", (a) => a.id === "tallie-draw"),
    );
    expect(s.runner.hand).toEqual(["st-1", "st-2"]);
  });
});

describe("Tri-Maf Contact", () => {
  it("when it is trashed the Runner suffers 3 meat damage (CR 1.2.1)", () => {
    const s = runnerTurn(fresh());
    installRunner(s, "tri-maf-contact", "tm-1");
    for (let i = 0; i < 4; i++) toHand(s, "runner", "sure-gamble", `sg-${i}`);
    evalAs(
      s,
      "tm-1",
      instructions("tri-maf-contact", (a) => a.trigger === "trash"),
    );
    expect(s.pendingDamage?.remaining ?? s.runner.discardPile.length).toBe(3);
    expect(s.runner.tags ?? 0).toBe(0);
  });
});

describe("Starlight Crusade Funding", () => {
  it("ignores the additional click of each double event the Runner plays, not only the first each turn (CR 1.2.1)", () => {
    let s = runnerTurn(fresh());
    installRunner(s, "starlight-crusade-funding", "scf-1");
    toHand(s, "runner", "executive-wiretaps", "ew-1");
    toHand(s, "runner", "executive-wiretaps", "ew-2");
    s.runner.clicks = 2;
    s = must(s, { type: "play_event", cardId: "ew-1" });
    s = drive(s, atRunnerAction);
    expect(s.runner.clicks).toBe(1);
    expect(
      legalActions(s).some(
        (a) => a.type === "play_event" && a.cardId === "ew-2",
      ),
    ).toBe(true);
    s = must(s, { type: "play_event", cardId: "ew-2" });
    expect(s.runner.clicks).toBe(0);
  });
});

describe("Knight and Rook", () => {
  function board(defId: string): GameState {
    const s = runnerTurn(fresh());
    const r1 = remote(s, "remote-1");
    const r2 = remote(s, "remote-2");
    for (const [server, ids] of [
      [r1, ["a-in", "a-mid", "a-out"]],
      [r2, ["b-in", "b-mid"]],
    ] as const) {
      for (const id of ids) installIce(s, "ice-wall", id, server, true);
    }
    const prog = installRunner(s, defId, "cai-1");
    prog.hostId = "a-mid";
    s.cards["a-mid"]!.hostedCardIds = ["cai-1"];
    return s;
  }
  const hosts = (s: GameState) =>
    optionIds(s)
      .map((id) => id.replace("host:", ""))
      .sort();

  it("Knight hosted on ice may move to any ice but the next one inward or outward (CR 1.2.1)", () => {
    const s = board("knight");
    evalAs(
      s,
      "cai-1",
      fx.do({ kind: "caissa_rook_host", move: "not_adjacent" }),
    );
    expect(hosts(s)).toEqual(["b-in", "b-mid"]);
  });

  it("Rook hosted on ice may move to ice protecting the same server or in the same position, counted from the innermost (CR 6.2.3)", () => {
    const s = board("rook");
    evalAs(
      s,
      "cai-1",
      fx.do({ kind: "caissa_rook_host", move: "same_server_or_position" }),
    );
    expect(hosts(s)).toEqual(["a-in", "a-out", "b-mid"]);
  });
});

describe("Paintbrush", () => {
  it("the chosen rezzed ice gains the subtype the Runner picks until the end of the next run this turn, and the Runner can still act (CR 9.10.1, 1.15.2)", () => {
    let s = runnerTurn(fresh());
    installRunner(s, "paintbrush", "pb-1");
    installIce(s, "ice-wall", "iw-1", "hq" as ServerId, true);
    s = must(s, {
      type: "use_paid_ability",
      cardId: "pb-1",
      abilityId: "paintbrush-paint",
    });
    s = pick(s, "paintbrush:iw-1");
    expect(optionIds(s)).toEqual([
      "paintbrush-subtype:sentry",
      "paintbrush-subtype:code gate",
      "paintbrush-subtype:barrier",
    ]);
    s = pick(s, "paintbrush-subtype:sentry");
    expect(s.run).toBeNull();
    s = drive(s, atRunnerAction);
    expect(legalActions(s).some((a) => a.type === "basic_run")).toBe(true);
    expect(effectiveIceSubtypes(s, "iw-1")).toContain("sentry");
    s = must(s, { type: "basic_run", serverId: "rd" });
    expect(effectiveIceSubtypes(s, "iw-1")).toContain("sentry");
    s = finishRun(s);
    expect(effectiveIceSubtypes(s, "iw-1")).not.toContain("sentry");
  });
});

describe('Rielle "Kit" Peddler: Transhuman', () => {
  it("the first ice encountered each turn gains code gate for the remainder of the run, and loses it after (CR 9.10.1)", () => {
    let s = runnerTurn(fresh());
    put(
      s,
      "rielle-kit-peddler-transhuman",
      s.runner.identityId,
      s.cards[s.runner.identityId]!.zone,
    );
    installIce(s, "ice-wall", "iw-1", "hq" as ServerId, true);
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, runIs("run.encounterPaw"));
    expect(effectiveIceSubtypes(s, "iw-1")).toContain("code gate");
    s = drive(s, atRunnerAction);
    expect(effectiveIceSubtypes(s, "iw-1")).not.toContain("code gate");
    expect(s.cards["iw-1"]!.subtypes).not.toContain("code gate");
  });
});

// ---------------------------------------------------------------------------
// Already fixed by later sessions (confirmed here)
// ---------------------------------------------------------------------------

describe("Atman", () => {
  it("when installed the Runner chooses how many credits to spend, 0 included (CR 9.6.9c; already fixed by RF-1b)", () => {
    const s = runnerTurn(fresh(), 3);
    installRunner(s, "atman", "at-1");
    evalAs(
      s,
      "at-1",
      fx.do({
        kind: "spend_credits_place_power_counters",
        includeProgramRecurring: true,
      }),
    );
    expect(optionIds(s).length).toBe(4);
    expect(s.runner.credits).toBe(3);
  });
});

describe("Escher", () => {
  it("instead of breaching HQ the Runner rearranges ice, with no option to breach, and can trade the ice of two single-ice servers, keeping each server's number of ice (CR 9.9.8, 8.3.1)", () => {
    const s = runnerTurn(fresh());
    const r1 = remote(s, "remote-1");
    const r2 = remote(s, "remote-2");
    installIce(s, "ice-wall", "iw-1", r1, true);
    installIce(s, "enigma", "en-1", r2, true);
    put(s, "escher", "esc-1", "runner:play-area");
    successfulRun(s, "hq" as ServerId);
    evalAs(s, "esc-1", fx.do({ kind: "rearrange_ice_instead_of_breach" }));
    expect(s.run?.skipBreach).toBe(true);
    expect(optionIds(s).some((id) => id.includes("breach"))).toBe(false);
    const first = optionIds(s).find((id) => id.includes("en-1"))!;
    choose(s, first);
    while (s.pendingChoice) choose(s, optionIds(s)[0]!);
    expect(s.servers[r1]!.ice).toEqual(["en-1"]);
    expect(s.servers[r2]!.ice).toEqual(["iw-1"]);
  });
});
