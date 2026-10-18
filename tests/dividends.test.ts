/**
 * Dividends (CR 10.13) — score-begin snapshot and Dividends N placement.
 */
import { describe, expect, it } from "vitest";
import {
  applyAction,
  createInitialState,
  fx,
  instantiateCard,
} from "../src/index.js";
import type { GameState } from "../src/state/types.js";

function must(
  state: GameState,
  action: Parameters<typeof applyAction>[1],
): GameState {
  const r = applyAction(state, action);
  expect(r.ok, r.ok ? undefined : r.error).toBe(true);
  return r.state!;
}

describe("Dividends (CR 10.13)", () => {
  it("places N agenda counters per excess advancement at score begin (CR 10.13.1)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const agenda = instantiateCard(
      "project-ingatan",
      "ingatan-1",
      "server:remote-1:root",
    );
    agenda.onScore = fx.dividends(1);
    agenda.advancementCounters = 5; // printed req 3 → 2 excess
    s.cards["ingatan-1"] = agenda;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["ingatan-1"],
    };
    s.corp.clicks = 3;
    s.corp.credits = 10;
    s.activeSide = "corp";
    s.timingKey = "corp.actionPaw";

    s = must(s, { type: "score_agenda", cardId: "ingatan-1" });
    expect(s.corp.scoreArea).toContain("ingatan-1");
    expect(s.cards["ingatan-1"].advancementCounters ?? 0).toBe(0);
    expect(s.cards["ingatan-1"].agendaCounters).toBe(2);
    expect(s.cards["ingatan-1"].scoreBeginAdvancementCounters).toBe(5);
    expect(s.cards["ingatan-1"].scoreBeginAdvancementRequirement).toBe(3);
  });

  it("Dividends 2 places two counters per excess advancement", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const agenda = instantiateCard(
      "embedded-reporting",
      "report-1",
      "server:remote-3:root",
    );
    agenda.onScore = fx.dividends(2);
    agenda.advancementCounters = 4; // req 3 → 1 excess → 2 counters
    s.cards["report-1"] = agenda;
    s.servers["remote-3"] = {
      id: "remote-3",
      kind: "remote",
      ice: [],
      root: ["report-1"],
    };
    s.corp.clicks = 3;
    s.corp.credits = 10;
    s.activeSide = "corp";
    s.timingKey = "corp.actionPaw";

    s = must(s, { type: "score_agenda", cardId: "report-1" });
    expect(s.cards["report-1"].agendaCounters).toBe(2);
  });
});
