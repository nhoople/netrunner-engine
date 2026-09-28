/**
 * RWR v0.95: Holo Man / Isaac Liberdade / Kingmaking / Amelia / Cohort.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
  loadCardCatalog,
  validateEffectTree,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.32.0");
});

describe("RWR v0.95 Holo Man / Isaac / Kingmaking / Amelia / Cohort", () => {
  it("loads five clear cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of [
      "the-holo-man",
      "isaac-liberdade",
      "kingmaking",
      "amelia-earhart",
      "cohort-guidance-program",
    ]) {
      expect(catalog.get(id)!.unsupported ?? [], id).toEqual([]);
    }
  });

  it("Holo Man moves and places advancements on this server", () => {
    const def = getCardDef("the-holo-man");
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    expect(def.paidAbilities?.[0]?.oncePerTurn).toBe(true);
    expect(JSON.stringify(def.paidAbilities?.[0]?.effect)).toContain(
      "sameServerRootOrIceAsSource",
    );
  });

  it("Isaac boosts advanced ice and may move at turn end", () => {
    const def = getCardDef("isaac-liberdade");
    expect(def.advancedIceProtectingThisServerStrengthBonus).toBe(2);
    expect(validateEffectTree(def.onMovedToServerRoot!)).toBeNull();
    expect(validateEffectTree(def.onCorpTurnEnd!)).toBeNull();
  });

  it("Kingmaking draws up to 3 and may add a low-AP agenda", () => {
    const def = getCardDef("kingmaking");
    expect(validateEffectTree(def.onScore!)).toBeNull();
    expect(JSON.stringify(def.onScore)).toContain("draw_up_to");
    expect(JSON.stringify(def.onScore)).toContain(
      "may_add_hq_agenda_ap_lte_to_score",
    );
  });

  it("Amelia places power on heavy HQ/R&D access", () => {
    const def = getCardDef("amelia-earhart");
    expect(def.powerOnHqRdRunEndIfAccessedGte).toEqual({ min: 3, amount: 1 });
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
  });

  it("Cohort offers HQ trash or Archives faceup modes", () => {
    const def = getCardDef("cohort-guidance-program");
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    expect(JSON.stringify(def.onTurnBegin)).toContain("may_trash_hq_then");
    expect(JSON.stringify(def.onTurnBegin)).toContain(
      "may_turn_facedown_archives_faceup_then",
    );
  });
});
