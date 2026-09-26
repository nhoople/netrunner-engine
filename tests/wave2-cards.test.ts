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

describe("SU21 reprint / classic cards (post-wave cleanup)", () => {
  it("pool no longer declares stubs/wave1/wave2", () => {
    const pool = loadCardPool(true);
    expect(pool.waves.wave2).toBeUndefined();
    expect(pool.waves.stubs).toBeUndefined();
    expect(pool.waves.wave1).toBeUndefined();
    const ids = supportedCardIds();
    expect(ids).toContain("sure-gamble");
    expect(ids).toContain("gordian-blade");
    expect(ids).toContain("hostile-takeover");
    expect(ids).toContain("enigma");
    expect(ids).not.toContain("ninja");
    expect(ids).not.toContain("heimdall-1-0");
  });

  it("loads reprint cards under system-update-2021 / system-gateway waves", () => {
    const catalog = loadCardCatalog(true);
    expect(catalog.size).toBe(224);
    for (const id of [
      "sure-gamble",
      "diesel",
      "gordian-blade",
      "rototurret",
      "hostile-takeover",
      "enigma",
      "pad-campaign",
      "aesops-pawnshop",
      "pop-up-window",
      "hedge-fund",
    ]) {
      expect(catalog.has(id), id).toBe(true);
      const def = catalog.get(id)!;
      expect(["system-gateway", "system-update-2021"]).toContain(def.wave);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
    }
  });

  it("Sure Gamble / Diesel onPlay match printed economy", () => {
    expect(getCardDef("sure-gamble").onPlay).toEqual(
      fx.gainCredits("runner", 9),
    );
    expect(getCardDef("diesel").onPlay).toEqual(fx.draw("runner", 3));
  });

  it("Gordian / Carmen break code gate and sentry respectively", () => {
    const gordian = instantiateCard("gordian-blade", "g1", "runner:grip");
    expect(gordian.breaker?.breaksSubtype).toBe("code gate");
    expect(gordian.paidAbilities?.[0]?.id).toBe("gordian-pump");
    const carmen = instantiateCard("carmen", "c1", "runner:grip");
    expect(carmen.breaker?.breaksSubtype).toBe("sentry");
  });

  it("Hostile Takeover onScore gains 7¢ and 1 bad publicity", () => {
    const def = getCardDef("hostile-takeover");
    expect(def.advancementRequirement).toBe(2);
    expect(def.agendaPoints).toBe(1);
    expect(def.onScore).toEqual(fx.gainCredits("corp", 7));
    expect(def.badPublicityOnScore).toBe(1);
    expect(def.unsupported ?? []).toEqual([]);

    let s = createGame({ stopAfterFirstCycle: false, agendaPointsToWin: 7 });
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

  it("Gordian can break Pop-up Window after strength match", () => {
    let s = setupEmptyRemoteWithIce();
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    const iceId = remote.ice[0]!;
    const puw = instantiateCard("pop-up-window", iceId, `server:${remote.id}:ice`);
    s = structuredClone(s);
    s.cards[iceId] = puw;
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
