/**
 * honor-and-profit play tests.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
  loadCardCatalog,
} from "../src/index.js";

describe("honor-and-profit", () => {
  describe("hap-v101-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.7");
  });

  describe("Honor and Profit v1.101.0 set-complete", () => {

    it("wires key HAP fields", () => {
      loadCardCatalog(true);
      expect(getCardDef("harmony-medtech-biomedical-pioneer").agendaPointsToWinModifierBoth).toBe(
        -1,
      );
      expect(getCardDef("guard").cannotBeBypassed).toBe(true);
      expect(getCardDef("overmind").powerCountersOnInstallFromUnusedMu).toBe(true);
      expect(getCardDef("feint").runEvent?.bypassEncountersRemaining).toBe(2);
      expect(getCardDef("feint").runEvent?.skipBreach).toBe(true);
    });
  });
  });
});
