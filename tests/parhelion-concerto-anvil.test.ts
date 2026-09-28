/**
 * Parhelion v0.61: Concerto + Anvil.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
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
  assertCardsPinnedTag("v0.98.0");
});

describe("PH Concerto", () => {
  it("wires reveal-top place hosted credits + runEvent", () => {
    const def = getCardDef("concerto");
    expect(def.unsupported).toEqual([]);
    expect(def.runEvent?.servers).toBe("any");
    expect(validateEffectTree(def.onPlay!)).toBeNull();
    expect(
      validateEffectTree(fx.revealTopStackToGripPlaceHostedCredits()),
    ).toBeNull();

    let s = createInitialState();
    s = structuredClone(s);
    const top = instantiateCard("sure-gamble", "top-1", "runner:stack");
    top.playCost = 5;
    s.cards["top-1"] = top;
    s.runner.deck = ["top-1", ...s.runner.deck];
    const ev = instantiateCard("concerto", "con-1", "runner:heap");
    s.cards["con-1"] = ev;
    const r = evalEffect(
      { state: s, sourceId: "con-1" },
      fx.revealTopStackToGripPlaceHostedCredits(),
    );
    expect(r.ok).toBe(true);
    expect(s.runner.hand).toContain("top-1");
    expect(s.cards["con-1"]!.hostedCredits).toBe(5);
  });
});

describe("PH Anvil", () => {
  it("wires onEncounter may-trash → forbid break + subroutines", () => {
    const def = getCardDef("anvil");
    expect(def.unsupported).toEqual([]);
    expect(validateEffectTree(def.onEncounter!)).toBeNull();
    expect(def.subroutines?.length).toBe(2);
    expect(validateEffectTree(fx.forbidRunnerBreakOnSource())).toBeNull();

    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("anvil", "anv-1", "server:hq:ice");
    s.cards["anv-1"] = ice;
    const r = evalEffect(
      { state: s, sourceId: "anv-1" },
      fx.forbidRunnerBreakOnSource(),
    );
    expect(r.ok).toBe(true);
    expect(s.cards["anv-1"]!.cannotBreakWithRunnerCardAbilities).toBe(true);
  });
});
