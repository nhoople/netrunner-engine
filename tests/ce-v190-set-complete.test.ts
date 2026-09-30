/**
 * Cyber Exodus (ce) Genesis set-complete — floor v1.89.0 → v1.90.0.
 * 13/13 CE-only clears; 7 reprints absorbed. CR pin v26.03.
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

const CE_CLEARS = [
  "nerve-agent",
  "joshua-b",
  "muresh-bodysuit",
  "snitch",
  "personal-workshop",
  "public-sympathy",
  "viper",
  "edge-of-world",
  "sunset",
  "woodcutter",
  "commercialization",
  "private-contracts",
  "chimera",
] as const;

const CE_REPRINTS = [
  "emergency-shutdown",
  "chaos-theory-wunderkind",
  "test-run",
  "dinosaurus",
  "project-vitruvius",
  "marked-accounts",
  "pop-up-window",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.129.0");
});

describe("Cyber Exodus v1.90.0 set-complete", () => {
  it("declares cyber-exodus supported after trace-amount with 20 cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["cyber-exodus"].status).toBe("supported");
    expect(pool.waves["cyber-exodus"].cards).toHaveLength(20);
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
    expect(pool.waves["trace-amount"].status).toBe("supported");
  });

  it("clears all 13 CE-only cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of CE_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("cyber-exodus");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onRez) expect(validateEffectTree(def.onRez)).toBeNull();
      if (def.onAccess) expect(validateEffectTree(def.onAccess)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onSuccessfulRun) {
        expect(validateEffectTree(def.onSuccessfulRun)).toBeNull();
      }
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
      if (def.gainsSubroutinesPerAdvancement?.subroutine.effect) {
        expect(
          validateEffectTree(
            def.gainsSubroutinesPerAdvancement.subroutine.effect,
          ),
        ).toBeNull();
      }
    }
  });

  it("absorbs 7 reprints from earlier waves", () => {
    for (const id of CE_REPRINTS) {
      const def = getCardDef(id);
      expect(def.wave).not.toBe("cyber-exodus");
      expect(def.unsupported ?? []).toEqual([]);
    }
  });

  it("maps CE-specific fields and primitives", () => {
    expect(getCardDef("public-sympathy").handSizeBonus).toBe(2);
    expect(getCardDef("nerve-agent").chooseBonusAccessLessThanVirusOnHqBreach).toBe(
      true,
    );
    expect(
      getCardDef("snitch").mayExposeApproachedUnrezzedIceOncePerRunThenMayJackOut,
    ).toBe(true);
    expect(getCardDef("personal-workshop").personalWorkshop).toBe(true);
    expect(getCardDef("edge-of-world").onAccessRequiresInstalled).toBe(true);
    expect(getCardDef("woodcutter").canAdvance).toBe(true);
    expect(getCardDef("woodcutter").canAdvanceOnlyWhenRezzed).toBe(true);
    expect(getCardDef("woodcutter").gainsSubroutinesPerAdvancement).toBeTruthy();
    expect(getCardDef("chimera").derezAtAnyTurnEnd).toBe(true);
    expect(getCardDef("joshua-b").onTurnBegin).toMatchObject({
      op: "do",
      action: { kind: "may_gain_click_then_tag_at_turn_end" },
    });
    expect(getCardDef("sunset").onPlay).toMatchObject({
      op: "do",
      action: { kind: "choose_server_rearrange_ice" },
    });
    expect(getCardDef("commercialization").onPlay).toMatchObject({
      op: "do",
      action: { kind: "choose_ice_gain_credits_per_advancement" },
    });
    expect(getCardDef("chimera").onRez).toMatchObject({
      op: "do",
      action: { kind: "choose_one_subtype_until_derez" },
    });
    expect(getCardDef("edge-of-world").onAccess).toMatchObject({
      op: "do",
      action: {
        kind: "may_pay_credits_for_core_damage_per_ice_protecting_this_server",
        amount: 3,
      },
    });
    const viper = getCardDef("viper");
    expect(viper.subroutines).toHaveLength(2);
    expect(JSON.stringify(viper.subroutines)).toContain("lose_clicks");
    expect(JSON.stringify(viper.subroutines)).toContain("end_the_run");
    const priv = getCardDef("private-contracts");
    expect(priv.onRez).toMatchObject({
      op: "do",
      action: { kind: "place_hosted_credits", amount: 14 },
    });
    expect(JSON.stringify(priv.paidAbilities)).toContain("take_hosted_credits");
  });
});
