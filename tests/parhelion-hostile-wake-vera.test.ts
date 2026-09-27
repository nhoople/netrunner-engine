/**
 * Parhelion v0.59: Hostile Architecture, Wake Implant, Vera Ivanovna.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  validateEffectTree,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v0.62.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("PH Hostile Architecture", () => {
  it("wires meat on first installed Corp trash each turn", () => {
    const def = getCardDef("hostile-architecture");
    expect(def.unsupported).toEqual([]);
    expect(def.meatDamageOnInstalledCorpTrashOncePerTurn).toBe(2);

    let s = createInitialState();
    s = structuredClone(s);
    const ha = instantiateCard("hostile-architecture", "ha-1", "server:remote-1:root");
    ha.rezzed = true;
    s.cards["ha-1"] = ha;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["ha-1"],
    };
    const pad = instantiateCard("pad-campaign", "pad-1", "server:remote-2:root");
    pad.rezzed = true;
    s.cards["pad-1"] = pad;
    s.servers["remote-2"] = {
      id: "remote-2",
      kind: "remote",
      ice: [],
      root: ["pad-1"],
    };
    s.runner.hand = [
      (() => {
        const c = instantiateCard("sure-gamble", "sg-1", "runner:grip");
        s.cards["sg-1"] = c;
        return "sg-1";
      })(),
      (() => {
        const c = instantiateCard("sure-gamble", "sg-2", "runner:grip");
        s.cards["sg-2"] = c;
        return "sg-2";
      })(),
    ];
    const gripBefore = s.runner.hand.length;
    const r = evalEffect(
      { state: s, sourceId: "corp-id" },
      fx.trashCorpCard("pad-1"),
    );
    expect(r.ok).toBe(true);
    expect(s.turn.hostileArchitectureUsedThisTurn).toBe(true);
    expect(s.runner.hand.length).toBe(gripBefore - 2);
  });
});

describe("PH Wake Implant", () => {
  it("wires onInstall meat + HQ power + may R&D bonus access", () => {
    const def = getCardDef("wake-implant-v2a-jrj");
    expect(def.unsupported).toEqual([]);
    expect(validateEffectTree(def.onInstall!)).toBeNull();
    expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
    expect(def.maySpendPowerCountersForBonusRdAccess).toEqual({ max: 3 });

    let s = createInitialState();
    s = structuredClone(s);
    const wake = instantiateCard("wake-implant-v2a-jrj", "wake-1", "runner:rig");
    wake.powerCounters = 2;
    s.cards["wake-1"] = wake;
    s.runner.rig = ["wake-1"];
    s.markServerId = null;
    s.servers.rd.ice = [];
    // Put a few cards in R&D
    for (let i = 0; i < 4; i++) {
      const id = `rd-${i}`;
      const c = instantiateCard("hedge-fund", id, "corp:rd");
      s.cards[id] = c;
      s.corp.deck = [id, ...s.corp.deck];
    }
    s.runner.credits = 5;
    s.runner.clicks = 4;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s = must(s, { type: "basic_run", serverId: "rd" });
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(s.run?.wakeImplantPending).toBe(true);
    s = must(s, { type: "choose_option", optionId: "wake-access:2" });
    expect(s.cards["wake-1"]!.powerCounters).toBe(0);
    expect(s.run?.bonusAccess ?? 0).toBeGreaterThanOrEqual(2);
  });
});

describe("PH Vera Ivanovna", () => {
  it("wires onAgendaScoredOrStolen may_trash_one_from_grip", () => {
    const def = getCardDef("vera-ivanovna-shuyskaya");
    expect(def.unsupported).toEqual([]);
    expect(validateEffectTree(def.onAgendaScoredOrStolen!)).toBeNull();
    expect(validateEffectTree(fx.mayTrashOneFromGrip())).toBeNull();

    let s = createInitialState();
    s = structuredClone(s);
    const vera = instantiateCard(
      "vera-ivanovna-shuyskaya",
      "vera-1",
      "server:remote-1:root",
    );
    vera.rezzed = true;
    vera.onAgendaScoredOrStolen = fx.mayTrashOneFromGrip();
    s.cards["vera-1"] = vera;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["vera-1"],
    };
    const sg = instantiateCard("sure-gamble", "sg-1", "runner:grip");
    s.cards["sg-1"] = sg;
    s.runner.hand = ["sg-1"];
    const ag = instantiateCard("hostile-takeover", "ag-1", "server:remote-2:root");
    ag.advancementTokens = 10;
    s.cards["ag-1"] = ag;
    s.servers["remote-2"] = {
      id: "remote-2",
      kind: "remote",
      ice: [],
      root: ["ag-1"],
    };
    const id = s.cards[s.corp.identityId];
    if (id) delete id.onAgendaScored;
    s.corp.clicks = 3;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    s = must(s, { type: "score_agenda", cardId: "ag-1" });
    expect(s.pendingChoice?.chooser).toBe("corp");
    s = must(s, { type: "choose_option", optionId: "trash-grip:sg-1" });
    expect(s.runner.discard).toContain("sg-1");
  });
});
