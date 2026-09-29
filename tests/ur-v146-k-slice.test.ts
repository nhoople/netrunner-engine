/**
 * Uprising v1.46.0 K-slice: Prāna Condenser / Project Vacheron / Earth Station /
 * Kakurenbo / Gachapon / The Back / GameNET — set-complete 65/65.
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
  getCardDef,
  instantiateCard,
  loadCardPool,
  queryLegality,
  validateEffectTree,
} from "../src/index.js";
import { dealDamage } from "../src/state/damage.js";
import { stealAgenda, agendaPointsFor } from "../src/state/scoring.js";
import { beginRunnerTurnFlags } from "../src/state/turn.js";
import { noteCorpAbilityCausedRunnerCreditLossOrSpend } from "../src/state/gamenet.js";
import type { Action, GameState } from "../src/state/types.js";

const CLEAR = [
  "prana-condenser",
  "project-vacheron",
  "earth-station-sea-headquarters",
  "kakurenbo",
  "gachapon",
  "the-back",
  "gamenet-where-dreams-are-real",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.46.0");
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

function runnerActionReady(s: GameState): GameState {
  s = structuredClone(s);
  s.activeSide = "runner";
  s.timingKey = "runner.takeAction";
  s.runner.clicks = 4;
  s.runner.credits = 20;
  return s;
}

describe("Uprising v1.46.0 K-slice", () => {
  it("declares uprising supported with 65 clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["uprising"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["uprising"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBe(65);
  });

  it("loads seven K-slice clears", () => {
    for (const id of CLEAR) {
      const def = getCardDef(id);
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("uprising");
    }
  });

  it("Prāna wires damage_interrupt_paw prevent + power + credits", () => {
    const def = getCardDef("prana-condenser");
    const prevent = def.paidAbilities?.find((a) => a.id === "prana-prevent-net");
    expect(prevent?.windows).toContain("damage_interrupt_paw");
    expect(prevent?.requirePendingDamageTypes).toEqual(["net"]);
    expect(validateEffectTree(prevent!.effect)).toBeNull();
    expect(JSON.stringify(prevent!.effect)).toContain("prevent_pending_damage");
    expect(JSON.stringify(prevent!.effect)).toContain("add_power_counter");
    const fire = def.paidAbilities?.find((a) => a.id === "prana-discharge");
    expect(fire?.cost).toEqual({ clicks: 2, trashSelf: true });
    expect(JSON.stringify(fire!.effect)).toContain(
      "deal_net_damage_per_power_counter",
    );
  });

  it("Prāna Corp interrupt prevents 1 net, places power, gains 3¢ (smoke)", () => {
    const s = createInitialState();
    const prana = instantiateCard("prana-condenser", "prana-1", "server:remote-1:root");
    prana.rezzed = true;
    s.cards["prana-1"] = prana;
    if (!s.servers["remote-1"]) {
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: [],
      };
    }
    s.servers["remote-1"]!.root.push("prana-1");
    s.corp.credits = 5;
    s.runner.hand = [];
    for (let i = 0; i < 3; i++) {
      const c = instantiateCard("sure-gamble", `grip-${i}`, "runner:grip");
      s.cards[`grip-${i}`] = c;
      s.runner.hand.push(`grip-${i}`);
    }
    const pending = dealDamage(s, "net", 2, "src-ice");
    expect(pending).toBe("pending");
    expect(s.pendingDamage?.remaining).toBe(2);
    const legal = queryLegality(s).legal.some(
      (e) =>
        e.action.type === "use_paid_ability" &&
        e.action.cardId === "prana-1" &&
        e.action.abilityId === "prana-prevent-net",
    );
    expect(legal).toBe(true);
    const next = must(s, {
      type: "use_paid_ability",
      cardId: "prana-1",
      abilityId: "prana-prevent-net",
    });
    expect(next.pendingDamage?.remaining).toBe(1);
    expect(next.cards["prana-1"]!.powerCounters).toBe(1);
    expect(next.corp.credits).toBe(8);
    // Once per instance — not re-offered.
    expect(
      queryLegality(next).legal.some(
        (e) =>
          e.action.type === "use_paid_ability" &&
          e.action.cardId === "prana-1" &&
          e.action.abilityId === "prana-prevent-net",
      ),
    ).toBe(false);
  });

  it("Vacheron steal replacement + 0 AP while counters; Archives exception", () => {
    const def = getCardDef("project-vacheron");
    expect(def.vacheronStealReplacement).toBe(true);
    expect(def.worthZeroAgendaPointsWhileHasAgendaCounters).toBe(true);
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();

    const s = createInitialState();
    const v = instantiateCard("project-vacheron", "vach-1", "server:remote-1:root");
    s.cards["vach-1"] = v;
    if (!s.servers["remote-1"]) {
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: ["vach-1"],
      };
    } else {
      s.servers["remote-1"]!.root.push("vach-1");
    }
    stealAgenda(s, "vach-1");
    expect(s.cards["vach-1"]!.agendaCounters).toBe(4);
    expect(agendaPointsFor(s, "runner")).toBe(0);

    // Archives steal — no replacement.
    const s2 = createInitialState();
    const v2 = instantiateCard(
      "project-vacheron",
      "vach-2",
      "corp:archives",
    );
    s2.cards["vach-2"] = v2;
    s2.corp.discard.push("vach-2");
    stealAgenda(s2, "vach-2");
    expect(s2.cards["vach-2"]!.agendaCounters ?? 0).toBe(0);
    expect(agendaPointsFor(s2, "runner")).toBe(3);
  });

  it("Vacheron strips one agenda counter on Runner turn begin", () => {
    const s = createInitialState();
    const v = instantiateCard("project-vacheron", "vach-3", "runner:score");
    v.agendaCounters = 2;
    s.cards["vach-3"] = v;
    s.runner.score.push("vach-3");
    beginRunnerTurnFlags(s);
    // Fire score onTurnBegin the same way graph does.
    for (const id of s.runner.score) {
      const card = s.cards[id];
      if (!card?.onTurnBegin) continue;
      if (
        card.worthZeroAgendaPointsWhileHasAgendaCounters &&
        (card.agendaCounters ?? 0) < 1
      ) {
        continue;
      }
      const r = evalEffect({ state: s, sourceId: id }, card.onTurnBegin);
      expect(r.ok).toBe(true);
    }
    expect(s.cards["vach-3"]!.agendaCounters).toBe(1);
    expect(agendaPointsFor(s, "runner")).toBe(0);
  });

  it("Earth Station wires maxRemote + initiate tax + flip hooks", () => {
    const def = getCardDef("earth-station-sea-headquarters");
    expect(def.maxRemoteServers).toBe(1);
    expect(def.additionalRunInitiateCredits).toEqual({
      hqUnflipped: 1,
      remoteFlipped: 6,
    });
    expect(def.identityFlippedHooks?.onSuccessfulHqRun).toBeDefined();
    expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();
  });

  it("Earth Station HQ tax unpayable → run absent (smoke)", () => {
    const s = runnerActionReady(createInitialState());
    const id = instantiateCard(
      "earth-station-sea-headquarters",
      "earth-1",
      "corp:identity",
    );
    s.cards["earth-1"] = id;
    s.corp.identityId = "earth-1";
    s.runner.credits = 0;
    expect(
      queryLegality(s).legal.some(
        (e) => e.action.type === "basic_run" && e.action.serverId === "hq",
      ),
    ).toBe(false);
    s.runner.credits = 1;
    expect(
      queryLegality(s).legal.some(
        (e) => e.action.type === "basic_run" && e.action.serverId === "hq",
      ),
    ).toBe(true);
  });

  it("Kakurenbo wires triple + Archives install leaf + RFG", () => {
    const def = getCardDef("kakurenbo");
    expect(def.playAdditionalClicks).toBe(2);
    expect(validateEffectTree(def.onPlay!)).toBeNull();
    const js = JSON.stringify(def.onPlay);
    expect(js).toContain("trash_any_number_from_hq");
    expect(js).toContain("turn_all_archives_facedown");
    expect(js).toContain(
      "may_install_from_archives_in_remote_root_with_advancements",
    );
    expect(js).toContain("rfg_self");
  });

  it("Gachapon wires trash resolve set-aside leaf", () => {
    const def = getCardDef("gachapon");
    const ab = def.paidAbilities?.[0];
    expect(ab?.cost?.trashSelf).toBe(true);
    expect(validateEffectTree(ab!.effect)).toBeNull();
    expect(JSON.stringify(ab!.effect)).toContain("gachapon_resolve");
  });

  it("The Back wires first-hardware trigger + rfgSelf shuffle", () => {
    const def = getCardDef("the-back");
    expect(validateEffectTree(def.onFirstHardwareUseDuringRunEachTurn!)).toBeNull();
    const ab = def.paidAbilities?.[0];
    expect(ab?.cost).toEqual({ clicks: 1, rfgSelf: true });
    expect(JSON.stringify(ab!.effect)).toContain(
      "shuffle_up_to_n_heap_cards_with_trash_abilities_into_stack",
    );
  });

  it("GameNET wires Corp-ability credit-loss trigger; Cayambe-class once", () => {
    const def = getCardDef("gamenet-where-dreams-are-real");
    expect(
      validateEffectTree(
        def.onCorpAbilityCausesRunnerSpendOrLoseCreditsDuringRun!,
      ),
    ).toBeNull();

    const s = createInitialState();
    const id = instantiateCard(
      "gamenet-where-dreams-are-real",
      "gnet-1",
      "corp:identity",
    );
    s.cards["gnet-1"] = id;
    s.corp.identityId = "gnet-1";
    s.corp.credits = 0;
    s.run = {
      attackedServerId: "remote-1",
      phase: "approach_server",
      position: null,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      agendasStolenThisRun: 0,
      iceEncounteredCount: 0,
      bypassedIceIds: [],
      passedIceIds: [],
    };
    const cay = instantiateCard("cayambe-grid", "cay-1", "server:remote-1:root");
    s.cards["cay-1"] = cay;
    // One aggregate lose of 6¢ → one GameNET trigger (CR 1.16.2b).
    noteCorpAbilityCausedRunnerCreditLossOrSpend(s, 6, "cay-1");
    expect(s.corp.credits).toBe(1);
  });
});
