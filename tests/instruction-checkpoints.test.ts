/**
 * An instruction pauses only at the checkpoints in CR 9.11.1.
 * After a cost (9.11.1a / 1.16.3 / 10.3.4), during a draw (9.11.1c / 8.4.5b),
 * while playing an event or operation (9.11.1d / 8.6.7e), and after a trace
 * initiates (9.11.1e / 10.8.6b). Each checkpoint closes before the instruction
 * continues. CR 9.11.1b is the timing structures walked in timing-chart.test.ts.
 * When that step finishes, a checkpoint occurs before the next instruction
 * is imminent (CR 10.3.5 / 9.11.2). The checkpoint after an access's last
 * step is outside that access and still on the breach (CR 10.3.6 / 9.2.2d).
 * The checkpoint after a breach's last step is outside the breach and still
 * on the run (CR 10.3.6 / 9.2.2c). The checkpoint after a run's last step is
 * outside the run (CR 10.3.6). The checkpoint after the Corp's last step is
 * outside that turn and on the Runner's turn (CR 10.3.6 / 9.2.2a). The
 * checkpoint after the Corp's discard phase is outside that phase once
 * the turn is complete (CR 10.3.6 / 5.5). The
 * checkpoint after the Runner's last step is outside that turn and on the
 * Corp's turn (CR 10.3.6 / 9.2.2a). The checkpoint after the Runner's
 * discard phase is outside that phase once the turn is complete
 * (CR 10.3.6 / 5.5). The checkpoint after the Corp's action
 * phase is outside that phase and on the discard step (CR 10.3.6 / 5.1.2).
 * The checkpoint after the Runner's action phase is outside that phase and
 * on the discard step (CR 10.3.6 / 5.1.3). The checkpoint after the Corp's
 * draw phase is outside that phase and on the action window (CR 10.3.6 / 5.1.2).
 * The checkpoint after a run's initiation phase is outside that phase while
 * the run is still open (CR 10.3.6 / 6.3). The checkpoint after Approach Ice
 * is outside that phase while the run is still open (CR 10.3.6 / 6.4). The
 * checkpoint after Encounter Ice is outside that phase while the run is
 * still open (CR 10.3.6 / 6.5). The checkpoint after Movement is outside
 * that phase while the run is still open (CR 10.3.6 / 6.6). The checkpoint
 * after Success is outside that phase while the run is still open
 * (CR 10.3.6 / 6.7). The checkpoint after Run Ends is outside that phase
 * once the run is complete (CR 10.3.6 / 6.8).
 * CR 10.3.1a through CR 10.3.1l run inside these frames before they close.
 * CR 10.3.2 is checked after the frame closes and stays closed when nothing
 * is marked pending.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  autoWalk,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  CR,
  createInitialState,
  crDataPresent,
  enterStep,
  evalEffect,
  fx,
  instantiateCard,
  stealAgenda,
  effectiveIceStrength,
  legalActions,
  resolveTrace,
  boostTrace,
  startTrace,
} from "../src/index.js";
import { drawCards } from "../src/effects/draw.js";
import { occurCheckpoint } from "../src/legality/checkpoints.js";
import { removeCardFromCurrentZone } from "../src/state/scoring.js";
import { breakerStrength } from "../src/effects/iceStrength.js";
import { mayLookAtHiddenZone } from "../src/state/hiddenSearch.js";
import { moveRunnerCardToHeap } from "../src/state/trashHooks.js";
import type { GameState, ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.6");
});

function must(state: GameState, action: Parameters<typeof applyAction>[1]): GameState {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

function at(lines: string[], fragment: string): number {
  const i = lines.findIndex((line) => line.includes(fragment));
  expect(i, fragment).toBeGreaterThanOrEqual(0);
  return i;
}

describe("instruction checkpoints (CR 9.11.1)", () => {
  it("runs the cost checkpoint after the cost is paid, before the play abilities (CR 9.11.1a, 8.6.7e)", () => {
    let s = createInitialState();
    const ev = instantiateCard("sure-gamble", "sg-1", "runner:grip");
    s.cards["sg-1"] = ev;
    s.runner.hand = ["sg-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "play_event", cardId: "sg-1" });

    const paid = at(s.log, "Cost paid (play_event)");
    const cost = at(s.log, "Checkpoint open [cost]");
    const play = at(s.log, "Checkpoint open [play]");
    const gain = at(s.log, "runner gains 9¢");
    expect(paid).toBeLessThan(cost);
    expect(cost).toBeLessThan(play);
    expect(play).toBeLessThan(gain);
    expect(s.log[cost]).toContain(CR.costCheckpoint.number);
    expect(s.log[cost]).toContain(CR.costAfterPay.number);
    expect(s.log[cost]).toContain(CR.costPaidCheckpoint.number);
    expect(s.log[play]).toContain(CR.playCheckpoint.number);
    expect(s.log[play]).toContain(CR.playPause.number);
    expect(s.log.some((line) => line.includes("Checkpoint close [cost]"))).toBe(true);
    expect(s.log.some((line) => line.includes("Checkpoint close [play]"))).toBe(true);
    expect(s.checkpoints).toHaveLength(0);
    expect(s.runner.credits).toBe(9);
  });

  it("resolves Sure Gamble's play ability after the play checkpoint closes (CR 8.6.7f)", () => {
    let s = createInitialState();
    const ev = instantiateCard("sure-gamble", "sg-1", "runner:grip");
    s.cards["sg-1"] = ev;
    s.runner.hand = ["sg-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "play_event", cardId: "sg-1" });

    const play = at(s.log, "Checkpoint close [play]");
    const resolve = at(s.log, "Resolve play abilities of Sure Gamble");
    const gain = at(s.log, "runner gains 9¢");
    const trashed = at(s.log, "Sure Gamble trashed");
    expect(play).toBeLessThan(resolve);
    expect(resolve).toBeLessThan(gain);
    expect(gain).toBeLessThan(trashed);
    expect(s.log[resolve]).toContain(CR.playAbilities.number);
    expect(s.cards["sg-1"]?.zone).toBe("runner:heap");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("checkpoints between Build Script's credit gain and its draw (CR 9.1.2)", () => {
    let s = createInitialState();
    const ev = instantiateCard("build-script", "bs-1", "runner:grip");
    const top = instantiateCard("sure-gamble", "top-1", "runner:stack");
    const next = instantiateCard("sure-gamble", "top-2", "runner:stack");
    s.cards["bs-1"] = ev;
    s.cards["top-1"] = top;
    s.cards["top-2"] = next;
    s.runner.hand = ["bs-1"];
    s.runner.deck = ["top-1", "top-2"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "play_event", cardId: "bs-1" });

    const gain = at(s.log, "runner gains 1¢");
    const between = at(s.log, "Checkpoint open [instruction] Between instructions");
    const aside = at(s.log, "Set aside 2");
    expect(s.log[between]).toContain(CR.resolveAbility.number);
    expect(gain).toBeLessThan(between);
    expect(between).toBeLessThan(aside);
    expect(s.runner.credits).toBe(6);
    expect(s.runner.hand).toEqual(["top-1", "top-2"]);
    expect(s.cards["bs-1"]?.zone).toBe("runner:heap");
    expect(s.log.join("\n")).not.toContain("Sure Gamble");
    expect(s.checkpoints).toHaveLength(0);
  });

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

  it("does not draw for I've Had Worse when Skorpios removes it from the game (CR 9.1.8b)", () => {
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

  it("installs Jak Sinclair for 1 credit with 2 link (CR 9.1.8d)", () => {
    let s = createInitialState();
    const jak = instantiateCard("jak-sinclair", "jak-1", "runner:grip");
    s.cards["jak-1"] = jak;
    s.runner.hand = ["jak-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.runner.link = 2;
    s.cards[s.runner.identityId]!.link = 2;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, {
      type: "basic_install",
      cardId: "jak-1",
      destination: { kind: "installed" },
    });

    const installed = at(s.log, "Runner installs Jak Sinclair for 1¢");
    const active = at(s.log, "Jak Sinclair costs 2¢ less to install");
    expect(s.log[active]).toContain(CR.sourceInstallCost.number);
    expect(installed).toBeLessThan(active);
    expect(s.runner.credits).toBe(4);
    expect(s.runner.link).toBe(2);
    expect(s.cards["jak-1"]?.zone).toBe("runner:installed");
    expect(s.runner.hand).toEqual([]);
    expect(s.pendingChoice).toBeNull();
    expect(s.log.join("\n")).not.toContain("for 3¢");
  });

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

  it("trashes Chronos Protocol's chosen card and two random cards together (CR 10.4.3a)", () => {
    const s = createInitialState();
    s.cards[s.corp.identityId]!.corpChoosesFirstNetDamageCardEachTurn = true;
    const worse = instantiateCard("ive-had-worse", "worse-1", "runner:grip");
    s.cards["worse-1"] = worse;
    for (const id of ["g1", "g2", "g3"]) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    }
    for (const id of ["d1", "d2", "d3"]) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:stack");
    }
    s.runner.hand = ["worse-1", "g1", "g2", "g3"];
    s.runner.deck = ["d1", "d2", "d3"];
    const dealt = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      { op: "do", action: { kind: "net_damage", amount: 3 } },
    );
    expect(dealt.ok).toBe(true);
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options).toHaveLength(4);
    const picked = must(s, { type: "choose_option", optionId: "chronos:worse-1" });
    expect(picked.pendingChoice).toBeNull();
    expect(picked.runner.discardPile).toContain("worse-1");
    expect(picked.runner.discardPile.filter((id) => ["worse-1", "g1", "g2", "g3"].includes(id))).toHaveLength(3);
    expect(picked.log.join("\n")).toContain("1 still in the grip");
    expect(picked.log.join("\n")).toContain(CR.sequentialDamageSelection.number);
    expect(picked.runner.hand).toHaveLength(4);
    expect(picked.runner.deck).toEqual([]);
  });

  it("resolves a Corp identity ability before the first turn (CR 1.6.7a)", () => {
    const s = createInitialState();
    const identity = s.cards[s.corp.identityId]!;
    identity.onBeforeFirstTurn = fx.gainCredits("corp", 4);
    s.corp.credits = 0;
    enterStep(s, "opening.beforeFirstTurn");
    autoWalk(s);
    expect(s.corp.credits).toBe(4);
    expect(s.log.join("\n")).toContain(CR.beforeFirstTurn.number);
    expect(s.timingKey).toBe("corp.gainClicks");
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
    expect(s.turn.blackguardPendingRezIds).toBeUndefined();
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

  it("ends Drug Dealer's turn-begin ability when Aesop's Pawnshop trashes it (CR 9.6.10)", () => {
    let s = createInitialState();
    const aesop = instantiateCard("aesops-pawnshop", "aesop-1", "runner:installed");
    const dealer = instantiateCard("drug-dealer", "dd-1", "runner:installed");
    s.cards["aesop-1"] = aesop;
    s.cards["dd-1"] = dealer;
    s.runner.installed = ["aesop-1", "dd-1"];
    s.runner.credits = 5;
    s.activeSide = "runner";
    s.timingKey = "runner.turnBegins";

    autoWalk(s);

    expect(s.pendingChoice?.options.map((option) => option.id)).toContain(
      "trash",
    );
    expect(s.runner.credits).toBe(5);
    expect(s.log.some((line) => line.includes("runner loses"))).toBe(false);

    s = must(s, { type: "choose_option", optionId: "trash" });

    const trashed = at(s.log, "Aesop's Pawnshop — trash Drug Dealer, gain 3¢");
    const ended = at(s.log, "Drug Dealer's pending turn-begin ability ends");
    expect(trashed).toBeLessThan(ended);
    expect(s.log[ended]).toContain(CR.pendingAbilityInactive.number);
    expect(s.runner.credits).toBe(8);
    expect(s.runner.installed).not.toContain("dd-1");
    expect(s.cards["dd-1"]?.zone).toBe("runner:heap");
    expect(s.log.some((line) => line.includes("runner loses"))).toBe(false);
    expect(s.turn.runnerTurnBeginRemainingIds).toBeUndefined();
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

  it("copies each Enigma subroutine immediately after the original when TL;DR resolves (CR 9.8.2a)", () => {
    let s = createInitialState();
    const tldr = instantiateCard("tl-dr", "tldr-1", "server:hq:ice");
    tldr.rezzed = true;
    tldr.faceup = true;
    const enigma = instantiateCard("enigma", "en-1", "server:hq:ice");
    enigma.rezzed = true;
    enigma.faceup = true;
    s.cards["tldr-1"] = tldr;
    s.cards["en-1"] = enigma;
    s.servers.hq.ice = ["tldr-1", "en-1"];
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

    const passUntil = (fragment: string) => {
      for (let i = 0; i < 24; i++) {
        autoWalk(s);
        if (s.log.some((line) => line.includes(fragment))) return;
        const passed = applyAction(s, { type: "pass_window" });
        if (!passed.ok) break;
        s = passed.state;
      }
    };
    passUntil("Encounter Enigma");

    const gained = at(
      s.log,
      "Enigma gains a second copy of each subroutine",
    );
    expect(s.log[gained]).toContain(CR.subroutinesDuplicated.number);
    expect(s.cards["en-1"]?.subroutines?.map((sub) => sub.text)).toEqual([
      "The Runner loses [click], if able.",
      "The Runner loses [click], if able.",
      "End the run.",
      "End the run.",
    ]);
    expect(s.cards["en-1"]?.subroutines?.map((sub) => sub.id)).toEqual([
      "enigma-click",
      "enigma-click-tldr-copy",
      "enigma-etr",
      "enigma-etr-tldr-copy",
    ]);
    expect(s.run?.encounter?.broken).toEqual([false, false, false, false]);
    expect(s.turn.dadDuplicateSubsOnNextIceEncounter).toBe(false);
    expect(s.cards["tldr-1"]?.subroutines?.map((sub) => sub.id)).toEqual([
      "tl-dr-duplicate",
    ]);
  });

  it("loses Hive's last printed subroutine for each Corp agenda point (CR 9.8.2b)", () => {
    let s = createInitialState();
    const hive = instantiateCard("hive", "hive-1", "server:hq:ice");
    hive.rezzed = true;
    hive.faceup = true;
    const agenda = instantiateCard("hostile-takeover", "ht-1", "corp:score");
    s.cards["hive-1"] = hive;
    s.cards["ht-1"] = agenda;
    s.corp.scoreArea = ["ht-1"];
    s.servers.hq.ice = ["hive-1"];
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
      if (s.log.some((line) => line.includes("Encounter Hive"))) break;
      const passed = applyAction(s, { type: "pass_window" });
      if (!passed.ok) break;
      s = passed.state;
    }

    const lost = at(s.log, "Hive loses 1 printed subroutine(s) from the last");
    expect(s.log[lost]).toContain(CR.subroutinesLostFromLast.number);
    expect(s.cards["hive-1"]?.subroutines?.map((sub) => sub.id)).toEqual([
      "hive-etr-1",
      "hive-etr-2",
      "hive-etr-3",
    ]);
    expect(s.run?.encounter?.broken).toEqual([false, false, false]);
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

  it("resolves Enigma's subroutines in the order Street Magic declares (CR 9.8.7d)", () => {
    let s = createInitialState();
    const enigma = instantiateCard("enigma", "en-1", "server:hq:ice");
    enigma.rezzed = true;
    enigma.faceup = true;
    const magic = instantiateCard("street-magic", "sm-1", "runner:installed");
    s.cards["en-1"] = enigma;
    s.cards["sm-1"] = magic;
    s.servers.hq.ice = ["en-1"];
    s.runner.installed = ["sm-1"];
    s.runner.clicks = 4;
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
      if (s.pendingChoice?.options.some((option) => option.id.startsWith("resolve-next:"))) {
        break;
      }
      const passed = applyAction(s, { type: "pass_window" });
      if (!passed.ok) break;
      s = passed.state;
    }

    expect(s.pendingChoice?.options.map((option) => option.id)).toEqual([
      "resolve-next:0",
      "resolve-next:1",
    ]);
    s = must(s, { type: "choose_option", optionId: "resolve-next:1" });
    const ordered = at(
      s.log,
      'Street Magic — the Runner orders the unbroken subroutines: "End the run.", then "The Runner loses [click], if able."',
    );
    expect(s.log[ordered]).toContain(CR.subroutineResolveOrder.number);
    const ended = at(s.log, 'Resolve subroutine "End the run."');
    expect(ordered).toBeLessThan(ended);
    expect(
      s.log.some((line) =>
        line.includes('Resolve subroutine "The Runner loses [click], if able."'),
      ),
    ).toBe(false);
    expect(s.runner.clicks).toBe(4);
    expect(s.run).toBeNull();
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

  it("sets net damage to 1 only when Bio-Modeled Network is relevant (CR 9.9.7c)", () => {
    let s = createInitialState();
    const bio = instantiateCard(
      "bio-modeled-network",
      "bio-1",
      "runner:installed",
    );
    const filter = instantiateCard(
      "feedback-filter",
      "ff-1",
      "runner:installed",
    );
    const snare = instantiateCard("snare", "snare-1", "corp:hq");
    s.cards["bio-1"] = bio;
    s.cards["ff-1"] = filter;
    s.cards["snare-1"] = snare;
    s.runner.installed = ["bio-1", "ff-1"];
    s.runner.credits = 8;
    s.runner.hand = ["g1", "g2", "g3"];
    for (const id of s.runner.hand) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    }

    const one = evalEffect(
      { state: s, sourceId: "snare-1" },
      { op: "do", action: { kind: "net_damage", amount: 1 } },
    );
    expect(one.ok).toBe(true);
    expect(s.pendingDamage).toMatchObject({ type: "net", remaining: 1 });
    expect(
      legalActions(s).some(
        (action) =>
          action.type === "use_paid_ability" &&
          action.abilityId === "bio-modeled-prevent",
      ),
    ).toBe(false);
    const refused = applyAction(s, {
      type: "use_paid_ability",
      cardId: "bio-1",
      abilityId: "bio-modeled-prevent",
    });
    expect(refused.ok).toBe(false);
    expect(s.runner.installed).toContain("bio-1");
    s = must(s, { type: "accept_damage" });
    expect(s.runner.hand).toHaveLength(2);

    const four = evalEffect(
      { state: s, sourceId: "snare-1" },
      { op: "do", action: { kind: "net_damage", amount: 4 } },
    );
    expect(four.ok).toBe(true);
    expect(s.pendingDamage?.remaining).toBe(4);
    s = must(s, {
      type: "use_paid_ability",
      cardId: "bio-1",
      abilityId: "bio-modeled-prevent",
    });
    const set = at(s.log, "Expected net damage is set to 1");
    expect(s.log[set]).toContain(CR.preventAllButOne.number);
    expect(s.pendingDamage).toMatchObject({ type: "net", remaining: 1 });
    expect(s.runner.installed).not.toContain("bio-1");
    expect(s.runner.discardPile).toContain("bio-1");
    s = must(s, {
      type: "use_paid_ability",
      cardId: "ff-1",
      abilityId: "ff-net",
    });
    expect(s.pendingDamage?.remaining).toBe(0);
    expect(s.runner.credits).toBe(5);
    s = must(s, { type: "accept_damage" });
    expect(s.pendingDamage).toBeNull();
    expect(s.runner.hand).toHaveLength(2);
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

  it("does not add The Cleaners to damage the Runner suffers (CR 10.4.1.ex1)", () => {
    let s = createInitialState();
    const argus = instantiateCard(
      "argus-security-protection-guaranteed",
      "argus-1",
      "corp:identity",
    );
    const cleaners = instantiateCard("the-cleaners", "cl-1", "corp:score");
    const punitive = instantiateCard(
      "punitive-counterstrike",
      "pun-1",
      "corp:hq",
    );
    const spoof = instantiateCard(
      "biometric-spoofing",
      "spoof-1",
      "runner:installed",
    );
    s.cards["argus-1"] = argus;
    s.cards["cl-1"] = cleaners;
    s.cards["pun-1"] = punitive;
    s.cards["spoof-1"] = spoof;
    s.corp.identityId = "argus-1";
    s.corp.scoreArea = ["cl-1"];
    s.runner.installed = ["spoof-1"];
    s.runner.hand = ["g1", "g2", "g3", "g4", "g5"];
    for (const id of s.runner.hand) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    }

    const stolen = evalEffect(
      { state: s, sourceId: "argus-1" },
      argus.onAgendaStolen!,
    );
    expect(stolen.ok).toBe(true);
    s = must(s, { type: "choose_option", optionId: "meat" });
    const suffered = at(s.log, "The Runner suffers the meat damage");
    expect(s.log[suffered]).toContain(CR.sufferDamage.number);
    expect(s.log.some((line) => line.includes("Meat damage increased"))).toBe(
      false,
    );
    expect(s.pendingDamage).toMatchObject({ type: "meat", remaining: 2 });
    s = must(s, { type: "accept_damage" });
    expect(s.runner.hand).toHaveLength(3);

    s.turn.agendaPointsStolenLastTurn = 2;
    const struck = evalEffect(
      { state: s, sourceId: "pun-1" },
      {
        op: "do",
        action: { kind: "meat_damage_stolen_last_turn" },
      },
    );
    expect(struck.ok).toBe(true);
    expect(s.log.some((line) => line.includes("Meat damage increased"))).toBe(
      true,
    );
    expect(s.pendingDamage).toMatchObject({ type: "meat", remaining: 3 });
  });

  it("does not let Jesminder avoid AMAZE tags after the run has ended (CR 10.3.6.ex1)", () => {
    const s = createInitialState();
    const jes = instantiateCard(
      "jesminder-sareen-girl-behind-the-curtain",
      "jes-1",
      "runner:identity",
    );
    const amaze = instantiateCard("amaze-amusements", "amaze-1", "server:hq:root");
    amaze.rezzed = true;
    amaze.faceup = true;
    s.cards["jes-1"] = jes;
    s.cards["amaze-1"] = amaze;
    s.runner.identityId = "jes-1";
    s.servers.hq.root.push("amaze-1");
    s.runner.tags = 0;
    s.run = {
      attackedServerId: "hq",
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
      agendasStolenThisRun: 1,
      persistentTagsIfAgendaStolen: 2,
    };
    s.timingKey = "run.movement";
    enterStep(s, "run.ends");
    autoWalk(s);
    const closed = at(s.log, "the run has ended, so this tag is not during a run");
    expect(s.log[closed]).toContain(CR.checkpointAfterTimingStructure.number);
    expect(s.runner.tags).toBe(2);
    expect(s.run).toBeNull();
  });

  it("keeps AMAZE's pending run-end ability after AMAZE is trashed (CR 9.12.5d)", () => {
    const s = createInitialState();
    const amaze = instantiateCard("amaze-amusements", "amaze-1", "corp:archives");
    amaze.rezzed = false;
    amaze.faceup = true;
    s.cards["amaze-1"] = amaze;
    s.corp.discardPile.push("amaze-1");
    s.runner.tags = 0;
    s.run = {
      attackedServerId: "hq",
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
      agendasStolenThisRun: 1,
      persistentTagsIfAgendaStolen: 2,
      persistentAmazeSourceId: "amaze-1",
    };
    enterStep(s, "run.ends");
    autoWalk(s);
    expect(s.runner.tags).toBe(2);
    expect(s.log.join("\n")).toContain(CR.persistentAbility.number);
    expect(s.run).toBeNull();
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

  it("makes the Corp pay Archer's forfeit when False Echo offers the rez (CR 9.12.3e)", () => {
    const start = (): GameState => {
      const s = createInitialState();
      const echo = instantiateCard("false-echo", "echo-1", "runner:installed");
      const archer = instantiateCard("archer", "arch-1", "server:hq:ice");
      const agenda = instantiateCard("hostile-takeover", "agenda-1", "corp:scored");
      s.cards["echo-1"] = echo;
      s.cards["arch-1"] = archer;
      s.cards["agenda-1"] = agenda;
      s.runner.installed = ["echo-1"];
      s.servers.hq.ice = ["arch-1"];
      s.corp.scoreArea = ["agenda-1"];
      s.corp.credits = 4;
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
        lastPassedUnrezzedIceId: "arch-1",
      };
      return s;
    };

    const payable = start();
    const offered = evalEffect(
      { state: payable, sourceId: "echo-1" },
      fx.do({ kind: "trash_then_corp_rez_or_hq" }),
    );
    expect(offered.ok).toBe(true);
    expect(payable.pendingChoice?.options.map((option) => option.id)).toEqual([
      "rez",
      "hq",
    ]);
    const rezzed = must(payable, { type: "choose_option", optionId: "rez" });
    expect(rezzed.cards["arch-1"]?.rezzed).toBe(true);
    expect(rezzed.corp.credits).toBe(0);
    expect(rezzed.corp.scoreArea).not.toContain("agenda-1");
    expect(rezzed.corp.discardPile).toContain("agenda-1");
    expect(rezzed.log.join("\n")).toContain(CR.mustNotForceAdditionalCost.number);

    const broke = start();
    broke.corp.credits = 3;
    const onlyHq = evalEffect(
      { state: broke, sourceId: "echo-1" },
      fx.do({ kind: "trash_then_corp_rez_or_hq" }),
    );
    expect(onlyHq.ok).toBe(true);
    expect(broke.pendingChoice?.options.map((option) => option.id)).toEqual(["hq"]);
  });

  it("trashes the Kitsune whose subroutine resolved, not another copy (CR 10.1.5.ex1)", () => {
    const s = createInitialState();
    const kitsune = instantiateCard("kitsune", "kit-1", "server:hq:ice");
    kitsune.rezzed = true;
    kitsune.faceup = true;
    const other = instantiateCard("kitsune", "kit-2", "server:rd:ice");
    other.rezzed = true;
    other.faceup = true;
    s.cards["kit-1"] = kitsune;
    s.cards["kit-2"] = other;
    s.servers.hq.ice = ["kit-1"];
    s.servers.rd.ice = ["kit-2"];
    s.run = {
      attackedServerId: "hq",
      phase: "breach",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: 0,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      kitsuneIceToTrashAtBreachEnd: "kit-1",
    };
    enterStep(s, "breach.complete");
    autoWalk(s);
    expect(s.corp.discardPile).toContain("kit-1");
    expect(s.servers.hq.ice).not.toContain("kit-1");
    expect(s.servers.rd.ice).toContain("kit-2");
    expect(s.log.join("\n")).toContain(CR.selfReference.number);
  });

  it("lets the Corp choose how many times two Wormholes loop (CR 10.1.6a.ex1)", () => {
    const s = createInitialState();
    const first = instantiateCard("wormhole", "worm-1", "server:hq:ice");
    const second = instantiateCard("wormhole", "worm-2", "server:rd:ice");
    first.rezzed = true;
    second.rezzed = true;
    s.cards["worm-1"] = first;
    s.cards["worm-2"] = second;
    s.servers.hq.ice = ["worm-1"];
    s.servers.rd.ice = ["worm-2"];
    const offered = evalEffect(
      { state: s, sourceId: "worm-1" },
      first.subroutines?.[0]?.effect ??
        fx.do({ kind: "may_resolve_subroutine_on_rezzed_ice", subtype: "" }),
    );
    expect(offered.ok).toBe(true);
    expect(s.pendingChoice?.loopCount).toBe(true);
    const ended = must(s, { type: "choose_option", optionId: "loop-times:2157" });
    expect(ended.pendingChoice).toBeNull();
    expect(ended.log.join("\n")).toContain("2157");
    expect(ended.log.join("\n")).toContain(CR.mandatoryLoop.number);
    expect(ended.cards["worm-1"]?.rezzed).toBe(true);
    expect(ended.cards["worm-2"]?.rezzed).toBe(true);
  });

  it("trashes Chisel when the ice it is hosted on is rezzed Tithonium (CR 10.3.1e.ex1)", () => {
    const s = createInitialState();
    const ice = instantiateCard("tithonium", "tith-1", "server:hq:ice");
    ice.rezzed = false;
    ice.faceup = false;
    const chisel = instantiateCard("chisel", "chisel-1", "hosted:tith-1");
    chisel.hostId = "tith-1";
    ice.hostedCardIds = ["chisel-1"];
    s.cards["tith-1"] = ice;
    s.cards["chisel-1"] = chisel;
    s.servers.hq.ice = ["tith-1"];
    occurCheckpoint(s, "timing", "before rez", [CR.checkpointCardRestrictions], "test");
    expect(s.cards["chisel-1"]?.zone).toBe("hosted:tith-1");
    ice.rezzed = true;
    ice.faceup = true;
    occurCheckpoint(s, "timing", "after rez", [CR.checkpointCardRestrictions], "test");
    expect(s.runner.discardPile).toContain("chisel-1");
    expect(ice.hostedCardIds ?? []).not.toContain("chisel-1");
    expect(s.log.join("\n")).toContain(CR.checkpointCardRestrictions.number);
  });

  it("lets the Runner choose a minimal memory set after Bad Times (CR 10.3.1e)", () => {
    const s = createInitialState();
    const install = (id: string, memoryCost: number) => {
      const card = instantiateCard("parasite", id, "runner:installed");
      card.memoryCost = memoryCost;
      s.cards[id] = card;
      s.runner.installed.push(id);
    };
    install("mu-1", 1);
    install("mu-2", 1);
    install("mu-3", 2);
    s.turn.runnerMuModifierUntilTurnEnd = -2;
    const from = s.log.length;
    occurCheckpoint(s, "timing", "Bad Times", [CR.checkpointCardRestrictions], "test");
    expect(s.checkpoints).toHaveLength(1);
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(s.pendingChoice?.options.map((option) => option.id).sort()).toEqual([
      "restrict:mu-1,mu-2|*",
      "restrict:mu-3|*",
    ]);
    expect(s.log.slice(from).some((line) => line.includes("Hosted on agendas"))).toBe(
      false,
    );
    expect(s.log.join("\n")).toContain(
      `Card restrictions checked (CR ${CR.checkpointCardRestrictions.number}); the Runner chooses which set to trash.`,
    );

    const chosen = must(s, {
      type: "choose_option",
      optionId: "restrict:mu-3|*",
    });
    expect(chosen.pendingChoice).toBeNull();
    expect(chosen.checkpoints).toHaveLength(0);
    expect(chosen.cards["mu-3"]?.zone).toBe("runner:heap");
    expect(chosen.runner.installed).toEqual(["mu-1", "mu-2"]);
    expect(chosen.log.join("\n")).toContain(
      `Parasite trashed (CR ${CR.checkpointCardRestrictions.number}).`,
    );
    const lines = chosen.log.slice(from);
    const trash = at(lines, "Parasite trashed");
    const hosted = at(lines, "Hosted on agendas checked");
    expect(trash).toBeLessThan(hosted);
  });

  it("trashes the only minimal memory set without a choice (CR 10.3.1e)", () => {
    const s = createInitialState();
    const card = instantiateCard("parasite", "mu-1", "runner:installed");
    card.memoryCost = 2;
    s.cards["mu-1"] = card;
    s.runner.installed = ["mu-1"];
    s.runner.memoryLimit = 2;
    s.turn.runnerMuModifierUntilTurnEnd = -2;
    occurCheckpoint(s, "timing", "Bad Times", [CR.checkpointCardRestrictions], "test");
    expect(s.pendingChoice).toBeNull();
    expect(s.checkpoints).toHaveLength(0);
    expect(s.cards["mu-1"]?.zone).toBe("runner:heap");
    expect(s.log.join("\n")).toContain("Hosted on agendas checked");
  });

  it("lets the Corp choose which remote servers to keep (CR 4.6.8f)", () => {
    const s = createInitialState();
    const identity = s.cards[s.corp.identityId];
    if (!identity) throw new Error("missing corp identity");
    identity.maxRemoteServers = 1;
    const first = instantiateCard("pad-campaign", "pad-1", "server:remote-1:root");
    const second = instantiateCard("pad-campaign", "pad-2", "server:remote-2:root");
    first.rezzed = true;
    second.rezzed = true;
    s.cards["pad-1"] = first;
    s.cards["pad-2"] = second;
    s.servers["remote-1"] = { id: "remote-1", kind: "remote", ice: [], root: ["pad-1"] };
    s.servers["remote-2"] = { id: "remote-2", kind: "remote", ice: [], root: ["pad-2"] };
    occurCheckpoint(s, "timing", "remote limit", [CR.checkpointCardRestrictions], "test");
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.map((option) => option.id).sort()).toEqual([
      "restrict:|remote-1",
      "restrict:|remote-2",
    ]);
    const kept = must(s, { type: "choose_option", optionId: "restrict:|remote-1" });
    expect(kept.servers["remote-1"]?.root).toEqual(["pad-1"]);
    expect(kept.servers["remote-2"]).toBeUndefined();
    expect(kept.cards["pad-2"]?.zone).toBe("corp:archives");
    expect(kept.checkpoints).toHaveLength(0);
    expect(kept.pendingChoice).toBeNull();
  });

  it("lets the Runner add a card Drafter installed in the breached root (CR 10.3.1j)", () => {
    const s = createInitialState();
    const pad = instantiateCard("pad-campaign", "pad-1", "corp:hq");
    s.cards["pad-1"] = pad;
    s.corp.hand = ["pad-1"];
    s.timing.structure = "breach";
    s.run = {
      attackedServerId: "hq",
      phase: "breach",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: 0,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    const installed = evalEffect(
      { state: s, sourceId: "drafter-1" },
      fx.do({ kind: "install_from_hq_or_archives" }),
    );
    expect(installed.ok).toBe(true);
    expect(s.servers.hq.root).toContain("pad-1");
    expect(s.pendingChoice?.options.map((option) => option.id)).toEqual([
      "root-access:yes:pad-1",
      "root-access:no:pad-1",
    ]);
    const added = must(s, { type: "choose_option", optionId: "root-access:yes:pad-1" });
    expect(added.run?.accessCandidates).toContain("pad-1");
    expect(added.pendingChoice).toBeNull();
    expect(added.log.join("\n")).toContain(CR.checkpointCardEnteringRoot.number);
  });

  it("leaves Drafter's install out of the breach when the Runner declines (CR 10.3.1j)", () => {
    const s = createInitialState();
    const pad = instantiateCard("pad-campaign", "pad-2", "corp:hq");
    s.cards["pad-2"] = pad;
    s.corp.hand = ["pad-2"];
    s.timing.structure = "breach";
    s.run = {
      attackedServerId: "hq",
      phase: "breach",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: ["already"],
      randomAccessLimit: 0,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    evalEffect(
      { state: s, sourceId: "drafter-1" },
      fx.do({ kind: "install_from_hq_or_archives" }),
    );
    const declined = must(s, { type: "choose_option", optionId: "root-access:no:pad-2" });
    expect(declined.servers.hq.root).toContain("pad-2");
    expect(declined.run?.accessCandidates).toEqual(["already"]);
  });

  it("flatlines before I've Had Worse can draw (CR 10.4.3)", () => {
    const s = createInitialState();
    const worse = instantiateCard("ive-had-worse", "worse-1", "runner:grip");
    const boom = instantiateCard("hedge-fund", "boom-1", "corp:hq");
    s.cards["worse-1"] = worse;
    s.cards["boom-1"] = boom;
    s.runner.hand = ["worse-1", "g1", "g2", "g3"];
    for (const id of ["g1", "g2", "g3"]) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    }
    const deckBefore = s.runner.deck.length;
    const dealt = evalEffect(
      { state: s, sourceId: "boom-1" },
      { op: "do", action: { kind: "meat_damage", amount: 7 } },
    );
    expect(dealt.ok).toBe(true);
    const skipped = at(s.log, "I've Had Worse does not resolve");
    expect(s.log[skipped]).toContain(CR.multipleDamageSimultaneous.number);
    expect(s.winner).toBe("corp");
    expect(s.runner.deck).toHaveLength(deckBefore);
    expect(s.runner.hand).toEqual([]);
    expect(s.runner.discardPile).toContain("worse-1");
  });

  it("lets the Runner bid a hosted credit and not a credit they cannot spend (CR 10.14.3.ex1)", () => {
    let s = createInitialState();
    const fencer = instantiateCard("fencer-fueno", "fen-1", "runner:installed");
    fencer.hostedCredits = 1;
    const adrian = instantiateCard("adrian-seis", "adrian-1", "server:hq:root");
    adrian.rezzed = true;
    s.cards["fen-1"] = fencer;
    s.cards["adrian-1"] = adrian;
    s.runner.installed = ["fen-1"];
    s.runner.credits = 0;
    s.corp.credits = 5;
    s.run = {
      attackedServerId: "hq",
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
    const opened = evalEffect(
      { state: s, sourceId: "adrian-1" },
      { op: "do", action: { kind: "play_psi_game", maxBid: 2 } },
    );
    expect(opened.ok).toBe(true);
    const bids = legalActions(s)
      .filter((action) => action.type === "psi_runner_bid")
      .map((action) => action.amount);
    expect(bids).toEqual([0, 1]);
    s = must(s, { type: "psi_runner_bid", amount: 1 });
    const bid = at(s.log, "Runner bids 1¢");
    expect(s.log[bid]).toContain(CR.bidPossible.number);
    expect(s.cards["fen-1"]!.hostedCredits).toBe(1);
    expect(s.runner.credits).toBe(0);
    expect(s.psi?.runnerBid).toBe(1);
    s = must(s, { type: "psi_corp_bid", amount: 0 });
    expect(s.log.some((line) => line.includes("Spend 1¢ from Fencer Fueno"))).toBe(
      true,
    );
    expect(s.log.join("\n")).toContain(CR.psiRevealSpend.number);
    expect(s.cards["fen-1"]!.hostedCredits).toBe(0);

    s.psi = null;
    s.run.runnerCannotSpendCreditsForRun = true;
    s.cards["fen-1"]!.hostedCredits = 1;
    s.runner.credits = 5;
    evalEffect(
      { state: s, sourceId: "adrian-1" },
      { op: "do", action: { kind: "play_psi_game", maxBid: 2 } },
    );
    const locked = legalActions(s)
      .filter((action) => action.type === "psi_runner_bid")
      .map((action) => action.amount);
    expect(locked).toEqual([0]);
  });

  it("keeps Dirty Laundry in the play area until the run it started has begun (CR 8.6.5)", () => {
    let s = createInitialState();
    const ev = instantiateCard("dirty-laundry", "dl-1", "runner:grip");
    s.cards["dl-1"] = ev;
    s.runner.hand = ["dl-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    for (const id of s.corp.hand) {
      const held = s.cards[id];
      if (held) held.zone = "corp:rd";
      s.corp.deck.push(id);
    }
    s.corp.hand = [];

    s = must(s, { type: "play_event", cardId: "dl-1", serverId: "hq" });

    const remains = at(s.log, "Dirty Laundry remains in the play area");
    const begins = at(s.log, "Run begins");
    const trashed = at(s.log, "Dirty Laundry trashed");
    expect(remains).toBeLessThan(begins);
    expect(begins).toBeLessThan(trashed);
    expect(s.log[remains]).toContain(CR.playingTimingStructure.number);
    expect(s.log[trashed]).toContain(CR.trashPlayedCard.number);
    expect(s.cards["dl-1"]?.zone).toBe("runner:heap");
    expect(s.run).toBeNull();
    expect(s.checkpoints).toHaveLength(0);
  });

  it("completes Stimhack's play after its end-of-run damage and trash (CR 8.6.5 / 8.6.7i)", () => {
    let s = createInitialState();
    const ev = instantiateCard("stimhack", "sh-1", "runner:grip");
    s.cards["sh-1"] = ev;
    s.runner.hand = [...s.runner.hand, "sh-1"];
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    for (const id of s.corp.hand) {
      const held = s.cards[id];
      if (held) held.zone = "corp:rd";
      s.corp.deck.push(id);
    }
    s.corp.hand = [];

    s = must(s, { type: "play_event", cardId: "sh-1", serverId: "hq" });

    const damage = at(s.log, "core damage 1:");
    const trashed = at(s.log, "Stimhack trashed");
    const complete = at(s.log, "Play effect complete");
    const instruction = at(s.log, "Checkpoint open [instruction]");
    expect(damage).toBeLessThan(trashed);
    expect(trashed).toBeLessThan(complete);
    expect(complete).toBeLessThan(instruction);
    expect(s.log[complete]).toContain(CR.playComplete.number);
    expect(s.cards["sh-1"]?.zone).toBe("runner:heap");
    expect(s.run).toBeNull();
    expect(s.checkpoints).toHaveLength(0);
  });

  it("does not trash Ashen Epilogue after its last ability removes it from the game (CR 8.6.6a.ex1)", () => {
    let s = createInitialState();
    const ev = instantiateCard("ashen-epilogue", "ae-1", "runner:grip");
    s.cards["ae-1"] = ev;
    s.runner.hand = [...s.runner.hand, "ae-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "play_event", cardId: "ae-1" });

    const removed = at(s.log, "Ashen Epilogue is removed from the game");
    const skipped = at(s.log, "Ashen Epilogue is not trashed");
    const complete = at(s.log, "Play effect complete");
    expect(removed).toBeLessThan(skipped);
    expect(skipped).toBeLessThan(complete);
    expect(s.log[skipped]).toContain(CR.playNoTrashLeftPlayArea.number);
    expect(s.cards["ae-1"]?.zone).toBe("removed-from-game");
    expect(s.runner.discardPile).not.toContain("ae-1");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("hosts On the Lam instead of trashing it (CR 8.6.6b)", () => {
    let s = createInitialState();
    const res = instantiateCard("daily-casts", "dc-1", "runner:installed");
    s.cards["dc-1"] = res;
    s.runner.installed = ["dc-1"];
    const ev = instantiateCard("on-the-lam", "otl-1", "runner:grip");
    s.cards["otl-1"] = ev;
    s.runner.hand = ["otl-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "play_event", cardId: "otl-1" });
    expect(s.cards["otl-1"]?.zone).toBe("runner:play-area");
    expect(s.pendingChoice).not.toBeNull();

    s = must(s, { type: "choose_option", optionId: "host:dc-1" });

    const hosted = at(s.log, "Host On the Lam on Daily Casts");
    const skipped = at(s.log, "On the Lam is not trashed");
    const complete = at(s.log, "Play effect complete");
    expect(hosted).toBeLessThan(skipped);
    expect(skipped).toBeLessThan(complete);
    expect(s.log[skipped]).toContain(CR.playNoTrashHosted.number);
    expect(s.cards["otl-1"]?.zone).toBe("hosted:dc-1");
    expect(s.cards["otl-1"]?.hostId).toBe("dc-1");
    expect(s.cards["dc-1"]?.hostedCardIds).toContain("otl-1");
    expect(s.runner.discardPile).not.toContain("otl-1");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("does not trash NAPD Cordon at the trash step; it remains until the Corp's next turn begins (CR 8.6.6c)", () => {
    let s = createInitialState();
    const op = instantiateCard("napd-cordon", "nc-1", "corp:hq");
    s.cards["nc-1"] = op;
    s.corp.hand = ["nc-1"];
    s.corp.clicks = 1;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";

    s = must(s, { type: "play_operation", cardId: "nc-1" });

    const resolve = at(s.log, "Resolve play abilities of NAPD Cordon");
    const skipped = at(s.log, "NAPD Cordon is not trashed");
    const complete = at(s.log, "Play effect complete");
    expect(resolve).toBeLessThan(skipped);
    expect(skipped).toBeLessThan(complete);
    expect(s.log[skipped]).toContain(CR.playNotTrashedUntil.number);
    expect(s.cards["nc-1"]?.zone).toBe("corp:play-area");
    expect(s.corp.discardPile).not.toContain("nc-1");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("does not trash Petty Cash played from Archives; it is removed after it resolves (CR 8.6.6d)", () => {
    let s = createInitialState();
    const op = instantiateCard("petty-cash", "pc-1", "corp:archives");
    s.cards["pc-1"] = op;
    s.corp.discardPile = ["pc-1"];
    s.corp.credits = 5;
    s.corp.clicks = 1;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";

    s = must(s, {
      type: "use_paid_ability",
      cardId: "pc-1",
      abilityId: "petty-cash-archives",
    });

    const gain = at(s.log, "corp gains 5¢");
    const skipped = at(s.log, "Petty Cash is not trashed");
    const removed = at(s.log, "Petty Cash is removed from the game");
    expect(gain).toBeLessThan(skipped);
    expect(skipped).toBeLessThan(removed);
    expect(s.log[skipped]).toContain(CR.playNoTrashIfPlayEffectWillRfg.number);
    expect(s.cards["pc-1"]?.zone).toBe("removed-from-game");
    expect(s.corp.discardPile).not.toContain("pc-1");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("chooses X when Recruiting Trip's play cost is paid and keeps that X (CR 8.6.2a)", () => {
    let s = createInitialState();
    const op = instantiateCard("recruiting-trip", "rt-1", "corp:hq");
    const sysop = instantiateCard("simone-diego", "sd-1", "corp:rd");
    s.cards["rt-1"] = op;
    s.cards["sd-1"] = sysop;
    s.corp.hand = ["rt-1"];
    s.corp.deck.unshift("sd-1");
    s.corp.credits = 3;
    s.corp.clicks = 1;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";

    s = must(s, { type: "play_operation", cardId: "rt-1" });
    expect(s.pendingChoice?.options.some((o) => o.id === "play-cost-x:1")).toBe(true);
    expect(s.corp.credits).toBe(3);
    expect(s.cards["rt-1"]?.zone).toBe("corp:play-area");

    s = must(s, { type: "choose_option", optionId: "play-cost-x:1" });

    const chosen = at(s.log, "X chosen as 1");
    const paid = at(s.log, "Play cost of 1¢ paid");
    const resolve = at(s.log, "Resolve play abilities of Recruiting Trip");
    const used = at(s.log, "Recruiting Trip — shuffle R&D (X=1)");
    const complete = at(s.log, "Play effect complete");
    expect(chosen).toBeLessThan(paid);
    expect(paid).toBeLessThan(resolve);
    expect(resolve).toBeLessThan(used);
    expect(used).toBeLessThan(complete);
    expect(s.log[chosen]).toContain(CR.playCostX.number);
    expect(s.corp.credits).toBe(2);
    expect(s.corp.hand).toContain("sd-1");
    expect(s.cards["rt-1"]?.zone).toBe("corp:archives");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("plays Hedge Fund through Subcontract before IPO, and IPO is paid with those credits (CR 8.6.3.ex1)", () => {
    let s = createInitialState();
    const sub = instantiateCard("subcontract", "sc-1", "corp:hq");
    const hedge = instantiateCard("hedge-fund", "hf-1", "corp:hq");
    const ipo = instantiateCard("ipo", "ipo-1", "corp:hq");
    s.cards["sc-1"] = sub;
    s.cards["hf-1"] = hedge;
    s.cards["ipo-1"] = ipo;
    s.corp.hand = ["sc-1", "hf-1", "ipo-1"];
    s.corp.credits = 5;
    s.corp.clicks = 1;
    s.runner.tags = 1;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";

    s = must(s, { type: "play_operation", cardId: "sc-1" });
    expect(s.pendingChoice?.options.some((o) => o.id === "subcontract-play:hf-1")).toBe(true);

    s = must(s, { type: "choose_option", optionId: "subcontract-play:hf-1" });
    const separate = at(s.log, "Hedge Fund is played separately");
    const paid = at(s.log, "Play cost of 5¢ paid");
    const gain = at(s.log, "corp gains 9¢");
    const trashed = at(s.log, "Hedge Fund trashed");
    const complete = at(s.log, "Play effect complete");
    expect(separate).toBeLessThan(paid);
    expect(paid).toBeLessThan(gain);
    expect(gain).toBeLessThan(trashed);
    expect(trashed).toBeLessThan(complete);
    expect(s.log[separate]).toContain(CR.playingOneAtATime.number);
    expect(s.corp.credits).toBe(9);
    expect(s.cards["hf-1"]?.zone).toBe("corp:archives");
    expect(s.corp.hand).toContain("ipo-1");
    expect(s.pendingChoice?.options.some((o) => o.id === "subcontract-play:ipo-1")).toBe(true);
    expect(s.log.some((line) => line.includes("Play cost of 8¢ paid"))).toBe(false);

    s = must(s, { type: "choose_option", optionId: "subcontract-play:ipo-1" });
    const ipoSeparate = at(s.log, "IPO is played separately");
    const ipoPaid = at(s.log, "Play cost of 8¢ paid");
    const ipoGain = at(s.log, "corp gains 13¢");
    expect(complete).toBeLessThan(ipoSeparate);
    expect(ipoSeparate).toBeLessThan(ipoPaid);
    expect(ipoPaid).toBeLessThan(ipoGain);
    expect(s.log[ipoSeparate]).toContain(CR.playingOneAtATime.number);
    expect(s.corp.credits).toBe(14);
    expect(s.cards["ipo-1"]?.zone).toBe("corp:archives");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("trashes Test Run once its lingering effect exists, and that effect returns the program at the end of the turn (CR 8.6.4.ex1)", () => {
    let s = createInitialState();
    const ev = instantiateCard("test-run", "tr-1", "runner:grip");
    const program = instantiateCard("corroder", "co-1", "runner:stack");
    s.cards["tr-1"] = ev;
    s.cards["co-1"] = program;
    s.runner.hand = ["tr-1"];
    s.runner.deck = ["co-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "play_event", cardId: "tr-1" });

    const linger = at(s.log, "creates a lingering effect");
    const trashed = at(s.log, "Test Run trashed");
    const complete = at(s.log, "Play effect complete");
    expect(linger).toBeLessThan(trashed);
    expect(trashed).toBeLessThan(complete);
    expect(s.log[linger]).toContain("independent of Test Run");
    expect(s.log[linger]).toContain(CR.playingLingeringEffects.number);
    expect(s.cards["tr-1"]?.zone).toBe("runner:heap");
    expect(s.cards["co-1"]?.zone).toBe("runner:installed");
    expect(s.checkpoints).toHaveLength(0);

    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "discard_to_hand_size" });
    expect(s.cards["co-1"]?.zone).toBe("runner:installed");
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });

    const returned = s.log.findIndex(
      (line) => line === "Corroder returns to the stack at the end of the turn.",
    );
    expect(returned, "end of turn").toBeGreaterThanOrEqual(0);
    expect(complete).toBeLessThan(returned);
    expect(s.log[returned]).not.toContain("Test Run");
    expect(s.cards["co-1"]?.zone).toBe("runner:stack");
    expect(s.runner.installed).not.toContain("co-1");
    expect(s.cards["tr-1"]?.zone).toBe("runner:heap");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("looks at every card in the stack when Special Order searches for an icebreaker (CR 8.7.1)", () => {
    let s = createInitialState();
    const ev = instantiateCard("special-order", "so-1", "runner:grip");
    const event = instantiateCard("sure-gamble", "sg-1", "runner:stack");
    const resource = instantiateCard("daily-casts", "dc-1", "runner:stack");
    const breaker = instantiateCard("corroder", "co-1", "runner:stack");
    s.cards["so-1"] = ev;
    s.cards["sg-1"] = event;
    s.cards["dc-1"] = resource;
    s.cards["co-1"] = breaker;
    s.runner.hand = ["so-1"];
    s.runner.deck = ["sg-1", "dc-1", "co-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "play_event", cardId: "so-1" });
    s = must(s, { type: "choose_option", optionId: "search-find:co-1" });

    const look = at(s.log, "looks at all 3 card(s) in the stack");
    const found = at(s.log, "add Corroder to grip");
    const complete = at(s.log, "Play effect complete");
    expect(look).toBeLessThan(found);
    expect(found).toBeLessThan(complete);
    expect(s.log[look]).toContain(CR.search.number);
    expect(s.log[look]).not.toContain("Sure Gamble");
    expect(s.log[look]).not.toContain("Daily Casts");
    expect(s.cards["co-1"]?.zone).toBe("runner:grip");
    expect(s.runner.hand).toContain("co-1");
    expect(s.runner.deck).toContain("sg-1");
    expect(s.runner.deck).toContain("dc-1");
    expect(s.cards["so-1"]?.zone).toBe("runner:heap");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("lets the Runner look at the stack only while Special Order's search is open (CR 8.7.1a)", () => {
    let s = createInitialState();
    const ev = instantiateCard("special-order", "so-1", "runner:grip");
    const event = instantiateCard("sure-gamble", "sg-1", "runner:stack");
    const resource = instantiateCard("daily-casts", "dc-1", "runner:stack");
    const breaker = instantiateCard("corroder", "co-1", "runner:stack");
    s.cards["so-1"] = ev;
    s.cards["sg-1"] = event;
    s.cards["dc-1"] = resource;
    s.cards["co-1"] = breaker;
    s.runner.hand = ["so-1"];
    s.runner.deck = ["sg-1", "dc-1", "co-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "play_event", cardId: "so-1" });
    s = must(s, { type: "choose_option", optionId: "search-find:co-1" });

    const allowed = at(s.log, "Runner may look at the stack for this search");
    const look = at(s.log, "looks at all 3 card(s) in the stack");
    const ended = at(s.log, "Runner may no longer look at the stack");
    const found = at(s.log, "add Corroder to grip");
    const complete = at(s.log, "Play effect complete");
    expect(allowed).toBeLessThan(look);
    expect(look).toBeLessThan(ended);
    expect(ended).toBeLessThan(found);
    expect(found).toBeLessThan(complete);
    expect(s.log[allowed]).toContain("hidden from the Corp");
    expect(s.log[allowed]).toContain(CR.searchHiddenSecretZone.number);
    expect(s.log[ended]).toContain(CR.searchHiddenSecretZone.number);
    expect(s.log[allowed]).not.toContain("Sure Gamble");
    expect(s.log[allowed]).not.toContain("Daily Casts");
    expect(s.log[ended]).not.toContain("Sure Gamble");
    expect(s.log[ended]).not.toContain("Daily Casts");
    expect(mayLookAtHiddenZone(s, "runner")).toBe(false);
    expect(mayLookAtHiddenZone(s, "corp")).toBe(false);
    expect(s.turn.hiddenZoneSearch).toMatchObject({
      viewer: "runner",
      hiddenFrom: "corp",
      zone: "runner:stack",
      open: false,
      cardIds: ["sg-1", "dc-1", "co-1"],
    });
    expect(s.cards["so-1"]?.zone).toBe("runner:heap");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("sets Corroder aside facedown when Special Order finds it, before the search is complete (CR 8.7.2)", () => {
    let s = createInitialState();
    const ev = instantiateCard("special-order", "so-1", "runner:grip");
    const event = instantiateCard("sure-gamble", "sg-1", "runner:stack");
    const resource = instantiateCard("daily-casts", "dc-1", "runner:stack");
    const breaker = instantiateCard("corroder", "co-1", "runner:stack");
    s.cards["so-1"] = ev;
    s.cards["sg-1"] = event;
    s.cards["dc-1"] = resource;
    s.cards["co-1"] = breaker;
    s.runner.hand = ["so-1"];
    s.runner.deck = ["sg-1", "dc-1", "co-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "play_event", cardId: "so-1" });
    s = must(s, { type: "choose_option", optionId: "search-find:co-1" });

    const look = at(s.log, "looks at all 3 card(s) in the stack");
    const aside = at(s.log, "found and set aside facedown");
    const ended = at(s.log, "Runner may no longer look at the stack");
    const complete = at(s.log, "Play effect complete");
    expect(look).toBeLessThan(aside);
    expect(aside).toBeLessThan(ended);
    expect(ended).toBeLessThan(complete);
    expect(s.log[aside]).toContain(CR.find.number);
    expect(s.log[aside]).not.toContain("Corroder");
    expect(s.runner.deck).not.toContain("co-1");
    expect(s.runner.setAside ?? []).not.toContain("co-1");
    expect(s.cards["so-1"]?.zone).toBe("runner:heap");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("reveals Corroder only after Special Order's search is complete (CR 8.7.2c)", () => {
    let s = createInitialState();
    const ev = instantiateCard("special-order", "so-1", "runner:grip");
    const event = instantiateCard("sure-gamble", "sg-1", "runner:stack");
    const resource = instantiateCard("daily-casts", "dc-1", "runner:stack");
    const breaker = instantiateCard("corroder", "co-1", "runner:stack");
    s.cards["so-1"] = ev;
    s.cards["sg-1"] = event;
    s.cards["dc-1"] = resource;
    s.cards["co-1"] = breaker;
    s.runner.hand = ["so-1"];
    s.runner.deck = ["sg-1", "dc-1", "co-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "play_event", cardId: "so-1" });
    s = must(s, { type: "choose_option", optionId: "search-find:co-1" });

    const aside = at(s.log, "found and set aside facedown");
    const ended = at(s.log, "Runner may no longer look at the stack");
    const revealed = at(s.log, "Corroder revealed");
    const complete = at(s.log, "Play effect complete");
    expect(aside).toBeLessThan(ended);
    expect(ended).toBeLessThan(revealed);
    expect(revealed).toBeLessThan(complete);
    expect(s.log[aside]).not.toContain("Corroder");
    expect(s.log[revealed]).toContain(CR.revealForSearch.number);
    expect(s.cards["co-1"]?.zone).toBe("runner:grip");
    expect(s.cards["co-1"]?.faceup).toBe(true);
    expect(s.cards["so-1"]?.zone).toBe("runner:heap");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("lets the Runner fail to find when Special Order searches a stack that has Corroder (CR 8.7.2e)", () => {
    let s = createInitialState();
    const ev = instantiateCard("special-order", "so-1", "runner:grip");
    const breaker = instantiateCard("corroder", "co-1", "runner:stack");
    s.cards["so-1"] = ev;
    s.cards["co-1"] = breaker;
    s.runner.hand = ["so-1"];
    s.runner.deck = ["co-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "play_event", cardId: "so-1" });
    expect(s.pendingChoice?.options.some((o) => o.id === "search-fail-to-find")).toBe(true);
    expect(mayLookAtHiddenZone(s, "runner")).toBe(true);
    expect(mayLookAtHiddenZone(s, "corp")).toBe(false);
    expect(s.runner.deck).toContain("co-1");

    s = must(s, { type: "choose_option", optionId: "search-fail-to-find" });

    const failed = at(s.log, "Runner fails to find");
    const ended = at(s.log, "Runner may no longer look at the stack");
    const complete = at(s.log, "Play effect complete");
    expect(failed).toBeLessThan(ended);
    expect(ended).toBeLessThan(complete);
    expect(s.log[failed]).toContain(CR.failToFind.number);
    expect(s.log.some((line) => line.includes("Corroder revealed"))).toBe(false);
    expect(s.runner.deck).toContain("co-1");
    expect(s.cards["co-1"]?.zone).toBe("runner:stack");
    expect(mayLookAtHiddenZone(s, "runner")).toBe(false);
    expect(mayLookAtHiddenZone(s, "corp")).toBe(false);
    expect(s.cards["so-1"]?.zone).toBe("runner:heap");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("shuffles the stack after Special Order's search is complete, before Corroder is revealed (CR 8.7.3)", () => {
    let s = createInitialState();
    const ev = instantiateCard("special-order", "so-1", "runner:grip");
    const event = instantiateCard("sure-gamble", "sg-1", "runner:stack");
    const resource = instantiateCard("daily-casts", "dc-1", "runner:stack");
    const breaker = instantiateCard("corroder", "co-1", "runner:stack");
    s.cards["so-1"] = ev;
    s.cards["sg-1"] = event;
    s.cards["dc-1"] = resource;
    s.cards["co-1"] = breaker;
    s.runner.hand = ["so-1"];
    s.runner.deck = ["sg-1", "dc-1", "co-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "play_event", cardId: "so-1" });
    s = must(s, { type: "choose_option", optionId: "search-find:co-1" });

    const ended = at(s.log, "Runner may no longer look at the stack");
    const shuffled = at(s.log, "Stack shuffled");
    const revealed = at(s.log, "Corroder revealed");
    const complete = at(s.log, "Play effect complete");
    expect(ended).toBeLessThan(shuffled);
    expect(shuffled).toBeLessThan(revealed);
    expect(revealed).toBeLessThan(complete);
    expect(s.log[shuffled]).toContain(CR.shuffleDeckAfterSearch.number);
    expect(s.log[shuffled]).not.toContain("Sure Gamble");
    expect(s.log[shuffled]).not.toContain("Daily Casts");
    expect(s.runner.deck).toEqual(["dc-1", "sg-1"]);
    expect(s.cards["sg-1"]?.zone).toBe("runner:stack");
    expect(s.cards["dc-1"]?.zone).toBe("runner:stack");
    expect(s.cards["co-1"]?.zone).toBe("runner:grip");
    expect(s.cards["so-1"]?.zone).toBe("runner:heap");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("makes Personality Profiles pending after Special Order shuffles, before Corroder is revealed (CR 8.7.5)", () => {
    let s = createInitialState();
    const profiles = instantiateCard("personality-profiles", "pp-1", "corp:score");
    const ev = instantiateCard("special-order", "so-1", "runner:grip");
    const gamble = instantiateCard("sure-gamble", "sg-1", "runner:grip");
    const breaker = instantiateCard("corroder", "co-1", "runner:stack");
    s.cards["pp-1"] = profiles;
    s.cards["so-1"] = ev;
    s.cards["sg-1"] = gamble;
    s.cards["co-1"] = breaker;
    s.corp.scoreArea = ["pp-1"];
    s.runner.hand = ["so-1", "sg-1"];
    s.runner.deck = ["co-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "play_event", cardId: "so-1" });
    s = must(s, { type: "choose_option", optionId: "search-find:co-1" });

    const shuffled = at(s.log, "Stack shuffled");
    const pending = at(s.log, "Personality Profiles becomes pending");
    const trashed = at(s.log, "trashes Sure Gamble from grip");
    const revealed = at(s.log, "Corroder revealed");
    const complete = at(s.log, "Play effect complete");
    expect(shuffled).toBeLessThan(pending);
    expect(pending).toBeLessThan(trashed);
    expect(trashed).toBeLessThan(revealed);
    expect(revealed).toBeLessThan(complete);
    expect(s.log[pending]).toContain(CR.searchCondition.number);
    expect(s.cards["sg-1"]?.zone).toBe("runner:heap");
    expect(s.runner.hand).not.toContain("sg-1");
    expect(s.cards["co-1"]?.zone).toBe("runner:grip");
    expect(s.runner.hand).toContain("co-1");
    expect(s.cards["so-1"]?.zone).toBe("runner:heap");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("does not swap Hostile Takeover into PAD Campaign's server when Metamorph swaps non-ice (CR 8.8.2.ex1)", () => {
    let s = createInitialState();
    const ice = instantiateCard("metamorph", "meta-1", "server:hq:ice");
    const agenda = instantiateCard("hostile-takeover", "ht-1", "server:remote-1:root");
    const upgrade = instantiateCard(
      "corporate-troubleshooter",
      "ct-1",
      "server:remote-2:root",
    );
    const asset = instantiateCard("pad-campaign", "pad-1", "server:remote-2:root");
    s.cards["meta-1"] = ice;
    s.cards["ht-1"] = agenda;
    s.cards["ct-1"] = upgrade;
    s.cards["pad-1"] = asset;
    s.servers.hq.ice = ["meta-1"];
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["ht-1"],
    };
    s.servers["remote-2"] = {
      id: "remote-2",
      kind: "remote",
      ice: [],
      root: ["ct-1", "pad-1"],
    };

    const opened = evalEffect(
      { state: s, sourceId: "meta-1" },
      fx.do({ kind: "swap_2_other_ice_or_2_non_ice" }),
    );
    expect(opened.ok).toBe(true);
    s = must(s, { type: "choose_option", optionId: "meta-nonice" });

    const refused = at(s.log, "that swap does nothing");
    expect(s.log[refused]).toContain(CR.swapOnlyToValidLocation.number);
    expect(s.log[refused]).not.toContain("Hostile Takeover");
    expect(s.log[refused]).not.toContain("PAD Campaign");
    expect(s.servers["remote-1"]?.root).toEqual(["ht-1"]);
    expect(s.servers["remote-2"]?.root).toEqual(["ct-1", "pad-1"]);
    expect(s.cards["ht-1"]?.zone).toBe("server:remote-1:root");
    expect(s.cards["ct-1"]?.zone).toBe("server:remote-2:root");
    expect(s.cards["pad-1"]?.zone).toBe("server:remote-2:root");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("puts a rezzed Palisade into Archives faceup when Mitra Aman swaps it with Ice Wall (CR 8.8.4a)", () => {
    let s = createInitialState();
    const mitra = instantiateCard("mitra-aman", "ma-1", "server:remote-1:root");
    mitra.rezzed = true;
    mitra.faceup = true;
    const palisade = instantiateCard("palisade", "pal-1", "server:remote-1:ice");
    palisade.rezzed = true;
    palisade.faceup = true;
    const wall = instantiateCard("ice-wall", "iw-1", "corp:archives");
    wall.faceup = true;
    s.cards["ma-1"] = mitra;
    s.cards["pal-1"] = palisade;
    s.cards["iw-1"] = wall;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: ["pal-1"],
      root: ["ma-1"],
    };
    s.corp.discardPile = ["iw-1"];
    s.corp.credits = 5;
    s.run = {
      attackedServerId: "remote-1",
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

    const opened = evalEffect(
      { state: s, sourceId: "ma-1" },
      s.cards["ma-1"]!.onApproachIce!,
    );
    expect(opened.ok).toBe(true);
    s = must(s, { type: "choose_option", optionId: "activate" });
    s = must(s, { type: "choose_option", optionId: "mitra-swap:iw-1" });

    const entered = at(s.log, "Palisade enters Archives faceup");
    expect(s.log[entered]).toContain(CR.swapIntoZone.number);
    expect(s.cards["pal-1"]?.zone).toBe("corp:archives");
    expect(s.cards["pal-1"]?.faceup).toBe(true);
    expect(s.corp.discardPile).toContain("pal-1");
    expect(s.servers["remote-1"]?.ice).toEqual(["iw-1"]);
    expect(s.cards["iw-1"]?.zone).toBe("server:remote-1:ice");
    expect(s.cards["iw-1"]?.rezzed).toBe(false);
    expect(s.cards["iw-1"]?.faceup).toBe(false);
    expect(s.checkpoints).toHaveLength(0);
  });

  it("trashes Botulus when Tatu-Bola is swapped with Palisade from HQ (CR 8.8.4b)", () => {
    let s = createInitialState();
    const tatu = instantiateCard("tatu-bola", "tb-1", "server:remote-1:ice");
    tatu.rezzed = true;
    tatu.faceup = true;
    tatu.hostedCardIds = ["bot-1"];
    const botulus = instantiateCard("botulus", "bot-1", "hosted:tb-1");
    botulus.hostId = "tb-1";
    botulus.faceup = true;
    const palisade = instantiateCard("palisade", "pal-1", "corp:hq");
    s.cards["tb-1"] = tatu;
    s.cards["bot-1"] = botulus;
    s.cards["pal-1"] = palisade;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: ["tb-1"],
      root: [],
    };
    s.corp.hand = ["pal-1"];
    s.corp.credits = 5;

    const opened = evalEffect(
      { state: s, sourceId: "tb-1" },
      s.cards["tb-1"]!.onPass!,
    );
    expect(opened.ok).toBe(true);
    s = must(s, { type: "choose_option", optionId: "swap" });

    const trashed = at(s.log, "Botulus trashed");
    expect(s.log[trashed]).toContain(CR.swapBecomeInstalled.number);
    expect(s.cards["bot-1"]?.zone).toBe("runner:heap");
    expect(s.cards["bot-1"]?.hostId).toBeUndefined();
    expect(s.runner.discardPile).toContain("bot-1");
    expect(s.cards["tb-1"]?.hostedCardIds ?? []).not.toContain("bot-1");
    expect(s.cards["tb-1"]?.zone).toBe("corp:hq");
    expect(s.corp.hand).toContain("tb-1");
    expect(s.servers["remote-1"]?.ice).toEqual(["pal-1"]);
    expect(s.cards["pal-1"]?.zone).toBe("server:remote-1:ice");
    expect(s.cards["pal-1"]?.rezzed).toBe(false);
    expect(s.corp.credits).toBe(9);
    expect(s.checkpoints).toHaveLength(0);
  });

  it("meets A Teia's install at the checkpoint after Tatu-Bola swaps, then gains 4 (CR 8.8.4b.ex1)", () => {
    let s = createInitialState();
    const teia = instantiateCard("a-teia-ip-recovery", "teia-1", "corp:identity");
    s.cards["teia-1"] = teia;
    s.corp.identityId = "teia-1";
    const tatu = instantiateCard("tatu-bola", "tb-1", "server:remote-1:ice");
    tatu.rezzed = true;
    tatu.faceup = true;
    const palisade = instantiateCard("palisade", "pal-1", "corp:hq");
    const pad = instantiateCard("pad-campaign", "pad-1", "corp:hq");
    s.cards["tb-1"] = tatu;
    s.cards["pal-1"] = palisade;
    s.cards["pad-1"] = pad;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: ["tb-1"],
      root: [],
    };
    s.servers["remote-2"] = {
      id: "remote-2",
      kind: "remote",
      ice: [],
      root: [],
    };
    s.nextRemoteNumber = 3;
    s.corp.hand = ["pal-1", "pad-1"];
    s.corp.credits = 5;

    const opened = evalEffect(
      { state: s, sourceId: "tb-1" },
      s.cards["tb-1"]!.onPass!,
    );
    expect(opened.ok).toBe(true);
    s = must(s, { type: "choose_option", optionId: "swap" });

    expect(s.servers["remote-1"]?.ice).toEqual(["pal-1"]);
    expect(s.cards["pal-1"]?.zone).toBe("server:remote-1:ice");
    expect(s.cards["pal-1"]?.rezzed).toBe(false);
    expect(s.corp.credits).toBe(9);
    expect(s.servers["remote-2"]).toBeUndefined();
    expect(s.log.join("\n")).toContain(
      `remote-2 ceased to exist (CR ${CR.checkpointRemoteServer.number}).`,
    );
    expect(s.log.join("\n")).toContain("no other remote");
    expect(s.log.join("\n")).toContain("Corp gains 4¢.");
    expect(s.pendingChoice).toBeNull();
    expect(s.checkpoints).toHaveLength(0);
  });

  it("swaps Tollbooth into the drawn set-aside, then bottoms it (CR 8.8.4d)", () => {
    let s = createInitialState();
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    expect(s.timingKey).toBe("corp.mandatoryDraw");

    const dbs = instantiateCard(
      "daily-business-show",
      "dbs-1",
      "server:remote-1:root",
    );
    dbs.rezzed = true;
    dbs.faceup = true;
    const raman = instantiateCard("raman-rai", "raman-1", "server:remote-2:root");
    raman.rezzed = true;
    raman.faceup = true;
    const wrap = instantiateCard("wraparound", "wrap-1", "corp:rd");
    const enigma = instantiateCard("enigma", "en-1", "corp:rd");
    const toll = instantiateCard("tollbooth", "toll-1", "corp:archives");
    toll.faceup = true;
    s.cards["dbs-1"] = dbs;
    s.cards["raman-1"] = raman;
    s.cards["wrap-1"] = wrap;
    s.cards["en-1"] = enigma;
    s.cards["toll-1"] = toll;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["dbs-1"],
    };
    s.servers["remote-2"] = {
      id: "remote-2",
      kind: "remote",
      ice: [],
      root: ["raman-1"],
    };
    s.nextRemoteNumber = 3;
    s.corp.deck = ["wrap-1", "en-1"];
    s.corp.discardPile = ["toll-1"];
    const clicks = s.corp.clicks;
    expect(clicks).toBeGreaterThan(0);

    s = must(s, { type: "pass_window" });
    expect(
      s.pendingChoice?.options.some((o) => o.id === "raman:en-1:toll-1"),
    ).toBe(true);
    expect(s.corp.hand).not.toContain("wrap-1");
    expect(s.corp.hand).not.toContain("en-1");
    expect(s.pendingDrawSetAside?.cardIds).toEqual(["wrap-1", "en-1"]);
    const offered = at(s.log, "Raman Rai may swap a drawn card");
    expect(s.log[offered]).toContain(CR.checkpointReaction.number);
    expect(at(s.log, "Set aside 2")).toBeLessThan(offered);
    expect(s.log.join("\n")).not.toContain("Wraparound");

    s = must(s, { type: "choose_option", optionId: "raman:en-1:toll-1" });
    expect(s.corp.clicks).toBe(clicks - 1);
    expect(s.pendingDrawSetAside?.cardIds).toEqual(["wrap-1", "toll-1"]);
    expect(s.cards["en-1"]?.zone).toBe("corp:archives");
    expect(s.cards["en-1"]?.faceup).toBe(true);
    expect(s.corp.discardPile).toContain("en-1");
    expect(s.corp.discardPile).not.toContain("toll-1");
    expect(s.cards["toll-1"]?.zone).toBe("corp:set-aside");
    expect(s.corp.hand).not.toContain("wrap-1");
    expect(s.corp.hand).not.toContain("toll-1");
    expect(
      s.pendingChoice?.options.some((o) => o.id === "dbs-bottom:toll-1"),
    ).toBe(true);
    const joined = at(s.log, "Tollbooth joins the set-aside cards");
    expect(s.log[joined]).toContain(CR.swapToSetAside.number);
    expect(offered).toBeLessThan(joined);
    expect(s.log.join("\n")).not.toContain("Wraparound");

    s = must(s, { type: "choose_option", optionId: "dbs-bottom:toll-1" });
    expect(s.corp.deck[s.corp.deck.length - 1]).toBe("toll-1");
    expect(s.cards["toll-1"]?.zone).toBe("corp:rd");
    expect(s.cards["toll-1"]?.faceup).toBe(false);
    expect(s.corp.hand).toContain("wrap-1");
    expect(s.cards["wrap-1"]?.zone).toBe("corp:hq");
    expect(s.corp.hand).not.toContain("en-1");
    expect(s.corp.hand).not.toContain("toll-1");
    expect(s.pendingDrawSetAside).toBeNull();
    expect(s.checkpoints).toHaveLength(0);
    const bottomed = at(s.log, "add Tollbooth to the bottom of R&D");
    const added = at(s.log, "Add set-aside card to hand");
    expect(joined).toBeLessThan(bottomed);
    expect(bottomed).toBeLessThan(added);
    expect(s.log.join("\n")).not.toContain("Wraparound");
  });

  it("trashes Sure Gamble after its play ability resolves (CR 8.6.7f / 8.6.7g)", () => {
    let s = createInitialState();
    const ev = instantiateCard("sure-gamble", "sg-1", "runner:grip");
    s.cards["sg-1"] = ev;
    s.runner.hand = ["sg-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "play_event", cardId: "sg-1" });

    const gain = at(s.log, "runner gains 9¢");
    const trashed = at(s.log, "Sure Gamble trashed");
    expect(gain).toBeLessThan(trashed);
    expect(s.log[trashed]).toContain(CR.trashPlayedCard.number);
    expect(s.cards["sg-1"]?.zone).toBe("runner:heap");
    expect(s.runner.discardPile).toContain("sg-1");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("checks after-resolve conditions once Sure Gamble is trashed, and none are met (CR 8.6.7h)", () => {
    let s = createInitialState();
    const ev = instantiateCard("sure-gamble", "sg-1", "runner:grip");
    s.cards["sg-1"] = ev;
    s.runner.hand = ["sg-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "play_event", cardId: "sg-1" });

    const trashed = at(s.log, "Sure Gamble trashed");
    const after = at(s.log, "After-resolve conditions checked");
    const instruction = at(s.log, "Checkpoint open [instruction]");
    expect(trashed).toBeLessThan(after);
    expect(after).toBeLessThan(instruction);
    expect(s.log[after]).toContain(CR.afterResolveCondition.number);
    expect(s.log[after]).toContain("none met");
    expect(s.cards["sg-1"]?.zone).toBe("runner:heap");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("completes the play effect after Sure Gamble's after-resolve check (CR 8.6.7i)", () => {
    let s = createInitialState();
    const ev = instantiateCard("sure-gamble", "sg-1", "runner:grip");
    s.cards["sg-1"] = ev;
    s.runner.hand = ["sg-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "play_event", cardId: "sg-1" });

    const after = at(s.log, "After-resolve conditions checked");
    const complete = at(s.log, "Play effect complete");
    const instruction = at(s.log, "Checkpoint open [instruction]");
    expect(after).toBeLessThan(complete);
    expect(complete).toBeLessThan(instruction);
    expect(s.log[complete]).toContain(CR.playComplete.number);
    expect(s.cards["sg-1"]?.zone).toBe("runner:heap");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("places Hedge Fund in the play area before its play cost is paid (CR 8.6.7a)", () => {
    let s = createInitialState();
    const op = instantiateCard("hedge-fund", "hf-1", "corp:hq");
    s.cards["hf-1"] = op;
    s.corp.hand = ["hf-1"];
    s.corp.credits = 5;
    s.corp.clicks = 1;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";

    s = must(s, { type: "play_operation", cardId: "hf-1" });

    const placed = at(s.log, "Hedge Fund placed faceup in the play area");
    const cost = at(s.log, "Checkpoint open [cost]");
    expect(placed).toBeLessThan(cost);
    expect(s.log[placed]).toContain(CR.playPlace.number);
    expect(s.log[placed]).toContain("not installed");
    expect(s.cards["hf-1"]?.zone).toBe("corp:archives");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("pays Hedge Fund's play cost after it is placed, then runs the cost checkpoint (CR 8.6.7b)", () => {
    let s = createInitialState();
    const op = instantiateCard("hedge-fund", "hf-1", "corp:hq");
    s.cards["hf-1"] = op;
    s.corp.hand = ["hf-1"];
    s.corp.credits = 5;
    s.corp.clicks = 1;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";

    s = must(s, { type: "play_operation", cardId: "hf-1" });

    const placed = at(s.log, "Hedge Fund placed faceup in the play area");
    const paid = at(s.log, "Play cost of 5¢ paid");
    const cost = at(s.log, "Checkpoint open [cost]");
    expect(placed).toBeLessThan(paid);
    expect(paid).toBeLessThan(cost);
    expect(s.log[paid]).toContain(CR.playCostStep.number);
    expect(s.cards["hf-1"]?.zone).toBe("corp:archives");
    expect(s.corp.credits).toBe(9);
    expect(s.checkpoints).toHaveLength(0);
  });

  it("makes Hedge Fund active after the cost checkpoint and before the play checkpoint (CR 8.6.7c)", () => {
    let s = createInitialState();
    const op = instantiateCard("hedge-fund", "hf-1", "corp:hq");
    s.cards["hf-1"] = op;
    s.corp.hand = ["hf-1"];
    s.corp.credits = 5;
    s.corp.clicks = 1;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";

    s = must(s, { type: "play_operation", cardId: "hf-1" });

    const cost = at(s.log, "Checkpoint close [cost]");
    const active = at(s.log, "Hedge Fund becomes active");
    const play = at(s.log, "Checkpoint open [play]");
    expect(cost).toBeLessThan(active);
    expect(active).toBeLessThan(play);
    expect(s.log[active]).toContain(CR.playActive.number);
    expect(s.log[active]).toContain("not installed");
    expect(s.cards["hf-1"]?.zone).toBe("corp:archives");
    expect(s.corp.credits).toBe(9);
    expect(s.checkpoints).toHaveLength(0);
  });

  it("checks played conditions once Hedge Fund is active, and none are met (CR 8.6.7d)", () => {
    let s = createInitialState();
    const op = instantiateCard("hedge-fund", "hf-1", "corp:hq");
    s.cards["hf-1"] = op;
    s.corp.hand = ["hf-1"];
    s.corp.credits = 5;
    s.corp.clicks = 1;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";

    s = must(s, { type: "play_operation", cardId: "hf-1" });

    const active = at(s.log, "Hedge Fund becomes active");
    const played = at(s.log, "Played conditions checked");
    const play = at(s.log, "Checkpoint open [play]");
    expect(active).toBeLessThan(played);
    expect(played).toBeLessThan(play);
    expect(s.log[played]).toContain(CR.playPlayedCondition.number);
    expect(s.log[played]).toContain("none met");
    expect(s.cards["hf-1"]?.zone).toBe("corp:archives");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("places Sure Gamble in the play area before its play cost is paid (CR 8.6.7a)", () => {
    let s = createInitialState();
    const ev = instantiateCard("sure-gamble", "sg-1", "runner:grip");
    s.cards["sg-1"] = ev;
    s.runner.hand = ["sg-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "play_event", cardId: "sg-1" });

    const placed = at(s.log, "Sure Gamble placed faceup in the play area");
    const cost = at(s.log, "Checkpoint open [cost]");
    expect(placed).toBeLessThan(cost);
    expect(s.log[placed]).toContain(CR.playPlace.number);
    expect(s.log[placed]).toContain("not installed");
    expect(s.cards["sg-1"]?.zone).toBe("runner:heap");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("pays Sure Gamble's play cost after it is placed, then runs the cost checkpoint (CR 8.6.7b)", () => {
    let s = createInitialState();
    const ev = instantiateCard("sure-gamble", "sg-1", "runner:grip");
    s.cards["sg-1"] = ev;
    s.runner.hand = ["sg-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "play_event", cardId: "sg-1" });

    const placed = at(s.log, "Sure Gamble placed faceup in the play area");
    const paid = at(s.log, "Play cost of 5¢ paid");
    const cost = at(s.log, "Checkpoint open [cost]");
    expect(placed).toBeLessThan(paid);
    expect(paid).toBeLessThan(cost);
    expect(s.log[paid]).toContain(CR.playCostStep.number);
    expect(s.cards["sg-1"]?.zone).toBe("runner:heap");
    expect(s.runner.credits).toBe(9);
    expect(s.checkpoints).toHaveLength(0);
  });

  it("makes Sure Gamble active after the cost checkpoint and before the play checkpoint (CR 8.6.7c)", () => {
    let s = createInitialState();
    const ev = instantiateCard("sure-gamble", "sg-1", "runner:grip");
    s.cards["sg-1"] = ev;
    s.runner.hand = ["sg-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "play_event", cardId: "sg-1" });

    const cost = at(s.log, "Checkpoint close [cost]");
    const active = at(s.log, "Sure Gamble becomes active");
    const play = at(s.log, "Checkpoint open [play]");
    expect(cost).toBeLessThan(active);
    expect(active).toBeLessThan(play);
    expect(s.log[active]).toContain(CR.playActive.number);
    expect(s.log[active]).toContain("not installed");
    expect(s.cards["sg-1"]?.zone).toBe("runner:heap");
    expect(s.runner.credits).toBe(9);
    expect(s.checkpoints).toHaveLength(0);
  });

  it("checks played conditions once Sure Gamble is active, and none are met (CR 8.6.7d)", () => {
    let s = createInitialState();
    const ev = instantiateCard("sure-gamble", "sg-1", "runner:grip");
    s.cards["sg-1"] = ev;
    s.runner.hand = ["sg-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "play_event", cardId: "sg-1" });

    const active = at(s.log, "Sure Gamble becomes active");
    const played = at(s.log, "Played conditions checked");
    const play = at(s.log, "Checkpoint open [play]");
    expect(active).toBeLessThan(played);
    expect(played).toBeLessThan(play);
    expect(s.log[played]).toContain(CR.playPlayedCondition.number);
    expect(s.log[played]).toContain("none met");
    expect(s.cards["sg-1"]?.zone).toBe("runner:heap");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("runs the play checkpoint for an operation before its play abilities (CR 8.6.7e)", () => {
    let s = createInitialState();
    const op = instantiateCard("hedge-fund", "hf-1", "corp:hq");
    s.cards["hf-1"] = op;
    s.corp.hand = ["hf-1"];
    s.corp.credits = 5;
    s.corp.clicks = 1;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";

    s = must(s, { type: "play_operation", cardId: "hf-1" });

    const play = at(s.log, "Checkpoint open [play]");
    const gain = at(s.log, "corp gains 9¢");
    expect(play).toBeLessThan(gain);
    expect(s.log[play]).toContain(CR.playCheckpoint.number);
    expect(s.checkpoints).toHaveLength(0);
  });

  it("resolves Hedge Fund's play ability after the play checkpoint closes (CR 8.6.7f)", () => {
    let s = createInitialState();
    const op = instantiateCard("hedge-fund", "hf-1", "corp:hq");
    s.cards["hf-1"] = op;
    s.corp.hand = ["hf-1"];
    s.corp.credits = 5;
    s.corp.clicks = 1;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";

    s = must(s, { type: "play_operation", cardId: "hf-1" });

    const play = at(s.log, "Checkpoint close [play]");
    const resolve = at(s.log, "Resolve play abilities of Hedge Fund");
    const gain = at(s.log, "corp gains 9¢");
    const trashed = at(s.log, "Hedge Fund trashed");
    expect(play).toBeLessThan(resolve);
    expect(resolve).toBeLessThan(gain);
    expect(gain).toBeLessThan(trashed);
    expect(s.log[resolve]).toContain(CR.playAbilities.number);
    expect(s.cards["hf-1"]?.zone).toBe("corp:archives");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("trashes Hedge Fund after its play ability resolves (CR 8.6.7f / 8.6.7g)", () => {
    let s = createInitialState();
    const op = instantiateCard("hedge-fund", "hf-1", "corp:hq");
    s.cards["hf-1"] = op;
    s.corp.hand = ["hf-1"];
    s.corp.credits = 5;
    s.corp.clicks = 1;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";

    s = must(s, { type: "play_operation", cardId: "hf-1" });

    const gain = at(s.log, "corp gains 9¢");
    const trashed = at(s.log, "Hedge Fund trashed");
    expect(gain).toBeLessThan(trashed);
    expect(s.log[trashed]).toContain(CR.trashPlayedCard.number);
    expect(s.cards["hf-1"]?.zone).toBe("corp:archives");
    expect(s.corp.discardPile).toContain("hf-1");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("checks after-resolve conditions once Hedge Fund is trashed, and none are met (CR 8.6.7h)", () => {
    let s = createInitialState();
    const op = instantiateCard("hedge-fund", "hf-1", "corp:hq");
    s.cards["hf-1"] = op;
    s.corp.hand = ["hf-1"];
    s.corp.credits = 5;
    s.corp.clicks = 1;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";

    s = must(s, { type: "play_operation", cardId: "hf-1" });

    const trashed = at(s.log, "Hedge Fund trashed");
    const after = at(s.log, "After-resolve conditions checked");
    const instruction = at(s.log, "Checkpoint open [instruction]");
    expect(trashed).toBeLessThan(after);
    expect(after).toBeLessThan(instruction);
    expect(s.log[after]).toContain(CR.afterResolveCondition.number);
    expect(s.log[after]).toContain("none met");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("completes the play effect after Hedge Fund's after-resolve check (CR 8.6.7i)", () => {
    let s = createInitialState();
    const op = instantiateCard("hedge-fund", "hf-1", "corp:hq");
    s.cards["hf-1"] = op;
    s.corp.hand = ["hf-1"];
    s.corp.credits = 5;
    s.corp.clicks = 1;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";

    s = must(s, { type: "play_operation", cardId: "hf-1" });

    const after = at(s.log, "After-resolve conditions checked");
    const complete = at(s.log, "Play effect complete");
    const instruction = at(s.log, "Checkpoint open [instruction]");
    expect(after).toBeLessThan(complete);
    expect(complete).toBeLessThan(instruction);
    expect(s.log[complete]).toContain(CR.playComplete.number);
    expect(s.cards["hf-1"]?.zone).toBe("corp:archives");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("checkpoints a draw after the card is set aside and before it enters hand (CR 8.4.5b)", () => {
    let s = createInitialState();
    const deckBefore = s.runner.deck.length;
    const handBefore = s.runner.hand.length;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 1;

    s = must(s, { type: "basic_draw" });

    const aside = at(s.log, `Set aside 1 (CR ${CR.drawSetAside.number})`);
    const checkpoint = at(s.log, "Checkpoint open [draw]");
    const added = at(s.log, `Add set-aside card to hand (CR ${CR.drawAddToHand.number})`);
    expect(aside).toBeLessThan(checkpoint);
    expect(checkpoint).toBeLessThan(added);
    expect(s.log[checkpoint]).toContain(CR.drawCheckpoint.number);
    expect(s.log[checkpoint]).toContain(CR.drawPause.number);
    expect(s.log.some((line) => line.includes("Checkpoint close [draw]"))).toBe(true);
    expect(s.checkpoints).toHaveLength(0);
    expect(s.runner.deck).toHaveLength(deckBefore - 1);
    expect(s.runner.hand).toHaveLength(handBefore + 1);
  });

  it("draws two cards with one checkpoint before either enters hand (CR 8.4.5)", () => {
    let s = createInitialState();
    const vp = instantiateCard("verbal-plasticity", "vp-1", "runner:installed");
    s.cards["vp-1"] = vp;
    s.runner.installed.push("vp-1");
    const deckBefore = s.runner.deck.length;
    const handBefore = s.runner.hand.length;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 1;

    s = must(s, { type: "basic_draw" });

    const aside = at(s.log, `Set aside 2 (CR ${CR.drawSetAside.number})`);
    const checkpoint = at(s.log, "Checkpoint open [draw]");
    const added = at(s.log, `Add 2 set-aside cards to hand (CR ${CR.drawAddToHand.number})`);
    expect(s.log.filter((line) => line.includes("Checkpoint open [draw]"))).toHaveLength(1);
    expect(aside).toBeLessThan(checkpoint);
    expect(checkpoint).toBeLessThan(added);
    expect(s.log[checkpoint]).toContain(CR.drawCheckpoint.number);
    expect(s.log[checkpoint]).toContain(CR.drawPause.number);
    expect(s.checkpoints).toHaveLength(0);
    expect(s.runner.deck).toHaveLength(deckBefore - 2);
    expect(s.runner.hand).toHaveLength(handBefore + 2);

    const effect = createInitialState();
    const effectDeck = effect.runner.deck.length;
    const effectHand = effect.runner.hand.length;
    const n = drawCards(effect, "runner", 2);
    expect(n).toBe(2);
    const effectAside = at(effect.log, `Set aside 2 (CR ${CR.drawSetAside.number})`);
    const effectCheckpoint = at(effect.log, "Checkpoint open [draw]");
    const effectAdded = at(
      effect.log,
      `Add 2 set-aside cards to hand (CR ${CR.drawAddToHand.number})`,
    );
    expect(effect.log.filter((line) => line.includes("Checkpoint open [draw]"))).toHaveLength(1);
    expect(effectAside).toBeLessThan(effectCheckpoint);
    expect(effectCheckpoint).toBeLessThan(effectAdded);
    expect(effect.checkpoints).toHaveLength(0);
    expect(effect.runner.deck).toHaveLength(effectDeck - 2);
    expect(effect.runner.hand).toHaveLength(effectHand + 2);
  });

  it("reveals a Find the Truth draw after the checkpoint and before the card enters hand (CR 10.3.2)", () => {
    let s = createInitialState();
    const truth = instantiateCard("find-the-truth", "ftt-1", "runner:installed");
    s.cards["ftt-1"] = truth;
    s.runner.installed.push("ftt-1");
    const topId = s.runner.deck[0]!;
    const title = s.cards[topId]!.title;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 1;

    s = must(s, { type: "basic_draw" });

    const closed = at(s.log, "Checkpoint close [draw]");
    const window = at(s.log, `Reaction window (CR ${CR.checkpointReaction.number})`);
    const reveal = at(s.log, `Find the Truth — reveal drawn card: ${title}`);
    const added = at(s.log, `Add set-aside card to hand (CR ${CR.drawAddToHand.number})`);
    expect(closed).toBeLessThan(window);
    expect(window).toBeLessThan(reveal);
    expect(reveal).toBeLessThan(added);
    expect(s.checkpoints).toHaveLength(0);
    expect(s.pendingChoice).toBeNull();
    expect(s.runner.hand).toContain(topId);
  });

  it("offers Political Dealings in that window, before the agenda enters HQ (CR 10.3.2)", () => {
    let s = createInitialState();
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: [],
    };
    const dealings = instantiateCard("political-dealings", "pd-1", "server:remote-1:root");
    dealings.rezzed = true;
    dealings.faceup = true;
    s.cards["pd-1"] = dealings;
    s.servers["remote-1"].root = ["pd-1"];
    const agenda = instantiateCard("hostile-takeover", "ag-1", "corp:rd");
    s.cards["ag-1"] = agenda;
    s.corp.deck.unshift("ag-1");

    const n = drawCards(s, "corp", 1);
    expect(n).toBe(1);
    const closed = at(s.log, "Checkpoint close [draw]");
    const window = at(s.log, `Reaction window (CR ${CR.checkpointReaction.number})`);
    expect(closed).toBeLessThan(window);
    expect(s.log.some((line) => line.includes("Add set-aside card to hand"))).toBe(false);
    expect(s.corp.hand).not.toContain("ag-1");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(["pd:install", "pd:decline"]);

    s = must(s, { type: "choose_option", optionId: "pd:decline" });
    expect(s.pendingChoice).toBeNull();
    expect(s.pendingDrawSetAside ?? null).toBeNull();
    const added = at(s.log, `Add set-aside card to hand (CR ${CR.drawAddToHand.number})`);
    expect(added).toBeGreaterThan(window);
    expect(s.corp.hand).toContain("ag-1");
  });

  it("checkpoints before each player receives priority (CR 10.3.3, 9.2.4e)", () => {
    let s = createInitialState();
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: [],
    };
    const pad = instantiateCard("pad-campaign", "pad-1", "server:remote-1:root");
    pad.rezzed = false;
    pad.faceup = false;
    s.cards["pad-1"] = pad;
    s.servers["remote-1"].root = ["pad-1"];
    s.corp.credits = 10;
    s.activeSide = "runner";
    const from = s.log.length;
    enterStep(s, "runner.actionPaw");

    const opened = s.log.slice(from);
    const open = at(opened, "Priority window open");
    const first = at(opened, CR.checkpointBeforePriority.number);
    expect(open).toBeLessThan(first);
    expect(opened[first]).toContain(CR.priorityBeforeAct.number);
    expect(opened[first]).toContain("Before runner receives priority");
    expect(s.checkpoints).toHaveLength(0);
    expect(s.priorityStack.at(-1)?.priorityHolder).toBe("runner");

    s = must(s, { type: "pass_window" });
    const pass = at(s.log, "Pass priority → corp");
    const second = s.log.findIndex(
      (line, i) => i > pass && line.includes(CR.checkpointBeforePriority.number),
    );
    expect(second).toBeGreaterThan(pass);
    expect(s.log[second]).toContain("Before corp receives priority");
    expect(s.log[second]).toContain(CR.priorityBeforeAct.number);
    expect(s.checkpoints).toHaveLength(0);
    expect(s.priorityStack.at(-1)?.priorityHolder).toBe("corp");
    expect(s.timingKey).toBe("runner.actionPaw");
  });

  it("checkpoints after the Corp gains a credit, before the Corp receives priority (CR 10.3.5, 9.11.2)", () => {
    let s = createInitialState();
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    const credits = s.corp.credits;
    const from = s.log.length;
    s = must(s, { type: "basic_gain_credit" });

    const lines = s.log.slice(from);
    const gain = at(lines, CR.corpBasicCredit.number);
    const finished = at(lines, "Checkpoint open [instruction]");
    const priority = at(lines, CR.checkpointBeforePriority.number);
    const closed = lines.findIndex(
      (line, i) => i > finished && line.includes("Checkpoint close [instruction]"),
    );
    expect(gain).toBeLessThan(finished);
    expect(finished).toBeLessThan(closed);
    expect(closed).toBeLessThan(priority);
    expect(lines[gain]).toContain(CR.gainCredits.number);
    expect(lines[finished]).toContain(CR.checkpointAfterInstruction.number);
    expect(lines[finished]).toContain(CR.timingStepIsInstruction.number);
    expect(lines[priority]).toContain("Before corp receives priority");
    expect(lines[priority]).toContain(CR.priorityBeforeAct.number);
    expect(s.checkpoints).toHaveLength(0);
    expect(s.corp.credits).toBe(credits + 1);
  });

  it("checks conditional abilities inside the checkpoint after the Corp gains a credit, and marks none pending (CR 10.3.1a)", () => {
    let s = createInitialState();
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    const from = s.log.length;
    s = must(s, { type: "basic_gain_credit" });

    const lines = s.log.slice(from);
    const opened = at(lines, "Checkpoint open [instruction]");
    const checked = at(lines, "Conditional abilities checked");
    const closed = lines.findIndex(
      (line, i) => i > opened && line.includes("Checkpoint close [instruction]"),
    );
    expect(opened).toBeLessThan(checked);
    expect(checked).toBeLessThan(closed);
    expect(lines[checked]).toContain(CR.checkpointConditionalAbilities.number);
    expect(lines[checked]).toContain("none marked pending");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("removes no passed-duration abilities inside the checkpoint after the Corp gains a credit (CR 10.3.1b)", () => {
    let s = createInitialState();
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    const from = s.log.length;
    s = must(s, { type: "basic_gain_credit" });

    const lines = s.log.slice(from);
    const checked = at(lines, "Conditional abilities checked");
    const durations = at(lines, "Duration abilities checked");
    const closed = lines.findIndex(
      (line, i) => i > durations && line.includes("Checkpoint close [instruction]"),
    );
    expect(checked).toBeLessThan(durations);
    expect(durations).toBeLessThan(closed);
    expect(lines[durations]).toContain(CR.checkpointDurationAbilities.number);
    expect(lines[durations]).toContain("none removed");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("counts empty score areas inside the checkpoint after the Corp gains a credit, and nobody wins (CR 10.3.1c)", () => {
    let s = createInitialState();
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    const from = s.log.length;
    s = must(s, { type: "basic_gain_credit" });

    const lines = s.log.slice(from);
    const durations = at(lines, "Duration abilities checked");
    const agendas = at(lines, "Agenda points checked");
    const closed = lines.findIndex(
      (line, i) => i > agendas && line.includes("Checkpoint close [instruction]"),
    );
    expect(durations).toBeLessThan(agendas);
    expect(agendas).toBeLessThan(closed);
    expect(lines[agendas]).toContain(CR.checkpointAgendaPoints.number);
    expect(lines[agendas]).toContain("neither player has 7");
    expect(s.corp.scoreArea).toHaveLength(0);
    expect(s.runner.scoreArea).toHaveLength(0);
    expect(s.winner).toBeNull();
    expect(s.checkpoints).toHaveLength(0);
  });

  it("checks uniqueness inside the checkpoint after the Corp gains a credit, and trashes nothing (CR 10.3.1d)", () => {
    let s = createInitialState();
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    const from = s.log.length;
    s = must(s, { type: "basic_gain_credit" });

    const lines = s.log.slice(from);
    const agendas = at(lines, "Agenda points checked");
    const uniqueness = at(lines, "Uniqueness checked");
    const closed = lines.findIndex(
      (line, i) => i > uniqueness && line.includes("Checkpoint close [instruction]"),
    );
    expect(agendas).toBeLessThan(uniqueness);
    expect(uniqueness).toBeLessThan(closed);
    expect(lines[uniqueness]).toContain(CR.checkpointUniqueness.number);
    expect(lines[uniqueness]).toContain("nothing trashed");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("checks card restrictions inside the checkpoint after the Corp gains a credit, and trashes nothing (CR 10.3.1e)", () => {
    let s = createInitialState();
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    const from = s.log.length;
    s = must(s, { type: "basic_gain_credit" });

    const lines = s.log.slice(from);
    const uniqueness = at(lines, "Uniqueness checked");
    const restrictions = at(lines, "Card restrictions checked");
    const closed = lines.findIndex(
      (line, i) =>
        i > restrictions && line.includes("Checkpoint close [instruction]"),
    );
    expect(uniqueness).toBeLessThan(restrictions);
    expect(restrictions).toBeLessThan(closed);
    expect(lines[restrictions]).toContain(CR.checkpointCardRestrictions.number);
    expect(lines[restrictions]).toContain("memory 0 of 4");
    expect(lines[restrictions]).toContain("nothing trashed");
    expect(s.runner.installed).toHaveLength(0);
    expect(s.checkpoints).toHaveLength(0);
  });

  it("checks agendas that left a score area inside the checkpoint after the Corp gains a credit, and trashes nothing (CR 10.3.1f)", () => {
    let s = createInitialState();
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    const from = s.log.length;
    s = must(s, { type: "basic_gain_credit" });

    const lines = s.log.slice(from);
    const restrictions = at(lines, "Card restrictions checked");
    const hosted = at(lines, "Hosted on agendas checked");
    const closed = lines.findIndex(
      (line, i) =>
        i > hosted && line.includes("Checkpoint close [instruction]"),
    );
    expect(restrictions).toBeLessThan(hosted);
    expect(hosted).toBeLessThan(closed);
    expect(lines[hosted]).toContain(CR.checkpointHostedOnAgenda.number);
    expect(lines[hosted]).toContain("nothing trashed");
    expect(s.corp.scoreArea).toHaveLength(0);
    expect(s.runner.scoreArea).toHaveLength(0);
    expect(s.checkpoints).toHaveLength(0);
  });

  it("checks objects hosted on an uninstalled card inside the checkpoint after the Corp gains a credit, and trashes nothing (CR 10.3.1g)", () => {
    let s = createInitialState();
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    const from = s.log.length;
    s = must(s, { type: "basic_gain_credit" });

    const lines = s.log.slice(from);
    const agendas = at(lines, "Hosted on agendas checked");
    const uninstalled = at(lines, "Hosted on uninstalled cards checked");
    const closed = lines.findIndex(
      (line, i) =>
        i > uninstalled && line.includes("Checkpoint close [instruction]"),
    );
    expect(agendas).toBeLessThan(uninstalled);
    expect(uninstalled).toBeLessThan(closed);
    expect(lines[uninstalled]).toContain(CR.checkpointHostedOnUninstalled.number);
    expect(lines[uninstalled]).toContain("nothing trashed");
    expect(s.runner.installed).toHaveLength(0);
    expect(s.checkpoints).toHaveLength(0);
  });

  it("checks remote servers inside the checkpoint after the Corp gains a credit, and none cease to exist (CR 10.3.1h)", () => {
    let s = createInitialState();
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    const from = s.log.length;
    s = must(s, { type: "basic_gain_credit" });

    const lines = s.log.slice(from);
    const uninstalled = at(lines, "Hosted on uninstalled cards checked");
    const remotes = at(lines, "Remote servers checked");
    const closed = lines.findIndex(
      (line, i) =>
        i > remotes && line.includes("Checkpoint close [instruction]"),
    );
    expect(uninstalled).toBeLessThan(remotes);
    expect(remotes).toBeLessThan(closed);
    expect(lines[remotes]).toContain(CR.checkpointRemoteServer.number);
    expect(lines[remotes]).toContain("none ceased to exist");
    expect(Object.keys(s.servers).sort()).toEqual(["archives", "hq", "rd"]);
    expect(s.checkpoints).toHaveLength(0);
  });

  it("checks vacant positions inside the checkpoint after the Corp gains a credit, and none cease to exist (CR 10.3.1i)", () => {
    let s = createInitialState();
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    const from = s.log.length;
    s = must(s, { type: "basic_gain_credit" });

    const lines = s.log.slice(from);
    const remotes = at(lines, "Remote servers checked");
    const vacant = at(lines, "Vacant positions checked");
    const closed = lines.findIndex(
      (line, i) =>
        i > vacant && line.includes("Checkpoint close [instruction]"),
    );
    expect(remotes).toBeLessThan(vacant);
    expect(vacant).toBeLessThan(closed);
    expect(lines[vacant]).toContain(CR.checkpointVacantPosition.number);
    expect(lines[vacant]).toContain("none ceased to exist");
    expect(s.run).toBeNull();
    for (const server of Object.values(s.servers)) {
      expect(server.ice).toHaveLength(0);
    }
    expect(s.checkpoints).toHaveLength(0);
  });

  it("checks cards entering a root during a breach inside the checkpoint after the Corp gains a credit, and the Runner declares no new candidate (CR 10.3.1j)", () => {
    let s = createInitialState();
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    const from = s.log.length;
    s = must(s, { type: "basic_gain_credit" });

    const lines = s.log.slice(from);
    const vacant = at(lines, "Vacant positions checked");
    const root = at(lines, "Cards entering a root during a breach checked");
    const closed = lines.findIndex(
      (line, i) =>
        i > root && line.includes("Checkpoint close [instruction]"),
    );
    expect(vacant).toBeLessThan(root);
    expect(root).toBeLessThan(closed);
    expect(lines[root]).toContain(CR.checkpointCardEnteringRoot.number);
    expect(lines[root]).toContain("no breach is open");
    expect(lines[root]).toContain("declares no new candidate");
    expect(s.timing.structure).not.toBe("breach");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("checks discard piles inside the checkpoint after the Corp gains a credit, and nothing returns to its printed characteristics (CR 10.3.1k)", () => {
    let s = createInitialState();
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    const from = s.log.length;
    s = must(s, { type: "basic_gain_credit" });

    const lines = s.log.slice(from);
    const root = at(lines, "Cards entering a root during a breach checked");
    const piles = at(lines, "Discard pile cards checked");
    const closed = lines.findIndex(
      (line, i) =>
        i > piles && line.includes("Checkpoint close [instruction]"),
    );
    expect(root).toBeLessThan(piles);
    expect(piles).toBeLessThan(closed);
    expect(lines[piles]).toContain(CR.checkpointDiscardPileCards.number);
    expect(lines[piles]).toContain("nothing returns to its printed characteristics");
    expect(s.corp.discardPile).toHaveLength(0);
    expect(s.runner.discardPile).toHaveLength(0);
    expect(s.checkpoints).toHaveLength(0);
  });

  it("checks counters in the discard piles inside the checkpoint after the Corp gains a credit, and none return to the bank (CR 10.3.1l)", () => {
    let s = createInitialState();
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    const from = s.log.length;
    s = must(s, { type: "basic_gain_credit" });

    const lines = s.log.slice(from);
    const cards = at(lines, "Discard pile cards checked");
    const counters = at(lines, "Discard pile counters checked");
    const closed = lines.findIndex(
      (line, i) =>
        i > counters && line.includes("Checkpoint close [instruction]"),
    );
    expect(cards).toBeLessThan(counters);
    expect(counters).toBeLessThan(closed);
    expect(lines[counters]).toContain(CR.checkpointDiscardPileCounters.number);
    expect(lines[counters]).toContain("no counter returns to the bank");
    expect(s.corp.discardPile).toHaveLength(0);
    expect(s.runner.discardPile).toHaveLength(0);
    expect(s.checkpoints).toHaveLength(0);
  });

  it("leaves the reaction window closed after the checkpoint for the Corp's credit, because nothing was marked pending (CR 10.3.2)", () => {
    let s = createInitialState();
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    const from = s.log.length;
    s = must(s, { type: "basic_gain_credit" });

    const lines = s.log.slice(from);
    const counters = at(lines, "Discard pile counters checked");
    const closed = lines.findIndex(
      (line, i) =>
        i > counters && line.includes("Checkpoint close [instruction]"),
    );
    const reaction = lines.findIndex(
      (line, i) => i > closed && line.includes("Reaction window checked"),
    );
    expect(counters).toBeLessThan(closed);
    expect(closed).toBeLessThan(reaction);
    expect(lines[reaction]).toContain(CR.checkpointReaction.number);
    expect(lines[reaction]).toContain("stays closed");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("removes an encounter-duration strength increase at the checkpoint after the encounter (CR 10.3.1b.ex1)", () => {
    const s = createInitialState();
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: { iceId: "ice-1", broken: [] },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: { "runner-program-1": 4 },
      encounterStrengthBoosts: { "runner-program-1": 2 },
      iceStrengthBoosts: { "ice-1": 1 },
      accessingCardId: null,
    };
    s.timingKey = "run.checkSubs";
    enterStep(s, "run.movement");
    expect(s.run!.encounterStrengthBoosts).toEqual({});
    expect(s.run!.iceStrengthBoosts).toEqual({});
    expect(s.run!.strengthBoosts["runner-program-1"]).toBe(4);
    expect(s.log.join("\n")).toContain(
      `Duration abilities checked (CR ${CR.checkpointDurationAbilities.number}); 2 removed.`,
    );
  });

  it("removes turn-duration effects at the checkpoint after the turn ends (CR 9.10.1 / 10.3.1b)", () => {
    let s = createInitialState();
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    ice.grantedSubtypesUntilEndOfTurn = ["sentry"];
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];
    s.turn.breakerStrengthBoostsThisTurn = { "runner-program-1": 2 };
    s.turn.iceStrengthBoostsThisTurn = { "ice-1": 1 };
    s.turn.runnerMuModifierUntilTurnEnd = -2;
    s.markServerId = "hq";
    s.timingKey = "runner.turnEnds";
    autoWalk(s);
    expect(s.timingKey).toBe("runner.turnComplete");
    expect(s.turn.breakerStrengthBoostsThisTurn["runner-program-1"]).toBe(2);
    expect(s.markServerId).toBe("hq");
    expect(s.cards["ice-1"]!.grantedSubtypesUntilEndOfTurn).toEqual(["sentry"]);
    s = must(s, { type: "pass_window" });
    expect(s.turn.breakerStrengthBoostsThisTurn).toEqual({});
    expect(s.turn.iceStrengthBoostsThisTurn).toEqual({});
    expect(s.turn.runnerMuModifierUntilTurnEnd).toBeUndefined();
    expect(s.markServerId).toBeNull();
    expect(s.cards["ice-1"]!.grantedSubtypesUntilEndOfTurn).toBeUndefined();
    expect(s.log.join("\n")).toContain(
      `Duration abilities checked (CR ${CR.checkpointDurationAbilities.number}); 5 removed.`,
    );
  });

  it("removes run-duration strength at the checkpoint after the run ends (CR 9.10.1 / 10.3.1b)", () => {
    const s = createInitialState();
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
      strengthBoosts: { "runner-program-1": 3 },
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    s.timingKey = "run.ends";
    autoWalk(s);
    expect(s.run).toBeNull();
    expect(s.log.join("\n")).toContain(
      `Duration abilities checked (CR ${CR.checkpointDurationAbilities.number}); 1 removed.`,
    );
  });

  it("records a hosted condition counter and restores it in Archives (CR 10.1.4 / 10.3.1k)", () => {
    const s = createInitialState();
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    ice.faceup = true;
    const boost = instantiateCard("sub-boost", "sb-1", "corp:hq");
    s.cards["ice-1"] = ice;
    s.cards["sb-1"] = boost;
    s.corp.hand = ["sb-1"];
    s.servers.hq.ice = ["ice-1"];
    const hosted = evalEffect(
      { state: s, sourceId: "sb-1" },
      { op: "do", action: { kind: "host_on_ice_as_condition_on", iceId: "ice-1" } },
    );
    expect(hosted.ok).toBe(true);
    expect(s.cards["sb-1"]!.convertedInto).toBe("counter");
    s.servers.hq.ice = [];
    ice.zone = "corp:archives";
    s.corp.discardPile = ["ice-1"];
    occurCheckpoint(
      s,
      "instruction",
      "after the host left play",
      [CR.checkpointAfterInstruction],
      "test",
    );
    expect(s.corp.discardPile).toContain("sb-1");
    expect(s.cards["sb-1"]!.convertedInto).toBeUndefined();
    expect(s.cards["sb-1"]!.type).toBe("operation");
    expect(s.log.join("\n")).toContain("returns to its printed characteristics");
  });

  it("records a card scored as an agenda and restores it in Archives (CR 10.3.1k)", () => {
    const s = createInitialState();
    const op = instantiateCard("hedge-fund", "hf-1", "corp:hq");
    s.cards["hf-1"] = op;
    s.corp.hand = ["hf-1"];
    const scored = evalEffect(
      { state: s, sourceId: "hf-1" },
      { op: "do", action: { kind: "score_self_as_agenda", agendaPoints: 2 } },
    );
    expect(scored.ok).toBe(true);
    expect(s.cards["hf-1"]!.convertedInto).toBe("agenda");
    expect(s.cards["hf-1"]!.agendaPoints).toBe(2);
    removeCardFromCurrentZone(s, "hf-1");
    op.zone = "corp:archives";
    s.corp.discardPile = ["hf-1"];
    occurCheckpoint(
      s,
      "instruction",
      "after the agenda left the score area",
      [CR.checkpointAfterInstruction],
      "test",
    );
    expect(s.cards["hf-1"]!.convertedInto).toBeUndefined();
    expect(s.cards["hf-1"]!.type).toBe("operation");
    expect(s.cards["hf-1"]!.agendaPoints).toBeUndefined();
    expect(s.log.join("\n")).toContain("returns to its printed characteristics");
  });

  it("trashes Targeted Marketing at the checkpoint after an agenda is stolen (CR 10.3.1b.ex2)", () => {
    let s = createInitialState();
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    const current = instantiateCard("targeted-marketing", "tm-1", "corp:play-area");
    const agenda = instantiateCard("priority-requisition", "ag-1", "server:hq:root");
    s.cards["tm-1"] = current;
    s.cards["ag-1"] = agenda;
    s.corp.playArea = ["tm-1"];
    s.servers.hq.root = ["ag-1"];
    stealAgenda(s, "ag-1");
    expect(s.cards["tm-1"]!.zone).toBe("corp:play-area");
    s = must(s, { type: "basic_gain_credit" });
    expect(s.cards["tm-1"]!.zone).toBe("corp:archives");
    expect(s.corp.discardPile).toContain("tm-1");
    expect(s.log.join("\n")).toContain("duration passed");
  });

  it("trashes a card hosted on an agenda that left a score area (CR 10.3.1f)", () => {
    let s = createInitialState();
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    const agenda = instantiateCard("priority-requisition", "ag-1", "runner:score");
    const hosted = instantiateCard("ice-wall", "wall-1", "hosted:ag-1");
    hosted.hostId = "ag-1";
    agenda.hostedCardIds = ["wall-1"];
    agenda.agendaCounters = 1;
    s.cards["ag-1"] = agenda;
    s.cards["wall-1"] = hosted;
    s.runner.scoreArea = ["ag-1"];
    removeCardFromCurrentZone(s, "ag-1");
    agenda.zone = "corp:archives";
    agenda.faceup = true;
    s.corp.discardPile.push("ag-1");
    s = must(s, { type: "basic_gain_credit" });
    expect(s.corp.discardPile).toContain("wall-1");
    expect(s.cards["wall-1"]!.hostId).toBeUndefined();
    expect(s.cards["ag-1"]!.agendaCounters).toBe(0);
    expect(s.log.join("\n")).toContain(
      `Hosted on agendas checked (CR ${CR.checkpointHostedOnAgenda.number}); 2 trashed.`,
    );
  });

  it("removes an empty remote at the checkpoint (CR 10.3.1h)", () => {
    let s = createInitialState();
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s.servers["remote-1"] = { id: "remote-1", kind: "remote", ice: [], root: [] };
    s = must(s, { type: "basic_gain_credit" });
    expect(s.servers["remote-1"]).toBeUndefined();
    expect(s.log.join("\n")).toContain(
      `remote-1 ceased to exist (CR ${CR.checkpointRemoteServer.number}).`,
    );
  });

  it("ends a run on a remote that ceased to exist, and waits for an open paid ability window (CR 4.6.8e)", () => {
    const ended = createInitialState();
    ended.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: [],
    };
    ended.run = {
      attackedServerId: "remote-1",
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
    occurCheckpoint(
      ended,
      "instruction",
      "after a credit",
      [CR.checkpointAfterInstruction],
      "test",
    );
    expect(ended.servers["remote-1"]).toBeUndefined();
    expect(ended.run!.endedTheRun).toBe(true);
    expect(ended.run!.successful).toBeNull();

    const waiting = createInitialState();
    waiting.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: [],
    };
    waiting.run = {
      attackedServerId: "remote-1",
      phase: "approach",
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
    waiting.priorityStack = [
      {
        id: "pw-1",
        stepKey: "run.approachServerPaw",
        nestDepth: 0,
        consecutivePasses: 0,
        priorityHolder: "corp",
        checkpointId: "",
      },
    ];
    occurCheckpoint(
      waiting,
      "instruction",
      "after a credit",
      [CR.checkpointAfterInstruction],
      "test",
    );
    expect(waiting.run!.endedTheRun).toBe(false);
    expect(waiting.run!.successful).toBe(true);
    expect(waiting.run!.endAfterPaidAbilityWindow).toBe(true);
  });

  it("restores a converted card in Archives to its printed characteristics (CR 10.3.1k)", () => {
    let s = createInitialState();
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    const ice = instantiateCard("ice-wall", "ice-1", "corp:archives");
    ice.convertedInto = "agenda";
    ice.type = "agenda";
    ice.subtypes = ["initiative"];
    s.cards["ice-1"] = ice;
    s.corp.discardPile = ["ice-1"];
    s = must(s, { type: "basic_gain_credit" });
    expect(s.cards["ice-1"]!.type).toBe("ice");
    expect(s.cards["ice-1"]!.convertedInto).toBeUndefined();
    expect(s.cards["ice-1"]!.subtypes).toContain("barrier");
    expect(s.log.join("\n")).toContain("returns to its printed characteristics");
  });

  it("returns counters on a discarded card to the bank (CR 10.3.1l)", () => {
    let s = createInitialState();
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    const ice = instantiateCard("ice-wall", "ice-1", "corp:archives");
    ice.powerCounters = 2;
    ice.advancementCounters = 1;
    s.cards["ice-1"] = ice;
    s.corp.discardPile = ["ice-1"];
    s = must(s, { type: "basic_gain_credit" });
    expect(s.cards["ice-1"]!.powerCounters).toBe(0);
    expect(s.cards["ice-1"]!.advancementCounters).toBe(0);
    expect(s.log.join("\n")).toContain(
      `Discard pile counters checked (CR ${CR.checkpointDiscardPileCounters.number}); 3 return to the bank.`,
    );
  });

  it("checkpoints outside the run after it is complete, before the Runner receives priority (CR 10.3.6)", () => {
    let s = createInitialState();
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: [],
    };
    s.activeSide = "runner";
    s.runner.clicks = 1;
    enterStep(s, "runner.takeAction");
    const from = s.log.length;
    s = must(s, { type: "basic_run", serverId: "remote-1" as ServerId });

    const lines = s.log.slice(from);
    const complete = at(lines, "Run complete");
    const outside = at(lines, "Outside the run");
    const closed = lines.findIndex(
      (line, i) => i > outside && line.includes("Checkpoint close [timing]"),
    );
    const priority = lines.findIndex(
      (line, i) =>
        i > outside &&
        line.includes(CR.checkpointBeforePriority.number) &&
        line.includes("Before runner receives priority"),
    );
    expect(complete).toBeLessThan(outside);
    expect(outside).toBeLessThan(closed);
    expect(closed).toBeLessThan(priority);
    expect(lines[complete]).toContain("11.4_6_d");
    expect(lines[outside]).toContain(CR.checkpointAfterTimingStructure.number);
    expect(lines[outside]).toContain(CR.runTimingStructure.number);
    expect(lines[outside]).toContain("runner_turn");
    expect(lines[priority]).toContain(CR.priorityBeforeAct.number);
    expect(s.run).toBeNull();
    expect(s.timing.structure).toBe("runner_turn");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("checkpoints outside the Run Ends phase after the run is complete, before the checkpoint outside the run (CR 10.3.6, 9.2.2b)", () => {
    let s = createInitialState();
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: [],
    };
    s.activeSide = "runner";
    s.runner.clicks = 1;
    enterStep(s, "runner.takeAction");
    const from = s.log.length;
    s = must(s, { type: "basic_run", serverId: "remote-1" as ServerId });

    const lines = s.log.slice(from);
    const complete = at(lines, "Run complete");
    const outsidePhase = at(lines, "Outside the Run Ends phase");
    const phaseClosed = lines.findIndex(
      (line, i) => i > outsidePhase && line.includes("Checkpoint close [timing]"),
    );
    const outsideRun = at(lines, "Outside the run");
    expect(complete).toBeLessThan(outsidePhase);
    expect(outsidePhase).toBeLessThan(phaseClosed);
    expect(phaseClosed).toBeLessThan(outsideRun);
    expect(lines[complete]).toContain("11.4_6_d");
    expect(lines[complete]).toContain("successful");
    expect(lines[outsidePhase]).toContain("Checkpoint open [timing]");
    expect(lines[outsidePhase]).toContain(CR.checkpointAfterTimingStructure.number);
    expect(lines[outsidePhase]).toContain(CR.runTimingStructure.number);
    expect(lines[outsidePhase]).toContain(CR.runPhases.number);
    expect(lines[outsidePhase]).toContain(CR.runEndsPhase.number);
    expect(lines[outsidePhase]).toContain("← runner_turn");
    expect(s.run).toBeNull();
    expect(s.checkpoints).toHaveLength(0);
  });

  it("checkpoints outside the initiation phase after the run begins, before the Runner approaches the server (CR 10.3.6, 9.2.2b)", () => {
    let s = createInitialState();
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: [],
    };
    s.activeSide = "runner";
    s.runner.clicks = 1;
    enterStep(s, "runner.takeAction");
    const from = s.log.length;
    s = must(s, { type: "basic_run", serverId: "remote-1" as ServerId });

    const lines = s.log.slice(from);
    const begins = at(lines, "Run begins");
    const outside = at(lines, "Outside the initiation phase");
    const closed = lines.findIndex(
      (line, i) => i > outside && line.includes("Checkpoint close [timing]"),
    );
    const approach = at(lines, "Approach server");
    expect(begins).toBeLessThan(outside);
    expect(outside).toBeLessThan(closed);
    expect(closed).toBeLessThan(approach);
    expect(lines[begins]).toContain("11.4_1_c");
    expect(lines[approach]).toContain("11.4_4_g");
    expect(lines[outside]).toContain("Checkpoint open [timing]");
    expect(lines[outside]).toContain(CR.checkpointAfterTimingStructure.number);
    expect(lines[outside]).toContain(CR.runTimingStructure.number);
    expect(lines[outside]).toContain(CR.runPhases.number);
    expect(lines[outside]).toContain(CR.initiationPhase.number);
    expect(lines[outside]).toContain("← run.approachServer");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("checkpoints outside the approach ice phase after unrezzed ice skips the encounter, before the Runner passes that ice (CR 10.3.6, 9.2.2b)", () => {
    let s = createInitialState();
    const iceId = "corp-ice-1";
    s.corp.deck = s.corp.deck.filter((id) => id !== iceId);
    s.cards[iceId].zone = "server:remote-1:ice";
    s.cards[iceId].rezzed = false;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [iceId],
      root: [],
    };
    s.activeSide = "runner";
    s.runner.clicks = 1;
    enterStep(s, "runner.takeAction");
    const from = s.log.length;
    s = must(s, { type: "basic_run", serverId: "remote-1" as ServerId });
    for (
      let i = 0;
      i < 6 && !s.log.slice(from).some((line) => line.includes("Pass ice"));
      i++
    ) {
      s = must(s, { type: "pass_window" });
    }

    const lines = s.log.slice(from);
    const skipped = at(lines, "Ice unrezzed — skip encounter");
    const outside = at(lines, "Outside the approach ice phase");
    const closed = lines.findIndex(
      (line, i) => i > outside && line.includes("Checkpoint close [timing]"),
    );
    const passed = at(lines, "Pass ice");
    expect(skipped).toBeLessThan(outside);
    expect(outside).toBeLessThan(closed);
    expect(closed).toBeLessThan(passed);
    expect(lines[skipped]).toContain("11.4_2_c_ii");
    expect(lines[passed]).toContain("11.4_4");
    expect(lines[outside]).toContain("Checkpoint open [timing]");
    expect(lines[outside]).toContain(CR.checkpointAfterTimingStructure.number);
    expect(lines[outside]).toContain(CR.runTimingStructure.number);
    expect(lines[outside]).toContain(CR.runPhases.number);
    expect(lines[outside]).toContain(CR.approachIcePhase.number);
    expect(lines[outside]).toContain("← run.movement");
    expect(s.run).not.toBeNull();
    expect(s.checkpoints).toHaveLength(0);
  });

  it("checkpoints outside the encounter phase after the Runner encounters rezzed ice with nothing left to resolve, before the Runner passes that ice (CR 10.3.6, 9.2.2b)", () => {
    let s = createInitialState();
    const iceId = "corp-ice-1";
    s.corp.deck = s.corp.deck.filter((id) => id !== iceId);
    s.cards[iceId].zone = "server:remote-1:ice";
    s.cards[iceId].rezzed = true;
    s.cards[iceId].subroutines = [];
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [iceId],
      root: [],
    };
    s.activeSide = "runner";
    s.runner.clicks = 1;
    enterStep(s, "runner.takeAction");
    const from = s.log.length;
    s = must(s, { type: "basic_run", serverId: "remote-1" as ServerId });
    for (
      let i = 0;
      i < 8 && !s.log.slice(from).some((line) => line.includes("Pass ice"));
      i++
    ) {
      s = must(s, { type: "pass_window" });
    }

    const lines = s.log.slice(from);
    const encountered = at(lines, "Encounter ");
    const outside = at(lines, "Outside the encounter phase");
    const closed = lines.findIndex(
      (line, i) => i > outside && line.includes("Checkpoint close [timing]"),
    );
    const passed = at(lines, "Pass ice");
    expect(encountered).toBeLessThan(outside);
    expect(outside).toBeLessThan(closed);
    expect(closed).toBeLessThan(passed);
    expect(lines[encountered]).toContain("11.4_3_a");
    expect(lines[passed]).toContain("11.4_4");
    expect(lines[outside]).toContain("Checkpoint open [timing]");
    expect(lines[outside]).toContain(CR.checkpointAfterTimingStructure.number);
    expect(lines[outside]).toContain(CR.runTimingStructure.number);
    expect(lines[outside]).toContain(CR.runPhases.number);
    expect(lines[outside]).toContain(CR.encounterIcePhase.number);
    expect(lines[outside]).toContain("← run.movement");
    expect(s.run).not.toBeNull();
    expect(s.checkpoints).toHaveLength(0);
  });

  it("checkpoints outside the movement phase after the Runner approaches an empty server, before the run is successful (CR 10.3.6, 9.2.2b)", () => {
    let s = createInitialState();
    s.corp.discardPile = [];
    s.activeSide = "runner";
    s.runner.clicks = 1;
    enterStep(s, "runner.takeAction");
    const from = s.log.length;
    s = must(s, { type: "basic_run", serverId: "archives" });

    const lines = s.log.slice(from);
    const approach = at(lines, "Approach server");
    const outside = at(lines, "Outside the movement phase");
    const closed = lines.findIndex(
      (line, i) => i > outside && line.includes("Checkpoint close [timing]"),
    );
    const successful = at(lines, "Run successful");
    expect(approach).toBeLessThan(outside);
    expect(outside).toBeLessThan(closed);
    expect(closed).toBeLessThan(successful);
    expect(lines[approach]).toContain("11.4_4_g");
    expect(lines[successful]).toContain(CR.successfulRun.number);
    expect(lines[outside]).toContain("Checkpoint open [timing]");
    expect(lines[outside]).toContain(CR.checkpointAfterTimingStructure.number);
    expect(lines[outside]).toContain(CR.runTimingStructure.number);
    expect(lines[outside]).toContain(CR.runPhases.number);
    expect(lines[outside]).toContain(CR.movementPhase.number);
    expect(lines[outside]).toContain("← run.success");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("checkpoints outside the breach after it is complete, while the run is still open (CR 10.3.6, 9.2.2c)", () => {
    let s = createInitialState();
    s.corp.discardPile = [];
    s.activeSide = "runner";
    s.runner.clicks = 1;
    enterStep(s, "runner.takeAction");
    const from = s.log.length;
    s = must(s, { type: "basic_run", serverId: "archives" });

    const lines = s.log.slice(from);
    const breach = at(lines, "Breach complete");
    const outsideBreach = at(lines, "Outside the breach");
    const closed = lines.findIndex(
      (line, i) => i > outsideBreach && line.includes("Checkpoint close [timing]"),
    );
    const runComplete = at(lines, "Run complete");
    const outsideRun = at(lines, "Outside the run");
    expect(breach).toBeLessThan(outsideBreach);
    expect(outsideBreach).toBeLessThan(closed);
    expect(closed).toBeLessThan(runComplete);
    expect(runComplete).toBeLessThan(outsideRun);
    expect(lines[breach]).toContain("11.5_7");
    expect(lines[outsideBreach]).toContain("Checkpoint open [timing]");
    expect(lines[outsideBreach]).toContain(CR.checkpointAfterTimingStructure.number);
    expect(lines[outsideBreach]).toContain(CR.breachTimingStructure.number);
    expect(lines[outsideBreach]).toContain("← run");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("checkpoints outside the success phase after the breach checkpoint closes, before Run Ends (CR 10.3.6, 9.2.2b)", () => {
    let s = createInitialState();
    s.corp.discardPile = [];
    s.activeSide = "runner";
    s.runner.clicks = 1;
    enterStep(s, "runner.takeAction");
    const from = s.log.length;
    s = must(s, { type: "basic_run", serverId: "archives" });

    const lines = s.log.slice(from);
    const breach = at(lines, "Breach complete");
    const outsideBreach = at(lines, "Outside the breach");
    const breachClosed = lines.findIndex(
      (line, i) => i > outsideBreach && line.includes("Checkpoint close [timing]"),
    );
    const outside = at(lines, "Outside the success phase");
    const closed = lines.findIndex(
      (line, i) => i > outside && line.includes("Checkpoint close [timing]"),
    );
    const runEnds = at(lines, "Run Ends");
    expect(breach).toBeLessThan(outsideBreach);
    expect(outsideBreach).toBeLessThan(breachClosed);
    expect(breachClosed).toBeLessThan(outside);
    expect(outside).toBeLessThan(closed);
    expect(closed).toBeLessThan(runEnds);
    expect(lines[breach]).toContain("11.5_7");
    expect(lines[runEnds]).toContain("11.4_6_a");
    expect(lines[outside]).toContain("Checkpoint open [timing]");
    expect(lines[outside]).toContain(CR.checkpointAfterTimingStructure.number);
    expect(lines[outside]).toContain(CR.runTimingStructure.number);
    expect(lines[outside]).toContain(CR.runPhases.number);
    expect(lines[outside]).toContain(CR.successPhase.number);
    expect(lines[outside]).toContain("← run.closePriorityWindows");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("checkpoints outside the access after it is complete, while the breach is still open (CR 10.3.6, 9.2.2d)", () => {
    let s = createInitialState();
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: [],
    };
    const pad = instantiateCard("pad-campaign", "pad-1", "server:remote-1:root");
    delete pad.trashCost;
    s.cards["pad-1"] = pad;
    s.servers["remote-1"].root = ["pad-1"];
    s.activeSide = "runner";
    s.runner.clicks = 1;
    s.corp.credits = 0;
    enterStep(s, "runner.takeAction");
    const from = s.log.length;
    s = must(s, { type: "basic_run", serverId: "remote-1" as ServerId });
    for (let i = 0; i < 8 && s.timingKey !== "breach.awaitAccess"; i++) {
      s = must(s, { type: "pass_window" });
    }
    expect(s.timingKey).toBe("breach.awaitAccess");
    s = must(s, { type: "access_card", cardId: "pad-1" });

    const lines = s.log.slice(from);
    const access = at(lines, "Access complete");
    const outsideAccess = at(lines, "Outside the access");
    const closed = lines.findIndex(
      (line, i) => i > outsideAccess && line.includes("Checkpoint close [timing]"),
    );
    const breach = at(lines, "Breach complete");
    const outsideBreach = at(lines, "Outside the breach");
    expect(access).toBeLessThan(outsideAccess);
    expect(outsideAccess).toBeLessThan(closed);
    expect(closed).toBeLessThan(breach);
    expect(breach).toBeLessThan(outsideBreach);
    expect(lines[access]).toContain(CR.accessComplete.number);
    expect(lines[access]).toContain("11.6_4");
    expect(lines[outsideAccess]).toContain("Checkpoint open [timing]");
    expect(lines[outsideAccess]).toContain(CR.checkpointAfterTimingStructure.number);
    expect(lines[outsideAccess]).toContain(CR.accessTimingStructure.number);
    expect(lines[outsideAccess]).toContain("← breach");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("checkpoints outside the Corp's turn after it is complete, before the Runner gains clicks (CR 10.3.6, 9.2.2a)", () => {
    let s = createInitialState();
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_gain_credit" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_gain_credit" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_gain_credit" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "discard_to_hand_size" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });

    const begins = at(s.log, "Runner turn begins.");
    const outside = at(s.log, "Outside the Corp's turn");
    const closed = s.log.findIndex(
      (line, i) => i > outside && line.includes("Checkpoint close [timing]"),
    );
    const gains = at(s.log, "11.3_1_a");
    expect(begins).toBeLessThan(outside);
    expect(outside).toBeLessThan(closed);
    expect(closed).toBeLessThan(gains);
    expect(s.log[outside]).toContain("Checkpoint open [timing]");
    expect(s.log[outside]).toContain(CR.checkpointAfterTimingStructure.number);
    expect(s.log[outside]).toContain(CR.turnTimingStructure.number);
    expect(s.log[outside]).toContain("← runner_turn");
    expect(s.log[gains]).toContain("Runner gains");
    expect(s.timing.structure).toBe("runner_turn");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("checkpoints outside the Corp's discard phase after the Runner's turn begins, before the checkpoint outside the Corp's turn (CR 10.3.6, 9.2.2a)", () => {
    let s = createInitialState();
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_gain_credit" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_gain_credit" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_gain_credit" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "discard_to_hand_size" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });

    const begins = at(s.log, "Runner turn begins.");
    const outside = at(s.log, "Outside the discard phase");
    const closed = s.log.findIndex(
      (line, i) => i > outside && line.includes("Checkpoint close [timing]"),
    );
    const outsideTurn = at(s.log, "Outside the Corp's turn");
    const gains = at(s.log, "11.3_1_a");
    expect(begins).toBeLessThan(outside);
    expect(outside).toBeLessThan(closed);
    expect(closed).toBeLessThan(outsideTurn);
    expect(outsideTurn).toBeLessThan(gains);
    expect(s.log[outside]).toContain("Checkpoint open [timing]");
    expect(s.log[outside]).toContain(CR.checkpointAfterTimingStructure.number);
    expect(s.log[outside]).toContain(CR.turnTimingStructure.number);
    expect(s.log[outside]).toContain(CR.corpTurnPhases.number);
    expect(s.log[outside]).toContain(CR.discardPhase.number);
    expect(s.log[outside]).toContain("← runner_turn");
    expect(s.log[gains]).toContain("Runner gains");
    expect(s.timing.structure).toBe("runner_turn");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("checkpoints outside the action phase after it ends, before the Corp discards (CR 10.3.6, 9.2.2a)", () => {
    let s = createInitialState();
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_gain_credit" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_gain_credit" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_gain_credit" });
    for (let i = 0; i < 8 && s.timingKey !== "corp.discard"; i++) {
      s = must(s, { type: "pass_window" });
    }

    expect(s.timingKey).toBe("corp.discard");
    expect(s.timing.structure).toBe("corp_turn");
    expect(s.timing.stepNumber).toBe("11.2_3_a");
    expect(s.log.some((line) => line.includes("discards to hand size"))).toBe(false);
    const outside = at(s.log, "Outside the action phase");
    const closed = s.log.findIndex(
      (line, i) => i > outside && line.includes("Checkpoint close [timing]"),
    );
    expect(outside).toBeLessThan(closed);
    expect(s.log[outside]).toContain("Checkpoint open [timing]");
    expect(s.log[outside]).toContain(CR.checkpointAfterTimingStructure.number);
    expect(s.log[outside]).toContain(CR.turnTimingStructure.number);
    expect(s.log[outside]).toContain(CR.corpTurnPhases.number);
    expect(s.log[outside]).toContain("← corp.discard");
    expect(s.checkpoints).toHaveLength(0);

    s = must(s, { type: "discard_to_hand_size" });
    const discarded = at(s.log, "discards to hand size");
    expect(closed).toBeLessThan(discarded);
  });

  it("checkpoints outside the Runner's action phase after it ends, before the Runner discards (CR 10.3.6, 9.2.2a)", () => {
    let s = createInitialState();
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_gain_credit" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_gain_credit" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_gain_credit" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "discard_to_hand_size" });
    for (let i = 0; i < 48 && s.timingKey !== "runner.discard"; i++) {
      if (s.timingKey === "runner.takeAction" && s.runner.clicks > 0) {
        s = must(s, { type: "basic_gain_credit" });
      } else if (s.timingKey === "corp.discard") {
        s = must(s, { type: "discard_to_hand_size" });
      } else {
        s = must(s, { type: "pass_window" });
      }
    }

    expect(s.timingKey).toBe("runner.discard");
    expect(s.timing.structure).toBe("runner_turn");
    expect(s.timing.stepNumber).toBe("11.3_2_a");
    const outside = s.log.findIndex(
      (line) =>
        line.includes("Outside the Runner's action phase") &&
        line.includes("← runner.discard"),
    );
    expect(outside, "Outside the Runner's action phase").toBeGreaterThanOrEqual(0);
    const closed = s.log.findIndex(
      (line, i) => i > outside && line.includes("Checkpoint close [timing]"),
    );
    expect(outside).toBeLessThan(closed);
    expect(s.log[outside]).toContain("Checkpoint open [timing]");
    expect(s.log[outside]).toContain(CR.checkpointAfterTimingStructure.number);
    expect(s.log[outside]).toContain(CR.turnTimingStructure.number);
    expect(s.log[outside]).toContain(CR.runnerTurnPhases.number);
    expect(s.checkpoints).toHaveLength(0);

    const beforeDiscard = s.log.length;
    s = must(s, { type: "discard_to_hand_size" });
    const discarded = s.log.findIndex(
      (line, i) => i >= beforeDiscard && line.includes("discards to hand size"),
    );
    expect(discarded).toBeGreaterThan(closed);
    expect(s.log[discarded]).toContain("runner");
  });

  it("checkpoints outside the draw phase after the Corp draws, before the Corp receives priority (CR 10.3.6, 9.2.2a)", () => {
    let s = createInitialState();
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    expect(s.timingKey).toBe("corp.mandatoryDraw");
    const from = s.log.length;
    s = must(s, { type: "pass_window" });

    expect(s.timingKey).toBe("corp.actionPaw");
    expect(s.timing.structure).toBe("corp_turn");
    expect(s.timing.stepNumber).toBe("11.2_2_a");
    const lines = s.log.slice(from);
    const added = at(lines, "Add set-aside card to hand");
    const outside = at(lines, "Outside the draw phase");
    const closed = lines.findIndex(
      (line, i) => i > outside && line.includes("Checkpoint close [timing]"),
    );
    const priority = lines.findIndex(
      (line, i) =>
        i > outside &&
        line.includes(CR.checkpointBeforePriority.number) &&
        line.includes("Before corp receives priority"),
    );
    expect(added).toBeLessThan(outside);
    expect(outside).toBeLessThan(closed);
    expect(closed).toBeLessThan(priority);
    expect(lines[outside]).toContain("Checkpoint open [timing]");
    expect(lines[outside]).toContain(CR.checkpointAfterTimingStructure.number);
    expect(lines[outside]).toContain(CR.turnTimingStructure.number);
    expect(lines[outside]).toContain(CR.corpTurnPhases.number);
    expect(lines[outside]).toContain("← corp.actionPaw");
    expect(lines[priority]).toContain(CR.priorityBeforeAct.number);
    expect(s.checkpoints).toHaveLength(0);
  });

  it("checkpoints outside the Runner's turn after it is complete, before the Corp gains clicks (CR 10.3.6, 9.2.2a)", () => {
    let s = createInitialState({ stopAfterFirstCycle: false });
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_gain_credit" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_gain_credit" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_gain_credit" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "discard_to_hand_size" });
    const from = s.log.length;
    for (
      let i = 0;
      i < 48 && !s.log.slice(from).some((line) => line.includes("11.2_1_a"));
      i++
    ) {
      if (s.timingKey === "runner.takeAction" && s.runner.clicks > 0) {
        s = must(s, { type: "basic_gain_credit" });
      } else if (s.timingKey === "runner.discard") {
        s = must(s, { type: "discard_to_hand_size" });
      } else {
        s = must(s, { type: "pass_window" });
      }
    }

    const begins = at(s.log, "Corp turn 2 begins.");
    const outside = at(s.log, "Outside the Runner's turn");
    const closed = s.log.findIndex(
      (line, i) => i > outside && line.includes("Checkpoint close [timing]"),
    );
    const gains = s.log.findIndex(
      (line, i) => i > begins && line.includes("11.2_1_a"),
    );
    expect(gains, "11.2_1_a").toBeGreaterThan(begins);
    expect(begins).toBeLessThan(outside);
    expect(outside).toBeLessThan(closed);
    expect(closed).toBeLessThan(gains);
    expect(s.log[outside]).toContain("Checkpoint open [timing]");
    expect(s.log[outside]).toContain(CR.checkpointAfterTimingStructure.number);
    expect(s.log[outside]).toContain(CR.turnTimingStructure.number);
    expect(s.log[outside]).toContain("← corp_turn");
    expect(s.log[gains]).toContain("Corp gains");
    expect(s.timing.structure).toBe("corp_turn");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("checkpoints outside the Runner's discard phase after the Corp's second turn begins, before the checkpoint outside the Runner's turn (CR 10.3.6, 9.2.2a)", () => {
    let s = createInitialState({ stopAfterFirstCycle: false });
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_gain_credit" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_gain_credit" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_gain_credit" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "discard_to_hand_size" });
    const from = s.log.length;
    for (
      let i = 0;
      i < 48 && !s.log.slice(from).some((line) => line.includes("11.2_1_a"));
      i++
    ) {
      if (s.timingKey === "runner.takeAction" && s.runner.clicks > 0) {
        s = must(s, { type: "basic_gain_credit" });
      } else if (s.timingKey === "runner.discard") {
        s = must(s, { type: "discard_to_hand_size" });
      } else {
        s = must(s, { type: "pass_window" });
      }
    }

    const begins = at(s.log, "Corp turn 2 begins.");
    const outside = at(s.log, "Outside the Runner's discard phase");
    const closed = s.log.findIndex(
      (line, i) => i > outside && line.includes("Checkpoint close [timing]"),
    );
    const outsideTurn = at(s.log, "Outside the Runner's turn");
    const gains = s.log.findIndex(
      (line, i) => i > begins && line.includes("11.2_1_a"),
    );
    expect(gains, "11.2_1_a").toBeGreaterThan(begins);
    expect(begins).toBeLessThan(outside);
    expect(outside).toBeLessThan(closed);
    expect(closed).toBeLessThan(outsideTurn);
    expect(outsideTurn).toBeLessThan(gains);
    expect(s.log[outside]).toContain("Checkpoint open [timing]");
    expect(s.log[outside]).toContain(CR.checkpointAfterTimingStructure.number);
    expect(s.log[outside]).toContain(CR.turnTimingStructure.number);
    expect(s.log[outside]).toContain(CR.runnerTurnPhases.number);
    expect(s.log[outside]).toContain(CR.discardPhase.number);
    expect(s.log[outside]).toContain("← corp_turn");
    expect(s.log[gains]).toContain("Corp gains");
    expect(s.timing.structure).toBe("corp_turn");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("checkpoints a trace after it initiates and before it resolves (CR 10.8.6b)", () => {
    const s = createInitialState();
    startTrace(s, s.corp.identityId, 0, fx.gainCredits("corp", 1));

    const initiated = at(s.log, "Trace initiated");
    const checkpoint = at(s.log, "Checkpoint open [trace]");
    expect(initiated).toBeLessThan(checkpoint);
    expect(s.log[checkpoint]).toContain(CR.traceCheckpoint.number);
    expect(s.log[checkpoint]).toContain(CR.tracePause.number);
    expect(s.trace).not.toBeNull();
    expect(s.checkpoints).toHaveLength(0);

    const resolved = resolveTrace(s);
    expect(resolved.ok).toBe(true);
    const resolves = at(s.log, "Trace resolves");
    const gain = at(s.log, "corp gains 1¢");
    expect(checkpoint).toBeLessThan(resolves);
    expect(resolves).toBeLessThan(gain);
    expect(s.trace).toBeNull();
    expect(s.checkpoints).toHaveLength(0);
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

  it("resolves Gemini's strength ability after the trace is determined (CR 10.8.5.ex1)", () => {
    const grip = (s: GameState) => {
      s.runner.hand = [];
      for (let i = 0; i < 3; i++) {
        const card = instantiateCard("sure-gamble", `grip-${i}`, "runner:grip");
        s.cards[card.id] = card;
        s.runner.hand.push(card.id);
      }
    };
    const gemini = (s: GameState) => {
      const ice = instantiateCard("gemini", "gem-1", "server:hq:ice");
      ice.rezzed = true;
      s.cards["gem-1"] = ice;
    };
    const netHits = (s: GameState) =>
      s.log.filter((line) => line.startsWith("net damage 1:")).length;

    const low = createInitialState();
    gemini(low);
    grip(low);
    low.runner.link = 0;
    const lowTrace = evalEffect(
      { state: low, sourceId: "gem-1" },
      fx.do({ kind: "trace_subroutine" }),
    );
    expect(lowTrace.ok).toBe(true);
    expect(netHits(low)).toBe(1);

    const missed = createInitialState();
    gemini(missed);
    grip(missed);
    missed.runner.link = 3;
    const missedTrace = evalEffect(
      { state: missed, sourceId: "gem-1" },
      fx.do({ kind: "trace_subroutine" }),
    );
    expect(missedTrace.ok).toBe(true);
    expect(netHits(missed)).toBe(0);

    const strongFail = createInitialState();
    gemini(strongFail);
    grip(strongFail);
    strongFail.runner.link = 6;
    strongFail.corp.credits = 5;
    const whenDetermined = fx.do({ kind: "trace_when_determined" });
    startTrace(
      strongFail,
      "gem-1",
      2,
      fx.seq(fx.do({ kind: "trace_success" }), whenDetermined),
      whenDetermined,
    );
    expect(boostTrace(strongFail, 3)).toBeNull();
    const failed = resolveTrace(strongFail);
    expect(failed.ok).toBe(true);
    expect(netHits(strongFail)).toBe(1);
    expect(strongFail.log.join("\n")).toContain(CR.traceConditionals.number);
  });

  it("trashes one installed program when the Runner jacks out of rezzed Port Anson Grid (CR 6.1.5)", () => {
    const openRun = (server: "hq" | "rd"): GameState => {
      const s = createInitialState();
      s.activeSide = "runner";
      s.timingKey = "run.jackOutWindow";
      s.run = {
        attackedServerId: server,
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
      return s;
    };
    const installGrid = (s: GameState, server: "hq" | "rd", rezzed: boolean) => {
      const grid = instantiateCard("port-anson-grid", "anson-1", `server:${server}:root`);
      grid.rezzed = rezzed;
      grid.faceup = rezzed;
      s.cards["anson-1"] = grid;
      s.servers[server].root = ["anson-1"];
    };
    const installProgram = (s: GameState, defId: string, id: string) => {
      const card = instantiateCard(defId, id, "runner:installed");
      s.cards[id] = card;
      s.runner.installed.push(id);
    };

    const one = openRun("hq");
    installGrid(one, "hq", true);
    installProgram(one, "femme-fatale", "ff-1");
    const resource = instantiateCard("decoy", "decoy-1", "runner:installed");
    one.cards["decoy-1"] = resource;
    one.runner.installed.push("decoy-1");
    const trashed = must(one, { type: "jack_out" });
    expect(trashed.runner.discardPile).toContain("ff-1");
    expect(trashed.runner.installed).toContain("decoy-1");
    expect(trashed.run).toBeNull();
    expect(trashed.log.join("\n")).toContain(CR.jackingOut.number);

    const choose = openRun("hq");
    installGrid(choose, "hq", true);
    installProgram(choose, "femme-fatale", "ff-1");
    installProgram(choose, "chisel", "chisel-1");
    const offered = must(choose, { type: "jack_out" });
    expect(offered.run).not.toBeNull();
    expect(offered.pendingChoice?.chooser).toBe("runner");
    expect(offered.pendingChoice?.options.map((option) => option.id).sort()).toEqual([
      "anson:chisel-1",
      "anson:ff-1",
    ]);
    const picked = must(offered, { type: "choose_option", optionId: "anson:chisel-1" });
    expect(picked.runner.discardPile).toContain("chisel-1");
    expect(picked.runner.installed).toContain("ff-1");
    expect(picked.run).toBeNull();

    const unrezzed = openRun("hq");
    installGrid(unrezzed, "hq", false);
    installProgram(unrezzed, "femme-fatale", "ff-1");
    const stayed = must(unrezzed, { type: "jack_out" });
    expect(stayed.runner.installed).toContain("ff-1");
    expect(stayed.run).toBeNull();

    const elsewhere = openRun("hq");
    installGrid(elsewhere, "rd", true);
    installProgram(elsewhere, "femme-fatale", "ff-1");
    const otherServer = must(elsewhere, { type: "jack_out" });
    expect(otherServer.runner.installed).toContain("ff-1");
    expect(otherServer.run).toBeNull();
  });

  it("lets Jackpot! take its hosted credits when an agenda is added to the Runner score area (CR 1.17.7)", () => {
    const setup = () => {
      const s = createInitialState();
      const jackpot = instantiateCard("jackpot", "jp-1", "runner:installed");
      jackpot.hostedCredits = 3;
      const agenda = instantiateCard("priority-requisition", "ag-1", "server:hq:root");
      s.cards["jp-1"] = jackpot;
      s.cards["ag-1"] = agenda;
      s.runner.installed = ["jp-1"];
      s.servers.hq.root = ["ag-1"];
      s.runner.credits = 5;
      return s;
    };

    const take = setup();
    stealAgenda(take, "ag-1");
    expect(take.runner.scoreArea).toContain("ag-1");
    expect(take.pendingChoice?.chooser).toBe("runner");
    expect(take.pendingChoice?.options.map((option) => option.id)).toEqual([
      "accept",
      "decline",
    ]);
    expect(take.cards["jp-1"]?.hostedCredits).toBe(3);
    const taken = must(take, { type: "choose_option", optionId: "accept" });
    expect(taken.runner.credits).toBe(8);
    expect(taken.runner.discardPile).toContain("jp-1");
    expect(taken.cards["jp-1"]?.hostedCredits).toBe(0);
    expect(taken.log.join("\n")).toContain(CR.stealingAgenda.number);

    const leave = setup();
    stealAgenda(leave, "ag-1");
    const declined = must(leave, { type: "choose_option", optionId: "decline" });
    expect(declined.runner.credits).toBe(5);
    expect(declined.runner.installed).toContain("jp-1");
    expect(declined.cards["jp-1"]?.hostedCredits).toBe(3);
  });
});
