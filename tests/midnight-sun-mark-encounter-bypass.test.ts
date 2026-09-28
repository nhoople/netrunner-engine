/**
 * Midnight Sun mark-encounter bypass cluster:
 * paidAbility.requireAttackingMark + trashSelf → bypass_current_ice
 * (Backstitching).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  fx,
  getCardDef,
  instantiateCard,
  queryLegality,
} from "../src/index.js";
import type { ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.31.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

/** Ice on HQ, Backstitching-shaped resource in rig; run to encounter PAW. */
function encounterWithBackstitching(opts: {
  markServerId: ServerId | null;
  runServerId: ServerId;
}) {
  let s = createInitialState();
  s = structuredClone(s);
  s.markServerId = opts.markServerId;

  const ice = instantiateCard("tithe", "ice-1", `server:${opts.runServerId}:ice`);
  ice.rezzed = false;
  s.cards["ice-1"] = ice;
  s.servers[opts.runServerId].ice = ["ice-1"];

  const bs = instantiateCard("backstitching", "bs-1", "runner:rig");
  bs.paidAbilities = [
    {
      id: "backstitching-bypass",
      label: "Trash Backstitching: bypass encountered ice (mark run)",
      clickCost: 0,
      creditCost: 0,
      cost: { trashSelf: true },
      windows: ["encounter_paw"],
      requireAttackingMark: true,
      effect: fx.do({ kind: "bypass_current_ice" }),
    },
  ];
  s.cards["bs-1"] = bs;
  s.runner.rig = ["bs-1"];
  s.runner.credits = 10;
  s.runner.clicks = 4;
  s.corp.credits = 20;
  s.activeSide = "runner";
  s.timingKey = "runner.takeAction";

  s = must(s, { type: "basic_run", serverId: opts.runServerId });
  s = must(s, { type: "rez_ice", cardId: "ice-1" });
  s = must(s, { type: "pass_window" });
  expect(s.timingKey).toBe("run.encounterPaw");
  return s;
}

describe("MS requireAttackingMark encounter bypass IR (always)", () => {
  it("trashes self and bypasses ice when attacking the mark", () => {
    let s = encounterWithBackstitching({
      markServerId: "hq",
      runServerId: "hq",
    });

    const legal = queryLegality(s).legal;
    expect(
      legal.some(
        (e) =>
          e.action.type === "use_paid_ability" &&
          e.action.cardId === "bs-1" &&
          e.action.abilityId === "backstitching-bypass",
      ),
    ).toBe(true);

    s = must(s, {
      type: "use_paid_ability",
      cardId: "bs-1",
      abilityId: "backstitching-bypass",
    });

    expect(s.runner.rig).not.toContain("bs-1");
    expect(s.runner.discard).toContain("bs-1");
    expect(s.cards["bs-1"]!.zone).toBe("runner:heap");
    expect(s.run?.bypassedIceIds).toContain("ice-1");
    expect(s.run?.encounter?.broken.every(Boolean)).toBe(true);
    expect(s.log.some((l) => /Bypass/i.test(l))).toBe(true);

    // All subs broken → pass window advances past encounter into movement.
    s = must(s, { type: "pass_window" });
    expect(s.timingKey).not.toBe("run.encounterPaw");
  });

  it("ability is illegal when not attacking the mark", () => {
    const s = encounterWithBackstitching({
      markServerId: "rd",
      runServerId: "hq",
    });

    const legal = queryLegality(s).legal;
    expect(
      legal.some(
        (e) =>
          e.action.type === "use_paid_ability" &&
          e.action.abilityId === "backstitching-bypass",
      ),
    ).toBe(false);

    const bad = applyAction(s, {
      type: "use_paid_ability",
      cardId: "bs-1",
      abilityId: "backstitching-bypass",
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error).toMatch(/mark/i);
    }
  });

  it("ability is illegal when no mark is designated", () => {
    const s = encounterWithBackstitching({
      markServerId: null,
      runServerId: "hq",
    });

    const bad = applyAction(s, {
      type: "use_paid_ability",
      cardId: "bs-1",
      abilityId: "backstitching-bypass",
    });
    expect(bad.ok).toBe(false);
  });
});

describe("MS Backstitching card wiring (v0.31.0+)", () => {
  it("wires paid bypass; unsupported empty", () => {
    const def = getCardDef("backstitching");
    expect(def.unsupported).toEqual([]);
    expect(def.onTurnBegin).toBeTruthy();
    const ab = def.paidAbilities?.find((a) => a.id === "backstitching-bypass");
    expect(ab).toBeTruthy();
    expect(ab!.requireAttackingMark).toBe(true);
    expect(ab!.cost?.trashSelf).toBe(true);
    expect(ab!.windows).toContain("encounter_paw");
    expect(ab!.effect).toEqual({
      op: "do",
      action: { kind: "bypass_current_ice" },
    });
  });
});
