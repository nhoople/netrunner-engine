/**
 * Vantage Point v1.25.0 B-slice: Hiram / The Red Room / Nihilo Agent → 42/66.
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
  "hiram-0mission-svensson-shadow-of-the-past",
  "the-red-room",
  "nihilo-agent",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.53.0");
});

describe("Vantage Point v1.25.0 B-slice", () => {
  it("declares at least 42 clear vantage-point cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["vantage-point"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["vantage-point"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(42);
  });

  it("loads three newly mapped cards clear", () => {
    for (const id of CLEAR) {
      expect(getCardDef(id).unsupported ?? [], id).toEqual([]);
      expect(getCardDef(id).wave).toBe("vantage-point");
    }
  });

  it("Hiram looks at R&D on hardware install/trash", () => {
    const def = getCardDef("hiram-0mission-svensson-shadow-of-the-past");
    expect(validateEffectTree(def.onHardwareInstallOrTrash!)).toBeNull();
    expect(JSON.stringify(def.onHardwareInstallOrTrash)).toContain(
      "look_top_n_rd_peek",
    );
  });

  it("Red Room is central-only with other-server ETR", () => {
    const def = getCardDef("the-red-room");
    expect(def.installServers).toEqual(["hq", "rd", "archives"]);
    expect(JSON.stringify(def.onFirstAgendaScoredOrStolenThisTurn)).toContain(
      "add_power_counter",
    );
    expect(def.paidAbilities?.[0]?.requireOtherServer).toBe(true);
    expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();
  });

  it("Nihilo Agent cycles tags/BP with power trash", () => {
    const def = getCardDef("nihilo-agent");
    expect(def.trashWhenPowerEmpty).toBe(true);
    expect(validateEffectTree(def.onRez!)).toBeNull();
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    expect(validateEffectTree(def.onDiscardPhaseEnd!)).toBeNull();
  });
});
