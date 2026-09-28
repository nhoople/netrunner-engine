/**
 * RWR v0.96: Business As Usual / Tributary / Meeting of Minds / Manuel / Window.
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
  assertCardsPinnedTag("v1.01.0");
});

describe("RWR v0.96 Business / Tributary / Meeting / Manuel / Window", () => {
  it("loads five clear cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of [
      "business-as-usual",
      "tributary",
      "meeting-of-minds",
      "manuel-lattes-de-moura",
      "window-of-opportunity",
    ]) {
      expect(catalog.get(id)!.unsupported ?? [], id).toEqual([]);
    }
  });

  it("Business As Usual offers advancements or virus purge (+threat)", () => {
    const def = getCardDef("business-as-usual");
    expect(validateEffectTree(def.onPlay!)).toBeNull();
    expect(JSON.stringify(def.onPlay)).toContain("place_advancements_on_up_to");
    expect(JSON.stringify(def.onPlay)).toContain(
      "remove_all_virus_from_one_installed",
    );
    expect(JSON.stringify(def.onPlay)).toContain('"op":"threat"');
  });

  it("Tributary moves on first run begin and fortifies", () => {
    const def = getCardDef("tributary");
    expect(validateEffectTree(def.onFirstRunBeginThisTurn!)).toBeNull();
    expect(JSON.stringify(def.onFirstRunBeginThisTurn)).toContain(
      "move_source_ice_to_outermost_attacked",
    );
    expect(def.subroutines?.length).toBe(2);
    expect(validateEffectTree(def.subroutines![0]!.effect!)).toBeNull();
    expect(validateEffectTree(def.subroutines![1]!.effect!)).toBeNull();
    expect(JSON.stringify(def.subroutines)).toContain("fortify_all_ice");
  });

  it("Meeting of Minds resolves connection or virtual search", () => {
    const def = getCardDef("meeting-of-minds");
    expect(validateEffectTree(def.onPlay!)).toBeNull();
    expect(JSON.stringify(def.onPlay)).toContain("meeting_of_minds_resolve");
  });

  it("Manuel grants tagged HQ/R&D access and threat trash cost", () => {
    const def = getCardDef("manuel-lattes-de-moura");
    expect(def.bonusAccessOnHqRdBreachWhileTagged).toBe(1);
    expect(def.threatBasicTrashAdditionalCostTrashHq).toBe(3);
  });

  it("Window may install then derez/rez on the run", () => {
    const def = getCardDef("window-of-opportunity");
    expect(validateEffectTree(def.onPlay!)).toBeNull();
    expect(JSON.stringify(def.onPlay)).toContain("may_install_from_grip");
    expect(def.runEvent?.derezProtectingIceOnRunBegin).toBe(true);
    expect(def.runEvent?.mayRezEventDerezzedIceOnRunEndIgnoreCosts).toBe(true);
  });
});
