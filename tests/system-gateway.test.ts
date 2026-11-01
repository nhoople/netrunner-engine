import { describe, expect, it, beforeAll } from "vitest";
import {
  applyIntent,
  createGame,
  createInitialState,
  CR,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  loadCardPool,
  setupEmptyRemoteWithIce,
  assertPinnedTag,
  crDataPresent,
  effectiveIceStrength,
  playEffectFromCard,
} from "../src/index.js";
import type { Action, GameState, ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  assertPinnedTag("v26.03");
});

function must(state: GameState, action: Action): GameState {
  const r = applyIntent(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("card corpus system-gateway", () => {

  it("marks partial cards with explicit unsupported notes (never empty silence)", () => {
    const pool = loadCardPool(true).waves["system-gateway"].cards;
    for (const id of pool) {
      const notes = getCardDef(id).unsupported;
      expect(Array.isArray(notes ?? []), id).toBe(true);
      // Fully supported cards use [] ; partials must name every deferred clause.
      if (notes && notes.length > 0) {
        for (const n of notes) expect(n.length).toBeGreaterThan(0);
      }
    }
    const full = getCardDef("whitespace");
    expect(full.unsupported ?? []).toEqual([]);
    const fermenter = getCardDef("fermenter");
    expect(fermenter.unsupported ?? []).toEqual([]);
  });

  it("Government Subsidy / Creative Commission / Whitespace IR", () => {
    expect(playEffectFromCard(getCardDef("government-subsidy"))).toEqual(
      fx.gainCredits("corp", 15),
    );
    expect(playEffectFromCard(getCardDef("creative-commission"))).toEqual(
      fx.seq(
        fx.gainCredits("runner", 5),
        fx.if(
          { op: "clicks_remaining", side: "runner" },
          fx.loseClicks("runner", 1),
        ),
      ),
    );
    const ws = getCardDef("whitespace");
    expect(ws.subroutines?.[0]?.effect).toEqual(fx.loseCredits("runner", 3));
    expect(ws.subroutines?.[1]?.effect).toEqual(
      fx.if({ op: "credits_lte", side: "runner", amount: 6 }, fx.etr()),
    );
  });

  it("Buzzsaw breaks up to 2 code gate subs for one credit payment", () => {
    expect(getCardDef("buzzsaw").breaker?.breakMaxSubs).toBe(2);
    let s = setupEmptyRemoteWithIce();
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    const iceId = remote.ice[0]!;
    const ice = instantiateCard("whitespace", iceId, `server:${remote.id}:ice`);
    const buzz = instantiateCard("buzzsaw", "buzz-1", "runner:grip");
    s = structuredClone(s);
    s.cards[iceId] = ice;
    s.cards["buzz-1"] = buzz;
    s.runner.hand.push("buzz-1");
    s.runner.credits = 10;

    s = must(s, {
      type: "basic_install",
      cardId: "buzz-1",
      destination: { kind: "installed" },
    });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_run", serverId: remote.id as ServerId });
    s = must(s, { type: "rez_ice", cardId: iceId });
    s = must(s, { type: "pass_window" });
    // Whitespace str 0; Buzzsaw str 3 — pump not needed
    const before = s.runner.credits;
    s = must(s, {
      type: "break_subroutine",
      breakerId: "buzz-1",
      subIndex: 0,
    });
    expect(s.runner.credits).toBe(before - 1);
    expect(s.run?.encounter?.freeBreaksRemaining?.remaining).toBe(1);
    s = must(s, {
      type: "break_subroutine",
      breakerId: "buzz-1",
      subIndex: 1,
    });
    expect(s.runner.credits).toBe(before - 1);
    s = must(s, { type: "pass_window" });
    expect(s.run?.successful === true || s.timingKey.includes("run")).toBe(true);
  });

  it("Palisade gets +2 strength on remotes", () => {
    let s = setupEmptyRemoteWithIce();
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    const iceId = remote.ice[0]!;
    const pal = instantiateCard("palisade", iceId, `server:${remote.id}:ice`);
    s = structuredClone(s);
    s.cards[iceId] = pal;
    expect(effectiveIceStrength(s, iceId)).toBe(4);
  });

  it("Ballista choose: trash program or end the run", () => {
    let s = setupEmptyRemoteWithIce();
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    const iceId = remote.ice[0]!;
    const ice = instantiateCard("ballista", iceId, `server:${remote.id}:ice`);
    const prog = instantiateCard("cleaver", "prog-1", "runner:grip");
    s = structuredClone(s);
    s.cards[iceId] = ice;
    s.cards["prog-1"] = prog;
    s.runner.hand.push("prog-1");
    s.runner.credits = 10;
    s = must(s, {
      type: "basic_install",
      cardId: "prog-1",
      destination: { kind: "installed" },
    });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_run", serverId: remote.id as ServerId });
    s = must(s, { type: "rez_ice", cardId: iceId });
    s = must(s, { type: "pass_window" });
    // Decline encounter PAW → resolve subs → choice
    s = must(s, { type: "pass_window" });
    expect(s.pendingChoice?.chooser).toBe("corp");
    s = must(s, { type: "choose_option", optionId: "etr" });
    expect(s.run).toBeNull();
    expect(s.log.some((l) => l.includes("End the run"))).toBe(true);
  });

  it("Offworld Office onScore gains 7¢; Orbital Superiority branches on tags", () => {
    let s = createGame({ stopAfterFirstCycle: false, agendaPointsToWin: 7 });
    const agenda = instantiateCard(
      "offworld-office",
      "oo-1",
      "server:remote-1:root",
    );
    agenda.advancementCounters = 4;
    s = structuredClone(s);
    s.cards["oo-1"] = agenda;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["oo-1"],
    };
    s.nextRemoteNumber = 2;
    for (let i = 0; i < 8; i++) {
      if (s.timingKey === "corp.takeAction") break;
      if (
        s.timingKey === "opening.corpMulligan" ||
        s.timingKey === "opening.runnerMulligan"
      ) {
        s = must(s, { type: "keep_starting_hand" });
        continue;
      }
      s = must(s, { type: "pass_window" });
    }
    const before = s.corp.credits;
    s.timingKey = "corp.actionPaw";
    s = must(s, { type: "score_agenda", cardId: "oo-1" });
    expect(s.corp.credits).toBe(before + 7);

    const orb = getCardDef("orbital-superiority");
    expect(orb.onScore).toEqual(
      fx.if({ op: "runner_tagged" }, fx.meatDamage(4), fx.giveTags(1)),
    );
  });

  it("lose_credits and gain_clicks IR primitives", () => {
    const s = createInitialState();
    s.runner.credits = 5;
    let r = evalEffect(
      { state: s, sourceId: "corp-ice-1" },
      fx.loseCredits("runner", 3),
    );
    expect(r.ok).toBe(true);
    expect(s.runner.credits).toBe(2);

    s.corp.clicks = 1;
    r = evalEffect(
      { state: s, sourceId: "corp-id" },
      fx.gainClicks("corp", 3),
    );
    expect(r.ok).toBe(true);
    expect(s.corp.clicks).toBe(4);
    expect(s.log.some((l) => l.includes(CR.spendClicks.number))).toBe(true);
  });

  it("Fermenter virus counters + trash for credits", () => {
    let s = createInitialState();
    // Force runner action window with fermenter installed
    const ferm = instantiateCard("fermenter", "ferm-1", "runner:grip");
    s = structuredClone(s);
    s.cards["ferm-1"] = ferm;
    s.runner.hand = ["ferm-1"];
    s.runner.installed = [];
    s.runner.credits = 5;
    s.runner.clicks = 4;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s = must(s, {
      type: "basic_install",
      cardId: "ferm-1",
      destination: { kind: "installed" },
    });
    expect(s.cards["ferm-1"].virusCounters).toBe(1);
    s.cards["ferm-1"].virusCounters = 3;
    // Click ability is an action (CR 5.2.1), taken after the install's PAW.
    s.timingKey = "runner.takeAction";
    const before = s.runner.credits;
    s = must(s, {
      type: "use_paid_ability",
      cardId: "ferm-1",
      abilityId: "fermenter-cash",
    });
    expect(s.runner.credits).toBe(before + 6);
    expect(s.runner.discardPile).toContain("ferm-1");
  });

  it("counts fully supported vs partial Gateway cards", () => {
    const pool = loadCardPool().waves["system-gateway"].cards;
    let full = 0;
    let partial = 0;
    const unsupportedList: string[] = [];
    for (const id of pool) {
      const def = getCardDef(id);
      const notes = def.unsupported ?? [];
      if (notes.length === 0) full += 1;
      else {
        partial += 1;
        unsupportedList.push(`${id}: ${notes[0]}`);
      }
    }
    expect(full + partial).toBe(77);
    expect(full).toBeGreaterThanOrEqual(50);
    // Snapshot tally for PR summary (logged by assertion message)
    expect(
      { full, partial, sample: unsupportedList.slice(0, 3) },
      `Gateway support tally full=${full} partial=${partial}`,
    ).toBeTruthy();
  });
});
