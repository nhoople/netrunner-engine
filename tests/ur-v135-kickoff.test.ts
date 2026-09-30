/**
 * Uprising v1.35.0 kickoff: Daily Casts / Bass CH1R180G4 / Makler.
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

const CLEAR = ["daily-casts", "bass-ch1r180g4", "makler"] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.94.0");
});

describe("Uprising v1.35.0 kickoff", () => {
  it("declares uprising supported with 65 cards after downfall", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["uprising"].status).toBe("supported");
    expect(pool.waves["uprising"].cards).toHaveLength(65);
    expect(pool.corpusOrder[0]).toBe("core");
    expect(pool.corpusOrder[1]).toBe("what-lies-ahead");
    expect(pool.corpusOrder[2]).toBe("trace-amount");
    expect(pool.corpusOrder[3]).toBe("cyber-exodus");
    expect(pool.corpusOrder[4]).toBe("a-study-in-static");
    expect(pool.corpusOrder[7]).toBe("creation-and-control");
    expect(pool.corpusOrder[8]).toBe("reign-and-reverie");
    expect(pool.corpusOrder[9]).toBe("system-core-2019");
    expect(pool.corpusOrder[10]).toBe("downfall");
    expect(pool.corpusOrder[11]).toBe("uprising");
    expect(pool.corpusOrder.at(-1)).toBe("vantage-point");
  });

  it("declares at least 3 clear uprising cards at kickoff", () => {
    const pool = loadCardPool(true);
    let clear = 0;
    for (const id of pool.waves["uprising"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(3);
  });

  it("loads three clear kickoff cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("uprising");
    }
  });

  it("Daily Casts loads 8¢ on install and takes 2¢ on turn begin", () => {
    const def = getCardDef("daily-casts");
    expect(def.hostedCreditsOnInstall).toBe(8);
    expect(def.onTurnBegin).toEqual(fx.do({ kind: "take_hosted_credits", amount: 2 }));
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();

    const state = createGame({ seed: 1 });
    const card = instantiateCard("daily-casts", "dc1", "runner:rig");
    state.cards[card.id] = card;
    state.runner.rig.push(card.id);
    card.hostedCredits = 8;
    const before = state.runner.credits;
    const take = evalEffect(
      { state, sourceId: card.id },
      fx.do({ kind: "take_hosted_credits", amount: 2 }),
    );
    expect(take.ok).toBe(true);
    expect(state.runner.credits).toBe(before + 2);
    expect(card.hostedCredits).toBe(6);
  });

  it("Bass CH1R180G4 is click+trash for gain 2 clicks", () => {
    const def = getCardDef("bass-ch1r180g4");
    expect(def.paidAbilities).toHaveLength(1);
    const ab = def.paidAbilities![0]!;
    expect(ab.clickCost).toBe(1);
    expect(ab.cost).toEqual({ clicks: 1, trashSelf: true });
    expect(ab.windows).toContain("corp_action_paw");
    expect(ab.effect).toEqual(fx.gainClicks("corp", 2));
    expect(validateEffectTree(ab.effect)).toBeNull();
  });

  it("Makler is a barrier fracter with once-per-turn full-break credit", () => {
    const def = getCardDef("makler");
    expect(def.breaker).toEqual({
      breaksSubtype: "barrier",
      strength: 2,
      breakCredits: 2,
      breakMaxSubs: 2,
      pumpCredits: 2,
      pumpStrength: 2,
    });
    expect(def.onFullyBreakOncePerTurn).toEqual(fx.gainCredits("runner", 1));
    expect(validateEffectTree(def.onFullyBreakOncePerTurn!)).toBeNull();
    expect(def.paidAbilities?.[0]?.effect).toEqual(
      fx.do({ kind: "pump_strength", amount: 2 }),
    );
  });
});
