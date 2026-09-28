/**
 * Elevation v1.12.0 final B-slice: all 10 remaining stubs → 82/82.
 * Slice A (Dewi / Ryō / Madani / Charm / GAMEDRAGON) + Slice B
 * (Shred / Bling / Detente / Au Co / Bangun).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";

const CLEAR = [
  "charm-offensive",
  "shred",
  "bling",
  "detente",
  "madani",
  "gamedragon-pro",
  "dewi-subrotoputri-pedagogical-dhalang",
  "bangun-when-disaster-strikes",
  "au-co-the-gold-standard-in-clones",
  "ryo-phoenix-ono-out-of-the-ashes",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.29.0");
});

describe("Elevation v1.12.0 final B-slice", () => {
  it("declares 82 clear elevation cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["elevation"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["elevation"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBe(82);
  });

  it("loads ten newly mapped cards clear", () => {
    for (const id of CLEAR) {
      expect(getCardDef(id).unsupported ?? [], id).toEqual([]);
    }
  });

  it("Ryō Phoenix successful-run-after-sub primitive", () => {
    const c = getCardDef("ryo-phoenix-ono-out-of-the-ashes");
    expect(JSON.stringify(c.onSuccessfulRun)).toContain(
      "ryo_phoenix_on_successful_run",
    );
    expect(validateEffectTree(c.onSuccessfulRun!)).toBeNull();
  });

  it("Dewi flip + MU conditions", () => {
    const c = getCardDef("dewi-subrotoputri-pedagogical-dhalang");
    expect(JSON.stringify(c.onSuccessfulRun)).toContain("runner_mu_full");
    expect(JSON.stringify(c.onSuccessfulRun)).toContain("flip_identity");
    expect(validateEffectTree(c.onSuccessfulRun!)).toBeNull();
  });

  it("Charm Offensive Archives onRunEnd trash rezzed copy", () => {
    const c = getCardDef("charm-offensive");
    expect(JSON.stringify(c.runEvent?.onRunEnd)).toContain(
      "charm_offensive_trash_rezzed_accessed",
    );
    expect(validateEffectTree(c.runEvent!.onRunEnd!)).toBeNull();
  });

  it("Shred first ETR prevention flag", () => {
    const c = getCardDef("shred");
    expect(c.runEvent?.shredPreventFirstEndTheRun).toBe(true);
    expect(c.runEvent?.servers).toBe("any");
  });

  it("Bling MU + free-install host + discard trash hosted", () => {
    const c = getCardDef("bling");
    expect(c.muBonus).toBe(1);
    expect(c.hostedCardsPlayableAsGrip).toBe(true);
    expect(JSON.stringify(c.onInstallWithoutSpendingCredits)).toContain(
      "host_top_of_stack_on_source",
    );
    expect(JSON.stringify(c.onDiscardPhaseEnd)).toContain(
      "trash_all_hosted_cards",
    );
  });

  it("Detente HQ host + any-player return access", () => {
    const c = getCardDef("detente");
    expect(c.muBonus).toBe(1);
    expect(JSON.stringify(c.onFirstSuccessfulHqRunThisTurn)).toContain(
      "detente_host_random_hq",
    );
    const ab = c.paidAbilities?.find((a) => a.id === "detente-return-access");
    expect(ab?.usableByAnyPlayer).toBe(true);
    expect(JSON.stringify(ab?.effect)).toContain(
      "detente_return_two_hosted_may_access",
    );
    expect(validateEffectTree(ab!.effect)).toBeNull();
  });

  it("Madani host/install paid abilities", () => {
    const c = getCardDef("madani");
    expect(c.paidAbilities?.length).toBe(2);
    for (const ab of c.paidAbilities ?? []) {
      expect(validateEffectTree(ab.effect)).toBeNull();
    }
  });

  it("GAMEDRAGON host on icebreaker + pump duration", () => {
    const c = getCardDef("gamedragon-pro");
    expect(c.hostIcebreakerStrengthBonus).toBe(1);
    expect(c.extendsHostBreakerPumpToRun).toBe(true);
    expect(JSON.stringify(c.onInstall)).toContain(
      "gamedragon_may_host_on_icebreaker",
    );
    expect(validateEffectTree(c.onInstall!)).toBeNull();
  });

  it("Au Co damage/HQ-trash power + look R&D", () => {
    const c = getCardDef("au-co-the-gold-standard-in-clones");
    expect(c.powerCounterOnDamageOrTrashFromHq).toBe(true);
    expect(JSON.stringify(c.onTurnBegin)).toContain("au_co_remove_2_look_rd");
    expect(validateEffectTree(c.onTurnBegin!)).toBeNull();
  });

  it("Bangun faceup agendas + access meat/tag", () => {
    const c = getCardDef("bangun-when-disaster-strikes");
    expect(c.mayInstallAgendasFaceup).toBe(true);
    expect(JSON.stringify(c.onAccessFaceupInstalledAgenda)).toContain(
      "meat_damage",
    );
    expect(validateEffectTree(c.onAccessFaceupInstalledAgenda!)).toBeNull();
  });
});
