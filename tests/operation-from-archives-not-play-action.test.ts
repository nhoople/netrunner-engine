/**
 * Playing an operation from a card ability is not the basic action "Play 1
 * operation from HQ" (CR 5.2.6e). Petty Cash's "[click]: Play this operation
 * from Archives" is its own action, different from the basic action
 * (CR 5.2.5b). Plutus plays a transaction "when your turn begins", which is
 * not an action at all (CR 5.2.1, 5.2.4). Neither counts as the basic
 * play-operation action for Wage Workers or MirrorMorph, but each is still
 * playing an operation (CR 8.6.1), so Nebula's "if you played an operation
 * this turn" sees it.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyIntent,
  assertPinnedTag,
  createInitialState,
  crDataPresent,
  evalEffect,
  instantiateCard,
  loadCardCatalog,
} from "../src/index.js";
import type { Action, GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  assertPinnedTag("v26.03");
  loadCardCatalog(true);
});

function corpTurn(): GameState {
  const s = createInitialState();
  s.cards["runner-program-1"]!.rezzed = false;
  s.activeSide = "corp";
  s.corp.clicks = 3;
  s.corp.credits = 5;
  return s;
}

function take(s: GameState, action: Action): GameState {
  s.timingKey = "corp.takeAction";
  const r = applyIntent(s, action);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

/** Nebula Talent Management's condition: "if you played an operation this turn". */
function playedAnOperation(s: GameState): boolean {
  const before = s.corp.credits;
  const r = evalEffect(
    { state: s, sourceId: s.corp.identityId },
    {
      op: "if",
      cond: { op: "corp_played_operation_this_turn" },
      then: { op: "do", action: { kind: "gain_credits", side: "corp", amount: 1 } },
    },
  );
  if (!r.ok) throw new Error(r.error);
  const played = s.corp.credits > before;
  s.corp.credits = before;
  return played;
}

describe("operations played from Archives by a card ability", () => {
  it("Petty Cash's Archives ability is its own action, not the basic play action (CR 5.2.5b)", () => {
    let s = corpTurn();
    s.cards["pc-1"] = instantiateCard("petty-cash", "pc-1", "corp:archives");
    s.corp.discardPile = ["pc-1"];
    expect(playedAnOperation(s)).toBe(false);
    s = take(s, { type: "use_paid_ability", cardId: "pc-1", abilityId: "petty-cash-archives" });
    expect(s.turn.corpActionSequenceThisTurn).toEqual([
      "use_paid_ability:pc-1:petty-cash-archives",
    ]);
    expect(s.turn.corpActionTypeCounts.play_operation ?? 0).toBe(0);
    // Still playing an operation (CR 8.6.1).
    expect(playedAnOperation(s)).toBe(true);
  });

  it("Petty Cash from Archives does not move Wage Workers' count of the basic play action", () => {
    let s = corpTurn();
    s.cards["pc-1"] = instantiateCard("petty-cash", "pc-1", "corp:archives");
    s.corp.discardPile = ["pc-1"];
    s.cards["hf-1"] = instantiateCard("hedge-fund", "hf-1", "corp:hq");
    s.corp.hand.push("hf-1");
    // Petty Cash first: it plays only before the Corp finishes an action.
    s = take(s, { type: "use_paid_ability", cardId: "pc-1", abilityId: "petty-cash-archives" });
    expect(s.cards["pc-1"]?.zone).toBe("removed-from-game");
    s = take(s, { type: "play_operation", cardId: "hf-1" });
    expect(s.turn.corpActionTypeCounts.play_operation).toBe(1);
    expect(s.turn.corpActionTypeCounts["use_paid_ability:pc-1:petty-cash-archives"]).toBe(1);
  });

  it("Plutus's turn-begin play is not an action (CR 5.2.1)", () => {
    const s = corpTurn();
    const plutus = instantiateCard("plutus", "pl-1", "server:remote-1:root");
    plutus.rezzed = true;
    plutus.faceup = true;
    s.cards["pl-1"] = plutus;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["pl-1"],
    } as GameState["servers"][string];
    s.nextRemoteNumber = 2;
    s.cards["pc-1"] = instantiateCard("petty-cash", "pc-1", "corp:archives");
    s.corp.discardPile = ["pc-1"];
    const r = evalEffect(
      { state: s, sourceId: "pl-1" },
      { op: "do", action: { kind: "play_archives_transaction_then_rfg", cardId: "pc-1" } },
    );
    if (!r.ok) throw new Error(r.error);
    expect(s.cards["pc-1"]?.zone).toBe("removed-from-game");
    expect(s.turn.corpActionTypeCounts.play_operation ?? 0).toBe(0);
    expect(s.turn.corpActionSequenceThisTurn ?? []).toEqual([]);
    expect(playedAnOperation(s)).toBe(true);
  });

  it("the basic play action still counts and still meets Nebula's condition", () => {
    let s = corpTurn();
    s.cards["hf-1"] = instantiateCard("hedge-fund", "hf-1", "corp:hq");
    s.corp.hand.push("hf-1");
    s = take(s, { type: "play_operation", cardId: "hf-1" });
    expect(s.turn.corpActionTypeCounts.play_operation).toBe(1);
    expect(playedAnOperation(s)).toBe(true);
  });
});
