/**
 * TAI v0.86 primitives: Daniela / Adrian / A Teia / Arissana / Stegodon / AirbladeX.
 * Cards pin v0.90.0 (IR unit tests until cards-data v0.86).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  effectiveBreakerStrength,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  legalActions,
  validateEffectTree,
} from "../src/index.js";
import { beginRunnerTurnFlags } from "../src/state/turn.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.25.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state!;
}


describe("TAI final six card wiring", () => {
  for (const id of [
    "daniela-jorge-inacio",
    "adrian-seis",
    "a-teia-ip-recovery",
    "arissana-rocha-nahu-street-artist",
    "stegodon-mk-iv",
    "airbladex-jsrf-ed",
  ] as const) {
    it(`wires ${id}; unsupported empty`, () => {
      const def = getCardDef(id);
      expect(def.unsupported).toEqual([]);
    });
  }
});

describe("TAI v0.86 IR validation", () => {
  it("validates Daniela trash/steal additional cost + add_random_grip_to_stack_bottom", () => {
    const cost = fx.do({
      kind: "add_random_grip_to_stack_bottom",
      count: 2,
    });
    expect(validateEffectTree(cost)).toBeNull();
  });

  it("validates Adrian psi + restrict_run_access", () => {
    const tree = fx.do({
      kind: "play_psi_game",
      maxBid: 2,
      ifBidsDiffer: fx.do({
        kind: "restrict_run_access",
        mode: "only_source",
        cardIdsFromSource: true,
      }),
      ifBidsMatch: fx.do({
        kind: "restrict_run_access",
        mode: "forbid_source",
        cardIdsFromSource: true,
      }),
    });
    expect(validateEffectTree(tree)).toBeNull();
  });

  it("validates A Teia remote cap fields + HQ chain install", () => {
    expect(
      validateEffectTree(
        fx.do({
          kind: "may_install_from_hq_on_other_remote_ignore_costs",
          cannotScoreInstalledCardThisTurn: true,
        }),
      ),
    ).toBeNull();
  });

  it("validates Arissana install_program_from_grip_paying_cost", () => {
    expect(
      validateEffectTree(
        fx.do({
          kind: "install_program_from_grip_paying_cost",
          trackOnRunEndTrashUnlessSubtype: "trojan",
        }),
      ),
    ).toBeNull();
  });

  it("validates Stegodon scored penalty + may_derez_installed filters", () => {
    expect(
      validateEffectTree(
        fx.do({
          kind: "may_derez_installed",
          onlyIce: true,
          excludeProtectingAttackedServer: true,
          then: fx.gainCredits("corp", 1),
        }),
      ),
    ).toBeNull();
  });

  it("validates AirbladeX interrupt leaves", () => {
    expect(
      validateEffectTree(fx.do({ kind: "prevent_pending_damage", amount: 1 })),
    ).toBeNull();
    expect(
      validateEffectTree(fx.do({ kind: "prevent_current_ice_on_encounter" })),
    ).toBeNull();
  });
});

describe("Daniela add_random_grip_to_stack_bottom (v0 first N)", () => {
  it("moves first two grip cards to bottom of stack", () => {
    let s = createInitialState();
    s.runner.hand = ["h1", "h2", "h3"];
    s.runner.deck = ["d-top"];
    for (const id of ["h1", "h2", "h3"]) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.cards[id].title = id;
    }
    s.cards["d-top"] = instantiateCard("sure-gamble", "d-top", "runner:stack");
    const r = evalEffect(
      { state: s, sourceId: "x" },
      fx.do({ kind: "add_random_grip_to_stack_bottom", count: 2 }),
    );
    expect(r.ok).toBe(true);
    expect(s.runner.hand).toEqual(["h3"]);
    expect(s.runner.deck).toEqual(["d-top", "h1", "h2"]);
  });
});

describe("Adrian play_psi_game + restrict_run_access", () => {
  it("applies only_source when bids differ", () => {
    let s = createInitialState();
    s.run = {
      attackedServerId: "remote-1",
      phase: "breach",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: ["ag-1", "up-1"],
      accessRemaining: 2,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["ag-1", "up-1"],
    };
    const adrian = instantiateCard("adrian-seis", "up-1", "server:remote-1:root");
    s.cards["up-1"] = adrian;
    s.cards["ag-1"] = instantiateCard("hedge-fund", "ag-1", "server:remote-1:root");
    s.cards["ag-1"].type = "agenda";
    const r = evalEffect(
      { state: s, sourceId: "up-1" },
      fx.do({
        kind: "restrict_run_access",
        mode: "only_source",
        cardIdsFromSource: true,
      }),
    );
    expect(r.ok).toBe(true);
    expect(s.run!.accessCandidates).toEqual(["up-1"]);
  });

  it("resolves psi sequential bids and spends credits", () => {
    let s = createInitialState();
    s.runner.credits = 5;
    s.corp.credits = 5;
    s.activeSide = "runner";
    const r = evalEffect(
      { state: s, sourceId: "psi-src" },
      fx.do({
        kind: "play_psi_game",
        maxBid: 2,
        ifBidsDiffer: fx.do({
          kind: "gain_credits",
          side: "runner",
          amount: 1,
        }),
        ifBidsMatch: fx.do({
          kind: "gain_credits",
          side: "corp",
          amount: 1,
        }),
      }),
    );
    expect(r.ok).toBe(true);
    expect(s.psi).toBeTruthy();
    s = must(s, { type: "psi_runner_bid", amount: 2 });
    expect(s.runner.credits).toBe(3);
    s = must(s, { type: "psi_corp_bid", amount: 2 });
    expect(s.corp.credits).toBe(4);
    expect(s.psi).toBeNull();
    expect(s.runner.credits).toBe(3);
  });
});

describe("A Teia maxRemoteServers + HQ chain", () => {
  it("blocks third remote when maxRemoteServers is 2", () => {
    let s = createInitialState();
    const id = instantiateCard("a-teia-ip-recovery", "corp-id", "corp:identity");
    id.maxRemoteServers = 2;
    s.corp.identityId = "corp-id";
    s.cards["corp-id"] = id;
    s.servers["remote-1"] = { id: "remote-1", kind: "remote", ice: [], root: [] };
    s.servers["remote-2"] = { id: "remote-2", kind: "remote", ice: [], root: [] };
    s.nextRemoteNumber = 3;
    const ice = instantiateCard("ice-wall", "ice-new", "corp:hq");
    s.cards["ice-new"] = ice;
    s.corp.hand = ["ice-new"];
    s.corp.credits = 10;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    const bad = applyAction(s, {
      type: "basic_install",
      cardId: "ice-new",
      destination: { kind: "new_remote" },
    });
    expect(bad.ok).toBe(false);
  });
});

describe("Stegodon iceDerezzedThisRun + breaker penalty", () => {
  it("applies -2 to breakers when scored and ice derezzed", () => {
    let s = createInitialState();
    const steg = instantiateCard("stegodon-mk-iv", "steg", "corp:score");
    steg.whileScoredBreakerStrengthPenaltyIfIceDerezzedThisRun = 2;
    s.corp.score = ["steg"];
    s.cards["steg"] = steg;
    const br = instantiateCard("corroder", "br-1", "runner:rig");
    br.breaker = { strength: 2, breakCredits: 1, subtypes: ["barrier"] };
    s.runner.rig = ["br-1"];
    s.cards["br-1"] = br;
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
      iceDerezzedThisRun: true,
    };
    expect(effectiveBreakerStrength(s, "br-1")).toBe(0);
  });
});

describe("AirbladeX damage_interrupt_paw", () => {
  it("offers paid ability during pending net damage in a run", () => {
    let s = createInitialState();
    const hw = instantiateCard("airbladex-jsrf-ed", "abx", "runner:rig");
    hw.powerCounters = 2;
    hw.paidAbilities = [
      {
        id: "airblade-prevent-damage",
        label: "prevent",
        clickCost: 0,
        creditCost: 0,
        cost: { powerCounters: 1 },
        windows: ["damage_interrupt_paw"],
        requireDuringRun: true,
        effect: fx.do({ kind: "prevent_pending_damage", amount: 1 }),
      },
    ];
    s.runner.rig = ["abx"];
    s.cards["abx"] = hw;
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
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
    s.pendingDamage = { type: "net", remaining: 2, sourceId: "x" };
    const legal = legalActions(s);
    expect(
      legal.some(
        (a) =>
          a.type === "use_paid_ability" &&
          a.cardId === "abx" &&
          a.abilityId === "airblade-prevent-damage",
      ),
    ).toBe(true);
  });
});
