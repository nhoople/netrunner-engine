/**
 * Midnight Sun Environmental Testing cluster:
 * onProgramOrHardwareInstall + onPowerCountersGte (threshold trash/gain).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  validateEffectTree,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v0.66.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

function etInstallEffect() {
  return fx.addPowerCounter(1);
}

function etThreshold() {
  return {
    amount: 4,
    effect: fx.seq(fx.trashSelf(), fx.gainCredits("runner", 9)),
  };
}

function withEt(opts?: { powerCounters?: number; runnerCredits?: number }) {
  let s = createInitialState();
  s = structuredClone(s);
  const et = instantiateCard(
    "environmental-testing",
    "et-1",
    "runner:rig",
  );
  et.onProgramOrHardwareInstall = etInstallEffect();
  et.onPowerCountersGte = etThreshold();
  et.unsupported = [];
  et.powerCounters = opts?.powerCounters ?? 0;
  s.cards["et-1"] = et;
  s.runner.rig = ["et-1"];
  s.runner.credits = opts?.runnerCredits ?? 10;
  s.runner.clicks = 4;
  s.runner.memoryLimit = 8;
  s.activeSide = "runner";
  s.timingKey = "runner.takeAction";
  return s;
}

function installFree(
  state: ReturnType<typeof createInitialState>,
  defId: string,
  instanceId: string,
) {
  let s = state;
  const card = instantiateCard(defId, instanceId, "runner:grip");
  card.installCost = 0;
  s.cards[instanceId] = card;
  s.runner.hand = [instanceId];
  s.runner.clicks = 1;
  s.activeSide = "runner";
  s.timingKey = "runner.takeAction";
  s = must(s, {
    type: "basic_install",
    cardId: instanceId,
    destination: { kind: "rig" },
  });
  return s;
}

describe("MS Environmental Testing install-trigger power counters (always)", () => {
  it("accepts onProgramOrHardwareInstall + onPowerCountersGte Effect IR", () => {
    expect(validateEffectTree(etInstallEffect())).toBeNull();
    expect(validateEffectTree(etThreshold().effect)).toBeNull();
  });

  it("program install places 1 power counter on ET", () => {
    let s = withEt({ powerCounters: 0 });
    s = installFree(s, "imp", "imp-1");
    expect(s.runner.rig).toContain("imp-1");
    expect(s.cards["et-1"]!.powerCounters).toBe(1);
    expect(s.runner.rig).toContain("et-1");
  });

  it("hardware install places 1 power counter on ET", () => {
    let s = withEt({ powerCounters: 0 });
    s = installFree(s, "docklands-pass", "hw-1");
    expect(s.runner.rig).toContain("hw-1");
    expect(s.cards["et-1"]!.powerCounters).toBe(1);
  });

  it("resource install does not place a power counter", () => {
    let s = withEt({ powerCounters: 0 });
    s = installFree(s, "no-free-lunch", "res-1");
    expect(s.runner.rig).toContain("res-1");
    expect(s.cards["et-1"]!.powerCounters).toBe(0);
  });

  it("fourth program install trashes ET and gains 9¢", () => {
    let s = withEt({ powerCounters: 3, runnerCredits: 5 });
    s = installFree(s, "imp", "imp-pop");
    expect(s.runner.rig).not.toContain("et-1");
    expect(s.runner.discard).toContain("et-1");
    expect(s.cards["et-1"]!.zone).toBe("runner:heap");
    expect(s.runner.credits).toBe(14); // 5 + 9
  });

  it("charge from 3→4 trashes ET and gains 9¢", () => {
    let s = withEt({ powerCounters: 3, runnerCredits: 1 });
    const r = evalEffect(
      { state: s, sourceId: "et-1" },
      {
        op: "do",
        action: { kind: "charge", pick: "card", cardId: "et-1" },
      },
    );
    expect(r.ok).toBe(true);
    expect(s.runner.rig).not.toContain("et-1");
    expect(s.runner.discard).toContain("et-1");
    expect(s.runner.credits).toBe(10); // 1 + 9
  });

  it("add_power_counter crossing threshold trashes without install", () => {
    let s = withEt({ powerCounters: 3, runnerCredits: 0 });
    const r = evalEffect(
      { state: s, sourceId: "et-1" },
      fx.addPowerCounter(1),
    );
    expect(r.ok).toBe(true);
    expect(s.runner.rig).not.toContain("et-1");
    expect(s.runner.discard).toContain("et-1");
    expect(s.runner.credits).toBe(9);
  });
});

describe("MS Environmental Testing card data (when wired)", () => {
  function etWired(): boolean {
    const def = getCardDef("environmental-testing");
    return (
      (def.unsupported?.length ?? 0) === 0 &&
      Boolean(def.onProgramOrHardwareInstall) &&
      Boolean(def.onPowerCountersGte)
    );
  }

  it("environmental-testing is fully clear with install + threshold IR", () => {
    if (!etWired()) {
      expect(
        getCardDef("environmental-testing").unsupported!.length,
      ).toBeGreaterThan(0);
      return;
    }
    const def = getCardDef("environmental-testing");
    expect(def.unsupported).toEqual([]);
    expect(def.onProgramOrHardwareInstall).toEqual(fx.addPowerCounter(1));
    expect(def.onPowerCountersGte?.amount).toBe(4);
    expect(def.onPowerCountersGte?.effect).toEqual(
      fx.seq(fx.trashSelf(), fx.gainCredits("runner", 9)),
    );
    expect(validateEffectTree(def.onProgramOrHardwareInstall!)).toBeNull();
    expect(validateEffectTree(def.onPowerCountersGte!.effect)).toBeNull();
  });
});
