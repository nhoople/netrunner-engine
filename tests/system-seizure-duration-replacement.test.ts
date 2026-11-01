/**
 * System Seizure: mandatory strength-increase interrupt grants a run-duration
 * rewrite on the first would-increase each turn (CR 9.9.5a / 9.9.9).
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
import { LINGERING_KIND_BREAKER_STRENGTH_CHECKPOINT, LINGERING_KIND_BREAKER_STRENGTH_ENCOUNTER, LINGERING_KIND_BREAKER_STRENGTH_RUN, lingeringBreakerStrengthOfKind } from "../src/state/lingeringEffects.js";

import type { GameState } from "../src/index.js";
import { CR } from "../src/timing/labels.js";

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

describe("System Seizure duration replacement (CR 9.9.9)", () => {
  it("opens an interrupt window and rewrites the first pump to run duration", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const corr = instantiateCard("corroder", "corr-1", "runner:installed");
    const seizure = instantiateCard(
      "system-seizure",
      "ss-1",
      "runner:play-area",
    );
    s.cards["corr-1"] = corr;
    s.cards["ss-1"] = seizure;
    s.runner.installed = ["corr-1"];
    s.runner.playArea = ["ss-1"];
    encounterRun(s);

    const first = evalEffect(
      { state: s, sourceId: "corr-1" },
      fx.do({ kind: "pump_strength", amount: 1 }),
    );
    expect(first.ok).toBe(true);
    expect(s.pendingStrengthIncrease).toBeNull();
    expect(s.turn.systemSeizureFiredThisTurn).toBe(true);
    expect(s.run?.strengthDurationRunInsteadBreakerIds).toContain("corr-1");
    expect(lingeringBreakerStrengthOfKind(s, "corr-1", LINGERING_KIND_BREAKER_STRENGTH_RUN)).toBe(1);
    expect(lingeringBreakerStrengthOfKind(s, "corr-1", LINGERING_KIND_BREAKER_STRENGTH_ENCOUNTER)).toBe(0);
    const joined = s.log.join("\n");
    expect(joined).toContain("interrupt window");
    expect(joined).toContain(CR.ordinalWould.number);
    expect(joined).toContain("System Seizure");

    const second = evalEffect(
      { state: s, sourceId: "corr-1" },
      fx.do({ kind: "pump_strength", amount: 1 }),
    );
    expect(second.ok).toBe(true);
    expect(lingeringBreakerStrengthOfKind(s, "corr-1", LINGERING_KIND_BREAKER_STRENGTH_RUN)).toBe(2);
    expect(lingeringBreakerStrengthOfKind(s, "corr-1", LINGERING_KIND_BREAKER_STRENGTH_ENCOUNTER)).toBe(0);
  });

  it("does not rewrite a second icebreaker's pumps until its own first increase", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const corr = instantiateCard("corroder", "corr-1", "runner:installed");
    const yog = instantiateCard("gordian-blade", "gord-1", "runner:installed");
    const seizure = instantiateCard(
      "system-seizure",
      "ss-1",
      "runner:play-area",
    );
    s.cards["corr-1"] = corr;
    s.cards["gord-1"] = yog;
    s.cards["ss-1"] = seizure;
    s.runner.installed = ["corr-1", "gord-1"];
    s.runner.playArea = ["ss-1"];
    encounterRun(s);

    expect(
      evalEffect(
        { state: s, sourceId: "corr-1" },
        fx.do({ kind: "pump_strength", amount: 1 }),
      ).ok,
    ).toBe(true);
    expect(s.run?.strengthDurationRunInsteadBreakerIds).toEqual(["corr-1"]);

    // First increase this turn already happened — Gordian does not get the grant.
    expect(
      evalEffect(
        { state: s, sourceId: "gord-1" },
        fx.do({ kind: "pump_strength", amount: 1 }),
      ).ok,
    ).toBe(true);
    expect(s.run?.strengthDurationRunInsteadBreakerIds).toEqual(["corr-1"]);
    expect(lingeringBreakerStrengthOfKind(s, "gord-1", LINGERING_KIND_BREAKER_STRENGTH_ENCOUNTER)).toBe(1);
    expect(lingeringBreakerStrengthOfKind(s, "gord-1", LINGERING_KIND_BREAKER_STRENGTH_RUN)).toBe(0);
  });

  it("counts the first would-increase outside a run without attaching a grant (CR 9.9.5a)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const corr = instantiateCard("corroder", "corr-1", "runner:installed");
    const seizure = instantiateCard(
      "system-seizure",
      "ss-1",
      "runner:play-area",
    );
    s.cards["corr-1"] = corr;
    s.cards["ss-1"] = seizure;
    s.runner.installed = ["corr-1"];
    s.runner.playArea = ["ss-1"];
    // No run.

    expect(
      evalEffect(
        { state: s, sourceId: "corr-1" },
        fx.do({ kind: "pump_strength", amount: 1 }),
      ).ok,
    ).toBe(true);
    expect(s.turn.systemSeizureFiredThisTurn).toBe(true);
    // Outside a run, encounter pumps fall back to checkpoint duration.
    expect(lingeringBreakerStrengthOfKind(s, "corr-1", LINGERING_KIND_BREAKER_STRENGTH_CHECKPOINT)).toBe(1);
    expect(s.log.join("\n")).toContain("no run");

    encounterRun(s);
    expect(
      evalEffect(
        { state: s, sourceId: "corr-1" },
        fx.do({ kind: "pump_strength", amount: 1 }),
      ).ok,
    ).toBe(true);
    // Already fired this turn — no grant on the later in-run pump.
    expect(s.run?.strengthDurationRunInsteadBreakerIds ?? []).toEqual([]);
    expect(lingeringBreakerStrengthOfKind(s, "corr-1", LINGERING_KIND_BREAKER_STRENGTH_ENCOUNTER)).toBe(1);
  });
});
