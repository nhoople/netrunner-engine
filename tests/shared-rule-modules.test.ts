import { describe, expect, it, beforeAll } from "vitest";
import {
  applyIntent,
  assertPinnedTag,
  createShortGameState,
  crDataPresent,
  evalEffect,
  fx,
  queryLegality,
} from "../src/index.js";
import type { Action, GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  assertPinnedTag("v26.03");
});

function must(state: GameState, action: Action): GameState {
  const result = applyIntent(state, action);
  if (!result.ok) throw new Error(`${result.error} ${JSON.stringify(result.cites)}`);
  return result.state;
}

function toCorpTakeAction(state: GameState): GameState {
  let s = state;
  while (
    s.timingKey === "opening.corpMulligan" ||
    s.timingKey === "opening.runnerMulligan"
  ) {
    s = must(s, { type: "keep_starting_hand" });
  }
  s = must(s, { type: "pass_window" });
  s = must(s, { type: "pass_window" });
  s = must(s, { type: "pass_window" });
  return s;
}

describe("shared-rule modules", () => {
  it("still draws, installs, offers clicks, and applies credit and draw effects", () => {
    let s = toCorpTakeAction(createShortGameState({ agendaPointsToWin: 7 }));
    expect(s.timingKey).toBe("corp.takeAction");

    const offered = queryLegality(s).legal.map((entry) => entry.action.type);
    expect(offered).toContain("basic_gain_credit");
    expect(offered).toContain("basic_draw");

    const handBefore = s.corp.hand.length;
    s = must(s, { type: "basic_draw" });
    expect(s.corp.hand.length).toBe(handBefore + 1);

    while (!s.corp.hand.includes("corp-agenda") && s.corp.clicks > 0) {
      if (s.timingKey === "corp.actionPaw") s = must(s, { type: "pass_window" });
      s = must(s, { type: "basic_draw" });
    }
    if (s.timingKey === "corp.actionPaw") s = must(s, { type: "pass_window" });
    const installable = queryLegality(s).legal.map((entry) => entry.action);
    expect(
      installable.some(
        (action) => action.type === "basic_install" && action.cardId === "corp-agenda",
      ),
    ).toBe(true);
    s = must(s, {
      type: "basic_install",
      cardId: "corp-agenda",
      destination: { kind: "new_remote" },
    });
    expect(s.cards["corp-agenda"].zone).toMatch(/:root$/);
    expect(Object.keys(s.servers).some((id) => id.startsWith("remote-"))).toBe(true);

    const credits = s.corp.credits;
    const gained = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      fx.gainCredits("corp", 2),
    );
    expect(gained.ok).toBe(true);
    expect(s.corp.credits).toBe(credits + 2);

    const deck = s.corp.deck.length;
    const drawn = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      fx.draw("corp", 1),
    );
    expect(drawn.ok).toBe(true);
    expect(s.corp.deck.length).toBe(deck - 1);
  });
});
