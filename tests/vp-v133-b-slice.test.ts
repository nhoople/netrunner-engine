/**
 * Vantage Point v1.33.0 B-slice: Word on the Street / Read-Write Share /
 * Hackerspace / Méliès U → 66/66 (set complete).
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
  "word-on-the-street",
  "read-write-share",
  "hackerspace",
  "melies-u-only-the-brightest",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.66.0");
});

describe("Vantage Point v1.33.0 B-slice", () => {
  it("declares exactly 66 clear vantage-point cards (supported)", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["vantage-point"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["vantage-point"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBe(66);
  });

  it("loads four newly mapped cards clear", () => {
    for (const id of CLEAR) {
      expect(getCardDef(id).unsupported ?? [], id).toEqual([]);
    }
  });

  it("Word on the Street adds −1 AP cost / rewards non-install scores", () => {
    const def = getCardDef("word-on-the-street");
    expect(def.unique).toBe(true);
    expect(
      validateEffectTree(def.additionalCostOnScoreAgendaInstalledThisTurn!),
    ).toBeNull();
    expect(
      JSON.stringify(def.additionalCostOnScoreAgendaInstalledThisTurn),
    ).toContain("add_to_corp_score_as_agenda");
    expect(validateEffectTree(def.onAgendaScored!)).toBeNull();
    expect(JSON.stringify(def.onAgendaScored)).toContain(
      "last_scored_agenda_installed_this_turn",
    );
  });

  it("Read-Write Share hosts from grip and shuffles on trash", () => {
    const def = getCardDef("read-write-share");
    expect(def.maxHostedCards).toBe(4);
    expect(validateEffectTree(def.onInstall!)).toBeNull();
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    expect(JSON.stringify(def.onInstall)).toContain(
      "may_host_one_from_grip_facedown_then_draw",
    );
    expect(def.paidAbilities?.[0]?.cost?.trashSelf).toBe(true);
    expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();
  });

  it("Hackerspace hosts unique companion/connection with hand-size bonus", () => {
    const def = getCardDef("hackerspace");
    expect(def.unique).toBe(true);
    expect(def.hostsUniqueCompanionOrConnectionResources?.creditDiscount).toBe(
      1,
    );
    expect(def.handSizeBonusIfHostingCompanionAndConnection).toBe(2);
  });

  it("Méliès U secretly sets face and flips on central success", () => {
    const def = getCardDef("melies-u-only-the-brightest");
    expect(def.flipIdentityOnSuccessfulCentralRun).toBe(true);
    expect(validateEffectTree(def.onDiscardPhaseEnd!)).toBeNull();
    expect(JSON.stringify(def.onDiscardPhaseEnd)).toContain(
      "melies_secretly_set_face",
    );
    expect(validateEffectTree(def.onRunnerActionPhaseEnd!)).toBeNull();
    expect(
      validateEffectTree(
        def.identityFlippedHooks!.onFlipToBackIfRunMatchesFace!,
      ),
    ).toBeNull();
    expect(
      validateEffectTree(def.identityFlippedHooks!.onRunnerDiscardPhaseEnd!),
    ).toBeNull();
  });
});
