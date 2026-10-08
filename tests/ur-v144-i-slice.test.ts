/**
 * Uprising v1.44.0 I-slice: lockdown linger infra + SYNC Rerouting /
 * Argus Crackdown / Hyoubu Precog Manifold / NAPD Cordon /
 * NEXT Activation Command.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  effectiveIceStrength,
  evalEffect,
  getCardDef,
  instantiateCard,
  loadCardPool,
  queryLegality,
  stealAdditionalCreditsFromActiveLockdowns,
  trashActiveLockdownsAtCorpTurnBegin,
  validateEffectTree,
} from "../src/index.js";
import type { Action, GameState } from "../src/state/types.js";

const CLEAR = [
  "sync-rerouting",
  "argus-crackdown",
  "hyoubu-precog-manifold",
  "napd-cordon",
  "next-activation-command",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.145.0");
});

function must(state: GameState, action: Action): GameState {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

function corpPlayReady(s: GameState): GameState {
  s = structuredClone(s);
  s.activeSide = "corp";
  s.timingKey = "corp.takeAction";
  s.corp.clicks = 3;
  s.corp.credits = 20;
  return s;
}

describe("Uprising v1.44.0 I-slice", () => {
  it("declares uprising supported with at least 53 clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["uprising"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["uprising"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(53);
  });

  it("loads five lockdown clears", () => {
    for (const id of CLEAR) {
      const def = getCardDef(id);
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("uprising");
      expect(def.subtypes).toContain("lockdown");
      expect(def.playRequiresNoActiveLockdown).toBe(true);
      expect(def.lingerUntilCorpNextTurnBegins).toBe(true);
    }
  });

  it("SYNC Rerouting wires onRunBegin pay-or-tag", () => {
    const def = getCardDef("sync-rerouting");
    expect(validateEffectTree(def.onRunBegin!)).toBeNull();
    expect(JSON.stringify(def.onRunBegin)).toContain("lose_credits");
    expect(JSON.stringify(def.onRunBegin)).toContain('"amount":4');
    expect(JSON.stringify(def.onRunBegin)).toContain("give_tags");
  });

  it("Argus Crackdown wires iced-server meat onSuccessfulRun", () => {
    const def = getCardDef("argus-crackdown");
    expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
    expect(JSON.stringify(def.onSuccessfulRun)).toContain(
      "attacked_server_protected_by_ice",
    );
    expect(JSON.stringify(def.onSuccessfulRun)).toContain("meat_damage");
  });

  it("Hyoubu wires choose_server + psi on chosen successful run", () => {
    const def = getCardDef("hyoubu-precog-manifold");
    expect(validateEffectTree(def.onPlay!)).toBeNull();
    expect(JSON.stringify(def.onPlay)).toContain("choose_server");
    expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
    expect(JSON.stringify(def.onSuccessfulRun)).toContain(
      "attacking_chosen_server",
    );
    expect(JSON.stringify(def.onSuccessfulRun)).toContain("play_psi_game");
    expect(JSON.stringify(def.onSuccessfulRun)).toContain("end_the_run");
  });

  it("NAPD Cordon wires steal additional credits formula", () => {
    const def = getCardDef("napd-cordon");
    expect(def.stealAdditionalCreditsFormula).toEqual({
      base: 4,
      perAdvancement: 2,
    });
  });

  it("NEXT Activation Command wires +2 strength + icebreaker-only breaks", () => {
    const def = getCardDef("next-activation-command");
    expect(def.allIceStrengthBonus).toBe(2);
    expect(def.cannotBreakExceptIcebreaker).toBe(true);
  });

  it("lockdown lingers in play-area and gates a second lockdown", () => {
    let s = corpPlayReady(createInitialState());
    const sync = instantiateCard("sync-rerouting", "sync-1", "corp:hq");
    const argus = instantiateCard("argus-crackdown", "argus-1", "corp:hq");
    s.cards["sync-1"] = sync;
    s.cards["argus-1"] = argus;
    s.corp.hand = ["sync-1", "argus-1"];

    s = must(s, { type: "play_operation", cardId: "sync-1" });
    expect(s.cards["sync-1"]!.zone).toBe("corp:play-area");
    expect(s.corp.discard).not.toContain("sync-1");
    expect(
      queryLegality(s).legal.some(
        (e) =>
          e.action.type === "play_operation" && e.action.cardId === "argus-1",
      ),
    ).toBe(false);

    const blocked = applyAction(s, {
      type: "play_operation",
      cardId: "argus-1",
    });
    expect(blocked.ok).toBe(false);
  });

  it("Corp turn begin trashes lingering lockdown", () => {
    const s = corpPlayReady(createInitialState());
    const sync = instantiateCard("sync-rerouting", "sync-2", "corp:play-area");
    s.cards["sync-2"] = sync;
    expect(s.cards["sync-2"]!.zone).toBe("corp:play-area");

    trashActiveLockdownsAtCorpTurnBegin(s);
    expect(s.cards["sync-2"]!.zone).toBe("corp:archives");
    expect(s.corp.discard).toContain("sync-2");
    expect(
      s.log.some((line) => line.includes("trashed at Corp turn begin")),
    ).toBe(true);
  });

  it("SYNC onRunBegin from play-area offers pay 4¢ or take a tag", () => {
    let s = corpPlayReady(createInitialState());
    const sync = instantiateCard("sync-rerouting", "sync-3", "corp:play-area");
    s.cards["sync-3"] = sync;
    s.runner.credits = 10;
    s.runner.tags = 0;
    s.run = {
      attackedServerId: "hq",
      phase: "initiation",
      position: null,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      iceStrengthBoosts: {},
    };

    const r = evalEffect(
      { state: s, sourceId: "sync-3" },
      s.cards["sync-3"]!.onRunBegin!,
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(s.pendingChoice?.options.some((o) => o.id === "pay4")).toBe(true);
    expect(s.pendingChoice?.options.some((o) => o.id === "tag")).toBe(true);

    s = must(s, { type: "choose_option", optionId: "tag" });
    expect(s.runner.tags).toBe(1);
  });

  it("Argus does 2 meat on successful run vs iced server", () => {
    const s = corpPlayReady(createInitialState());
    const argus = instantiateCard(
      "argus-crackdown",
      "arg-meat",
      "corp:play-area",
    );
    const ice = instantiateCard("ice-wall", "iw-1", "server:hq:ice");
    ice.rezzed = true;
    s.cards["arg-meat"] = argus;
    s.cards["iw-1"] = ice;
    s.servers.hq.ice = ["iw-1"];
    for (let i = 0; i < 3; i++) {
      const id = `grip-${i}`;
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }
    s.run = {
      attackedServerId: "hq",
      phase: "success",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      iceStrengthBoosts: {},
    };

    const gripBefore = s.runner.hand.length;
    const r = evalEffect(
      { state: s, sourceId: "arg-meat" },
      s.cards["arg-meat"]!.onSuccessfulRun!,
    );
    expect(r.ok).toBe(true);
    expect(s.runner.hand.length).toBe(gripBefore - 2);
    expect(s.runner.discard.length).toBeGreaterThanOrEqual(2);
  });

  it("Argus skips meat when attacked server has no ice", () => {
    const s = corpPlayReady(createInitialState());
    const argus = instantiateCard(
      "argus-crackdown",
      "arg-skip",
      "corp:play-area",
    );
    s.cards["arg-skip"] = argus;
    s.servers.hq.ice = [];
    for (let i = 0; i < 2; i++) {
      const id = `grip-s-${i}`;
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }
    s.run = {
      attackedServerId: "hq",
      phase: "success",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      iceStrengthBoosts: {},
    };
    const before = s.runner.hand.length;
    const r = evalEffect(
      { state: s, sourceId: "arg-skip" },
      s.cards["arg-skip"]!.onSuccessfulRun!,
    );
    expect(r.ok).toBe(true);
    expect(s.runner.hand.length).toBe(before);
  });

  it("Hyoubu choose_server stores chosenServerId", () => {
    let s = corpPlayReady(createInitialState());
    const hy = instantiateCard("hyoubu-precog-manifold", "hy-1", "corp:hq");
    s.cards["hy-1"] = hy;
    s.corp.hand = ["hy-1"];
    s = must(s, { type: "play_operation", cardId: "hy-1" });
    expect(s.cards["hy-1"]!.zone).toBe("corp:play-area");
    expect(s.pendingChoice?.chooser).toBe("corp");
    s = must(s, { type: "choose_option", optionId: "server:rd" });
    expect(s.cards["hy-1"]!.chosenServerId).toBe("rd");
  });

  it("NAPD adds 4+2×advancement steal cost while active", () => {
    let s = corpPlayReady(createInitialState());
    const napd = instantiateCard("napd-cordon", "napd-1", "corp:hq");
    const ag = instantiateCard(
      "hostile-takeover",
      "ag-1",
      "server:remote-1:root",
    );
    ag.advancementTokens = 2;
    s.cards["napd-1"] = napd;
    s.cards["ag-1"] = ag;
    s.corp.hand = ["napd-1"];
    if (!s.servers["remote-1"]) {
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        root: [],
        ice: [],
      };
    }
    s.servers["remote-1"]!.root = ["ag-1"];
    s = must(s, { type: "play_operation", cardId: "napd-1" });
    expect(stealAdditionalCreditsFromActiveLockdowns(s, "ag-1")).toBe(8);
  });

  it("NEXT gives +2 ice strength and blocks non-icebreaker breaks", () => {
    let s = corpPlayReady(createInitialState());
    const next = instantiateCard(
      "next-activation-command",
      "next-1",
      "corp:hq",
    );
    const ice = instantiateCard("ice-wall", "iw-next", "server:hq:ice");
    ice.rezzed = true;
    ice.strength = 1;
    s.cards["next-1"] = next;
    s.cards["iw-next"] = ice;
    s.servers.hq.ice = ["iw-next"];
    s.corp.hand = ["next-1"];
    expect(effectiveIceStrength(s, "iw-next")).toBe(1);
    s = must(s, { type: "play_operation", cardId: "next-1" });
    expect(effectiveIceStrength(s, "iw-next")).toBe(3);

    const boom = instantiateCard("boomerang", "boom-1", "runner:rig");
    boom.chosenIceId = "iw-next";
    s.cards["boom-1"] = boom;
    s.runner.rig = ["boom-1"];
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: {
        iceId: "iw-next",
        broken: [false],
      },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      iceStrengthBoosts: {},
    };
    s.activeSide = "runner";
    s.timingKey = "run.encounterPaw";

    const legal = queryLegality(s).legal;
    expect(
      legal.some(
        (e) =>
          e.action.type === "use_paid_ability" && e.action.cardId === "boom-1",
      ),
    ).toBe(false);
  });
});
