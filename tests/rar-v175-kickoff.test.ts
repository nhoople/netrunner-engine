/**
 * Reign and Reverie v1.75.0 kickoff: Fly on the Wall / Hyperloop Extension /
 * Hot Pursuit / Kyuban / Bankroll.
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
  loadCardCatalog,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";

const CLEAR = [
  "fly-on-the-wall",
  "hyperloop-extension",
  "hot-pursuit",
  "kyuban",
  "bankroll",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.102.0");
});

describe("Reign and Reverie v1.75.0 kickoff", () => {
  it("declares reign-and-reverie supported with 58 cards at corpus head", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["reign-and-reverie"].status).toBe("supported");
    expect(pool.waves["reign-and-reverie"].cards).toHaveLength(58);
    expect(pool.corpusOrder[0]).toBe("core");
    expect(pool.corpusOrder[1]).toBe("what-lies-ahead");
    expect(pool.corpusOrder[2]).toBe("trace-amount");
    expect(pool.corpusOrder[3]).toBe("cyber-exodus");
    expect(pool.corpusOrder[4]).toBe("a-study-in-static");
    expect(pool.corpusOrder[7]).toBe("creation-and-control");
    expect(pool.corpusOrder[8]).toBe("opening-moves");
    expect(pool.corpusOrder[9]).toBe("stalwart")
    expect(pool.corpusOrder[10]).toBe("mala-tempora");
    expect(pool.corpusOrder[11]).toBe("true-colors");
    expect(pool.corpusOrder[12]).toBe("fear-and-loathing");
    expect(pool.corpusOrder[13]).toBe("double-time");
    expect(pool.waves["system-core-2019"].status).toBe("supported");
  });

  it("declares at least 5 RaR-only clears", () => {
    const pool = loadCardPool(true);
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
    expect(clear).toBeGreaterThanOrEqual(5);
  });

  it("loads five kickoff clears with empty unsupported", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("reign-and-reverie");
    }
  });

  it("Fly on the Wall scores for a tag", () => {
    const def = getCardDef("fly-on-the-wall");
    expect(def.onScore).toEqual({
      op: "do",
      action: { kind: "give_tags", amount: 1 },
    });
    expect(validateEffectTree(def.onScore!)).toBeNull();
  });

  it("Hyperloop Extension gains 3¢ when scored or stolen", () => {
    const def = getCardDef("hyperloop-extension");
    expect(def.onAgendaScoredOrStolen).toEqual(fx.gainCredits("corp", 3));
    expect(validateEffectTree(def.onAgendaScoredOrStolen!)).toBeNull();
  });

  it("Hot Pursuit runs HQ for 9¢ + tag on success", () => {
    const def = getCardDef("hot-pursuit");
    expect(def.runEvent?.servers).toBe("hq");
    expect(JSON.stringify(def.runEvent?.onSuccessfulRun)).toContain(
      "gain_credits",
    );
    expect(JSON.stringify(def.runEvent?.onSuccessfulRun)).toContain(
      "give_tags",
    );
    expect(validateEffectTree(def.runEvent!.onSuccessfulRun!)).toBeNull();
  });

  it("Kyuban installs on ice and gains on pass host", () => {
    const def = getCardDef("kyuban");
    expect(def.installOnIce).toBe(true);
    expect(def.onPassHost).toEqual(fx.gainCredits("runner", 2));
    expect(validateEffectTree(def.onPassHost!)).toBeNull();
  });

  it("Bankroll may place hosted ¢; trash takes all", () => {
    const def = getCardDef("bankroll");
    expect(JSON.stringify(def.onSuccessfulRun)).toContain(
      "place_hosted_credits",
    );
    expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
    const ab = def.paidAbilities![0]!;
    expect(ab.cost).toEqual({ trashSelf: true });
    expect(JSON.stringify(ab.effect)).toContain("take_hosted_credits");
    expect(validateEffectTree(ab.effect)).toBeNull();

    const s = structuredClone(createInitialState());
    const br = instantiateCard("bankroll", "br", "runner:rig");
    br.hostedCredits = 3;
    s.cards["br"] = br;
    s.runner.rig.push("br");
    const before = s.runner.credits;
    const r = evalEffect(
      { state: s, sourceId: "br" },
      { op: "do", action: { kind: "take_hosted_credits", amount: 99 } },
    );
    expect(r.ok).toBe(true);
    expect(s.runner.credits).toBe(before + 3);
  });
});
