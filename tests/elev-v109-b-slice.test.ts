/**
 * Elevation v1.09.0: Touch-ups / Knickknack / Barry / Proprionegation /
 * Mycoweb / Mahkota.
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
  "touch-ups",
  "knickknack-obrian",
  "barry-baz-wong-tri-maf-veteran",
  "proprionegation",
  "mycoweb",
  "mahkota-langit-grid",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.84.0");
});

describe("Elevation v1.09.0 B-slice", () => {
  it("declares 60 clear elevation cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["elevation"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["elevation"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(60);
  });

  it("loads six newly mapped cards clear", () => {
    for (const id of CLEAR) {
      expect(getCardDef(id).unsupported ?? [], id).toEqual([]);
    }
  });

  it("Touch-ups additional click + advancements + grip shuffle IR", () => {
    const c = getCardDef("touch-ups");
    expect(c.playAdditionalClick).toBe(true);
    expect(JSON.stringify(c.onPlay)).toContain("place_advancements");
    expect(JSON.stringify(c.onPlay)).toContain("touch_ups_choose_type_shuffle_grip");
    expect(validateEffectTree(c.onPlay!)).toBeNull();
  });

  it("Knickknack first run begin trash-other printed install draw", () => {
    const c = getCardDef("knickknack-obrian");
    expect(JSON.stringify(c.onFirstRunBeginThisTurn)).toContain(
      "may_trash_other_installed_gain_printed_install_and_draw",
    );
  });

  it("Barry onAnyIceRez may install resource/hardware from grip", () => {
    const c = getCardDef("barry-baz-wong-tri-maf-veteran");
    expect(JSON.stringify(c.onAnyIceRez)).toContain("may_install_from_grip");
    expect(JSON.stringify(c.onAnyIceRez)).toContain("hardware");
  });

  it("Proprionegation agenda counter + Archives reposition paid ability", () => {
    const c = getCardDef("proprionegation");
    expect(JSON.stringify(c.onScore)).toContain("add_agenda_counter");
    expect(c.paidAbilities?.[0]?.requireDuringRun).toBe(true);
    expect(JSON.stringify(c.paidAbilities?.[0]?.effect)).toContain(
      "move_runner_to_archives_outermost",
    );
  });

  it("Mycoweb four subroutines (Archives install, rez discount, resolve subs)", () => {
    const c = getCardDef("mycoweb");
    expect(c.subroutines?.length).toBe(4);
    const s = JSON.stringify(c.subroutines);
    expect(s).toContain("may_install_from_archives_ignore_costs");
    expect(s).toContain("may_rez_installed_ice_discount");
    expect(s).toContain("may_resolve_subroutine_on_rezzed_ice");
  });

  it("Mahkota recurring + persistent + root trash bonus", () => {
    const c = getCardDef("mahkota-langit-grid");
    expect(c.recurringCreditsMax).toBe(2);
    expect(c.recurringSpendFor).toEqual(["rez_host_server"]);
    expect(c.persistent).toBe(true);
    expect(c.serverRootAssetTrashCostBonus).toBe(2);
  });
});
