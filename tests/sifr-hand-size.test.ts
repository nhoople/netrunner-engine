/**
 * Şifr −1 max hand size is part of hand-size recompute until the Runner's
 * next turn begins (survives install/recompute; clears on beginRunnerTurn).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  fx,
  instantiateCard,
} from "../src/index.js";
import type { GameState, ServerId } from "../src/index.js";
import { recomputeRunnerMaxHandSize } from "../src/state/handSize.js";
import { beginRunnerTurnFlags } from "../src/state/turn.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.15");
});

function encounterState(iceId: string): NonNullable<GameState["run"]> {
  return {
    attackedServerId: "hq" as ServerId,
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

describe("Şifr hand-size recompute", () => {
  it("keeps −1 after recompute and restores on Runner turn begin", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const wall = instantiateCard("ice-wall", "wall-1", "server:hq:ice");
    wall.rezzed = true;
    s.cards["wall-1"] = wall;
    s.servers.hq.ice = ["wall-1"];
    const sifr = instantiateCard("sifr", "sifr-1", "runner:installed");
    s.cards["sifr-1"] = sifr;
    s.runner.installed = ["sifr-1"];
    recomputeRunnerMaxHandSize(s);
    const base = s.runner.maxHandSize;
    expect(base).toBeGreaterThanOrEqual(5);
    s.run = encounterState("wall-1");

    evalEffect(
      { state: s, sourceId: "sifr-1" },
      fx.do({ kind: "sifr_zero_encounter_ice_strength" }),
    );
    expect(s.turn.sifrHandSizePenaltyActive).toBe(true);
    expect(s.runner.maxHandSize).toBe(base - 1);

    // Install-path recompute must not wipe the penalty.
    recomputeRunnerMaxHandSize(s);
    expect(s.runner.maxHandSize).toBe(base - 1);

    beginRunnerTurnFlags(s);
    expect(s.turn.sifrHandSizePenaltyActive).toBe(false);
    expect(s.runner.maxHandSize).toBe(base);
  });
});
