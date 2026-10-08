/**
 * FFG Core Set clears beyond kickoff (floor v1.86.0): Personal Touch, Rabbit Hole,
 * Security Subcontract, MirrorMorph, Déjà Vu, Djinn, Medium, Demolition Run, etc.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  createInitialState,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";

const CLEAR = [
  "the-personal-touch",
  "rabbit-hole",
  "security-subcontract",
  "shipment-from-mirrormorph",
  "deja-vu",
  "djinn",
  "medium",
  "demolition-run",
  "crash-space",
  "parasite",
  "wyrm",
  "noise-hacker-extraordinaire",
  "kate-mac-mccaffrey-digital-tinker",
  "haas-bioroid-engineering-the-future",
  "grimoire",
  "aggressive-negotiation",
  "experiential-data",
  "cell-portal",
  "matrix-analyzer",
  "posted-bounty",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.144.0");
});

describe("FFG Core Set additional clears (floor v1.86.0 → v1.87.0)", () => {
  it("declares at least 49 Core-only clears", () => {
    const pool = loadCardPool(true);
    let clear = 0;
    for (const id of pool.waves.core.cards) {
      const def = getCardDef(id);
      if ((def.unsupported ?? []).length === 0 && def.wave === "core") {
        clear++;
      }
    }
    expect(clear).toBeGreaterThanOrEqual(49);
  });

  it("loads additional clears with empty unsupported", () => {
    for (const id of CLEAR) {
      const def = getCardDef(id);
      expect(def, id).toBeDefined();
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("core");
    }
  });

  it("Personal Touch hosts on icebreaker with +1 strength", () => {
    const def = getCardDef("the-personal-touch");
    expect(def.hostIcebreakerStrengthBonus).toBe(1);
    expect(JSON.stringify(def.onInstall)).toContain(
      "gamedragon_may_host_on_icebreaker",
    );
    expect(validateEffectTree(def.onInstall!)).toBeNull();
  });

  it("Rabbit Hole grants link and may install another copy", () => {
    const def = getCardDef("rabbit-hole");
    expect(def.link).toBe(1);
    expect(JSON.stringify(def.onInstall)).toContain(
      "search_stack_same_title_may_install_paying",
    );
    expect(validateEffectTree(def.onInstall!)).toBeNull();
  });

  it("Security Subcontract trashes rezzed ice for credits", () => {
    const def = getCardDef("security-subcontract");
    const ab = def.paidAbilities![0]!;
    expect(ab.requiresRezzedIce).toBe(true);
    expect(ab.cost).toEqual({ clicks: 1 });
    expect(JSON.stringify(ab.effect)).toContain("trash_rezzed_ice_gain_credits");
    expect(validateEffectTree(ab.effect)).toBeNull();
  });

  it("Shipment from MirrorMorph installs up to 3 from HQ", () => {
    const def = getCardDef("shipment-from-mirrormorph");
    expect(JSON.stringify(def.onPlay)).toContain(
      "install_up_to_from_hq_paying_costs",
    );
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });

  it("Déjà Vu pulls from heap (1 or up to 2 virus)", () => {
    const def = getCardDef("deja-vu");
    expect(JSON.stringify(def.onPlay)).toContain("deja_vu_from_heap");
    expect(validateEffectTree(def.onPlay!)).toBeNull();

    const s = structuredClone(createInitialState());
    const a = instantiateCard("deja-vu", "dv", "runner:grip");
    s.cards["dv"] = a;
    const v1 = instantiateCard("medium", "v1", "runner:heap");
    const v2 = instantiateCard("parasite", "v2", "runner:heap");
    const other = instantiateCard("magnum-opus", "mo", "runner:heap");
    s.cards["v1"] = v1;
    s.cards["v2"] = v2;
    s.cards["mo"] = other;
    s.runner.discard.push("v1", "v2", "mo");
    const r = evalEffect({ state: s, sourceId: "dv" }, def.onPlay!);
    expect(r.ok).toBe(true);
    expect(s.pendingChoice).toBeTruthy();
    expect(s.pendingChoice!.options.length).toBeGreaterThanOrEqual(4);
  });

  it("Djinn is a MU-capped daemon with virus search", () => {
    const def = getCardDef("djinn");
    expect(def.daemonHost).toBe(true);
    expect(def.daemonHostMaxMu).toBe(3);
    expect(def.daemonHostExcludeIcebreaker).toBe(true);
    const ab = def.paidAbilities![0]!;
    expect(JSON.stringify(ab.effect)).toContain(
      "search_stack_subtype_add_to_grip",
    );
    expect(validateEffectTree(ab.effect)).toBeNull();
  });

  it("Medium places virus on RD success and chooses breach bonus", () => {
    const def = getCardDef("medium");
    expect(def.chooseBonusAccessLessThanVirusOnRdBreach).toBe(true);
    expect(JSON.stringify(def.onSuccessfulRun)).toContain("add_virus_counter");
    expect(JSON.stringify(def.onSuccessfulRun)).toContain("attacking_rd");
    expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
  });

  it("Demolition Run grants free access trash on HQ/R&D", () => {
    const def = getCardDef("demolition-run");
    expect(def.runEvent?.servers).toBe("hq_rd");
    expect(def.runEvent?.accessTrashFree).toBe(true);
  });

  it("Crash Space recurring spend for basic remove-tag", () => {
    const def = getCardDef("crash-space");
    expect(def.recurringSpendFor).toContain("basic_remove_tag");
  });

  it("Parasite trashes host at strength ≤0", () => {
    const def = getCardDef("parasite");
    expect(def.trashHostWhenStrengthLte).toBe(0);
  });

  it("Wyrm breaks only when ice strength ≤0", () => {
    const def = getCardDef("wyrm");
    expect(def.breaker?.breakRequiresIceStrengthLte).toBe(0);
  });

  it("Kate discounts first program/hardware install", () => {
    const def = getCardDef("kate-mac-mccaffrey-digital-tinker");
    expect(def.firstProgramOrHardwareInstallDiscount).toBe(1);
  });

  it("Noise trashes top of R&D on virus install", () => {
    const def = getCardDef("noise-hacker-extraordinaire");
    expect(JSON.stringify(def.onVirusProgramInstall)).toContain("trash_top_of_rd");
    expect(validateEffectTree(def.onVirusProgramInstall!)).toBeNull();
  });

  it("Posted Bounty may forfeit self for tag + BP", () => {
    const def = getCardDef("posted-bounty");
    expect(JSON.stringify(def.onScore)).toContain("forfeit_self");
    expect(validateEffectTree(def.onScore!)).toBeNull();
  });

  it("fx helpers still validate", () => {
    expect(validateEffectTree(fx.gainCredits("runner", 1))).toBeNull();
  });
});
