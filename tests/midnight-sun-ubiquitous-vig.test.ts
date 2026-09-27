/**
 * Midnight Sun Ubiquitous Vig:
 * gain_credits_per_advancement on turn begin (1¢ × hosted advancements).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  createInitialState,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  resolveAndAdvance,
  validateEffectTree,
} from "../src/index.js";
import type { Effect } from "../src/index.js";
import type { ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v0.25.0");
});

function vigOnTurnBegin(): Effect {
  return fx.gainCreditsPerAdvancement(1);
}

function withRezzedVig(advancements: number) {
  let s = createInitialState();
  s = structuredClone(s);
  const remoteId = "remote-1" as ServerId;
  s.servers[remoteId] = {
    id: remoteId,
    kind: "remote",
    ice: [],
    root: [],
  };
  const card = instantiateCard(
    "ubiquitous-vig",
    "vig-1",
    `server:${remoteId}:root`,
  );
  card.rezzed = true;
  card.faceup = true;
  card.unsupported = [];
  card.onTurnBegin = vigOnTurnBegin();
  card.canAdvance = true;
  card.advancementTokens = advancements;
  s.cards["vig-1"] = card;
  s.servers[remoteId].root = ["vig-1"];
  s.corp.credits = 5;
  s.activeSide = "corp";
  s.timingKey = "corp.turnBegins";
  return { s, remoteId };
}

describe("MS gain_credits_per_advancement IR (always)", () => {
  it("validates Ubiquitous Vig turn-begin effect tree", () => {
    expect(validateEffectTree(vigOnTurnBegin())).toBeNull();
  });

  it("gains 1¢ per hosted advancement on the source", () => {
    const { s } = withRezzedVig(3);
    const before = s.corp.credits;
    const r = evalEffect({ state: s, sourceId: "vig-1" }, vigOnTurnBegin());
    expect(r.ok).toBe(true);
    expect(s.corp.credits).toBe(before + 3);
  });

  it("gains 0¢ when the source has no advancements", () => {
    const { s } = withRezzedVig(0);
    const before = s.corp.credits;
    const r = evalEffect({ state: s, sourceId: "vig-1" }, vigOnTurnBegin());
    expect(r.ok).toBe(true);
    expect(s.corp.credits).toBe(before);
  });

  it("corp.turnBegins fires onTurnBegin for rezzed Vig", () => {
    const { s } = withRezzedVig(2);
    s.corp.credits = 10;
    resolveAndAdvance(s);
    expect(s.corp.credits).toBe(12);
    expect(
      s.log.some((line) =>
        line.includes("corp gains 2¢ (2 advancement × 1) from Ubiquitous Vig"),
      ),
    ).toBe(true);
  });
});

describe("MS Ubiquitous Vig wiring (when cards pin includes it)", () => {
  it("card def still deferred at pin v0.25.0 (engine-only IR)", () => {
    const def = getCardDef("ubiquitous-vig");
    expect(def.type).toBe("asset");
    expect(def.canAdvance).toBe(true);
    // Pin still has unsupported until cards-data wiring PR.
    expect((def.unsupported ?? []).length).toBeGreaterThan(0);
    expect(def.onTurnBegin).toBeUndefined();
  });
});
