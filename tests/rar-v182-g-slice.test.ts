/**
 * Reign and Reverie v1.82.0 G-slice: Arella Salvatore / Divert Power /
 * Lady Liberty / Psych Mike / Otoroshi.
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
  "arella-salvatore",
  "divert-power",
  "lady-liberty",
  "psych-mike",
  "otoroshi",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.131.0");
});

describe("Reign and Reverie v1.82.0 G-slice", () => {
  it("declares reign-and-reverie supported with at least 40 RaR-only clears", () => {
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
    expect(clear).toBeGreaterThanOrEqual(40);
  });

  it("loads five clear G-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("reign-and-reverie");
    }
  });

  it("Arella Salvatore installs from HQ with advancement on score from server", () => {
    const def = getCardDef("arella-salvatore");
    expect(def.onAgendaScoredFromThisServer).toEqual({
      op: "do",
      action: {
        kind: "may_install_from_hq_ignore_costs_then_place_advancements",
        amount: 1,
      },
    });
    expect(validateEffectTree(def.onAgendaScoredFromThisServer!)).toBeNull();
  });

  it("Divert Power derezzes any then may rez with per-derez discount", () => {
    const def = getCardDef("divert-power");
    expect(def.onPlay).toEqual({
      op: "do",
      action: {
        kind: "derez_any_number_then_may_rez_discount_per",
        creditsPerDerezzed: 3,
      },
    });
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });

  it("Lady Liberty places power on turn begin; paid ability scores HQ agenda", () => {
    const def = getCardDef("lady-liberty");
    expect(def.onTurnBegin).toEqual({
      op: "do",
      action: { kind: "add_power_counter", amount: 1 },
    });
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    const ab = def.paidAbilities?.find((a) => a.id === "lady-liberty-score");
    expect(ab?.cost?.clicks).toBe(3);
    expect(JSON.stringify(ab?.effect)).toContain(
      "add_agenda_from_hq_to_score_worth_exact_hosted_power",
    );
    expect(validateEffectTree(ab!.effect)).toBeNull();
  });

  it("Psych Mike may gain credits per R&D access on first successful R&D run end", () => {
    const def = getCardDef("psych-mike");
    expect(def.onFirstSuccessfulRunOnRdEndsThisTurn).toBeTruthy();
    expect(JSON.stringify(def.onFirstSuccessfulRunOnRdEndsThisTurn)).toContain(
      "gain_credits_equal_to_rd_accesses_this_run",
    );
    expect(
      validateEffectTree(def.onFirstSuccessfulRunOnRdEndsThisTurn!),
    ).toBeNull();
  });

  it("Otoroshi places advancements then accesses unless pay", () => {
    const def = getCardDef("otoroshi");
    const sub = def.subroutines?.[0];
    expect(sub?.effect).toEqual({
      op: "do",
      action: {
        kind: "may_place_up_to_advancements_on_remote_root_then_access_unless_pay",
        maxAdvancements: 3,
        credits: 3,
      },
    });
    expect(validateEffectTree(sub!.effect)).toBeNull();
  });
});
