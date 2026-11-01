/**
 * Gebrselassie rewrites third-party encounter strength increases to turn
 * duration (CR 9.9.9a; Takobi UFAQ).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  effectiveBreakerStrength,
  evalEffect,
  fx,
  instantiateCard,
} from "../src/index.js";
import {
  LINGERING_KIND_BREAKER_STRENGTH,
  lingeringBreakerStrengthOfKind,
} from "../src/state/lingeringEffects.js";

import { breakerStrength } from "../src/effects/iceStrength.js";
import type { GameState } from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.15");
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
    strengthBoosts: {},
    encounterStrengthBoosts: {},
    iceStrengthBoosts: {},
    accessingCardId: null,
  };
}

describe("Gebrselassie encounter-boost rewrite (CR 9.9.9a)", () => {
  it("stretches Takobi's encounter pump to the remainder of the turn", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const corr = instantiateCard("corroder", "corr-1", "runner:installed");
    const geb = instantiateCard("gebrselassie", "geb-1", "runner:installed");
    geb.hostId = "corr-1";
    const takobi = instantiateCard("takobi", "tk-1", "runner:installed");
    s.cards["corr-1"] = corr;
    s.cards["geb-1"] = geb;
    s.cards["tk-1"] = takobi;
    s.runner.installed = ["corr-1", "geb-1", "tk-1"];
    encounterRun(s);

    const before = effectiveBreakerStrength(s, "corr-1");
    const r = evalEffect(
      { state: s, sourceId: "tk-1" },
      fx.do({ kind: "pump_takobi_resolve", cardId: "corr-1", amount: 3 }),
    );
    expect(r.ok).toBe(true);
    expect(lingeringBreakerStrengthOfKind(s, "corr-1", LINGERING_KIND_BREAKER_STRENGTH)).toBe(3);
    expect(s.run?.encounterStrengthBoosts["corr-1"]).toBeUndefined();
    expect(s.turn.hostDurationReplacements?.some((rec) => rec.breakerId === "corr-1")).toBe(
      true,
    );
    expect(effectiveBreakerStrength(s, "corr-1")).toBe(before + 3);
    expect(breakerStrength(s, "corr-1")).toBe(before + 3);

    // Survives end of encounter / run while Gebrselassie remains hosted.
    s.run = null;
    expect(effectiveBreakerStrength(s, "corr-1")).toBe(before + 3);
  });
});
