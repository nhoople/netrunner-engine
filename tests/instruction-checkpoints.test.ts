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
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  CR,
  createInitialState,
  crDataPresent,
  enterStep,
  fx,
  instantiateCard,
  resolveTrace,
  startTrace,
} from "../src/index.js";
import { drawCards } from "../src/effects/draw.js";
import { mayLookAtHiddenZone } from "../src/state/hiddenSearch.js";
import type { GameState, ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.145.0");
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

  it("does not trash Ashen Epilogue after its last ability removes it from the game (CR 8.6.6a)", () => {
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
    expect(s.runner.discard).not.toContain("ae-1");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("hosts On the Lam instead of trashing it (CR 8.6.6b)", () => {
    let s = createInitialState();
    const res = instantiateCard("daily-casts", "dc-1", "runner:rig");
    s.cards["dc-1"] = res;
    s.runner.rig = ["dc-1"];
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
    expect(s.runner.discard).not.toContain("otl-1");
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
    expect(s.corp.discard).not.toContain("nc-1");
    expect(s.checkpoints).toHaveLength(0);
  });

  it("does not trash Petty Cash played from Archives; it is removed after it resolves (CR 8.6.6d)", () => {
    let s = createInitialState();
    const op = instantiateCard("petty-cash", "pc-1", "corp:archives");
    s.cards["pc-1"] = op;
    s.corp.discard = ["pc-1"];
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
    expect(s.corp.discard).not.toContain("pc-1");
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

  it("plays Hedge Fund through Subcontract before IPO, and IPO is paid with those credits (CR 8.6.3)", () => {
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

  it("trashes Test Run once its lingering effect exists, and that effect returns the program at the end of the turn (CR 8.6.4)", () => {
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
    expect(s.cards["co-1"]?.zone).toBe("runner:rig");
    expect(s.checkpoints).toHaveLength(0);

    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "discard_to_hand_size" });
    expect(s.cards["co-1"]?.zone).toBe("runner:rig");
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });

    const returned = s.log.findIndex(
      (line) => line === "Corroder returns to the stack at the end of the turn.",
    );
    expect(returned, "end of turn").toBeGreaterThanOrEqual(0);
    expect(complete).toBeLessThan(returned);
    expect(s.log[returned]).not.toContain("Test Run");
    expect(s.cards["co-1"]?.zone).toBe("runner:stack");
    expect(s.runner.rig).not.toContain("co-1");
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
    expect(s.runner.discard).toContain("sg-1");
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
    expect(s.corp.discard).toContain("hf-1");
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
    const vp = instantiateCard("verbal-plasticity", "vp-1", "runner:rig");
    s.cards["vp-1"] = vp;
    s.runner.rig.push("vp-1");
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
    const truth = instantiateCard("find-the-truth", "ftt-1", "runner:rig");
    s.cards["ftt-1"] = truth;
    s.runner.rig.push("ftt-1");
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
    expect(s.corp.score).toHaveLength(0);
    expect(s.runner.score).toHaveLength(0);
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
    expect(s.runner.rig).toHaveLength(0);
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
    expect(s.corp.score).toHaveLength(0);
    expect(s.runner.score).toHaveLength(0);
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
    expect(s.runner.rig).toHaveLength(0);
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
    expect(s.corp.discard).toHaveLength(0);
    expect(s.runner.discard).toHaveLength(0);
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
    expect(s.corp.discard).toHaveLength(0);
    expect(s.runner.discard).toHaveLength(0);
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
});
