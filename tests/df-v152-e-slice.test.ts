/**
 * Downfall v1.52.0 E-slice: Trebuchet / Blueberry!™ Diesel / Pelangi /
 * Utae / Loot Box.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  effectiveIceSubtypes,
  fx,
  getCardDef,
  loadCardCatalog,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";
import type { GameState } from "../src/state/types.js";
import { createInitialState, instantiateCard } from "../src/index.js";

const CLEAR = [
  "trebuchet",
  "blueberry-diesel",
  "pelangi",
  "utae",
  "loot-box",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.109.0");
});

describe("Downfall v1.52.0 E-slice", () => {
  it("declares downfall supported with at least 30 clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["downfall"].status).toBe("supported");
    expect(pool.waves["downfall"].cards).toHaveLength(65);
    let clear = 0;
    for (const id of pool.waves["downfall"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(30);
  });

  it("loads five new clear E-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("downfall");
    }
  });

  it("Trebuchet takes BP on rez, trashes installed, Trace[6] forbids steal/trash", () => {
    const def = getCardDef("trebuchet");
    expect(def.onRez).toEqual(
      fx.do({ kind: "give_bad_publicity", amount: 1 }),
    );
    expect(validateEffectTree(def.onRez!)).toBeNull();
    expect(def.subroutines).toHaveLength(2);
    expect(JSON.stringify(def.subroutines![0]!.effect)).toContain(
      "trash_installed_runner",
    );
    expect(JSON.stringify(def.subroutines![1]!.effect)).toContain(
      '"strength":6',
    );
    expect(JSON.stringify(def.subroutines![1]!.effect)).toContain(
      "forbid_steal_trash_this_run",
    );
    expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
    expect(validateEffectTree(def.subroutines![1]!.effect)).toBeNull();
  });

  it("Blueberry Diesel looks at top 2, may bottom one, then draws 2", () => {
    const def = getCardDef("blueberry-diesel");
    expect(def.onPlay).toEqual(
      fx.seq(
        fx.do({ kind: "look_top_n_stack_may_bottom_one", n: 2 }),
        fx.draw("runner", 2),
      ),
    );
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });

  it("Pelangi installs with 2 virus and grants encounter subtype", () => {
    const def = getCardDef("pelangi");
    expect(def.onInstall).toEqual(
      fx.do({ kind: "add_virus_counter", amount: 2 }),
    );
    expect(validateEffectTree(def.onInstall!)).toBeNull();
    expect(def.paidAbilities).toHaveLength(1);
    const ab = def.paidAbilities![0]!;
    expect(ab.cost?.virusCounters).toBe(1);
    expect(ab.oncePerTurn).toBe(true);
    expect(ab.windows).toContain("encounter_paw");
    expect(JSON.stringify(ab.effect)).toContain(
      "choose_grant_encounter_ice_subtype",
    );
    expect(validateEffectTree(ab.effect)).toBeNull();

    let s: GameState = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("afshar", "ice-1", "server:hq:ice");
    s.cards["ice-1"] = ice;
    s.servers.hq!.ice = ["ice-1"];
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: {
        iceId: "ice-1",
        broken: [false, false],
        grantedSubtypes: ["sentry"],
      },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
    };
    const subs = effectiveIceSubtypes(s, "ice-1");
    expect(subs).toContain("code gate");
    expect(subs).toContain("sentry");
  });

  it("Utae is code-gate breaker with X-break once/run and virtual break", () => {
    const def = getCardDef("utae");
    expect(def.breaker?.breaksSubtype).toBe("code gate");
    expect(def.breaker?.breakViaPaidAbilityOnly).toBe(true);
    expect(def.paidAbilities).toHaveLength(3);
    const xBreak = def.paidAbilities!.find((a) => a.id === "utae-break-x")!;
    expect(xBreak.oncePerRun).toBe(true);
    expect(JSON.stringify(xBreak.effect)).toContain("payCreditsPerBrokenSub");
    expect(validateEffectTree(xBreak.effect)).toBeNull();
    const virt = def.paidAbilities!.find((a) => a.id === "utae-break-virtual")!;
    expect(virt.requireInstalledVirtualResourcesGte).toBe(3);
    expect(virt.creditCost).toBe(1);
    expect(validateEffectTree(virt.effect)).toBeNull();
    const pump = def.paidAbilities!.find((a) => a.id === "utae-pump")!;
    expect(JSON.stringify(pump.effect)).toContain("pump_strength");
    expect(validateEffectTree(pump.effect)).toBeNull();
  });

  it("Loot Box has ETR-unless-pay-2 and reveal-top-3 gain", () => {
    const def = getCardDef("loot-box");
    expect(def.subroutines).toHaveLength(2);
    const pay = def.subroutines![0]!.effect;
    expect(pay.op).toBe("choose");
    expect(JSON.stringify(pay)).toContain("lose_credits");
    expect(JSON.stringify(pay)).toContain("end_the_run");
    expect(validateEffectTree(pay)).toBeNull();
    expect(def.subroutines![1]!.effect).toEqual(
      fx.do({ kind: "loot_box_reveal_top_n", n: 3 }),
    );
    expect(validateEffectTree(def.subroutines![1]!.effect)).toBeNull();
  });
});
