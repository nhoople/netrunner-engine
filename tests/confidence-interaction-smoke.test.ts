/**
 * Corpus interaction smoke (Gateway→VP): ≥3 diverse matrix rows from
 * docs/interaction-smoke-samples.md — happy path + one failure/prevent path.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  abilitiesSuppressed,
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  autoWalk,
  cardsDataPresent,
  createInitialState,
  CR,
  crDataPresent,
  enterStep,
  evalEffect,
  explainAction,
  fx,
  getCardDef,
  instantiateCard,
  isActionLegal,
  legalActions,
  queryLegality,
  setupEmptyRemoteWithIce,
} from "../src/index.js";
import type { Action, GameState, ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.116.0");
});

function must(state: GameState, action: Action): GameState {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("confidence smoke — prevent × cost (AirbladeX net prevent)", () => {
  it("happy: during-run net damage opens interrupt; AirbladeX prevents 1", () => {
    expect(getCardDef("airbladex-jsrf-ed").unsupported ?? []).toEqual([]);
    let s = createInitialState();
    s = structuredClone(s);
    const abx = instantiateCard("airbladex-jsrf-ed", "abx", "runner:rig");
    abx.powerCounters = 2;
    s.cards["abx"] = abx;
    s.runner.rig = ["abx"];
    s.runner.hand = ["h1", "h2"];
    for (const id of ["h1", "h2"]) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    }
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };

    expect(evalEffect({ state: s, sourceId: "src" }, fx.netDamage(2)).ok).toBe(
      true,
    );
    expect(s.pendingDamage).toMatchObject({
      type: "net",
      remaining: 2,
      interruptPawOnly: true,
    });
    expect(
      legalActions(s).some(
        (a) =>
          a.type === "use_paid_ability" &&
          a.abilityId === "airblade-prevent-damage",
      ),
    ).toBe(true);

    s = must(s, {
      type: "use_paid_ability",
      cardId: "abx",
      abilityId: "airblade-prevent-damage",
    });
    expect(s.cards["abx"]!.powerCounters).toBe(1);
    expect(s.pendingDamage?.remaining).toBe(1);
  });

  it("failure: outside a run, AirbladeX prevent stays illegal (requireDuringRun)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const abx = instantiateCard("airbladex-jsrf-ed", "abx", "runner:rig");
    abx.powerCounters = 2;
    s.cards["abx"] = abx;
    s.runner.rig = ["abx"];
    s.runner.hand = ["h1"];
    s.cards["h1"] = instantiateCard("sure-gamble", "h1", "runner:grip");
    // No active run — AirbladeX requireDuringRun blocks prevent.

    expect(evalEffect({ state: s, sourceId: "src" }, fx.netDamage(1)).ok).toBe(
      true,
    );
    expect(s.pendingDamage).toBeNull();
    expect(s.runner.hand).toHaveLength(0);
    expect(s.cards["abx"]!.powerCounters).toBe(2);
    expect(
      legalActions(s).some(
        (a) =>
          a.type === "use_paid_ability" &&
          a.abilityId === "airblade-prevent-damage",
      ),
    ).toBe(false);
  });
});

describe("confidence smoke — blank × host (Hush × Anvil, Parhelion)", () => {
  it("happy: Hush blanks host ice abilities; printed subs remain", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("anvil", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];
    const hush = instantiateCard("hush", "hush-1", "runner:rig");
    hush.hostId = "ice-1";
    s.cards["hush-1"] = hush;
    s.runner.rig = ["hush-1"];

    expect(abilitiesSuppressed(s, "ice-1")).toBe(true);
    expect(abilitiesSuppressed(s, "hush-1")).toBe(false);
    expect((s.cards["ice-1"].subroutines ?? []).length).toBeGreaterThan(0);
  });

  it("re-enable: removing Hush restores host abilities", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("anvil", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];
    const hush = instantiateCard("hush", "hush-1", "runner:rig");
    hush.hostId = "ice-1";
    s.cards["hush-1"] = hush;
    s.runner.rig = ["hush-1"];
    expect(abilitiesSuppressed(s, "ice-1")).toBe(true);

    s.runner.rig = [];
    delete s.cards["hush-1"];
    expect(abilitiesSuppressed(s, "ice-1")).toBe(false);
  });
});

describe("confidence smoke — cannot × basic action (prevent jack_out)", () => {
  it("happy+fail: rez with prevent jack_out drops jack_out from legality (1.2.2)", () => {
    let s = setupEmptyRemoteWithIce();
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    s.cards[remote.ice[0]].onRez = { op: "prevent", forbid: "jack_out" };
    s.cards[remote.ice[0]].prevention = { jackOutForRun: true };

    s = must(s, {
      type: "basic_install",
      cardId: "runner-program-1",
      destination: { kind: "rig" },
    });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_run", serverId: remote.id as ServerId });
    s = must(s, { type: "rez_ice", cardId: remote.ice[0] });
    expect(s.run?.cannotJackOut).toBe(true);

    s = must(s, { type: "pass_window" });
    s = must(s, {
      type: "break_subroutine",
      breakerId: "runner-program-1",
      subIndex: 0,
    });
    s = must(s, { type: "pass_window" });
    expect(s.timingKey).toBe("run.jackOutWindow");

    expect(isActionLegal(s, { type: "jack_out" })).toBe(false);
    const expl = explainAction(s, { type: "jack_out" });
    expect(expl.legal).toBe(false);
    if (expl.legal) return;
    expect(expl.cites.map((c) => c.id)).toContain(CR.cannotPrecedence.id);
    expect(queryLegality(s).legal.some((e) => e.action.type === "jack_out")).toBe(
      false,
    );
  });
});

describe("confidence smoke — success ternary (Crisium / 6.8.4a)", () => {
  it("happy: reaching Success under Crisium is neither successful nor unsuccessful", () => {
    expect(getCardDef("crisium-grid").runsCannotBeSuccessful).toBe(true);
    let s = createInitialState();
    s = structuredClone(s);
    const up = instantiateCard("crisium-grid", "up-1", "server:archives:root");
    up.rezzed = true;
    up.faceup = true;
    s.cards["up-1"] = up;
    s.servers.archives.root = ["up-1"];
    s.servers.archives.ice = [];
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;

    s = must(s, { type: "basic_run", serverId: "archives" });
    expect(s.run).toBeNull();
    expect(s.turn.successfulRunThisTurn).toBe(false);
    expect(
      s.log.some((l) =>
        l.includes(CR.notUnsuccessfulWhenReachedSuccessPhase.number),
      ),
    ).toBe(true);
    expect(s.log.some((l) => /Run complete — unsuccessful/.test(l))).toBe(
      false,
    );
  });

  it("failure contrast: ETR still declares unsuccessful", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: {
        iceId: "corp-ice-1",
        unbroken: [0],
        resolved: [],
        strengthBoost: 0,
      },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    expect(evalEffect({ state: s, sourceId: "corp-ice-1" }, fx.etr()).ok).toBe(
      true,
    );
    expect(s.run!.successful).toBe(false);
  });
});

describe("confidence smoke — Mayfly delayed trash (host / run-end)", () => {
  it("Mayfly that broke this run trashes at run complete", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const mayfly = instantiateCard("mayfly", "mf-1", "runner:rig");
    mayfly.trashAfterBreakingThisRun = true;
    s.cards["mf-1"] = mayfly;
    s.runner.rig = ["mf-1"];
    s.run = {
      attackedServerId: "archives",
      phase: "ends",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: null,
      endedTheRun: true,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      breakersThatBroke: ["mf-1"],
    };
    enterStep(s, "run.closePriorityWindows");
    autoWalk(s);
    expect(s.runner.rig).not.toContain("mf-1");
    expect(s.runner.discard).toContain("mf-1");
  });
});
