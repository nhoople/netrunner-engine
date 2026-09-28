/**
 * RWR v0.89: Powers / Stoke / Boi-tatá / Sorocaban / Piranhas.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  fx,
  getCardDef,
  loadCardCatalog,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.09.0");
});

describe("RWR v0.89 Powers / Stoke / Boi-tatá / Sorocaban / Piranhas", () => {
  it("loads five clear cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of [
      "the-powers-that-be",
      "stoke-the-embers",
      "boi-tata",
      "sorocaban-blade",
      "piranhas",
    ]) {
      expect(catalog.get(id)!.unsupported ?? []).toEqual([]);
    }
  });

  it("The Powers That Be may install on agenda score", () => {
    const def = getCardDef("the-powers-that-be");
    expect(def.onAgendaScored?.op).toBe("choose");
  });

  it("Stoke the Embers scores + non-HQ install", () => {
    const def = getCardDef("stoke-the-embers");
    expect(def.onScore).toEqual(
      fx.seq(
        fx.gainCredits("corp", 3),
        fx.do({ kind: "place_advancements", amount: 1 }),
      ),
    );
    expect(def.onInstallFromNonHq?.op).toBe("choose");
  });

  it("Boi-tatá is a sentry breaker with trash discount", () => {
    const def = getCardDef("boi-tata");
    expect(def.breaker?.breaksSubtype).toBe("sentry");
    expect(def.paidAbilityCreditDiscountIfOwnInstalledTrashedThisTurn).toBe(1);
  });

  it("Sorocaban Blade limits trashes per encounter", () => {
    const def = getCardDef("sorocaban-blade");
    expect(def.maxInstalledRunnerTrashesPerEncounter).toBe(1);
    expect(def.subroutines).toHaveLength(3);
  });

  it("Piranhas has rez cost and HQ>grip ETR", () => {
    const def = getCardDef("piranhas");
    expect(def.rezAdditionalCost?.op).toBe("choose");
    expect(def.subroutines?.[2]?.effect).toEqual({
      op: "if",
      cond: { op: "hq_count_gt_grip" },
      then: fx.etr(),
    });
  });
});
