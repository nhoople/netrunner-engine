/**
 * MirrorMorph: Endless Iteration — "...when the third action completes, you
 * may gain 1[credit] or take another different action, paying [click] less."
 *
 * The reward resolves in the reaction window after the third action
 * (CR 5.2.2d). Taking it, the Corp takes one more action right away, before
 * the next paid ability window. It must be different from each of the first
 * three (CR 5.2.5b), and its cost is [click] less: a [click] action costs
 * nothing and purge costs [click][click].
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyIntent,
  assertPinnedTag,
  createInitialState,
  crDataPresent,
  evalEffect,
  instantiateCard,
  legalActions,
  loadCardCatalog,
} from "../src/index.js";
import { primitiveNameFollowsStandard } from "../src/effects/primitiveNames.js";
import type { Action, GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  assertPinnedTag("v26.03");
  loadCardCatalog(true);
});

/** MirrorMorph with a rezzed Regolith Mining License and Hedge Fund in HQ. */
function mirrormorph(clicks: number): GameState {
  const s = createInitialState();
  const id = s.corp.identityId;
  s.cards[id] = instantiateCard("mirrormorph-endless-iteration", id, "corp:identity");
  s.cards["runner-program-1"]!.rezzed = false;
  const rml = instantiateCard("regolith-mining-license", "rml-1", "server:remote-1:root");
  rml.rezzed = true;
  rml.faceup = true;
  rml.hostedCredits = 15;
  s.cards["rml-1"] = rml;
  s.servers["remote-1"] = {
    id: "remote-1",
    kind: "remote",
    ice: [],
    root: ["rml-1"],
  } as GameState["servers"][string];
  s.nextRemoteNumber = 2;
  s.cards["hf-1"] = instantiateCard("hedge-fund", "hf-1", "corp:hq");
  s.corp.hand.push("hf-1");
  s.activeSide = "corp";
  s.corp.clicks = clicks;
  s.corp.credits = 5;
  return s;
}

function act(s: GameState, action: Action): GameState {
  const r = applyIntent(s, action);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

/** Take an action from the Corp's action window. */
function take(s: GameState, action: Action): GameState {
  s.timingKey = "corp.takeAction";
  return act(s, action);
}

/** Three different actions, then pick the extra action. */
function chooseExtraAction(clicks: number): GameState {
  let s = mirrormorph(clicks);
  s = take(s, { type: "use_paid_ability", cardId: "rml-1", abilityId: "regolith-take" });
  s = take(s, { type: "basic_gain_credit" });
  s = take(s, { type: "basic_draw" });
  expect(s.pendingChoice?.options.map((o) => o.id)).toContain("extra-action");
  return act(s, { type: "choose_option", optionId: "extra-action" });
}

describe("MirrorMorph: take another different action, paying [click] less", () => {
  it("takes the action at once, even with no clicks left, and it costs nothing", () => {
    let s = chooseExtraAction(3);
    // CR 5.2.2d: still inside the reaction window, no paid ability window first.
    expect(s.timingKey).toBe("corp.takeAction");
    const credits = s.corp.credits;
    s = act(s, { type: "play_operation", cardId: "hf-1" });
    // Hedge Fund: pay 5, gain 9. No click was there to spend.
    expect(s.corp.credits).toBe(credits + 4);
    expect(s.corp.clicks).toBe(0);
    expect(s.turn.corpActionSequenceThisTurn).toHaveLength(4);
    expect(s.turn.extraDifferentAction ?? null).toBeNull();
    expect(s.timingKey).not.toBe("corp.takeAction");
  });

  it("refuses an action the same as one of the first three (CR 5.2.5b)", () => {
    const s = chooseExtraAction(3);
    for (const same of [
      { type: "basic_gain_credit" },
      { type: "basic_draw" },
      { type: "use_paid_ability", cardId: "rml-1", abilityId: "regolith-take" },
    ] as Action[]) {
      const r = applyIntent(s, same);
      expect(r.ok, same.type).toBe(false);
      if (!r.ok) expect(r.error).toContain("different");
    }
    const legal = legalActions(s).map((a) => a.type);
    expect(legal).not.toContain("basic_gain_credit");
    expect(legal).not.toContain("basic_draw");
    expect(legal).toContain("play_operation");
  });

  it("pays [click] less when the Corp still has clicks", () => {
    let s = chooseExtraAction(4);
    expect(s.timingKey).toBe("corp.takeAction");
    s = act(s, { type: "play_operation", cardId: "hf-1" });
    // The fourth click is still there for the next action.
    expect(s.corp.clicks).toBe(1);
    expect(s.turn.extraDifferentAction ?? null).toBeNull();
  });

  it("does nothing when no different action can be taken (CR 1.16.1)", () => {
    let s = mirrormorph(3);
    s = take(s, { type: "use_paid_ability", cardId: "rml-1", abilityId: "regolith-take" });
    s = take(s, { type: "basic_gain_credit" });
    s = take(s, { type: "basic_draw" });
    // Nothing else to do: no operation or card to install in HQ.
    for (const id of s.corp.hand) {
      s.corp.discardPile.push(id);
      s.cards[id]!.zone = "corp:archives";
    }
    s.corp.hand = [];
    s = act(s, { type: "choose_option", optionId: "extra-action" });
    expect(s.turn.extraDifferentAction ?? null).toBeNull();
    expect(s.corp.clicks).toBe(0);
    expect(s.timingKey).not.toBe("corp.takeAction");
    expect(s.log.some((line) => line.includes("no different action can be taken"))).toBe(true);
  });

  it("gaining 1[credit] instead takes no extra action", () => {
    let s = mirrormorph(3);
    s = take(s, { type: "use_paid_ability", cardId: "rml-1", abilityId: "regolith-take" });
    s = take(s, { type: "basic_gain_credit" });
    s = take(s, { type: "basic_draw" });
    const credits = s.corp.credits;
    s = act(s, { type: "choose_option", optionId: "gain-1" });
    expect(s.corp.credits).toBe(credits + 1);
    expect(s.corp.clicks).toBe(0);
    expect(s.turn.extraDifferentAction ?? null).toBeNull();
  });

  it("names the reward by its procedure", () => {
    expect(primitiveNameFollowsStandard("take_different_action_paying_click_less")).toBe(true);
    for (const kind of ["take_different_action_paying_click_less"]) {
      const s = mirrormorph(0);
      s.turn.corpActionSequenceThisTurn = ["basic_gain", "basic_draw", "basic_install"];
      s.timingKey = "corp.actionPaw";
      s.turnPhase = "corp_action";
      const r = evalEffect({ state: s, sourceId: s.corp.identityId }, {
        op: "do",
        action: { kind } as never,
      });
      expect(r.ok, kind).toBe(true);
      expect(s.turn.extraDifferentAction?.differentFrom).toEqual([
        "basic_gain",
        "basic_draw",
        "basic_install",
      ]);
      expect(s.corp.clicks).toBe(1);
    }
  });
});
