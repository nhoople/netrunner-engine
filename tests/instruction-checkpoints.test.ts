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
  commitCheckpointSnapshot,
  createInitialState,
  crDataPresent,
  enterStep,
  evalEffect,
  fx,
  instantiateCard,
  stealAgenda,
  legalActions,
  resolveTrace,
  startTrace,
} from "../src/index.js";
import { drawCards } from "../src/effects/draw.js";
import { occurCheckpoint } from "../src/legality/checkpoints.js";
import { removeCardFromCurrentZone } from "../src/state/scoring.js";
import { mayLookAtHiddenZone } from "../src/state/hiddenSearch.js";
import {
  addLingeringEffect,
  LINGERING_KIND_RUNNER_MU,
} from "../src/state/lingeringEffects.js";
import type { GameState, ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.15");
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
    s = must(s, { type: "choose_option", optionId: "aesop:dd-1" });

    const trashed = at(s.log, "Aesop's Pawnshop — trash Drug Dealer, gain 3¢");
    const ended = at(
      s.log,
      "Drug Dealer loses pending status — ability inactive",
    );
    expect(trashed).toBeLessThan(ended);
    expect(s.log[ended]).toContain(CR.pendingAbilityInactive.number);
    expect(s.runner.credits).toBe(8);
    expect(s.runner.installed).not.toContain("dd-1");
    expect(s.cards["dd-1"]?.zone).toBe("runner:heap");
    expect(s.log.some((line) => line.includes("runner loses"))).toBe(false);
    expect(
      s.pendingAbilities.some(
        (p) => p.sourceId === "dd-1" && p.status === "pending",
      ),
    ).toBe(false);
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
    addLingeringEffect(s, {
      createdBy: s.corp.identityId,
      duration: { kind: "turn", side: "runner" },
      kind: LINGERING_KIND_RUNNER_MU,
      payload: { delta: -2 },
    });
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
    addLingeringEffect(s, {
      createdBy: s.corp.identityId,
      duration: { kind: "turn", side: "runner" },
      kind: LINGERING_KIND_RUNNER_MU,
      payload: { delta: -2 },
    });
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
    // Baseline so 10.3.1a zone-diff can see the root entry (CR 10.3.1j).
    commitCheckpointSnapshot(s, "before-drafter-install");
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
    commitCheckpointSnapshot(s, "before-drafter-install");
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
    const picked = must(take, { type: "choose_option", optionId: "accept" });
    const taken = must(picked, {
      type: "choose_option",
      optionId: "jackpot-take:3",
    });
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
