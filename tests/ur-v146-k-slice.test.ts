/**
 * Uprising v1.46.0 K-slice: final 7 → 65/65 set-complete.
 * Prāna / Vacheron / Earth Station / Kakurenbo / Gachapon / The Back / GameNET.
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
  loadCardPool,
  queryLegality,
  stealAgenda,
  validateEffectTree,
} from "../src/index.js";
import { beginRunnerTurnFlags } from "../src/state/turn.js";
import { dealDamage } from "../src/state/damage.js";
import { agendaPointsFor } from "../src/state/scoring.js";
import { fireCorpIdentityFlippedSuccessfulHqOrRdRun } from "../src/state/identityFlipHooks.js";
import { additionalRunInitiateCredits } from "../src/state/runInitiateTax.js";
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
  assertCardsPinnedTag("v1.81.0");
});

function must(state: GameState, action: Action): GameState {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
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
  it("declares uprising supported with 65/65 clears", () => {
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

  it("Prāna wires damage interrupt + discharge", () => {
    const def = getCardDef("prana-condenser");
    expect(def.paidAbilities?.length).toBe(2);
    const prevent = def.paidAbilities![0]!;
    expect(prevent.windows).toContain("damage_interrupt_paw");
    expect(prevent.requirePendingDamageTypes).toEqual(["net"]);
    expect(prevent.oncePerPendingDamageInstance).toBe(true);
    expect(validateEffectTree(prevent.effect)).toBeNull();
    expect(JSON.stringify(prevent.effect)).toContain("prevent_pending_damage");
    expect(JSON.stringify(def.paidAbilities![1]!.effect)).toContain(
      "deal_net_damage_per_power_counter",
    );
  });

  it("Prāna interrupt prevents 1 net, places power, gains 3¢ (once)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const prana = instantiateCard("prana-condenser", "prana-1", "server:remote-1:root");
    prana.rezzed = true;
    s.cards["prana-1"] = prana;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["prana-1"],
    };
    s.corp.credits = 5;
    s.runner.hand = ["h1", "h2"];
    for (const id of ["h1", "h2"]) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    }
    expect(dealDamage(s, "net", 2, "src")).toBe("pending");
    expect(s.pendingDamage?.remaining).toBe(2);
    const legal = queryLegality(s).legal.map((e) => e.action);
    expect(
      legal.some(
        (a) =>
          a.type === "use_paid_ability" &&
          a.cardId === "prana-1" &&
          a.abilityId === "prana-prevent-net",
      ),
    ).toBe(true);
    s = must(s, {
      type: "use_paid_ability",
      cardId: "prana-1",
      abilityId: "prana-prevent-net",
    });
    expect(s.pendingDamage?.remaining).toBe(1);
    expect(s.cards["prana-1"]!.powerCounters).toBe(1);
    expect(s.corp.credits).toBe(8);
    // Once per instance — not re-offered.
    expect(
      queryLegality(s).legal.some(
        (e) =>
          e.action.type === "use_paid_ability" &&
          e.action.cardId === "prana-1",
      ),
    ).toBe(false);
  });

  it("Vacheron steal non-Archives → 4 counters / 0 AP; Archives plain", () => {
    const def = getCardDef("project-vacheron");
    expect(def.vacheronStealReplacement).toBe(true);
    expect(def.worthZeroAgendaPointsWhileHasAgendaCounters).toBe(true);
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();

    let s = createInitialState();
    s = structuredClone(s);
    const vac = instantiateCard("project-vacheron", "vac-1", "server:remote-1:root");
    s.cards["vac-1"] = vac;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["vac-1"],
    };
    stealAgenda(s, "vac-1");
    expect(s.runner.score).toContain("vac-1");
    expect(s.cards["vac-1"]!.agendaCounters).toBe(4);
    expect(agendaPointsFor(s, "runner")).toBe(0);

    beginRunnerTurnFlags(s);
    const r = evalEffect(
      { state: s, sourceId: "vac-1" },
      s.cards["vac-1"]!.onTurnBegin!,
    );
    expect(r.ok).toBe(true);
    expect(s.cards["vac-1"]!.agendaCounters).toBe(3);

    // Archives steal — no replacement.
    let s2 = createInitialState();
    s2 = structuredClone(s2);
    const vac2 = instantiateCard("project-vacheron", "vac-2", "corp:archives");
    s2.cards["vac-2"] = vac2;
    s2.corp.discard = ["vac-2"];
    stealAgenda(s2, "vac-2");
    expect(s2.cards["vac-2"]!.agendaCounters ?? 0).toBe(0);
    expect(agendaPointsFor(s2, "runner")).toBe(3);
  });

  it("Earth Station: max 1 remote + HQ tax front + remote tax flipped + HQ unflip", () => {
    const def = getCardDef("earth-station-sea-headquarters");
    expect(def.maxRemoteServers).toBe(1);
    expect(def.additionalRunInitiateCredits).toEqual({
      hqUnflipped: 1,
      remoteFlipped: 6,
    });
    expect(def.identityFlippedHooks?.onSuccessfulHqRun).toBeTruthy();

    const s = runnerActionReady(createInitialState());
    const id = instantiateCard(
      "earth-station-sea-headquarters",
      "es-1",
      "corp:identity",
    );
    s.cards["es-1"] = id;
    s.corp.identityId = "es-1";
    s.runner.credits = 0;
    expect(additionalRunInitiateCredits(s, "hq")).toBe(1);
    expect(
      queryLegality(s).legal.some(
        (e) => e.action.type === "basic_run" && e.action.serverId === "hq",
      ),
    ).toBe(false);

    s.runner.credits = 5;
    expect(
      queryLegality(s).legal.some(
        (e) => e.action.type === "basic_run" && e.action.serverId === "hq",
      ),
    ).toBe(true);

    s.cards["es-1"]!.identityFlipped = true;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: [],
    };
    expect(additionalRunInitiateCredits(s, "remote-1")).toBe(6);
    s.runner.credits = 5;
    expect(
      queryLegality(s).legal.some(
        (e) =>
          e.action.type === "basic_run" && e.action.serverId === "remote-1",
      ),
    ).toBe(false);

    fireCorpIdentityFlippedSuccessfulHqOrRdRun(s, "hq");
    expect(s.cards["es-1"]!.identityFlipped).toBe(false);
  });

  it("Kakurenbo wires triple + HQ trash + facedown + install+adv + RFG", () => {
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

  it("Gachapon wires trash resolve", () => {
    const def = getCardDef("gachapon");
    expect(def.paidAbilities?.length).toBe(1);
    expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();
    expect(JSON.stringify(def.paidAbilities![0]!.effect)).toContain(
      "gachapon_resolve",
    );
    expect(def.paidAbilities![0]!.cost?.trashSelf).toBe(true);
  });

  it("The Back: first hardware use during run places power", () => {
    const def = getCardDef("the-back");
    expect(validateEffectTree(def.onFirstHardwareUseDuringRunEachTurn!)).toBeNull();
    expect(def.paidAbilities![0]!.cost?.rfgSelf).toBe(true);

    let s = runnerActionReady(createInitialState());
    const back = instantiateCard("the-back", "back-1", "runner:rig");
    s.cards["back-1"] = back;
    const hw = instantiateCard("airbladex-jsrf-ed", "hw-1", "runner:rig");
    hw.powerCounters = 2;
    s.cards["hw-1"] = hw;
    s.runner.rig = ["back-1", "hw-1"];
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
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
    };
    // Open damage so AirbladeX paid ability is legal.
    expect(dealDamage(s, "net", 1, "src")).toBe("pending");
    s = must(s, {
      type: "use_paid_ability",
      cardId: "hw-1",
      abilityId: "airblade-prevent-damage",
    });
    expect(s.cards["back-1"]!.powerCounters).toBe(1);
    expect(s.turn.hardwareUsedDuringRunThisTurn).toBe(true);
  });

  it("GameNET: Cayambe-class lose_credits once → Corp +1¢", () => {
    const def = getCardDef("gamenet-where-dreams-are-real");
    expect(
      validateEffectTree(
        def.onCorpAbilityCausesRunnerSpendOrLoseCreditsDuringRun!,
      ),
    ).toBeNull();

    let s = createInitialState();
    s = structuredClone(s);
    const gn = instantiateCard(
      "gamenet-where-dreams-are-real",
      "gn-1",
      "corp:identity",
    );
    s.cards["gn-1"] = gn;
    s.corp.identityId = "gn-1";
    s.corp.credits = 5;
    s.runner.credits = 10;
    s.run = {
      attackedServerId: "remote-1",
      phase: "approach-server",
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
    };
    const cay = instantiateCard("cayambe-grid", "cay-1", "server:remote-1:root");
    s.cards["cay-1"] = cay;
    // One lose_credits of 6 (Cayambe 3×2) → one GameNET trigger.
    const r = evalEffect(
      { state: s, sourceId: "cay-1" },
      fx.do({ kind: "lose_credits", side: "runner", amount: 6 }),
    );
    expect(r.ok).toBe(true);
    expect(s.runner.credits).toBe(4);
    expect(s.corp.credits).toBe(6);

    // Runner self-spend (source = runner id) does not trigger.
    const before = s.corp.credits;
    evalEffect(
      { state: s, sourceId: s.runner.identityId },
      fx.do({ kind: "lose_credits", side: "runner", amount: 1 }),
    );
    expect(s.corp.credits).toBe(before);
  });

  it("GameNET × Tollbooth pay_credits_or_etr triggers once", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const gn = instantiateCard(
      "gamenet-where-dreams-are-real",
      "gn-2",
      "corp:identity",
    );
    s.cards["gn-2"] = gn;
    s.corp.identityId = "gn-2";
    s.corp.credits = 0;
    s.runner.credits = 5;
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
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
    };
    const tb = instantiateCard("tollbooth", "tb-1", "server:hq:ice");
    s.cards["tb-1"] = tb;
    const r2 = evalEffect(
      { state: s, sourceId: "tb-1" },
      fx.payCreditsOrEtr("runner", 3),
    );
    expect(r2.ok).toBe(true);
    expect(s.runner.credits).toBe(2);
    expect(s.corp.credits).toBe(1);
  });
});

describe("Interaction smoke — Uprising / v1.46.0", () => {
  it("prevent × cost: Prāna × net instance (9.12.2b)", () => {
    expect(getCardDef("prana-condenser").unsupported ?? []).toEqual([]);
  });
  it("interrupt / replacement: Vacheron steal once (9.9.9c)", () => {
    expect(getCardDef("project-vacheron").vacheronStealReplacement).toBe(true);
  });
  it("cannot × basic / additional cost: Earth Station unpayable HQ absent (1.16.1b)", () => {
    expect(
      getCardDef("earth-station-sea-headquarters").additionalRunInitiateCredits
        ?.hqUnflipped,
    ).toBe(1);
  });
});
