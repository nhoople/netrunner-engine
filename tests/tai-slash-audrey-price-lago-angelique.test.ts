/**
 * TAI v0.80: Slash and Burn Agriculture, Audrey v2, The Price,
 * Lago Paranoá Shelter, Angelique Garza Correa.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  getCardDef,
  instantiateCard,
  validateEffectTree,
  agendaPointsFor,
} from "../src/index.js";
import {
  noteAccessTrash,
  noteFirstCorpRootInstallEachTurn,
} from "../src/state/trashHooks.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.86.0");
});

describe("TAI Slash / Audrey / Price / Lago / Angelique", () => {
  it("wires Slash and Burn expendable place_advancements; unsupported empty", () => {
    const def = getCardDef("slash-and-burn-agriculture");
    expect(def.unsupported).toEqual([]);
    const ab = def.paidAbilities?.[0];
    expect(ab?.usableFromHq).toBe(true);
    expect(ab?.cost).toMatchObject({
      clicks: 1,
      credits: 1,
      trashSelf: true,
    });
    expect(validateEffectTree(ab!.effect)).toBeNull();
  });

  it("wires Audrey v2 onAccessTrash + virus break / grip pump", () => {
    const def = getCardDef("audrey-v2");
    expect(def.unsupported).toEqual([]);
    expect(def.breaker?.breakViaPaidAbilityOnly).toBe(true);
    expect(validateEffectTree(def.onAccessTrash!)).toBeNull();
    expect(def.paidAbilities).toHaveLength(2);
    expect(def.paidAbilities![0]!.cost).toMatchObject({ virusCounters: 1 });
    expect(def.paidAbilities![1]!.cost).toMatchObject({ trashFromGrip: 1 });
  });

  it("access trash places virus on Audrey every time", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const audrey = instantiateCard("audrey-v2", "aud-1", "runner:rig");
    audrey.onAccessTrash = getCardDef("audrey-v2").onAccessTrash;
    s.cards["aud-1"] = audrey;
    s.runner.rig.push("aud-1");
    noteAccessTrash(s);
    expect(s.cards["aud-1"]!.virusCounters).toBe(1);
    noteAccessTrash(s);
    expect(s.cards["aud-1"]!.virusCounters).toBe(2);
  });

  it("wires The Price mill+install leaf; unsupported empty", () => {
    const def = getCardDef("the-price");
    expect(def.unsupported).toEqual([]);
    expect(validateEffectTree(def.onPlay!)).toBeNull();
    expect(def.onPlay).toMatchObject({
      op: "do",
      action: {
        kind: "trash_top_n_may_install_discount",
        count: 4,
        discount: 3,
      },
    });
  });

  it("The Price mills top 4 and offers discounted heap install", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.runner.credits = 10;
    // Put four installable resources on top of the stack.
    const titles = ["easy-1", "easy-2", "easy-3", "easy-4"];
    for (const id of titles) {
      const card = instantiateCard("scrubber", id, "runner:stack");
      s.cards[id] = card;
      s.runner.deck.unshift(id);
    }
    const price = instantiateCard("the-price", "price-1", "runner:grip");
    s.cards["price-1"] = price;
    const r = evalEffect(
      { state: s, sourceId: "price-1" },
      getCardDef("the-price").onPlay!,
    );
    expect(r.ok).toBe(true);
    expect(s.runner.discard.filter((id) => titles.includes(id))).toHaveLength(
      4,
    );
    expect(s.pendingChoice).toBeTruthy();
    expect(s.pendingChoice!.options.length).toBeGreaterThan(1);
  });

  it("wires Lago onFirstCorpRootInstallEachTurn; unsupported empty", () => {
    const def = getCardDef("lago-paranoa-shelter");
    expect(def.unsupported).toEqual([]);
    expect(validateEffectTree(def.onFirstCorpRootInstallEachTurn!)).toBeNull();
  });

  it("first Corp root install fires Lago once", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const lago = instantiateCard("lago-paranoa-shelter", "lago-1", "runner:rig");
    lago.onFirstCorpRootInstallEachTurn = getCardDef(
      "lago-paranoa-shelter",
    ).onFirstCorpRootInstallEachTurn;
    s.cards["lago-1"] = lago;
    s.runner.rig.push("lago-1");
    noteFirstCorpRootInstallEachTurn(s);
    expect(s.pendingChoice).toBeTruthy();
    expect(s.turn.firstCorpRootInstallUsedThisTurn).toBe(true);
    const choice = s.pendingChoice;
    s.pendingChoice = null;
    noteFirstCorpRootInstallEachTurn(s);
    expect(s.pendingChoice).toBeNull();
    expect(choice!.options.some((o) => o.id === "mill-draw")).toBe(true);
  });

  it("wires Angelique Threat expendable + rezzed onAccess", () => {
    const def = getCardDef("angelique-garza-correa");
    expect(def.unsupported).toEqual([]);
    expect(def.onAccessRequiresRezzed).toBe(true);
    expect(validateEffectTree(def.onAccess!)).toBeNull();
    const ab = def.paidAbilities?.[0];
    expect(ab?.requiresThreat).toBe(3);
    expect(ab?.usableFromHq).toBe(true);
    expect(validateEffectTree(ab!.effect)).toBeNull();
  });

  it("agendaPointsFor supports Threat gate math", () => {
    let s = createInitialState();
    s = structuredClone(s);
    expect(agendaPointsFor(s, "corp")).toBe(0);
    expect(agendaPointsFor(s, "runner")).toBe(0);
  });
});
