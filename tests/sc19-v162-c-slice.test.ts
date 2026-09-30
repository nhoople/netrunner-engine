/**
 * System Core 2019 v1.62.0 C-slice: Demara / Himitsu-Bako /
 * Marked Accounts / Modded / Chaos Theory: Wünderkind.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createGame,
  crDataPresent,
  fx,
  getCardDef,
  instantiateCard,
  loadCardCatalog,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";
import { memoryLimit } from "../src/state/turn.js";

const CLEAR = [
  "demara",
  "himitsu-bako",
  "marked-accounts",
  "modded",
  "chaos-theory-wunderkind",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.89.0");
});

describe("System Core 2019 v1.62.0 C-slice", () => {
  it("declares at least 20 SC19-only clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["system-core-2019"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["system-core-2019"].cards) {
      const def = getCardDef(id);
      if ((def.unsupported ?? []).length === 0 && def.wave === "system-core-2019") {
        clear++;
      }
    }
    expect(clear).toBeGreaterThanOrEqual(20);
  });

  it("loads five clear C-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("system-core-2019");
    }
  });

  it("Demara is a barrier fracter with trash-self bypass", () => {
    const def = getCardDef("demara");
    expect(def.breaker).toEqual({
      breaksSubtype: "barrier",
      strength: 1,
      breakCredits: 2,
      breakMaxSubs: 2,
      pumpCredits: 2,
      pumpStrength: 3,
    });
    expect(def.paidAbilities?.[0]?.effect).toEqual(fx.pump(3));
    expect(def.paidAbilities?.[1]?.cost).toEqual({ trashSelf: true });
    expect(def.paidAbilities?.[1]?.requireEncounterSubtype).toBe("barrier");
    expect(def.paidAbilities?.[1]?.effect).toEqual(
      fx.do({ kind: "bypass_current_ice", requireSubtype: "barrier" }),
    );
    expect(validateEffectTree(def.paidAbilities![0].effect)).toBeNull();
    expect(validateEffectTree(def.paidAbilities![1].effect)).toBeNull();
  });

  it("Himitsu-Bako returns to HQ and has ETR", () => {
    const def = getCardDef("himitsu-bako");
    expect(def.subtypes).toContain("barrier");
    expect(def.paidAbilities?.[0]?.effect).toEqual(
      fx.do({ kind: "return_source_to_hq" }),
    );
    expect(def.subroutines).toHaveLength(1);
    expect(def.subroutines![0].effect).toEqual(fx.etr());
    expect(validateEffectTree(def.paidAbilities![0].effect)).toBeNull();
    expect(validateEffectTree(def.subroutines![0].effect)).toBeNull();
  });

  it("Marked Accounts takes 1¢ on turn begin and places 3¢", () => {
    const def = getCardDef("marked-accounts");
    expect(def.onTurnBegin).toEqual(
      fx.do({ kind: "take_hosted_credits", amount: 1 }),
    );
    expect(def.paidAbilities?.[0]?.effect).toEqual(
      fx.do({ kind: "place_hosted_credits", amount: 3 }),
    );
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    expect(validateEffectTree(def.paidAbilities![0].effect)).toBeNull();
  });

  it("Modded installs program/hardware from grip at −3", () => {
    const def = getCardDef("modded");
    expect(def.onPlay).toEqual(
      fx.do({
        kind: "install_from_grip_discount",
        types: ["program", "hardware"],
        discount: 3,
      }),
    );
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });

  it("Chaos Theory identity grants +1 MU via memoryLimit", () => {
    const def = getCardDef("chaos-theory-wunderkind");
    expect(def.type).toBe("identity");
    expect(def.muBonus).toBe(1);

    const state = createGame({ seed: 1 });
    const base = memoryLimit(state);
    const id = instantiateCard(
      "chaos-theory-wunderkind",
      "ct-id",
      "runner:identity",
    );
    state.cards[id.id] = id;
    state.runner.identityId = id.id;
    expect(memoryLimit(state)).toBe(base + 1);
  });
});
