/**
 * TAI v0.73: Behold! (ambush tags) + Your Digital Life (¢ per HQ card).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  validateEffectTree,
} from "../src/index.js";
import type { ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.93.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

function emptyRun(server: ServerId, candidates: string[]) {
  return {
    attackedServerId: server,
    phase: "breach" as const,
    position: null,
    successful: true,
    accessedCardIds: [] as string[],
    accessCandidates: candidates,
    accessRemaining: null as number | null,
    encounter: null,
    endedTheRun: false,
    cannotJackOut: false,
    strengthBoosts: {} as Record<string, number>,
    encounterStrengthBoosts: {} as Record<string, number>,
    iceStrengthBoosts: {} as Record<string, number>,
    accessingCardId: null as string | null,
  };
}

describe("TAI Behold! + Your Digital Life", () => {
  it("wires Behold must-reveal + skip-archives + onAccess; unsupported empty", () => {
    const def = getCardDef("behold");
    expect(def.unsupported).toEqual([]);
    expect(def.mustRevealWhenAccessedFromRd).toBe(true);
    expect(def.skipOnAccessFromArchives).toBe(true);
    expect(def.onAccess).toBeDefined();
    expect(validateEffectTree(def.onAccess!)).toBeNull();
  });

  it("Snare carries skipOnAccessFromArchives", () => {
    const def = getCardDef("snare");
    expect(def.skipOnAccessFromArchives).toBe(true);
  });

  it("Behold onAccess from HQ offers pay-for-tags; Archives skips", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const card = instantiateCard("behold", "bh-1", "corp:hq");
    card.faceup = true;
    s.cards["bh-1"] = card;
    s.corp.hand = ["bh-1"];
    s.corp.credits = 5;
    s.runner.tags = 0;
    s.activeSide = "runner";
    s.timingKey = "breach.awaitAccess";
    s.run = emptyRun("hq", ["bh-1"]);
    s = must(s, { type: "access_card", cardId: "bh-1" });
    expect(s.pendingChoice).toBeTruthy();
    expect(s.pendingChoice!.options.map((o) => o.id)).toContain("pay");
    s = must(s, {
      type: "choose_option",
      optionId: "pay",
    });
    expect(s.corp.credits).toBe(1);
    expect(s.runner.tags).toBe(2);

    // Archives: skipped
    let s2 = createInitialState();
    s2 = structuredClone(s2);
    const c2 = instantiateCard("behold", "bh-2", "corp:archives");
    c2.faceup = true;
    s2.cards["bh-2"] = c2;
    s2.corp.discard = ["bh-2"];
    s2.corp.credits = 5;
    s2.runner.tags = 0;
    s2.activeSide = "runner";
    s2.timingKey = "breach.awaitAccess";
    s2.run = emptyRun("archives", ["bh-2"]);
    s2 = must(s2, { type: "access_card", cardId: "bh-2" });
    expect(s2.pendingChoice).toBeFalsy();
    expect(s2.runner.tags).toBe(0);
    expect(s2.corp.credits).toBe(5);
  });

  it("wires Your Digital Life gain_credits_per_hq_card; unsupported empty", () => {
    const def = getCardDef("your-digital-life");
    expect(def.unsupported).toEqual([]);
    expect(def.onPlay).toEqual(fx.gainCreditsPerHqCard(1));
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });

  it("gains 1¢ per card in HQ", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.corp.hand = ["a", "b", "c"];
    s.corp.credits = 2;
    const op = instantiateCard("your-digital-life", "ydl-1", "corp:play-area");
    s.cards["ydl-1"] = op;
    const r = evalEffect(
      { state: s, sourceId: "ydl-1" },
      fx.gainCreditsPerHqCard(1),
    );
    expect(r.ok).toBe(true);
    expect(s.corp.credits).toBe(5);
  });
});
