/**
 * Reign and Reverie v1.78.0 C-slice: Insight / Under the Bus / Thimblerig /
 * Gatekeeper / Game Changer.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  fx,
  getCardDef,
  loadCardCatalog,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";

const CLEAR = [
  "insight",
  "under-the-bus",
  "thimblerig",
  "gatekeeper",
  "game-changer",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.137.0");
});

describe("Reign and Reverie v1.78.0 C-slice", () => {
  it("declares reign-and-reverie supported with at least 20 RaR-only clears", () => {
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
    expect(clear).toBeGreaterThanOrEqual(20);
  });

  it("loads five clear C-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("reign-and-reverie");
    }
  });

  it("Insight may arrange top 4 R&D then reveal_top_n_rd", () => {
    const def = getCardDef("insight");
    expect(def.playAdditionalClick).toBe(true);
    expect(def.onPlay?.op).toBe("seq");
    expect(JSON.stringify(def.onPlay)).toContain("look_top_n_rd_arrange");
    expect(JSON.stringify(def.onPlay)).toContain("reveal_top_n_rd");
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });

  it("Under the Bus requires access last turn then trashes connection + BP", () => {
    const def = getCardDef("under-the-bus");
    expect(def.playRequiresRunnerAccessedCardLastTurn).toBe(true);
    expect(def.onPlay).toEqual({
      op: "seq",
      effects: [
        fx.do({
          kind: "trash_installed_resource_with_subtype",
          subtype: "connection",
          pick: "choose",
        }),
        fx.do({ kind: "give_bad_publicity", amount: 1 }),
      ],
    });
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });

  it("Thimblerig may swap ice on turn begin and on pass", () => {
    const def = getCardDef("thimblerig");
    expect(JSON.stringify(def.onTurnBegin)).toContain(
      "may_swap_ice_with_other_installed",
    );
    expect(JSON.stringify(def.onPass)).toContain(
      "may_swap_ice_with_other_installed",
    );
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    expect(validateEffectTree(def.onPass!)).toBeNull();
  });

  it("Gatekeeper has +6 strength if rezzed this turn", () => {
    const def = getCardDef("gatekeeper");
    expect(def.strengthBonusIfRezzedThisTurn).toBe(6);
    expect(def.strength).toBe(0);
    expect(JSON.stringify(def.subroutines)).toContain("draw_up_to");
    expect(JSON.stringify(def.subroutines)).toContain(
      "may_reveal_shuffle_agendas_into_rd",
    );
    for (const sub of def.subroutines ?? []) {
      expect(validateEffectTree(sub.effect)).toBeNull();
    }
  });

  it("Game Changer gains clicks equal to Runner scored agendas then RFGs", () => {
    const def = getCardDef("game-changer");
    expect(def.rfgInsteadOfTrashing).toBe(true);
    expect(def.onPlay).toEqual({
      op: "do",
      action: { kind: "gain_clicks_equal_to_runner_scored_agendas" },
    });
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });
});
