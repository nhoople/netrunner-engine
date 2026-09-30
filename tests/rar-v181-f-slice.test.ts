/**
 * Reign and Reverie v1.81.0 F-slice: Meridian / Giordano Memorial Field /
 * Broad Daylight / Thunder Art Gallery / Algernon.
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

const CLEAR = [
  "meridian",
  "giordano-memorial-field",
  "broad-daylight",
  "thunder-art-gallery",
  "algernon",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.87.0");
});

describe("Reign and Reverie v1.81.0 F-slice", () => {
  it("declares reign-and-reverie supported with at least 35 RaR-only clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["reign-and-reverie"].status).toBe("supported");
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
    expect(clear).toBeGreaterThanOrEqual(35);
  });

  it("loads five clear F-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("reign-and-reverie");
    }
  });

  it("Meridian offers score-as-−1 or gain 4¢ + ETR", () => {
    const def = getCardDef("meridian");
    const sub = def.subroutines?.[0];
    expect(sub?.effect?.op).toBe("choose");
    expect(JSON.stringify(sub?.effect)).toContain("add_to_runner_score_as_agenda");
    expect(JSON.stringify(sub?.effect)).toContain("end_the_run");
    expect(validateEffectTree(sub!.effect)).toBeNull();
  });

  it("Giordano Memorial Field ETRs unless pay per Runner scored agenda", () => {
    const def = getCardDef("giordano-memorial-field");
    expect(def.onSuccessfulRun).toEqual({
      op: "do",
      action: {
        kind: "end_the_run_unless_pay_credits_per_runner_scored_agenda",
        creditsPer: 2,
      },
    });
    expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
  });

  it("Broad Daylight may take BP then agenda counters; meat paid ability", () => {
    const def = getCardDef("broad-daylight");
    expect(def.onScore).toEqual({
      op: "do",
      action: {
        kind: "may_take_bad_publicity_then_add_agenda_counters_equal_to_bad_publicity",
        amount: 1,
      },
    });
    expect(validateEffectTree(def.onScore!)).toBeNull();
    const ab = def.paidAbilities?.find((a) => a.id === "broad-daylight-meat");
    expect(ab?.oncePerTurn).toBe(true);
    expect(ab?.cost?.agendaCounters).toBe(1);
    expect(JSON.stringify(ab?.effect)).toContain("meat_damage");
  });

  it("Thunder Art Gallery installs discounted on first avoid/remove tag", () => {
    const def = getCardDef("thunder-art-gallery");
    expect(def.onFirstAvoidOrRemoveTagThisTurn).toBeTruthy();
    expect(JSON.stringify(def.onFirstAvoidOrRemoveTagThisTurn)).toContain(
      "install_from_grip_discount",
    );
    expect(validateEffectTree(def.onFirstAvoidOrRemoveTagThisTurn!)).toBeNull();
  });

  it("Algernon may pay for a click that risks turn-end trash", () => {
    const def = getCardDef("algernon");
    expect(def.onTurnBegin).toEqual({
      op: "do",
      action: {
        kind: "may_pay_credits_gain_click_trash_at_turn_end_if_no_successful_run",
        credits: 2,
      },
    });
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
  });
});
