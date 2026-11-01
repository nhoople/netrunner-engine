/**
 * Ice strength uses one shared path (CR 9.12.1a): legality and eval must agree.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  effectiveIceStrength,
  instantiateCard,
} from "../src/index.js";
import { iceStrength } from "../src/effects/iceStrength.js";
import { addIceStrengthBoostThisEncounter } from "../src/state/lingeringEffects.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.15");
});

describe("ice strength unify (CR 9.12.1a)", () => {
  it("iceStrength and effectiveIceStrength agree with boosts and penalties", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    ice.strength = 1;
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];
    const carver = instantiateCard("ice-carver", "ic-1", "runner:installed");
    // allIceStrengthPenalty if present; otherwise use run boost maps.
    s.cards["ic-1"] = carver;
    s.runner.installed = ["ic-1"];
    s.run = {
      attackedServerId: "hq",
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
    addIceStrengthBoostThisEncounter(s, {
      createdBy: "test",
      iceId: "ice-1",
      amount: 3,
    });
    const a = iceStrength(s, "ice-1");
    const b = effectiveIceStrength(s, "ice-1");
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(1);
  });
});
