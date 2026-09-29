/**
 * RWR v0.91: Active Policing / Bring Them Home / Pretty Mary / Eye for an Eye / Valentina.
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
  assertCardsPinnedTag("v1.39.0");
});

describe("RWR v0.91 policing / breach / tags", () => {
  it("loads five clear cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of [
      "active-policing",
      "bring-them-home",
      "pretty-mary-da-silva",
      "eye-for-an-eye",
      "valentina-ferreira-carvalho",
    ]) {
      expect(catalog.get(id)!.unsupported ?? [], id).toEqual([]);
    }
  });

  it("Active Policing is terminal with steal/trash gate and click penalty", () => {
    const def = getCardDef("active-policing");
    expect(def.endsActionPhase).toBe(true);
    expect(def.playRequiresRunnerStoleOrTrashedCorpCardLastTurn).toBe(true);
    expect(validateEffectTree(def.onPlay!)).toBeNull();
    expect(JSON.stringify(def.onPlay)).toContain("allotted_clicks_next_turn");
  });

  it("Bring Them Home moves grip cards to stack top", () => {
    const def = getCardDef("bring-them-home");
    expect(def.endsActionPhase).toBe(true);
    expect(validateEffectTree(def.onPlay!)).toBeNull();
    expect(JSON.stringify(def.onPlay)).toContain("add_random_grip_to_stack_top");
  });

  it("Pretty Mary gates R&D bonus access on min allowed", () => {
    const def = getCardDef("pretty-mary-da-silva");
    expect(def.onBreachRdIfAccessGteMayBonusAccess).toEqual({
      min: 2,
      amount: 1,
    });
  });

  it("Eye for an Eye requires untagged and grants access trash", () => {
    const def = getCardDef("eye-for-an-eye");
    expect(def.playRequiresUntagged).toBe(true);
    expect(def.accessTrashFromGrip).toEqual({ gripCards: 1 });
    expect(def.runEvent?.servers).toBe("hq");
    expect(def.runEvent?.bonusAccess).toBe(1);
  });

  it("Valentina gains credits when tags are removed", () => {
    const def = getCardDef("valentina-ferreira-carvalho");
    expect(def.onRemoveTags).toEqual({
      op: "do",
      action: { kind: "gain_credits", side: "runner", amount: 1 },
    });
    expect(validateEffectTree(def.onRemoveTags!)).toBeNull();
    expect(validateEffectTree(def.onInstall!)).toBeNull();
  });
});
