/**
 * Blood Money (bm) set-complete — floor v1.122.0 → v1.124.0.
 * 20/20 Flashpoint #2 clears (no reprints). CR pin v26.03.
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
  "credit-crash",
  "rumor-mill",
  "nfr",
  "paperclip",
  "golden",
  "temujin-contract",
  "khan-savvy-skiptracer",
  "data-breach",
  "algo-trading",
  "beth-kilrain-chang",
  "fairchild-2-0",
  "aiki",
  "enforcing-loyalty",
  "hatchet-job",
  "special-report",
  "c-i-fund",
  "liquidation",
  "weyland-consortium-builder-of-nations",
  "financial-collapse",
  "prisec",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.136.0");
});

describe("Blood Money v1.124.0 set-complete", () => {
  it("declares blood-money supported after twenty-three-seconds with 20 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["blood-money"].status).toBe("supported");
    expect(pool.waves["blood-money"].cards).toHaveLength(20);
    expect(pool.corpusOrder[35]).toBe("twenty-three-seconds");
    expect(pool.corpusOrder[36]).toBe("blood-money");
    expect(pool.corpusOrder[37]).toBe("escalation");
    expect(pool.corpusOrder[38]).toBe("intervention");
    expect(pool.corpusOrder[39]).toBe("martial-law");
    expect(pool.corpusOrder[40]).toBe("quorum");
    expect(pool.corpusOrder[41]).toBe("daedalus-complex");
    expect(pool.corpusOrder[42]).toBe("station-one");
    expect(pool.corpusOrder[43]).toBe("terminal-directive");
    expect(pool.corpusOrder[44]).toBe("earths-scion");
    expect(pool.corpusOrder[45]).toBe("blood-and-water");
    expect(pool.corpusOrder[46]).toBe("free-mars");
    expect(pool.corpusOrder[47]).toBe("crimson-dust");
    expect(pool.corpusOrder[48]).toBe("revised-core");
    expect(pool.corpusOrder[49]).toBe("sovereign-sight");
    expect(pool.corpusOrder[50]).toBe("reign-and-reverie");
  });

  it("clears all 20 new bm cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("blood-money");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onRez) expect(validateEffectTree(def.onRez)).toBeNull();
      if (def.onInstall) expect(validateEffectTree(def.onInstall)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onSuccessfulRun) {
        expect(validateEffectTree(def.onSuccessfulRun)).toBeNull();
      }
      if (def.onAccess) expect(validateEffectTree(def.onAccess)).toBeNull();
      if (def.onFullyBreak) expect(validateEffectTree(def.onFullyBreak)).toBeNull();
      if (def.onFirstPassIceEachTurn) {
        expect(validateEffectTree(def.onFirstPassIceEachTurn)).toBeNull();
      }
      if (def.runEvent?.onRunEnd) {
        expect(validateEffectTree(def.runEvent.onRunEnd)).toBeNull();
      }
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
    }
  });

  it("wires key bm fields (NRDB text)", () => {
    loadCardCatalog(true);
    expect(
      getCardDef("credit-crash").runEvent
        ?.trashFirstNonAgendaAccessCorpMayPayRezOrPlayCostToPrevent,
    ).toBe(true);
    expect(getCardDef("rumor-mill").lingerAsCurrent).toBe(true);
    expect(
      getCardDef("rumor-mill").blankUniqueNonRegionAssetUpgradePrintedAbilities,
    ).toBe(true);
    expect(getCardDef("nfr").strengthPerPowerCounter).toBe(true);
    expect(getCardDef("nfr").onFullyBreak).toBeTruthy();
    expect(
      getCardDef("paperclip").mayInstallSelfFromHeapOnEncounterBarrier,
    ).toBe(true);
    expect(getCardDef("golden").breaker?.breaksSubtype).toBe("sentry");
    expect(getCardDef("temujin-contract").hostedCreditsOnInstall).toBe(20);
    expect(getCardDef("temujin-contract").onInstall).toBeTruthy();
    expect(getCardDef("khan-savvy-skiptracer").onFirstPassIceEachTurn).toBeTruthy();
    expect(getCardDef("data-breach").runEvent?.servers).toBe("rd");
    expect(getCardDef("fairchild-2-0").bioroidBreakMaxSubs).toBe(2);
    expect(getCardDef("enforcing-loyalty").playAdditionalClick).toBe(true);
    expect(getCardDef("hatchet-job").playAdditionalClick).toBe(true);
    expect(getCardDef("liquidation").playAdditionalClick).toBe(true);
    expect(
      getCardDef("weyland-consortium-builder-of-nations")
        .firstAdvancedIceEncounterEndMeatDamageEachTurn,
    ).toBe(true);
    expect(getCardDef("financial-collapse").playRequiresRunnerCreditsGte).toBe(
      6,
    );
    expect(getCardDef("prisec").onAccessRequiresInstalled).toBe(true);
  });
});
