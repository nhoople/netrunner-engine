/**
 * Comprehensive Rules examples from chapter 3.
 * Each test plays that example's board.
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
import { breakerStrength, iceStrength } from "../src/effects/iceStrength.js";
import { occurCheckpoint } from "../src/legality/checkpoints.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.18");
});

describe("CR examples, chapter 3", () => {


  it("lowers Archangel for the encounter when Gang Sign starts no run (CR 3.4.4a.ex1)", () => {
    const s = createInitialState();
    const arch = instantiateCard("archangel", "arch-1", "corp:hq");
    arch.rezzed = true;
    arch.faceup = true;
    s.cards["arch-1"] = arch;
    s.corp.hand = ["arch-1"];
    const charm = instantiateCard("devil-charm", "charm-1", "runner:installed");
    s.cards["charm-1"] = charm;
    s.runner.installed = ["charm-1"];
    const printed = iceStrength(s, "arch-1");
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: null,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: { iceId: "arch-1", broken: [] },
      endedTheRun: false,
      cannotJackOut: false,
      accessingCardId: null,
      encounterOutsideRun: true,
    };
    const weakened = evalEffect(
      { state: s, sourceId: "charm-1" },
      fx.do({ kind: "weaken_ice", amount: 6 }),
    );
    expect(weakened.ok).toBe(true);
    expect(iceStrength(s, "arch-1")).toBe(printed - 6);
    s.run = null;
    expect(iceStrength(s, "arch-1")).toBe(printed);
  });


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
