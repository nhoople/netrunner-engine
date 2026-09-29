/**
 * RWR v0.88: Corporate Hospitality / Boto / Capacitor / Friend of a Friend / Seraph.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  createGame,
  effectiveIceStrength,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  loadCardCatalog,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.67.0");
});

describe("RWR v0.88 Corporate Hospitality / Boto / Capacitor / FoF / Seraph", () => {
  it("loads five clear cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of [
      "corporate-hospitality",
      "boto",
      "capacitor",
      "friend-of-a-friend",
      "seraph",
    ]) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? []).toEqual([]);
    }
  });

  it("Corporate Hospitality is double: gain 6, draw 2, archives to HQ", () => {
    const def = getCardDef("corporate-hospitality");
    expect(def.playAdditionalClick).toBe(true);
    expect(def.onPlay).toEqual(
      fx.seq(
        fx.gainCredits("corp", 6),
        fx.draw("corp", 2),
        fx.do({ kind: "archives_to_hq", amount: 1 }),
      ),
    );
  });

  it("Boto threat strength + may-trash-HQ ETR", () => {
    const def = getCardDef("boto");
    expect(def.threatStrengthBonus).toEqual({ level: 4, amount: 2 });
    expect(def.subroutines).toHaveLength(3);
  });

  it("Capacitor gains credits per tags and strength while tagged", () => {
    const def = getCardDef("capacitor");
    expect(def.strengthBonusWhileTagged).toBe(2);
    const state = createGame({ seed: 1 });
    const ice = instantiateCard("capacitor", "cap1", "server:hq:ice");
    state.cards[ice.id] = ice;
    state.servers.hq.ice.push(ice.id);
    ice.rezzed = true;
    expect(effectiveIceStrength(state, ice.id)).toBe(3);
    state.runner.tags = 2;
    expect(effectiveIceStrength(state, ice.id)).toBe(5);
    const before = state.corp.credits;
    const r = evalEffect(
      { state, sourceId: ice.id },
      fx.do({ kind: "gain_credits_per_runner_tags", per: 1 }),
    );
    expect(r.ok).toBe(true);
    expect(state.corp.credits).toBe(before + 2);
  });

  it("Friend of a Friend second ability requires untagged", () => {
    const def = getCardDef("friend-of-a-friend");
    const abs = def.paidAbilities ?? [];
    expect(abs).toHaveLength(2);
    expect(abs[1].requiresUntagged).toBe(true);
  });

  it("Seraph onEncounter is a three-way choose", () => {
    const def = getCardDef("seraph");
    expect(def.onEncounter?.op).toBe("choose");
    expect(def.subroutines).toHaveLength(3);
  });
});
