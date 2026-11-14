/**
 * MirrorMorph: Endless Iteration — "If the first, second, and third actions
 * you take on your turn are each different from one another, when the third
 * action completes, you may gain 1[credit] or take another different action,
 * paying [click] less."
 *
 * Only the first three actions count. An action is a paid ability whose cost
 * begins with [click] (CR 5.2.1). Actions are the same if they are the same
 * basic action or the same ability on the same card (CR 5.2.5a); equivalent
 * abilities on different cards are different (CR 5.2.5b).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyIntent,
  assertPinnedTag,
  createInitialState,
  crDataPresent,
  instantiateCard,
  loadCardCatalog,
} from "../src/index.js";
import { noteCorpActionType } from "../src/state/corpActionHooks.js";
import type { Action, GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  assertPinnedTag("v26.03");
  loadCardCatalog(true);
});

function mirrormorph(): GameState {
  const s = createInitialState();
  const id = s.corp.identityId;
  s.cards[id] = instantiateCard("mirrormorph-endless-iteration", id, "corp:identity");
  // The default board's program is not rezzed (CR 8.1.4f).
  s.cards["runner-program-1"]!.rezzed = false;
  s.activeSide = "corp";
  return s;
}

/** A rezzed card alone in the root of `server`. */
function rezzedIn(s: GameState, defId: string, id: string, server: string): void {
  const card = instantiateCard(defId, id, `server:${server}:root`);
  card.rezzed = true;
  card.faceup = true;
  s.cards[id] = card;
  s.servers[server] = { id: server, kind: "remote", ice: [], root: [id] } as GameState["servers"][string];
}

/** Take `action` from the Corp's action window. */
function take(s: GameState, action: Action): GameState {
  s.timingKey = "corp.takeAction";
  const result = applyIntent(s, action);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

function morphBecamePending(s: GameState): boolean {
  return s.log.some((line) => line.includes("MirrorMorph") && line.includes("becomes pending"));
}

describe("MirrorMorph counts only the first three actions", () => {
  it("two identical actions rule it out for the turn (CR 5.2.5b.ex1)", () => {
    const s = mirrormorph();
    noteCorpActionType(s, "basic_gain");
    noteCorpActionType(s, "basic_gain");
    // Locked out, not fired: the flag means "no longer able to fire".
    expect(s.turn.mirrormorphThirdDistinctFiredThisTurn).toBe(true);
    expect(s.turn.mirrormorphThirdDistinctMetPending).toBe(false);
  });

  it("first and third alike: no ability, even after a fourth different action", () => {
    const s = mirrormorph();
    noteCorpActionType(s, "basic_gain");
    noteCorpActionType(s, "basic_draw");
    noteCorpActionType(s, "basic_gain");
    expect(s.turn.mirrormorphThirdDistinctMetPending).toBe(false);
    expect(s.turn.mirrormorphThirdDistinctFiredThisTurn).toBe(true);
    noteCorpActionType(s, "basic_install");
    expect(s.turn.mirrormorphThirdDistinctMetPending).toBe(false);
  });

  it("three different actions mark it at the third", () => {
    const s = mirrormorph();
    noteCorpActionType(s, "basic_gain");
    noteCorpActionType(s, "basic_draw");
    expect(s.turn.mirrormorphThirdDistinctMetPending).toBe(false);
    noteCorpActionType(s, "basic_install");
    expect(s.turn.mirrormorphThirdDistinctMetPending).toBe(true);
  });

  it("the same click ability on two different cards is two different actions (CR 5.2.5b)", () => {
    let s = mirrormorph();
    rezzedIn(s, "regolith-mining-license", "rml-1", "remote-1");
    rezzedIn(s, "regolith-mining-license", "rml-2", "remote-2");
    s.cards["rml-1"]!.hostedCredits = 15;
    s.cards["rml-2"]!.hostedCredits = 15;
    s.nextRemoteNumber = 3;
    s.corp.clicks = 3;
    s = take(s, { type: "use_paid_ability", cardId: "rml-1", abilityId: "regolith-take" });
    s = take(s, { type: "use_paid_ability", cardId: "rml-2", abilityId: "regolith-take" });
    expect(s.turn.mirrormorphThirdDistinctFiredThisTurn).toBe(false);
    s = take(s, { type: "basic_gain_credit" });
    expect(morphBecamePending(s)).toBe(true);
  });

  it("a paid ability without [click] in its cost is not an action (CR 5.2.1)", () => {
    const s = mirrormorph();
    rezzedIn(s, "sealed-vault", "sv-1", "remote-1");
    s.nextRemoteNumber = 2;
    s.corp.clicks = 3;
    s.corp.credits = 5;
    // Used in the paid ability window between actions (CR 5.2.1a).
    s.timingKey = "corp.actionPaw";
    const used = applyIntent(s, {
      type: "use_paid_ability",
      cardId: "sv-1",
      abilityId: "sealed-vault-store",
    });
    if (!used.ok) throw new Error(used.error);
    expect(used.state.turn.corpActionSequenceThisTurn).toEqual([]);
  });
});
