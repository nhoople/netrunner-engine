/**
 * CR adherence G6: access-a-card appendix steps (11.6_1–_4 / §7.2).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertPinnedTag,
  createInitialState,
  CR,
  crDataPresent,
  legalActions,
  BREACH_STEPS,
} from "../src/index.js";
import { instantiateCard } from "../src/cards/load.js";
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

function breachAwaiting(cardId: string, defId: string): GameState {
  let s = createInitialState();
  s = structuredClone(s);
  const card = instantiateCard(defId, cardId, "server:remote-1:root");
  s.cards[cardId] = card;
  s.servers["remote-1"] = {
    id: "remote-1",
    kind: "remote",
    ice: [],
    root: [cardId],
  };
  s.runner.credits = 10;
  s.runner.clicks = 4;
  s.activeSide = "runner";
  s.timingKey = "breach.awaitAccess";
  s.run = {
    attackedServerId: "remote-1",
    phase: "breach",
    position: null,
    successful: true,
    accessedCardIds: [],
    accessCandidates: [cardId],
    accessRemaining: 1,
    encounter: null,
    endedTheRun: false,
    cannotJackOut: false,
    strengthBoosts: {},
    encounterStrengthBoosts: {},
    iceStrengthBoosts: {},
    accessingCardId: null,
    cannotStealOrTrash: false,
    accessCandidatesPreset: true,
  };
  return s;
}

describe("CR G6 — access-a-card (11.6 / 7.2)", () => {
  it("cites resolve for §7.2 / appendix 11.6", () => {
    expect(CR.cardAccessed).toEqual({
      number: "7.2.1",
      id: "step_card_accessed",
    });
    expect(CR.midAccessAbility).toEqual({
      number: "7.2.2",
      id: "step_mid_access_ability",
    });
    expect(CR.accessAgenda).toEqual({
      number: "7.2.3",
      id: "step_access_agenda",
    });
    expect(CR.accessComplete).toEqual({
      number: "7.2.4",
      id: "step_access_complete",
    });
    expect(CR.accessAppendix1.number).toBe("11.6_1");
    expect(CR.accessAppendix4.number).toBe("11.6_4");
    expect(BREACH_STEPS.cardAccessed.stepNumber).toBe("11.6_1");
    expect(BREACH_STEPS.midAccess.stepNumber).toBe("11.6_2");
    expect(BREACH_STEPS.stealAgenda.stepNumber).toBe("11.6_3");
    expect(BREACH_STEPS.accessComplete.stepNumber).toBe("11.6_4");
  });

  it("non-agenda without mid-access options walks 11.6 then completes", () => {
    let s = breachAwaiting("pad-1", "pad-campaign");
    // Ensure no trashCost so mid-access auto-passes.
    delete s.cards["pad-1"].trashCost;
    s = must(s, { type: "access_card", cardId: "pad-1" });
    expect(
      s.log.some(
        (l) => l.includes("7.2.1") && l.includes("11.6_1") && l.includes("PAD"),
      ),
    ).toBe(true);
    expect(
      s.log.some((l) => l.includes("11.6_4") || l.includes("7.2.4")),
    ).toBe(true);
    expect(s.run?.accessingCardId ?? null).toBeNull();
  });

  it("agenda: steal illegal during mid-access; legal on 11.6_3", () => {
    let s = breachAwaiting("ag-1", "hostile-takeover");
    // Force a park on 11.6_2 via trash opportunity.
    s.cards["ag-1"].trashCost = 1;
    s = must(s, { type: "access_card", cardId: "ag-1" });
    expect(s.timingKey).toBe("access.midAccess");
    expect(s.timing.stepNumber).toBe("11.6_2");
    let legal = legalActions(s);
    expect(legal.some((a) => a.type === "steal_agenda")).toBe(false);
    expect(legal.some((a) => a.type === "finish_access")).toBe(true);
    expect(legal.some((a) => a.type === "trash_accessed")).toBe(true);

    const stealEarly = applyAction(s, {
      type: "steal_agenda",
      cardId: "ag-1",
    });
    expect(stealEarly.ok).toBe(false);

    s = must(s, { type: "finish_access" });
    expect(s.timingKey).toBe("access.stealAgenda");
    expect(s.timing.stepNumber).toBe("11.6_3");
    legal = legalActions(s);
    expect(legal.some((a) => a.type === "steal_agenda")).toBe(true);
    expect(legal.some((a) => a.type === "finish_access")).toBe(false);

    s = must(s, { type: "steal_agenda", cardId: "ag-1" });
    expect(s.runner.score).toContain("ag-1");
    expect(
      s.log.some((l) => l.includes("11.6_4") || l.includes("7.2.4")),
    ).toBe(true);
  });

  it("agenda without mid-access options auto-advances to steal step", () => {
    let s = breachAwaiting("ag-2", "hostile-takeover");
    delete s.cards["ag-2"].trashCost;
    s = must(s, { type: "access_card", cardId: "ag-2" });
    expect(s.timingKey).toBe("access.stealAgenda");
    s = must(s, { type: "steal_agenda", cardId: "ag-2" });
    expect(s.runner.score).toContain("ag-2");
  });
});
