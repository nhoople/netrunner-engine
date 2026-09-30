/**
 * System Core 2019 v1.71.0 L-slice: Fetal AI / Data Raven / Red Herrings /
 * Public Support / Project Junebug.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  loadCardCatalog,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";

const CLEAR = [
  "fetal-ai",
  "data-raven",
  "red-herrings",
  "public-support",
  "project-junebug",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.93.0");
});

describe("System Core 2019 v1.71.0 L-slice", () => {
  it("declares at least 65 SC19-only clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["system-core-2019"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["system-core-2019"].cards) {
      const def = getCardDef(id);
      if ((def.unsupported ?? []).length === 0 && def.wave === "system-core-2019") {
        clear++;
      }
    }
    expect(clear).toBeGreaterThanOrEqual(65);
  });

  it("loads five clear L-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("system-core-2019");
    }
  });

  it("Fetal AI reveals from R&D, nets on access, and costs 2¢ to steal", () => {
    const def = getCardDef("fetal-ai");
    expect(def.mustRevealWhenAccessedFromRd).toBe(true);
    expect(def.skipOnAccessFromArchives).toBe(true);
    expect(def.stealAdditionalCredits).toBe(2);
    expect(def.onAccess).toEqual(fx.netDamage(2));
    expect(validateEffectTree(def.onAccess!)).toBeNull();
  });

  it("Data Raven uses Funhouse-class encounter and Trace→power", () => {
    const def = getCardDef("data-raven");
    expect(def.onEncounter).toEqual(fx.endTheRunUnlessTakeTags(1));
    expect(validateEffectTree(def.onEncounter!)).toBeNull();
    expect(def.paidAbilities?.[0]?.cost).toEqual({ powerCounters: 1 });
    expect(def.paidAbilities?.[0]?.effect).toEqual(fx.giveTags(1));
    expect(JSON.stringify(def.subroutines?.[0]?.effect)).toContain("trace");
    expect(JSON.stringify(def.subroutines?.[0]?.effect)).toContain(
      "add_power_counter",
    );
    expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
  });

  it("Red Herrings is Persistent with server steal credit cost", () => {
    const def = getCardDef("red-herrings");
    expect(def.persistent).toBe(true);
    expect(def.stealAdditionalCreditsFromProtectingServer).toBe(5);
  });

  it("Public Support scores when power counters empty", () => {
    const def = getCardDef("public-support");
    expect(def.powerCountersOnRez).toBe(3);
    expect(def.scoreWhenPowerEmpty).toEqual({ agendaPoints: 1 });
    expect(def.onTurnBegin).toEqual(fx.removePowerCounter(1));
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();

    const s = structuredClone(createInitialState());
    const ps = instantiateCard("public-support", "ps", "server:remote-1:root");
    ps.powerCounters = 1;
    ps.scoreWhenPowerEmpty = { agendaPoints: 1 };
    ps.rezzed = true;
    s.cards["ps"] = ps;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["ps"],
    };
    const r = evalEffect(
      { state: s, sourceId: "ps" },
      fx.removePowerCounter(1),
    );
    expect(r.ok).toBe(true);
    expect(s.corp.score).toContain("ps");
    expect(ps.agendaPoints).toBe(1);
  });

  it("Project Junebug may pay 1¢ for 2 net per advancement", () => {
    const def = getCardDef("project-junebug");
    expect(def.canAdvance).toBe(true);
    expect(def.onAccess).toEqual(
      fx.mayPayCreditsForNetDamagePerAdvancement(1, 2),
    );
    expect(validateEffectTree(def.onAccess!)).toBeNull();

    const s = structuredClone(createInitialState());
    s.corp.credits = 1;
    const jb = instantiateCard("project-junebug", "jb", "server:remote-1:root");
    jb.advancementTokens = 2;
    s.cards["jb"] = jb;
    const r = evalEffect(
      { state: s, sourceId: "jb" },
      fx.mayPayCreditsForNetDamagePerAdvancement(1, 2),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.some((o) => o.id === "pay")).toBe(true);
  });
});
