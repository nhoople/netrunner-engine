/**
 * CR adherence G4: Runner basic action remove 1 tag (CR 5.2.7g / 10.5.4).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertPinnedTag,
  createInitialState,
  CR,
  crDataPresent,
  legalActions,
  queryLegality,
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

describe("CR G4 — basic remove tag (5.2.7g / 10.5.4)", () => {
  it("cites resolve for runnerBasicRemoveTag and taggedRemoveTag", () => {
    expect(CR.runnerBasicRemoveTag).toEqual({
      number: "5.2.7g",
      id: "runner_basic_action_remove_tag",
    });
    expect(CR.taggedRemoveTag).toEqual({
      number: "10.5.4",
      id: "rule_tagged_remove_tag",
    });
  });

  it("offers and resolves {click}+2¢ remove 1 tag while tagged", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;
    s.runner.credits = 5;
    s.runner.tags = 2;

    const legal = legalActions(s);
    expect(legal.some((a) => a.type === "basic_remove_tag")).toBe(true);

    const beforeClicks = s.runner.clicks;
    const beforeCredits = s.runner.credits;
    s = must(s, { type: "basic_remove_tag" });
    expect(s.runner.tags).toBe(1);
    expect(s.runner.clicks).toBe(beforeClicks - 1);
    expect(s.runner.credits).toBe(beforeCredits - 2);
    expect(
      s.log.some(
        (l) =>
          l.includes(CR.runnerBasicRemoveTag.number) &&
          l.includes(CR.taggedRemoveTag.number),
      ),
    ).toBe(true);
  });

  it("is illegal with 0 tags or fewer than 2 credits", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;
    s.runner.credits = 5;
    s.runner.tags = 0;
    expect(legalActions(s).some((a) => a.type === "basic_remove_tag")).toBe(
      false,
    );

    s.runner.tags = 1;
    s.runner.credits = 1;
    expect(legalActions(s).some((a) => a.type === "basic_remove_tag")).toBe(
      false,
    );
    const r = applyAction(s, { type: "basic_remove_tag" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.cites.some((c) => c.number === "5.2.7g")).toBe(true);
    }
  });

  it("queryLegality surfaces 5.2.7g / 10.5.4 cites", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;
    s.runner.credits = 3;
    s.runner.tags = 1;
    const q = queryLegality(s);
    const entry = q.legal.find((e) => e.action.type === "basic_remove_tag");
    expect(entry).toBeTruthy();
    expect(entry!.cites.some((c) => c.number === "5.2.7g")).toBe(true);
    expect(entry!.cites.some((c) => c.number === "10.5.4")).toBe(true);
  });
});
