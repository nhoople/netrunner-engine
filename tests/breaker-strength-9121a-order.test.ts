/**
 * Breaker strength layering (CR 9.12.1a): default → increases → decreases.
 * Cradle grip penalty and Stegodon scored penalty are decrease-layer.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  effectiveBreakerStrength,
  instantiateCard,
} from "../src/index.js";
import { breakerStrength } from "../src/effects/iceStrength.js";
import { addBreakerStrengthBoostThisEncounter, suppressAbilities } from "../src/state/lingeringEffects.js";
import type { GameState, ServerId } from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.18");
});

function runState(serverId: ServerId = "hq"): NonNullable<GameState["run"]> {
  return {
    attackedServerId: serverId,
    phase: "encounter",
    position: 0,
    successful: false,
    accessedCardIds: [],
    accessCandidates: [],
    randomAccessLimit: null,
    encounter: { iceId: "ice-1", broken: [false], subroutinesResolved: [] },
    endedTheRun: false,
    cannotJackOut: false,
    accessingCardId: null,
  };
}

describe("breaker strength order (CR 9.12.1a)", () => {
  it("applies Cradle grip penalty after temporary increases", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const cradle = instantiateCard("cradle", "cradle-1", "runner:installed");
    s.cards["cradle-1"] = cradle;
    s.runner.installed = ["cradle-1"];
    s.runner.hand = ["h1", "h2"];
    for (const id of ["h1", "h2"]) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    }
    s.run = runState();

    // Printed 5 − 2 grip = 3.
    expect(effectiveBreakerStrength(s, "cradle-1")).toBe(3);

    addBreakerStrengthBoostThisEncounter(s, {
      createdBy: "cradle-1",
      breakerId: "cradle-1",
      amount: 4,
    });
    // Increases (+4) then grip decrease (−2) → 7.
    expect(effectiveBreakerStrength(s, "cradle-1")).toBe(7);
    expect(breakerStrength(s, "cradle-1")).toBe(7);
  });

  it("drops Cradle grip penalty while blanked (CR 9.12.1d)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const cradle = instantiateCard("cradle", "cradle-1", "runner:installed");
    suppressAbilities(s, cradle.id);
    s.cards["cradle-1"] = cradle;
    s.runner.installed = ["cradle-1"];
    s.runner.hand = ["h1", "h2", "h3"];
    for (const id of ["h1", "h2", "h3"]) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    }
    // Blanked: printed 5, no grip penalty.
    expect(effectiveBreakerStrength(s, "cradle-1")).toBe(5);
  });

  it("applies Stegodon after temporary increases", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const steg = instantiateCard("stegodon-mk-iv", "steg", "corp:score");
    s.cards["steg"] = steg;
    s.corp.scoreArea = ["steg"];
    const br = instantiateCard("corroder", "br-1", "runner:installed");
    s.cards["br-1"] = br;
    s.runner.installed = ["br-1"];
    s.run = runState();
    s.run.iceDerezzedThisRun = true;
    addBreakerStrengthBoostThisEncounter(s, {
      createdBy: "br-1",
      breakerId: "br-1",
      amount: 3,
    });

    // Corroder printed 2 + 3 pump − 2 Stegodon = 3.
    expect(steg.whileScoredBreakerStrengthPenaltyIfIceDerezzedThisRun).toBe(2);
    expect(effectiveBreakerStrength(s, "br-1")).toBe(3);
    expect(breakerStrength(s, "br-1")).toBe(3);
  });
});
