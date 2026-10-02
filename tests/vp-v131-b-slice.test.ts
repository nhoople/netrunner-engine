/**
 * Vantage Point v1.31.0 B-slice: Luana / Let Them Dream / Editorial → 59/66.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";

const CLEAR = [
  "luana-campos",
  "let-them-dream",
  "editorial-division-ad-nihilum",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.143.0");
});

describe("Vantage Point v1.31.0 B-slice", () => {
  it("declares exactly 59 clear vantage-point cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["vantage-point"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["vantage-point"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(59);
  });

  it("loads three newly mapped cards clear", () => {
    for (const id of CLEAR) {
      expect(getCardDef(id).unsupported ?? [], id).toEqual([]);
    }
  });

  it("Luana hosts BP on turn begin and returns on uninstall", () => {
    const def = getCardDef("luana-campos");
    expect(def.returnHostedBadPublicityOnUninstall).toBe(true);
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    expect(JSON.stringify(def.onTurnBegin)).toContain("may_host_bad_publicity_then");
  });

  it("Let Them Dream lowers runner-score points and searches on score", () => {
    const def = getCardDef("let-them-dream");
    expect(def.agendaPointsModifierInRunnerScoreArea).toBe(-1);
    expect(validateEffectTree(def.onScore!)).toBeNull();
    expect(JSON.stringify(def.onScore)).toContain(
      "may_search_hq_rd_archives_agenda_to_hq_or_rd_bottom",
    );
  });

  it("Editorial searches R&D on first BP take", () => {
    const def = getCardDef("editorial-division-ad-nihilum");
    expect(validateEffectTree(def.onFirstBadPublicityTakeEachTurn!)).toBeNull();
    expect(JSON.stringify(def.onFirstBadPublicityTakeEachTurn)).toContain(
      "may_search_rd_non_agenda_any_subtype_to_hq",
    );
  });
});
