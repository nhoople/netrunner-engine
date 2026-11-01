/**
 * Breaker strength uses one shared path (CR 9.12.1a): legality and eval agree.
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
import {
  addBreakerStrengthBoostThisEncounter,
  addBreakerStrengthBoostThisRun,
  addBreakerStrengthBoostThisTurn,
} from "../src/state/lingeringEffects.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.14");
});

describe("breaker strength unify (CR 9.12.1a)", () => {
  it("breakerStrength and effectiveBreakerStrength agree with turn/run boosts", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const br = instantiateCard("corroder", "br-1", "runner:installed");
    s.cards["br-1"] = br;
    s.runner.installed = ["br-1"];
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: false,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: { iceId: "none", broken: [] },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    addBreakerStrengthBoostThisTurn(s, {
      createdBy: "br-1",
      breakerId: "br-1",
      amount: 2,
    });
    addBreakerStrengthBoostThisRun(s, {
      createdBy: "br-1",
      breakerId: "br-1",
      amount: 1,
    });
    addBreakerStrengthBoostThisEncounter(s, {
      createdBy: "br-1",
      breakerId: "br-1",
      amount: 1,
    });
    const a = breakerStrength(s, "br-1");
    const b = effectiveBreakerStrength(s, "br-1");
    expect(a).toBe(b);
    // Printed Corroder strength 2 + turn 2 + run 1 + encounter 1.
    expect(a).toBe((br.breaker?.strength ?? br.strength ?? 0) + 4);
  });
});
