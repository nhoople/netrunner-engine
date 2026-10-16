/**
 * Both score areas already at the agenda-point total is a draw (CR 10.3.1c).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  CR,
  createInitialState,
  crDataPresent,
  instantiateCard,
} from "../src/index.js";
import { occurCheckpoint } from "../src/legality/checkpoints.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.0");
});

function scoreAgenda(
  state: ReturnType<typeof createInitialState>,
  id: string,
  side: "corp" | "runner",
  points: number,
): void {
  const zone = side === "corp" ? "corp:score" : "runner:score";
  const card = instantiateCard("hostile-takeover", id, zone);
  card.agendaPoints = points;
  state.cards[id] = card;
  state[side].scoreArea = [id];
}

describe("agenda-point draw (CR 10.3.1c)", () => {
  it("ends in a draw when both score areas are already at 7", () => {
    const s = createInitialState();
    scoreAgenda(s, "c-ag", "corp", 7);
    scoreAgenda(s, "r-ag", "runner", 7);
    occurCheckpoint(s, "timing", "Agenda points", [CR.checkpointAgendaPoints], "test");
    const drawn = s.log.findIndex((line) => line.includes("The game is a draw"));
    expect(drawn).toBeGreaterThanOrEqual(0);
    expect(s.log[drawn]).toContain(CR.checkpointAgendaPoints.number);
    expect(s.winner).toBe("draw");
    expect(s.winReason).toBe("draw");
    expect(s.done).toBe(true);
    expect(s.log.join("\n")).not.toContain("Corp wins with");
  });
});
