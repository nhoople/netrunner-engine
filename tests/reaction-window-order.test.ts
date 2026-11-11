/**
 * Reaction window order.
 * CR 9.2.8b: the active player has priority first, then the inactive player.
 * CR 9.2.8d: the player with priority triggers their pending abilities in
 * any order, and each resolves fully before the next is chosen.
 */
import { describe, expect, it } from "vitest";
import {
  applyAction,
  autoWalk,
  createInitialState,
  CR,
  enterStep,
  fx,
  instantiateCard,
} from "../src/index.js";
import type { Action, GameState } from "../src/index.js";
import { createPendingAbilityInstance } from "../src/state/pendingAbilities.js";
import { resolveStoredConditionalPendings } from "../src/state/storedTriggers.js";

function must(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

function runnerCard(s: GameState, defId: string, id: string): void {
  s.cards[id] = instantiateCard(defId, id, "runner:installed");
  s.runner.installed.push(id);
}

/** A rezzed Corp asset in a new remote with a made-up Runner-turn-begin gain. */
function corpTurnBeginWatcher(s: GameState, id: string, gain: number): void {
  const card = instantiateCard("pad-campaign", id, `server:${id}:root`);
  card.rezzed = true;
  card.faceup = true;
  card.onTurnBegin = undefined;
  card.onRunnerTurnBegin = fx.gainCredits("corp", gain);
  s.cards[id] = card;
  s.servers[id] = { id, kind: "remote", ice: [], root: [id] };
  s.corp.installed.push(id);
}

function beginRunnerTurn(s: GameState): GameState {
  s.activeSide = "runner";
  s.timingKey = "runner.startPaw";
  enterStep(s, "runner.turnBegins");
  autoWalk(s);
  return s;
}

function orderOptions(s: GameState): string[] {
  return (s.pendingChoice?.options ?? [])
    .filter((o) => o.id.startsWith("trigger:"))
    .map((o) => o.label);
}

function trigger(s: GameState, title: string): GameState {
  const option = s.pendingChoice?.options.find(
    (o) => o.id.startsWith("trigger:") && o.label === title,
  );
  if (!option) throw new Error(`No pending ability offered for ${title}`);
  return must(s, { type: "choose_option", optionId: option.id });
}

function lineIndex(s: GameState, fragment: string): number {
  const i = s.log.findIndex((line) => line.includes(fragment));
  expect(i, fragment).toBeGreaterThanOrEqual(0);
  return i;
}

describe("reaction window order (CR 9.2.8b, 9.2.8d)", () => {
  it("cites the rules it follows", () => {
    expect(CR.reactionWindowPriority.number).toBe("9.2.8b");
    expect(CR.reactionWindowOrder.number).toBe("9.2.8d");
  });

  it("resolves the active player's ability before the inactive player's (CR 9.2.8b)", () => {
    const s = createInitialState();
    // The Corp's card is noted first; the Runner is the active player.
    corpTurnBeginWatcher(s, "remote-9", 2);
    runnerCard(s, "drug-dealer", "dealer-1");
    s.runner.credits = 3;
    s.corp.credits = 0;

    beginRunnerTurn(s);

    expect(s.pendingChoice).toBeNull();
    expect(s.runner.credits).toBe(2);
    expect(s.corp.credits).toBe(2);
    expect(lineIndex(s, "runner loses 1¢")).toBeLessThan(
      lineIndex(s, "corp gains 2¢"),
    );
  });

  it("gives the active player priority even when the other side was marked first (CR 9.2.8b)", () => {
    for (const active of ["runner", "corp"] as const) {
      const s = createInitialState();
      s.activeSide = active;
      s.corp.credits = 0;
      s.runner.credits = 0;
      const inactive = active === "runner" ? "corp" : "runner";
      const ids = [inactive, active].map(
        (side) =>
          createPendingAbilityInstance(s, {
            abilityKey: `test-${side}`,
            sourceId: side === "corp" ? s.corp.identityId : s.runner.identityId,
            controller: side,
            mandatory: true,
            payload: {
              kind: "inline_conditional",
              effect: fx.gainCredits(side, 1),
            },
          }).id,
      );

      expect(resolveStoredConditionalPendings(s, ids)).toBe(false);

      expect(s.pendingChoice).toBeNull();
      expect(lineIndex(s, `${active} gains 1¢`)).toBeLessThan(
        lineIndex(s, `${inactive} gains 1¢`),
      );
    }
  });

  it("does not ask when a player has one pending ability", () => {
    const s = createInitialState();
    runnerCard(s, "drug-dealer", "dealer-1");
    s.runner.credits = 3;

    beginRunnerTurn(s);

    expect(orderOptions(s)).toEqual([]);
    expect(s.runner.credits).toBe(2);
  });

  it("does not ask when the pending abilities are copies of one ability", () => {
    const s = createInitialState();
    runnerCard(s, "drug-dealer", "dealer-1");
    runnerCard(s, "drug-dealer", "dealer-2");
    s.runner.credits = 3;

    beginRunnerTurn(s);

    expect(orderOptions(s)).toEqual([]);
    expect(s.runner.credits).toBe(1);
  });

  it("asks the Runner again while different abilities remain (CR 9.2.8d)", () => {
    let s = createInitialState();
    runnerCard(s, "drug-dealer", "dealer-1");
    runnerCard(s, "aesops-pawnshop", "aesop-1");
    runnerCard(s, "underworld-contact", "uw-1");
    s.cards[s.runner.identityId]!.link = 2;
    s.runner.link = 2;
    s.runner.credits = 3;
    const aesop = s.cards["aesop-1"]!.title;

    s = beginRunnerTurn(s);

    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(s.pendingChoice?.prompt).toContain(CR.reactionWindowOrder.number);
    expect(orderOptions(s).sort()).toEqual(
      [aesop, "Drug Dealer", "Underworld Contact"].sort(),
    );
    // Nothing has resolved while the Runner decides.
    expect(s.runner.credits).toBe(3);

    s = trigger(s, "Underworld Contact");
    expect(s.runner.credits).toBe(4);
    expect(orderOptions(s).sort()).toEqual([aesop, "Drug Dealer"].sort());

    s = trigger(s, "Drug Dealer");
    expect(s.runner.credits).toBe(3);
    // Aesop's Pawnshop is the last one and opens its own choice.
    expect(orderOptions(s)).toEqual([]);
    expect(s.pendingChoice?.options.map((o) => o.id)).toContain("trash");
  });

  it("refuses an order option for an ability that is not pending", () => {
    const s = createInitialState();
    runnerCard(s, "drug-dealer", "dealer-1");
    runnerCard(s, "aesops-pawnshop", "aesop-1");
    s.runner.credits = 3;

    beginRunnerTurn(s);

    const refused = applyAction(s, {
      type: "choose_option",
      optionId: "trigger:pa-999",
    });
    expect(refused.ok).toBe(false);
  });

  it("offers the same order options after the same intents", () => {
    const build = (): GameState => {
      const s = createInitialState();
      runnerCard(s, "drug-dealer", "dealer-1");
      runnerCard(s, "aesops-pawnshop", "aesop-1");
      return beginRunnerTurn(s);
    };
    // A long-lived process has minted other ids before this match replays.
    const first = build();
    for (let i = 0; i < 3; i++) build();
    const again = build();
    expect(again.pendingChoice?.options.map((o) => o.id)).toEqual(
      first.pendingChoice?.options.map((o) => o.id),
    );
  });
});
