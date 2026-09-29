/**
 * System Core 2019 v1.68.0 H-slice: Priority Requisition / Neural EMP /
 * Haas-Bioroid: Stronger Together / NBN: Making News / Philotic Entanglement.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  boostTrace,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  effectiveIceStrength,
  fx,
  getCardDef,
  instantiateCard,
  loadCardCatalog,
  loadCardPool,
  startTrace,
  validateEffectTree,
} from "../src/index.js";
import { corpCreditsForTrace } from "../src/state/trace.js";

const CLEAR = [
  "priority-requisition",
  "neural-emp",
  "haas-bioroid-stronger-together",
  "nbn-making-news",
  "philotic-entanglement",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.68.0");
});

describe("System Core 2019 v1.68.0 H-slice", () => {
  it("declares at least 45 SC19-only clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["system-core-2019"].status).toBe("in-progress");
    let clear = 0;
    for (const id of pool.waves["system-core-2019"].cards) {
      const def = getCardDef(id);
      if ((def.unsupported ?? []).length === 0 && def.wave === "system-core-2019") {
        clear++;
      }
    }
    expect(clear).toBeGreaterThanOrEqual(45);
  });

  it("loads five clear H-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("system-core-2019");
    }
  });

  it("Priority Requisition may rez ice ignoring costs on score", () => {
    const def = getCardDef("priority-requisition");
    expect(def.onScore).toEqual(fx.rezIceIgnoringCosts());
    expect(validateEffectTree(def.onScore!)).toBeNull();
  });

  it("Neural EMP requires a Runner run last turn and deals 1 net", () => {
    const def = getCardDef("neural-emp");
    expect(def.playRequiresRunnerMadeRunLastTurn).toBe(true);
    expect(def.onPlay).toEqual(fx.netDamage(1));
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });

  it("Stronger Together grants +1 strength to bioroid ice", () => {
    const def = getCardDef("haas-bioroid-stronger-together");
    expect(def.iceStrengthBonusForSubtype).toEqual({
      subtype: "bioroid",
      bonus: 1,
    });

    const s = structuredClone(createInitialState());
    const id = instantiateCard(
      "haas-bioroid-stronger-together",
      "hb-id",
      "corp:hq",
    );
    s.cards["hb-id"] = id;
    s.corp.identityId = "hb-id";
    const ice = instantiateCard("eli-1-0", "eli", "server:hq:ice");
    ice.rezzed = true;
    s.cards["eli"] = ice;
    s.servers.hq.ice = ["eli"];
    expect(effectiveIceStrength(s, "eli")).toBe((ice.strength ?? 0) + 1);
  });

  it("Making News provides 2 recurring credits usable during traces", () => {
    const def = getCardDef("nbn-making-news");
    expect(def.recurringCreditsMax).toBe(2);
    expect(def.recurringSpendFor).toEqual(["trace"]);

    const s = structuredClone(createInitialState());
    const id = instantiateCard("nbn-making-news", "nbn-id", "corp:hq");
    id.recurringCredits = 2;
    s.cards["nbn-id"] = id;
    s.corp.identityId = "nbn-id";
    s.corp.credits = 0;
    expect(corpCreditsForTrace(s)).toBe(2);
    startTrace(s, "nbn-id", 3, fx.giveTags(1));
    expect(boostTrace(s, 2)).toBeNull();
    expect(id.recurringCredits).toBe(0);
    expect(s.trace!.corpSpent).toBe(2);
  });

  it("Philotic deals net equal to Runner scored agendas", () => {
    const def = getCardDef("philotic-entanglement");
    expect(def.deckLimit).toBe(1);
    expect(def.onScore).toEqual(fx.netDamagePerRunnerScoredAgenda());
    expect(validateEffectTree(def.onScore!)).toBeNull();

    const s = structuredClone(createInitialState());
    for (const id of ["a1", "a2"] as const) {
      const ag = instantiateCard("hostile-takeover", id, "runner:score");
      s.cards[id] = ag;
    }
    s.runner.score = ["a1", "a2"];
    for (const id of ["g1", "g2"] as const) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    }
    s.runner.hand = ["g1", "g2"];
    s.cards["philotic"] = instantiateCard(
      "philotic-entanglement",
      "philotic",
      "corp:score",
    );
    const r = evalEffect(
      { state: s, sourceId: "philotic" },
      fx.netDamagePerRunnerScoredAgenda(),
    );
    expect(r.ok).toBe(true);
    expect(s.runner.hand.length).toBe(0);
  });
});
