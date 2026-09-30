/**
 * Escalation (es) set-complete — floor v1.124.0 → v1.124.0.
 * 20/20 Flashpoint #3 clears (no reprints). CR pin v26.03.
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
  "obelus",
  "black-orchestra",
  "omar-keung-conspiracy-theorist",
  "peregrine",
  "houdini",
  "net-mercur",
  "find-the-truth",
  "first-responders",
  "fairchild-3-0",
  "ark-lockdown",
  "hellion-beta-test",
  "project-kusanagi",
  "dna-tracker",
  "jinteki-potential-unleashed",
  "alexa-belsky",
  "observe-and-destroy",
  "service-outage",
  "boom",
  "door-to-door",
  "scarcity-of-resources",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.133.0");
});

describe("Escalation v1.124.0 set-complete", () => {
  it("declares escalation supported after blood-money with 20 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["escalation"].status).toBe("supported");
    expect(pool.waves["escalation"].cards).toHaveLength(20);
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
    expect(pool.corpusOrder[47]).toBe("reign-and-reverie");
  });

  it("clears all 20 new es cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("escalation");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onRez) expect(validateEffectTree(def.onRez)).toBeNull();
      if (def.onInstall) expect(validateEffectTree(def.onInstall)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onRunnerTurnBegin) {
        expect(validateEffectTree(def.onRunnerTurnBegin)).toBeNull();
      }
      if (def.onSuccessfulRun) {
        expect(validateEffectTree(def.onSuccessfulRun)).toBeNull();
      }
      if (def.onAccess) expect(validateEffectTree(def.onAccess)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onFirstSuccessfulRunThisTurn) {
        expect(validateEffectTree(def.onFirstSuccessfulRunThisTurn)).toBeNull();
      }
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
    }
  });

  it("wires key es fields (NRDB text)", () => {
    loadCardCatalog(true);
    expect(getCardDef("obelus").muBonus).toBe(1);
    expect(getCardDef("obelus").handSizeBonusPerTag).toBe(1);
    expect(
      getCardDef("obelus").drawPerAccessOnFirstSuccessfulHqOrRdRunEndEachTurn,
    ).toBe(true);
    expect(
      getCardDef("black-orchestra").mayInstallSelfFromHeapOnEncounterCodeGate,
    ).toBe(true);
    expect(
      getCardDef("omar-keung-conspiracy-theorist").paidAbilities?.[0]?.startsRun
        ?.redirectSuccessChooseHqOrRd,
    ).toBe(true);
    expect(getCardDef("peregrine").breaker?.breaksSubtype).toBe("code gate");
    expect(
      getCardDef("houdini").paidAbilities?.some(
        (a) => a.cost?.minCreditsFromStealth === 1,
      ),
    ).toBe(true);
    expect(
      getCardDef("net-mercur").firstStealthSpendEachRunPlaceCreditOrDraw,
    ).toBe(true);
    expect(getCardDef("find-the-truth").revealDrawnCards).toBe(true);
    expect(getCardDef("fairchild-3-0").bioroidBreakMaxSubs).toBe(3);
    expect(
      getCardDef("hellion-beta-test").playRequiresRunnerTrashedCorpCardLastTurn,
    ).toBe(true);
    expect(
      getCardDef("jinteki-potential-unleashed").trashTopOfStackOnRunnerNetDamage,
    ).toBe(true);
    expect(getCardDef("observe-and-destroy").playRequiresRunnerCreditsLt).toBe(
      6,
    );
    expect(
      getCardDef("service-outage").runnerFirstRunEachTurnAdditionalCost,
    ).toBe(1);
    expect(getCardDef("boom").playRequiresMinTags).toBe(2);
    expect(getCardDef("boom").playAdditionalClick).toBe(true);
    expect(getCardDef("door-to-door").lingerAsCurrent).toBe(true);
    expect(getCardDef("scarcity-of-resources").resourceInstallCostIncrease).toBe(
      2,
    );
  });
});
