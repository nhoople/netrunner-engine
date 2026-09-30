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
  assertCardsPinnedTag("v1.133.0");
});

describe("Downfall v1.47.0 kickoff", () => {
  it("declares downfall supported with 65 cards after reign-and-reverie", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["downfall"].status).toBe("supported");
    expect(pool.waves["downfall"].cards).toHaveLength(65);
    expect(pool.corpusOrder[0]).toBe("core");
    expect(pool.corpusOrder[1]).toBe("what-lies-ahead");
    expect(pool.corpusOrder[2]).toBe("trace-amount");
    expect(pool.corpusOrder[3]).toBe("cyber-exodus");
    expect(pool.corpusOrder[4]).toBe("a-study-in-static");
    expect(pool.corpusOrder[7]).toBe("creation-and-control");
    expect(pool.corpusOrder[8]).toBe("opening-moves");
    expect(pool.corpusOrder[9]).toBe("stalwart");
    expect(pool.corpusOrder[10]).toBe("mala-tempora");
    expect(pool.corpusOrder[11]).toBe("true-colors");
    expect(pool.corpusOrder[12]).toBe("fear-and-loathing");
    expect(pool.corpusOrder[13]).toBe("double-time");
    expect(pool.corpusOrder[14]).toBe("honor-and-profit");
    expect(pool.corpusOrder[15]).toBe("upstalk");
    expect(pool.corpusOrder[16]).toBe("the-spaces-between");
    expect(pool.corpusOrder[17]).toBe("first-contact");
    expect(pool.corpusOrder[18]).toBe("up-and-over");
    expect(pool.corpusOrder[19]).toBe("all-that-remains");
    expect(pool.corpusOrder[20]).toBe("the-source");
    expect(pool.corpusOrder[21]).toBe("order-and-chaos");
    expect(pool.corpusOrder[22]).toBe("the-valley");
    expect(pool.corpusOrder[23]).toBe("breaker-bay");
    expect(pool.corpusOrder[24]).toBe("chrome-city");
    expect(pool.corpusOrder[25]).toBe("the-underway");
    expect(pool.corpusOrder[26]).toBe("old-hollywood");
    expect(pool.corpusOrder[27]).toBe("the-universe-of-tomorrow");
    expect(pool.corpusOrder[28]).toBe("data-and-destiny");
    expect(pool.corpusOrder[29]).toBe("kala-ghoda");
    expect(pool.corpusOrder[30]).toBe("business-first");
    expect(pool.corpusOrder[31]).toBe("democracy-and-dogma");
    expect(pool.corpusOrder[32]).toBe("salsette-island");
    expect(pool.corpusOrder[33]).toBe("the-liberated-mind");
    expect(pool.corpusOrder[34]).toBe("fear-the-masses");
    expect(pool.corpusOrder[35]).toBe("twenty-three-seconds");
    expect(pool.corpusOrder[36]).toBe("blood-money");
    expect(pool.corpusOrder[37]).toBe("escalation");
    expect(pool.corpusOrder[38]).toBe("intervention");
    expect(pool.corpusOrder[39]).toBe("martial-law");
    expect(pool.corpusOrder[40]).toBe("quorum");
    expect(pool.corpusOrder[41]).toBe("daedalus-complex");
    expect(pool.corpusOrder[42]).toBe("station-one");
    expect(pool.corpusOrder[43]).toBe("terminal-directive");
    expect(pool.corpusOrder[44]).toBe("earths-scion");
    expect(pool.corpusOrder[45]).toBe("blood-and-water");
    expect(pool.corpusOrder[46]).toBe("free-mars");
    expect(pool.corpusOrder[47]).toBe("reign-and-reverie");
    expect(pool.corpusOrder[48]).toBe("system-core-2019");
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
