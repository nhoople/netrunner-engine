/**
 * RWR v0.90: Charlotte / Janaína / Arruaceiras / Logjam / Hammer.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
  loadCardCatalog,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.96.0");
});

describe("RWR v0.90 Charlotte / Janaína / Arruaceiras / Logjam / Hammer", () => {
  it("loads five clear cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of [
      "charlotte-cacador",
      "janaina-jk-dumont-kindelan",
      "arruaceiras-crew",
      "logjam",
      "hammer",
    ]) {
      expect(catalog.get(id)!.unsupported ?? [], id).toEqual([]);
    }
  });

  it("Charlotte is advanceable with turn-begin and trash abilities", () => {
    const def = getCardDef("charlotte-cacador");
    expect(def.canAdvance).toBe(true);
    expect(def.onTurnBegin?.op).toBe("choose");
    expect(def.paidAbilities?.[0]?.cost?.trashSelf).toBe(true);
  });

  it("Janaína places hosted credits and returns to HQ", () => {
    const def = getCardDef("janaina-jk-dumont-kindelan");
    expect(def.onTurnBegin).toEqual({
      op: "do",
      action: { kind: "place_hosted_credits", amount: 3 },
    });
    const eff = def.paidAbilities?.[0]?.effect as { effects: unknown[] };
    expect(JSON.stringify(eff)).toContain("return_source_to_hq");
  });

  it("Arruaceiras weakens and trashes weak ice", () => {
    const def = getCardDef("arruaceiras-crew");
    expect(def.paidAbilities).toHaveLength(2);
    expect(def.paidAbilities?.[1]?.effect).toEqual({
      op: "do",
      action: { kind: "trash_encounter_ice_if_strength_lte", maxStrength: 0 },
    });
  });

  it("Logjam advances from Archives types", () => {
    const def = getCardDef("logjam");
    expect(def.strengthPerAdvancement).toBe(1);
    expect(def.onRez).toEqual({
      op: "do",
      action: {
        kind: "place_advancements_on_self_per_faceup_archive_types",
        base: 1,
      },
    });
  });

  it("Hammer limits breaks except killers", () => {
    const def = getCardDef("hammer");
    expect(def.maxPrintedSubsBreakExceptSubtype).toBe("killer");
    expect(def.subroutines).toHaveLength(3);
  });
});
