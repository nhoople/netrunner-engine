/**
 * chrome-city play tests.
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

describe("chrome-city", () => {
  describe("cc-v111-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.16");
  });

  describe("Chrome City v1.111.0 set-complete", () => {

    it("wires key CC fields", () => {
      loadCardCatalog(true);
      expect(getCardDef("immolation-script").runEvent?.immolationScriptAccessReplace).toBe(
        true,
      );
      expect(getCardDef("skulljack").corpCardTrashCostReduction).toBe(1);
      expect(getCardDef("turntable").muBonus).toBe(1);
      expect(getCardDef("turntable").maxConsole).toBe(1);
      expect(getCardDef("turntable").onStealAgenda).toBeTruthy();
      expect(getCardDef("chrome-parlor").preventCyberneticInstallDamage).toBe(true);
      expect(getCardDef("titanium-ribs").runnerChoosesDamageTrashFromGrip).toBe(true);
      expect(getCardDef("crowbar").memoryCostZeroIfLinkGte).toBe(2);
      expect(getCardDef("crowbar").strengthBonusPerIcebreaker).toBe(1);
      expect(getCardDef("crowbar").breaker?.breakMaxSubs).toBe(3);
      expect(getCardDef("net-ready-eyes").onRunBegin).toBeTruthy();
      expect(getCardDef("analog-dreamers").paidAbilities?.[0]?.effect).toBeTruthy();
      expect(getCardDef("brain-cage").handSizeBonus).toBe(3);
      expect(getCardDef("cybernetics-division-humanity-upgraded").handSizeBonus).toBe(
        -1,
      );
      expect(
        getCardDef("cybernetics-division-humanity-upgraded").runnerHandSizeBonus,
      ).toBe(-1);
      expect(getCardDef("self-destruct-chips").runnerHandSizeBonus).toBe(-1);
      expect(getCardDef("oaktown-grid").rootTrashCostIncreaseThisServer).toBe(3);
      expect(getCardDef("ryon-knight").paidAbilities?.[0]?.requireThisServer).toBe(
        true,
      );
      expect(getCardDef("ryon-knight").paidAbilities?.[0]?.requireRunnerClicksEq).toBe(
        0,
      );
      expect(getCardDef("quicksand").strengthPerPowerCounter).toBe(true);
      expect(getCardDef("little-engine").subroutines).toHaveLength(3);
    });
  });
  });
});
