/**
 * up-and-over play tests.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  createInitialState,
  evalEffect,
  getCardDef,
  instantiateCard,
  loadCardCatalog,
} from "../src/index.js";

describe("up-and-over", () => {
  describe("uao-v105-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.13");
  });

  describe("Up and Over v1.105.0 set-complete", () => {

    it("wires key UAO fields", () => {
      loadCardCatalog(true);
      expect(getCardDef("architect").playersCannotTrashThisIce).toBe(true);
      expect(getCardDef("ashigaru").dynamicEtrSubroutineCountFromCorpHandSize).toBe(
        true,
      );
      expect(getCardDef("switchblade").paidAbilitiesUseStealthCreditsOnly).toBe(
        true,
      );
      expect(getCardDef("origami").handSizeBonusPerInstalledCopyWithSameDefId).toBe(
        1,
      );
      expect(getCardDef("docklands-crackdown").runnerFirstInstallCostIncreasePerPowerCounterOnThis).toBe(
        1,
      );
    });

    it("Angel Arena places X power counters, capped only by credits (CR 1.2.1)", () => {
      const s = createInitialState();
      const arena = instantiateCard("angel-arena", "angel-1", "runner:installed");
      s.cards["angel-1"] = arena;
      s.runner.installed = ["angel-1"];
      s.runner.credits = 15;
      const r = evalEffect(
        { state: s, sourceId: "angel-1" },
        getCardDef("angel-arena").onInstall!,
      );
      expect(r.ok).toBe(true);
      expect(s.pendingChoice?.options).toHaveLength(16);
      const chosen = applyAction(s, { type: "choose_option", optionId: "angel-x:12" });
      if (!chosen.ok) throw new Error(chosen.error);
      expect(chosen.state.cards["angel-1"]!.powerCounters).toBe(12);
      expect(chosen.state.runner.credits).toBe(3);
    });
  });
  });
});
