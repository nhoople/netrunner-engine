/**
 * A credit tally is one gain_credits (CR 9.12.2b, 9.12.2c).
 * A type search of R&D is one kind.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertPinnedTag,
  createInitialState,
  crDataPresent,
  evalEffect,
  instantiateCard,
  validateEffectTree,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  assertPinnedTag("v26.03");
});

describe("credit tallies", () => {
  it("gains 2¢ per tag as one gain_credits", () => {
    const effect = {
      op: "do" as const,
      action: {
        kind: "gain_credits" as const,
        side: "corp" as const,
        amount: 0,
        tally: { count: "runner_tags" as const, per: 2, side: "corp" as const },
      },
    };
    expect(validateEffectTree(effect)).toBeNull();
    const s = structuredClone(createInitialState());
    s.runner.tags = 3;
    const before = s.corp.credits;
    const r = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      effect,
    );
    expect(r.ok).toBe(true);
    expect(s.corp.credits).toBe(before + 6);
    expect(s.log.some((l) => l.includes("gains 6¢"))).toBe(true);
  });

  it("does not gain when the tally is 0", () => {
    const s = structuredClone(createInitialState());
    s.runner.tags = 0;
    const before = s.corp.credits;
    evalEffect(
      { state: s, sourceId: s.corp.identityId },
      {
        op: "do",
        action: {
          kind: "gain_credits",
          side: "corp",
          amount: 0,
          tally: { count: "runner_tags", per: 2, side: "corp" },
        },
      },
    );
    expect(s.corp.credits).toBe(before);
    expect(s.log.some((l) => l.includes("gains"))).toBe(false);
  });
});

describe("unless costs", () => {
  it("validates end the run unless the runner takes a tag", () => {
    expect(
      validateEffectTree({
        op: "do",
        action: {
          kind: "unless",
          payer: "runner",
          cost: { op: "do", action: { kind: "give_tags", amount: 1 } },
          instruction: { op: "do", action: { kind: "end_the_run" } },
        },
      }),
    ).toBeNull();
  });
});

describe("search R&D by card type", () => {
  it("reveals the first ice, adds it to HQ, and reverses the rest", () => {
    const s = structuredClone(createInitialState());
    const ice = instantiateCard("ice-wall", "ice-1", "corp:rd");
    const op = instantiateCard("hedge-fund", "op-1", "corp:rd");
    const agenda = instantiateCard("hostile-takeover", "ag-1", "corp:rd");
    s.cards["ice-1"] = ice;
    s.cards["op-1"] = op;
    s.cards["ag-1"] = agenda;
    s.corp.deck = ["ice-1", "op-1", "ag-1"];
    const r = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      {
        op: "do",
        action: { kind: "search_rd_type_to_hq", cardType: "ice" },
      },
    );
    expect(r.ok).toBe(true);
    expect(s.corp.hand).toContain("ice-1");
    expect(s.cards["ice-1"]!.faceup).toBe(true);
    expect(s.corp.deck).toEqual(["ag-1", "op-1"]);
  });

  it("leaves R&D in place when ice is missing", () => {
    const s = structuredClone(createInitialState());
    const op = instantiateCard("hedge-fund", "op-1", "corp:rd");
    const agenda = instantiateCard("hostile-takeover", "ag-1", "corp:rd");
    s.cards["op-1"] = op;
    s.cards["ag-1"] = agenda;
    s.corp.deck = ["op-1", "ag-1"];
    evalEffect(
      { state: s, sourceId: s.corp.identityId },
      {
        op: "do",
        action: { kind: "search_rd_type_to_hq", cardType: "ice" },
      },
    );
    expect(s.corp.deck).toEqual(["op-1", "ag-1"]);
  });

  it("reverses R&D when an asset search misses", () => {
    const effect = {
      op: "do" as const,
      action: {
        kind: "search_rd_type_to_hq" as const,
        cardType: "asset" as const,
        shuffleIfNone: true,
      },
    };
    expect(validateEffectTree(effect)).toBeNull();
    const s = structuredClone(createInitialState());
    const op = instantiateCard("hedge-fund", "op-1", "corp:rd");
    const agenda = instantiateCard("hostile-takeover", "ag-1", "corp:rd");
    s.cards["op-1"] = op;
    s.cards["ag-1"] = agenda;
    s.corp.deck = ["op-1", "ag-1"];
    evalEffect(
      { state: s, sourceId: s.corp.identityId },
      effect,
    );
    expect(s.corp.deck).toEqual(["ag-1", "op-1"]);
  });

  it("names the agenda in the reveal log", () => {
    const s = structuredClone(createInitialState());
    const agenda = instantiateCard("hostile-takeover", "ag-1", "corp:rd");
    s.cards["ag-1"] = agenda;
    s.corp.deck = ["ag-1"];
    evalEffect(
      { state: s, sourceId: s.corp.identityId },
      {
        op: "do",
        action: { kind: "search_rd_type_to_hq", cardType: "agenda" },
      },
    );
    expect(
      s.log.some((l) => l.includes("reveal agenda Hostile Takeover")),
    ).toBe(true);
  });
});
