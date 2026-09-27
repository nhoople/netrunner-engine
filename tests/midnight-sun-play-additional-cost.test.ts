/**
 * Midnight Sun playAdditionalCost cluster: additional cost Effect IR when
 * playing events/operations (Running Hot: suffer 1 core damage).
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
  validateEffectTree,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v0.49.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("MS playAdditionalCost IR (always)", () => {
  it("accepts playAdditionalCost Effect IR trees (core_damage)", () => {
    expect(validateEffectTree(fx.coreDamage(1))).toBeNull();
  });

  it("Running Hot-shaped play pays core damage then gains clicks", () => {
    let s = createInitialState();
    s = structuredClone(s);
    // Grip fillers so core damage does not flatline (event itself leaves grip first)
    for (let i = 0; i < 3; i++) {
      const id = `filler-${i}`;
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }
    const ev = instantiateCard("running-hot", "rh-1", "runner:grip");
    ev.playCost = 1;
    ev.playAdditionalCost = fx.coreDamage(1);
    ev.onPlay = fx.gainClicks("runner", 3);
    // Clear unsupported so play path is exercised via instance fields
    ev.unsupported = [];
    s.cards["rh-1"] = ev;
    s.runner.hand.push("rh-1");
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    const gripBefore = s.runner.hand.length;
    const clicksBefore = s.runner.clicks;
    s = must(s, { type: "play_event", cardId: "rh-1" });

    expect(s.runner.credits).toBe(4);
    // click spent to play + 3 gained
    expect(s.runner.clicks).toBe(clicksBefore - 1 + 3);
    expect(s.runner.brainDamage).toBe(1);
    expect(s.runner.maxHandSize).toBe(4);
    // Event left grip; one more card trashed by core damage
    expect(s.runner.hand.length).toBe(gripBefore - 2);
    expect(s.runner.discard).toContain("rh-1");
    expect(s.log.some((l) => l.includes("Additional cost paid"))).toBe(true);
    expect(s.log.some((l) => /Core damage|core damage/i.test(l))).toBe(true);
  });

  it("play without playAdditionalCost still works (Sure Gamble)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ev = instantiateCard("sure-gamble", "sg-1", "runner:grip");
    s.cards["sg-1"] = ev;
    s.runner.hand = ["sg-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "play_event", cardId: "sg-1" });
    expect(s.runner.credits).toBe(5 - 5 + 9);
    expect(s.runner.brainDamage).toBe(0);
  });

  it("legality still offers play_event when additional cost is present", () => {
    let s = createInitialState();
    s = structuredClone(s);
    for (let i = 0; i < 2; i++) {
      const id = `f-${i}`;
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }
    const ev = instantiateCard("running-hot", "rh-2", "runner:grip");
    ev.playCost = 1;
    ev.playAdditionalCost = fx.coreDamage(1);
    ev.onPlay = fx.gainClicks("runner", 3);
    s.cards["rh-2"] = ev;
    s.runner.hand.push("rh-2");
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    const legal = queryLegality(s);
    expect(
      legal.legal.some(
        (e) => e.action.type === "play_event" && e.action.cardId === "rh-2",
      ),
    ).toBe(true);
  });
});

describe("MS Running Hot card wiring (v0.31.0+)", () => {
  it("Running Hot wires playAdditionalCost + onPlay; unsupported empty", () => {
    const rh = getCardDef("running-hot");
    expect(rh.unsupported).toEqual([]);
    expect(rh.playCost).toBe(1);
    expect(rh.playAdditionalCost).toEqual(fx.coreDamage(1));
    expect(rh.onPlay).toEqual(fx.gainClicks("runner", 3));

    let s = createInitialState();
    s = structuredClone(s);
    for (let i = 0; i < 3; i++) {
      const id = `w-${i}`;
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }
    const card = instantiateCard("running-hot", "rh-live", "runner:grip");
    s.cards["rh-live"] = card;
    s.runner.hand.push("rh-live");
    s.runner.credits = 3;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "play_event", cardId: "rh-live" });
    expect(s.runner.brainDamage).toBe(1);
    expect(s.runner.clicks).toBe(3); // 1-1+3
    expect(s.runner.credits).toBe(2);
  });
});
