/**
 * Magnum Opus (mo) set-complete — floor v1.141.0 → v1.142.0.
 * 8/8 Magnum Opus clears (no reprints). CR pin v26.03.
 * NRDB pack name: Magnum Opus (folder magnum-opus).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
  loadCardCatalog,
  loadCardPool,
  validateEffectTree,
  CARD_WAVE_DIRS,
} from "../src/index.js";

const CLEARS = [
  "labor-rights",
  "crowdfunding",
  "slot-machine",
  "border-control",
  "timely-public-release",
  "embolus",
  "watch-the-world-burn",
  "hired-help",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.142.1");
});

describe("Magnum Opus v1.142.0 set-complete", () => {
  it("declares magnum-opus supported after reign-and-reverie with 8 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["magnum-opus"].status).toBe("supported");
    expect(pool.waves["magnum-opus"].cards).toHaveLength(8);
    expect(pool.corpusOrder[55]).toBe("reign-and-reverie");
    expect(pool.corpusOrder[56]).toBe("magnum-opus");
    expect(pool.corpusOrder[57]).toBe("system-core-2019");
  });

  it("wires magnum-opus in CARD_WAVE_DIRS after reign-and-reverie", () => {
    const idx = CARD_WAVE_DIRS.indexOf("magnum-opus");
    expect(idx).toBeGreaterThan(0);
    expect(CARD_WAVE_DIRS[idx - 1]).toBe("reign-and-reverie");
    expect(CARD_WAVE_DIRS[idx + 1]).toBe("system-core-2019");
  });

  it("clears all 8 new mo cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("magnum-opus");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onRez) expect(validateEffectTree(def.onRez)).toBeNull();
      if (def.onInstall) expect(validateEffectTree(def.onInstall)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onRunnerTurnEnd) {
        expect(validateEffectTree(def.onRunnerTurnEnd)).toBeNull();
      }
      if (def.onAccess) expect(validateEffectTree(def.onAccess)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onEncounter) {
        expect(validateEffectTree(def.onEncounter)).toBeNull();
      }
      if (def.runEvent?.onSuccessfulRun) {
        expect(validateEffectTree(def.runEvent.onSuccessfulRun)).toBeNull();
      }
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
    }
  });

  it("wires key mo fields (NRDB text)", () => {
    loadCardCatalog(true);
    expect(getCardDef("labor-rights").rfgInsteadOfTrashing).toBe(true);
    expect(getCardDef("labor-rights").onPlay).toBeTruthy();
    expect(getCardDef("crowdfunding").hostedCreditsOnInstall).toBe(3);
    expect(getCardDef("crowdfunding").drawOnHostedEmpty).toBe(1);
    expect(getCardDef("crowdfunding").onTurnBegin).toBeTruthy();
    expect(getCardDef("crowdfunding").onRunnerTurnEnd).toBeTruthy();
    expect(getCardDef("slot-machine").onEncounter).toBeTruthy();
    expect(getCardDef("slot-machine").subroutines).toHaveLength(3);
    expect(getCardDef("border-control").paidAbilities?.[0]?.requireDuringRun).toBe(
      true,
    );
    expect(getCardDef("border-control").subroutines).toHaveLength(2);
    expect(getCardDef("timely-public-release").onScore).toBeTruthy();
    expect(getCardDef("timely-public-release").paidAbilities).toHaveLength(1);
    expect(getCardDef("embolus").removePowerCounterOnAnySuccessfulRun).toBe(
      true,
    );
    expect(getCardDef("embolus").unique).toBe(true);
    expect(getCardDef("embolus").onTurnBegin).toBeTruthy();
    expect(getCardDef("watch-the-world-burn").endsActionPhase).toBe(true);
    expect(getCardDef("watch-the-world-burn").deckLimit).toBe(1);
    expect(getCardDef("watch-the-world-burn").runEvent?.servers).toBe("remote");
    expect(
      getCardDef("watch-the-world-burn").runEvent?.rfgFirstNonAgendaAccess,
    ).toBe(true);
    expect(
      getCardDef("watch-the-world-burn").runEvent?.lastingRfgCopiesOnAccess,
    ).toBe(true);
    expect(getCardDef("hired-help").deckLimit).toBe(1);
    expect(
      getCardDef("hired-help")
        .additionalRunCostTrashAgendaFromScoreUnlessSuccessfulHqThisTurn,
    ).toBe(true);
  });
});
