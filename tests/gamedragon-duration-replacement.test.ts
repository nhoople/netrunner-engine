/**
 * Gamedragon Pro rewrites host strength increases to run duration and
 * reverts when it leaves the host (CR 9.9.9 / 9.9.9a).
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
  occurCheckpoint,
} from "../src/index.js";
import {
  LINGERING_KIND_BREAKER_STRENGTH_ENCOUNTER,
  LINGERING_KIND_BREAKER_STRENGTH_RUN,
  lingeringBreakerStrengthOfKind,
} from "../src/state/lingeringEffects.js";

import { breakerStrength } from "../src/effects/iceStrength.js";
import { moveRunnerCardToHeap } from "../src/state/trashHooks.js";
import { CR } from "../src/timing/labels.js";
import type { GameState } from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.16");
});

function encounterRun(s: GameState): void {
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
}

describe("Gamedragon Pro duration replacement (CR 9.9.9a)", () => {
  it("rewrites encounter pumps to run duration while hosted", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const corr = instantiateCard("corroder", "corr-1", "runner:installed");
    const gdp = instantiateCard("gamedragon-pro", "gdp-1", "runner:installed");
    gdp.hostId = "corr-1";
    s.cards["corr-1"] = corr;
    s.cards["gdp-1"] = gdp;
    s.runner.installed = ["corr-1", "gdp-1"];
    encounterRun(s);

    const before = breakerStrength(s, "corr-1");
    expect(
      evalEffect(
        { state: s, sourceId: "corr-1" },
        fx.do({ kind: "pump_strength", amount: 2 }),
      ).ok,
    ).toBe(true);
    expect(lingeringBreakerStrengthOfKind(s, "corr-1", LINGERING_KIND_BREAKER_STRENGTH_RUN)).toBe(2);
    expect(lingeringBreakerStrengthOfKind(s, "corr-1", LINGERING_KIND_BREAKER_STRENGTH_ENCOUNTER)).toBe(0);
    expect(
      s.turn.hostDurationReplacements?.some((r) => r.replacedTo === "run"),
    ).toBe(true);
    expect(breakerStrength(s, "corr-1")).toBe(before + 2);

    // Survives end of encounter while Gamedragon remains hosted.
    s.run!.encounter = undefined;
    expect(breakerStrength(s, "corr-1")).toBe(before + 2);
  });

  it("reverts to encounter duration when Gamedragon leaves mid-encounter", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const corr = instantiateCard("corroder", "corr-1", "runner:installed");
    const gdp = instantiateCard("gamedragon-pro", "gdp-1", "runner:installed");
    gdp.hostId = "corr-1";
    s.cards["corr-1"] = corr;
    s.cards["gdp-1"] = gdp;
    s.runner.installed = ["corr-1", "gdp-1"];
    encounterRun(s);

    expect(
      evalEffect(
        { state: s, sourceId: "corr-1" },
        fx.do({ kind: "pump_strength", amount: 2 }),
      ).ok,
    ).toBe(true);

    moveRunnerCardToHeap(s, "gdp-1");
    // Strength read syncs host-duration replacements (CR 9.9.9a).
    // Corroder 2 + encounter pump 2 (host +1 gone with Gamedragon).
    expect(breakerStrength(s, "corr-1")).toBe(4);
    expect(lingeringBreakerStrengthOfKind(s, "corr-1", LINGERING_KIND_BREAKER_STRENGTH_ENCOUNTER)).toBe(2);
    expect(lingeringBreakerStrengthOfKind(s, "corr-1", LINGERING_KIND_BREAKER_STRENGTH_RUN)).toBe(0);
    expect(s.log.join("\n")).toContain(CR.replacementStaticMustRemainActive.number);
  });

  it("ends the boost at the next checkpoint when the encounter already ended", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const corr = instantiateCard("corroder", "corr-1", "runner:installed");
    const gdp = instantiateCard("gamedragon-pro", "gdp-1", "runner:installed");
    gdp.hostId = "corr-1";
    s.cards["corr-1"] = corr;
    s.cards["gdp-1"] = gdp;
    s.runner.installed = ["corr-1", "gdp-1"];
    encounterRun(s);

    expect(
      evalEffect(
        { state: s, sourceId: "corr-1" },
        fx.do({ kind: "pump_strength", amount: 2 }),
      ).ok,
    ).toBe(true);

    s.run!.encounter = undefined;
    const mid = breakerStrength(s, "corr-1"); // 2 base + 1 host + 2 pump
    expect(mid).toBe(5);

    moveRunnerCardToHeap(s, "gdp-1");
    // Host bonus gone; pump held until checkpoint (CR 9.9.9a.ex1).
    expect(breakerStrength(s, "corr-1")).toBe(4);
    expect(s.log.join("\n")).toContain(CR.replacementStaticMustRemainActive.number);

    occurCheckpoint(s, "timing", "after Gamedragon leaves", [
      CR.checkpointDurationAbilities,
    ], "test");
    expect(breakerStrength(s, "corr-1")).toBe(2);
  });
});
