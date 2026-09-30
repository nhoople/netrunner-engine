/**
 * WLA (What Lies Ahead) Effect IR / card-field primitives:
 * - memoryCostZeroIfLinkGte (Key Master cloud)
 * - onSuccessfulTraceDuringRun (Spinal Modem)
 * - choose_ice_additional_rez_cost_this_turn (Cortez Chip)
 * - choose_icebreaker_gain_strength_this_turn (Helpful AI)
 * - iceRezCostReductionPerAgendaCounter (Braintrust)
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  effectiveBreakerStrength,
  evalEffect,
  fx,
  iceRezCostReductionFromScoredAgendaCounters,
  instantiateCard,
  resolveTrace,
  startTrace,
  validateEffectTree,
} from "../src/index.js";
import {
  effectiveMemoryCost,
  usedMemory,
} from "../src/state/turn.js";
import type { Action, GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
});

function must(state: GameState, action: Action): GameState {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("WLA memoryCostZeroIfLinkGte (Key Master cloud)", () => {
  it("effective MU is 0 when runner.link >= threshold", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const prog = instantiateCard("corroder", "km-1", "runner:rig");
    prog.memoryCost = 1;
    prog.memoryCostZeroIfLinkGte = 2;
    s.cards["km-1"] = prog;
    s.runner.rig = ["km-1"];
    s.runner.link = 1;
    expect(effectiveMemoryCost(s, "km-1")).toBe(1);
    expect(usedMemory(s)).toBe(1);
    s.runner.link = 2;
    expect(effectiveMemoryCost(s, "km-1")).toBe(0);
    expect(usedMemory(s)).toBe(0);
  });
});

describe("WLA onSuccessfulTraceDuringRun (Spinal Modem)", () => {
  it("fires on Runner identity + rig when trace succeeds during a run", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.runner.link = 0;
    s.runner.credits = 5;
    s.corp.credits = 5;
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
    const modem = instantiateCard("desperado", "sm-1", "runner:rig");
    modem.onSuccessfulTraceDuringRun = fx.gainCredits("runner", 3);
    s.cards["sm-1"] = modem;
    s.runner.rig = ["sm-1"];
    const before = s.runner.credits;
    startTrace(s, "corp-id", 5, fx.giveTags(1));
    const r = resolveTrace(s);
    expect(r.ok).toBe(true);
    expect(s.runner.credits).toBe(before + 3);
    expect(s.runner.tags).toBe(1);
  });

  it("does not fire when there is no active run", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.runner.link = 0;
    s.run = null;
    const modem = instantiateCard("desperado", "sm-1", "runner:rig");
    modem.onSuccessfulTraceDuringRun = fx.gainCredits("runner", 3);
    s.cards["sm-1"] = modem;
    s.runner.rig = ["sm-1"];
    const before = s.runner.credits;
    startTrace(s, "corp-id", 5, fx.giveTags(1));
    expect(resolveTrace(s).ok).toBe(true);
    expect(s.runner.credits).toBe(before);
    expect(s.runner.tags).toBe(1);
  });
});

describe("WLA Cortez Chip ice additional rez cost this turn", () => {
  it("validates IR and bumps chosen ice rez cost map", () => {
    const effect = fx.chooseIceAdditionalRezCostThisTurn(2);
    expect(validateEffectTree(effect)).toBeNull();

    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("ice-wall", "iw-1", "server:hq:ice");
    ice.rezCost = 1;
    s.cards["iw-1"] = ice;
    s.servers.hq.ice = ["iw-1"];
    const ice2 = instantiateCard("enigma", "en-1", "server:rd:ice");
    ice2.rezCost = 3;
    s.cards["en-1"] = ice2;
    s.servers.rd.ice = ["en-1"];

    const chip = instantiateCard("the-toolbox", "cc-1", "runner:rig");
    s.cards["cc-1"] = chip;
    s.runner.rig = ["cc-1"];

    const r = evalEffect(
      { state: s, sourceId: "cc-1" },
      fx.chooseIceAdditionalRezCostThisTurn(2),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice).not.toBeNull();
    expect(s.pendingChoice!.options.length).toBe(2);

    s = must(s, {
      type: "choose_option",
      optionId: "ice-rez-bump:iw-1",
    });
    expect(s.turn.iceAdditionalRezCostThisTurn["iw-1"]).toBe(2);
    expect(s.turn.iceAdditionalRezCostThisTurn["en-1"]).toBeUndefined();
  });

  it("add_ice_additional_rez_cost_this_turn applies directly", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("ice-wall", "iw-1", "server:hq:ice");
    s.cards["iw-1"] = ice;
    s.servers.hq.ice = ["iw-1"];
    const r = evalEffect(
      { state: s, sourceId: s.runner.identityId },
      fx.addIceAdditionalRezCostThisTurn("iw-1", 2),
    );
    expect(r.ok).toBe(true);
    expect(s.turn.iceAdditionalRezCostThisTurn["iw-1"]).toBe(2);
  });
});

describe("WLA Helpful AI choose icebreaker strength this turn", () => {
  it("boosts chosen icebreaker via breakerStrengthBoostsThisTurn", () => {
    const effect = fx.chooseIcebreakerGainStrengthThisTurn(2);
    expect(validateEffectTree(effect)).toBeNull();

    let s = createInitialState();
    s = structuredClone(s);
    const br = instantiateCard("corroder", "br-1", "runner:rig");
    br.breaker = { breaksSubtype: "barrier", strength: 2 };
    s.cards["br-1"] = br;
    const br2 = instantiateCard("yog-0", "br-2", "runner:rig");
    br2.breaker = { breaksSubtype: "code gate", strength: 3 };
    s.cards["br-2"] = br2;
    s.runner.rig = ["br-1", "br-2"];

    const ai = instantiateCard("the-toolbox", "hai-1", "runner:rig");
    s.cards["hai-1"] = ai;
    s.runner.rig.push("hai-1");

    const before = effectiveBreakerStrength(s, "br-1");
    const r = evalEffect(
      { state: s, sourceId: "hai-1" },
      fx.chooseIcebreakerGainStrengthThisTurn(2),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice).not.toBeNull();
    s = must(s, {
      type: "choose_option",
      optionId: "icebreaker-str:br-1",
    });
    expect(s.turn.breakerStrengthBoostsThisTurn["br-1"]).toBe(2);
    expect(effectiveBreakerStrength(s, "br-1")).toBe(before + 2);
    expect(s.turn.breakerStrengthBoostsThisTurn["br-2"]).toBeUndefined();
  });

  it("auto-applies when only one icebreaker is installed", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const br = instantiateCard("corroder", "br-1", "runner:rig");
    br.breaker = { breaksSubtype: "barrier", strength: 2 };
    s.cards["br-1"] = br;
    s.runner.rig = ["br-1"];
    const r = evalEffect(
      { state: s, sourceId: s.runner.identityId },
      fx.chooseIcebreakerGainStrengthThisTurn(1),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice).toBeNull();
    expect(s.turn.breakerStrengthBoostsThisTurn["br-1"]).toBe(1);
  });
});

describe("WLA Braintrust iceRezCostReductionPerAgendaCounter", () => {
  it("sums reduction from scored agenda counters", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ag = instantiateCard("astroscript-pilot-program", "bt-1", "corp:score");
    ag.agendaCounters = 3;
    ag.iceRezCostReductionPerAgendaCounter = 1;
    s.cards["bt-1"] = ag;
    s.corp.score = ["bt-1"];
    expect(iceRezCostReductionFromScoredAgendaCounters(s)).toBe(3);

    const ag2 = instantiateCard("private-security-force", "bt-2", "corp:score");
    ag2.agendaCounters = 2;
    ag2.iceRezCostReductionPerAgendaCounter = 1;
    s.cards["bt-2"] = ag2;
    s.corp.score.push("bt-2");
    expect(iceRezCostReductionFromScoredAgendaCounters(s)).toBe(5);
  });
});
