/**
 * Reign and Reverie v1.81.0 E-slice: Jumon / Ika / Mind's Eye / Drudge Work /
 * Hijacked Router.
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
  "jumon",
  "ika",
  "minds-eye",
  "drudge-work",
  "hijacked-router",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.142.1");
});

describe("Reign and Reverie v1.81.0 E-slice", () => {
  it("declares reign-and-reverie supported with at least 30 RaR-only clears", () => {
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
    expect(clear).toBeGreaterThanOrEqual(30);
  });

  it("loads five clear E-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("reign-and-reverie");
    }
  });

  it("Jumon places 2 advancements on a remote root at Corp turn end", () => {
    const def = getCardDef("jumon");
    expect(def.onCorpTurnEnd).toEqual({
      op: "do",
      action: {
        kind: "place_advancements",
        amount: 2,
        onlyRemoteRoot: true,
        pick: "choose",
      },
    });
    expect(validateEffectTree(def.onCorpTurnEnd!)).toBeNull();
  });

  it("Ika is a host killer with rehost, break up to 2, and pump", () => {
    const def = getCardDef("ika");
    expect(def.breaker?.breaksSubtype).toBe("sentry");
    expect(def.breaker?.breakViaPaidAbilityOnly).toBe(true);
    expect(def.breaker?.breakMaxSubs).toBe(2);
    const breakAb = def.paidAbilities?.find((a) => a.id === "ika-break");
    expect(breakAb?.effect).toEqual({
      op: "do",
      action: {
        kind: "break_host_subroutine",
        maxSubs: 2,
        requireSubtype: "sentry",
      },
    });
    expect(validateEffectTree(breakAb!.effect)).toBeNull();
    const hostAb = def.paidAbilities?.find((a) => a.id === "ika-host");
    expect(JSON.stringify(hostAb?.effect)).toContain("rehost_on_other_ice");
  });

  it("Mind's Eye charges on R&D success and breaches without root access", () => {
    const def = getCardDef("minds-eye");
    expect(def.muBonus).toBe(1);
    expect(def.unique).toBe(true);
    expect(JSON.stringify(def.onSuccessfulRun)).toContain("attacking_rd");
    expect(JSON.stringify(def.onSuccessfulRun)).toContain("add_power_counter");
    const breach = def.paidAbilities?.find((a) => a.id === "minds-eye-breach-rd");
    expect(breach?.effect).toEqual({
      op: "do",
      action: {
        kind: "breach_server_standalone",
        server: "rd",
        cannotAccessRoot: true,
      },
    });
    expect(validateEffectTree(breach!.effect)).toBeNull();
  });

  it("Drudge Work loads power on rez and reveals agendas for AP credits", () => {
    const def = getCardDef("drudge-work");
    expect(def.powerCountersOnRez).toBe(3);
    expect(def.trashWhenPowerEmpty).toBe(true);
    const ab = def.paidAbilities?.find((a) => a.id === "drudge-work-reveal");
    expect(ab?.effect).toEqual({
      op: "do",
      action: { kind: "reveal_agenda_hq_or_archives_gain_ap_shuffle" },
    });
    expect(validateEffectTree(ab!.effect)).toBeNull();
  });

  it("Hijacked Router taxes create-server and may trash on Archives", () => {
    const def = getCardDef("hijacked-router");
    expect(def.corpLosesCreditsOnCreateServer).toBe(1);
    expect(def.unique).toBe(true);
    expect(JSON.stringify(def.onSuccessfulRun)).toContain("attacking_archives");
    expect(JSON.stringify(def.onSuccessfulRun)).toContain("trash_self");
    expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
  });
});
