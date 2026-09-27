/**
 * Midnight Sun The Twinning: power on first installed-card credit spend;
 * remove power for bonus HQ/R&D access.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  instantiateCard,
} from "../src/index.js";
import { noteInstalledCardCreditSpend } from "../src/state/costs.js";
import { beginBreachAccess } from "../src/state/access.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v0.48.0");
});

describe("MS The Twinning power + bonus access", () => {
  it("places power on first installed-card credit spend this turn", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const twin = instantiateCard("aesops-pawnshop", "tw-1", "runner:rig");
    twin.powerOnFirstInstalledCardCreditSpendThisTurn = true;
    twin.powerCounters = 0;
    s.cards["tw-1"] = twin;
    s.runner.rig = ["tw-1"];
    noteInstalledCardCreditSpend(s);
    expect(s.cards["tw-1"].powerCounters).toBe(1);
    noteInstalledCardCreditSpend(s);
    expect(s.cards["tw-1"].powerCounters).toBe(1);
  });

  it("removes up to 2 power for bonus access on HQ breach", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const twin = instantiateCard("aesops-pawnshop", "tw-1", "runner:rig");
    twin.removePowerForBonusAccessOnHqRdBreach = 2;
    twin.powerCounters = 3;
    s.cards["tw-1"] = twin;
    s.runner.rig = ["tw-1"];
    s.corp.hand = [];
    const c1 = instantiateCard("hedge-fund", "c1", "corp:hq");
    const c2 = instantiateCard("hedge-fund", "c2", "corp:hq");
    const c3 = instantiateCard("hedge-fund", "c3", "corp:hq");
    s.cards["c1"] = c1;
    s.cards["c2"] = c2;
    s.cards["c3"] = c3;
    s.corp.hand = ["c1", "c2", "c3"];
    s.run = {
      attackedServerId: "hq",
      phase: "breach",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    beginBreachAccess(s);
    expect(s.cards["tw-1"].powerCounters).toBe(1);
    expect(s.run!.bonusAccess).toBe(2);
  });
});
