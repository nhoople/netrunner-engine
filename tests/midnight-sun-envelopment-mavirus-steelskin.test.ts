/**
 * Midnight Sun: Envelopment (ETR per power), Mavirus (purge), Steelskin (grip trash draw).
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
import { syncEtrPerPowerCounterSubs } from "../src/state/powerCounters.js";
import { moveRunnerCardToHeap, purgeVirusCounters } from "../src/state/trashHooks.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.75.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("MS Envelopment etrSubroutinesPerPowerCounter", () => {
  it("sync expands ETR subs before printed ones", () => {
    const ice = instantiateCard("ice-wall", "env-1", "server:hq:ice");
    ice.etrSubroutinesPerPowerCounter = true;
    ice.baseSubroutines = structuredClone(ice.subroutines ?? []);
    ice.powerCounters = 0;
    syncEtrPerPowerCounterSubs(ice);
    expect(ice.subroutines?.length).toBe(ice.baseSubroutines!.length);

    ice.powerCounters = 4;
    syncEtrPerPowerCounterSubs(ice);
    expect(ice.subroutines?.length).toBe(4 + ice.baseSubroutines!.length);
    expect(ice.subroutines![0]!.text).toBe("End the run.");
    expect(ice.subroutines![3]!.text).toBe("End the run.");
    expect(ice.subroutines![4]!.id).toBe(ice.baseSubroutines![0]!.id);
  });

  it("add_power_counter syncs ETR subs", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("ice-wall", "env-2", "server:hq:ice");
    ice.etrSubroutinesPerPowerCounter = true;
    ice.powerCounters = 0;
    s.cards["env-2"] = ice;
    s.servers.hq.ice = ["env-2"];
    const r = evalEffect(
      { state: s, sourceId: "env-2" },
      fx.addPowerCounter(4),
    );
    expect(r.ok).toBe(true);
    expect(s.cards["env-2"].powerCounters).toBe(4);
    expect(s.cards["env-2"].subroutines!.length).toBeGreaterThanOrEqual(4);
    expect(s.cards["env-2"].subroutines![0]!.text).toBe("End the run.");
  });
});

describe("MS purge_virus_counters (Mavirus)", () => {
  it("validates purge tree", () => {
    expect(validateEffectTree(fx.purgeVirusCounters())).toBeNull();
    expect(validateEffectTree(fx.mayPurgeVirusCounters())).toBeNull();
  });

  it("clears virus counters and trashes Clot-class cards", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const virus = instantiateCard("imp", "imp-1", "runner:rig");
    virus.virusCounters = 3;
    s.cards["imp-1"] = virus;
    s.runner.rig = ["imp-1"];
    const clot = instantiateCard("clot", "clot-1", "runner:rig");
    clot.trashOnVirusPurge = true;
    s.cards["clot-1"] = clot;
    s.runner.rig.push("clot-1");

    purgeVirusCounters(s, s.corp.identityId);
    expect(s.cards["imp-1"].virusCounters).toBe(0);
    expect(s.runner.discard).toContain("clot-1");
    expect(s.runner.rig).not.toContain("clot-1");
  });

  it("source_rezzed gates net damage in onAccess tree", () => {
    const tree = fx.seq(
      fx.if({ op: "source_rezzed" }, fx.netDamage(1)),
      fx.mayPurgeVirusCounters(),
    );
    expect(validateEffectTree(tree)).toBeNull();

    let s = createInitialState();
    s = structuredClone(s);
    const up = instantiateCard("pad-campaign", "mav-1", "server:hq:root");
    up.rezzed = false;
    s.cards["mav-1"] = up;
    s.runner.hand = ["filler-1", "filler-2"];
    for (const id of ["filler-1", "filler-2"]) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    }
    const before = s.runner.hand.length;
    const r = evalEffect({ state: s, sourceId: "mav-1" }, tree);
    expect(r.ok).toBe(true);
    // Unrezzed — no net damage; may-purge pending.
    expect(s.runner.hand.length).toBe(before);
    expect(s.pendingChoice).not.toBeNull();
  });
});

describe("MS onTrashFromGripOrStack (Steelskin)", () => {
  it("offers may-draw when trashed from grip", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const sk = instantiateCard("sure-gamble", "sk-1", "runner:grip");
    sk.onTrashFromGripOrStack = fx.mayDraw("runner", 2);
    s.cards["sk-1"] = sk;
    s.runner.hand = ["sk-1"];
    s.runner.deck = ["d1", "d2", "d3"];
    for (const id of ["d1", "d2", "d3"]) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:stack");
    }
    moveRunnerCardToHeap(s, "sk-1");
    expect(s.runner.discard).toContain("sk-1");
    expect(s.pendingChoice).not.toBeNull();
    expect(s.pendingChoice!.chooser).toBe("runner");
    s = must(s, { type: "choose_option", optionId: "draw" });
    expect(s.runner.hand.length).toBe(2);
  });
});

describe("MS card wiring (Envelopment / Mavirus / Steelskin)", () => {
  it("wires cleared cards with empty unsupported", () => {
    const env = getCardDef("envelopment");
    expect(env.unsupported).toEqual([]);
    expect(env.etrSubroutinesPerPowerCounter).toBe(true);
    expect(env.onRez).toEqual(fx.addPowerCounter(4));
    expect(env.onTurnBegin).toEqual(fx.removePowerCounter(1));

    const mav = getCardDef("mavirus");
    expect(mav.unsupported).toEqual([]);
    expect(mav.onTrash).toEqual(fx.purgeVirusCounters());
    expect(mav.onAccess).toBeTruthy();

    const sk = getCardDef("steelskin-scarring");
    expect(sk.unsupported).toEqual([]);
    expect(sk.onTrashFromGripOrStack).toEqual(fx.mayDraw("runner", 2));
  });
});
