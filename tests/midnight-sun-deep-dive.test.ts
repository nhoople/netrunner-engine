/**
 * Midnight Sun Deep Dive: all-centrals success gate + set-aside R&D access.
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
  instantiateCard,
  validateEffectTree,
  agendaPointsFor,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.44.0");
});

describe("MS deep_dive_resolve", () => {
  it("validates deep_dive_resolve tree", () => {
    expect(validateEffectTree(fx.deepDiveResolve(8, 1))).toBeNull();
  });

  it("sets aside R&D, accesses, steals agenda, shuffles remainder", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.runner.clicks = 0;
    const agenda = instantiateCard("hostile-takeover", "ag-1", "corp:rd");
    const filler = instantiateCard("hedge-fund", "f-1", "corp:rd");
    const filler2 = instantiateCard("hedge-fund", "f-2", "corp:rd");
    s.cards["ag-1"] = agenda;
    s.cards["f-1"] = filler;
    s.cards["f-2"] = filler2;
    s.corp.deck = ["ag-1", "f-1", "f-2"];
    const src = instantiateCard("jailbreak", "dd-1", "runner:heap");
    s.cards["dd-1"] = src;

    const r = evalEffect(
      { state: s, sourceId: "dd-1" },
      fx.deepDiveResolve(8, 1),
    );
    expect(r.ok).toBe(true);
    expect(s.runner.score).toContain("ag-1");
    expect(agendaPointsFor(s, "runner")).toBeGreaterThanOrEqual(1);
    expect(s.corp.deck.sort()).toEqual(["f-1", "f-2"].sort());
    expect(s.runner.clicks).toBe(0);
    expect(s.corp.corpSetAside ?? []).toEqual([]);
  });
});
