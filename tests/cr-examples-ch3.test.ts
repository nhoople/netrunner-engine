/**
 * Comprehensive Rules examples from chapter 3.
 * Each test plays that example's board. An example that already has a
 * test in a mechanism file stays in that file.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  CR,
  createInitialState,
  crDataPresent,
  evalEffect,
  fx,
  instantiateCard,
} from "../src/index.js";
import { breakerStrength } from "../src/effects/iceStrength.js";
import { occurCheckpoint } from "../src/legality/checkpoints.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.6");
});

describe("CR examples, chapter 3", () => {
    it("drops Corroder's encounter pump when the encounter ends (CR 3.9.5b.ex1)", () => {
    const s = createInitialState();
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    const breaker = instantiateCard("corroder", "co-1", "runner:installed");
    s.cards["ice-1"] = ice;
    s.cards["co-1"] = breaker;
    s.runner.installed = ["co-1"];
    s.servers.hq.ice = ["ice-1"];
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: { iceId: "ice-1", subIndex: 0 },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    const before = breakerStrength(s, "co-1");
    const pumped = evalEffect(
      { state: s, sourceId: "co-1" },
      fx.do({ kind: "pump_strength", amount: 1 }),
    );
    expect(pumped.ok).toBe(true);
    expect(breakerStrength(s, "co-1")).toBe(before + 1);
    occurCheckpoint(s, "test", "after encounter", [CR.encounterIcePhase], "test");
    expect(breakerStrength(s, "co-1")).toBe(before);
  });

    it("keeps Gordian Blade's pump for the remainder of the run (CR 3.9.5c.ex1)", () => {
    const s = createInitialState();
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    const blade = instantiateCard("gordian-blade", "gb-1", "runner:installed");
    s.cards["ice-1"] = ice;
    s.cards["gb-1"] = blade;
    s.runner.installed = ["gb-1"];
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: { iceId: "ice-1", subIndex: 0 },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    const before = breakerStrength(s, "gb-1");
    const pumped = evalEffect(
      { state: s, sourceId: "gb-1" },
      fx.do({ kind: "pump_strength", amount: 1, duration: "run" }),
    );
    expect(pumped.ok).toBe(true);
    occurCheckpoint(s, "test", "after encounter", [CR.encounterIcePhase], "test");
    expect(breakerStrength(s, "gb-1")).toBe(before + 1);
    s.run = null;
    expect(breakerStrength(s, "gb-1")).toBe(before);
  });

    it("ends Corroder's pump at the next checkpoint when there is no encounter (CR 3.9.5d.ex1)", () => {
    const s = createInitialState();
    const breaker = instantiateCard("corroder", "co-1", "runner:installed");
    s.cards["co-1"] = breaker;
    s.runner.installed = ["co-1"];
    const before = breakerStrength(s, "co-1");
    const pumped = evalEffect(
      { state: s, sourceId: "co-1" },
      fx.do({ kind: "pump_strength", amount: 1 }),
    );
    expect(pumped.ok).toBe(true);
    expect(breakerStrength(s, "co-1")).toBe(before + 1);
    expect(s.log.some((line) => line.includes(CR.icebreakerStrengthOutsideEncounter.number))).toBe(
      true,
    );
    occurCheckpoint(s, "test", "checkpoint", [CR.checkpointDurationAbilities], "test");
    expect(breakerStrength(s, "co-1")).toBe(before);
  });
});
