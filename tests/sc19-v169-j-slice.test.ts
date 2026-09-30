/**
 * System Core 2019 v1.69.0 J-slice: Run Amok / Tsurugi / Elizabeth Mills /
 * Kati Jones / Ice Analyzer.
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
import { creditsAvailableForInstall, spendCreditsForInstall } from "../src/state/costs.js";
import { fireHostedCreditsOnAnyIceRez } from "../src/state/powerCounters.js";

const CLEAR = [
  "run-amok",
  "tsurugi",
  "elizabeth-mills",
  "kati-jones",
  "ice-analyzer",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.132.0");
});

describe("System Core 2019 v1.69.0 J-slice", () => {
  it("declares at least 55 SC19-only clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["system-core-2019"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["system-core-2019"].cards) {
      const def = getCardDef(id);
      if ((def.unsupported ?? []).length === 0 && def.wave === "system-core-2019") {
        clear++;
      }
    }
    expect(clear).toBeGreaterThanOrEqual(55);
  });

  it("loads five clear J-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("system-core-2019");
    }
  });

  it("Run Amok trashes ice rezzed this run on run end", () => {
    const def = getCardDef("run-amok");
    expect(def.runEvent?.onRunEnd).toEqual(fx.trashIceRezzedThisRun("choose"));
    expect(validateEffectTree(def.runEvent!.onRunEnd!)).toBeNull();

    const s = structuredClone(createInitialState());
    const ice = instantiateCard("ice-wall", "iw", "server:hq:ice");
    ice.rezzed = true;
    s.cards["iw"] = ice;
    s.servers.hq.ice = ["iw"];
    s.run = {
      ...(s.run ?? ({} as never)),
      attackedServerId: "hq",
      position: 0,
      successful: true,
      iceRezzedThisRunIds: ["iw"],
    } as typeof s.run;
    s.cards["amok"] = instantiateCard("run-amok", "amok", "runner:heap");
    const r = evalEffect(
      { state: s, sourceId: "amok" },
      fx.trashIceRezzedThisRun("first"),
    );
    expect(r.ok).toBe(true);
    expect(s.servers.hq.ice).toEqual([]);
    expect(s.corp.discard).toContain("iw");
  });

  it("Tsurugi ends the run unless Corp pays 1¢", () => {
    const def = getCardDef("tsurugi");
    expect(def.subroutines?.[0]?.effect).toEqual(fx.endTheRunUnlessCorpPays(1));
    expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
    expect(def.subroutines?.length).toBe(4);

    const s = structuredClone(createInitialState());
    s.corp.credits = 0;
    s.run = {
      attackedServerId: "hq",
      position: 0,
      successful: false,
    } as typeof s.run;
    s.cards["tsu"] = instantiateCard("tsurugi", "tsu", "server:hq:ice");
    const r = evalEffect(
      { state: s, sourceId: "tsu" },
      fx.endTheRunUnlessCorpPays(1),
    );
    expect(r.ok).toBe(true);
    expect(s.run?.successful).toBe(false);
    expect(s.run?.endedTheRun || s.log.some((l) => /end the run/i.test(l))).toBeTruthy();
  });

  it("Elizabeth Mills removes BP on rez and trashes a location", () => {
    const def = getCardDef("elizabeth-mills");
    expect(def.onRez).toEqual({
      op: "do",
      action: { kind: "remove_bad_publicity", amount: 1 },
    });
    expect(validateEffectTree(def.onRez!)).toBeNull();
    expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();

    const s = structuredClone(createInitialState());
    const loc = instantiateCard("earthrise-hotel", "loc", "runner:rig");
    s.cards["loc"] = loc;
    s.runner.rig = ["loc"];
    s.cards["mills"] = instantiateCard("elizabeth-mills", "mills", "server:remote1:root");
    const r = evalEffect(
      { state: s, sourceId: "mills" },
      fx.trashInstalledResourceWithSubtype("location", "first"),
    );
    expect(r.ok).toBe(true);
    expect(s.runner.rig).toEqual([]);
    expect(s.runner.discard).toContain("loc");
  });

  it("Kati Jones shares once-per-turn across paid abilities", () => {
    const def = getCardDef("kati-jones");
    expect(def.paidAbilitiesOncePerTurn).toBe(true);
    expect(def.paidAbilities?.length).toBe(2);
    expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();
    expect(validateEffectTree(def.paidAbilities![1]!.effect)).toBeNull();
  });

  it("Ice Analyzer gains hosted credits on ice rez for program installs", () => {
    const def = getCardDef("ice-analyzer");
    expect(def.hostedCreditsOnAnyIceRez).toBe(1);
    expect(def.hostedCreditsSpendFor).toEqual(["install"]);
    expect(def.hostedCreditsSpendForInstallTypes).toEqual(["program"]);

    const s = structuredClone(createInitialState());
    const ia = instantiateCard("ice-analyzer", "ia", "runner:rig");
    ia.hostedCreditsOnAnyIceRez = 1;
    s.cards["ia"] = ia;
    s.runner.rig = ["ia"];
    const ice = instantiateCard("ice-wall", "iw", "server:hq:ice");
    ice.rezzed = true;
    s.cards["iw"] = ice;
    fireHostedCreditsOnAnyIceRez(s, "iw");
    expect(ia.hostedCredits).toBe(1);

    s.runner.credits = 0;
    const prog = instantiateCard("fermenter", "fv", "runner:grip");
    s.cards["fv"] = prog;
    expect(creditsAvailableForInstall(s, "runner", prog)).toBe(1);
    spendCreditsForInstall(s, "runner", 1, prog);
    expect(ia.hostedCredits).toBe(0);

    ia.hostedCredits = 1;
    const hw = instantiateCard("akamatsu-mem-chip", "chip", "runner:grip");
    s.cards["chip"] = hw;
    expect(creditsAvailableForInstall(s, "runner", hw)).toBe(0);
  });
});
