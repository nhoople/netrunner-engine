/**
 * Blanked sources do not apply continuous rez/trash cost modifiers (CR 9.12.1d).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  continuousIceRezCostIncrease,
  continuousIceRezCostReduction,
  createInitialState,
  crDataPresent,
  iceRezCostReductionFromScoredAgendaCounters,
  instantiateCard,
  runnerTrashCostForCard,
} from "../src/index.js";
import { suppressAbilities } from "../src/state/lingeringEffects.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.16");
});

describe("blanked continuous rez/trash costs (CR 9.12.1d)", () => {
  it("drops Xanadu ice rez cost increase while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const wall = instantiateCard("ice-wall", "wall-1", "server:hq:ice");
    s.cards["wall-1"] = wall;
    s.servers.hq.ice = ["wall-1"];
    const xanadu = instantiateCard("xanadu", "xan-1", "runner:installed");
    s.cards["xan-1"] = xanadu;
    s.runner.installed = ["xan-1"];

    expect(continuousIceRezCostIncrease(s, "wall-1")).toBe(1);
    suppressAbilities(s, xanadu.id);
    expect(continuousIceRezCostIncrease(s, "wall-1")).toBe(0);
  });

  it("drops Cat's Cradle subtype rez increase while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const enigma = instantiateCard("enigma", "en-1", "server:hq:ice");
    s.cards["en-1"] = enigma;
    s.servers.hq.ice = ["en-1"];
    const cradle = instantiateCard("cats-cradle", "cc-1", "runner:installed");
    s.cards["cc-1"] = cradle;
    s.runner.installed = ["cc-1"];

    expect(continuousIceRezCostIncrease(s, "en-1")).toBeGreaterThan(0);
    suppressAbilities(s, cradle.id);
    expect(continuousIceRezCostIncrease(s, "en-1")).toBe(0);
  });

  it("drops Vovô Ozetti ice rez reduction while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const wall = instantiateCard("ice-wall", "wall-1", "server:remote-1:ice");
    wall.rezzed = false;
    s.cards["wall-1"] = wall;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: ["wall-1"],
      root: ["vovo-1"],
    };
    const vovo = instantiateCard("vovo-ozetti", "vovo-1", "server:remote-1:root");
    vovo.rezzed = true;
    s.cards["vovo-1"] = vovo;

    const before = continuousIceRezCostReduction(s, "wall-1");
    expect(before).toBeGreaterThan(0);
    suppressAbilities(s, vovo.id);
    expect(continuousIceRezCostReduction(s, "wall-1")).toBe(0);
  });

  it("drops Braintrust ice rez reduction while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const bt = instantiateCard("braintrust", "bt-1", "corp:score");
    bt.agendaCounters = 2;
    s.cards["bt-1"] = bt;
    s.corp.scoreArea = ["bt-1"];

    expect(iceRezCostReductionFromScoredAgendaCounters(s)).toBeGreaterThan(0);
    suppressAbilities(s, bt.id);
    expect(iceRezCostReductionFromScoredAgendaCounters(s)).toBe(0);
  });

  it("drops Demolisher trash-cost reduction while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const pad = instantiateCard("pad-campaign", "pad-1", "server:remote-1:root");
    pad.rezzed = true;
    s.cards["pad-1"] = pad;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["pad-1"],
    };
    const demo = instantiateCard("demolisher", "demo-1", "runner:installed");
    s.cards["demo-1"] = demo;
    s.runner.installed = ["demo-1"];

    const printed = pad.trashCost ?? 0;
    expect(runnerTrashCostForCard(s, "pad-1")).toBeLessThan(printed);
    suppressAbilities(s, demo.id);
    expect(runnerTrashCostForCard(s, "pad-1")).toBe(printed);
  });
});
