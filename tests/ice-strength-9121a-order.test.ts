/**
 * Ice strength layering (CR 9.12.1a): set → increases → decreases.
 * NSG: Şifr sets to 0, then Sandburg's increase applies.
 * Wraparound's conditional is a set Şifr can override (Wraparound UFAQ).
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

describe("ice strength order (CR 9.12.1a)", () => {
  it("applies Sandburg increases after Şifr's set (NSG Şifr ruling)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const wall = instantiateCard("ice-wall", "wall-1", "server:hq:ice");
    wall.rezzed = true;
    s.cards["wall-1"] = wall;
    s.servers.hq.ice = ["wall-1"];
    const sand = instantiateCard("sandburg", "sand-1", "server:hq:root");
    sand.rezzed = true;
    s.cards["sand-1"] = sand;
    s.servers.hq.root = ["sand-1"];
    s.corp.credits = 14;
    const sifr = instantiateCard("sifr", "sifr-1", "runner:installed");
    s.cards["sifr-1"] = sifr;
    s.runner.installed = ["sifr-1"];
    s.runner.maxHandSize = 5;
    s.run = encounterState("wall-1");

    // Sandburg: floor(14/5)*1 = 2; Ice Wall printed 1 → 3.
    expect(effectiveIceStrength(s, "wall-1")).toBe(3);

    evalEffect(
      { state: s, sourceId: "sifr-1" },
      fx.do({ kind: "sifr_zero_encounter_ice_strength" }),
    );
    // Set to 0, then Sandburg +2 (NSG).
    expect(effectiveIceStrength(s, "wall-1")).toBe(2);
    expect(iceStrength(s, "wall-1")).toBe(2);
  });

  it("applies Ice Carver after Şifr's set (CR 9.12.1a decrease)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const wall = instantiateCard("ice-wall", "wall-1", "server:hq:ice");
    wall.rezzed = true;
    s.cards["wall-1"] = wall;
    s.servers.hq.ice = ["wall-1"];
    const carver = instantiateCard("ice-carver", "carver-1", "runner:installed");
    const sifr = instantiateCard("sifr", "sifr-1", "runner:installed");
    s.cards["carver-1"] = carver;
    s.cards["sifr-1"] = sifr;
    s.runner.installed = ["carver-1", "sifr-1"];
    s.runner.maxHandSize = 5;
    s.run = encounterState("wall-1");

    expect(effectiveIceStrength(s, "wall-1")).toBe(0); // 1 - 1 carver
    evalEffect(
      { state: s, sourceId: "sifr-1" },
      fx.do({ kind: "sifr_zero_encounter_ice_strength" }),
    );
    // Set to 0, then Ice Carver −1.
    expect(effectiveIceStrength(s, "wall-1")).toBe(-1);
  });
});
