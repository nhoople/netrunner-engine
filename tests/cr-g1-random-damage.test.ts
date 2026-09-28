/**
 * CR adherence G1: net/meat damage trashes random grip cards simultaneously
 * (CR 10.4.2a / 10.4.3).
 */
import { describe, expect, it, beforeAll, beforeEach } from "vitest";
import {
  assertPinnedTag,
  createInitialState,
  CR,
  crDataPresent,
  dealDamage,
  instantiateCard,
  pickRandomSubset,
  setRng,
  setRngSeed,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  assertPinnedTag("v26.03");
});

beforeEach(() => {
  setRng(null);
  setRngSeed(1);
});

describe("CR G1 — random simultaneous damage trash (10.4.2a / 10.4.3)", () => {
  it("cites multipleDamageSimultaneous", () => {
    expect(CR.multipleDamageSimultaneous).toEqual({
      number: "10.4.3",
      id: "rule_multiple_damage_taken_simultaneously",
    });
  });

  it("trashes random cards, not only the back of grip", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.runner.hand = ["a", "b", "c", "d"];
    for (const id of s.runner.hand) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    }
    // Force picks of indices that are not the last cards: override RNG so
    // pickRandomSubset always swaps toward the front.
    let calls = 0;
    setRng(() => {
      calls += 1;
      // Always pick j=0 during Fisher–Yates so the last slots become early cards.
      return 0;
    });
    dealDamage(s, "net", 2, "src");
    expect(s.runner.hand).toHaveLength(2);
    expect(s.runner.discard).toHaveLength(2);
    // With return-0 RNG, the two picks are the first two elements in reverse
    // partial shuffle — not ["c","d"] from the back-of-hand heuristic.
    expect(s.runner.discard.sort()).not.toEqual(["c", "d"]);
    expect(calls).toBeGreaterThan(0);
    expect(
      s.log.some((l) => l.includes(CR.multipleDamageSimultaneous.number)),
    ).toBe(true);
  });

  it("multi-point damage selects the set before trashing (simultaneous)", () => {
    const hand = ["w", "x", "y", "z"];
    setRngSeed(42);
    const picks = pickRandomSubset(hand, 3);
    expect(picks).toHaveLength(3);
    expect(new Set(picks).size).toBe(3);
    for (const id of picks) expect(hand).toContain(id);
  });

  it("flatlines when damage exceeds grip after random trash", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.runner.hand = ["only"];
    s.cards["only"] = instantiateCard("sure-gamble", "only", "runner:grip");
    setRngSeed(7);
    const r = dealDamage(s, "meat", 2, "src");
    expect(r).toBe("flatline");
    expect(s.winner).toBe("corp");
    expect(s.runner.hand).toHaveLength(0);
  });
});
