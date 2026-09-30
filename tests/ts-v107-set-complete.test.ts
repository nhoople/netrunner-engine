/**
 * The Source (ts) set-complete — floor v1.106.0 → v1.107.0.
 * 19/19 TS-only clears. CR pin v26.03.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
  loadCardCatalog,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";

const TS_CLEARS = [
  "helium-3-deposit",
  "errand-boy",
  "it-department",
  "markus-1-0",
  "industrial-genomics-growing-solutions",
  "turtlebacks",
  "shoot-the-moon",
  "troll",
  "virgo",
  "utopia-fragment",
  "excalibur",
  "self-destruct",
  "incubator",
  "ixodidae",
  "code-siphon",
  "collective-consciousness",
  "sage",
  "bribery",
  "au-revoir",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.112.0");
});

describe("The Source v1.107.0 set-complete", () => {
  it("declares the-source supported after all-that-remains with 19 clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["the-source"].status).toBe("supported");
    expect(pool.waves["the-source"].cards).toHaveLength(20);
    expect(pool.corpusOrder[19]).toBe("all-that-remains");
    expect(pool.corpusOrder[20]).toBe("the-source");
    expect(pool.corpusOrder[21]).toBe("order-and-chaos");
    expect(pool.corpusOrder[22]).toBe("the-valley");
    expect(pool.corpusOrder[23]).toBe("breaker-bay");
    expect(pool.corpusOrder[24]).toBe("chrome-city");
    expect(pool.corpusOrder[25]).toBe("the-underway");
    expect(pool.corpusOrder[26]).toBe("reign-and-reverie");
  });

  it("clears all 19 TS cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of TS_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("the-source");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onEncounter) expect(validateEffectTree(def.onEncounter)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onInstall) expect(validateEffectTree(def.onInstall)).toBeNull();
      if (def.onTrash) expect(validateEffectTree(def.onTrash)).toBeNull();
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
      if (def.runEvent?.onSuccessfulRun) {
        expect(validateEffectTree(def.runEvent.onSuccessfulRun)).toBeNull();
      }
    }
  });

  it("wires key TS fields", () => {
    loadCardCatalog(true);
    expect(
      getCardDef("industrial-genomics-growing-solutions")
        .trashCostIncreasePerFacedownArchivesCard,
    ).toBe(1);
    expect(getCardDef("turtlebacks").gainCreditsOnCreateServer).toBe(1);
    expect(
      getCardDef("utopia-fragment").whileScoredStealAdditionalCreditsPerAdvancement,
    ).toBe(2);
    expect(getCardDef("ixodidae").trashOnVirusPurge).toBe(true);
    expect(getCardDef("ixodidae").gainCreditsWhenCorpLosesCredits).toBe(1);
    expect(getCardDef("collective-consciousness").drawWhenCorpRezzesIce).toBe(1);
    expect(getCardDef("sage").strengthBonusPerUnusedMu).toBe(1);
    expect(getCardDef("bribery").briberyPlayCostX).toBe(true);
    expect(getCardDef("au-revoir").gainCreditsOnJackOut).toBe(1);
    expect(getCardDef("self-destruct").remoteOnly).toBe(true);
    expect(getCardDef("shoot-the-moon").playAdditionalClick).toBe(true);
    expect(getCardDef("excalibur").subroutines?.[0]?.effect).toEqual({
      op: "do",
      action: { kind: "forbid_runner_runs_this_turn" },
    });
  });
});
