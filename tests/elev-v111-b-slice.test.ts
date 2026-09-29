/**
 * Elevation v1.11.0: Mitra Aman / Bigger Picture / Aggressive Trendsetting /
 * Plutus / IP Enforcement / Maintenance Access.
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
  "mitra-aman",
  "bigger-picture",
  "aggressive-trendsetting",
  "plutus",
  "ip-enforcement",
  "maintenance-access",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.36.0");
});

describe("Elevation v1.11.0 B-slice", () => {
  it("declares 72 clear elevation cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["elevation"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["elevation"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(72);
  });

  it("loads six newly mapped cards clear", () => {
    for (const id of CLEAR) {
      expect(getCardDef(id).unsupported ?? [], id).toEqual([]);
    }
  });

  it("Mitra Aman onApproachIce may trash + swap primitive", () => {
    const c = getCardDef("mitra-aman");
    expect(JSON.stringify(c.onApproachIce)).toContain("mitra_aman_approach_ice");
    expect(validateEffectTree(c.onApproachIce!)).toBeNull();
  });

  it("Bigger Picture tagged gate + remove-tags mode", () => {
    const c = getCardDef("bigger-picture");
    expect(c.playRequiresTagged).toBe(true);
    expect(JSON.stringify(c.onPlay)).toContain("bigger_picture_remove_tags");
    expect(validateEffectTree(c.onPlay!)).toBeNull();
  });

  it("Aggressive Trendsetting scored hook + corp allotted click", () => {
    const c = getCardDef("aggressive-trendsetting");
    expect(JSON.stringify(c.onFirstCorpCardTrashEachTurn)).toContain(
      "allotted_clicks_next_turn",
    );
    expect(validateEffectTree(c.onFirstCorpCardTrashEachTurn!)).toBeNull();
  });

  it("Plutus rez additional cost + Archives transaction on turn begin", () => {
    const c = getCardDef("plutus");
    expect(JSON.stringify(c.rezAdditionalCost)).toContain(
      "plutus_pay_rez_additional_cost",
    );
    expect(JSON.stringify(c.onTurnBegin)).toContain(
      "plutus_may_play_transaction_from_archives",
    );
  });

  it("IP Enforcement tag-cost + install from Runner score", () => {
    const c = getCardDef("ip-enforcement");
    expect(JSON.stringify(c.playAdditionalCost)).toContain(
      "ip_enforcement_remove_tags",
    );
    expect(JSON.stringify(c.onPlay)).toContain(
      "ip_enforcement_install_from_runner_score",
    );
  });

  it("Maintenance Access click + Archives→HQ approach redirect", () => {
    const c = getCardDef("maintenance-access");
    expect(c.playAdditionalClick).toBe(true);
    expect(c.runEvent?.redirectApproachArchivesToHq).toBe(true);
    expect(c.runEvent?.servers).toBe("archives");
  });
});
