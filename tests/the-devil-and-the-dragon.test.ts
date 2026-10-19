/**
 * the-devil-and-the-dragon play tests.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
  loadCardCatalog,
  CARD_WAVE_DIRS,
} from "../src/index.js";

describe("the-devil-and-the-dragon", () => {
  describe("tdatd-v139-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.7");
  });

  describe("The Devil and the Dragon v1.139.0 set-complete", () => {

    it("wires the-devil-and-the-dragon in CARD_WAVE_DIRS after council-of-the-crest", () => {
      const idx = CARD_WAVE_DIRS.indexOf("the-devil-and-the-dragon");
      expect(idx).toBeGreaterThan(0);
      expect(CARD_WAVE_DIRS[idx - 1]).toBe("council-of-the-crest");
      expect(CARD_WAVE_DIRS[idx + 1]).toBe("whispers-in-nalubaale");
      expect(CARD_WAVE_DIRS[idx + 2]).toBe("kampala-ascendent");
      expect(CARD_WAVE_DIRS[idx + 3]).toBe("reign-and-reverie");
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
  });
});
