/**
 * Midnight Sun Ivik cluster: self rez-cost discount of `amount` per
 * already-rezzed ice matching a subtype (`rezCostDiscountPerRezzedSubtype`;
 * CR §1.16.2a / §8.1.2d).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  getCardDef,
  instantiateCard,
  queryLegality,
  rezCostDiscountPerRezzedSubtype,
} from "../src/index.js";
import type { ServerId } from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.40.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

/** Approach PAW with unrezzed Ivik on a remote; optional rezzed code gates elsewhere. */
function approachIvik(opts: {
  rezzedCodeGates?: number;
  rezzedBarriers?: number;
  discount?: { subtype: string; amount: number };
}) {
  let s = createInitialState();
  s = structuredClone(s);

  const ivik = instantiateCard("ivik", "ivik-1", "server:remote-1:ice");
  ivik.rezCostDiscountPerRezzedSubtype = opts.discount ?? {
    subtype: "code gate",
    amount: 1,
  };
  ivik.unsupported = [];
  s.cards["ivik-1"] = ivik;
  s.servers["remote-1"] = {
    id: "remote-1",
    kind: "remote",
    ice: ["ivik-1"],
    root: [],
  };

  let n = 0;
  for (let i = 0; i < (opts.rezzedCodeGates ?? 0); i++) {
    n += 1;
    const id = `cg-${n}`;
    const ice = instantiateCard("enigma", id, "server:hq:ice");
    ice.rezzed = true;
    ice.faceup = true;
    s.cards[id] = ice;
    s.servers.hq.ice.push(id);
  }
  for (let i = 0; i < (opts.rezzedBarriers ?? 0); i++) {
    n += 1;
    const id = `bar-${n}`;
    const ice = instantiateCard("ice-wall", id, "server:rd:ice");
    ice.rezzed = true;
    ice.faceup = true;
    s.cards[id] = ice;
    s.servers.rd.ice.push(id);
  }

  s.corp.credits = 20;
  s.runner.credits = 10;
  s.runner.clicks = 4;
  s.activeSide = "runner";
  s.timingKey = "runner.takeAction";

  s = must(s, { type: "basic_run", serverId: "remote-1" as ServerId });
  return s;
}

describe("MS rezCostDiscountPerRezzedSubtype (Ivik)", () => {
  it("counts 0 with no rezzed matching ice", () => {
    const s = approachIvik({});
    expect(rezCostDiscountPerRezzedSubtype(s, "ivik-1")).toBe(0);
  });

  it("counts 1¢ per rezzed code gate", () => {
    const s = approachIvik({ rezzedCodeGates: 3 });
    expect(rezCostDiscountPerRezzedSubtype(s, "ivik-1")).toBe(3);
  });

  it("ignores rezzed ice lacking the subtype", () => {
    const s = approachIvik({ rezzedCodeGates: 1, rezzedBarriers: 2 });
    expect(rezCostDiscountPerRezzedSubtype(s, "ivik-1")).toBe(1);
  });

  it("ignores unrezzed matching ice", () => {
    let s = approachIvik({ rezzedCodeGates: 0 });
    s = structuredClone(s);
    const ice = instantiateCard("enigma", "cg-unrez", "server:hq:ice");
    ice.rezzed = false;
    s.cards["cg-unrez"] = ice;
    s.servers.hq.ice.push("cg-unrez");
    expect(rezCostDiscountPerRezzedSubtype(s, "ivik-1")).toBe(0);
  });

  it("does not count the ice being rezzed", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ivik = instantiateCard("ivik", "ivik-1", "server:hq:ice");
    // Even if somehow subtype matched, self must not count while unrezzed.
    ivik.subtypes = ["barrier", "ap", "code gate"];
    ivik.rezzed = false;
    ivik.rezCostDiscountPerRezzedSubtype = {
      subtype: "code gate",
      amount: 1,
    };
    s.cards["ivik-1"] = ivik;
    s.servers.hq.ice = ["ivik-1"];
    expect(rezCostDiscountPerRezzedSubtype(s, "ivik-1")).toBe(0);
  });

  it("rezzes Ivik paying base−N with N rezzed code gates", () => {
    let s = approachIvik({ rezzedCodeGates: 2 });
    const base = s.cards["ivik-1"].rezCost ?? 0;
    expect(base).toBe(7);
    const before = s.corp.credits;
    s = must(s, { type: "rez_ice", cardId: "ivik-1" });
    expect(s.corp.credits).toBe(before - (base - 2));
    expect(
      s.log.some((l) => /rezzes Ivik for 5¢ \(base 7−2\)/.test(l)),
    ).toBe(true);
  });

  it("floors rez cost at 0 when discount exceeds base", () => {
    let s = approachIvik({ rezzedCodeGates: 10 });
    const before = s.corp.credits;
    s = must(s, { type: "rez_ice", cardId: "ivik-1" });
    expect(s.corp.credits).toBe(before);
    expect(s.cards["ivik-1"].rezzed).toBe(true);
  });

  it("legality includes rez when discount makes cost affordable", () => {
    let s = approachIvik({ rezzedCodeGates: 4 });
    // Ivik 7 − 4 = 3
    s = structuredClone(s);
    s.corp.credits = 3;
    const legal = queryLegality(s);
    expect(
      legal.legal.some(
        (e) => e.action.type === "rez_ice" && e.action.cardId === "ivik-1",
      ),
    ).toBe(true);

    s = must(s, { type: "rez_ice", cardId: "ivik-1" });
    expect(s.corp.credits).toBe(0);
  });

  it("legality omits rez when Corp still cannot afford after discount", () => {
    let s = approachIvik({ rezzedCodeGates: 1 });
    // Ivik 7 − 1 = 6
    s = structuredClone(s);
    s.corp.credits = 5;
    const legal = queryLegality(s);
    expect(
      legal.legal.some(
        (e) => e.action.type === "rez_ice" && e.action.cardId === "ivik-1",
      ),
    ).toBe(false);

    const r = applyAction(s, { type: "rez_ice", cardId: "ivik-1" });
    expect(r.ok).toBe(false);
  });

  it("stacks with continuous ice rez cost increases (net modifier)", () => {
    let s = approachIvik({ rezzedCodeGates: 2 });
    s = structuredClone(s);
    const cradle = instantiateCard("cats-cradle", "cc-1", "runner:rig");
    cradle.iceRezCostIncreaseBySubtype = {
      subtype: "barrier",
      amount: 1,
    };
    s.cards["cc-1"] = cradle;
    s.runner.rig = ["cc-1"];
    // Ivik is barrier: +1 from Cat's Cradle, −2 from two code gates → net −1
    const base = s.cards["ivik-1"].rezCost ?? 0;
    const before = s.corp.credits;
    s = must(s, { type: "rez_ice", cardId: "ivik-1" });
    expect(s.corp.credits).toBe(before - (base + 1 - 2));
  });
});

describe("MS Ivik card wiring (v0.31.0+)", () => {
  it("Ivik clears unsupported with rezCostDiscountPerRezzedSubtype", () => {
    const def = getCardDef("ivik");
    expect(def.unsupported).toEqual([]);
    expect(def.rezCostDiscountPerRezzedSubtype).toEqual({
      subtype: "code gate",
      amount: 1,
    });
    expect(def.type).toBe("ice");
    expect(def.rezCost).toBe(7);
    expect(def.strength).toBe(5);
    expect(def.subtypes).toEqual(expect.arrayContaining(["barrier", "ap"]));
  });
});
