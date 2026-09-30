/**
 * Midnight Sun Chekist Scion: onAccess → give_tags_per_advancement
 * (1 tag + 1 per hosted advancement while installed).
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
import type { Effect } from "../src/index.js";
import type { ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.90.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

function chekistOnAccess(): Effect {
  return fx.giveTagsPerAdvancement(1, 1);
}

describe("MS give_tags_per_advancement (Chekist)", () => {
  it("validates give_tags_per_advancement tree", () => {
    expect(validateEffectTree(chekistOnAccess())).toBeNull();
  });

  it("gives base + per×advancement tags from source", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const remote = "remote-1" as ServerId;
    s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
    const card = instantiateCard(
      "chekist-scion",
      "chek-1",
      `server:${remote}:root`,
    );
    card.advancementTokens = 2;
    card.onAccess = chekistOnAccess();
    s.cards["chek-1"] = card;
    s.servers[remote].root = ["chek-1"];
    s.runner.tags = 0;

    const r = evalEffect({ state: s, sourceId: "chek-1" }, chekistOnAccess());
    expect(r.ok).toBe(true);
    expect(s.runner.tags).toBe(3); // 1 + 2
  });

  it("onAccess during remote breach tags the Runner", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const remote = "remote-1" as ServerId;
    s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
    const card = instantiateCard(
      "chekist-scion",
      "chek-1",
      `server:${remote}:root`,
    );
    card.rezzed = false;
    card.faceup = false;
    card.canAdvance = true;
    card.advancementTokens = 1;
    card.onAccess = chekistOnAccess();
    card.unsupported = [];
    s.cards["chek-1"] = card;
    s.servers[remote].root = ["chek-1"];
    s.runner.tags = 0;
    s.activeSide = "runner";
    // Mid-breach access window.
    s.timingKey = "breach.awaitAccess";
    s.run = {
      attackedServerId: remote,
      phase: "breach",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: ["chek-1"],
      accessRemaining: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };

    s = must(s, { type: "access_card", cardId: "chek-1" });
    expect(s.runner.tags).toBe(2); // 1 + 1 advancement
    expect(s.log.some((l) => /tag/i.test(l))).toBe(true);
  });

  it("Chekist card wiring is fully clear on pin v0.33.0", () => {
    const def = getCardDef("chekist-scion");
    expect(def.unsupported ?? []).toEqual([]);
    expect(def.onAccess).toEqual({
      op: "do",
      action: { kind: "give_tags_per_advancement", base: 1, per: 1 },
    });
  });
});
