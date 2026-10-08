/**
 * choose_card binds the announced card into one effect (CR 1.15.2, 1.15.4).
 * A hidden zone is not a choice (CR 1.21.2). No valid target skips the
 * instruction (CR 1.15.3).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertPinnedTag,
  createInitialState,
  CR,
  crDataPresent,
  evalEffect,
  fx,
  instantiateCard,
  validateEffectTree,
} from "../src/index.js";
import type { Action, GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  assertPinnedTag("v26.03");
});

function must(state: GameState, action: Action): GameState {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

function hqState(): GameState {
  const s = structuredClone(createInitialState());
  const agenda = instantiateCard("hostile-takeover", "agenda-1", "corp:hq");
  const op = instantiateCard("hedge-fund", "op-1", "corp:hq");
  s.cards["agenda-1"] = agenda;
  s.cards["op-1"] = op;
  s.corp.hand.push("agenda-1", "op-1");
  return s;
}

describe("choose_card (CR 1.15.2)", () => {
  it("cites target announcement", () => {
    expect(CR.announceTargets.number).toBe("1.15.2");
    expect(CR.targetsGone.number).toBe("1.15.3");
    expect(CR.look.number).toBe("1.21.2");
  });

  it("substitutes the chosen card into the following effect", () => {
    let s = hqState();
    const r = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      fx.do({
        kind: "choose_card",
        chooser: "corp",
        zone: "hq",
        then: fx.do({ kind: "trash_hq_card", cardId: "$chosen" }),
      }),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice?.chooser).toBe("corp");
    const agenda = s.pendingChoice?.options.find((o) => o.id === "choose-card:agenda-1");
    expect(agenda?.label).toBe("Hostile Takeover");
    expect(agenda?.effect).toEqual(
      fx.do({ kind: "trash_hq_card", cardId: "agenda-1" }),
    );
    s = must(s, { type: "choose_option", optionId: "choose-card:agenda-1" });
    expect(s.corp.hand).toEqual(["op-1"]);
    expect(s.corp.discard).toContain("agenda-1");
  });

  it("offers only cards of the requested type", () => {
    const s = hqState();
    evalEffect(
      { state: s, sourceId: s.corp.identityId },
      fx.do({
        kind: "choose_card",
        chooser: "corp",
        zone: "hq",
        cardType: "agenda",
        then: fx.do({ kind: "trash_hq_card", cardId: "$chosen" }),
      }),
    );
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "choose-card:agenda-1",
    ]);
  });

  it("does not resolve the following effect when the player declines", () => {
    let s = hqState();
    evalEffect(
      { state: s, sourceId: s.corp.identityId },
      fx.do({
        kind: "choose_card",
        chooser: "corp",
        zone: "hq",
        optional: true,
        then: fx.do({ kind: "trash_hq_card", cardId: "$chosen" }),
      }),
    );
    expect(s.pendingChoice?.options.some((o) => o.id === "choose-card-decline")).toBe(
      true,
    );
    s = must(s, { type: "choose_option", optionId: "choose-card-decline" });
    expect(s.corp.hand).toEqual(["agenda-1", "op-1"]);
  });

  it("skips the instruction when no card is a valid target", () => {
    const s = hqState();
    const r = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      fx.do({
        kind: "choose_card",
        chooser: "corp",
        zone: "hq",
        cardType: "ice",
        then: fx.do({ kind: "trash_hq_card", cardId: "$chosen" }),
      }),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice).toBeFalsy();
    expect(s.corp.hand).toEqual(["agenda-1", "op-1"]);
  });

  it("does not let the Runner choose a hidden card in HQ", () => {
    const s = hqState();
    const r = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      fx.do({
        kind: "choose_card",
        chooser: "runner",
        zone: "hq",
        then: fx.do({ kind: "trash_hq_card", cardId: "$chosen" }),
      }),
    );
    expect(r.ok).toBe(false);
    expect(s.pendingChoice).toBeFalsy();
    expect(s.corp.hand).toEqual(["agenda-1", "op-1"]);
  });

  it("rejects an unknown primitive in the bound effect", () => {
    const err = validateEffectTree({
      op: "do",
      action: {
        kind: "choose_card",
        chooser: "corp",
        zone: "hq",
        then: { op: "do", action: { kind: "not_a_real_effect" } },
      },
    });
    expect(err).toMatch(/not_a_real_effect/);
  });
});
