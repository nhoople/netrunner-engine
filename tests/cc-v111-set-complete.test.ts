/**
 * Chrome City (cc) set-complete — floor v1.110.0 → v1.111.0.
 * 18/18 CC-only clears (oaktown-renovation + corporate-town reprints). CR pin v26.03.
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

const CC_CLEARS = [
  "immolation-script",
  "skulljack",
  "turntable",
  "chrome-parlor",
  "titanium-ribs",
  "crowbar",
  "net-ready-eyes",
  "analog-dreamers",
  "brain-cage",
  "cybernetics-division-humanity-upgraded",
  "self-destruct-chips",
  "lab-dog",
  "oaktown-grid",
  "ryon-knight",
  "clairvoyant-monitor",
  "lockdown",
  "little-engine",
  "quicksand",
] as const;

const CC_REPRINTS = ["oaktown-renovation", "corporate-town"] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.132.0");
});

describe("Chrome City v1.111.0 set-complete", () => {
  it("declares chrome-city supported after breaker-bay with 20 pool ids", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["chrome-city"].status).toBe("supported");
    expect(pool.waves["chrome-city"].cards).toHaveLength(20);
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
    expect(pool.corpusOrder[46]).toBe("reign-and-reverie");
  });

  it("clears all 18 CC cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of CC_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("chrome-city");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onEncounter) expect(validateEffectTree(def.onEncounter)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onInstall) expect(validateEffectTree(def.onInstall)).toBeNull();
      if (def.onRunBegin) expect(validateEffectTree(def.onRunBegin)).toBeNull();
      if (def.onStealAgenda) expect(validateEffectTree(def.onStealAgenda)).toBeNull();
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

  it("skips oaktown-renovation and corporate-town reprints", () => {
    loadCardCatalog(true);
    for (const id of CC_REPRINTS) {
      const def = getCardDef(id);
      expect(def.wave).not.toBe("chrome-city");
    }
  });

  it("wires key CC fields", () => {
    loadCardCatalog(true);
    expect(getCardDef("immolation-script").runEvent?.immolationScriptAccessReplace).toBe(
      true,
    );
    expect(getCardDef("skulljack").corpCardTrashCostReduction).toBe(1);
    expect(getCardDef("turntable").muBonus).toBe(1);
    expect(getCardDef("turntable").maxConsole).toBe(1);
    expect(getCardDef("turntable").onStealAgenda).toBeTruthy();
    expect(getCardDef("chrome-parlor").preventCyberneticInstallDamage).toBe(true);
    expect(getCardDef("titanium-ribs").runnerChoosesDamageTrashFromGrip).toBe(true);
    expect(getCardDef("crowbar").memoryCostZeroIfLinkGte).toBe(2);
    expect(getCardDef("crowbar").strengthBonusPerIcebreaker).toBe(1);
    expect(getCardDef("crowbar").breaker?.breakMaxSubs).toBe(3);
    expect(getCardDef("net-ready-eyes").onRunBegin).toBeTruthy();
    expect(getCardDef("analog-dreamers").paidAbilities?.[0]?.effect).toBeTruthy();
    expect(getCardDef("brain-cage").handSizeBonus).toBe(3);
    expect(getCardDef("cybernetics-division-humanity-upgraded").handSizeBonus).toBe(
      -1,
    );
    expect(
      getCardDef("cybernetics-division-humanity-upgraded").runnerHandSizeBonus,
    ).toBe(-1);
    expect(getCardDef("self-destruct-chips").runnerHandSizeBonus).toBe(-1);
    expect(getCardDef("oaktown-grid").rootTrashCostIncreaseThisServer).toBe(3);
    expect(getCardDef("ryon-knight").paidAbilities?.[0]?.requireThisServer).toBe(
      true,
    );
    expect(getCardDef("ryon-knight").paidAbilities?.[0]?.requireRunnerClicksEq).toBe(
      0,
    );
    expect(getCardDef("quicksand").strengthPerPowerCounter).toBe(true);
    expect(getCardDef("little-engine").subroutines).toHaveLength(3);
  });
});
