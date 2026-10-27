/**
 * Şifr encounter strength SET (CR 9.12.1a): lowered to 0 for the encounter.
 * UFAQ: Wraparound stays 0 after a later fracter; cannot raise; Lotus Field
 * cannot be lowered.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  effectiveIceStrength,
  evalEffect,
  fx,
  instantiateCard,
} from "../src/index.js";
import { iceStrength } from "../src/effects/iceStrength.js";
import type { GameState, ServerId } from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.13");
});

function encounterState(
  iceId: string,
  serverId: ServerId = "hq",
): NonNullable<GameState["run"]> {
  return {
    attackedServerId: serverId,
    phase: "encounter",
    position: 0,
    successful: false,
    accessedCardIds: [],
    accessCandidates: [],
    randomAccessLimit: null,
    encounter: { iceId, broken: [false], subroutinesResolved: [] },
    endedTheRun: false,
    cannotJackOut: false,
    strengthBoosts: {},
    encounterStrengthBoosts: {},
    iceStrengthBoosts: {},
    accessingCardId: null,
  };
}

describe("Şifr encounter strength set (CR 9.12.1a)", () => {
  it("lowers Wraparound to 0; later fracter does not restore the +7", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const wrap = instantiateCard("wraparound", "wrap-1", "server:hq:ice");
    wrap.rezzed = true;
    s.cards["wrap-1"] = wrap;
    s.servers.hq.ice = ["wrap-1"];
    const sifr = instantiateCard("sifr", "sifr-1", "runner:installed");
    s.cards["sifr-1"] = sifr;
    s.runner.installed = ["sifr-1"];
    s.runner.maxHandSize = 5;
    s.run = encounterState("wrap-1");

    expect(effectiveIceStrength(s, "wrap-1")).toBe(7);

    const r = evalEffect(
      { state: s, sourceId: "sifr-1" },
      fx.do({ kind: "sifr_zero_encounter_ice_strength" }),
    );
    expect(r.ok).toBe(true);
    expect(s.run?.encounter?.strengthLoweredTo).toBe(0);
    expect(effectiveIceStrength(s, "wrap-1")).toBe(0);
    expect(iceStrength(s, "wrap-1")).toBe(0);
    expect(s.runner.maxHandSize).toBe(4);
    expect(s.turn.sifrUsedThisTurn).toBe(true);

    // Installing a fracter removes Wraparound's +7 continuous bonus; that is
    // not applying a −7, so strength stays 0 (UFAQ).
    const corr = instantiateCard("corroder", "corr-1", "runner:installed");
    s.cards["corr-1"] = corr;
    s.runner.installed.push("corr-1");
    expect(effectiveIceStrength(s, "wrap-1")).toBe(0);
  });

  it("applies post-set temporary increases after the set (CR 9.12.1a)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const wall = instantiateCard("ice-wall", "wall-1", "server:hq:ice");
    wall.rezzed = true;
    s.cards["wall-1"] = wall;
    s.servers.hq.ice = ["wall-1"];
    const sifr = instantiateCard("sifr", "sifr-1", "runner:installed");
    s.cards["sifr-1"] = sifr;
    s.runner.installed = ["sifr-1"];
    s.runner.maxHandSize = 5;
    s.run = encounterState("wall-1");

    expect(effectiveIceStrength(s, "wall-1")).toBe(1);
    evalEffect(
      { state: s, sourceId: "sifr-1" },
      fx.do({ kind: "sifr_zero_encounter_ice_strength" }),
    );
    expect(effectiveIceStrength(s, "wall-1")).toBe(0);

    s.run!.iceStrengthBoosts["wall-1"] = 2;
    expect(effectiveIceStrength(s, "wall-1")).toBe(2);
    expect(iceStrength(s, "wall-1")).toBe(2);
  });

  it("does not lower Lotus Field and leaves hand size unused", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const lotus = instantiateCard("lotus-field", "lotus-1", "server:hq:ice");
    lotus.rezzed = true;
    s.cards["lotus-1"] = lotus;
    s.servers.hq.ice = ["lotus-1"];
    const sifr = instantiateCard("sifr", "sifr-1", "runner:installed");
    s.cards["sifr-1"] = sifr;
    s.runner.installed = ["sifr-1"];
    s.runner.maxHandSize = 5;
    s.run = encounterState("lotus-1");

    const before = effectiveIceStrength(s, "lotus-1");
    expect(before).toBeGreaterThan(0);
    const r = evalEffect(
      { state: s, sourceId: "sifr-1" },
      fx.do({ kind: "sifr_zero_encounter_ice_strength" }),
    );
    expect(r.ok).toBe(true);
    expect(s.run?.encounter?.strengthLoweredTo).toBeUndefined();
    expect(effectiveIceStrength(s, "lotus-1")).toBe(before);
    expect(s.runner.maxHandSize).toBe(5);
    expect(s.turn.sifrUsedThisTurn).toBe(false);
  });

  it("does not raise ice that is already below 0", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const wall = instantiateCard("ice-wall", "wall-1", "server:hq:ice");
    wall.rezzed = true;
    // Printed below 0 (Parasite/Architect-class UFAQ: Şifr cannot raise).
    wall.strength = -4;
    s.cards["wall-1"] = wall;
    s.servers.hq.ice = ["wall-1"];
    const sifr = instantiateCard("sifr", "sifr-1", "runner:installed");
    s.cards["sifr-1"] = sifr;
    s.runner.installed = ["sifr-1"];
    s.runner.maxHandSize = 5;
    s.run = encounterState("wall-1");

    expect(effectiveIceStrength(s, "wall-1")).toBe(-4);
    evalEffect(
      { state: s, sourceId: "sifr-1" },
      fx.do({ kind: "sifr_zero_encounter_ice_strength" }),
    );
    expect(s.run?.encounter?.strengthLoweredTo).toBe(0);
    expect(effectiveIceStrength(s, "wall-1")).toBe(-4);
    expect(s.runner.maxHandSize).toBe(4);
  });
});
