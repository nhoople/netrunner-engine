/**
 * The Devil and the Dragon (tdatd) set-complete — floor v1.138.0 → v1.139.0.
 * 20/20 Kitara #4 clears (no reprints). CR pin v26.03.
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
  "glut-cipher",
  "knobkierie",
  "419-amoral-scammer",
  "falsified-credentials",
  "rogue-trading",
  "because-i-can",
  "nyashia",
  "consume",
  "malia-z0l0k4",
  "kill-switch",
  "tempus",
  "bio-vault",
  "sadaka",
  "endless-eula",
  "sandman",
  "amani-senai",
  "sso-industries-fueling-innovation",
  "city-works-project",
  "oduduwa",
  "rashida-jaheem",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.145.0");
});

describe("The Devil and the Dragon v1.139.0 set-complete", () => {
  it("declares the-devil-and-the-dragon supported after council-of-the-crest with 20 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["the-devil-and-the-dragon"].status).toBe("supported");
    expect(pool.waves["the-devil-and-the-dragon"].cards).toHaveLength(20);
    expect(pool.corpusOrder[50]).toBe("down-the-white-nile");
    expect(pool.corpusOrder[51]).toBe("council-of-the-crest");
    expect(pool.corpusOrder[52]).toBe("the-devil-and-the-dragon");
    expect(pool.corpusOrder[53]).toBe("whispers-in-nalubaale");
    expect(pool.corpusOrder[54]).toBe("kampala-ascendent");
    expect(pool.corpusOrder[55]).toBe("reign-and-reverie");
  });

  it("wires the-devil-and-the-dragon in CARD_WAVE_DIRS after council-of-the-crest", () => {
    const idx = CARD_WAVE_DIRS.indexOf("the-devil-and-the-dragon");
    expect(idx).toBeGreaterThan(0);
    expect(CARD_WAVE_DIRS[idx - 1]).toBe("council-of-the-crest");
    expect(CARD_WAVE_DIRS[idx + 1]).toBe("whispers-in-nalubaale");
    expect(CARD_WAVE_DIRS[idx + 2]).toBe("kampala-ascendent");
    expect(CARD_WAVE_DIRS[idx + 3]).toBe("reign-and-reverie");
  });

  it("clears all 20 new tdatd cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("the-devil-and-the-dragon");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onRez) expect(validateEffectTree(def.onRez)).toBeNull();
      if (def.onInstall) expect(validateEffectTree(def.onInstall)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onCorpTurnEnd) {
        expect(validateEffectTree(def.onCorpTurnEnd)).toBeNull();
      }
      if (def.onSuccessfulRun) {
        expect(validateEffectTree(def.onSuccessfulRun)).toBeNull();
      }
      if (def.onFirstSuccessfulRunThisTurn) {
        expect(validateEffectTree(def.onFirstSuccessfulRunThisTurn)).toBeNull();
      }
      if (def.onEncounter) expect(validateEffectTree(def.onEncounter)).toBeNull();
      if (def.onAccess) expect(validateEffectTree(def.onAccess)).toBeNull();
      if (def.onAgendaScoredOrStolen) {
        expect(validateEffectTree(def.onAgendaScoredOrStolen)).toBeNull();
      }
      if (def.onAgendaAccessedOrScored) {
        expect(validateEffectTree(def.onAgendaAccessedOrScored)).toBeNull();
      }
      if (def.runEvent?.onSuccessfulRun) {
        expect(validateEffectTree(def.runEvent.onSuccessfulRun)).toBeNull();
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

  it("wires key tdatd fields (NRDB text)", () => {
    loadCardCatalog(true);
    expect(getCardDef("glut-cipher").runEvent?.servers).toBe("archives");
    expect(getCardDef("glut-cipher").runEvent?.skipBreach).toBe(true);
    expect(getCardDef("knobkierie").muBonus).toBe(3);
    expect(getCardDef("knobkierie").muBonusOnlyForVirusPrograms).toBe(true);
    expect(
      getCardDef("419-amoral-scammer").mayExposeFirstCorpInstallEachTurnUnlessCorpPays,
    ).toBe(1);
    expect(getCardDef("falsified-credentials").onPlay).toBeTruthy();
    expect(getCardDef("rogue-trading").hostedCreditsOnInstall).toBe(18);
    expect(getCardDef("rogue-trading").trashWhenHostedCreditsEmpty).toBe(true);
    expect(getCardDef("because-i-can").runEvent?.servers).toBe("remote");
    expect(getCardDef("nyashia").powerCountersOnInstall).toBe(3);
    expect(getCardDef("nyashia").maySpendPowerCountersForBonusRdAccess?.max).toBe(
      1,
    );
    expect(getCardDef("consume").mayPlaceVirusCounterWhenCorpCardTrashed).toBe(
      true,
    );
    expect(getCardDef("malia-z0l0k4").onRez).toBeTruthy();
    expect(getCardDef("kill-switch").lingerAsCurrent).toBe(true);
    expect(getCardDef("kill-switch").mustRevealAgendasAccessedFromRd).toBe(true);
    expect(getCardDef("kill-switch").onAgendaAccessedOrScored).toBeTruthy();
    expect(getCardDef("tempus").mustRevealWhenAccessedFromRd).toBe(true);
    expect(getCardDef("tempus").skipOnAccessFromArchives).toBe(true);
    expect(getCardDef("bio-vault").remoteOnly).toBe(true);
    expect(getCardDef("bio-vault").canAdvance).toBe(true);
    expect(getCardDef("sadaka").subroutines?.length).toBe(2);
    expect(getCardDef("endless-eula").subroutines?.length).toBe(6);
    expect(getCardDef("sandman").subroutines?.length).toBe(2);
    expect(getCardDef("amani-senai").onAgendaScoredOrStolen).toBeTruthy();
    expect(getCardDef("sso-industries-fueling-innovation").type).toBe("identity");
    expect(getCardDef("city-works-project").installFaceup).toBe(true);
    expect(getCardDef("city-works-project").onAccessRequiresInstalled).toBe(true);
    expect(getCardDef("oduduwa").onEncounter).toBeTruthy();
    expect(getCardDef("rashida-jaheem").onTurnBegin).toBeTruthy();
  });
});
