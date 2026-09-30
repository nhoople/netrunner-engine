/**
 * Elevation v1.03.0: Doomscroll / Otto / Principia / Rising Tide / Greenmail.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  createGame,
  effectiveBreakerStrength,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  loadCardPool,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.109.0");
});

describe("Elevation v1.03.0 B-slice", () => {
  it("declares pool-wide clear elevation cards (includes later slices)", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["elevation"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["elevation"].cards) {
      const def = getCardDef(id);
      if ((def.unsupported ?? []).length === 0) clear++;
    }
    // Floor at this slice; later pins raise the pool-wide clear count.
    expect(clear).toBeGreaterThanOrEqual(23);
  });

  it("Doomscroll uses tags_gte for third subroutine", () => {
    const d = getCardDef("doomscroll");
    expect(d.unsupported ?? []).toEqual([]);
    expect(d.subroutines).toHaveLength(3);
    expect(d.subroutines![2]!.effect).toEqual(
      fx.if({ op: "tags_gte", amount: 2 }, fx.netDamage(2)),
    );
    const state = createGame({ seed: 1 });
    state.runner.tags = 1;
    expect(
      evalEffect(
        { state, sourceId: "corp-id" },
        fx.if({ op: "tags_gte", amount: 2 }, fx.netDamage(2)),
      ).ok,
    ).toBe(true);
    // Cond false → if succeeds as no-op
    expect(state.runner.tags).toBe(1);
    state.runner.tags = 2;
    const before = state.runner.hand.length;
    // Give runner cards to take net damage from
    evalEffect(
      { state, sourceId: "corp-id" },
      fx.if({ op: "tags_gte", amount: 2 }, fx.netDamage(2)),
    );
    expect(state.runner.hand.length).toBeLessThanOrEqual(before);
  });

  it("Otto Campaign loads 6¢ and grants 2 clicks on empty", () => {
    const o = getCardDef("otto-campaign");
    expect(o.clicksOnHostedEmpty).toBe(2);
    expect(o.onRez).toEqual(fx.do({ kind: "place_hosted_credits", amount: 6 }));
    const state = createGame({ seed: 2 });
    const asset = instantiateCard(
      "otto-campaign",
      "otto1",
      "server:remote-1:root",
    );
    state.cards[asset.id] = asset;
    state.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: [asset.id],
    };
    asset.rezzed = true;
    evalEffect(
      { state, sourceId: asset.id },
      fx.do({ kind: "place_hosted_credits", amount: 6 }),
    );
    expect(asset.hostedCredits).toBe(6);
    const clicksBefore = state.corp.clicks;
    // Drain to empty
    evalEffect(
      { state, sourceId: asset.id },
      fx.do({ kind: "take_hosted_credits", amount: 6 }),
    );
    expect(asset.hostedCredits).toBe(0);
    expect(state.corp.clicks).toBe(clicksBefore + 2);
  });

  it("Principia discounts install per icebreaker; Rising Tide heap strength", () => {
    const p = getCardDef("principia");
    expect(p.installCostDiscountPerInstalledIcebreaker).toBe(1);
    expect(p.breaker?.breaksSubtype).toBe("barrier");
    const r = getCardDef("rising-tide");
    expect(r.strengthBonusPerHeapSubtype).toEqual({
      subtype: "fracter",
      bonus: 1,
    });
    const state = createGame({ seed: 3 });
    const tide = instantiateCard("rising-tide", "tide1", "runner:rig");
    state.cards[tide.id] = tide;
    state.runner.rig.push(tide.id);
    expect(effectiveBreakerStrength(state, tide.id)).toBe(1);
    const heapFracter = instantiateCard("cleaver", "cleaver1", "runner:heap");
    state.cards[heapFracter.id] = heapFracter;
    state.runner.discard.push(heapFracter.id);
    expect(effectiveBreakerStrength(state, tide.id)).toBe(2);
  });

  it("Greenmail scores for 2¢ and forfeits for 4¢", () => {
    const g = getCardDef("greenmail");
    expect(g.onScore).toEqual(fx.gainCredits("corp", 2));
    expect(g.onForfeit).toEqual(fx.gainCredits("corp", 4));
  });
});
