/**
 * CR adherence C1: Funhouse nested cost “ETR unless take 1 tag”
 * with CR 1.16.1b (prevention blocks paying the nested cost).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertPinnedTag,
  createInitialState,
  CR,
  crDataPresent,
  evalEffect,
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

describe("CR C1 — Funhouse nested cost (1.16.1b / 1.16.11b)", () => {
  it("cites resolve for nested cost interrupt", () => {
    expect(CR.costInterruptStaticMandatory).toEqual({
      number: "1.16.1b",
      id: "rule_cost_interrupt_static_mandatory",
    });
    expect(CR.nestedCostUnless).toEqual({
      number: "1.16.11b",
      id: "rule_nested_cost_unless",
    });
  });

  it("offers take-tag vs ETR when nested cost is payable", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: {
        iceId: "fh-1",
        broken: [false],
        strengthBoost: 0,
      },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    s.cards["fh-1"] = {
      id: "fh-1",
      defId: "funhouse",
      title: "Funhouse",
      type: "ice",
      side: "corp",
      zone: "hq:ice",
      faceup: true,
      rezzed: true,
    };
    const r = evalEffect(
      { state: s, sourceId: "fh-1" },
      {
        op: "do",
        action: { kind: "end_the_run_unless_take_tags", amount: 1 },
      },
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(s.pendingChoice?.options.map((o) => o.id).sort()).toEqual([
      "etr-unless-tags",
      "take-tags-nested",
    ]);
    expect(s.run?.endedTheRun).toBe(false);

    s = must(s, { type: "choose_option", optionId: "take-tags-nested" });
    expect(s.runner.tags).toBe(1);
    expect(s.run?.endedTheRun).toBe(false);
  });

  it("forces ETR when Jesminder-class prevent makes nested tag cost unpayable", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.cards[s.runner.identityId]!.preventFirstTagThisTurn = true;
    s.cards[s.runner.identityId]!.title = "Jesminder Fixture";
    s.turn.tagsGivenThisTurn = 0;
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: {
        iceId: "fh-2",
        broken: [false],
        strengthBoost: 0,
      },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    s.cards["fh-2"] = {
      id: "fh-2",
      defId: "funhouse",
      title: "Funhouse",
      type: "ice",
      side: "corp",
      zone: "hq:ice",
      faceup: true,
      rezzed: true,
    };
    const r = evalEffect(
      { state: s, sourceId: "fh-2" },
      {
        op: "do",
        action: { kind: "end_the_run_unless_take_tags", amount: 1 },
      },
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice).toBeNull();
    expect(s.run?.endedTheRun).toBe(true);
    expect(s.runner.tags).toBe(0);
    expect(
      s.log.some(
        (l) =>
          l.includes("1.16.1b") &&
          (l.includes("nested cost") || l.includes("Cannot take")),
      ),
    ).toBe(true);
  });
});
