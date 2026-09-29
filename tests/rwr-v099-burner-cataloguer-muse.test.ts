/**
 * RWR v0.99: Burner / Cataloguer / Muse / Jeitinho / The Wizard's Chest.
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
  assertCardsPinnedTag("v1.43.0");
});

describe("RWR v0.99 Burner / Cataloguer / Muse / Jeitinho / Wizard's Chest", () => {
  it("loads five clear cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of [
      "burner",
      "cataloguer",
      "muse",
      "jeitinho",
      "the-wizard-s-chest",
    ]) {
      expect(catalog.get(id)!.unsupported ?? [], id).toEqual([]);
    }
  });

  it("Burner runEvent skipBreach + burner_resolve", () => {
    const def = getCardDef("burner");
    expect(def.runEvent?.servers).toBe("hq");
    expect(def.runEvent?.skipBreach).toBe(true);
    expect(validateEffectTree(def.runEvent!.onSuccessfulRun!)).toBeNull();
    expect(JSON.stringify(def.runEvent!.onSuccessfulRun)).toContain(
      "burner_resolve",
    );
  });

  it("Cataloguer arrange + paid breach gates", () => {
    const def = getCardDef("cataloguer");
    expect(def.powerCountersOnInstall).toBe(2);
    expect(def.trashWhenPowerEmpty).toBe(true);
    expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
    expect(JSON.stringify(def.onSuccessfulRun)).toContain("set_run_skip_breach");
    expect(JSON.stringify(def.onSuccessfulRun)).toContain(
      "look_top_n_rd_arrange",
    );
    const ab = def.paidAbilities![0]!;
    expect(ab.requiresSuccessfulRdRunThisTurn).toBe(true);
    expect(validateEffectTree(ab.effect)).toBeNull();
    expect(JSON.stringify(ab.effect)).toContain("breach_server_standalone");
  });

  it("Muse daemonHost + onInstall search", () => {
    const def = getCardDef("muse");
    expect(def.daemonHost).toBe(true);
    expect(def.subtypes).toContain("daemon");
    expect(validateEffectTree(def.onInstall!)).toBeNull();
    expect(JSON.stringify(def.onInstall)).toContain(
      "muse_search_install_non_daemon",
    );
  });

  it("Jeitinho all-centrals score + heap bypass", () => {
    const def = getCardDef("jeitinho");
    expect(validateEffectTree(def.onRunnerTurnEnd!)).toBeNull();
    expect(JSON.stringify(def.onRunnerTurnEnd)).toContain(
      "successful_all_centrals_this_turn",
    );
    expect(JSON.stringify(def.onRunnerTurnEnd)).toContain("assassination");
    expect(JSON.stringify(def.onRunnerTurnEnd)).toContain(
      "check_assassination_win",
    );
    expect(def.onBypassMayInstallFromHeap).toEqual({
      requiresThreat: 3,
      clickCost: 1,
    });
  });

  it("Wizard's Chest all-centrals paid ability", () => {
    const def = getCardDef("the-wizard-s-chest");
    const ab = def.paidAbilities![0]!;
    expect(ab.requiresSuccessfulAllCentralsThisTurn).toBe(true);
    expect(ab.cost?.trashSelf).toBe(true);
    expect(validateEffectTree(ab.effect)).toBeNull();
    expect(JSON.stringify(ab.effect)).toContain("wizard_chest_resolve");
  });
});
