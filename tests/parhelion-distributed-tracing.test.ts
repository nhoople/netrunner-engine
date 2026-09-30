/**
 * Parhelion Distributed Tracing: double op; play if agenda stolen last turn;
 * give 1 tag.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  fx,
  getCardDef,
  instantiateCard,
  queryLegality,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.103.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("PH Distributed Tracing", () => {
  it("requires agenda stolen last turn + extra click; gives 1 tag", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const op = instantiateCard("hedge-fund", "dt-1", "corp:hq");
    op.title = "Distributed Tracing";
    op.type = "operation";
    op.playCost = 3;
    op.playAdditionalClick = true;
    op.playRequiresAgendaStolenLastTurn = true;
    op.onPlay = fx.giveTags(1);
    op.unsupported = [];
    s.cards["dt-1"] = op;
    s.corp.hand = ["dt-1"];
    s.corp.credits = 10;
    s.corp.clicks = 3;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    s.turn.agendaPointsStolenLastTurn = 0;
    expect(
      queryLegality(s).legal.some(
        (e) => e.action.type === "play_operation" && e.action.cardId === "dt-1",
      ),
    ).toBe(false);

    s.turn.agendaPointsStolenLastTurn = 2;
    expect(
      queryLegality(s).legal.some(
        (e) => e.action.type === "play_operation" && e.action.cardId === "dt-1",
      ),
    ).toBe(true);

    const clicksBefore = s.corp.clicks;
    s = must(s, { type: "play_operation", cardId: "dt-1" });
    expect(s.corp.clicks).toBe(clicksBefore - 2); // click + additional
    expect(s.runner.tags).toBe(1);
  });
});

describe("PH Distributed Tracing wiring (pin v0.62.0)", () => {
  it("wires playRequiresAgendaStolenLastTurn + give_tags", () => {
    const d = getCardDef("distributed-tracing");
    expect(d.unsupported).toEqual([]);
    expect(d.playAdditionalClick).toBe(true);
    expect(d.playRequiresAgendaStolenLastTurn).toBe(true);
    expect(d.onPlay).toEqual(fx.giveTags(1));
  });
});
