/**
 * RWR v0.94: Hearts and Minds / Warm Reception / Basalt Spire / Juli / Alarm Clock.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
  loadCardCatalog,
  validateEffectTree,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.106.0");
});

describe("RWR v0.94 Hearts / Warm Reception / Basalt / Juli / Alarm Clock", () => {
  it("loads five clear cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of [
      "hearts-and-minds",
      "warm-reception",
      "the-basalt-spire",
      "juli-moreira-lee",
      "alarm-clock",
    ]) {
      expect(catalog.get(id)!.unsupported ?? [], id).toEqual([]);
    }
  });

  it("Hearts and Minds moves/places advancements at turn begin", () => {
    const def = getCardDef("hearts-and-minds");
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    expect(JSON.stringify(def.onTurnBegin)).toContain("move_advancements");
    expect(JSON.stringify(def.onTurnBegin)).toContain(
      "host_server_unprotected_by_ice",
    );
  });

  it("Warm Reception may install and may derez-pair when unprotected", () => {
    const def = getCardDef("warm-reception");
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    expect(JSON.stringify(def.onTurnBegin)).toContain(
      "may_install_from_hq_paying_costs",
    );
    expect(JSON.stringify(def.onTurnBegin)).toContain("derez_source");
  });

  it("Basalt Spire scores agenda counters and mills R&D", () => {
    const def = getCardDef("the-basalt-spire");
    expect(validateEffectTree(def.onSteal!)).toBeNull();
    expect(validateEffectTree(def.onScore!)).toBeNull();
    expect(def.paidAbilities?.[0]?.oncePerTurn).toBe(true);
    expect(JSON.stringify(def.paidAbilities?.[0]?.effect)).toContain(
      "trash_top_of_rd",
    );
  });

  it("Juli loads power and reacts to first resource paid ability", () => {
    const def = getCardDef("juli-moreira-lee");
    expect(def.powerCountersOnInstall).toBe(4);
    expect(def.trashWhenPowerEmpty).toBe(true);
    expect(
      validateEffectTree(def.onFirstResourcePaidAbilityEachTurn!),
    ).toBeNull();
  });

  it("Alarm Clock may start an HQ run with 2-click first-encounter bypass", () => {
    const def = getCardDef("alarm-clock");
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    expect(JSON.stringify(def.onTurnBegin)).toContain("may_start_run");
    expect(JSON.stringify(def.onTurnBegin)).toContain(
      "bypassFirstEncounterForClicks",
    );
  });
});
