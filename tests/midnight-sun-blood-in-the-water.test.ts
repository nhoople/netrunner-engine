/**
 * Midnight Sun Blood in the Water:
 * advancementRequirementEqualsRunnerGrip (X = cards in Runner grip).
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
} from "../src/index.js";
import { canScoreAgenda } from "../src/state/scoring.js";
import type { ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v0.34.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("MS advancementRequirementEqualsRunnerGrip (Blood in the Water)", () => {
  it("canScore when advancements >= Runner grip size", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const remote = "remote-1" as ServerId;
    s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
    const agenda = instantiateCard(
      "blood-in-the-water",
      "bitw-1",
      `server:${remote}:root`,
    );
    agenda.advancementRequirementEqualsRunnerGrip = true;
    agenda.advancementTokens = 2;
    agenda.unsupported = [];
    s.cards["bitw-1"] = agenda;
    s.servers[remote].root = ["bitw-1"];
    s.runner.hand = ["r1", "r2"];
    for (const id of s.runner.hand) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    }
    expect(canScoreAgenda(s, agenda)).toBe(true);

    s.runner.hand.push("r3");
    s.cards["r3"] = instantiateCard("sure-gamble", "r3", "runner:grip");
    expect(canScoreAgenda(s, agenda)).toBe(false);
  });

  it("scores when tokens meet dynamic requirement", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const remote = "remote-1" as ServerId;
    s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
    const agenda = instantiateCard(
      "blood-in-the-water",
      "bitw-1",
      `server:${remote}:root`,
    );
    agenda.advancementRequirementEqualsRunnerGrip = true;
    agenda.advancementTokens = 1;
    agenda.unsupported = [];
    s.cards["bitw-1"] = agenda;
    s.servers[remote].root = ["bitw-1"];
    s.runner.hand = ["r1"];
    s.cards["r1"] = instantiateCard("sure-gamble", "r1", "runner:grip");
    s.corp.clicks = 3;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    const id = s.cards[s.corp.identityId];
    if (id) delete id.onAgendaScored;

    const legal = queryLegality(s).legal;
    expect(
      legal.some(
        (e) => e.action.type === "score_agenda" && e.action.cardId === "bitw-1",
      ),
    ).toBe(true);
    s = must(s, { type: "score_agenda", cardId: "bitw-1" });
    expect(s.corp.score).toContain("bitw-1");
  });
});
