/**
 * order-and-chaos play tests.
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

describe("order-and-chaos", () => {
  describe("oac-v108-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.12");
  });

  describe("Order and Chaos v1.108.0 set-complete", () => {

    it("wires key OAC fields", () => {
      loadCardCatalog(true);
      expect(getCardDef("gagarin-deep-space-expanding-the-horizon").additionalCreditsToAccessRemoteRoot).toBe(1);
      expect(getCardDef("asteroid-belt").rezCostReductionPerAdvancement).toBe(3);
      expect(getCardDef("orion").rezCostReductionPerAdvancement).toBe(3);
      expect(getCardDef("fire-wall").strengthPerAdvancement).toBe(1);
      expect(getCardDef("the-board").agendaPointsModifierInRunnerScoreArea).toBe(-1);
      expect(getCardDef("valencia-estevez-the-angel-of-cayambe").corpStartsWithBadPublicity).toBe(1);
      expect(getCardDef("edward-kim-humanitys-hammer").firstAccessedOperationTrashFreeEachTurn).toBe(true);
      expect(getCardDef("day-job").playAdditionalClicks).toBe(3);
      expect(getCardDef("eater").breaker?.breakPreventsCardAccessForRun).toBe(true);
      expect(getCardDef("knifed").runEvent?.trashFirstFullyBrokenSubtype).toBe("barrier");
      expect(getCardDef("spooned").runEvent?.trashFirstFullyBrokenSubtype).toBe("code gate");
      expect(getCardDef("forked").runEvent?.trashFirstFullyBrokenSubtype).toBe("sentry");
      expect(getCardDef("showing-off").runEvent?.accessFromBottomOfRd).toBe(true);
      expect(getCardDef("hivemind").hivemindSharesVirusCounters).toBe(true);
      expect(getCardDef("progenitor").daemonHostVirusProgramsOnly).toBe(true);
      expect(getCardDef("memstrips").muBonusOnlyForVirusPrograms).toBe(true);
      expect(getCardDef("government-takeover").agendaPoints).toBe(6);
      expect(getCardDef("dedicated-technician-team").recurringCreditsMax).toBe(2);
    });
  });
  });
});
