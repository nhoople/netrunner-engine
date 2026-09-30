/**
 * Order and Chaos (oac) set-complete — floor v1.107.0 → v1.108.0.
 * 55/55 OAC clears (0 reprints). CR pin v26.03.
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

const OAC_CLEARS = [
  "argus-security-protection-guaranteed",
  "gagarin-deep-space-expanding-the-horizon",
  "titan-transnational-investing-in-your-future",
  "firmware-updates",
  "glenn-station",
  "government-takeover",
  "high-risk-investment",
  "constellation-protocol",
  "mark-yale",
  "space-camp",
  "the-board",
  "asteroid-belt",
  "wormhole",
  "nebula",
  "orion",
  "builder",
  "checkpoint",
  "fire-wall",
  "searchlight",
  "housekeeping",
  "patch",
  "traffic-accident",
  "satellite-grid",
  "the-twins",
  "sub-boost",
  "dedicated-technician-team",
  "cyberdex-virus-suite",
  "edward-kim-humanitys-hammer",
  "maxx-maximum-punk-rock",
  "valencia-estevez-the-angel-of-cayambe",
  "amped-up",
  "ive-had-worse",
  "itinerant-protesters",
  "showing-off",
  "wanton-destruction",
  "day-job",
  "forked",
  "knifed",
  "spooned",
  "eater",
  "gravedigger",
  "hivemind",
  "progenitor",
  "archives-interface",
  "chop-bot-3000",
  "memstrips",
  "vigil",
  "human-first",
  "investigative-journalism",
  "sacrificial-clone",
  "stim-dealer",
  "virus-breeding-ground",
  "uninstall",
  "qianju-pt",
  "data-folding",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.141.0");
});

describe("Order and Chaos v1.108.0 set-complete", () => {
  it("declares order-and-chaos supported after the-source with 55 clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["order-and-chaos"].status).toBe("supported");
    expect(pool.waves["order-and-chaos"].cards).toHaveLength(55);
    expect(pool.corpusOrder[20]).toBe("the-source");
    expect(pool.corpusOrder[21]).toBe("order-and-chaos");
    expect(pool.corpusOrder[22]).toBe("the-valley");
    expect(pool.corpusOrder[23]).toBe("breaker-bay");
    expect(pool.corpusOrder[24]).toBe("chrome-city");
    expect(pool.corpusOrder[25]).toBe("the-underway");
    expect(pool.corpusOrder[26]).toBe("old-hollywood");
    expect(pool.corpusOrder[28]).toBe("data-and-destiny");
    expect(pool.corpusOrder[29]).toBe("kala-ghoda");
    expect(pool.corpusOrder[30]).toBe("business-first");
    expect(pool.corpusOrder[31]).toBe("democracy-and-dogma");
    expect(pool.corpusOrder[32]).toBe("salsette-island");
    expect(pool.corpusOrder[33]).toBe("the-liberated-mind");
    expect(pool.corpusOrder[34]).toBe("fear-the-masses");
    expect(pool.corpusOrder[43]).toBe("terminal-directive");
    expect(pool.corpusOrder[44]).toBe("earths-scion");
    expect(pool.corpusOrder[45]).toBe("blood-and-water");
    expect(pool.corpusOrder[46]).toBe("free-mars");
    expect(pool.corpusOrder[47]).toBe("crimson-dust");
    expect(pool.corpusOrder[48]).toBe("revised-core");
    expect(pool.corpusOrder[49]).toBe("sovereign-sight");
    expect(pool.corpusOrder[50]).toBe("down-the-white-nile");
    expect(pool.corpusOrder[51]).toBe("council-of-the-crest");
    expect(pool.corpusOrder[52]).toBe("the-devil-and-the-dragon");
    expect(pool.corpusOrder[53]).toBe("whispers-in-nalubaale");
    expect(pool.corpusOrder[54]).toBe("kampala-ascendent");
    expect(pool.corpusOrder[55]).toBe("reign-and-reverie");
  });

  it("clears all 55 OAC cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of OAC_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("order-and-chaos");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onEncounter) expect(validateEffectTree(def.onEncounter)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onInstall) expect(validateEffectTree(def.onInstall)).toBeNull();
      if (def.onTrash) expect(validateEffectTree(def.onTrash)).toBeNull();
      if (def.onAccess) expect(validateEffectTree(def.onAccess)).toBeNull();
      if (def.onAgendaStolen) {
        expect(validateEffectTree(def.onAgendaStolen)).toBeNull();
      }
      if (def.onAgendaScored) {
        expect(validateEffectTree(def.onAgendaScored)).toBeNull();
      }
      if (def.onTrashWhileAccessed) {
        expect(validateEffectTree(def.onTrashWhileAccessed)).toBeNull();
      }
      if (def.onTrashFromGripOrStack) {
        expect(validateEffectTree(def.onTrashFromGripOrStack)).toBeNull();
      }
      if (def.onPassRezzedIceProtectingThisServer) {
        expect(
          validateEffectTree(def.onPassRezzedIceProtectingThisServer),
        ).toBeNull();
      }
      if (def.onAgendaScoredOrStolen) {
        expect(validateEffectTree(def.onAgendaScoredOrStolen)).toBeNull();
      }
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
      if (def.runEvent?.onSuccessfulRun) {
        expect(validateEffectTree(def.runEvent.onSuccessfulRun)).toBeNull();
      }
    }
  });

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
