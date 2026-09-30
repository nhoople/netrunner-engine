/**
 * Midnight Sun Cezve cluster: recurring credits spendable only while attacking
 * a central server (`recurringSpendFor: "run_central"`; CR §1.10.5a / §6.3.4).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  canPayCost,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  getCardDef,
  instantiateCard,
  isAttackingCentral,
  payCost,
  queryLegality,
  recurringCreditsForCentralRun,
  refillRecurringCredits,
  runnerAvailableCredits,
  runnerCreditsFor,
  spendRunnerCredits,
  spendRunnerCreditsFor,
} from "../src/index.js";
import type { ServerId } from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.115.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

function withCezve(opts?: {
  server?: ServerId;
  bank?: number;
  pool?: number;
  inRun?: boolean;
}) {
  let s = createInitialState();
  s = structuredClone(s);
  const cezve = instantiateCard("cezve", "cz-1", "runner:rig");
  cezve.recurringCreditsMax = 2;
  cezve.recurringCredits = opts?.pool ?? 2;
  cezve.recurringSpendFor = ["run_central"];
  cezve.unsupported = [];
  s.cards["cz-1"] = cezve;
  s.runner.rig = ["cz-1"];
  s.runner.credits = opts?.bank ?? 0;
  s.runner.clicks = 4;
  s.activeSide = "runner";
  s.timingKey = "runner.takeAction";

  if (opts?.inRun !== false) {
    const server = opts?.server ?? "hq";
    s.run = {
      attackedServerId: server,
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
  }
  return s;
}

describe("MS run_central recurring (always)", () => {
  it("isAttackingCentral only for hq/rd/archives with an active run", () => {
    const s = withCezve({ server: "hq" });
    expect(isAttackingCentral(s)).toBe(true);
    s.run!.attackedServerId = "rd";
    expect(isAttackingCentral(s)).toBe(true);
    s.run!.attackedServerId = "archives";
    expect(isAttackingCentral(s)).toBe(true);
    s.run!.attackedServerId = "remote-1";
    expect(isAttackingCentral(s)).toBe(false);
    s.run = null;
    expect(isAttackingCentral(s)).toBe(false);
  });

  it("includes Cezve pool in runnerAvailableCredits only on central runs", () => {
    let s = withCezve({ bank: 1, pool: 2, server: "hq" });
    expect(recurringCreditsForCentralRun(s)).toBe(2);
    expect(runnerAvailableCredits(s)).toBe(3);

    s.run!.attackedServerId = "remote-1";
    expect(recurringCreditsForCentralRun(s)).toBe(0);
    expect(runnerAvailableCredits(s)).toBe(1);

    s = withCezve({ bank: 1, pool: 2, inRun: false });
    expect(recurringCreditsForCentralRun(s)).toBe(0);
    expect(runnerAvailableCredits(s)).toBe(1);
  });

  it("canPayCost / payCost draw from Cezve on central run, not remote", () => {
    let s = withCezve({ bank: 0, pool: 2, server: "hq" });
    expect(canPayCost(s, "runner", { credits: 2 })).toBe(true);
    payCost(s, "runner", { credits: 2 }, "test:cezve");
    expect(s.cards["cz-1"].recurringCredits).toBe(0);
    expect(s.runner.credits).toBe(0);
    expect(
      s.log.some((l) => /Spend 2¢ from Cezve recurring credits \(run_central\)/.test(l)),
    ).toBe(true);

    s = withCezve({ bank: 0, pool: 2, server: "remote-1" });
    expect(canPayCost(s, "runner", { credits: 1 })).toBe(false);
    expect(s.cards["cz-1"].recurringCredits).toBe(2);
  });

  it("spendRunnerCredits depletes Cezve before the bank on central run", () => {
    const s = withCezve({ bank: 3, pool: 2, server: "rd" });
    spendRunnerCredits(s, 3);
    expect(s.cards["cz-1"].recurringCredits).toBe(0);
    expect(s.runner.credits).toBe(2);
  });

  it("does not spend Cezve outside a run or on a remote", () => {
    let s = withCezve({ bank: 5, pool: 2, inRun: false });
    spendRunnerCredits(s, 2);
    expect(s.cards["cz-1"].recurringCredits).toBe(2);
    expect(s.runner.credits).toBe(3);

    s = withCezve({ bank: 5, pool: 2, server: "remote-1" });
    spendRunnerCredits(s, 2);
    expect(s.cards["cz-1"].recurringCredits).toBe(2);
    expect(s.runner.credits).toBe(3);
  });

  it("runnerCreditsFor trash/play_event includes Cezve only on central", () => {
    let s = withCezve({ bank: 0, pool: 2, server: "archives" });
    expect(runnerCreditsFor(s, "trash")).toBe(2);
    expect(runnerCreditsFor(s, "play_event")).toBe(2);
    spendRunnerCreditsFor(s, 1, "trash");
    expect(s.cards["cz-1"].recurringCredits).toBe(1);

    s = withCezve({ bank: 0, pool: 2, inRun: false });
    expect(runnerCreditsFor(s, "trash")).toBe(0);
    expect(runnerCreditsFor(s, "play_event")).toBe(0);
  });

  it("refills Cezve recurring to max on Runner turn refill", () => {
    const s = withCezve({ pool: 0, inRun: false });
    expect(s.cards["cz-1"].recurringCredits).toBe(0);
    refillRecurringCredits(s, "runner");
    expect(s.cards["cz-1"].recurringCredits).toBe(2);
  });

  it("ignores run_central credits on cards not in the rig", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const cezve = instantiateCard("cezve", "cz-heap", "runner:heap");
    cezve.recurringCreditsMax = 2;
    cezve.recurringCredits = 2;
    cezve.recurringSpendFor = ["run_central"];
    s.cards["cz-heap"] = cezve;
    s.runner.discard.push("cz-heap");
    s.runner.credits = 0;
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
    expect(recurringCreditsForCentralRun(s)).toBe(0);
    expect(runnerAvailableCredits(s)).toBe(0);
  });
});

describe("MS Cezve break integration (always)", () => {
  it("breaks Ice Wall on HQ using only Cezve recurring credits", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];

    const breaker = instantiateCard("corroder", "br-1", "runner:rig");
    s.cards["br-1"] = breaker;

    const cezve = instantiateCard("cezve", "cz-1", "runner:rig");
    cezve.recurringCreditsMax = 2;
    cezve.recurringCredits = 2;
    cezve.recurringSpendFor = ["run_central"];
    cezve.unsupported = [];
    s.cards["cz-1"] = cezve;
    s.runner.rig = ["br-1", "cz-1"];
    s.runner.credits = 0;
    s.runner.clicks = 4;
    s.corp.credits = 20;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
    s = must(s, { type: "rez_ice", cardId: "ice-1" });
    s = must(s, { type: "pass_window" });

    // Corroder: str 2 vs Ice Wall 1; break cost 1¢
    const legal = queryLegality(s);
    expect(
      legal.legal.some(
        (e) =>
          e.action.type === "break_subroutine" &&
          e.action.breakerId === "br-1",
      ),
    ).toBe(true);

    s = must(s, {
      type: "break_subroutine",
      breakerId: "br-1",
      subIndex: 0,
    });
    expect(s.cards["cz-1"].recurringCredits).toBe(1);
    expect(s.runner.credits).toBe(0);
    expect(
      s.log.some((l) => /Spend 1¢ from Cezve recurring credits \(run_central\)/.test(l)),
    ).toBe(true);
  });

  it("cannot break on a remote using only Cezve recurring", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("ice-wall", "ice-1", "server:remote-1:ice");
    s.cards["ice-1"] = ice;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: ["ice-1"],
      root: [],
    };

    const breaker = instantiateCard("corroder", "br-1", "runner:rig");
    s.cards["br-1"] = breaker;

    const cezve = instantiateCard("cezve", "cz-1", "runner:rig");
    cezve.recurringCreditsMax = 2;
    cezve.recurringCredits = 2;
    cezve.recurringSpendFor = ["run_central"];
    s.cards["cz-1"] = cezve;
    s.runner.rig = ["br-1", "cz-1"];
    s.runner.credits = 0;
    s.runner.clicks = 4;
    s.corp.credits = 20;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "basic_run", serverId: "remote-1" as ServerId });
    s = must(s, { type: "rez_ice", cardId: "ice-1" });
    s = must(s, { type: "pass_window" });

    const legal = queryLegality(s);
    expect(
      legal.legal.some(
        (e) =>
          e.action.type === "break_subroutine" &&
          e.action.breakerId === "br-1",
      ),
    ).toBe(false);

    const r = applyAction(s, {
      type: "break_subroutine",
      breakerId: "br-1",
      subIndex: 0,
    });
    expect(r.ok).toBe(false);
    expect(s.cards["cz-1"].recurringCredits).toBe(2);
  });
});

describe("MS Cezve card wiring (v0.31.0+)", () => {
  it("Cezve clears unsupported with run_central recurringSpendFor", () => {
    const def = getCardDef("cezve");
    expect(def.unsupported).toEqual([]);
    expect(def.recurringSpendFor).toEqual(["run_central"]);
    expect(def.recurringCreditsMax).toBe(2);
    expect(def.memoryCost).toBe(1);
    expect(def.installCost).toBe(2);
  });
});
