/**
 * TAI v0.78: LilyPAD, Hannah Wheels, Armed Asset Protection, Saci, Tatu-Bola.
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
  validateEffectTree,
} from "../src/index.js";
import { noteProgramOrHardwareInstalled } from "../src/state/programHardwareInstall.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.127.0");
});

describe("TAI LilyPAD / Hannah / Armed / Saci / Tatu-Bola", () => {
  it("wires LilyPAD muBonus + onFirstProgramInstallEachTurn", () => {
    const def = getCardDef("lilypad");
    expect(def.unsupported).toEqual([]);
    expect(def.muBonus).toBe(2);
    expect(validateEffectTree(def.onFirstProgramInstallEachTurn!)).toBeNull();
  });

  it("first program install fires LilyPAD choice", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const pad = instantiateCard("lilypad", "pad-1", "runner:rig");
    pad.onFirstProgramInstallEachTurn = getCardDef(
      "lilypad",
    ).onFirstProgramInstallEachTurn;
    s.cards["pad-1"] = pad;
    s.runner.rig.push("pad-1");
    const prog = instantiateCard("sure-gamble", "p-1", "runner:rig");
    prog.type = "program";
    s.cards["p-1"] = prog;
    s.runner.rig.push("p-1");
    s.turn.programsInstalledThisTurn = 1;
    noteProgramOrHardwareInstalled(s, "p-1");
    expect(s.pendingChoice).toBeTruthy();
    expect(s.pendingChoice?.sourceId).toBe("pad-1");
  });

  it("wires Hannah Wheels startsRun + onRunEnd run_unsuccessful", () => {
    const def = getCardDef("hannah-wheels-pilintra");
    expect(def.unsupported).toEqual([]);
    const runAb = def.paidAbilities?.[0];
    expect(runAb?.oncePerTurn).toBe(true);
    expect(runAb?.startsRun?.servers).toBe("remote");
    expect(validateEffectTree(runAb!.startsRun!.onRunEnd!)).toBeNull();
    expect(validateEffectTree(def.paidAbilities![1]!.effect)).toBeNull();
  });

  it("run_unsuccessful / run_successful conds", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.run = {
      attackedServerId: "hq",
      position: null,
      phase: "approach_server",
      successful: false,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: null,
      endedTheRun: true,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    const ice = instantiateCard("phoneutria", "ph-1", "server:hq:ice");
    s.cards["ph-1"] = ice;
    expect(
      evalEffect(
        { state: s, sourceId: "ph-1" },
        {
          op: "if",
          cond: { op: "run_unsuccessful" },
          then: fx.do({ kind: "give_tags", amount: 1 }),
        },
      ).ok,
    ).toBe(true);
    expect(s.runner.tags).toBe(1);
  });

  it("wires Armed Asset Protection onPlay", () => {
    const def = getCardDef("armed-asset-protection");
    expect(def.unsupported).toEqual([]);
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });

  it("gain_credits_per_distinct_faceup_archive_type", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ag = instantiateCard("hostile-takeover", "ag-1", "corp:archives");
    ag.faceup = true;
    const ice = instantiateCard("enigma", "ice-a", "corp:archives");
    ice.faceup = true;
    const ice2 = instantiateCard("enigma", "ice-b", "corp:archives");
    ice2.faceup = true;
    s.cards["ag-1"] = ag;
    s.cards["ice-a"] = ice;
    s.cards["ice-b"] = ice2;
    s.corp.discard = ["ag-1", "ice-a", "ice-b"];
    s.corp.credits = 0;
    const src = instantiateCard("armed-asset-protection", "aap-1", "corp:hq");
    s.cards["aap-1"] = src;
    const r = evalEffect(
      { state: s, sourceId: "aap-1" },
      fx.do({ kind: "gain_credits_per_distinct_faceup_archive_type" }),
    );
    expect(r.ok).toBe(true);
    // types: agenda + ice = 2, +2 agenda bonus = 4
    expect(s.corp.credits).toBe(4);
  });

  it("wires Saci onHostRezzed/Derezzed", () => {
    const def = getCardDef("saci");
    expect(def.unsupported).toEqual([]);
    expect(def.installOnIce).toBe(true);
    expect(validateEffectTree(def.onHostRezzed!)).toBeNull();
    expect(validateEffectTree(def.onHostDerezzed!)).toBeNull();
  });

  it("wires Tatu-Bola onPass swap + ETR", () => {
    const def = getCardDef("tatu-bola");
    expect(def.unsupported).toEqual([]);
    expect(validateEffectTree(def.onPass!)).toBeNull();
    expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
  });

  it("swap_ice_with_hq replaces ice and gains credits", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const tatu = instantiateCard("tatu-bola", "tb-1", "server:hq:ice");
    tatu.rezzed = true;
    const fromHq = instantiateCard("enigma", "hq-ice", "corp:hq");
    s.cards["tb-1"] = tatu;
    s.cards["hq-ice"] = fromHq;
    s.servers.hq.ice = ["tb-1"];
    s.corp.hand = ["hq-ice"];
    s.corp.credits = 0;
    const r = evalEffect(
      { state: s, sourceId: "tb-1" },
      fx.do({ kind: "swap_ice_with_hq", gainCredits: 4 }),
    );
    expect(r.ok).toBe(true);
    expect(s.servers.hq.ice).toEqual(["hq-ice"]);
    expect(s.corp.hand).toContain("tb-1");
    expect(s.cards["hq-ice"]!.rezzed).toBe(false);
    expect(s.corp.credits).toBe(4);
  });
});
