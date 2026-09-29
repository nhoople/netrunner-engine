/**
 * Elevation v1.06.0: Topan / KPI / Open Market / Gourmand.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
  loadCardPool,
} from "../src/index.js";

const CLEAR = [
  "topan-ormas-leader",
  "key-performance-indicators",
  "open-market",
  "gourmand",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.77.0");
});

describe("Elevation v1.06.0 B-slice", () => {
  it("declares pool-wide clear elevation cards (includes later slices)", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["elevation"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["elevation"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    // Floor at this slice; later pins raise the pool-wide clear count.
    expect(clear).toBeGreaterThanOrEqual(39);
  });

  it("loads four newly mapped cards clear", () => {
    for (const id of CLEAR) {
      expect(getCardDef(id).unsupported ?? [], id).toEqual([]);
    }
  });

  it("Topan installs from grip with thenOnInstall meat", () => {
    const ab = getCardDef("topan-ormas-leader").paidAbilities?.[0];
    expect(ab?.oncePerTurn).toBe(true);
    expect(JSON.stringify(ab?.effect)).toContain("thenOnInstall");
    expect(JSON.stringify(ab?.effect)).toContain("meat_damage");
  });

  it("KPI chooses exactly 2 including ice install ignore costs", () => {
    const onPlay = getCardDef("key-performance-indicators").onPlay;
    expect(JSON.stringify(onPlay)).toContain("choose_exactly_n");
    expect(JSON.stringify(onPlay)).toContain(
      "install_ice_from_hq_ignore_costs",
    );
  });

  it("Open Market hosts install credits for connection/job only", () => {
    const c = getCardDef("open-market");
    expect(c.hostedCreditsOnInstall).toBe(6);
    expect(c.hostedCreditsSpendFor).toEqual(["install"]);
    expect(c.hostedCreditsSpendForInstallSubtypes).toEqual([
      "connection",
      "job",
    ]);
  });

  it("Gourmand access-trashes self for non-agenda then draw", () => {
    expect(getCardDef("gourmand").accessTrashSelfNonAgendaThenDraw).toBe(true);
  });
});
