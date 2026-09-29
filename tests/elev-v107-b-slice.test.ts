/**
 * Elevation v1.07.0: Ingatan hub / Reporting / Sericulture / Side Hustle /
 * LEO / Synapse / PT Untaian / Off the Books.
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
  "project-ingatan",
  "embedded-reporting",
  "sericulture-expansion",
  "side-hustle",
  "leo-construction-labor-solutions",
  "synapse-global-faster-than-thought",
  "pt-untaian-lifes-building-blocks",
  "off-the-books",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.68.0");
});

describe("Elevation v1.07.0 B-slice", () => {
  it("declares 47 clear elevation cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["elevation"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["elevation"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(47);
  });

  it("loads eight newly mapped cards clear", () => {
    for (const id of CLEAR) {
      expect(getCardDef(id).unsupported ?? [], id).toEqual([]);
    }
  });

  it("Project Ingatan discard-phase hub uses agenda counters + Archives install", () => {
    const c = getCardDef("project-ingatan");
    expect(JSON.stringify(c.onScore)).toContain(
      "add_agenda_counters_from_overadvance",
    );
    expect(JSON.stringify(c.onDiscardPhaseEnd)).toContain("agenda_counters_gte");
    expect(JSON.stringify(c.onDiscardPhaseEnd)).toContain(
      "remove_agenda_counters",
    );
    expect(JSON.stringify(c.onDiscardPhaseEnd)).toContain(
      "may_install_from_archives_ignore_costs",
    );
    expect(validateEffectTree(c.onDiscardPhaseEnd!)).toBeNull();
  });

  it("Embedded Reporting dividends 2 + search operation to top", () => {
    const c = getCardDef("embedded-reporting");
    expect(JSON.stringify(c.onScore)).toContain("countersPerExcess");
    expect(JSON.stringify(c.onDiscardPhaseEnd)).toContain(
      "search_rd_operation_to_top_rd",
    );
  });

  it("Sericulture chooses advancements with cannot-score-this-turn", () => {
    const c = getCardDef("sericulture-expansion");
    expect(JSON.stringify(c.onDiscardPhaseEnd)).toContain('"pick":"choose"');
    expect(JSON.stringify(c.onDiscardPhaseEnd)).toContain(
      "cannotScoreTargetThisTurn",
    );
  });

  it("Side Hustle credits on install/run begin and hosted threshold", () => {
    const c = getCardDef("side-hustle");
    expect(c.drawOnHostedEmpty).toBe(1);
    expect(c.onHostedCreditsGte?.amount).toBe(6);
    expect(JSON.stringify(c.onInstall)).toContain("place_hosted_credits");
    expect(JSON.stringify(c.onRunBegin)).toContain("place_hosted_credits");
    expect(JSON.stringify(c.onHostedCreditsGte?.effect)).toContain(
      "take_hosted_credits",
    );
  });

  it("LEO mandatory trash bioroid on attacked server then ETR", () => {
    const ab = getCardDef("leo-construction-labor-solutions").paidAbilities?.[0];
    expect(ab?.oncePerTurn).toBe(true);
    expect(JSON.stringify(ab?.effect)).toContain("trash_installed");
    expect(JSON.stringify(ab?.effect)).toContain("bioroid");
    expect(JSON.stringify(ab?.effect)).toContain("end_the_run");
  });

  it("Synapse fires onRemoveTags from identity + HQ install ignore costs", () => {
    const c = getCardDef("synapse-global-faster-than-thought");
    expect(c.onRemoveTags).toBeDefined();
    expect(JSON.stringify(c.onRemoveTags)).toContain(
      "may_install_from_hq_ignore_costs",
    );
    expect(validateEffectTree(c.onRemoveTags!)).toBeNull();
  });

  it("PT Untaian HQ gate + unrezzed place advancements", () => {
    const c = getCardDef("pt-untaian-lifes-building-blocks");
    expect(JSON.stringify(c.onDiscardPhaseEnd)).toContain("hq_count_lte");
    expect(JSON.stringify(c.onDiscardPhaseEnd)).toContain("unrezzedOnly");
    expect(JSON.stringify(c.onDiscardPhaseEnd)).toContain(
      "cannotScoreTargetThisTurn",
    );
  });

  it("Off the Books search reveal install-or-HQ", () => {
    const c = getCardDef("off-the-books");
    expect(JSON.stringify(c.onDiscardPhaseEnd)).toContain(
      "search_rd_reveal_may_install_ignore_costs_else_hq",
    );
  });
});
