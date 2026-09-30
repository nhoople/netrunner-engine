/**
 * System Core 2019 v1.70.0 K-slice: Faerie / Datasucker / Stimhack /
 * Turing / Spear Phishing.
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
import { modifiersFromStartsRun } from "../src/state/runStart.js";

const CLEAR = [
  "faerie",
  "datasucker",
  "stimhack",
  "turing",
  "spear-phishing",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.99.0");
});

describe("System Core 2019 v1.70.0 K-slice", () => {
  it("declares at least 60 SC19-only clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["system-core-2019"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["system-core-2019"].cards) {
      const def = getCardDef(id);
      if ((def.unsupported ?? []).length === 0 && def.wave === "system-core-2019") {
        clear++;
      }
    }
    expect(clear).toBeGreaterThanOrEqual(60);
  });

  it("loads five clear K-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("system-core-2019");
    }
  });

  it("Faerie is a 0¢ sentry breaker that trashes after breaking this run", () => {
    const def = getCardDef("faerie");
    expect(def.breaker?.breaksSubtype).toBe("sentry");
    expect(def.breaker?.breakCredits).toBe(0);
    expect(def.trashAfterBreakingThisRun).toBe(true);
    expect(def.paidAbilities?.some((a) => a.id === "faerie-pump")).toBe(true);
  });

  it("Datasucker places virus on central success and weakens encounter ice", () => {
    const def = getCardDef("datasucker");
    expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
    expect(JSON.stringify(def.onSuccessfulRun)).toContain("attacking_central");
    expect(JSON.stringify(def.onSuccessfulRun)).toContain("add_virus_counter");
    expect(def.paidAbilities?.[0]?.cost).toEqual({ virusCounters: 1 });
    expect(def.paidAbilities?.[0]?.effect).toEqual(fx.weakenIce(1));
    expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();
  });

  it("Stimhack places 9 event credits and deals unpreventable core on run end", () => {
    const def = getCardDef("stimhack");
    expect(def.runEvent?.placeEventCredits).toBe(9);
    expect(def.runEvent?.onRunEnd).toEqual(
      fx.coreDamage(1, { cannotPrevent: true }),
    );
    expect(validateEffectTree(def.runEvent!.onRunEnd!)).toBeNull();

    const s = structuredClone(createInitialState());
    for (let i = 0; i < 4; i++) {
      const id = `filler-${i}`;
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }
    const beforeHand = s.runner.hand.length;
    s.cards["stim"] = instantiateCard("stimhack", "stim", "runner:heap");
    const r = evalEffect(
      { state: s, sourceId: "stim" },
      fx.coreDamage(1, { cannotPrevent: true }),
    );
    expect(r.ok).toBe(true);
    expect(s.runner.brainDamage).toBe(1);
    expect(s.runner.hand.length).toBe(beforeHand - 1);
  });

  it("Turing has remote strength, blocks AI, and ETR-unless-clicks", () => {
    const def = getCardDef("turing");
    expect(def.strengthBonusProtectingRemote).toBe(3);
    expect(def.cannotBreakWithAi).toBe(true);
    expect(def.subroutines?.[0]?.effect).toEqual(
      fx.endTheRunUnlessRunnerSpendsClicks(3),
    );
    expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();

    const s = structuredClone(createInitialState());
    s.runner.clicks = 0;
    s.run = {
      attackedServerId: "remote1",
      position: 0,
      successful: false,
    } as typeof s.run;
    s.cards["tur"] = instantiateCard("turing", "tur", "server:remote1:ice");
    const r = evalEffect(
      { state: s, sourceId: "tur" },
      fx.endTheRunUnlessRunnerSpendsClicks(3),
    );
    expect(r.ok).toBe(true);
    expect(
      s.run?.endedTheRun || s.log.some((l) => /end the run/i.test(l)),
    ).toBeTruthy();

    const s2 = structuredClone(createInitialState());
    s2.runner.clicks = 3;
    s2.run = {
      attackedServerId: "remote1",
      position: 0,
      successful: false,
    } as typeof s2.run;
    s2.cards["tur"] = instantiateCard("turing", "tur", "server:remote1:ice");
    const r2 = evalEffect(
      { state: s2, sourceId: "tur" },
      fx.endTheRunUnlessRunnerSpendsClicks(3),
    );
    expect(r2.ok).toBe(true);
    expect(s2.pendingChoice?.chooser).toBe("runner");
    expect(s2.pendingChoice?.options.some((o) => o.id.includes("spend"))).toBe(
      true,
    );
  });

  it("Spear Phishing sets bypassInnermostEncounter on the run", () => {
    const def = getCardDef("spear-phishing");
    expect(def.runEvent?.bypassInnermostEncounter).toBe(true);

    const s = structuredClone(createInitialState());
    s.cards["sp"] = instantiateCard("spear-phishing", "sp", "runner:heap");
    const mods = modifiersFromStartsRun(s, def.runEvent!, "sp");
    expect(mods.bypassInnermostEncounter).toBe(true);
  });
});
