/**
 * TAI v0.79: Solidarity Badge, Eru Ayase-Pessoa, Valentão, S-Dobrado.
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
import { noteFirstCorpCardTrashEachTurn } from "../src/state/trashHooks.js";
import { modifiersFromStartsRun } from "../src/state/runStart.js";
import { payCost, canPayCost } from "../src/state/costs.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v0.96.0");
});

describe("TAI Solidarity / Eru / Valentão / S-Dobrado", () => {
  it("wires Solidarity Badge trash + onTurnBegin; unsupported empty", () => {
    const def = getCardDef("solidarity-badge");
    expect(def.unsupported).toEqual([]);
    expect(validateEffectTree(def.onFirstCorpCardTrashEachTurn!)).toBeNull();
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
  });

  it("first Corp trash places power on Solidarity Badge", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const badge = instantiateCard("solidarity-badge", "sb-1", "runner:rig");
    badge.onFirstCorpCardTrashEachTurn = getCardDef(
      "solidarity-badge",
    ).onFirstCorpCardTrashEachTurn;
    s.cards["sb-1"] = badge;
    s.runner.rig.push("sb-1");
    noteFirstCorpCardTrashEachTurn(s);
    expect(s.cards["sb-1"]!.powerCounters).toBe(1);
    noteFirstCorpCardTrashEachTurn(s);
    expect(s.cards["sb-1"]!.powerCounters).toBe(1);
  });

  it("wires Eru tags cost + Archives→R&D redirect", () => {
    const def = getCardDef("eru-ayase-pessoa");
    expect(def.unsupported).toEqual([]);
    const ab = def.paidAbilities?.[0];
    expect(ab?.cost).toMatchObject({ clicks: 1, tags: 1 });
    expect(ab?.startsRun?.servers).toBe("archives");
    expect(ab?.startsRun?.redirectSuccessTo).toBe("rd");
    expect(validateEffectTree(ab!.startsRun!.onSuccessfulRun!)).toBeNull();
  });

  it("CostSpec.tags is always payable and adds tags", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const card = instantiateCard("eru-ayase-pessoa", "eru-1", "runner:rig");
    s.cards["eru-1"] = card;
    s.runner.rig.push("eru-1");
    expect(canPayCost(s, "runner", { tags: 1 }, card)).toBe(true);
    payCost(s, "runner", { tags: 1 }, "test", card);
    expect(s.runner.tags).toBe(1);
  });

  it("wires Valentão rezAdditionalCost + credits_gt ETR", () => {
    const def = getCardDef("valentao");
    expect(def.unsupported).toEqual([]);
    expect(validateEffectTree(def.rezAdditionalCost!)).toBeNull();
    expect(def.subroutines).toHaveLength(3);
    expect(validateEffectTree(def.subroutines![2]!.effect)).toBeNull();
  });

  it("credits_gt_other_side cond", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.corp.credits = 5;
    s.runner.credits = 3;
    const ice = instantiateCard("valentao", "v-1", "server:hq:ice");
    s.cards["v-1"] = ice;
    const before = s.corp.credits;
    const r = evalEffect(
      { state: s, sourceId: "v-1" },
      {
        op: "if",
        cond: { op: "credits_gt_other_side", side: "corp" },
        then: fx.do({ kind: "gain_credits", side: "corp", amount: 1 }),
      },
    );
    expect(r.ok).toBe(true);
    expect(s.corp.credits).toBe(before + 1);
  });

  it("wires S-Dobrado bypassFirst + Threat second click-bypass", () => {
    const def = getCardDef("s-dobrado");
    expect(def.unsupported).toEqual([]);
    expect(def.runEvent?.bypassFirstEncounter).toBe(true);
    expect(def.runEvent?.bypassSecondEncounterForClickIfThreat).toBe(4);
  });

  it("Threat gates bypassSecondEncounterForClick at run start", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const src = instantiateCard("s-dobrado", "sd-1", "runner:grip");
    s.cards["sd-1"] = src;
    const modsLow = modifiersFromStartsRun(
      s,
      {
        servers: "central",
        bypassFirstEncounter: true,
        bypassSecondEncounterForClickIfThreat: 4,
      },
      "sd-1",
    );
    expect(modsLow.bypassSecondEncounterForClick).toBeFalsy();
    const ag = instantiateCard("hostile-takeover", "ag-1", "corp:score");
    ag.agendaPoints = 4;
    s.cards["ag-1"] = ag;
    s.corp.score = ["ag-1"];
    expect(agendaPointsFor(s, "corp")).toBe(4);
    const modsHi = modifiersFromStartsRun(
      s,
      {
        servers: "central",
        bypassFirstEncounter: true,
        bypassSecondEncounterForClickIfThreat: 4,
      },
      "sd-1",
    );
    expect(modsHi.bypassSecondEncounterForClick).toBe(true);
  });
});
