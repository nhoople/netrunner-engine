/**
 * Downfall v1.48.0 A-slice: Congratulations! / Gauss / Spec Work /
 * Nanoetching Matrix / Sandstone.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createGame,
  crDataPresent,
  effectiveIceStrength,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  loadCardCatalog,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";

const CLEAR = [
  "congratulations",
  "gauss",
  "spec-work",
  "nanoetching-matrix",
  "sandstone",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.141.0");
});

describe("Downfall v1.48.0 A-slice", () => {
  it("declares downfall supported with at least 10 clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["downfall"].status).toBe("supported");
    expect(pool.waves["downfall"].cards).toHaveLength(65);
    let clear = 0;
    for (const id of pool.waves["downfall"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(10);
  });

  it("loads five new clear A-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("downfall");
    }
  });

  it("Congratulations! gains 1¢ on pass and has credit subroutine", () => {
    const def = getCardDef("congratulations");
    expect(def.onPass).toEqual(fx.gainCredits("corp", 1));
    expect(validateEffectTree(def.onPass!)).toBeNull();
    expect(def.subroutines).toHaveLength(1);
    expect(def.subroutines![0]!.effect).toEqual(
      fx.seq(fx.gainCredits("corp", 2), fx.gainCredits("runner", 1)),
    );
    expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
  });

  it("Gauss is a fracter with +3 strength this turn on install", () => {
    const def = getCardDef("gauss");
    expect(def.breaker).toEqual({
      breaksSubtype: "barrier",
      strength: 1,
      breakCredits: 1,
      breakMaxSubs: 1,
      pumpCredits: 2,
      pumpStrength: 2,
    });
    expect(def.onInstall).toEqual(
      fx.do({ kind: "gain_strength_this_turn", amount: 3 }),
    );
    expect(validateEffectTree(def.onInstall!)).toBeNull();
    expect(def.paidAbilities?.[0]?.effect).toEqual(
      fx.do({ kind: "pump_strength", amount: 2 }),
    );
  });

  it("Spec Work trashes a program as additional cost and gains 4¢ + draw 2", () => {
    const def = getCardDef("spec-work");
    expect(def.playCost).toBe(1);
    expect(def.playRequiresInstalledProgram).toBe(true);
    expect(def.playAdditionalCost).toEqual(fx.trashOwnProgram());
    expect(def.onPlay).toEqual(
      fx.seq(fx.gainCredits("runner", 4), fx.draw("runner", 2)),
    );
    expect(validateEffectTree(def.playAdditionalCost!)).toBeNull();
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });

  it("Nanoetching Matrix has once-per-turn click gain and onTrash may gain", () => {
    const def = getCardDef("nanoetching-matrix");
    expect(def.paidAbilities).toHaveLength(1);
    const ab = def.paidAbilities![0]!;
    expect(ab.oncePerTurn).toBe(true);
    expect(ab.clickCost).toBe(1);
    expect(ab.windows).toContain("corp_action_paw");
    expect(ab.effect).toEqual(fx.gainCredits("corp", 2));
    expect(validateEffectTree(ab.effect)).toBeNull();
    expect(def.onTrash).toEqual(
      fx.choose("corp", [
        {
          id: "gain",
          label: "Gain 2¢",
          effect: fx.gainCredits("corp", 2),
        },
        {
          id: "decline",
          label: "Decline",
          effect: fx.gainCredits("corp", 0),
        },
      ]),
    );
    expect(validateEffectTree(def.onTrash!)).toBeNull();
  });

  it("Sandstone places virus on encounter and loses strength per virus", () => {
    const def = getCardDef("sandstone");
    expect(def.strengthPerVirusCounter).toBe(-1);
    expect(def.onEncounter).toEqual(fx.addVirusCounter(1));
    expect(validateEffectTree(def.onEncounter!)).toBeNull();
    expect(def.subroutines).toHaveLength(1);
    expect(def.subroutines![0]!.effect).toEqual(
      fx.do({ kind: "end_the_run" }),
    );

    const state = createGame({ seed: 1 });
    const ice = instantiateCard("sandstone", "ss1", "server:hq:ice");
    state.cards[ice.id] = ice;
    state.servers.hq.ice.push(ice.id);
    ice.rezzed = true;
    ice.virusCounters = 0;
    expect(effectiveIceStrength(state, ice.id)).toBe(6);
    const place = evalEffect(
      { state, sourceId: ice.id },
      fx.addVirusCounter(1),
    );
    expect(place.ok).toBe(true);
    expect(ice.virusCounters).toBe(1);
    expect(effectiveIceStrength(state, ice.id)).toBe(5);
  });
});
