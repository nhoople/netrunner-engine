/**
 * Parhelion v0.56: Gaslight + Djupstad Grid.
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

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.77.0");
});

describe("PH Gaslight", () => {
  it("wires may-trash search operation from R&D", () => {
    const def = getCardDef("gaslight");
    expect(def.unsupported).toEqual([]);
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    expect(validateEffectTree(fx.searchRdOperationToHq())).toBeNull();

    let s = createInitialState();
    s = structuredClone(s);
    const op = instantiateCard("hedge-fund", "op-1", "corp:rd");
    s.cards["op-1"] = op;
    s.corp.deck = ["op-1", ...s.corp.deck];
    const r = evalEffect(
      { state: s, sourceId: "corp-id" },
      fx.searchRdOperationToHq(),
    );
    expect(r.ok).toBe(true);
    expect(s.corp.hand).toContain("op-1");
  });
});

describe("PH Djupstad Grid", () => {
  it("wires coreDamageOnAgendaScoredFromThisServer", () => {
    const def = getCardDef("djupstad-grid");
    expect(def.unsupported).toEqual([]);
    expect(def.coreDamageOnAgendaScoredFromThisServer).toBe(1);
  });
});
