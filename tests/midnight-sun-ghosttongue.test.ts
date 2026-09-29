/**
 * Midnight Sun Ghosttongue cluster: continuous event play cost −N¢
 * (`eventPlayCostDiscount` while installed; CR §1.16.2a).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  effectiveEventPlayCost,
  eventPlayCostDiscountTotal,
  getCardDef,
  instantiateCard,
  queryLegality,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.34.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("MS eventPlayCostDiscount (always)", () => {
  it("sums discounts from installed rig cards and floors play cost at 0", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const gt = instantiateCard("ghosttongue", "gt-1", "runner:rig");
    gt.eventPlayCostDiscount = 1;
    gt.unsupported = [];
    s.cards["gt-1"] = gt;
    s.runner.rig = ["gt-1"];

    expect(eventPlayCostDiscountTotal(s)).toBe(1);
    expect(effectiveEventPlayCost(s, 5)).toBe(4);
    expect(effectiveEventPlayCost(s, 1)).toBe(0);
    expect(effectiveEventPlayCost(s, 0)).toBe(0);
    expect(effectiveEventPlayCost(s, undefined)).toBe(0);
  });

  it("stacks multiple installed discounts", () => {
    let s = createInitialState();
    s = structuredClone(s);
    for (const id of ["gt-a", "gt-b"] as const) {
      const gt = instantiateCard("ghosttongue", id, "runner:rig");
      gt.eventPlayCostDiscount = 1;
      s.cards[id] = gt;
      s.runner.rig.push(id);
    }
    expect(eventPlayCostDiscountTotal(s)).toBe(2);
    expect(effectiveEventPlayCost(s, 3)).toBe(1);
  });

  it("ignores discounts on cards not in the rig", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const gt = instantiateCard("ghosttongue", "gt-heap", "runner:heap");
    gt.eventPlayCostDiscount = 1;
    s.cards["gt-heap"] = gt;
    s.runner.discard.push("gt-heap");
    expect(eventPlayCostDiscountTotal(s)).toBe(0);
    expect(effectiveEventPlayCost(s, 5)).toBe(5);
  });

  it("plays event paying printed cost minus discount", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const gt = instantiateCard("ghosttongue", "gt-2", "runner:rig");
    gt.eventPlayCostDiscount = 1;
    gt.unsupported = [];
    s.cards["gt-2"] = gt;
    s.runner.rig = ["gt-2"];

    const ev = instantiateCard("sure-gamble", "sg-1", "runner:grip");
    s.cards["sg-1"] = ev;
    s.runner.hand = ["sg-1"];
    s.runner.credits = 5; // printed 5; with −1 need only 4
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "play_event", cardId: "sg-1" });
    // pay 4, gain 9
    expect(s.runner.credits).toBe(5 - 4 + 9);
    expect(s.log.some((l) => /plays Sure Gamble for 4¢/.test(l))).toBe(true);
    expect(s.log.some((l) => /cost calc 1\.16\.2a/.test(l))).toBe(true);
  });

  it("allows play when bank has only the discounted amount", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const gt = instantiateCard("ghosttongue", "gt-3", "runner:rig");
    gt.eventPlayCostDiscount = 1;
    s.cards["gt-3"] = gt;
    s.runner.rig = ["gt-3"];

    const ev = instantiateCard("sure-gamble", "sg-2", "runner:grip");
    s.cards["sg-2"] = ev;
    s.runner.hand = ["sg-2"];
    s.runner.credits = 4; // cannot afford printed 5 without discount
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    const legal = queryLegality(s);
    expect(
      legal.legal.some(
        (e) => e.action.type === "play_event" && e.action.cardId === "sg-2",
      ),
    ).toBe(true);

    s = must(s, { type: "play_event", cardId: "sg-2" });
    expect(s.runner.credits).toBe(4 - 4 + 9);
  });

  it("without discount, 4¢ cannot play Sure Gamble", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ev = instantiateCard("sure-gamble", "sg-3", "runner:grip");
    s.cards["sg-3"] = ev;
    s.runner.hand = ["sg-3"];
    s.runner.credits = 4;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    const legal = queryLegality(s);
    expect(
      legal.legal.some(
        (e) => e.action.type === "play_event" && e.action.cardId === "sg-3",
      ),
    ).toBe(false);

    const r = applyAction(s, { type: "play_event", cardId: "sg-3" });
    expect(r.ok).toBe(false);
  });
});

describe("MS Ghosttongue card wiring (v0.31.0+)", () => {
  it("Ghosttongue wires eventPlayCostDiscount + onInstall core_damage; unsupported empty", () => {
    const def = getCardDef("ghosttongue");
    expect(def.type).toBe("hardware");
    expect(def.installCost).toBe(2);
    expect(def.eventPlayCostDiscount).toBe(1);
    expect(def.onInstall).toEqual({
      op: "do",
      action: { kind: "core_damage", amount: 1 },
    });
    expect(def.unsupported ?? []).toEqual([]);
  });
});
