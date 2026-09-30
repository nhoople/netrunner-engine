/**
 * Reign and Reverie v1.83.0 H-slice: Eavesdrop / District 99 / Mâché /
 * Reboot / Saraswati Mnemonics.
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

const CLEAR = [
  "eavesdrop",
  "district-99",
  "mache",
  "reboot",
  "saraswati-mnemonics-endless-exploration",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.99.0");
});

describe("Reign and Reverie v1.83.0 H-slice", () => {
  it("declares reign-and-reverie supported with at least 45 RaR-only clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["reign-and-reverie"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["reign-and-reverie"].cards) {
      const def = getCardDef(id);
      if (
        (def.unsupported ?? []).length === 0 &&
        def.wave === "reign-and-reverie"
      ) {
        clear++;
      }
    }
    expect(clear).toBeGreaterThanOrEqual(45);
  });

  it("loads five clear H-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("reign-and-reverie");
    }
  });

  it("Eavesdrop hosts as condition with Trace on host encounter", () => {
    const def = getCardDef("eavesdrop");
    expect(def.onPlay).toEqual({
      op: "do",
      action: { kind: "host_on_ice_as_condition" },
    });
    expect(validateEffectTree(def.onPlay!)).toBeNull();
    expect(def.onHostEncounter).toBeTruthy();
    expect(JSON.stringify(def.onHostEncounter)).toContain('"kind":"trace"');
    expect(validateEffectTree(def.onHostEncounter!)).toBeNull();
  });

  it("District 99 places power on first program/hardware trash; heap return", () => {
    const def = getCardDef("district-99");
    expect(def.onFirstProgramOrHardwareTrashEachTurn).toBeTruthy();
    expect(
      validateEffectTree(def.onFirstProgramOrHardwareTrashEachTurn!),
    ).toBeNull();
    const ab = def.paidAbilities?.find((a) => a.id === "district-99-heap");
    expect(ab?.cost?.powerCounters).toBe(3);
    expect(JSON.stringify(ab?.effect)).toContain("matchingIdentityFaction");
    expect(validateEffectTree(ab!.effect)).toBeNull();
  });

  it("Mâché places power equal to access trash cost; paid draw", () => {
    const def = getCardDef("mache");
    expect(def.onFirstAccessTrashEachTurn).toBeTruthy();
    expect(JSON.stringify(def.onFirstAccessTrashEachTurn)).toContain(
      "add_power_counter_equal_to_last_access_trash_cost",
    );
    expect(validateEffectTree(def.onFirstAccessTrashEachTurn!)).toBeNull();
    const ab = def.paidAbilities?.find((a) => a.id === "mache-draw");
    expect(ab?.cost?.powerCounters).toBe(3);
    expect(JSON.stringify(ab?.effect)).toContain("draw");
  });

  it("Reboot installs up to 5 from heap facedown then RFGs", () => {
    const def = getCardDef("reboot");
    expect(def.runEvent?.servers).toBe("archives");
    expect(def.runEvent?.skipBreach).toBe(true);
    expect(JSON.stringify(def.runEvent?.onSuccessfulRun)).toContain(
      "install_up_to_from_heap_facedown",
    );
    expect(JSON.stringify(def.runEvent?.onSuccessfulRun)).toContain("rfg_self");
    expect(validateEffectTree(def.runEvent!.onSuccessfulRun!)).toBeNull();
  });

  it("Saraswati installs+advances with lock until next Corp turn", () => {
    const def = getCardDef("saraswati-mnemonics-endless-exploration");
    const ab = def.paidAbilities?.[0];
    expect(ab?.cost?.clicks).toBe(1);
    expect(ab?.cost?.credits).toBe(1);
    expect(JSON.stringify(ab?.effect)).toContain(
      "install_from_hq_on_remote_root_place_advancement_cannot_score_or_rez_until_next_corp_turn",
    );
    expect(validateEffectTree(ab!.effect)).toBeNull();
  });
});
