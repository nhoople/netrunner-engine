/**
 * Reign and Reverie v1.76.0 A-slice: Liza Talking Thunder / Sportsmetal /
 * Nathaniel "Gnat" Hall / Guinea Pig / Hydra.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  loadCardCatalog,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";

const CLEAR = [
  "liza-talking-thunder-prominent-legislator",
  "sportsmetal-go-big-or-go-home",
  "nathaniel-gnat-hall-one-of-a-kind",
  "guinea-pig",
  "hydra",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.134.0");
});

describe("Reign and Reverie v1.76.0 A-slice", () => {
  it("declares reign-and-reverie supported with at least 10 RaR-only clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["reign-and-reverie"].status).toBe("supported");
    expect(pool.waves["reign-and-reverie"].cards).toHaveLength(58);
    expect(pool.corpusOrder[0]).toBe("core");
    expect(pool.corpusOrder[1]).toBe("what-lies-ahead");
    expect(pool.corpusOrder[2]).toBe("trace-amount");
    expect(pool.corpusOrder[3]).toBe("cyber-exodus");
    let clear = 0;
    for (const id of pool.waves["reign-and-reverie"].cards) {
      const def = getCardDef(id);
      if (
        (def.unsupported ?? []).length === 0 &&
        def.wave === "reign-and-reverie"
      ) {
        clear++;
      }
    }
    expect(clear).toBeGreaterThanOrEqual(10);
  });

  it("loads five clear A-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("reign-and-reverie");
    }
  });

  it("Liza draws 2 and takes a tag on first successful central", () => {
    const def = getCardDef("liza-talking-thunder-prominent-legislator");
    expect(def.onFirstSuccessfulCentralRunThisTurn).toEqual({
      op: "seq",
      effects: [fx.draw("runner", 2), fx.do({ kind: "give_tags", amount: 1 })],
    });
    expect(
      validateEffectTree(def.onFirstSuccessfulCentralRunThisTurn!),
    ).toBeNull();
  });

  it("Sportsmetal chooses gain 2¢ or draw 2 on agenda scored/stolen", () => {
    const def = getCardDef("sportsmetal-go-big-or-go-home");
    expect(def.onAgendaScoredOrStolen?.op).toBe("choose");
    expect(JSON.stringify(def.onAgendaScoredOrStolen)).toContain(
      "gain_credits",
    );
    expect(JSON.stringify(def.onAgendaScoredOrStolen)).toContain("draw");
    expect(validateEffectTree(def.onAgendaScoredOrStolen!)).toBeNull();
  });

  it("Gnat gains 1¢ at turn begin when grip has ≤2 cards", () => {
    const def = getCardDef("nathaniel-gnat-hall-one-of-a-kind");
    expect(def.onTurnBegin?.op).toBe("if");
    expect(JSON.stringify(def.onTurnBegin)).toContain("grip_count_gte");
    expect(JSON.stringify(def.onTurnBegin)).toContain("gain_credits");
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();

    const s = structuredClone(createInitialState());
    const id = instantiateCard(
      "nathaniel-gnat-hall-one-of-a-kind",
      "gnat",
      "runner:identity",
    );
    s.cards["gnat"] = id;
    s.runner.identityCardId = "gnat";
    s.runner.hand = [];
    const before = s.runner.credits;
    const r = evalEffect({ state: s, sourceId: "gnat" }, def.onTurnBegin!);
    expect(r.ok).toBe(true);
    expect(s.runner.credits).toBe(before + 1);
  });

  it("Guinea Pig trashes grip and gains 10¢", () => {
    const def = getCardDef("guinea-pig");
    expect(JSON.stringify(def.onPlay)).toContain("trash_random_from_grip");
    expect(JSON.stringify(def.onPlay)).toContain("gain_credits");
    expect(validateEffectTree(def.onPlay!)).toBeNull();

    const s = structuredClone(createInitialState());
    for (const [i, cardId] of ["a", "b", "c"].entries()) {
      const c = instantiateCard("sure-gamble", cardId, "runner:grip");
      s.cards[cardId] = c;
      s.runner.hand.push(cardId);
      void i;
    }
    const before = s.runner.credits;
    const r = evalEffect({ state: s, sourceId: "gp" }, def.onPlay!);
    expect(r.ok).toBe(true);
    expect(s.runner.hand).toHaveLength(0);
    expect(s.runner.credits).toBe(before + 10);
  });

  it("Hydra subs branch on tagged vs untagged", () => {
    const def = getCardDef("hydra");
    expect(def.subroutines).toHaveLength(3);
    for (const sub of def.subroutines!) {
      expect(sub.effect.op).toBe("if");
      expect(JSON.stringify(sub.effect)).toContain("runner_tagged");
      expect(validateEffectTree(sub.effect)).toBeNull();
    }
    expect(JSON.stringify(def.subroutines![0].effect)).toContain("net_damage");
    expect(JSON.stringify(def.subroutines![1].effect)).toContain(
      "gain_credits",
    );
    expect(JSON.stringify(def.subroutines![2].effect)).toContain(
      "end_the_run",
    );
  });
});
