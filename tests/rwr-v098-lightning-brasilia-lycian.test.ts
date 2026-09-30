/**
 * RWR v0.98: Eminent Domain / Lightning Laboratory / Brasília /
 * Thunderbolt Armaments / Lycian Multi-Munition.
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
  assertCardsPinnedTag("v1.106.0");
});

describe("RWR v0.98 Eminent / Lightning / Brasília / Thunderbolt / Lycian", () => {
  it("loads five clear cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of [
      "eminent-domain",
      "lightning-laboratory",
      "brasilia-government-grid",
      "thunderbolt-armaments-peace-through-power",
      "lycian-multi-munition",
    ]) {
      expect(catalog.get(id)!.unsupported ?? [], id).toEqual([]);
    }
  });

  it("Eminent Domain expend and onScore trees", () => {
    const def = getCardDef("eminent-domain");
    expect(def.paidAbilities?.[0]?.usableFromHq).toBe(true);
    expect(validateEffectTree(def.paidAbilities![0]!.effect!)).toBeNull();
    expect(JSON.stringify(def.paidAbilities)).toContain(
      "may_install_and_rez_from_hq",
    );
    expect(validateEffectTree(def.onScore!)).toBeNull();
    expect(JSON.stringify(def.onScore)).toContain(
      "may_search_rd_install_rez_ignore_costs",
    );
  });

  it("Lightning Laboratory counters and run-begin / end-turn hooks", () => {
    const def = getCardDef("lightning-laboratory");
    expect(validateEffectTree(def.onScore!)).toBeNull();
    expect(JSON.stringify(def.onScore)).toContain("add_agenda_counter");
    expect(
      def.onRunBeginMaySpendAgendaCounterRezUpToIceProtectingAttacked,
    ).toEqual({ maxIce: 2 });
    expect(
      def.onCorpTurnEndDerezUpToIceProtectingLightningServer,
    ).toEqual({ maxIce: 2 });
  });

  it("Brasília once-per-turn rez-during-run hook", () => {
    const def = getCardDef("brasilia-government-grid");
    expect(def.oncePerTurnOnRezIceProtectingThisServerDuringRun).toEqual({
      mayDerezOtherIceForStrengthBonus: 3,
    });
  });

  it("Thunderbolt identity AP/destroyer hook", () => {
    const def = getCardDef("thunderbolt-armaments-peace-through-power");
    expect(def.onRezApOrDestroyerIceDuringRun).toEqual({
      strengthBonus: 1,
      gainEtrUnlessTrashInstalledSub: true,
    });
  });

  it("Lycian chooses subtypes on rez and derezzes any turn end", () => {
    const def = getCardDef("lycian-multi-munition");
    expect(validateEffectTree(def.onRez!)).toBeNull();
    expect(JSON.stringify(def.onRez)).toContain("lycian_choose_subtypes");
    expect(def.derezAtAnyTurnEnd).toBe(true);
    expect(def.subroutines?.length).toBe(3);
    expect(JSON.stringify(def.subroutines)).toContain("source_has_subtype");
  });
});
