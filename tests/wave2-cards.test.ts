import { describe, expect, it, beforeAll } from "vitest";
import {
  applyIntent,
  createGame,
  createInitialState,
  CR,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  loadCardCatalog,
  loadCardPool,
  queryLegality,
  setupEmptyRemoteWithIce,
  supportedCardIds,
  validateEffectTree,
  assertPinnedTag,
  crDataPresent,
} from "../src/index.js";
import type { Action, GameState, ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  assertPinnedTag("v26.03");
});

function must(state: GameState, action: Action): GameState {
  const r = applyIntent(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("card corpus wave2", () => {
  it("declares wave2 in the supported pool", () => {
    const pool = loadCardPool(true);
    expect(pool.waves.wave2.status).toBe("supported");
    expect(pool.waves.wave2.cards).toHaveLength(13);
    const ids = supportedCardIds();
    expect(ids).toContain("sure-gamble");
    expect(ids).toContain("gordian-blade");
    expect(ids).toContain("hostile-takeover");
    expect(ids).toContain("enigma");
  });

  it("loads all wave2 cards with valid IR", () => {
    const catalog = loadCardCatalog(true);
    expect(catalog.size).toBeGreaterThanOrEqual(27);
    for (const id of loadCardPool().waves.wave2.cards) {
      expect(catalog.has(id), id).toBe(true);
      const def = catalog.get(id)!;
      expect(def.wave).toBe("wave2");
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      for (const sub of def.subroutines ?? []) {
        expect(validateEffectTree(sub.effect)).toBeNull();
      }
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
    }
  });

  it("wave2 cards closed unsupported notes; only empty arrays remain", () => {
    expect(getCardDef("heimdall-1-0").unsupported ?? []).toEqual([]);
    expect(getCardDef("armitage-codebusting").unsupported ?? []).toEqual([]);
    expect(getCardDef("gordian-blade").unsupported ?? []).toEqual([]);
    expect(getCardDef("rototurret").unsupported ?? []).toEqual([]);
    expect(getCardDef("sure-gamble").unsupported ?? []).toEqual([]);
    const pump = getCardDef("gordian-blade").paidAbilities?.[0]?.effect;
    expect(pump).toEqual({
      op: "do",
      action: { kind: "pump_strength", amount: 1, duration: "run" },
    });
  });

  it("Sure Gamble / Diesel / Beanstalk onPlay match printed economy", () => {
    expect(getCardDef("sure-gamble").onPlay).toEqual(
      fx.gainCredits("runner", 9),
    );
    expect(getCardDef("diesel").onPlay).toEqual(fx.draw("runner", 3));
    expect(getCardDef("beanstalk-royalties").onPlay).toEqual(
      fx.gainCredits("corp", 3),
    );
  });

  it("Gordian / Ninja break code gate and sentry respectively", () => {
    const gordian = instantiateCard("gordian-blade", "g1", "runner:grip");
    expect(gordian.breaker?.breaksSubtype).toBe("code gate");
    expect(gordian.paidAbilities?.[0]?.id).toBe("gordian-pump");
    const ninja = instantiateCard("ninja", "n1", "runner:grip");
    expect(ninja.breaker?.breaksSubtype).toBe("sentry");
    expect(ninja.breaker?.pumpStrength).toBe(5);
  });

  it("Hostile Takeover onScore gains 7¢ and 1 bad publicity", () => {
    const def = getCardDef("hostile-takeover");
    expect(def.advancementRequirement).toBe(2);
    expect(def.agendaPoints).toBe(1);
    expect(def.onScore).toEqual(fx.gainCredits("corp", 7));
    expect(def.badPublicityOnScore).toBe(1);
    expect(def.unsupported ?? []).toEqual([]);

    let s = createGame({ stopAfterFirstCycle: false, agendaPointsToWin: 7 });
    // Seed a Hostile Takeover in a remote with enough advancements.
    const agenda = instantiateCard("hostile-takeover", "ht-1", "server:remote-1:root");
    agenda.advancementTokens = 2;
    s = structuredClone(s);
    s.cards["ht-1"] = agenda;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["ht-1"],
    };
    s.nextRemoteNumber = 2;
    // Walk to corp takeAction
    for (let i = 0; i < 5; i++) {
      if (s.timingKey === "corp.takeAction") break;
      s = must(s, { type: "pass_window" });
    }
    expect(s.timingKey).toBe("corp.takeAction");
    const beforeCredits = s.corp.credits;
    s = must(s, { type: "score_agenda", cardId: "ht-1" });
    expect(s.corp.score).toContain("ht-1");
    expect(s.corp.credits).toBe(beforeCredits + 7);
    expect(s.corp.badPublicity).toBe(1);
  });

  it("lose_clicks IR reduces runner clicks (Enigma subroutine)", () => {
    let s = createInitialState();
    s.runner.clicks = 2;
    const r = evalEffect(
      { state: s, sourceId: "corp-ice-1" },
      fx.loseClicks("runner", 1),
    );
    expect(r.ok).toBe(true);
    expect(s.runner.clicks).toBe(1);
    expect(s.log.some((l) => l.includes(CR.spendClicks.number))).toBe(true);

    const enigma = getCardDef("enigma");
    expect(enigma.subroutines?.[0]?.effect).toEqual(fx.loseClicks("runner", 1));
  });

  it("Gordian can break Pop-up Window after pump-free strength match", () => {
    let s = setupEmptyRemoteWithIce();
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    // Replace printed ice with Pop-up Window via card data
    const iceId = remote.ice[0]!;
    const puw = instantiateCard("pop-up-window", iceId, `server:${remote.id}:ice`);
    s = structuredClone(s);
    s.cards[iceId] = puw;
    // Replace Crowbar with Gordian
    const gordian = instantiateCard(
      "gordian-blade",
      "runner-program-1",
      "runner:grip",
    );
    s.cards["runner-program-1"] = gordian;
    s.runner.credits = 10;

    s = must(s, {
      type: "basic_install",
      cardId: "runner-program-1",
      destination: { kind: "rig" },
    });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_run", serverId: remote.id as ServerId });
    s = must(s, { type: "rez_ice", cardId: iceId });
    s = must(s, { type: "pass_window" });
    // Encounter PAW — Gordian strength 2 > ice 0, break the (single) subroutine
    const legal = queryLegality(s);
    expect(
      legal.legal.some(
        (e) =>
          e.action.type === "break_subroutine" &&
          e.action.breakerId === "runner-program-1",
      ),
    ).toBe(true);
    s = must(s, {
      type: "break_subroutine",
      breakerId: "runner-program-1",
      subIndex: 0,
    });
    s = must(s, { type: "pass_window" });
    expect(s.run?.successful === true || s.timingKey.includes("run")).toBe(true);
  });
});
