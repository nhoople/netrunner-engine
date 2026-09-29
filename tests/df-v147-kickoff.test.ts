/**
 * Downfall v1.47.0 kickoff: Rezeki / Bukhgalter / Tiered Subscription /
 * Isolation / CSR Campaign.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  createGame,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  loadCardCatalog,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";

const CLEAR = [
  "rezeki",
  "bukhgalter",
  "tiered-subscription",
  "isolation",
  "csr-campaign",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.56.0");
});

describe("Downfall v1.47.0 kickoff", () => {
  it("declares downfall in-progress with 65 cards at corpus head", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["downfall"].status).toBe("in-progress");
    expect(pool.waves["downfall"].cards).toHaveLength(65);
    expect(pool.corpusOrder[0]).toBe("downfall");
    expect(pool.corpusOrder[1]).toBe("uprising");
    expect(pool.corpusOrder.at(-1)).toBe("vantage-point");
  });

  it("declares at least 5 clear downfall cards at kickoff", () => {
    const pool = loadCardPool(true);
    let clear = 0;
    for (const id of pool.waves["downfall"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(5);
  });

  it("loads five clear kickoff cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("downfall");
    }
  });

  it("Rezeki gains 1¢ on turn begin", () => {
    const def = getCardDef("rezeki");
    expect(def.onTurnBegin).toEqual(fx.gainCredits("runner", 1));
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();

    const state = createGame({ seed: 1 });
    const card = instantiateCard("rezeki", "rz1", "runner:rig");
    state.cards[card.id] = card;
    state.runner.rig.push(card.id);
    const before = state.runner.credits;
    const gain = evalEffect(
      { state, sourceId: card.id },
      fx.gainCredits("runner", 1),
    );
    expect(gain.ok).toBe(true);
    expect(state.runner.credits).toBe(before + 1);
  });

  it("Bukhgalter is a sentry killer with once-per-turn full-break 2¢", () => {
    const def = getCardDef("bukhgalter");
    expect(def.breaker).toEqual({
      breaksSubtype: "sentry",
      strength: 1,
      breakCredits: 1,
      breakMaxSubs: 1,
      pumpCredits: 1,
      pumpStrength: 1,
    });
    expect(def.onFullyBreakOncePerTurn).toEqual(fx.gainCredits("runner", 2));
    expect(validateEffectTree(def.onFullyBreakOncePerTurn!)).toBeNull();
    expect(def.paidAbilities?.[0]?.effect).toEqual(
      fx.do({ kind: "pump_strength", amount: 1 }),
    );
  });

  it("Tiered Subscription gains 1¢ on first run begin each turn", () => {
    const def = getCardDef("tiered-subscription");
    expect(def.onFirstRunBeginThisTurn).toEqual(fx.gainCredits("corp", 1));
    expect(validateEffectTree(def.onFirstRunBeginThisTurn!)).toBeNull();
  });

  it("Isolation trashes a resource as additional cost and gains 7¢", () => {
    const def = getCardDef("isolation");
    expect(def.playCost).toBe(2);
    expect(def.playRequiresInstalledResource).toBe(true);
    expect(def.playAdditionalCost).toEqual(fx.trashOwnResource());
    expect(def.onPlay).toEqual(fx.gainCredits("runner", 7));
    expect(validateEffectTree(def.playAdditionalCost!)).toBeNull();
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });

  it("CSR Campaign may draw 1 on turn begin", () => {
    const def = getCardDef("csr-campaign");
    expect(def.onTurnBegin).toEqual(
      fx.choose("corp", [
        {
          id: "draw",
          label: "Draw 1 card",
          effect: fx.draw("corp", 1),
        },
        {
          id: "decline",
          label: "Decline",
          effect: fx.gainCredits("corp", 0),
        },
      ]),
    );
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
  });
});
