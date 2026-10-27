/**
 * Comprehensive Rules examples from chapter 9.
 * Each test plays that example's board.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  autoWalk,
  cardsDataPresent,
  CR,
  createInitialState,
  crDataPresent,
  effectiveIceSubtypes,
  enterStep,
  evalEffect,
  fx,
  getPublicView,
  instantiateCard,
  legalActions,
  abilitiesSuppressed,
  blankingEffectDependsOn,
  collectBlankingEffects,
  effectiveIceStrength,
  getCardDef,
  orderBlankingEffects,
} from "../src/index.js";
import { breakerStrength } from "../src/effects/iceStrength.js";
import { noteProgramOrHardwareInstalled } from "../src/state/programHardwareInstall.js";
import { onRunnerTurnEnds } from "../src/state/staticFlags.js";
import { beginRunnerTurnFlags } from "../src/state/turn.js";
import type { Action, GameState, ServerId } from "../src/state/types.js";
import {
  moveRunnerCardToHeap,
} from "../src/state/trashHooks.js";
import {
  occurCheckpoint,
} from "../src/legality/checkpoints.js";


beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.13");
});

function must(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`${result.error} ${JSON.stringify(result.cites)}`);
  return result.state;
}


function at(lines: string[], fragment: string): number {
  const i = lines.findIndex((line) => line.includes(fragment));
  expect(i, fragment).toBeGreaterThanOrEqual(0);
  return i;
}

function runnerTurn(state: GameState): void {
  state.activeSide = "runner";
  state.timingKey = "runner.takeAction";
}

function openEncounter(
  state: GameState,
  iceId: string,
  subs: number,
  serverId: ServerId = "hq",
): void {
  state.servers[serverId].ice = [iceId];
  state.run = {
    attackedServerId: serverId,
    phase: "encounter",
    position: 0,
    successful: null,
    accessedCardIds: [],
    accessCandidates: [],
    randomAccessLimit: null,
    encounter: {
      iceId,
      broken: Array.from({ length: subs }, () => false),
    },
    endedTheRun: false,
    cannotJackOut: false,
    strengthBoosts: {},
    encounterStrengthBoosts: {},
    iceStrengthBoosts: {},
    accessingCardId: null,
  };
  enterStep(state, "run.encounterPaw");
}

describe("CR examples, chapter 9", () => {


  it("draws for Geist after Decoy's trash cost, then avoids the tag, then suffers Snare! (CR 9.1.2a.ex1)", () => {
    let s = createInitialState();
    const geist = instantiateCard(
      "armand-geist-walker-tech-lord",
      "geist-1",
      "runner:identity",
    );
    const decoy = instantiateCard("decoy", "decoy-1", "runner:installed");
    decoy.faceup = true;
    decoy.rezzed = true;
    const gripA = instantiateCard("sure-gamble", "grip-1", "runner:grip");
    const gripB = instantiateCard("sure-gamble", "grip-2", "runner:grip");
    const top = instantiateCard("corroder", "stack-1", "runner:stack");
    const snare = instantiateCard("snare", "snare-1", "corp:rd");
    s.cards["geist-1"] = geist;
    s.cards["decoy-1"] = decoy;
    s.cards["grip-1"] = gripA;
    s.cards["grip-2"] = gripB;
    s.cards["stack-1"] = top;
    s.cards["snare-1"] = snare;
    s.runner.identityId = "geist-1";
    s.runner.installed = ["decoy-1"];
    s.runner.hand = ["grip-1", "grip-2"];
    s.runner.deck = ["stack-1"];
    s.runner.tags = 0;
    s.corp.deck = ["snare-1"];
    s.corp.credits = 5;
    s.activeSide = "runner";
    s.timingKey = "breach.awaitAccess";
    s.run = {
      attackedServerId: "rd" as ServerId,
      phase: "breach",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: ["snare-1"],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };

    s = must(s, { type: "access_card", cardId: "snare-1" });
    s.activeSide = "corp";
    s = must(s, { type: "choose_option", optionId: "pay" });
    expect(s.runner.hand).toEqual(["grip-1", "grip-2"]);
    expect(s.runner.deck).toEqual(["stack-1"]);
    expect(s.pendingTags?.remaining).toBe(1);

    s.activeSide = "runner";
    s = must(s, {
      type: "use_paid_ability",
      cardId: "decoy-1",
      abilityId: "decoy-prevent-tag",
    });

    const trashed = at(s.log, "Decoy trashed as cost");
    const costClose = s.log.findIndex(
      (line, i) => i > trashed && line.includes("Checkpoint close [cost]"),
    );
    expect(costClose).toBeGreaterThan(trashed);
    const pending = at(s.log, "becomes pending");
    const aside = at(s.log, "Set aside 1");
    const added = at(s.log, "Add set-aside card to hand");
    const avoid = at(s.log, "Avoid/prevent");
    const damage = at(s.log, "net damage 3");
    expect(s.log[pending]).toContain("Geist");
    expect(s.log[pending]).toContain(CR.chainReaction.number);
    expect(s.log[aside]).not.toContain("Corroder");
    expect(costClose).toBeLessThan(pending);
    expect(pending).toBeLessThan(aside);
    expect(aside).toBeLessThan(added);
    expect(added).toBeLessThan(avoid);
    expect(avoid).toBeLessThan(damage);
    expect(s.runner.tags).toBe(0);
    expect(s.pendingTags).toBeFalsy();
    expect(s.runner.hand).toEqual([]);
    expect(s.runner.deck).toEqual([]);
    expect(s.runner.discardPile).toEqual(
      expect.arrayContaining(["decoy-1", "grip-1", "grip-2", "stack-1"]),
    );
    expect(s.cards["decoy-1"]?.zone).toBe("runner:heap");
    expect(s.cards["stack-1"]?.zone).toBe("runner:heap");
    expect(s.corp.credits).toBe(1);
    expect(s.done).toBeFalsy();
    expect(s.winReason).not.toBe("flatline");
    expect(s.log.join("\n")).not.toContain("draw 1 (trash ability)");
    expect(s.checkpoints).toHaveLength(0);
  });


  it("deals Attini's net damage before Caldera can spend credits (CR 9.1.2b.ex1)", () => {
    const s = createInitialState();
    const agenda = instantiateCard("hostile-takeover", "ag-1", "corp:score");
    agenda.agendaPoints = 3;
    const ice = instantiateCard("attini", "at-1", "server:hq:ice");
    ice.rezzed = true;
    ice.faceup = true;
    const caldera = instantiateCard("caldera", "caldera-1", "runner:installed");
    const grip = instantiateCard("sure-gamble", "grip-1", "runner:grip");
    s.cards["ag-1"] = agenda;
    s.cards["at-1"] = ice;
    s.cards["caldera-1"] = caldera;
    s.cards["grip-1"] = grip;
    s.corp.scoreArea = ["ag-1"];
    s.servers.hq.ice = ["at-1"];
    s.runner.installed = ["caldera-1"];
    s.runner.hand = ["grip-1"];
    s.runner.credits = 5;
    s.activeSide = "runner";
    s.timingKey = "run.encounterPaw";
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: {
        iceId: "at-1",
        broken: [false, true, true],
      },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    enterStep(s, "run.checkSubs");
    autoWalk(s);
    expect(s.pendingDamage?.type).toBe("net");
    expect(s.run?.runnerCannotSpendCredits).toBe(true);
    const prevented = applyAction(s, {
      type: "use_paid_ability",
      cardId: "caldera-1",
      abilityId: "caldera-prevent",
    });
    expect(prevented.ok).toBe(false);
    const suffered = must(s, { type: "accept_damage" });
    expect(suffered.runner.hand).toEqual([]);
    expect(suffered.runner.credits).toBe(5);
    expect(suffered.pendingDamage).toBeNull();
    expect(suffered.log.join("\n")).toContain("cannot spend credits");
  });


  it("leaves Zahya's ability absent while Direct Access is still resolving (CR 9.1.2b.ex2)", () => {
    let s = createInitialState();
    const zahya = instantiateCard(
      "zahya-sadeghi-versatile-smuggler",
      "zahya-1",
      "runner:identity",
    );
    const event = instantiateCard("direct-access", "da-1", "runner:grip");
    const hq = instantiateCard("hedge-fund", "hq-1", "corp:hq");
    s.cards["zahya-1"] = zahya;
    s.cards["da-1"] = event;
    s.cards["hq-1"] = hq;
    s.runner.identityId = "zahya-1";
    s.runner.hand = ["da-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    for (const id of s.corp.hand) {
      const held = s.cards[id];
      if (held) held.zone = "corp:rd";
      s.corp.deck.push(id);
    }
    s.corp.hand = ["hq-1"];
    s.servers.hq.ice = [];
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "play_event", cardId: "da-1", serverId: "hq" });
    expect(s.timingKey).toBe("breach.awaitAccess");
    expect(s.runner.credits).toBe(4);

    while (s.run && s.timingKey === "breach.awaitAccess") {
      const cand = s.run.accessCandidates[0];
      if (!cand) {
        s = must(s, { type: "finish_breach" });
        break;
      }
      s = must(s, { type: "access_card", cardId: cand });
    }

    const complete = at(s.log, "Run complete — successful");
    const resolving = at(s.log, "Direct Access is resolving");
    const trashed = at(s.log, "Direct Access trashed");
    expect(s.log[resolving]).toContain(CR.isResolving.number);
    expect(complete).toBeLessThan(resolving);
    expect(resolving).toBeLessThan(trashed);
    expect(s.log.join("\n")).not.toContain("Zahya Sadeghi — gain");
    expect(s.runner.credits).toBe(4);
    expect(s.turn.zahyaRunEndUsed).toBe(false);
    expect(s.cards["da-1"]?.zone).toBe("runner:heap");
    expect(s.run).toBeNull();
    expect(s.checkpoints).toHaveLength(0);
  });


  it("adds Mayfly to the stack before its trash can act on the old source (CR 9.1.4.ex1)", () => {
    let s = createInitialState();
    const compile = instantiateCard("compile", "compile-1", "runner:play-area");
    const mayfly = instantiateCard("mayfly", "mf-1", "runner:installed");
    const under = instantiateCard("sure-gamble", "under-1", "runner:stack");
    s.cards["compile-1"] = compile;
    s.cards["mf-1"] = mayfly;
    s.cards["under-1"] = under;
    s.runner.installed = ["mf-1"];
    s.runner.deck = ["under-1"];
    s.playedRunEventId = "compile-1";
    s.activeSide = "runner";
    s.run = {
      attackedServerId: "hq",
      phase: "ends",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      breakersThatBroke: ["mf-1"],
      runSourceId: "compile-1",
      winCompileInstalledProgramId: "mf-1",
      onRunEndEffect: {
        op: "do",
        action: { kind: "win_compile_bottom_of_stack" },
      },
    };
    enterStep(s, "run.closePriorityWindows");
    autoWalk(s);

    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "delayed-run-end:compile-first",
      "delayed-run-end:trash-first",
    ]);
    const pending = at(s.log, "Compile and Mayfly become pending");
    expect(s.log[pending]).toContain(CR.abilityIndependent.number);

    s = must(s, {
      type: "choose_option",
      optionId: "delayed-run-end:compile-first",
    });

    const chose = at(s.log, 'Chose "Resolve Compile first"');
    const bottom = at(s.log, "Compile — add Mayfly to bottom of stack.");
    const nothing = at(s.log, "Mayfly's ability does nothing");
    expect(s.log[nothing]).toContain(CR.abilityIndependent.number);
    expect(pending).toBeLessThan(chose);
    expect(chose).toBeLessThan(bottom);
    expect(bottom).toBeLessThan(nothing);
    expect(s.runner.deck).toEqual(["under-1", "mf-1"]);
    expect(s.cards["mf-1"]?.zone).toBe("runner:stack");
    expect(s.runner.installed).not.toContain("mf-1");
    expect(s.runner.discardPile).not.toContain("mf-1");
    expect(s.log.join("\n")).not.toContain("Mayfly trashed");
    expect(s.run).toBeNull();
    expect(s.checkpoints).toHaveLength(0);
  });


  it("uses Cyberfeeder when its credit pays Mimic's break (CR 9.1.6c.ex1)", () => {
    let s = createInitialState();
    const mimic = instantiateCard("mimic", "mimic-1", "runner:installed");
    const feeder = instantiateCard("cyberfeeder", "feed-1", "runner:installed");
    feeder.recurringCredits = 1;
    const back = instantiateCard("the-back", "back-1", "runner:installed");
    const ice = instantiateCard("neural-katana", "nk-1", "server:hq:ice");
    ice.rezzed = true;
    ice.faceup = true;
    s.cards["mimic-1"] = mimic;
    s.cards["feed-1"] = feeder;
    s.cards["back-1"] = back;
    s.cards["nk-1"] = ice;
    s.runner.installed = ["mimic-1", "feed-1", "back-1"];
    s.runner.credits = 0;
    s.servers.hq.ice = ["nk-1"];
    s.activeSide = "runner";
    s.timingKey = "run.encounterPaw";
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: {
        iceId: "nk-1",
        broken: [false],
      },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };

    s = must(s, {
      type: "break_subroutine",
      breakerId: "mimic-1",
      subIndex: 0,
    });

    const spent = at(s.log, "Spend 1¢ from Cyberfeeder");
    const costClose = s.log.findIndex(
      (line, i) => i > spent && line.includes("Checkpoint close [cost]"),
    );
    const used = at(s.log, "Mimic and Cyberfeeder have been used");
    const power = at(s.log, "Place 1 power counter(s) on The Back");
    expect(costClose).toBeGreaterThan(spent);
    expect(s.log[used]).toContain(CR.hostedCounterUsed.number);
    expect(costClose).toBeLessThan(used);
    expect(used).toBeLessThan(power);
    expect(s.runner.credits).toBe(0);
    expect(s.cards["feed-1"]?.recurringCredits).toBe(0);
    expect(s.cards["back-1"]?.powerCounters).toBe(1);
    expect(s.turn.hardwareUsedDuringRunThisTurn).toBe(true);
    expect(s.run?.encounter?.broken[0]).toBe(true);
    expect(s.checkpoints).toHaveLength(0);
  });


  it("does not draw for I've Had Worse when Skorpios removes it from the game (CR 9.1.8b.ex1)", () => {
    let s = createInitialState();
    const skorpios = instantiateCard(
      "skorpios-defense-systems-persuasive-power",
      "skorpios-1",
      "corp:identity",
    );
    const ihw = instantiateCard("ive-had-worse", "ihw-1", "runner:grip");
    const top = instantiateCard("sure-gamble", "top-1", "runner:stack");
    const mid = instantiateCard("sure-gamble", "top-2", "runner:stack");
    const bot = instantiateCard("sure-gamble", "top-3", "runner:stack");
    s.cards["skorpios-1"] = skorpios;
    s.cards["ihw-1"] = ihw;
    s.cards["top-1"] = top;
    s.cards["top-2"] = mid;
    s.cards["top-3"] = bot;
    s.corp.identityId = "skorpios-1";
    s.runner.hand = ["ihw-1"];
    s.runner.deck = ["top-1", "top-2", "top-3"];
    s.activeSide = "corp";

    const dealt = evalEffect(
      { state: s, sourceId: "skorpios-1" },
      fx.do({ kind: "net_damage", amount: 1 }),
    );
    expect(dealt.ok).toBe(true);
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "skorpios-rfg:ihw-1",
      "skorpios-heap:ihw-1",
    ]);
    expect(s.runner.hand).toEqual([]);
    expect(s.runner.deck).toEqual(["top-1", "top-2", "top-3"]);

    s = must(s, { type: "choose_option", optionId: "skorpios-rfg:ihw-1" });

    const chose = at(s.log, "Remove I've Had Worse from the game");
    const inactive = at(s.log, "I've Had Worse is not active");
    expect(s.log[inactive]).toContain(CR.abilityActiveInZone.number);
    expect(chose).toBeLessThan(inactive);
    expect(s.cards["ihw-1"]?.zone).toBe("removed-from-game");
    expect(s.removedFromGame).toContain("ihw-1");
    expect(s.runner.discardPile).not.toContain("ihw-1");
    expect(s.runner.hand).toEqual([]);
    expect(s.runner.deck).toEqual(["top-1", "top-2", "top-3"]);
    expect(s.log.join("\n")).not.toContain("Set aside");
    expect(s.turn.skorpiosRfgUsedThisTurn).toBe(true);
    expect(s.checkpoints).toHaveLength(0);
  });


  // CR 9.6.4b.ex1 is this board: three Hostile Infrastructure instances become pending together.
  it("keeps Hostile Infrastructure active for the cards Singularity trashes with it (CR 9.1.8g.ex1)", () => {
    let s = createInitialState();
    const hi = instantiateCard("hostile-infrastructure", "hi-1", "server:remote-1:root");
    hi.rezzed = true;
    hi.faceup = true;
    const data = instantiateCard("experiential-data", "ed-1", "server:remote-1:root");
    const box = instantiateCard("strongbox", "sb-1", "server:remote-1:root");
    const pad = instantiateCard("pad-campaign", "pad-1", "server:remote-2:root");
    pad.rezzed = true;
    const sing = instantiateCard("singularity", "sing-1", "runner:play-area");
    for (const card of [hi, data, box, pad, sing]) s.cards[card.id] = card;
    for (let i = 0; i < 3; i++) {
      const id = `grip-${i}`;
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }
    s.runner.hand = ["grip-0", "grip-1", "grip-2"];
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["hi-1", "ed-1", "sb-1"],
    };
    s.servers["remote-2"] = {
      id: "remote-2",
      kind: "remote",
      ice: [],
      root: ["pad-1"],
    };
    s.run = {
      attackedServerId: "remote-1",
      phase: "success",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    s.activeSide = "runner";

    const opened = evalEffect(
      { state: s, sourceId: "sing-1" },
      fx.do({ kind: "breach_instead_singularity_trash_root" }),
    );
    expect(opened.ok).toBe(true);
    s = must(s, { type: "choose_option", optionId: "singularity" });

    const pending = at(s.log, "Hostile Infrastructure remains active — 3 instances become pending");
    expect(s.log[pending]).toContain(CR.abilityRemainsActive.number);
    const damage = s.log.filter((line) => line.startsWith("net damage 1:"));
    expect(damage).toHaveLength(3);
    expect(pending).toBeLessThan(at(s.log, "net damage 1:"));
    for (const id of ["hi-1", "ed-1", "sb-1"]) {
      expect(s.cards[id]?.zone).toBe("corp:archives");
      expect(s.cards[id]?.rezzed).toBe(false);
      expect(s.corp.discardPile).toContain(id);
    }
    expect(s.servers["remote-1"]?.root).toEqual([]);
    expect(s.runner.hand).toEqual([]);
    expect(s.done).toBe(false);

    const later = evalEffect(
      { state: s, sourceId: "sing-1" },
      fx.trashCorpCard("pad-1"),
    );
    expect(later.ok).toBe(true);
    expect(s.log.filter((line) => line.startsWith("net damage 1:"))).toHaveLength(3);
    expect(s.cards["pad-1"]?.zone).toBe("corp:archives");
  });


  it("removes Nanuq from the game after Test Run returns it to the stack (CR 9.1.8g.ex2)", () => {
    const s = createInitialState();
    const program = instantiateCard("nanuq", "nanuq-1", "runner:installed");
    program.bounceToStackAtTurnEnd = true;
    const filler = instantiateCard("sure-gamble", "fill-1", "runner:stack");
    s.cards["nanuq-1"] = program;
    s.cards["fill-1"] = filler;
    s.runner.installed = ["nanuq-1"];
    s.runner.deck = ["fill-1"];
    s.activeSide = "runner";
    s.timingKey = "runner.discard";
    enterStep(s, "runner.turnEnds");
    autoWalk(s);
    expect(s.runner.installed).not.toContain("nanuq-1");
    expect(s.runner.deck[0]).not.toBe("nanuq-1");
    expect(s.cards["nanuq-1"]?.zone).toBe("removed-from-game");
    expect(s.removedFromGame).toContain("nanuq-1");
    const text = s.log.join("\n");
    const returned = text.indexOf("Nanuq returns to the stack");
    const removed = text.indexOf("remains active and removes it from the game");
    expect(returned).toBeGreaterThanOrEqual(0);
    expect(removed).toBeGreaterThan(returned);
    expect(text).toContain(CR.abilityRemainsActive.number);
  });


  it("resolves Archangel's subroutine when encountered from HQ (CR 9.1.8h.ex1)", () => {
    let s = createInitialState();
    const arch = instantiateCard("archangel", "arch-1", "corp:hq");
    s.cards["arch-1"] = arch;
    s.corp.hand = ["arch-1"];
    s.corp.credits = 5;
    s.activeSide = "runner";
    s.timingKey = "breach.awaitAccess";
    s.run = {
      attackedServerId: "hq",
      phase: "breach",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: ["arch-1"],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };

    s = must(s, { type: "access_card", cardId: "arch-1" });
    s.activeSide = "corp";
    s = must(s, { type: "choose_option", optionId: "accept" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });

    const active = at(s.log, "Archangel's subroutines are active");
    const resolved = at(s.log, "Resolve subroutine \"Trace[6]");
    const trace = at(s.log, "Trace resolves: strength 6 vs link 0 → success");
    expect(s.log[active]).toContain(CR.encounterNotInstalled.number);
    expect(active).toBeLessThan(resolved);
    expect(resolved).toBeLessThan(trace);
    expect(s.cards["arch-1"]?.zone).toBe("corp:hq");
    expect(s.corp.hand).toContain("arch-1");
    expect(s.corp.credits).toBe(2);
    expect(s.log.some((line) => line.includes("Resume access after forced encounter"))).toBe(true);
  });


  it("drops Tollbooth's pending ability when Femme Fatale ends the encounter (CR 9.2.8f.ex1)", () => {
    let s = createInitialState();
    const toll = instantiateCard("tollbooth", "tb-1", "server:hq:ice");
    toll.rezzed = true;
    toll.faceup = true;
    const femme = instantiateCard("femme-fatale", "ff-1", "runner:installed");
    femme.chosenIceId = "tb-1";
    s.cards["tb-1"] = toll;
    s.cards["ff-1"] = femme;
    s.servers.hq.ice = ["tb-1"];
    s.runner.installed = ["ff-1"];
    s.runner.credits = 5;
    s.activeSide = "runner";
    s.timingKey = "run.approachPaw";
    s.run = {
      attackedServerId: "hq",
      phase: "approach_ice",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };

    s = must(s, { type: "pass_window" });
    expect(s.pendingChoice?.options.map((o) => o.id)).toContain("bypass");
    expect(s.runner.credits).toBe(5);

    s = must(s, { type: "choose_option", optionId: "bypass" });

    const closed = at(s.log, "Reaction window closes — Tollbooth loses its pending status");
    expect(s.log[closed]).toContain(CR.reactionWindowCloses.number);
    expect(s.runner.credits).toBe(4);
    expect(s.run?.endedTheRun).toBe(false);
    expect(s.run?.bypassedIceIds).toContain("tb-1");
    expect(s.run).not.toBeNull();
  });


  it("keeps Zahya's once-per-turn ability when she declines the credit (CR 9.3.6g.ex1)", () => {
    let s = createInitialState();
    const zahya = instantiateCard(
      "zahya-sadeghi-versatile-smuggler",
      "zahya-1",
      "runner:identity",
    );
    const hq = instantiateCard("hedge-fund", "hq-1", "corp:hq");
    const rd = instantiateCard("hedge-fund", "rd-1", "corp:rd");
    s.cards["zahya-1"] = zahya;
    s.cards["hq-1"] = hq;
    s.cards["rd-1"] = rd;
    s.runner.identityId = "zahya-1";
    s.runner.credits = 5;
    s.corp.hand = ["hq-1"];
    s.corp.deck = ["rd-1"];

    const endCentral = (serverId: "hq" | "rd", accessedId: string) => {
      s.run = {
        attackedServerId: serverId,
        phase: "success",
        position: null,
        successful: true,
        accessedCardIds: [accessedId],
        accessCandidates: [],
        randomAccessLimit: null,
        encounter: null,
        endedTheRun: false,
        cannotJackOut: false,
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
        accessingCardId: null,
      };
      s.timingKey = "run.movement";
      enterStep(s, "run.ends");
      autoWalk(s);
    };

    endCentral("hq", "hq-1");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "zahya-gain",
      "zahya-decline",
    ]);
    expect(s.runner.credits).toBe(5);

    s = must(s, { type: "choose_option", optionId: "zahya-decline" });
    const unused = at(s.log, "Zahya Sadeghi: Versatile Smuggler's ability was not used");
    expect(s.log[unused]).toContain(CR.oncePerTurnFlag.number);
    expect(s.runner.credits).toBe(5);
    expect(s.turn.zahyaRunEndUsed).toBe(false);
    expect(s.pendingChoice).toBeNull();

    endCentral("rd", "rd-1");
    s = must(s, { type: "choose_option", optionId: "zahya-gain" });
    expect(s.runner.credits).toBe(6);
    expect(s.turn.zahyaRunEndUsed).toBe(true);
    expect(s.log.some((line) => line.includes("Zahya Sadeghi: Versatile Smuggler — gain 1¢"))).toBe(true);
  });


  it("drops Puffer's static strength when a power counter is removed (CR 9.4.4.ex1)", () => {
    let s = createInitialState();
    const puffer = instantiateCard("puffer", "puf-1", "runner:installed");
    puffer.powerCounters = 1;
    puffer.paidAbilities = [
      ...(puffer.paidAbilities ?? []),
      {
        id: "puffer-pump",
        label: "2¢: +1 strength",
        clickCost: 0,
        creditCost: 2,
        cost: { credits: 2 },
        windows: ["encounter_paw"],
        effect: {
          op: "do",
          action: { kind: "pump_strength", amount: 1 },
        },
      },
    ];
    const geb = instantiateCard("gebrselassie", "geb-1", "runner:installed");
    geb.hostId = "puf-1";
    s.cards["puf-1"] = puffer;
    s.cards["geb-1"] = geb;
    s.runner.installed = ["puf-1", "geb-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "run.encounterPaw";
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: {
        iceId: "none",
        broken: [],
      },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };

    s = must(s, {
      type: "use_paid_ability",
      cardId: "puf-1",
      abilityId: "puffer-pump",
    });
    expect(s.runner.credits).toBe(3);
    expect(breakerStrength(s, "puf-1")).toBe(4);

    s.run = null;
    expect(breakerStrength(s, "puf-1")).toBe(4);

    s.timingKey = "runner.takeAction";
    s = must(s, {
      type: "use_paid_ability",
      cardId: "puf-1",
      abilityId: "puffer-power",
    });
    s = must(s, { type: "choose_option", optionId: "remove" });

    const ended = at(s.log, "Puffer's static strength ends with the removed power counter");
    expect(s.log[ended]).toContain(CR.staticNoLingering.number);
    expect(s.cards["puf-1"]?.powerCounters).toBe(0);
    expect(breakerStrength(s, "puf-1")).toBe(3);
    expect(s.runner.clicks).toBe(0);
  });


  it("keeps Flare's meat damage unpreventable after The Cleaners increases it (CR 9.4.5.ex1)", () => {
    const s = createInitialState();
    const cleaners = instantiateCard("the-cleaners", "cl-1", "corp:score");
    const pap = instantiateCard("paparazzi", "pap-1", "runner:installed");
    const flare = instantiateCard("flare", "flare-1", "server:hq:ice");
    s.cards["cl-1"] = cleaners;
    s.cards["pap-1"] = pap;
    s.cards["flare-1"] = flare;
    s.corp.scoreArea = ["cl-1"];
    s.runner.installed = ["pap-1"];
    s.runner.hand = [];
    for (const id of ["g1", "g2", "g3"]) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }

    const dealt = evalEffect(
      { state: s, sourceId: "flare-1" },
      fx.meatDamage(2, { cannotPrevent: true }),
    );
    expect(dealt.ok).toBe(true);

    const increased = at(s.log, "Meat damage increased by 1");
    const locked = at(s.log, "3 meat damage from flare-1 cannot be prevented");
    const suffered = at(s.log, "meat damage 3: trashed 3 from grip");
    expect(s.log[locked]).toContain(CR.staticKeepsRestriction.number);
    expect(increased).toBeLessThan(locked);
    expect(locked).toBeLessThan(suffered);
    expect(s.runner.hand).toEqual([]);
    expect(s.runner.installed).toContain("pap-1");
    expect(s.done).toBe(false);
    expect(s.log.join("\n")).not.toContain("Paparazzi — prevent");
  });


  it("leaves Mumbad Virtual Tour installed when Wendigo has banned Imp (CR 9.5.3a.ex1)", () => {
    let s = createInitialState();
    const tour = instantiateCard(
      "mumbad-virtual-tour",
      "mvt-1",
      "server:remote-1:root",
    );
    const imp = instantiateCard("imp", "imp-1", "runner:installed");
    imp.virusCounters = 1;
    const wendigo = instantiateCard("wendigo", "wen-1", "server:remote-1:ice");
    s.cards["mvt-1"] = tour;
    s.cards["imp-1"] = imp;
    s.cards["wen-1"] = wendigo;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: ["wen-1"],
      root: ["mvt-1"],
    };
    s.runner.installed = ["imp-1"];
    s.runner.credits = 0;
    s.activeSide = "runner";
    s.timingKey = "breach.awaitAccess";
    s.run = {
      attackedServerId: "remote-1",
      phase: "breach",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: ["mvt-1"],
      randomAccessLimit: 1,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      cannotStealOrTrash: false,
      accessCandidatesPreset: true,
    };

    const banned = evalEffect(
      { state: s, sourceId: "wen-1" },
      fx.do({ kind: "resolve_wendigo_ban_program", programId: "imp-1" }),
    );
    expect(banned.ok).toBe(true);
    s = must(s, { type: "access_card", cardId: "mvt-1" });

    const optional = at(s.log, "Imp's ability stays optional");
    expect(s.log[optional]).toContain(CR.forcedMidAccessOptional.number);
    expect(s.cards["mvt-1"]?.zone).toBe("server:remote-1:root");
    expect(s.servers["remote-1"]?.root).toContain("mvt-1");
    expect(s.cards["imp-1"]?.virusCounters).toBe(1);
    expect(s.runner.installed).toContain("imp-1");
  });


  it("sets Fermenter's virus counters aside until its trash ability finishes (CR 9.5.5.ex1)", () => {
    let s = createInitialState();
    const fermenter = instantiateCard("fermenter", "fer-1", "runner:installed");
    fermenter.virusCounters = 4;
    s.cards["fer-1"] = fermenter;
    s.runner.installed = ["fer-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, {
      type: "use_paid_ability",
      cardId: "fer-1",
      abilityId: "fermenter-cash",
    });

    const aside = at(s.log, "Set aside 4 virus counter(s) from Fermenter");
    const gained = at(s.log, "runner gains 8¢");
    const bank = at(s.log, "Fermenter's 4 set-aside virus counter(s) return to the bank");
    expect(s.log[aside]).toContain(CR.trashAbilityKeepsHosted.number);
    expect(s.log[bank]).toContain(CR.trashAbilityKeepsHosted.number);
    expect(aside).toBeLessThan(gained);
    expect(gained).toBeLessThan(bank);
    expect(s.runner.credits).toBe(13);
    expect(s.runner.clicks).toBe(0);
    expect(s.cards["fer-1"]?.virusCounters).toBe(0);
    expect(s.cards["fer-1"]?.zone).toBe("runner:heap");
    expect(s.runner.discardPile).toContain("fer-1");
    expect(s.runner.installed).not.toContain("fer-1");
    expect(s.resolvingSetAsideVirus).toBeUndefined();
  });


  it("installs one hosted card from Street Peddler and trashes the other two (CR 9.5.5.ex2)", () => {
    let s = createInitialState();
    const peddler = instantiateCard("street-peddler", "sp-1", "runner:installed");
    peddler.hostedCardIds = ["m1", "m2", "m3"];
    s.cards["sp-1"] = peddler;
    s.runner.installed = ["sp-1"];
    for (const id of ["m1", "m2", "m3"]) {
      const hosted = instantiateCard("marjanah", id, "hosted:sp-1");
      hosted.hostId = "sp-1";
      hosted.faceup = false;
      s.cards[id] = hosted;
    }
    s.runner.credits = 5;
    s.activeSide = "runner";
    s.timingKey = "runner.actionPaw";

    s = must(s, {
      type: "use_paid_ability",
      cardId: "sp-1",
      abilityId: "street-peddler-install",
    });

    const aside = at(s.log, "Set aside 3 hosted card(s) from Street Peddler");
    const spared = s.log.findIndex(
      (line, index) =>
        index > aside && line.includes("Hosted on uninstalled cards checked"),
    );
    expect(s.log[aside]).toContain(CR.trashAbilityKeepsHosted.number);
    expect(s.log[spared]).toContain("nothing trashed");
    expect(aside).toBeLessThan(spared);
    expect(s.pendingChoice?.options.map((option) => option.id)).toEqual([
      "peddler:m1",
      "peddler:m2",
      "peddler:m3",
    ]);

    s = must(s, { type: "choose_option", optionId: "peddler:m1" });

    const installed = at(s.log, "Street Peddler — install Marjanah");
    const trashed = s.log.filter(
      (line) =>
        line.includes("Marjanah trashed") &&
        line.includes(CR.checkpointHostedOnUninstalled.number),
    );
    expect(spared).toBeLessThan(installed);
    expect(trashed).toHaveLength(2);
    expect(s.cards["m1"]?.zone).toBe("runner:installed");
    expect(s.cards["m1"]?.faceup).toBe(true);
    expect(s.runner.installed).toContain("m1");
    expect(s.cards["m2"]?.zone).toBe("runner:heap");
    expect(s.cards["m3"]?.zone).toBe("runner:heap");
    expect(s.runner.discardPile).toEqual(expect.arrayContaining(["sp-1", "m2", "m3"]));
    expect(s.runner.setAside ?? []).toEqual([]);
    expect(s.resolvingSetAsideHosted).toBeUndefined();
  });


  it("sets Reconstruction Contract's advancement counters aside until the interrupt window closes (CR 9.5.5.ex3)", () => {
    let s = createInitialState();
    const contract = instantiateCard(
      "reconstruction-contract",
      "rc-1",
      "server:remote-1:root",
    );
    contract.rezzed = true;
    contract.faceup = true;
    contract.advancementCounters = 3;
    const wall = instantiateCard("ice-wall", "iw-1", "server:hq:ice");
    wall.rezzed = true;
    wall.faceup = true;
    s.cards["rc-1"] = contract;
    s.cards["iw-1"] = wall;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["rc-1"],
    };
    s.servers.hq.ice = ["iw-1"];
    s.activeSide = "corp";
    s.timingKey = "corp.actionPaw";

    s = must(s, {
      type: "use_paid_ability",
      cardId: "rc-1",
      abilityId: "reconstruction-move",
    });

    const aside = at(s.log, "Set aside 3 advancement counter(s) from Reconstruction Contract");
    const checkpoint = s.log.findIndex(
      (line, index) => index > aside && line.includes("Checkpoint open [cost]"),
    );
    expect(s.log[aside]).toContain(CR.trashAbilityKeepsHosted.number);
    expect(aside).toBeLessThan(checkpoint);
    expect(s.cards["rc-1"]?.zone).toBe("corp:archives");
    expect(s.cards["rc-1"]?.advancementCounters).toBe(0);
    expect(s.resolvingSetAsideAdvancements).toEqual({ sourceId: "rc-1", count: 3 });
    expect(s.pendingChoice?.options.map((option) => option.id)).toContain("rc:iw-1:3");

    s = must(s, { type: "choose_option", optionId: "rc:iw-1:3" });

    const window = at(s.log, "Interrupt window — 3 advancement counter(s) onto Ice Wall");
    const moved = at(s.log, "Reconstruction Contract — move 3 advancement(s) to Ice Wall");
    expect(s.log[window]).toContain(CR.trashAbilityKeepsHosted.number);
    expect(checkpoint).toBeLessThan(window);
    expect(window).toBeLessThan(moved);
    expect(s.cards["iw-1"]?.advancementCounters).toBe(3);
    expect(s.cards["rc-1"]?.advancementCounters).toBe(0);
    expect(s.resolvingSetAsideAdvancements).toBeUndefined();
  });


  it("refuses Project Wotan unless the approached ice is a rezzed bioroid (CR 9.5.6b.ex1)", () => {
    const s = createInitialState();
    const wotan = instantiateCard("project-wotan", "wotan-1", "corp:score");
    wotan.agendaCounters = 1;
    wotan.faceup = true;
    const wall = instantiateCard("ice-wall", "iw-1", "server:hq:ice");
    wall.rezzed = true;
    wall.faceup = true;
    const subs = wall.subroutines?.length ?? 0;
    s.cards["wotan-1"] = wotan;
    s.cards["iw-1"] = wall;
    s.corp.scoreArea = ["wotan-1"];
    s.servers.hq.ice = ["iw-1"];
    s.activeSide = "corp";
    s.timingKey = "run.approachPaw";
    s.run = {
      attackedServerId: "hq" as ServerId,
      phase: "approach_ice",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };

    const refused = applyAction(s, {
      type: "use_paid_ability",
      cardId: "wotan-1",
      abilityId: "wotan-etr",
    });

    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error).toMatch(/rezzed bioroid/i);
      expect(refused.cites.map((cite) => cite.number)).toContain(
        CR.paidAbilityApproachedIce.number,
      );
    }
    expect(s.cards["wotan-1"]?.agendaCounters).toBe(1);
    expect(s.cards["iw-1"]?.subroutines?.length ?? 0).toBe(subs);
    expect(s.log.join("\n")).not.toContain(
      "approached ice is not a rezzed bioroid",
    );
  });


    it("gives Arruaceiras Crew's tag only during an encounter (CR 9.5.6c.ex1)", () => {
    const idle = createInitialState();
    const crew = instantiateCard("arruaceiras-crew", "crew-1", "runner:installed");
    const wall = instantiateCard("ice-wall", "wall-1", "server:hq:ice");
    wall.rezzed = true;
    wall.faceup = true;
    idle.cards["crew-1"] = crew;
    idle.cards["wall-1"] = wall;
    idle.runner.installed = ["crew-1"];
    idle.servers.hq.ice = ["wall-1"];
    runnerTurn(idle);
    const early = applyAction(idle, {
      type: "use_paid_ability",
      cardId: "crew-1",
      abilityId: "arruaceiras-weaken",
    });
    expect(early.ok).toBe(false);

    const s = createInitialState();
    s.cards["crew-1"] = instantiateCard("arruaceiras-crew", "crew-1", "runner:installed");
    const ice = instantiateCard("ice-wall", "wall-1", "server:hq:ice");
    ice.rezzed = true;
    ice.faceup = true;
    s.cards["wall-1"] = ice;
    s.runner.installed = ["crew-1"];
    s.runner.tags = 0;
    openEncounter(s, "wall-1", ice.subroutines?.length ?? 1);
    const weakened = must(s, {
      type: "use_paid_ability",
      cardId: "crew-1",
      abilityId: "arruaceiras-weaken",
    });
    expect(weakened.runner.tags).toBe(1);
    expect(weakened.run?.iceStrengthBoosts["wall-1"]).toBe(-2);
  });


    it("uses Abagnale's trash and interface only on a code gate it can interface (CR 9.5.6c.ex2)", () => {
    const outside = createInitialState();
    outside.cards["ab-1"] = instantiateCard("abagnale", "ab-1", "runner:installed");
    outside.runner.installed = ["ab-1"];
    runnerTurn(outside);
    const trashedEarly = applyAction(outside, {
      type: "use_paid_ability",
      cardId: "ab-1",
      abilityId: "abagnale-bypass",
    });
    expect(trashedEarly.ok).toBe(false);
    const pumpedEarly = applyAction(outside, {
      type: "use_paid_ability",
      cardId: "ab-1",
      abilityId: "abagnale-pump",
    });
    expect(pumpedEarly.ok).toBe(false);

    const barrier = createInitialState();
    const ab = instantiateCard("abagnale", "ab-1", "runner:installed");
    const wall = instantiateCard("ice-wall", "wall-1", "server:hq:ice");
    wall.rezzed = true;
    wall.faceup = true;
    barrier.cards["ab-1"] = ab;
    barrier.cards["wall-1"] = wall;
    barrier.runner.installed = ["ab-1"];
    barrier.runner.credits = 5;
    openEncounter(barrier, "wall-1", wall.subroutines?.length ?? 1);
    const wrongSubtype = applyAction(barrier, {
      type: "use_paid_ability",
      cardId: "ab-1",
      abilityId: "abagnale-bypass",
    });
    expect(wrongSubtype.ok).toBe(false);
    const breakBarrier = applyAction(barrier, {
      type: "break_subroutine",
      breakerId: "ab-1",
      subIndex: 0,
    });
    expect(breakBarrier.ok).toBe(false);

    const weak = createInitialState();
    weak.cards["ab-1"] = instantiateCard("abagnale", "ab-1", "runner:installed");
    const toll = instantiateCard("tollbooth", "toll-1", "server:hq:ice");
    toll.rezzed = true;
    toll.faceup = true;
    weak.cards["toll-1"] = toll;
    weak.runner.installed = ["ab-1"];
    weak.runner.credits = 5;
    openEncounter(weak, "toll-1", toll.subroutines?.length ?? 1);
    expect(breakerStrength(weak, "ab-1")).toBeLessThan(toll.strength ?? 0);
    const cannotInterface = applyAction(weak, {
      type: "break_subroutine",
      breakerId: "ab-1",
      subIndex: 0,
    });
    expect(cannotInterface.ok).toBe(false);

    const gate = createInitialState();
    gate.cards["ab-1"] = instantiateCard("abagnale", "ab-1", "runner:installed");
    const enigma = instantiateCard("enigma", "en-1", "server:hq:ice");
    enigma.rezzed = true;
    enigma.faceup = true;
    gate.cards["en-1"] = enigma;
    gate.runner.installed = ["ab-1"];
    gate.runner.credits = 5;
    openEncounter(gate, "en-1", enigma.subroutines?.length ?? 1);
    const pumped = must(gate, {
      type: "use_paid_ability",
      cardId: "ab-1",
      abilityId: "abagnale-pump",
    });
    expect(breakerStrength(pumped, "ab-1")).toBe(4);
    const broke = must(pumped, {
      type: "break_subroutine",
      breakerId: "ab-1",
      subIndex: 0,
    });
    expect(broke.run?.encounter?.broken[0]).toBe(true);

    const bypass = createInitialState();
    bypass.cards["ab-2"] = instantiateCard("abagnale", "ab-2", "runner:installed");
    const enigma2 = instantiateCard("enigma", "en-2", "server:hq:ice");
    enigma2.rezzed = true;
    enigma2.faceup = true;
    bypass.cards["en-2"] = enigma2;
    bypass.runner.installed = ["ab-2"];
    openEncounter(bypass, "en-2", enigma2.subroutines?.length ?? 1);
    const trashed = must(bypass, {
      type: "use_paid_ability",
      cardId: "ab-2",
      abilityId: "abagnale-bypass",
    });
    expect(trashed.cards["ab-2"]?.zone).toBe("runner:heap");
    expect(trashed.run?.bypassedIceIds).toContain("en-2");
    expect(trashed.run?.encounter?.broken.every(Boolean)).toBe(true);
  });


  it("leaves two Blackguard instances pending after Satellite Uplink exposes two cards (CR 9.6.4b.ex2)", () => {
    let s = createInitialState();
    const guard = instantiateCard("blackguard", "bg-1", "runner:installed");
    const uplink = instantiateCard("satellite-uplink", "su-1", "runner:grip");
    const pad = instantiateCard("pad-campaign", "pad-1", "server:remote-1:root");
    pad.rezzed = false;
    pad.faceup = false;
    const wall = instantiateCard("ice-wall", "iw-1", "server:hq:ice");
    wall.rezzed = false;
    wall.faceup = false;
    s.cards["bg-1"] = guard;
    s.cards["su-1"] = uplink;
    s.cards["pad-1"] = pad;
    s.cards["iw-1"] = wall;
    s.runner.installed = ["bg-1"];
    s.runner.hand = ["su-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.corp.credits = 5;
    s.servers.hq.ice = ["iw-1"];
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["pad-1"],
    };
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "play_event", cardId: "su-1" });
    s = must(s, { type: "choose_option", optionId: "expose-up:pad-1" });

    const firstExpose = at(s.log, "Expose PAD Campaign");
    expect(s.cards["pad-1"]?.faceup).toBe(true);
    expect(s.cards["pad-1"]?.rezzed).toBe(false);
    expect(s.cards["iw-1"]?.faceup).toBe(false);
    expect(s.corp.credits).toBe(5);
    expect(s.log.some((line) => line.includes("instances become pending"))).toBe(
      false,
    );
    expect(s.pendingChoice?.options.map((option) => option.id)).toContain(
      "expose-up:iw-1",
    );

    s = must(s, { type: "choose_option", optionId: "expose-up:iw-1" });

    const secondExpose = at(s.log, "Expose Ice Wall");
    const pending = at(s.log, "Blackguard — 2 instances become pending");
    const window = at(s.log, "Blackguard has 2 instances pending");
    const rezPad = at(s.log, "Corp must rez PAD Campaign for 2¢");
    const rezWall = at(s.log, "Corp must rez Ice Wall for 1¢");
    expect(s.log[pending]).toContain(CR.conditionMetMultipleTimes.number);
    expect(s.log[rezPad]).toContain(CR.conditionMetMultipleTimes.number);
    expect(firstExpose).toBeLessThan(secondExpose);
    expect(secondExpose).toBeLessThan(pending);
    expect(pending).toBeLessThan(window);
    expect(window).toBeLessThan(rezPad);
    expect(rezPad).toBeLessThan(rezWall);
    expect(s.cards["pad-1"]?.rezzed).toBe(true);
    expect(s.cards["iw-1"]?.rezzed).toBe(true);
    expect(s.corp.credits).toBe(2);
    expect(s.turn.blackguardExposeIds).toBeUndefined();
    expect(
      s.pendingAbilities.some((p) => p.payload?.kind === "blackguard_force_rez"),
    ).toBe(false);
  });


  it("does not take Nico Campaign's turn-begin credits after Ob rezzes it (CR 9.6.5b.ex1)", () => {
    const s = createInitialState();
    const identity = instantiateCard(
      "ob-superheavy-logistics-extract-export-excel",
      s.corp.identityId,
      "corp:identity",
    );
    const reaper = instantiateCard("reaper-function", "reaper-1", "server:remote-1:root");
    reaper.rezzed = true;
    reaper.faceup = true;
    const nico = instantiateCard("nico-campaign", "nico-1", "corp:rd");
    for (const id of ["g1", "g2"]) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    }
    s.cards[s.corp.identityId] = identity;
    s.cards["reaper-1"] = reaper;
    s.cards["nico-1"] = nico;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["reaper-1"],
    };
    s.corp.deck = ["nico-1"];
    s.corp.credits = 5;
    s.runner.hand = ["g1", "g2"];
    s.nextRemoteNumber = 2;
    s.activeSide = "corp";
    s.timingKey = "corp.startPaw";
    enterStep(s, "corp.turnBegins");
    autoWalk(s);
    const trashed = must(s, { type: "choose_option", optionId: "trash-net" });
    const rezzed = must(trashed, { type: "choose_option", optionId: "ob-rez:nico-1" });
    expect(rezzed.cards["nico-1"]?.rezzed).toBe(true);
    expect(rezzed.cards["nico-1"]?.hostedCredits).toBe(9);
    expect(rezzed.corp.credits).toBe(3);
    expect(rezzed.runner.hand).toEqual([]);
    expect(rezzed.log.join("\n")).not.toContain("Take 3¢ from Nico Campaign");
  });


  it("rezzes Tranquility Home Grid after the install checkpoint (CR 9.6.5b.ex2)", () => {
    const s = createInitialState();
    const test = instantiateCard(
      "architect-deployment-test",
      "adt-1",
      "corp:score",
    );
    const grid = instantiateCard("tranquility-home-grid", "thg-1", "corp:rd");
    s.cards["adt-1"] = test;
    s.cards["thg-1"] = grid;
    s.corp.scoreArea = ["adt-1"];
    s.corp.deck = ["thg-1"];
    s.corp.credits = 5;
    const looked = evalEffect(
      { state: s, sourceId: "adt-1" },
      fx.do({ kind: "look_top_n_rd_may_install_and_rez_ignore_costs", n: 5 }),
    );
    expect(looked.ok).toBe(true);
    const installed = must(s, {
      type: "choose_option",
      optionId: "rd-look-install-rez:thg-1",
    });
    const text = installed.log.join("\n");
    const pay = text.indexOf("Pay 0¢ to rez Tranquility Home Grid");
    const rez = text.indexOf("Rez Tranquility Home Grid.");
    expect(pay).toBeGreaterThan(-1);
    expect(rez).toBeGreaterThan(pay);
    expect(installed.pendingChoice).toBeNull();
    expect(installed.cards["thg-1"]?.onFirstInstallInThisServerRootThisTurn).toBeTruthy();
    expect(installed.cards["thg-1"]?.rezzed).toBe(true);
    expect(installed.corp.credits).toBe(5);
  });


  it("does not score Quantum Predictive Model when Casting Call tags during the access (CR 9.6.5c.ex1)", () => {
    const s = createInitialState();
    const agenda = instantiateCard(
      "quantum-predictive-model",
      "qpm-1",
      "server:remote-1:root",
    );
    agenda.faceup = true;
    agenda.onAccessGiveTags = 2;
    s.cards["qpm-1"] = agenda;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["qpm-1"],
    };
    s.runner.tags = 0;
    s.activeSide = "runner";
    s.timingKey = "breach.awaitAccess";
    s.run = {
      attackedServerId: "remote-1",
      phase: "success",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: ["qpm-1"],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    const accessed = must(s, { type: "access_card", cardId: "qpm-1" });
    expect(accessed.cards["qpm-1"]?.zone).toBe("server:remote-1:root");
    expect(accessed.corp.scoreArea).not.toContain("qpm-1");
    expect(accessed.runner.tags).toBe(2);
  });


  it("checks Underworld Contact's link after The Supplier installs Dyson Mem Chip (CR 9.6.5d.ex1)", () => {
    let s = createInitialState();
    const identity = s.cards[s.runner.identityId]!;
    identity.link = 1;
    s.runner.link = 1;
    const supplier = instantiateCard("the-supplier", "sup-1", "runner:installed");
    supplier.hostedCardIds = ["dyson-1"];
    const dyson = instantiateCard("dyson-mem-chip", "dyson-1", "hosted:sup-1");
    dyson.hostId = "sup-1";
    dyson.faceup = true;
    const contact = instantiateCard("underworld-contact", "uw-1", "runner:installed");
    s.cards["sup-1"] = supplier;
    s.cards["dyson-1"] = dyson;
    s.cards["uw-1"] = contact;
    s.runner.installed = ["sup-1", "uw-1"];
    s.runner.credits = 5;
    s.activeSide = "runner";
    s.timingKey = "runner.turnBegins";

    autoWalk(s);

    const waiting = at(
      s.log,
      "The Supplier's turn-begin ability is open; 1 later turn-begin ability waits",
    );
    expect(s.log[waiting]).toContain(CR.conditionCheckedWhenResolving.number);
    expect(s.pendingChoice?.options.map((option) => option.id)).toContain(
      "install:dyson-1",
    );
    expect(s.runner.link).toBe(1);
    expect(s.runner.credits).toBe(5);
    expect(s.log.some((line) => line.includes("runner gains 1¢"))).toBe(false);

    s = must(s, { type: "choose_option", optionId: "install:dyson-1" });

    const installed = at(s.log, "The Supplier — install Dyson Mem Chip");
    const gained = at(s.log, "runner gains 1¢");
    expect(installed).toBeLessThan(gained);
    expect(s.runner.link).toBe(2);
    expect(s.runner.installed).toContain("dyson-1");
    expect(s.cards["dyson-1"]?.zone).toBe("runner:installed");
    expect(s.runner.credits).toBe(5);
    expect(s.turn.runnerTurnBeginRemainingIds).toBeUndefined();
  });


  it("gains 2 credits when Shipment from SanSan advances a card that had none (CR 9.6.6a.ex1)", () => {
    let s = createInitialState();
    const oldId = s.corp.identityId;
    const identity = instantiateCard(
      "weyland-consortium-built-to-last",
      oldId,
      s.cards[oldId]!.zone,
    );
    s.cards[oldId] = identity;
    const agenda = instantiateCard(
      "hostile-takeover",
      "ht-1",
      "server:remote-1:root",
    );
    s.cards["ht-1"] = agenda;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["ht-1"],
    };
    const ship = instantiateCard("shipment-from-sansan", "ship-1", "corp:hq");
    s.cards["ship-1"] = ship;
    s.corp.hand = ["ship-1"];
    s.corp.credits = 5;
    s.corp.clicks = 3;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";

    s = must(s, { type: "play_operation", cardId: "ship-1" });

    const placed = at(s.log, "Place 2 advancement(s) on Hostile Takeover");
    const gained = at(
      s.log,
      "Weyland Consortium: Built to Last — gain 2¢; Hostile Takeover had no advancement counters",
    );
    expect(placed).toBeLessThan(gained);
    expect(s.log[gained]).toContain(CR.hadPreviousCheckpoint.number);
    expect(s.cards["ht-1"]?.advancementCounters).toBe(2);
    expect(s.corp.credits).toBe(7);
  });


  it("resolves Parasite once when Architect cannot be trashed (CR 9.6.7d.ex1)", () => {
    const s = createInitialState();
    const ice = instantiateCard("architect", "arch-1", "server:hq:ice");
    ice.rezzed = true;
    ice.faceup = true;
    ice.hostedCardIds = ["par-1"];
    const parasite = instantiateCard("parasite", "par-1", "runner:installed");
    parasite.hostId = "arch-1";
    parasite.virusCounters = 2;
    s.cards["arch-1"] = ice;
    s.cards["par-1"] = parasite;
    s.servers.hq.ice = ["arch-1"];
    s.runner.installed = ["par-1"];
    s.activeSide = "runner";
    s.timingKey = "runner.turnBegins";

    autoWalk(s);

    const placed = at(s.log, "Place 1 virus counter(s) on Parasite → 3");
    const resolved = at(
      s.log,
      "Parasite's ability resolves once; Architect cannot be trashed",
    );
    expect(placed).toBeLessThan(resolved);
    expect(s.log[resolved]).toContain(CR.staticConditionNoEffect.number);
    expect(
      s.log.filter((line) => line.includes("ability resolves once")),
    ).toHaveLength(1);
    expect(s.cards["arch-1"]?.zone).toBe("server:hq:ice");
    expect(s.cards["arch-1"]?.rezzed).toBe(true);
    expect(s.servers.hq.ice).toContain("arch-1");
    expect(s.corp.discardPile).not.toContain("arch-1");
    expect(s.cards["par-1"]?.virusCounters).toBe(3);
    expect(s.cards["par-1"]?.hostId).toBe("arch-1");
    expect(s.log.some((line) => line.includes("Trash Architect"))).toBe(false);
  });


  it("drops Drug Dealer's turn-begin ability when Aesop's Pawnshop trashes it first (CR 9.6.10.ex1)", () => {
    const s = createInitialState();
    const aesop = instantiateCard("aesops-pawnshop", "aesop-1", "runner:installed");
    const dealer = instantiateCard("drug-dealer", "dealer-1", "runner:installed");
    s.cards["aesop-1"] = aesop;
    s.cards["dealer-1"] = dealer;
    s.runner.installed = ["aesop-1", "dealer-1"];
    s.runner.credits = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.startPaw";
    enterStep(s, "runner.turnBegins");
    autoWalk(s);
    const picked = must(s, { type: "choose_option", optionId: "trash" });
    const trashed = must(picked, {
      type: "choose_option",
      optionId: "aesop:dealer-1",
    });
    expect(trashed.runner.discardPile).toContain("dealer-1");
    expect(trashed.runner.credits).toBe(4);
    expect(trashed.log.join("\n")).toContain("pending turn-begin ability ends");
  });


  it("resolves In the Groove on every install until the turn ends (CR 9.6.13b.ex1)", () => {
    const s = createInitialState();
    const groove = instantiateCard("in-the-groove", "groove-1", "runner:grip");
    const first = instantiateCard("dzmz-optimizer", "opt-1", "runner:grip");
    const second = instantiateCard("dzmz-optimizer", "opt-2", "runner:grip");
    first.installCost = 2;
    second.installCost = 2;
    for (const id of ["stack-1", "stack-2"]) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:stack");
    }
    s.cards["groove-1"] = groove;
    s.cards["opt-1"] = first;
    s.cards["opt-2"] = second;
    s.runner.hand = ["groove-1"];
    s.runner.deck = ["stack-1", "stack-2"];
    s.runner.clicks = 4;
    s.runner.credits = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.action";
    const played = must(s, { type: "play_event", cardId: "groove-1" });
    expect(played.turn.remainderOfTurnOnInstallPrintedCostGte).toHaveLength(1);
    first.zone = "runner:installed";
    played.runner.installed.push("opt-1");
    noteProgramOrHardwareInstalled(played, "opt-1");
    const drew = must(played, { type: "choose_option", optionId: "draw" });
    expect(drew.runner.hand).toContain("stack-1");
    second.zone = "runner:installed";
    drew.runner.installed.push("opt-2");
    noteProgramOrHardwareInstalled(drew, "opt-2");
    const gained = must(drew, { type: "choose_option", optionId: "gain" });
    expect(gained.runner.credits).toBe(2);
    expect(gained.turn.remainderOfTurnOnInstallPrintedCostGte).toHaveLength(1);
    beginRunnerTurnFlags(gained);
    expect(gained.turn.remainderOfTurnOnInstallPrintedCostGte).toEqual([]);
  });


  it("takes Joshua B.'s tag at turn end after Joshua B. is trashed (CR 9.6.13c.ex1)", () => {
    let s = createInitialState();
    const joshua = instantiateCard("joshua-b", "jb-1", "runner:installed");
    s.cards["jb-1"] = joshua;
    s.runner.installed = ["jb-1"];
    s.runner.clicks = 0;
    s.runner.tags = 0;
    s.activeSide = "runner";
    s.timingKey = "runner.turnBegins";

    autoWalk(s);
    s = must(s, { type: "choose_option", optionId: "gain-click" });

    expect(s.runner.clicks).toBe(1);
    expect(s.turn.delayedTurnEndTags).toEqual([
      { sourceId: "jb-1", title: "Joshua B." },
    ]);
    expect(s.runner.tags).toBe(0);

    moveRunnerCardToHeap(s, "jb-1");
    expect(s.runner.installed).not.toContain("jb-1");
    expect(s.cards["jb-1"]?.zone).toBe("runner:heap");

    s.timingKey = "runner.turnEnds";
    autoWalk(s);

    const resolved = at(
      s.log,
      "Joshua B.'s delayed ability resolves; take 1 tag",
    );
    const tagged = at(s.log, "Runner receives 1 tag(s)");
    expect(resolved).toBeLessThan(tagged);
    expect(s.log[resolved]).toContain(CR.delayedAbilityOnce.number);
    expect(s.runner.tags).toBe(1);
    expect(s.turn.delayedTurnEndTags).toEqual([]);
    expect(s.cards["jb-1"]?.zone).toBe("runner:heap");
  });


  it("does not trash Mayfly for a break outside a run (CR 9.6.13d.ex1)", () => {
    const s = createInitialState();
    const ice = instantiateCard("ice-wall", "wall-1", "server:hq:ice");
    ice.rezzed = true;
    ice.faceup = true;
    const mayfly = instantiateCard("mayfly", "mayfly-1", "runner:installed");
    s.cards["wall-1"] = ice;
    s.cards["mayfly-1"] = mayfly;
    s.servers.hq.ice = ["wall-1"];
    s.runner.installed = ["mayfly-1"];
    s.runner.credits = 1;
    s.activeSide = "runner";
    s.timingKey = "run.encounterPaw";
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: {
        iceId: "wall-1",
        broken: (ice.subroutines ?? []).map(() => false),
      },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      encounterOutsideRun: true,
    };
    const broken = must(s, {
      type: "break_subroutine",
      breakerId: "mayfly-1",
      subIndex: 0,
    });
    expect(broken.runner.installed).toContain("mayfly-1");
    expect(broken.run?.breakersThatBroke ?? []).not.toContain("mayfly-1");
  });


  it("resolves Market Research through 24/7 News Cycle only while the Runner is tagged (CR 9.6.14d.ex1)", () => {
    const setup = (tags: number) => {
      const s = createInitialState();
      const astro = instantiateCard(
        "astroscript-pilot-program",
        "astro-1",
        "corp:score",
      );
      const market = instantiateCard("market-research", "mr-1", "corp:score");
      const news = instantiateCard("24-7-news-cycle", "news-1", "corp:hq");
      s.cards["astro-1"] = astro;
      s.cards["mr-1"] = market;
      s.cards["news-1"] = news;
      s.corp.scoreArea = ["astro-1", "mr-1"];
      s.corp.hand = ["news-1"];
      s.corp.clicks = 1;
      s.corp.credits = 5;
      s.runner.tags = tags;
      s.activeSide = "corp";
      s.timingKey = "corp.takeAction";
      return s;
    };

    let tagged = setup(1);
    tagged = must(tagged, { type: "play_operation", cardId: "news-1" });
    expect(
      tagged.pendingChoice?.options.map((option) => option.id),
    ).toContain("forfeit-agenda:astro-1");
    tagged = must(tagged, {
      type: "choose_option",
      optionId: "forfeit-agenda:astro-1",
    });
    expect(tagged.corp.scoreArea).not.toContain("astro-1");
    expect(tagged.cards["astro-1"]?.zone).toBe("corp:archives");
    expect(tagged.pendingChoice?.options.map((option) => option.id)).toEqual([
      "247:mr-1",
    ]);
    tagged = must(tagged, { type: "choose_option", optionId: "247:mr-1" });

    const forfeited = at(tagged.log, "Forfeit AstroScript Pilot Program");
    const resolved = at(
      tagged.log,
      "Market Research's when-scored ability resolves; place 1 agenda counter",
    );
    expect(forfeited).toBeLessThan(resolved);
    expect(tagged.log[resolved]).toContain(
      CR.whenScoredAdditionalRequirement.number,
    );
    expect(tagged.cards["mr-1"]?.agendaCounters).toBe(1);
    expect(tagged.corp.scoreArea).toContain("mr-1");

    let untagged = setup(0);
    untagged = must(untagged, { type: "play_operation", cardId: "news-1" });
    untagged = must(untagged, {
      type: "choose_option",
      optionId: "forfeit-agenda:astro-1",
    });
    const refused = at(
      untagged.log,
      "Market Research's when-scored ability cannot resolve; Runner is not tagged",
    );
    expect(untagged.log[refused]).toContain(
      CR.whenScoredAdditionalRequirement.number,
    );
    expect(untagged.cards["mr-1"]?.agendaCounters ?? 0).toBe(0);
    expect(
      untagged.pendingChoice?.options.some((option) =>
        option.id.startsWith("247:"),
      ) ?? false,
    ).toBe(false);
  });


  it("ends the action phase after Oppo Research's play ability finishes (CR 9.7.1.ex1)", () => {
    let s = createInitialState();
    const agenda = instantiateCard("degree-mill", "ag-1", "corp:score");
    const oppo = instantiateCard("oppo-research", "oppo-1", "corp:hq");
    s.cards["ag-1"] = agenda;
    s.cards["oppo-1"] = oppo;
    s.corp.scoreArea = ["ag-1"];
    s.corp.hand = ["oppo-1"];
    s.corp.clicks = 3;
    s.corp.credits = 7;
    s.turn.runnerStoleOrTrashedCorpCardLastTurn = true;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";

    s = must(s, { type: "play_operation", cardId: "oppo-1" });
    expect(s.pendingChoice?.options.map((option) => option.id)).toEqual([
      "pay",
      "decline",
    ]);
    expect(s.runner.tags).toBe(2);
    expect(s.corp.clicks).toBe(2);
    expect(s.log.some((line) => line.includes("end the action phase"))).toBe(
      false,
    );

    s = must(s, { type: "choose_option", optionId: "pay" });
    const paid = at(s.log, "Runner receives 2 tag(s) → 4");
    const ended = at(s.log, "Oppo Research is terminal — end the action phase");
    expect(paid).toBeLessThan(ended);
    expect(s.log[ended]).toContain(CR.playAbility.number);
    expect(s.runner.tags).toBe(4);
    expect(s.corp.credits).toBe(0);
    expect(s.corp.clicks).toBe(0);
  });


  it("places Merlin's subroutine where the Corp chooses on Lancelot (CR 9.8.2c.ex1)", () => {
    let s = createInitialState();
    const lance = instantiateCard("lancelot", "lance-1", "server:hq:ice");
    lance.rezzed = true;
    lance.faceup = true;
    const boost = instantiateCard("sub-boost", "sb-1", "hosted:lance-1");
    boost.faceup = true;
    boost.hostId = "lance-1";
    lance.hostedCardIds = ["sb-1"];
    const merlin = instantiateCard("merlin", "merlin-1", "corp:hq");
    s.cards["lance-1"] = lance;
    s.cards["sb-1"] = boost;
    s.cards["merlin-1"] = merlin;
    s.servers.hq.ice = ["lance-1"];
    for (const id of s.corp.hand) {
      const held = s.cards[id];
      if (held) held.zone = "corp:rd";
      s.corp.deck.push(id);
    }
    s.corp.hand = ["merlin-1"];
    s.activeSide = "runner";
    s.timingKey = "run.approachIce";
    s.run = {
      attackedServerId: "hq",
      phase: "approach_ice",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };

    for (let i = 0; i < 12; i++) {
      autoWalk(s);
      if (s.pendingChoice?.options.some((option) => option.id === "grail-at:1")) {
        break;
      }
      const passed = applyAction(s, { type: "pass_window" });
      if (!passed.ok) break;
      s = passed.state;
    }

    expect(s.cards["lance-1"]?.subtypes).toContain("barrier");
    expect(s.cards["lance-1"]?.subroutines?.map((sub) => sub.text)).toEqual([
      "Trash 1 installed program",
      "End the run.",
    ]);
    expect(s.pendingChoice?.options.map((option) => option.id)).toEqual([
      "grail-at:0",
      "grail-at:1",
      "grail-at:2",
    ]);
    const offered = at(s.log, "choose where \"Do 2 net damage.\" is placed");
    expect(s.log[offered]).toContain(CR.subroutineOrderChoice.number);

    s = must(s, { type: "choose_option", optionId: "grail-at:1" });
    expect(s.cards["lance-1"]?.subroutines?.map((sub) => sub.text)).toEqual([
      "Trash 1 installed program",
      "Do 2 net damage.",
      "End the run.",
    ]);
    expect(s.cards["lance-1"]?.subroutines?.map((sub) => sub.id)).toEqual([
      "lancelot-trash",
      "lancelot-grail-merlin-1-0",
      "sub-boost-etr-sb-1",
    ]);
    expect(s.run?.encounter?.broken).toEqual([false, false, false]);
    const placed = at(s.log, "gains \"Do 2 net damage.\" at position 2");
    expect(s.log[placed]).toContain(CR.subroutineOrderChoice.number);
  });


  it("orders Loki's before-other subroutines with the newest first (CR 9.8.3a.ex1)", () => {
    let s = createInitialState();
    const loki = instantiateCard("loki", "loki-1", "server:hq:ice");
    loki.rezzed = true;
    loki.faceup = true;
    const tithe = instantiateCard("tithe", "tithe-1", "server:remote-1:ice");
    tithe.rezzed = true;
    tithe.faceup = true;
    const warden = instantiateCard(
      "warden-fatuma",
      "warden-1",
      "server:hq:root",
    );
    warden.rezzed = true;
    warden.faceup = true;
    const poke = instantiateCard("stick-and-poke", "poke-1", "runner:installed");
    s.cards["loki-1"] = loki;
    s.cards["tithe-1"] = tithe;
    s.cards["warden-1"] = warden;
    s.cards["poke-1"] = poke;
    s.servers.hq.ice = ["loki-1"];
    s.servers.hq.root = ["warden-1"];
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: ["tithe-1"],
      root: [],
    };
    s.runner.installed = ["poke-1"];
    s.activeSide = "runner";
    s.timingKey = "run.approachIce";
    s.run = {
      attackedServerId: "hq",
      phase: "approach_ice",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };

    for (let i = 0; i < 12; i++) {
      autoWalk(s);
      if (
        s.pendingChoice?.options.some((option) => option.id === "loki:tithe-1")
      ) {
        break;
      }
      const passed = applyAction(s, { type: "pass_window" });
      if (!passed.ok) break;
      s = passed.state;
    }

    const granted = at(
      s.log,
      'Warden Fatuma — Loki gains "The Runner loses [click]." before its other subroutines',
    );
    expect(s.log[granted]).toContain(CR.subroutineOriginExternalBefore.number);
    expect(s.cards["loki-1"]?.subroutines?.map((sub) => sub.text)).toEqual([
      "Do 1 net damage. The Runner draws 1 card.",
      "The Runner loses [click].",
      "End the run unless the Runner shuffles all cards from the grip into the stack.",
    ]);

    s = must(s, { type: "choose_option", optionId: "loki:tithe-1" });
    expect(s.cards["loki-1"]?.subroutines?.map((sub) => sub.text)).toEqual([
      "Do 1 net damage.",
      "Gain 1¢.",
      "Do 1 net damage. The Runner draws 1 card.",
      "The Runner loses [click].",
      "End the run unless the Runner shuffles all cards from the grip into the stack.",
    ]);
  });


  it("adds Ashigaru's new subroutine after the ones already broken (CR 9.8.3d.ex1)", () => {
    let s = createInitialState();
    const ash = instantiateCard("ashigaru", "ash-1", "server:hq:ice");
    ash.rezzed = true;
    ash.faceup = true;
    const panic = instantiateCard("panic-button", "panic-1", "server:hq:root");
    panic.rezzed = true;
    panic.faceup = true;
    const gbahali = instantiateCard("gbahali", "gb-1", "runner:installed");
    s.cards["ash-1"] = ash;
    s.cards["panic-1"] = panic;
    s.cards["gb-1"] = gbahali;
    s.servers.hq.ice = ["ash-1"];
    s.servers.hq.root = ["panic-1"];
    s.runner.installed = ["gb-1"];
    const hand = s.corp.deck.splice(0, 3);
    s.corp.hand = hand;
    for (const id of hand) {
      const held = s.cards[id];
      if (held) held.zone = "corp:hq";
    }
    s.corp.credits = 5;
    s.activeSide = "runner";
    s.timingKey = "run.approachIce";
    s.run = {
      attackedServerId: "hq",
      phase: "approach_ice",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };

    for (let i = 0; i < 12; i++) {
      autoWalk(s);
      if (
        s.timingKey === "run.encounterPaw" &&
        (s.cards["ash-1"]?.subroutines?.length ?? 0) === 3
      ) {
        break;
      }
      const passed = applyAction(s, { type: "pass_window" });
      if (!passed.ok) break;
      s = passed.state;
    }

    expect(s.cards["ash-1"]?.subroutines?.map((sub) => sub.text)).toEqual([
      "End the run.",
      "End the run.",
      "End the run.",
    ]);
    s.run!.encounter!.broken = [true, true, true];

    s = must(s, {
      type: "use_paid_ability",
      cardId: "panic-1",
      abilityId: "panic-draw",
    });
    const gained = at(
      s.log,
      'Ashigaru gains 1 "End the run." subroutine(s) after the others',
    );
    expect(s.log[gained]).toContain(CR.subroutineOriginStaticAfter.number);
    expect(s.corp.hand).toHaveLength(4);
    expect(s.corp.credits).toBe(4);
    expect(s.run?.encounter?.broken).toEqual([true, true, true, false]);

    s = must(s, {
      type: "use_paid_ability",
      cardId: "gb-1",
      abilityId: "gbahali-break",
    });
    expect(s.run?.encounter?.broken).toEqual([true, true, true, true]);
    expect(s.cards["gb-1"]?.zone).toBe("runner:heap");
    const broke = at(s.log, "Gbahali — break last subroutine (index 3)");
    expect(gained).toBeLessThan(broke);
  });


  it("drops Ashigaru's last subroutines when Utopia Shard shrinks HQ (CR 9.8.3d.ex2)", () => {
    let s = createInitialState();
    const ash = instantiateCard("ashigaru", "ash-1", "server:hq:ice");
    ash.rezzed = true;
    ash.faceup = true;
    const utopia = instantiateCard("utopia-shard", "utopia-1", "runner:installed");
    s.cards["ash-1"] = ash;
    s.cards["utopia-1"] = utopia;
    s.servers.hq.ice = ["ash-1"];
    s.runner.installed = ["utopia-1"];
    const hand = s.corp.deck.splice(0, 3);
    s.corp.hand = hand;
    for (const id of hand) {
      const held = s.cards[id];
      if (held) held.zone = "corp:hq";
    }
    s.activeSide = "runner";
    s.timingKey = "run.approachIce";
    s.run = {
      attackedServerId: "hq",
      phase: "approach_ice",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };

    for (let i = 0; i < 12; i++) {
      autoWalk(s);
      if (
        s.timingKey === "run.encounterPaw" &&
        (s.cards["ash-1"]?.subroutines?.length ?? 0) === 3
      ) {
        break;
      }
      const passed = applyAction(s, { type: "pass_window" });
      if (!passed.ok) break;
      s = passed.state;
    }

    expect(s.cards["ash-1"]?.subroutines).toHaveLength(3);
    s.run!.encounter!.broken = [true, false, false];

    s = must(s, {
      type: "use_paid_ability",
      cardId: "utopia-1",
      abilityId: "utopia-discard",
    });
    expect(s.corp.hand).toHaveLength(1);
    expect(s.cards["ash-1"]?.subroutines).toHaveLength(1);
    expect(s.cards["ash-1"]?.subroutines?.[0]?.id).toBe("ashigaru-hq-etr-0");
    expect(s.run?.encounter?.broken).toEqual([true]);
    expect(s.log.join("\n")).toContain(
      `loses 2 subroutine(s) from the last (CR ${CR.subroutineOriginStaticAfter.number})`,
    );
  });


  it("orders Brainstorm's core-damage subroutines after Marker's earlier one (CR 9.8.3e.ex1)", () => {
    let s = createInitialState();
    const marker = instantiateCard("marker", "mk-1", "server:hq:ice");
    marker.rezzed = true;
    marker.faceup = true;
    const brainstorm = instantiateCard("brainstorm", "bs-1", "server:hq:ice");
    brainstorm.rezzed = true;
    brainstorm.faceup = true;
    s.cards["mk-1"] = marker;
    s.cards["bs-1"] = brainstorm;
    s.servers.hq.ice = ["mk-1", "bs-1"];
    s.activeSide = "runner";
    s.timingKey = "run.approachIce";
    s.run = {
      attackedServerId: "hq",
      phase: "approach_ice",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };

    for (let i = 0; i < 24; i++) {
      autoWalk(s);
      if (s.log.some((line) => line.includes("Encounter Brainstorm"))) break;
      const passed = applyAction(s, { type: "pass_window" });
      if (!passed.ok) break;
      s = passed.state;
    }

    const fromMarker = at(
      s.log,
      'Brainstorm gains "End the run." after its other subroutines',
    );
    const fromBrainstorm = at(
      s.log,
      'Brainstorm gains 1 "Do 1 core damage." subroutine(s) after the others',
    );
    expect(fromMarker).toBeLessThan(fromBrainstorm);
    expect(s.log[fromMarker]).toContain(CR.subroutineOriginExternalAfter.number);
    expect(s.log[fromBrainstorm]).toContain(
      CR.subroutineOriginExternalAfter.number,
    );
    expect(s.cards["bs-1"]?.subroutines?.map((sub) => sub.text)).toEqual([
      "End the run.",
      "Do 1 core damage.",
    ]);
    expect(s.cards["bs-1"]?.subroutines?.map((sub) => sub.id)).toEqual([
      "brainstorm-marker-etr",
      "brainstorm-core-0",
    ]);
    expect(s.run?.encounter?.broken).toEqual([false, false]);
    expect(s.run?.markerExtraEtrNextIce).toBe(false);
  });


  it("lets Grappling Hook leave a chosen subroutine, including one already broken (CR 9.8.6b.ex1)", () => {
    let s = createInitialState();
    const heimdall = instantiateCard("heimdall-1-0", "hd-1", "server:hq:ice");
    heimdall.rezzed = true;
    heimdall.faceup = true;
    const first = instantiateCard("grappling-hook", "gh-1", "runner:installed");
    const second = instantiateCard("grappling-hook", "gh-2", "runner:installed");
    s.cards["hd-1"] = heimdall;
    s.cards["gh-1"] = first;
    s.cards["gh-2"] = second;
    s.servers.hq.ice = ["hd-1"];
    s.runner.installed = ["gh-1", "gh-2"];
    s.activeSide = "runner";
    s.timingKey = "run.approachIce";
    s.run = {
      attackedServerId: "hq",
      phase: "approach_ice",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };

    for (let i = 0; i < 16; i++) {
      autoWalk(s);
      if (
        s.timingKey === "run.encounterPaw" &&
        (s.cards["hd-1"]?.subroutines?.length ?? 0) === 3
      ) {
        break;
      }
      const passed = applyAction(s, { type: "pass_window" });
      if (!passed.ok) break;
      s = passed.state;
    }

    s = must(s, {
      type: "use_paid_ability",
      cardId: "gh-1",
      abilityId: "grappling-break",
    });
    expect(s.pendingChoice?.options.map((option) => option.id)).toEqual([
      "spare-sub:0",
      "spare-sub:1",
      "spare-sub:2",
    ]);
    s = must(s, { type: "choose_option", optionId: "spare-sub:0" });
    const firstLeave = at(
      s.log,
      'Heimdall 1.0 leaves "Do 1 core damage." and breaks 2 unbroken subroutine(s)',
    );
    expect(s.log[firstLeave]).toContain(CR.breakAllButChosenSubroutine.number);
    expect(s.run?.encounter?.broken).toEqual([false, true, true]);
    expect(s.cards["gh-1"]?.zone).toBe("runner:heap");

    s = must(s, {
      type: "use_paid_ability",
      cardId: "gh-2",
      abilityId: "grappling-break",
    });
    expect(s.pendingChoice?.options.map((option) => option.id)).toEqual([
      "spare-sub:0",
      "spare-sub:1",
      "spare-sub:2",
    ]);
    s = must(s, { type: "choose_option", optionId: "spare-sub:1" });
    const secondLeave = at(
      s.log,
      'Heimdall 1.0 leaves "End the run." and breaks 1 unbroken subroutine(s)',
    );
    expect(firstLeave).toBeLessThan(secondLeave);
    expect(s.log[secondLeave]).toContain(CR.breakAllButChosenSubroutine.number);
    expect(s.run?.encounter?.broken).toEqual([true, true, true]);
    expect(s.cards["gh-2"]?.zone).toBe("runner:heap");
  });


    it("stops Little Engine's later subroutines after the first ends the run (CR 9.8.7c.ex1)", () => {
    let s = createInitialState();
    const ice = instantiateCard("little-engine", "le-1", "server:hq:ice");
    ice.rezzed = true;
    ice.faceup = true;
    s.cards["le-1"] = ice;
    s.servers.hq.ice = ["le-1"];
    s.runner.credits = 0;
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    enterStep(s, "run.encounter");
    autoWalk(s);
    let guard = 0;
    while (s.run && guard++ < 6) {
      const passed = applyAction(s, { type: "pass_window" });
      if (!passed.ok) break;
      s = passed.state;
    }
    expect(s.runner.credits).toBe(0);
    expect(s.run).toBeNull();
    expect(s.log.filter((line) => line.startsWith("Resolve subroutine"))).toEqual([
      'Resolve subroutine "End the run." (appendix 11.4_3_c_i / CR 6.5.5).',
    ]);
  });


  it("counts Gantulga's replacements as Bloop's resolved subroutines for Persephone (CR 9.8.9.ex1)", () => {
    let s = createInitialState();
    const bloop = instantiateCard("bloop", "bloop-1", "server:hq:ice");
    bloop.rezzed = true;
    bloop.faceup = true;
    const gantulga = instantiateCard(
      "tsakhia-bankhar-gantulga",
      "gan-1",
      "runner:installed",
    );
    gantulga.namedServerId = "hq";
    const persephone = instantiateCard("persephone", "per-1", "runner:installed");
    s.cards["bloop-1"] = bloop;
    s.cards["gan-1"] = gantulga;
    s.cards["per-1"] = persephone;
    s.servers.hq.ice = ["bloop-1"];
    s.runner.installed = ["gan-1", "per-1"];
    const grip = s.runner.deck.splice(0, 2);
    for (const id of grip) {
      const held = s.cards[id];
      if (held) held.zone = "runner:grip";
    }
    s.runner.hand = [...s.runner.hand, ...grip];
    const stackBefore = s.runner.deck.length;
    const rdBefore = s.corp.deck.length;
    s.activeSide = "runner";
    s.timingKey = "run.approachIce";
    s.run = {
      attackedServerId: "hq",
      phase: "approach_ice",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };

    for (let i = 0; i < 40; i++) {
      autoWalk(s);
      if (s.pendingChoice?.options.some((option) => option.id === "accept")) break;
      if (s.pendingDamage) {
        s = must(s, { type: "accept_damage" });
        continue;
      }
      const passed = applyAction(s, { type: "pass_window" });
      if (!passed.ok) break;
      s = passed.state;
    }

    const replaced = s.log.filter((line) =>
      line.includes('as "Do 1 net damage." from Bloop'),
    );
    expect(replaced).toHaveLength(3);
    expect(replaced[0]).toContain(CR.replaceSubroutineResolution.number);
    expect(s.pendingChoice?.options.map((option) => option.id)).toEqual([
      "accept",
      "decline",
    ]);
    expect(s.pendingChoice?.options[0]?.label).toContain("trash 3 from R&D");
    s = must(s, { type: "choose_option", optionId: "accept" });
    expect(s.runner.deck).toHaveLength(stackBefore - 1);
    expect(s.corp.deck).toHaveLength(rdBefore - 3);
  });


    it("treats Process Automation's gain and draw as the expected effects (CR 9.9.2.ex1)", () => {
    const s = createInitialState();
    const event = instantiateCard("process-automation", "pa-1", "runner:grip");
    s.cards["pa-1"] = event;
    s.runner.hand = ["pa-1"];
    s.runner.clicks = 1;
    s.runner.credits = 5;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    const deckBefore = s.runner.deck.length;

    const played = must(s, { type: "play_event", cardId: "pa-1" });
    expect(played.runner.credits).toBe(7);
    expect(played.runner.hand).toHaveLength(1);
    expect(played.runner.deck).toHaveLength(deckBefore - 1);
    expect(played.cards["pa-1"]?.zone).toBe("runner:heap");
    expect(played.log.join("\n")).not.toContain("not an expected effect");
  });


  it("drops Process Automation's draw from the expected effects after Lockdown (CR 9.9.2.ex2)", () => {
    let s = createInitialState();
    const lockdown = instantiateCard("lockdown", "ld-1", "server:hq:ice");
    lockdown.rezzed = true;
    lockdown.faceup = true;
    const event = instantiateCard("process-automation", "pa-1", "runner:grip");
    s.cards["ld-1"] = lockdown;
    s.cards["pa-1"] = event;
    s.servers.hq.ice = ["ld-1"];
    s.runner.hand = ["pa-1"];
    s.runner.clicks = 1;
    s.runner.credits = 5;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    const deckBefore = s.runner.deck.length;

    const resolved = evalEffect(
      { state: s, sourceId: "ld-1" },
      lockdown.subroutines![0]!.effect,
    );
    expect(resolved.ok).toBe(true);
    expect(s.turn.ccRunnerCannotDraw).toBe(true);

    s = must(s, { type: "play_event", cardId: "pa-1" });
    const dropped = at(
      s.log,
      "The draw is not an expected effect — the Runner cannot draw cards",
    );
    expect(s.log[dropped]).toContain(CR.expectedEffects.number);
    expect(s.runner.credits).toBe(7);
    expect(s.runner.hand).toHaveLength(0);
    expect(s.runner.deck).toHaveLength(deckBefore);
    expect(s.cards["pa-1"]?.zone).toBe("runner:heap");
  });


  it("interrupts an imminent draw with The Class Act before cards are drawn (CR 9.9.3d.ex1)", () => {
    const s = createInitialState();
    const act = instantiateCard("the-class-act", "act-1", "runner:installed");
    s.cards["act-1"] = act;
    s.runner.installed = ["act-1"];
    for (const id of ["a", "b", "c"]) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:stack");
      s.cards[id]!.title = id.toUpperCase();
    }
    s.runner.deck = ["a", "b", "c"];
    s.runner.hand = [];
    const drew = evalEffect(
      { state: s, sourceId: "act-1" },
      fx.do({ kind: "draw", side: "runner", amount: 1 }),
    );
    expect(drew.ok).toBe(true);
    expect(s.runner.hand).toEqual([]);
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "class-act-bottom:a",
      "class-act-bottom:b",
    ]);
    const next = must(s, { type: "choose_option", optionId: "class-act-bottom:a" });
    expect(next.runner.hand).toEqual(["b"]);
    expect(next.runner.deck.at(-1)).toBe("a");
  });


  it("keeps Harbinger's interrupt pending but irrelevant after Sacrificial Construct (CR 9.9.4c.ex1)", () => {
    let s = createInitialState();
    const harbinger = instantiateCard("harbinger", "hb-1", "runner:installed");
    const construct = instantiateCard(
      "sacrificial-construct",
      "sc-1",
      "runner:installed",
    );
    expect(harbinger.turnFacedownInsteadOfHeapWhenTrashed).toBe(true);
    s.cards["hb-1"] = harbinger;
    s.cards["sc-1"] = construct;
    s.runner.installed.push("hb-1", "sc-1");

    moveRunnerCardToHeap(s, "hb-1");
    expect(s.pendingTrashPrevent?.pendingInterruptIds).toEqual(["hb-1"]);
    expect(s.cards["hb-1"]?.zone).toBe("runner:installed");
    const offered = legalActions(s);
    expect(
      offered.some(
        (action) =>
          action.type === "trigger_pending_trash_interrupt" &&
          action.cardId === "hb-1",
      ),
    ).toBe(true);
    expect(
      offered.some(
        (action) =>
          action.type === "use_paid_ability" &&
          action.abilityId === "sacrificial-prevent-trash",
      ),
    ).toBe(true);

    s = must(s, {
      type: "use_paid_ability",
      cardId: "sc-1",
      abilityId: "sacrificial-prevent-trash",
    });
    const irrelevant = at(
      s.log,
      "Harbinger's interrupt is still pending but is no longer relevant",
    );
    expect(s.log[irrelevant]).toContain(
      CR.conditionalInterruptStillRelevant.number,
    );
    expect(s.pendingTrashPrevent?.pendingInterruptIds).toEqual(["hb-1"]);
    expect(s.pendingTrashPrevent?.trashExpected).toBe(false);
    expect(s.cards["hb-1"]?.zone).toBe("runner:installed");
    expect(s.cards["hb-1"]?.faceup).toBe(true);
    expect(s.cards["sc-1"]?.zone).toBe("runner:heap");
    expect(
      legalActions(s).some(
        (action) => action.type === "trigger_pending_trash_interrupt",
      ),
    ).toBe(false);

    const refused = applyAction(s, {
      type: "trigger_pending_trash_interrupt",
      cardId: "hb-1",
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.cites).toContainEqual(CR.conditionalInterruptStillRelevant);
    }

    s = must(s, { type: "accept_installed_trash" });
    expect(s.pendingTrashPrevent).toBeNull();
    expect(s.cards["hb-1"]?.zone).toBe("runner:installed");
    expect(s.cards["hb-1"]?.faceup).toBe(true);
  });


  it("does not let No One Home fire when it was installed during the tag window (CR 9.9.4c.ex2)", () => {
    let s = createInitialState();
    const decoy = instantiateCard("decoy", "decoy-1", "runner:installed");
    const gallery = instantiateCard(
      "thunder-art-gallery",
      "tag-1",
      "runner:installed",
    );
    const home = instantiateCard("no-one-home", "home-1", "runner:grip");
    s.cards["decoy-1"] = decoy;
    s.cards["tag-1"] = gallery;
    s.cards["home-1"] = home;
    s.runner.installed.push("decoy-1", "tag-1");
    s.runner.hand = ["home-1"];
    s.runner.credits = 5;

    const given = evalEffect(
      { state: s, sourceId: "corp-id" },
      { op: "do", action: { kind: "give_tags", amount: 2 } },
    );
    expect(given.ok).toBe(true);
    expect(s.pendingTags?.remaining).toBe(2);

    s = must(s, {
      type: "use_paid_ability",
      cardId: "decoy-1",
      abilityId: "decoy-prevent-tag",
    });
    s = must(s, { type: "choose_option", optionId: "install" });
    expect(s.runner.installed).toContain("home-1");
    expect(s.pendingTags?.remaining).toBe(1);
    expect(
      legalActions(s).some(
        (action) =>
          action.type === "use_paid_ability" && action.cardId === "home-1",
      ),
    ).toBe(false);

    const refused = applyAction(s, {
      type: "use_paid_ability",
      cardId: "home-1",
      abilityId: "no-one-home-tags",
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.cites).toContainEqual(CR.conditionalInterruptStillRelevant);
      expect(refused.error).toContain("was not active when the interrupt window opened");
    }
    expect(s.pendingTags?.remaining).toBe(1);
    expect(s.cards["home-1"]?.zone).toBe("runner:installed");
  });


  it("lets a Decoy installed during the tag window avoid the other tag (CR 9.9.4d.ex1)", () => {
    let s = createInitialState();
    const decoy = instantiateCard("decoy", "decoy-1", "runner:installed");
    const gallery = instantiateCard(
      "thunder-art-gallery",
      "tag-1",
      "runner:installed",
    );
    const second = instantiateCard("decoy", "decoy-2", "runner:grip");
    s.cards["decoy-1"] = decoy;
    s.cards["tag-1"] = gallery;
    s.cards["decoy-2"] = second;
    s.runner.installed.push("decoy-1", "tag-1");
    s.runner.hand = ["decoy-2"];
    s.runner.credits = 5;

    const given = evalEffect(
      { state: s, sourceId: "corp-id" },
      { op: "do", action: { kind: "give_tags", amount: 2 } },
    );
    expect(given.ok).toBe(true);
    expect(s.pendingTags?.remaining).toBe(2);

    s = must(s, {
      type: "use_paid_ability",
      cardId: "decoy-1",
      abilityId: "decoy-prevent-tag",
    });
    expect(s.pendingTags?.remaining).toBe(1);
    expect(s.pendingChoice?.options.map((option) => option.id)).toEqual([
      "install",
      "decline",
    ]);

    s = must(s, { type: "choose_option", optionId: "install" });
    expect(s.runner.installed).toContain("decoy-2");
    expect(s.pendingTags?.remaining).toBe(1);
    expect(
      legalActions(s).some(
        (action) =>
          action.type === "use_paid_ability" && action.cardId === "decoy-2",
      ),
    ).toBe(true);

    s = must(s, {
      type: "use_paid_ability",
      cardId: "decoy-2",
      abilityId: "decoy-prevent-tag",
    });
    const used = at(
      s.log,
      "Decoy was not active when the interrupt window opened",
    );
    expect(s.log[used]).toContain(CR.paidInterruptNeedNotBeActiveAtOpen.number);
    expect(s.pendingTags).toBeNull();
    expect(s.runner.tags).toBe(0);
    expect(s.cards["decoy-1"]?.zone).toBe("runner:heap");
    expect(s.cards["decoy-2"]?.zone).toBe("runner:heap");
  });


  it("counts prevented net damage as Tori Hanzō's first would (CR 9.9.5a.ex1)", () => {
    let s = createInitialState();
    const tori = instantiateCard("tori-hanzo", "tori-1", "server:hq:root");
    tori.rezzed = true;
    tori.faceup = true;
    const filter = instantiateCard("feedback-filter", "ff-1", "runner:installed");
    s.cards["tori-1"] = tori;
    s.cards["ff-1"] = filter;
    s.servers.hq.root.push("tori-1");
    s.runner.installed.push("ff-1");
    s.corp.credits = 5;
    s.runner.credits = 8;
    s.run = {
      attackedServerId: "hq",
      phase: "movement",
      position: null,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };

    const first = evalEffect(
      { state: s, sourceId: "corp-id" },
      { op: "do", action: { kind: "net_damage", amount: 1 } },
    );
    expect(first.ok).toBe(true);
    expect(s.run?.netDamageWould).toBe(1);
    expect(at(s.log, "Net damage would be dealt (1) this run")).toBeGreaterThanOrEqual(0);
    const firstOffers = legalActions(s);
    expect(
      firstOffers.some(
        (action) =>
          action.type === "use_paid_ability" && action.abilityId === "tori-first-net",
      ),
    ).toBe(true);
    expect(
      firstOffers.some(
        (action) =>
          action.type === "use_paid_ability" && action.abilityId === "ff-net",
      ),
    ).toBe(true);

    s = must(s, {
      type: "use_paid_ability",
      cardId: "ff-1",
      abilityId: "ff-net",
    });
    expect(s.pendingDamage?.remaining).toBe(0);
    s = must(s, { type: "accept_damage" });
    expect(s.pendingDamage).toBeNull();
    expect(s.runner.credits).toBe(5);

    const second = evalEffect(
      { state: s, sourceId: "corp-id" },
      { op: "do", action: { kind: "net_damage", amount: 1 } },
    );
    expect(second.ok).toBe(true);
    expect(s.run?.netDamageWould).toBe(2);
    const counted = at(s.log, "Net damage would be dealt (2) this run");
    expect(s.log[counted]).toContain(CR.ordinalWould.number);
    expect(
      legalActions(s).some(
        (action) =>
          action.type === "use_paid_ability" && action.abilityId === "tori-first-net",
      ),
    ).toBe(false);
    expect(s.pendingDamage?.type).toBe("net");
  });


    it("lets Patchwork modify a play cost (CR 9.9.6c.ex1)", () => {
    const s = createInitialState();
    const patch = instantiateCard("patchwork", "pw-1", "runner:installed");
    const gamble = instantiateCard("sure-gamble", "sg-1", "runner:grip");
    const fodder = instantiateCard("sure-gamble", "sg-2", "runner:grip");
    s.cards["pw-1"] = patch;
    s.cards["sg-1"] = gamble;
    s.cards["sg-2"] = fodder;
    s.runner.installed = ["pw-1"];
    s.runner.hand = ["sg-1", "sg-2"];
    s.runner.clicks = 1;
    s.runner.credits = 5;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    const played = must(s, {
      type: "play_event",
      cardId: "sg-1",
      trashGripForDiscountCardId: "sg-2",
    });
    expect(played.runner.credits).toBe(11);
    expect(played.cards["sg-2"]?.zone).toBe("runner:heap");
    expect(played.turn.patchworkDiscountUsedThisTurn).toBe(true);
    expect(played.log.join("\n")).toContain(CR.modifiableValueCost.number);
  });


  it("keeps meat damage imminent below zero so The Cleaners can raise it (CR 9.9.7a.ex1)", () => {
    let s = createInitialState();
    const stone = instantiateCard("mr-stone", "stone-1", "server:hq:root");
    stone.rezzed = true;
    stone.faceup = true;
    const spoof = instantiateCard(
      "biometric-spoofing",
      "spoof-1",
      "runner:installed",
    );
    const addOne = {
      id: "cleaners-add",
      label: "Do 1 additional meat damage",
      clickCost: 0,
      creditCost: 0,
      windows: ["damage_interrupt" as const],
      requirePendingDamageTypes: ["meat" as const],
      effect: {
        op: "do" as const,
        action: { kind: "add_pending_damage" as const, amount: 1 },
      },
    };
    const cleanersA = instantiateCard("the-cleaners", "cl-1", "corp:score");
    const cleanersB = instantiateCard("the-cleaners", "cl-2", "corp:score");
    cleanersA.whileScoredMeatDamageIncrease = undefined;
    cleanersB.whileScoredMeatDamageIncrease = undefined;
    cleanersA.paidAbilities = [{ ...addOne }];
    cleanersB.paidAbilities = [{ ...addOne, effect: structuredClone(addOne.effect) }];
    s.cards["stone-1"] = stone;
    s.cards["spoof-1"] = spoof;
    s.cards["cl-1"] = cleanersA;
    s.cards["cl-2"] = cleanersB;
    s.servers.hq.root.push("stone-1");
    s.runner.installed = ["spoof-1"];
    s.corp.scoreArea = ["cl-1", "cl-2"];
    s.runner.hand = [];
    for (const id of ["g1", "g2"]) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }

    const tagged = evalEffect(
      { state: s, sourceId: "corp-id" },
      { op: "do", action: { kind: "give_tags", amount: 1 } },
    );
    expect(tagged.ok).toBe(true);
    expect(s.runner.tags).toBe(1);
    expect(s.pendingDamage).toMatchObject({
      type: "meat",
      remaining: 1,
      sourceId: "stone-1",
    });

    s = must(s, {
      type: "use_paid_ability",
      cardId: "spoof-1",
      abilityId: "biometric-spoofing-prevent",
    });
    const below = at(s.log, "Expected meat damage is -1");
    expect(s.log[below]).toContain(CR.negativeDamageValue.number);
    expect(s.pendingDamage?.remaining).toBe(-1);
    expect(s.runner.hand).toHaveLength(2);
    expect(s.cards["spoof-1"]?.zone).toBe("runner:heap");

    s = must(s, {
      type: "use_paid_ability",
      cardId: "cl-1",
      abilityId: "cleaners-add",
    });
    expect(s.pendingDamage?.remaining).toBe(0);
    s = must(s, {
      type: "use_paid_ability",
      cardId: "cl-2",
      abilityId: "cleaners-add",
    });
    expect(s.pendingDamage?.remaining).toBe(1);

    s = must(s, { type: "accept_damage" });
    expect(s.pendingDamage).toBeNull();
    expect(s.runner.hand).toHaveLength(1);
  });


  it("removes Net-Ready Eyes' install damage before The Cleaners can add to it (CR 9.9.7b.ex1)", () => {
    let s = createInitialState();
    const parlor = instantiateCard("chrome-parlor", "parlor-1", "runner:installed");
    const eyes = instantiateCard("net-ready-eyes", "eyes-1", "runner:grip");
    const cleaners = instantiateCard("the-cleaners", "cl-1", "corp:score");
    cleaners.paidAbilities = [
      {
        id: "cleaners-add",
        label: "Do 1 additional meat damage",
        clickCost: 0,
        creditCost: 0,
        windows: ["damage_interrupt"],
        requirePendingDamageTypes: ["meat"],
        effect: {
          op: "do",
          action: { kind: "add_pending_damage", amount: 1 },
        },
      },
    ];
    s.cards["parlor-1"] = parlor;
    s.cards["eyes-1"] = eyes;
    s.cards["cl-1"] = cleaners;
    s.runner.installed = ["parlor-1"];
    s.corp.scoreArea = ["cl-1"];
    s.runner.hand = ["eyes-1", "g1", "g2"];
    for (const id of ["g1", "g2"]) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    }
    s.runner.clicks = 1;
    s.runner.credits = 5;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, {
      type: "basic_install",
      cardId: "eyes-1",
      destination: { kind: "installed" },
    });
    const prevented = at(
      s.log,
      "Chrome Parlor — prevent all 2 meat damage from the cybernetic install",
    );
    expect(s.log[prevented]).toContain(CR.preventAllDamage.number);
    expect(s.log.join("\n")).not.toContain("Meat damage increased");
    expect(s.pendingDamage).toBeNull();
    expect(s.runner.installed).toEqual(["parlor-1", "eyes-1"]);
    expect(s.runner.hand).toEqual(["g1", "g2"]);
    expect(
      legalActions(s).some(
        (action) =>
          action.type === "use_paid_ability" && action.abilityId === "cleaners-add",
      ),
    ).toBe(false);
  });


  it("skips Breached Dome's damage when prevention takes the amount below zero (CR 9.9.7d.ex1)", () => {
    let s = createInitialState();
    const dome = instantiateCard("breached-dome", "dome-1", "server:hq:root");
    dome.rezzed = true;
    dome.faceup = true;
    const spoof = instantiateCard(
      "biometric-spoofing",
      "spoof-1",
      "runner:installed",
    );
    s.cards["dome-1"] = dome;
    s.cards["spoof-1"] = spoof;
    s.servers.hq.root = ["dome-1"];
    s.runner.installed = ["spoof-1"];
    s.runner.credits = 5;
    const grip = [...s.runner.hand];
    const top = s.runner.deck[0];
    expect(dome.onAccess).toBeDefined();

    const accessed = evalEffect(
      { state: s, sourceId: "dome-1" },
      dome.onAccess!,
    );
    expect(accessed.ok).toBe(true);
    expect(s.pendingDamage).toMatchObject({ type: "meat", remaining: 1 });

    s = must(s, {
      type: "use_paid_ability",
      cardId: "spoof-1",
      abilityId: "biometric-spoofing-prevent",
    });
    expect(s.pendingDamage?.remaining).toBe(-1);
    s = must(s, { type: "accept_damage" });
    expect(s.pendingDamage).toBeNull();
    expect(s.runner.hand).toEqual(grip);
    expect(s.runner.deck[0]).not.toBe(top);
    expect(s.runner.discardPile).toContain(top);
    expect(s.log.join("\n")).toContain(CR.negativeDamageResolution.number);
    expect(s.log.join("\n")).toContain("trash top of stack");
  });


    it("keeps Flare's meat damage unpreventable after The Cleaners adds 1 (CR 9.9.7e.ex1)", () => {
    const s = createInitialState();
    const cleaners = instantiateCard("the-cleaners", "cl-1", "corp:score");
    const pap = instantiateCard("paparazzi", "pap-1", "runner:installed");
    const flare = instantiateCard("flare", "flare-1", "server:hq:ice");
    flare.rezzed = true;
    flare.faceup = true;
    s.cards["cl-1"] = cleaners;
    s.cards["pap-1"] = pap;
    s.cards["flare-1"] = flare;
    s.corp.scoreArea = ["cl-1"];
    s.runner.installed = ["pap-1"];
    s.runner.hand = [];
    s.runner.link = 0;
    s.corp.credits = 0;
    for (const id of ["g1", "g2", "g3"]) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: { iceId: "flare-1", broken: [false] },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    const sub = flare.subroutines?.[0]?.effect;
    if (!sub) throw new Error("Flare subroutine missing");
    const traced = evalEffect({ state: s, sourceId: "flare-1" }, sub);
    expect(traced.ok).toBe(true);
    expect(s.log.join("\n")).toContain("Meat damage increased by 1");
    expect(s.log.join("\n")).toContain("3 meat damage from flare-1 cannot be prevented");
    expect(s.runner.hand).toEqual([]);
    expect(s.runner.installed).toContain("pap-1");
    expect(s.log.join("\n")).not.toContain("Paparazzi — prevent");
    expect(s.run?.endedTheRun).toBe(true);
  });


  it("does not make Guru Davinder pay when the damage is already 0 (CR 9.9.7f.ex1)", () => {
    let s = createInitialState();
    const ang = instantiateCard(
      "angelique-garza-correa",
      "ang-1",
      "server:hq:root",
    );
    ang.rezzed = true;
    ang.faceup = true;
    const plascrete = instantiateCard(
      "plascrete-carapace",
      "plas-1",
      "runner:installed",
    );
    plascrete.powerCounters = 4;
    const guru = instantiateCard("guru-davinder", "guru-1", "runner:installed");
    const cleaners = instantiateCard("the-cleaners", "cl-1", "corp:score");
    cleaners.whileScoredMeatDamageIncrease = undefined;
    cleaners.paidAbilities = [
      {
        id: "cleaners-add",
        label: "Do 1 additional meat damage",
        clickCost: 0,
        creditCost: 0,
        windows: ["damage_interrupt"],
        requirePendingDamageTypes: ["meat"],
        effect: {
          op: "do",
          action: { kind: "add_pending_damage", amount: 1 },
        },
      },
    ];
    s.cards["ang-1"] = ang;
    s.cards["plas-1"] = plascrete;
    s.cards["guru-1"] = guru;
    s.cards["cl-1"] = cleaners;
    s.servers.hq.root.push("ang-1");
    s.runner.installed = ["plas-1", "guru-1"];
    s.corp.scoreArea = ["cl-1"];
    s.corp.credits = 5;
    s.runner.credits = 5;
    s.runner.hand = ["g1", "g2"];
    for (const id of ["g1", "g2"]) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    }

    const accessed = evalEffect(
      { state: s, sourceId: "ang-1" },
      ang.onAccess!,
    );
    expect(accessed.ok).toBe(true);
    s = must(s, { type: "choose_option", optionId: "pay" });
    expect(s.corp.credits).toBe(3);
    expect(s.pendingDamage).toMatchObject({ type: "meat", remaining: 2 });

    s = must(s, {
      type: "use_paid_ability",
      cardId: "plas-1",
      abilityId: "plascrete-prevent-meat",
    });
    s = must(s, {
      type: "use_paid_ability",
      cardId: "plas-1",
      abilityId: "plascrete-prevent-meat",
    });
    expect(s.pendingDamage?.remaining).toBe(0);

    s = must(s, {
      type: "use_paid_ability",
      cardId: "guru-1",
      abilityId: "guru-prevent-all",
    });
    const skipped = at(s.log, "Guru Davinder prevented 0 damage");
    expect(s.log[skipped]).toContain(CR.preventOneOrMore.number);
    expect(s.pendingDamage).toBeNull();
    expect(s.pendingChoice).toBeNull();
    expect(s.runner.installed).toContain("guru-1");
    expect(s.runner.credits).toBe(5);
    expect(s.runner.hand).toEqual(["g1", "g2"]);
    expect(
      legalActions(s).some(
        (action) =>
          action.type === "use_paid_ability" && action.abilityId === "cleaners-add",
      ),
    ).toBe(false);
  });


  it("ends Gebrselassie's replaced duration at the next checkpoint once it leaves the host (CR 9.9.9a.ex1)", () => {
    let s = createInitialState();
    const puffer = instantiateCard("puffer", "puf-1", "runner:installed");
    puffer.powerCounters = 1;
    puffer.paidAbilities = [
      ...(puffer.paidAbilities ?? []),
      {
        id: "puffer-pump",
        label: "2¢: +1 strength",
        clickCost: 0,
        creditCost: 2,
        cost: { credits: 2 },
        windows: ["encounter_paw"],
        effect: {
          op: "do",
          action: { kind: "pump_strength", amount: 1 },
        },
      },
    ];
    const geb = instantiateCard("gebrselassie", "geb-1", "runner:installed");
    geb.hostId = "puf-1";
    s.cards["puf-1"] = puffer;
    s.cards["geb-1"] = geb;
    s.runner.installed = ["puf-1", "geb-1"];
    s.runner.credits = 5;
    s.activeSide = "runner";
    s.timingKey = "run.encounterPaw";
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: { iceId: "none", broken: [] },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    s = must(s, {
      type: "use_paid_ability",
      cardId: "puf-1",
      abilityId: "puffer-pump",
    });
    expect(breakerStrength(s, "puf-1")).toBe(4);
    s.run = null;
    expect(breakerStrength(s, "puf-1")).toBe(4);

    moveRunnerCardToHeap(s, "geb-1");
    expect(breakerStrength(s, "puf-1")).toBe(4);
    expect(s.log.join("\n")).toContain(CR.replacementStaticMustRemainActive.number);

    occurCheckpoint(s, "timing", "after Gebrselassie leaves", [
      CR.checkpointDurationAbilities,
    ], "test");
    expect(breakerStrength(s, "puf-1")).toBe(3);
    expect(s.turn.breakerStrengthBoostsThisTurn["puf-1"]).toBeUndefined();
  });


  it("Vacheron steal once (CR 9.9.9c.ex1)", () => {
    expect(getCardDef("project-vacheron").vacheronStealReplacement).toBe(true);
  });


  it("replaces imminent net damage with core damage as Tori Hanzō resolves (CR 9.9.10.ex1)", () => {
    const s = createInitialState();
    const tori = instantiateCard("tori-hanzo", "tori-1", "server:hq:root");
    tori.rezzed = true;
    tori.faceup = true;
    const filter = instantiateCard("feedback-filter", "ff-1", "runner:installed");
    s.cards["tori-1"] = tori;
    s.cards["ff-1"] = filter;
    s.servers.hq.root.push("tori-1");
    s.runner.installed.push("ff-1");
    s.corp.credits = 5;
    s.runner.credits = 8;
    s.run = {
      attackedServerId: "hq",
      phase: "movement",
      position: null,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    const imminent = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      fx.do({ kind: "net_damage", amount: 1 }),
    );
    expect(imminent.ok).toBe(true);
    expect(s.pendingDamage?.type).toBe("net");
    const replaced = must(s, {
      type: "use_paid_ability",
      cardId: "tori-1",
      abilityId: "tori-first-net",
    });
    expect(replaced.pendingDamage?.type).toBe("core");
    expect(replaced.pendingDamage?.remaining).toBe(1);
    expect(
      legalActions(replaced).some(
        (action) =>
          action.type === "use_paid_ability" && action.abilityId === "ff-net",
      ),
    ).toBe(false);
  });


  it("applies only one breach replacement for Security Testing and Account Siphon (CR 9.9.11a.ex1)", () => {
    const s = createInitialState();
    const testing = instantiateCard(
      "security-testing",
      "st-1",
      "runner:installed",
    );
    testing.namedServerId = "hq";
    const siphon = instantiateCard(
      "account-siphon",
      "siphon-1",
      "runner:play-area",
    );
    s.cards["st-1"] = testing;
    s.cards["siphon-1"] = siphon;
    s.runner.installed = ["st-1"];
    s.runner.credits = 5;
    s.corp.credits = 5;
    s.run = {
      attackedServerId: "hq",
      phase: "success",
      position: null,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      runSourceId: "siphon-1",
      onSuccessfulRunEffect:
        siphon.runEvent?.onSuccessfulRun ?? siphon.onSuccessfulRun,
    };
    s.timingKey = "run.approachServerPaw";
    enterStep(s, "run.success");
    autoWalk(s);
    const prompted = at(s.log, "Choose which replacement applies to the breach");
    expect(s.log[prompted]).toContain(CR.replacementMustReplace.number);
    const chosen = must(s, {
      type: "choose_option",
      optionId: "replacement:security-testing",
    });
    expect(chosen.runner.credits).toBe(7);
    expect(chosen.runner.tags).toBe(0);
    expect(chosen.run).toBeNull();
    expect(chosen.pendingChoice).toBeNull();
    expect(chosen.cards["st-1"]!.namedServerId).toBeUndefined();

    const again = createInitialState();
    const testing2 = instantiateCard(
      "security-testing",
      "st-2",
      "runner:installed",
    );
    testing2.namedServerId = "hq";
    const siphon2 = instantiateCard(
      "account-siphon",
      "siphon-2",
      "runner:play-area",
    );
    again.cards["st-2"] = testing2;
    again.cards["siphon-2"] = siphon2;
    again.runner.installed = ["st-2"];
    again.runner.credits = 5;
    again.corp.credits = 5;
    again.run = {
      attackedServerId: "hq",
      phase: "success",
      position: null,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      runSourceId: "siphon-2",
      onSuccessfulRunEffect:
        siphon2.runEvent?.onSuccessfulRun ?? siphon2.onSuccessfulRun,
    };
    again.timingKey = "run.approachServerPaw";
    enterStep(again, "run.success");
    autoWalk(again);
    const siphoned = must(again, {
      type: "choose_option",
      optionId: "replacement:account-siphon",
    });
    const skipped = at(
      siphoned.log,
      "Security Testing's replacement has nothing to replace",
    );
    expect(siphoned.log[skipped]).toContain(CR.replacementMustReplace.number);
    const resolved = must(siphoned, {
      type: "choose_option",
      optionId: "siphon:0",
    });
    expect(resolved.runner.credits).toBe(5);
    expect(resolved.runner.tags).toBe(2);
    expect(resolved.run).toBeNull();
  });


  it("lets Showing Off keep the breach expected so Security Testing still replaces it (CR 9.9.11a.ex2)", () => {
    const s = createInitialState();
    const testing = instantiateCard(
      "security-testing",
      "st-1",
      "runner:installed",
    );
    testing.namedServerId = "rd";
    const showing = instantiateCard("showing-off", "show-1", "runner:play-area");
    s.cards["st-1"] = testing;
    s.cards["show-1"] = showing;
    s.runner.installed = ["st-1"];
    s.runner.credits = 5;
    s.run = {
      attackedServerId: "rd",
      phase: "success",
      position: null,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      accessFromBottomOfRd: true,
      runSourceId: "show-1",
    };
    s.timingKey = "run.approachServerPaw";
    enterStep(s, "run.success");
    autoWalk(s);
    const first = must(s, {
      type: "choose_option",
      optionId: "replacement:showing-off-first",
    });
    const still = at(first.log, "breaching R&D is still expected");
    expect(first.log[still]).toContain(CR.replacementMustReplace.number);
    expect(first.runner.credits).toBe(7);
    expect(first.run).toBeNull();

    const other = createInitialState();
    const testing2 = instantiateCard(
      "security-testing",
      "st-2",
      "runner:installed",
    );
    testing2.namedServerId = "rd";
    other.cards["st-2"] = testing2;
    other.runner.installed = ["st-2"];
    other.runner.credits = 5;
    other.run = {
      attackedServerId: "rd",
      phase: "success",
      position: null,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      accessFromBottomOfRd: true,
    };
    other.timingKey = "run.approachServerPaw";
    enterStep(other, "run.success");
    autoWalk(other);
    const testingFirst = must(other, {
      type: "choose_option",
      optionId: "replacement:security-testing-first",
    });
    const dropped = at(
      testingFirst.log,
      "Showing Off's replacement has nothing to replace",
    );
    expect(testingFirst.log[dropped]).toContain(CR.replacementMustReplace.number);
    expect(testingFirst.runner.credits).toBe(7);
    expect(testingFirst.run).toBeNull();
  });


  it("drops Pelangi's subtype when the encounter ends (CR 9.10.3a.ex1)", () => {
    const s = createInitialState();
    const ice = instantiateCard("ice-wall", "wall-1", "server:hq:ice");
    ice.rezzed = true;
    ice.faceup = true;
    const pelangi = instantiateCard("pelangi", "pelangi-1", "runner:installed");
    s.cards["wall-1"] = ice;
    s.cards["pelangi-1"] = pelangi;
    s.servers.hq.ice = ["wall-1"];
    s.runner.installed = ["pelangi-1"];
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: { iceId: "wall-1", broken: [] },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    const choosing = evalEffect(
      { state: s, sourceId: "pelangi-1" },
      fx.do({ kind: "choose_grant_encounter_ice_subtype" }),
    );
    if (!choosing.ok) throw new Error(choosing.error);
    const granted = must(s, { type: "choose_option", optionId: "pelangi:sentry" });
    expect(effectiveIceSubtypes(granted, "wall-1")).toContain("sentry");
    granted.run!.encounter = null;
    expect(effectiveIceSubtypes(granted, "wall-1")).not.toContain("sentry");
  });


    it("forgets Security Testing's server when the turn ends (CR 9.10.3b.ex1)", () => {
    const s = createInitialState();
    const testing = instantiateCard("security-testing", "st-1", "runner:installed");
    testing.namedServerId = "rd";
    s.cards["st-1"] = testing;
    s.runner.installed = ["st-1"];
    s.runner.credits = 5;
    onRunnerTurnEnds(s);
    expect(s.cards["st-1"]?.namedServerId).toBeUndefined();
    expect(s.log.join("\n")).toContain("9.10.3b");

    s.timingKey = "runner.startPaw";
    enterStep(s, "runner.turnBegins");
    autoWalk(s);
    expect(s.pendingChoice?.options.map((option) => option.id)).toContain("st-decline");
    const declined = must(s, { type: "choose_option", optionId: "st-decline" });
    expect(declined.cards["st-1"]?.namedServerId).toBeUndefined();

    declined.runner.credits = 5;
    declined.run = {
      attackedServerId: "rd",
      phase: "success",
      position: null,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    enterStep(declined, "run.success");
    autoWalk(declined);
    expect(declined.runner.credits).toBe(5);
    expect(declined.log.join("\n")).not.toContain("gain 2¢ instead");
  });


    it("remembers Femme Fatale's ice while Femme is active (CR 9.10.3c.ex1)", () => {
    let s = createInitialState();
    const ice = instantiateCard("rsvp", "rsvp-1", "server:hq:ice");
    ice.rezzed = true;
    ice.faceup = true;
    const femme = instantiateCard("femme-fatale", "ff-1", "runner:grip");
    s.cards["rsvp-1"] = ice;
    s.cards["ff-1"] = femme;
    s.servers.hq.ice = ["rsvp-1"];
    s.runner.hand = ["ff-1"];
    s.runner.credits = 10;
    s.runner.clicks = 1;
    runnerTurn(s);
    s = must(s, {
      type: "basic_install",
      cardId: "ff-1",
      destination: { kind: "installed" },
    });
    expect(s.pendingChoice?.options.map((o) => o.id)).toContain("chosen-ice:rsvp-1");
    s = must(s, { type: "choose_option", optionId: "chosen-ice:rsvp-1" });
    expect(s.cards["ff-1"]?.chosenIceId).toBe("rsvp-1");

    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    enterStep(s, "run.encounter");
    autoWalk(s);
    expect(s.pendingChoice?.options.map((o) => o.id)).toContain("bypass");
    s = must(s, { type: "choose_option", optionId: "decline" });
    expect(s.cards["ff-1"]?.chosenIceId).toBe("rsvp-1");

    s.runner.installed = s.runner.installed.filter((id) => id !== "ff-1");
    s.runner.discardPile.push("ff-1");
    s.cards["ff-1"]!.zone = "runner:heap";
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    enterStep(s, "run.encounter");
    autoWalk(s);
    const offered = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(offered).not.toContain("bypass");
  });


  it("keeps Na'Not'K's paid strength after the run when Gebrselassie hosts on it (CR 9.10.5.ex1)", () => {
    const s = createInitialState();
    const breaker = instantiateCard("nanotk", "nnk-1", "runner:installed");
    const geb = instantiateCard("gebrselassie", "geb-1", "runner:installed");
    geb.hostId = "nnk-1";
    s.cards["nnk-1"] = breaker;
    s.cards["geb-1"] = geb;
    s.runner.installed = ["nnk-1", "geb-1"];
    for (const id of ["ice-a", "ice-b", "ice-c"]) {
      s.cards[id] = instantiateCard("ice-wall", id, "server:hq:ice");
    }
    s.servers.hq.ice = ["ice-a", "ice-b", "ice-c"];
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: { iceId: "ice-a", broken: [] },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    const pumped = evalEffect(
      { state: s, sourceId: "nnk-1" },
      fx.do({ kind: "pump_strength", amount: 2 }),
    );
    if (!pumped.ok) throw new Error(pumped.error);
    expect(breakerStrength(s, "nnk-1")).toBe(6);
    s.run = null;
    expect(breakerStrength(s, "nnk-1")).toBe(3);
    s.run = {
      attackedServerId: "hq",
      phase: "approach",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    s.servers.hq.ice = ["ice-a"];
    expect(breakerStrength(s, "nnk-1")).toBe(4);
  });


  it("offers Shipment from MirrorMorph as three separate installs (CR 9.11.4b.ex1)", () => {
    const s = createInitialState();
    const ship = instantiateCard(
      "shipment-from-mirrormorph",
      "ship-1",
      "corp:archives",
    );
    s.cards["ship-1"] = ship;
    for (const id of ["pad-1", "pad-2", "pad-3"]) {
      s.cards[id] = instantiateCard("pad-campaign", id, "corp:hq");
    }
    s.corp.hand = ["pad-1", "pad-2", "pad-3"];
    s.corp.credits = 0;
    const opened = evalEffect(
      { state: s, sourceId: "ship-1" },
      fx.do({ kind: "install_up_to_from_hq_paying_costs", max: 3 }),
    );
    expect(opened.ok).toBe(true);
    const first = must(s, {
      type: "choose_option",
      optionId: "hq-root:pad-1:new",
    });
    const text = first.log.join("\n");
    const installedAt = text.indexOf("Install PAD Campaign from HQ");
    const between = text.indexOf("Between instructions");
    const again = text.lastIndexOf("install up to 2 more from HQ");
    expect(installedAt).toBeGreaterThan(-1);
    expect(between).toBeGreaterThan(installedAt);
    expect(again).toBeGreaterThan(between);
    const stopped = must(first, {
      type: "choose_option",
      optionId: "done-hq-installs",
    });
    expect(stopped.pendingChoice).toBeNull();
    expect(stopped.servers["remote-1"]?.root).toEqual(["pad-1"]);
    expect(stopped.corp.hand).toEqual(["pad-2", "pad-3"]);
  });


  it("grants Tinkering's subtypes when the chosen ice's instruction resolves (CR 9.11.4c.ex1)", () => {
    const s = createInitialState();
    const event = instantiateCard("tinkering", "tink-1", "runner:grip");
    const ice = instantiateCard("ice-wall", "wall-1", "server:hq:ice");
    ice.rezzed = true;
    ice.faceup = true;
    s.cards["tink-1"] = event;
    s.cards["wall-1"] = ice;
    s.servers.hq.ice = ["wall-1"];
    s.runner.hand = ["tink-1"];
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    const played = must(s, { type: "play_event", cardId: "tink-1" });
    expect(played.pendingChoice?.options.map((o) => o.id)).toContain("tinker:wall-1");
    expect(effectiveIceSubtypes(played, "wall-1")).toEqual(["barrier"]);
    const granted = must(played, { type: "choose_option", optionId: "tinker:wall-1" });
    expect(effectiveIceSubtypes(granted, "wall-1")).toEqual(
      expect.arrayContaining(["barrier", "sentry", "code gate"]),
    );
    expect(granted.log.join("\n")).not.toContain("Between instructions");
  });


  it("trashes a grip card after Djinn's search and before Datasucker is added (CR 9.11.4d.ex1)", () => {
    const s = createInitialState();
    const djinn = instantiateCard("djinn", "djinn-1", "runner:installed");
    const profiles = instantiateCard(
      "personality-profiles",
      "pp-1",
      "corp:score",
    );
    const sucker = instantiateCard("datasucker", "ds-1", "runner:stack");
    const filler = instantiateCard("sure-gamble", "fill-1", "runner:stack");
    const grip = instantiateCard("sure-gamble", "grip-1", "runner:grip");
    grip.title = "Grip Card";
    s.cards["djinn-1"] = djinn;
    s.cards["pp-1"] = profiles;
    s.cards["ds-1"] = sucker;
    s.cards["fill-1"] = filler;
    s.cards["grip-1"] = grip;
    s.runner.installed = ["djinn-1"];
    s.runner.deck = ["ds-1", "fill-1"];
    s.runner.hand = ["grip-1"];
    s.runner.clicks = 1;
    s.runner.credits = 1;
    s.corp.scoreArea = ["pp-1"];
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    const searched = must(s, {
      type: "use_paid_ability",
      cardId: "djinn-1",
      abilityId: "djinn-search-virus",
    });
    const text = searched.log.join("\n");
    const aside = text.indexOf("Datasucker found and set aside");
    const shuffled = text.indexOf("Stack shuffled");
    const trashed = text.indexOf("Personality Profiles — Runner trashes Grip Card");
    const added = text.indexOf("add Datasucker to grip");
    expect(aside).toBeGreaterThan(-1);
    expect(shuffled).toBeGreaterThan(aside);
    expect(trashed).toBeGreaterThan(shuffled);
    expect(added).toBeGreaterThan(trashed);
    expect(searched.runner.hand).toEqual(["ds-1"]);
    expect(searched.runner.discardPile).toContain("grip-1");
  });


  it("ends Architect's look before the optional install, then closes the look (CR 9.11.4e.ex1)", () => {
    const s = createInitialState();
    const ice = instantiateCard("architect", "arch-1", "server:hq:ice");
    ice.rezzed = true;
    ice.faceup = true;
    s.cards["arch-1"] = ice;
    s.servers.hq.ice = ["arch-1"];
    for (const id of ["rd-1", "rd-2", "rd-3", "rd-4", "rd-5"]) {
      s.cards[id] = instantiateCard("pad-campaign", id, "corp:rd");
      s.cards[id]!.title = id;
    }
    s.corp.deck = ["rd-1", "rd-2", "rd-3", "rd-4", "rd-5"];
    const looked = evalEffect(
      { state: s, sourceId: "arch-1" },
      ice.subroutines![0]!.effect,
    );
    expect(looked.ok).toBe(true);
    const text = s.log.join("\n");
    const look = text.indexOf("Look R&D — rd-1");
    const between = text.indexOf("Between instructions");
    const offer = text.indexOf("May install and rez one looked R&D card");
    expect(look).toBeGreaterThan(-1);
    expect(between).toBeGreaterThan(look);
    expect(offer).toBeGreaterThan(between);
    const declined = must(s, { type: "choose_option", optionId: "decline" });
    expect(declined.turn.rdLookedCards).toEqual([]);
    expect(declined.corp.deck.slice(0, 5)).toEqual([
      "rd-1",
      "rd-2",
      "rd-3",
      "rd-4",
      "rd-5",
    ]);
    expect(declined.cards["rd-1"]?.faceup).toBe(false);
    expect(declined.pendingChoice).toBeNull();
  });


  it("makes Data Raven's chosen option imminent after the choice checkpoint (CR 9.11.4g.ex1)", () => {
    const s = createInitialState();
    const ice = instantiateCard("data-raven", "raven-1", "server:hq:ice");
    ice.rezzed = true;
    ice.faceup = true;
    s.cards["raven-1"] = ice;
    s.servers.hq.ice = ["raven-1"];
    s.run = {
      attackedServerId: "hq",
      phase: "movement",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    const offered = evalEffect(
      { state: s, sourceId: "raven-1" },
      ice.onEncounter!,
    );
    expect(offered.ok).toBe(true);
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "unless-pay",
      "unless-instruction",
    ]);
    const tagged = must(s, { type: "choose_option", optionId: "unless-pay" });
    const text = tagged.log.join("\n");
    const ended = text.indexOf("The choice ends this instruction");
    const between = text.indexOf("Between instructions");
    const tags = text.indexOf("Runner receives 1 tag");
    expect(ended).toBeGreaterThan(-1);
    expect(between).toBeGreaterThan(ended);
    expect(tags).toBeGreaterThan(between);
    expect(tagged.runner.tags).toBe(1);
    expect(tagged.run?.endedTheRun).toBe(false);
  });


  it("lets only the active player choose when Chronos Protocol and Titanium Ribs conflict (CR 9.12.1c.ex1)", () => {
    const board = (active: "corp" | "runner") => {
      const s = createInitialState();
      const identity = instantiateCard(
        "chronos-protocol-selective-mind-mapping",
        s.corp.identityId,
        "corp:identity",
      );
      const ribs = instantiateCard("titanium-ribs", "ribs-1", "runner:installed");
      const alpha = instantiateCard("sure-gamble", "alpha", "runner:grip");
      const beta = instantiateCard("sure-gamble", "beta", "runner:grip");
      alpha.title = "Alpha";
      beta.title = "Beta";
      s.cards[s.corp.identityId] = identity;
      s.cards["ribs-1"] = ribs;
      s.cards.alpha = alpha;
      s.cards.beta = beta;
      s.runner.installed = ["ribs-1"];
      s.runner.hand = ["alpha", "beta"];
      s.activeSide = active;
      const dealt = evalEffect(
        { state: s, sourceId: s.corp.identityId },
        fx.do({ kind: "net_damage", amount: 1 }),
      );
      expect(dealt.ok).toBe(true);
      expect(s.pendingChoice?.chooser).toBe(active);
      expect(s.log.join("\n")).toContain("Chronos Protocol — look at the grip");
      const corpView = getPublicView(s, "corp");
      expect(corpView.pendingChoice?.options.map((o) => o.label).join(" ")).toContain(
        "Alpha",
      );
      return s;
    };
    const corpTurn = board("corp");
    const corpPicked = must(corpTurn, {
      type: "choose_option",
      optionId: "chronos:alpha",
    });
    expect(corpPicked.runner.discardPile).toContain("alpha");
    const runnerTurn = board("runner");
    const runnerPicked = must(runnerTurn, {
      type: "choose_option",
      optionId: "chronos:beta",
    });
    expect(runnerPicked.runner.discardPile).toContain("beta");
    expect(runnerPicked.pendingChoice?.chooser).not.toBe("corp");
  });


  it("Hush blanks Mother Goddess before she gains bioroid, so Warden Fatuma skips her (CR 9.12.1e.ex1)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const goddess = instantiateCard("mother-goddess", "mg-1", "server:hq:ice");
    goddess.rezzed = true;
    goddess.faceup = true;
    const ansel = instantiateCard("ice-wall", "ansel-1", "server:rd:ice");
    ansel.rezzed = true;
    ansel.faceup = true;
    ansel.subtypes = ["barrier", "bioroid"];
    const warden = instantiateCard("warden-fatuma", "warden-1", "server:hq:root");
    warden.rezzed = true;
    warden.faceup = true;
    const hush = instantiateCard("hush", "hush-1", "runner:installed");
    hush.hostId = "mg-1";
    s.cards["mg-1"] = goddess;
    s.cards["ansel-1"] = ansel;
    s.cards["warden-1"] = warden;
    s.cards["hush-1"] = hush;
    s.servers.hq.ice = ["mg-1"];
    s.servers.hq.root = ["warden-1"];
    s.servers.rd.ice = ["ansel-1"];
    s.runner.installed = ["hush-1"];

    expect(abilitiesSuppressed(s, "mg-1")).toBe(true);
    expect(effectiveIceSubtypes(s, "mg-1")).not.toContain("bioroid");
    expect(effectiveIceSubtypes(s, "ansel-1")).toContain("bioroid");

    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: false,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    s.timingKey = "run.encounter";
    autoWalk(s);
    expect(
      s.cards["mg-1"]!.subroutines?.some((sub) =>
        sub.id.startsWith("warden-lose-click-"),
      ),
    ).toBe(false);

    s.run = {
      ...s.run!,
      attackedServerId: "rd",
      phase: "encounter",
      position: 0,
      encounter: null,
    };
    enterStep(s, "run.encounter");
    autoWalk(s);
    expect(
      s.cards["ansel-1"]!.subroutines?.some((sub) =>
        sub.id.startsWith("warden-lose-click-"),
      ),
    ).toBe(true);
  });


  it("Hush on Magnet: hosting loop → Hush blanks Magnet; Hush keeps abilities (CR 9.12.1e.ex2)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const magnet = instantiateCard("magnet", "mag-1", "server:hq:ice");
    magnet.rezzed = true;
    magnet.hostedProgramsLoseAbilities = true;
    s.cards["mag-1"] = magnet;
    s.servers.hq.ice = ["mag-1"];

    const hush = instantiateCard("hush", "hush-1", "runner:installed");
    hush.hostId = "mag-1";
    hush.blanksHostAbilities = true;
    // Magnet onRez would also set this; flag must not win over Hush.
    hush.abilitiesBlanked = true;
    s.cards["hush-1"] = hush;
    s.runner.installed = ["hush-1"];

    const effects = collectBlankingEffects(s);
    const hushFx = effects.find((e) => e.id === "blank-host:hush-1");
    const magFx = effects.find((e) => e.sourceId === "mag-1");
    expect(hushFx).toBeDefined();
    expect(magFx).toBeDefined();
    expect(blankingEffectDependsOn(hushFx!, magFx!)).toBe(true);
    expect(blankingEffectDependsOn(magFx!, hushFx!)).toBe(true);

    const ordered = orderBlankingEffects(effects);
    expect(ordered[0]!.id).toBe("blank-host:hush-1");
    // Magnet's blank never applies once Hush removes Magnet's ability.
    expect(ordered.some((e) => e.sourceId === "mag-1")).toBe(false);

    expect(abilitiesSuppressed(s, "mag-1")).toBe(true);
    expect(abilitiesSuppressed(s, "hush-1")).toBe(false);
    expect((s.cards["mag-1"].subroutines ?? []).length).toBeGreaterThan(0);
  });


  it("makes Warroid Tracker pending once when Singularity trashes it with Hostile Infrastructure (CR 9.12.2a.ex1)", () => {
    let s = createInitialState();
    const hi = instantiateCard(
      "hostile-infrastructure",
      "hi-1",
      "server:remote-1:root",
    );
    hi.rezzed = true;
    hi.faceup = true;
    const warroid = instantiateCard(
      "warroid-tracker",
      "war-1",
      "server:remote-1:root",
    );
    warroid.rezzed = true;
    warroid.faceup = true;
    const sing = instantiateCard("singularity", "sing-1", "runner:play-area");
    for (const card of [hi, warroid, sing]) s.cards[card.id] = card;
    s.runner.hand = ["grip-0", "grip-1"];
    for (const id of s.runner.hand) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    }
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["hi-1", "war-1"],
    };
    s.run = {
      attackedServerId: "remote-1",
      phase: "success",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    s.activeSide = "runner";

    const opened = evalEffect(
      { state: s, sourceId: "sing-1" },
      fx.do({ kind: "breach_instead_singularity_trash_root" }),
    );
    expect(opened.ok).toBe(true);
    s = must(s, { type: "choose_option", optionId: "singularity" });

    const hiPending = at(
      s.log,
      "Hostile Infrastructure remains active — 2 instances become pending",
    );
    const once = at(
      s.log,
      "Warroid Tracker — one instance becomes pending for this trash",
    );
    expect(s.log[once]).toContain(CR.actOnSet.number);
    expect(
      s.log.filter((line) => line.startsWith("Trace initiated")).length,
    ).toBe(1);
    expect(s.log.filter((line) => line.startsWith("net damage 1:"))).toHaveLength(
      2,
    );
    expect(
      s.log.filter((line) =>
        line.includes("Warroid Tracker — Runner has no installed cards"),
      ),
    ).toHaveLength(1);
    expect(hiPending).toBeLessThan(once);
    expect(s.runner.hand).toEqual([]);
  });


  it("looks at 4 cards once when Ritual draws 3 (CR 9.12.2b.ex1)", () => {
    const s = createInitialState();
    const ritual = instantiateCard("ritual", "rit-1", "runner:grip");
    const act = instantiateCard("the-class-act", "act-1", "runner:installed");
    s.cards["rit-1"] = ritual;
    s.cards["act-1"] = act;
    s.runner.installed = ["act-1"];
    s.runner.hand = ["rit-1"];
    s.runner.clicks = 3;
    for (const id of ["a", "b", "c", "d", "e"]) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:stack");
      s.cards[id]!.title = id.toUpperCase();
    }
    s.runner.deck = ["a", "b", "c", "d", "e"];
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    const played = must(s, { type: "play_event", cardId: "rit-1" });
    expect(played.pendingChoice?.options.map((o) => o.id)).toEqual([
      "class-act-bottom:a",
      "class-act-bottom:b",
      "class-act-bottom:c",
      "class-act-bottom:d",
    ]);
    expect(
      played.log.filter((line) => line.includes("interrupt would-draw")).length,
    ).toBe(1);
    const next = must(played, {
      type: "choose_option",
      optionId: "class-act-bottom:a",
    });
    expect(next.runner.hand).toHaveLength(3);
    expect(next.runner.deck.at(-1)).toBe("a");
    expect(next.pendingChoice).toBeNull();
  });


  it("applies Prāna Condenser once to Urtica Cipher's 5 net damage (CR 9.12.2b.ex2)", () => {
    const s = createInitialState();
    const urtica = instantiateCard("urtica-cipher", "ur-1", "server:remote-1:root");
    urtica.advancementCounters = 3;
    urtica.rezzed = true;
    urtica.faceup = true;
    const prana = instantiateCard("prana-condenser", "pr-1", "server:remote-2:root");
    prana.rezzed = true;
    prana.faceup = true;
    s.cards["ur-1"] = urtica;
    s.cards["pr-1"] = prana;
    s.servers["remote-1"] = { id: "remote-1", kind: "remote", ice: [], root: ["ur-1"] };
    s.servers["remote-2"] = { id: "remote-2", kind: "remote", ice: [], root: ["pr-1"] };
    s.corp.credits = 0;
    for (const id of ["g1", "g2", "g3", "g4", "g5"]) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    }
    s.runner.hand = ["g1", "g2", "g3", "g4", "g5"];
    const dealt = evalEffect(
      { state: s, sourceId: "ur-1" },
      urtica.onAccess!,
    );
    expect(dealt.ok).toBe(true);
    expect(s.pendingDamage?.type).toBe("net");
    expect(s.pendingDamage?.remaining).toBe(5);
    const once = must(s, {
      type: "use_paid_ability",
      cardId: "pr-1",
      abilityId: "prana-prevent-net",
    });
    expect(once.pendingDamage?.remaining).toBe(4);
    expect(once.cards["pr-1"]?.powerCounters).toBe(1);
    expect(once.corp.credits).toBe(3);
    const again = applyAction(once, {
      type: "use_paid_ability",
      cardId: "pr-1",
      abilityId: "prana-prevent-net",
    });
    expect(again.ok).toBe(false);
    expect(once.pendingDamage?.remaining).toBe(4);
  });


  it("offers NASX twice when realloc() gains and derezzes two ice (CR 9.12.2b.ex3)", () => {
    const s = createInitialState();
    const nasx = instantiateCard("nasx", "nasx-1", "server:remote-1:root");
    nasx.rezzed = true;
    nasx.faceup = true;
    const op = instantiateCard("realloc", "realloc-1", "corp:hq");
    const iceA = instantiateCard("ice-wall", "ice-a", "server:hq:ice");
    const iceB = instantiateCard("ice-wall", "ice-b", "server:remote-1:ice");
    iceA.rezzed = true;
    iceA.faceup = true;
    iceA.rezCost = 2;
    iceA.title = "Ice A";
    iceB.rezzed = true;
    iceB.faceup = true;
    iceB.rezCost = 3;
    iceB.title = "Ice B";
    s.cards["nasx-1"] = nasx;
    s.cards["realloc-1"] = op;
    s.cards["ice-a"] = iceA;
    s.cards["ice-b"] = iceB;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: ["ice-b"],
      root: ["nasx-1"],
    };
    s.servers.hq.ice = ["ice-a"];
    s.corp.hand = ["realloc-1"];
    s.corp.credits = 5;
    s.corp.clicks = 2;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    const played = must(s, { type: "play_operation", cardId: "realloc-1" });
    const first = must(played, {
      type: "choose_option",
      optionId: "realloc-first:ice-a",
    });
    const second = must(first, {
      type: "choose_option",
      optionId: "realloc-second:ice-b",
    });
    expect(second.pendingChoice?.options.map((o) => o.id)).toContain("nasx-power:1");
    const declined = must(second, { type: "choose_option", optionId: "decline" });
    expect(declined.pendingChoice?.options.map((o) => o.id)).toContain("nasx-power:1");
    const done = must(declined, { type: "choose_option", optionId: "decline" });
    expect(done.pendingChoice).toBeNull();
    expect(done.cards["ice-a"]?.rezzed).toBe(false);
    expect(done.cards["ice-b"]?.rezzed).toBe(false);
    expect(done.corp.credits).toBe(10);
  });


  it("trashes Troll when Forked's empty subroutine set is broken at the encounter window (CR 9.12.2d.ex1)", () => {
    const start = (): GameState => {
      const s = createInitialState();
      const troll = instantiateCard("troll", "troll-1", "server:hq:ice");
      troll.rezzed = true;
      troll.faceup = true;
      s.cards["troll-1"] = troll;
      s.servers.hq.ice = ["troll-1"];
      s.runner.clicks = 4;
      s.activeSide = "runner";
      s.run = {
        attackedServerId: "hq",
        phase: "encounter",
        position: 0,
        successful: null,
        accessedCardIds: [],
        accessCandidates: [],
        randomAccessLimit: null,
        encounter: null,
        endedTheRun: false,
        cannotJackOut: false,
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
        accessingCardId: null,
        trashFirstFullyBrokenSubtype: "sentry",
      };
      enterStep(s, "run.encounter");
      autoWalk(s);
      return s;
    };

    let keep = start();
    expect(keep.pendingChoice?.options.map((o) => o.id)).toContain(
      "troll-lose-click",
    );
    keep = must(keep, { type: "choose_option", optionId: "troll-lose-click" });
    expect(keep.corp.discardPile).toContain("troll-1");
    expect(keep.servers.hq.ice).not.toContain("troll-1");
    expect(keep.log.join("\n")).toContain(CR.vacuousAll.number);
    expect(keep.run?.endedTheRun).not.toBe(true);

    const end = start();
    const ended = must(end, { type: "choose_option", optionId: "troll-etr" });
    expect(ended.servers.hq.ice).toContain("troll-1");
    expect(ended.corp.discardPile).not.toContain("troll-1");
    expect(ended.run).toBeNull();
  });


    it("traces 0 after ZATO City Grid trashes Surveyor (CR 9.12.2e.ex1)", () => {
    const s = createInitialState();
    const surveyor = instantiateCard("surveyor", "sv-1", "server:remote-1:ice");
    surveyor.rezzed = true;
    surveyor.faceup = true;
    const wall = instantiateCard("ice-wall", "wall-1", "server:remote-1:ice");
    wall.rezzed = true;
    wall.faceup = true;
    const zato = instantiateCard("zato-city-grid", "zato-1", "server:remote-1:root");
    zato.rezzed = true;
    zato.faceup = true;
    s.cards["sv-1"] = surveyor;
    s.cards["wall-1"] = wall;
    s.cards["zato-1"] = zato;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: ["sv-1", "wall-1"],
      root: ["zato-1"],
    };
    s.runner.link = 0;
    s.run = {
      attackedServerId: "remote-1",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    enterStep(s, "run.encounter");
    autoWalk(s);
    expect(s.pendingChoice?.options.map((o) => o.id)).toContain("zato:0");
    const traced = must(s, { type: "choose_option", optionId: "zato:0" });
    expect(traced.cards["sv-1"]?.zone).toBe("corp:archives");
    expect(traced.log.join("\n")).toContain("X is 0");
    expect(traced.log.join("\n")).toContain("Trace initiated strength 0");
  });


  it("treats Surveyor's X as 0 when the defining ability is inactive (CR 9.12.2e.ex2)", () => {
    const s = createInitialState();
    const surveyor = instantiateCard("surveyor", "sv-1", "server:hq:ice");
    surveyor.rezzed = true;
    surveyor.faceup = true;
    const wall = instantiateCard("ice-wall", "wall-1", "server:hq:ice");
    wall.rezzed = true;
    const hush = instantiateCard("hush", "hush-1", "runner:installed");
    hush.hostId = "sv-1";
    s.cards["sv-1"] = surveyor;
    s.cards["wall-1"] = wall;
    s.cards["hush-1"] = hush;
    s.servers.hq.ice = ["sv-1", "wall-1"];
    s.runner.installed = ["hush-1"];
    expect(effectiveIceStrength(s, "sv-1")).toBe(0);

    surveyor.zone = "corp:archives";
    s.servers.hq.ice = ["wall-1"];
    s.corp.discardPile.push("sv-1");
    s.runner.installed = [];
    const traced = evalEffect(
      { state: s, sourceId: "sv-1" },
      fx.do({
        kind: "trace_strength_equal_source_strength",
        onSuccess: fx.do({ kind: "give_tags", amount: 2 }),
      }),
    );
    expect(traced.ok).toBe(true);
    expect(s.log.join("\n")).toContain(CR.valueDefinedByX.number);
    expect(s.log.join("\n")).toContain("Trace initiated strength 0");
  });


  it("makes the Runner choose Imp or Scrubber for Mumbad Virtual Tour (CR 9.12.3a.ex1)", () => {
    const start = (): GameState => {
      const s = createInitialState();
      const tour = instantiateCard(
        "mumbad-virtual-tour",
        "mvt-1",
        "server:hq:root",
      );
      tour.rezzed = true;
      tour.faceup = true;
      const imp = instantiateCard("imp", "imp-1", "runner:installed");
      imp.virusCounters = 1;
      const scrubber = instantiateCard("scrubber", "scrub-1", "runner:installed");
      scrubber.recurringCredits = 2;
      s.cards["mvt-1"] = tour;
      s.cards["imp-1"] = imp;
      s.cards["scrub-1"] = scrubber;
      s.servers.hq.root = ["mvt-1"];
      s.runner.installed = ["imp-1", "scrub-1"];
      s.runner.credits = 4;
      s.activeSide = "runner";
      s.timingKey = "breach.awaitAccess";
      s.run = {
        attackedServerId: "hq",
        phase: "breach",
        position: null,
        successful: true,
        accessedCardIds: [],
        accessCandidates: ["mvt-1"],
        randomAccessLimit: 1,
        encounter: null,
        endedTheRun: false,
        cannotJackOut: false,
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
        accessingCardId: null,
      };
      return s;
    };

    let withImp = start();
    withImp = must(withImp, { type: "access_card", cardId: "mvt-1" });
    expect(withImp.pendingChoice?.options.map((o) => o.id)).toEqual([
      "must-trash:pay",
      "must-trash:imp",
    ]);
    withImp = must(withImp, { type: "choose_option", optionId: "must-trash:imp" });
    expect(withImp.corp.discardPile).toContain("mvt-1");
    expect(withImp.cards["imp-1"]?.virusCounters).toBe(0);
    expect(withImp.runner.credits).toBe(4);
    expect(withImp.log.join("\n")).toContain(CR.mustAnyMeans.number);

    let withPay = start();
    withPay = must(withPay, { type: "access_card", cardId: "mvt-1" });
    withPay = must(withPay, { type: "choose_option", optionId: "must-trash:pay" });
    expect(withPay.corp.discardPile).toContain("mvt-1");
    expect(withPay.cards["imp-1"]?.virusCounters).toBe(1);
  });


  it("does not force Imp when Neutralize All Threats cannot be paid (CR 9.12.3b.ex1)", () => {
    const s = createInitialState();
    const pad = instantiateCard("pad-campaign", "pad-1", "server:hq:root");
    pad.rezzed = true;
    const nat = instantiateCard(
      "neutralize-all-threats",
      "nat-1",
      "runner:installed",
    );
    const imp = instantiateCard("imp", "imp-1", "runner:installed");
    imp.virusCounters = 1;
    s.cards["pad-1"] = pad;
    s.cards["nat-1"] = nat;
    s.cards["imp-1"] = imp;
    s.servers.hq.root = ["pad-1"];
    s.runner.installed = ["nat-1", "imp-1"];
    s.runner.credits = 0;
    s.activeSide = "runner";
    s.timingKey = "breach.awaitAccess";
    s.run = {
      attackedServerId: "hq",
      phase: "breach",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: ["pad-1"],
      randomAccessLimit: 1,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    const accessed = must(s, { type: "access_card", cardId: "pad-1" });
    expect(accessed.servers.hq.root).toContain("pad-1");
    expect(accessed.cards["imp-1"]?.virusCounters).toBe(1);
    expect(accessed.pendingChoice).toBeNull();
    expect(accessed.log.join("\n")).toContain(CR.mustSpecifiedMeans.number);
  });


  it("makes the Runner pay Fairchild when that is the only option (CR 9.12.3c.ex1)", () => {
    const s = createInitialState();
    const ice = instantiateCard("fairchild-2-0", "fc-1", "server:hq:ice");
    ice.rezzed = true;
    s.cards["fc-1"] = ice;
    s.runner.installed = [];
    s.runner.credits = 3;
    const pay = fx.do({
      kind: "pay_credits_or_trash_installed" as const,
      side: "runner" as const,
      amount: 2,
    });
    const first = evalEffect({ state: s, sourceId: "fc-1" }, pay);
    expect(first.ok).toBe(true);
    expect(s.runner.credits).toBe(1);
    expect(s.pendingChoice).toBeNull();
    const second = evalEffect({ state: s, sourceId: "fc-1" }, pay);
    expect(second.ok).toBe(true);
    expect(s.runner.credits).toBe(1);
    expect(s.pendingChoice).toBeNull();
    expect(s.log.join("\n")).toContain(CR.mustChoice.number);
  });


    it("lets the Runner take Data Raven's tag and avoid it without ending the run (CR 9.12.3d.ex1)", () => {
    const s = createInitialState();
    const raven = instantiateCard("data-raven", "raven-1", "server:hq:ice");
    raven.rezzed = true;
    raven.faceup = true;
    const decoy = instantiateCard("decoy", "decoy-1", "runner:installed");
    s.cards["raven-1"] = raven;
    s.cards["decoy-1"] = decoy;
    s.servers.hq.ice = ["raven-1"];
    s.runner.installed = ["decoy-1"];
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: { iceId: "raven-1", broken: [] },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    expect(raven.onEncounter).toBeDefined();
    const offered = evalEffect({ state: s, sourceId: "raven-1" }, raven.onEncounter!);
    expect(offered.ok).toBe(true);
    expect(s.pendingChoice?.options.map((option) => option.id)).toEqual([
      "unless-pay",
      "unless-instruction",
    ]);

    const paying = must(s, { type: "choose_option", optionId: "unless-pay" });
    expect(paying.pendingTags?.remaining).toBe(1);
    const avoided = must(paying, {
      type: "use_paid_ability",
      cardId: "decoy-1",
      abilityId: "decoy-prevent-tag",
    });
    expect(avoided.pendingTags).toBeNull();
    expect(avoided.runner.tags).toBe(0);
    expect(avoided.run?.endedTheRun).toBe(false);
    expect(avoided.cards["decoy-1"]?.zone).toBe("runner:heap");
  });


  it("lets the Runner decline Service Outage and then spend Always Be Running's click (CR 9.12.3e.ex1)", () => {
    const s = createInitialState();
    const abr = instantiateCard("always-be-running", "abr-1", "runner:installed");
    const outage = instantiateCard("service-outage", "out-1", "corp:play-area");
    s.cards["abr-1"] = abr;
    s.cards["out-1"] = outage;
    s.runner.installed = ["abr-1"];
    s.corp.playArea = ["out-1"];
    s.runner.clicks = 4;
    s.runner.credits = 5;
    s.activeSide = "runner";
    s.turn.runnerClicksSpentThisTurn = 0;
    enterStep(s, "runner.takeAction");
    expect(legalActions(s).some((action) => action.type === "basic_gain_credit")).toBe(
      false,
    );
    expect(legalActions(s).some((action) => action.type === "basic_run")).toBe(true);

    const prompted = must(s, { type: "basic_run", serverId: "hq" as ServerId });
    expect(prompted.pendingChoice?.options.map((option) => option.id)).toEqual([
      "first-run-cost:pay",
      "first-run-cost:decline",
    ]);
    expect(prompted.runner.clicks).toBe(4);

    const declined = must(prompted, {
      type: "choose_option",
      optionId: "first-run-cost:decline",
    });
    expect(declined.runner.clicks).toBe(4);
    expect(declined.runner.credits).toBe(5);
    expect(declined.run).toBeNull();
    expect(declined.log.join("\n")).toContain(CR.mustNotForceAdditionalCost.number);
    expect(
      legalActions(declined).some((action) => action.type === "basic_gain_credit"),
    ).toBe(true);
    const gained = must(declined, { type: "basic_gain_credit" });
    expect(gained.runner.credits).toBe(6);
    expect(gained.runner.clicks).toBe(3);
  });


  it("keeps AMAZE Amusements pending while Doppelgänger starts another run (CR 9.12.5d.ex1)", () => {
    const s = createInitialState();
    const amaze = instantiateCard(
      "amaze-amusements",
      "amaze-1",
      "corp:archives",
    );
    amaze.rezzed = false;
    amaze.faceup = true;
    const doppel = instantiateCard("doppelganger", "dop-1", "runner:installed");
    const agenda = instantiateCard("hostile-takeover", "ht-1", "runner:score");
    s.cards["amaze-1"] = amaze;
    s.cards["dop-1"] = doppel;
    s.cards["ht-1"] = agenda;
    s.corp.discardPile = ["amaze-1"];
    s.runner.installed = ["dop-1"];
    s.runner.scoreArea = ["ht-1"];
    const wall = instantiateCard("ice-wall", "wall-1", "server:hq:ice");
    wall.rezzed = true;
    wall.faceup = true;
    s.cards["wall-1"] = wall;
    s.servers.hq.ice = ["wall-1"];
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: [],
    };
    s.run = {
      attackedServerId: "remote-1",
      phase: "success",
      position: null,
      successful: true,
      accessedCardIds: ["ht-1"],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      agendasStolenThisRun: 1,
      persistentTagsIfAgendaStolen: 2,
      persistentAmazeSourceId: "amaze-1",
    };
    s.activeSide = "runner";
    s.timingKey = "run.success";
    s.runner.tags = 0;
    enterStep(s, "run.ends");
    autoWalk(s);
    expect(s.pendingChoice?.options.some((o) => o.id === "run:hq")).toBe(true);
    expect(s.runner.tags).toBe(0);
    expect(
      s.pendingAbilities.some(
        (p) =>
          p.status === "pending" && p.payload?.kind === "amaze_give_tags",
      ),
    ).toBe(true);
    const running = must(s, { type: "choose_option", optionId: "run:hq" });
    expect(running.runner.tags).toBe(0);
    expect(
      running.pendingAbilities.some(
        (p) =>
          p.status === "pending" && p.payload?.kind === "amaze_give_tags",
      ),
    ).toBe(true);
    expect(running.run?.attackedServerId).toBe("hq");
    running.run!.agendasStolenThisRun = 1;
    running.timingKey = "run.success";
    enterStep(running, "run.ends");
    autoWalk(running);
    expect(running.runner.tags).toBe(2);
    expect(
      running.pendingAbilities.some(
        (p) => p.payload?.kind === "amaze_give_tags",
      ),
    ).toBe(false);
    expect(
      running.log.filter((line) => line.includes("pending instance resolves")),
    ).toHaveLength(1);
  });
});
