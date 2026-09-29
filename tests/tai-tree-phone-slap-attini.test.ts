/**
 * TAI v0.76: Tree Line, Phoneutria, Slap Vandal, Attini.
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
  agendaPointsFor,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.35.0");
});

describe("TAI Tree Line / Phoneutria / Slap Vandal / Attini", () => {
  it("wires Tree Line canAdvance + expendable + gain/ETR; unsupported empty", () => {
    const def = getCardDef("tree-line");
    expect(def.unsupported).toEqual([]);
    expect(def.canAdvance).toBe(true);
    expect(def.strengthPerAdvancement).toBe(1);
    const ab = def.paidAbilities?.[0];
    expect(ab?.usableFromHq).toBe(true);
    expect(ab?.cost).toMatchObject({
      clicks: 1,
      credits: 1,
      trashSelf: true,
    });
    expect(validateEffectTree(ab!.effect)).toBeNull();
    expect(def.subroutines).toHaveLength(1);
    expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
  });

  it("place_advancements anyInstalledIce targets ice without canAdvance", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("enigma", "ice-1", "server:hq:ice");
    ice.canAdvance = false;
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];
    const src = instantiateCard("tree-line", "tl-1", "corp:hq");
    s.cards["tl-1"] = src;
    s.corp.hand.push("tl-1");
    const r = evalEffect(
      { state: s, sourceId: "tl-1" },
      fx.placeAdvancements(3, false, { anyInstalledIce: true }),
    );
    expect(r.ok).toBe(true);
    expect(s.cards["ice-1"]!.advancementTokens).toBe(3);
  });

  it("wires Phoneutria onPass grip≥4 + 2×net; unsupported empty", () => {
    const def = getCardDef("phoneutria");
    expect(def.unsupported).toEqual([]);
    expect(def.onPass).toBeDefined();
    expect(validateEffectTree(def.onPass!)).toBeNull();
    expect(def.subroutines).toHaveLength(2);
    for (const sub of def.subroutines ?? []) {
      expect(validateEffectTree(sub.effect)).toBeNull();
    }
  });

  it("grip_count_gte cond", () => {
    let s = createInitialState();
    s = structuredClone(s);
    for (let i = 0; i < 4; i++) {
      const id = `g-${i}`;
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }
    const ice = instantiateCard("phoneutria", "ph-1", "server:hq:ice");
    ice.onPass = getCardDef("phoneutria").onPass;
    s.cards["ph-1"] = ice;
    const before = s.runner.tags;
    const r = evalEffect({ state: s, sourceId: "ph-1" }, ice.onPass!);
    expect(r.ok).toBe(true);
    expect(s.runner.tags).toBe(before + 1);
  });

  it("wires Slap Vandal installOnIce + oncePerEncounter break; unsupported empty", () => {
    const def = getCardDef("slap-vandal");
    expect(def.unsupported).toEqual([]);
    expect(def.installOnIce).toBe(true);
    const ab = def.paidAbilities?.[0];
    expect(ab?.oncePerEncounter).toBe(true);
    expect(validateEffectTree(ab!.effect)).toBeNull();
  });

  it("wires Attini threatCannotSpendCreditsDuringSubs + 3× pay-or-net", () => {
    const def = getCardDef("attini");
    expect(def.unsupported).toEqual([]);
    expect(def.threatCannotSpendCreditsDuringSubs).toBe(3);
    expect(def.subroutines).toHaveLength(3);
    for (const sub of def.subroutines ?? []) {
      expect(validateEffectTree(sub.effect)).toBeNull();
    }
  });

  it("Attini threat path forces net (no pay) when agenda points ≥ 3", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ag = instantiateCard("hostile-takeover", "ag-1", "corp:score");
    ag.agendaPoints = 3;
    s.cards["ag-1"] = ag;
    s.corp.score = ["ag-1"];
    expect(agendaPointsFor(s, "corp")).toBe(3);
    for (let i = 0; i < 3; i++) {
      const id = `g-${i}`;
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }
    s.runner.credits = 10;
    const ice = instantiateCard("attini", "at-1", "server:hq:ice");
    ice.subroutines = getCardDef("attini").subroutines;
    s.cards["at-1"] = ice;
    const beforeHand = s.runner.hand.length;
    const beforeCred = s.runner.credits;
    const r = evalEffect(
      { state: s, sourceId: "at-1" },
      ice.subroutines![0]!.effect,
    );
    expect(r.ok).toBe(true);
    expect(s.runner.hand.length).toBe(beforeHand - 1);
    expect(s.runner.credits).toBe(beforeCred);
    expect(s.pendingChoice).toBeFalsy();
  });
});
