/**
 * TAI v0.83 primitives: Oracle, Living Mural, Greasing the Palm, Bahia Bands, Vovô Ozetti.
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
  queryLegality,
  validateEffectTree,
  continuousIceRezCostReduction,
  rootRezCostReduction,
  effectiveBreakerStrength,
  runnerCreditsFor,
  spendRunnerCreditsFor,
} from "../src/index.js";
import { applyAction } from "../src/actions/apply.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.80.0");
});

function must<T extends { ok: boolean }>(
  r: T,
): asserts r is T & { ok: true } {
  if (!r.ok) throw new Error(JSON.stringify(r));
}

function ensureRemote(
  s: ReturnType<typeof createInitialState>,
  id = "remote-1",
): void {
  if (!s.servers[id as keyof typeof s.servers]) {
    s.servers[id as keyof typeof s.servers] = {
      id: id as "remote-1",
      kind: "remote",
      ice: [],
      root: [],
    };
  }
}

describe("TAI Oracle / Living Mural / Greasing / Bahia / Vovô", () => {
  it("wires Oracle Thinktank onSteal + score-area shuffle; unsupported empty", () => {
    const def = getCardDef("oracle-thinktank");
    expect(def.unsupported).toEqual([]);
    expect(validateEffectTree(def.onSteal!)).toBeNull();
    const ab = def.paidAbilities?.[0];
    expect(ab?.usableFromRunnerScoreArea).toBe(true);
    expect(ab?.cost).toMatchObject({ clicks: 1, removeTags: 1 });
    expect(validateEffectTree(ab!.effect)).toBeNull();
  });

  it("wires Living Mural turn strength + host-server break", () => {
    const def = getCardDef("living-mural");
    expect(def.unsupported).toEqual([]);
    expect(def.installOnIce).toBe(true);
    expect(validateEffectTree(def.onInstall!)).toBeNull();
    const br = def.paidAbilities?.find((a) => a.id === "mural-break");
    expect(br?.requireProtectingHostServer).toBe(true);
    expect(validateEffectTree(br!.effect)).toBeNull();
  });

  it("wires Greasing the Palm HQ install-paying-costs", () => {
    const def = getCardDef("greasing-the-palm");
    expect(def.unsupported).toEqual([]);
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });

  it("wires Bahia Bands choose_exactly_n + trash hosted spend", () => {
    const def = getCardDef("bahia-bands");
    expect(def.unsupported).toEqual([]);
    expect(validateEffectTree(def.runEvent!.onSuccessfulRun!)).toBeNull();
  });

  it("wires Vovô Ozetti rez discounts + onCorpTurnEnd", () => {
    const def = getCardDef("vovo-ozetti");
    expect(def.unsupported).toEqual([]);
    expect(def.iceRezCostReductionProtectingThisServer).toBe(2);
    expect(def.rootRezCostReductionThisServerIfThreat).toEqual({
      level: 4,
      amount: 2,
    });
    expect(validateEffectTree(def.onCorpTurnEnd!)).toBeNull();
  });

  it("accepts new primitive kinds in validateEffectTree", () => {
    expect(
      validateEffectTree(fx.do({ kind: "shuffle_source_into_rd" })),
    ).toBeNull();
    expect(
      validateEffectTree(fx.gainStrengthThisTurn(2)),
    ).toBeNull();
    expect(
      validateEffectTree(
        fx.chooseExactlyN(2, [
          { id: "a", label: "A", effect: fx.gainCredits("runner", 1) },
          { id: "b", label: "B", effect: fx.gainCredits("runner", 1) },
        ]),
      ),
    ).toBeNull();
    expect(
      validateEffectTree(fx.enableHostedCreditsSpendFor(["trash"])),
    ).toBeNull();
    expect(
      validateEffectTree(fx.mayInstallFromHqPayingCosts(true)),
    ).toBeNull();
    expect(
      validateEffectTree(fx.mayMoveSourceUpgradeToAnotherServerRoot()),
    ).toBeNull();
  });

  it("shuffle_source_into_rd moves Runner-scored source into Corp R&D", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ag = instantiateCard("hostile-takeover", "ag-score", "runner:score");
    s.cards["ag-score"] = ag;
    s.runner.score.push("ag-score");
    const r = evalEffect(
      { state: s, sourceId: "ag-score" },
      fx.shuffleSourceIntoRd(),
    );
    expect(r.ok).toBe(true);
    expect(s.runner.score).not.toContain("ag-score");
    expect(s.corp.deck).toContain("ag-score");
    expect(s.cards["ag-score"]!.zone).toBe("corp:rd");
  });

  it("gain_strength_this_turn boosts effective breaker strength", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const br = instantiateCard("corroder", "br-1", "runner:rig");
    br.breaker = { breaksSubtype: "barrier", strength: 2 };
    s.cards["br-1"] = br;
    s.runner.rig.push("br-1");
    const before = effectiveBreakerStrength(s, "br-1");
    evalEffect(
      { state: s, sourceId: "br-1" },
      fx.gainStrengthThisTurn(3),
    );
    expect(effectiveBreakerStrength(s, "br-1")).toBe(before + 3);
  });

  it("choose_exactly_n opens exclusive multi-choice", () => {
    let s = createInitialState();
    s = structuredClone(s);
    evalEffect(
      { state: s, sourceId: s.runner.identityId },
      fx.chooseExactlyN(2, [
        { id: "one", label: "One", effect: fx.gainCredits("runner", 1) },
        { id: "two", label: "Two", effect: fx.gainCredits("runner", 2) },
        { id: "three", label: "Three", effect: fx.gainCredits("runner", 3) },
      ]),
    );
    expect(s.pendingExclusiveChoices?.remaining).toBe(2);
    expect(s.pendingChoice).not.toBeNull();
  });

  it("hosted credits spend for trash includes heap run source", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ev = instantiateCard("sure-gamble", "ev-1", "runner:heap");
    ev.hostedCredits = 4;
    ev.hostedCreditsSpendFor = ["trash"];
    s.cards["ev-1"] = ev;
    s.runner.discard.push("ev-1");
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
      runSourceId: "ev-1",
    };
    expect(runnerCreditsFor(s, "trash")).toBeGreaterThanOrEqual(4);
    spendRunnerCreditsFor(s, 3, "trash");
    expect(s.cards["ev-1"]!.hostedCredits).toBe(1);
  });

  it("continuousIceRezCostReduction sums rezzed server upgrades", () => {
    let s = createInitialState();
    s = structuredClone(s);
    ensureRemote(s);
    const ice = instantiateCard("ice-wall", "iw-1", "server:remote-1:ice");
    ice.rezCost = 3;
    s.cards["iw-1"] = ice;
    s.servers["remote-1"]!.ice.push("iw-1");
    const up = instantiateCard("corporate-troubleshooter", "up-1", "server:remote-1:root");
    up.type = "upgrade";
    up.rezzed = true;
    up.iceRezCostReductionProtectingThisServer = 2;
    s.cards["up-1"] = up;
    s.servers["remote-1"]!.root.push("up-1");
    expect(continuousIceRezCostReduction(s, "iw-1")).toBe(2);
  });

  it("rootRezCostReduction applies at Threat", () => {
    let s = createInitialState();
    s = structuredClone(s);
    ensureRemote(s);
    const scored = instantiateCard("hostile-takeover", "sc-1", "corp:score");
    scored.agendaPoints = 3;
    s.cards["sc-1"] = scored;
    s.corp.score.push("sc-1");
    const asset = instantiateCard("ice-wall", "as-1", "server:remote-1:root");
    asset.type = "asset";
    asset.rezCost = 5;
    s.cards["as-1"] = asset;
    s.servers["remote-1"]!.root.push("as-1");
    const up = instantiateCard("corporate-troubleshooter", "up-2", "server:remote-1:root");
    up.type = "upgrade";
    up.rezzed = true;
    up.rootRezCostReductionThisServerIfThreat = { level: 3, amount: 2 };
    s.cards["up-2"] = up;
    s.servers["remote-1"]!.root.push("up-2");
    expect(rootRezCostReduction(s, "as-1")).toBe(2);
  });

  it("may_move_source_upgrade_to_another_server_root moves upgrade", () => {
    let s = createInitialState();
    s = structuredClone(s);
    ensureRemote(s);
    const up = instantiateCard("corporate-troubleshooter", "up-m", "server:remote-1:root");
    up.type = "upgrade";
    s.cards["up-m"] = up;
    s.servers["remote-1"]!.root.push("up-m");
    evalEffect(
      { state: s, sourceId: "up-m" },
      fx.mayMoveSourceUpgradeToAnotherServerRoot(),
    );
    const opt = s.pendingChoice!.options.find((o) => o.id === "move-root:hq");
    expect(opt).toBeDefined();
    const moved = applyAction(s, { type: "choose_option", optionId: opt!.id });
    must(moved);
    s = moved.state;
    expect(s.servers.hq.root).toContain("up-m");
    expect(s.servers["remote-1"]!.root).not.toContain("up-m");
  });

  it("usableFromRunnerScoreArea lists Corp paid ability at corp_action_paw", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.activeSide = "corp";
    s.timingKey = "corp.actionPaw";
    const ag = instantiateCard("hostile-takeover", "ag-rs", "runner:score");
    ag.paidAbilities = [
      {
        id: "oracle",
        label: "Oracle",
        clickCost: 1,
        creditCost: 0,
        cost: { clicks: 1 },
        windows: ["corp_action_paw"],
        usableFromRunnerScoreArea: true,
        effect: fx.shuffleSourceIntoRd(),
      },
    ];
    s.cards["ag-rs"] = ag;
    s.runner.score.push("ag-rs");
    s.corp.clicks = 2;
    const legal = queryLegality(s).legal;
    expect(
      legal.some(
        (e) =>
          e.action.type === "use_paid_ability" &&
          e.action.cardId === "ag-rs" &&
          e.action.abilityId === "oracle",
      ),
    ).toBe(true);
  });
});
