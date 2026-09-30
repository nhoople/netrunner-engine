/**
 * Blood and Water (baw) set-complete — floor v1.131.0 → v1.132.0.
 * 20/20 Red Sand #4 clears (no reprints). CR pin v26.03.
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
} from "../src/index.js";

const CLEARS = [
  "alice-merchant-clan-agitator",
  "jarogniew-mercs",
  "maui",
  "bug-out-bag",
  "keros-mcintyre",
  "daredevil",
  "mass-driver",
  "warroid-tracker",
  "loki",
  "obokata-protocol",
  "miraju",
  "shipment-from-tennin",
  "escalate-vitriol",
  "reeducation",
  "traffic-analyzer",
  "meteor-mining",
  "standoff",
  "success",
  "whampoa-reclamation",
  "mass-commercialization",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.136.0");
});

describe("Blood and Water v1.132.0 set-complete", () => {
  it("declares blood-and-water supported after earths-scion with 20 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["blood-and-water"].status).toBe("supported");
    expect(pool.waves["blood-and-water"].cards).toHaveLength(20);
    expect(pool.corpusOrder[44]).toBe("earths-scion");
    expect(pool.corpusOrder[45]).toBe("blood-and-water");
    expect(pool.corpusOrder[46]).toBe("free-mars");
    expect(pool.corpusOrder[47]).toBe("crimson-dust");
    expect(pool.corpusOrder[48]).toBe("revised-core");
    expect(pool.corpusOrder[49]).toBe("sovereign-sight");
    expect(pool.corpusOrder[50]).toBe("reign-and-reverie");
  });

  it("clears all 20 new baw cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("blood-and-water");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onRez) expect(validateEffectTree(def.onRez)).toBeNull();
      if (def.onInstall) expect(validateEffectTree(def.onInstall)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onSuccessfulRun) {
        expect(validateEffectTree(def.onSuccessfulRun)).toBeNull();
      }
      if (def.onEncounter) expect(validateEffectTree(def.onEncounter)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.stealAdditionalCost) {
        expect(validateEffectTree(def.stealAdditionalCost)).toBeNull();
      }
      if (def.onRunnerTrashFromThisServerRootOrProtecting) {
        expect(
          validateEffectTree(def.onRunnerTrashFromThisServerRootOrProtecting),
        ).toBeNull();
      }
      if (def.onEncounterEndIfPrintedSubroutineBroken) {
        expect(
          validateEffectTree(def.onEncounterEndIfPrintedSubroutineBroken),
        ).toBeNull();
      }
      if (def.onRezIceProtectingThisServer) {
        expect(validateEffectTree(def.onRezIceProtectingThisServer)).toBeNull();
      }
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
    }
  });

  it("wires key baw fields (NRDB text)", () => {
    loadCardCatalog(true);
    expect(getCardDef("alice-merchant-clan-agitator").type).toBe("identity");
    expect(getCardDef("alice-merchant-clan-agitator").onSuccessfulRunOncePerTurn).toBe(
      true,
    );
    expect(getCardDef("jarogniew-mercs").trashWhenPowerEmpty).toBe(true);
    expect(
      getCardDef("jarogniew-mercs").corpCannotTrashWhileOtherResourceInstalled,
    ).toBe(true);
    expect(getCardDef("maui").muBonus).toBe(2);
    expect(getCardDef("maui").recurringCreditsMaxEqualsIceProtectingHq).toBe(true);
    expect(getCardDef("bug-out-bag").installCostX).toBe(true);
    expect(getCardDef("bug-out-bag").onTurnEndIfGripEmptyDrawPerPowerThenTrash).toBe(
      true,
    );
    expect(getCardDef("keros-mcintyre").gainCreditsOnFirstDerezIceEachTurn).toBe(2);
    expect(getCardDef("daredevil").drawOnFirstRunEachTurnIfServerIceGte).toEqual({
      ice: 2,
      draw: 2,
    });
    expect(
      getCardDef("mass-driver").fullyBreakNextEncounterFirstNSubsDoNotResolve,
    ).toBe(3);
    expect(getCardDef("obokata-protocol").stealAdditionalCost).toBeTruthy();
    expect(getCardDef("shipment-from-tennin").playRequiresNoSuccessfulRunLastTurn).toBe(
      true,
    );
    expect(getCardDef("success").playAdditionalClicks).toBe(2);
    expect(getCardDef("success").playAdditionalCostForfeitAgenda).toBe(true);
    expect(getCardDef("mass-commercialization").type).toBe("operation");
  });
});
