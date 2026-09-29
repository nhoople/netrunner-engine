/**
 * Parhelion v0.63: Hafrún, Klevetnik, Unsmiling Tsarevna.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  abilitiesSuppressed,
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
  assertCardsPinnedTag("v1.38.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("PH Hafrún", () => {
  it("wires onRez may-trash-HQ → forbid runner break for run", () => {
    const def = getCardDef("hafrun");
    expect(def.unsupported).toEqual([]);
    expect(validateEffectTree(def.onRez!)).toBeNull();
    expect(validateEffectTree(fx.mayTrashHqThen(fx.forbidInstalledRunnerBreakForRun()))).toBeNull();

    let s = createInitialState();
    s = structuredClone(s);
    const filler = instantiateCard("hedge-fund", "hq-1", "corp:hq");
    s.cards["hq-1"] = filler;
    s.corp.hand = ["hq-1"];
    const ice = instantiateCard("hafrun", "haf-1", "server:hq:ice");
    s.cards["haf-1"] = ice;
    s.servers.hq.ice = ["haf-1"];
    const orca = instantiateCard("orca", "orca-1", "runner:rig");
    s.cards["orca-1"] = orca;
    s.runner.rig = ["orca-1"];
    s.run = {
      attackedServerId: "hq",
      phase: "approach",
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
    const r = evalEffect({ state: s, sourceId: "haf-1" }, def.onRez!);
    expect(r.ok).toBe(true);
    expect(s.pendingChoice?.chooser).toBe("corp");
    s = must(s, { type: "choose_option", optionId: "trash-hq:hq-1" });
    expect(s.corp.hand).not.toContain("hq-1");
    // sole runner card → auto forbid
    expect(s.cards["orca-1"]!.cannotBreakSubsThisRun).toBe(true);
  });
});

describe("PH Klevetnik", () => {
  it("wires onRez may-credits → blank resource until Corp turn end", () => {
    const def = getCardDef("klevetnik");
    expect(def.unsupported).toEqual([]);
    expect(validateEffectTree(def.onRez!)).toBeNull();

    let s = createInitialState();
    s = structuredClone(s);
    const res = instantiateCard("red-team", "res-1", "runner:rig");
    s.cards["res-1"] = res;
    s.runner.rig = ["res-1"];
    const ice = instantiateCard("klevetnik", "klev-1", "server:hq:ice");
    s.cards["klev-1"] = ice;
    s.servers.hq.ice = ["klev-1"];
    s.run = {
      attackedServerId: "hq",
      phase: "approach",
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
    const r = evalEffect({ state: s, sourceId: "klev-1" }, def.onRez!);
    expect(r.ok).toBe(true);
    s = must(s, { type: "choose_option", optionId: "give-credits" });
    expect(s.runner.credits).toBeGreaterThanOrEqual(2);
    expect(s.cards["res-1"]!.abilitiesBlanked).toBe(true);
    expect(abilitiesSuppressed(s, "res-1")).toBe(true);
  });
});

describe("PH Unsmiling Tsarevna", () => {
  it("wires onRez may-credits → max 1 printed break per encounter", () => {
    const def = getCardDef("unsmiling-tsarevna");
    expect(def.unsupported).toEqual([]);
    expect(def.subroutines?.length).toBe(2);
    expect(validateEffectTree(def.onRez!)).toBeNull();
    expect(validateEffectTree(fx.limitPrintedBreaksOnSourceForRun(1))).toBeNull();

    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("unsmiling-tsarevna", "uns-1", "server:hq:ice");
    s.cards["uns-1"] = ice;
    s.servers.hq.ice = ["uns-1"];
    s.run = {
      attackedServerId: "hq",
      phase: "approach",
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
    const r = evalEffect({ state: s, sourceId: "uns-1" }, def.onRez!);
    expect(r.ok).toBe(true);
    s = must(s, { type: "choose_option", optionId: "give-credits" });
    expect(s.cards["uns-1"]!.maxPrintedSubsBreakablePerEncounter).toBe(1);
  });
});
