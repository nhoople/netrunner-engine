/**
 * The second player always receives priority (CR 9.2.7a).
 *
 * The engine used to pass for the second player when it found no window act
 * for them. Those acts include rezzing a facedown asset or the approached ice
 * only when the Corp can pay, so whether the Corp got priority told the
 * Runner a rez cost or a card type (CR 10.2.2a, 10.2.2b). Now the Corp gets
 * priority either way, even when its only option is to pass (CR 9.2.7f).
 * Passing for such a player is host policy, judged on open information.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  createInitialState,
  instantiateCard,
  queryLegality,
} from "../../src/index.js";
import type { Action, GameState } from "../../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
});

function must(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`${state.timingKey}: ${result.error}`);
  return result.state;
}

function runnerTurn(): GameState {
  const s = createInitialState();
  s.activeSide = "runner";
  s.timingKey = "runner.takeAction";
  s.runner.clicks = 4;
  s.runner.credits = 10;
  s.corp.credits = 5;
  s.priorityStack = [];
  // The default opening marks a Runner program rezzed; Runner cards are not (CR 8.1.4f).
  for (const card of Object.values(s.cards))
    if (card.side === "runner") card.rezzed = false;
  return s;
}

/** Where the game stands, as both players see it. */
function seen(s: GameState): string {
  return `${s.timingKey}:${queryLegality(s).priority}`;
}

function offers(s: GameState, type: Action["type"]): boolean {
  return queryLegality(s).legal.some((entry) => entry.action.type === type);
}

describe("the Corp receives priority after the Runner passes (CR 9.2.7a)", () => {
  /** A Runner's turn with one facedown card in a remote root. */
  function withFacedownRemote(defId: string, rezCost?: number): GameState {
    const s = runnerTurn();
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["hidden-1"],
    };
    const card = instantiateCard(defId, "hidden-1", "server:remote-1:root");
    card.rezzed = false;
    card.faceup = false;
    if (rezCost !== undefined) card.rezCost = rezCost;
    s.cards["hidden-1"] = card;
    return s;
  }

  it("in the paid ability window after a Runner action (CR 5.7.1e), whether or not the facedown card can be rezzed (CR 9.2.7c, 10.2.2a)", () => {
    const variants = {
      affordableAsset: withFacedownRemote("nico-campaign"),
      unaffordableAsset: withFacedownRemote("nico-campaign", 99),
      agenda: withFacedownRemote("offworld-office"),
    };
    const after = Object.fromEntries(
      Object.entries(variants).map(([name, start]) => {
        let s = must(start, { type: "basic_gain_credit" });
        expect(seen(s), name).toBe("runner.actionPaw:runner");
        s = must(s, { type: "pass_window" });
        return [name, s];
      }),
    );
    for (const [name, s] of Object.entries(after)) {
      expect(seen(s), name).toBe("runner.actionPaw:corp");
    }
    // Only the affordable asset gives the Corp a play; the window is the same.
    expect(offers(after.affordableAsset!, "rez_asset")).toBe(true);
    expect(offers(after.unaffordableAsset!, "rez_asset")).toBe(false);
    expect(offers(after.agenda!, "rez_asset")).toBe(false);
    // The Corp passes and the window closes (CR 9.2.7a).
    for (const s of Object.values(after)) {
      expect(seen(must(s, { type: "pass_window" }))).toBe(
        "runner.takeAction:runner",
      );
    }
  });

  it("on approached ice, whether or not the Corp can pay to rez it (CR 9.2.7e, 10.2.2a)", () => {
    const approach = (rezCost: number): GameState => {
      let s = runnerTurn();
      const ice = instantiateCard("tithe", "hq-ice", "server:hq:ice");
      ice.rezzed = false;
      ice.faceup = false;
      ice.rezCost = rezCost;
      s.cards["hq-ice"] = ice;
      s.servers.hq.ice = ["hq-ice"];
      s = must(s, { type: "basic_run", serverId: "hq" });
      // The initiation window (CR 6.9.1e) gives both players priority.
      expect(seen(s)).toBe("run.initiatePaw:runner");
      s = must(s, { type: "pass_window" });
      expect(seen(s)).toBe("run.initiatePaw:corp");
      s = must(s, { type: "pass_window" });
      expect(seen(s)).toBe("run.approachPaw:runner");
      return must(s, { type: "pass_window" });
    };
    const affordable = approach(1);
    const unaffordable = approach(99);
    expect(seen(affordable)).toBe("run.approachPaw:corp");
    expect(seen(unaffordable)).toBe("run.approachPaw:corp");
    expect(offers(affordable, "rez_ice")).toBe(true);
    expect(offers(unaffordable, "rez_ice")).toBe(false);
  });

  it("closes the jack-out choice on the Runner's decision alone (CR 6.9.4c)", () => {
    let s = runnerTurn();
    s = must(s, { type: "basic_run", serverId: "archives" });
    for (let i = 0; i < 8 && s.timingKey !== "run.jackOutWindow"; i++)
      s = must(s, { type: "pass_window" });
    expect(seen(s)).toBe("run.jackOutWindow:runner");
    s = must(s, { type: "pass_window" });
    expect(s.timingKey).not.toBe("run.jackOutWindow");
  });
});
