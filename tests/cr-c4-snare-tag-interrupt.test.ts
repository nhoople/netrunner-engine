/**
 * CR adherence C4: Snare-class tag→damage chain with tag interrupt
 * between instructions (CR 9.1.2a).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertPinnedTag,
  createInitialState,
  crDataPresent,
  evalEffect,
  legalActions,
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

describe("CR C4 — Snare tag interrupt before damage (9.1.2a)", () => {
  it("parks on pendingTags then continues seq into net damage", () => {
    let s = createInitialState();
    s = structuredClone(s);
    // Decoy-class: trash self to prevent pending tags.
    s.cards["decoy-1"] = {
      id: "decoy-1",
      defId: "decoy-fixture",
      title: "Decoy Fixture",
      type: "resource",
      side: "runner",
      zone: "runner:rig",
      faceup: true,
      rezzed: true,
      paidAbilities: [
        {
          id: "avoid-tag",
          windows: ["tag_interrupt_paw"],
          cost: { trashSelf: true },
          effect: {
            op: "do",
            action: { kind: "prevent_pending_tags", amount: 1 },
          },
        },
      ],
    };
    s.runner.rig = ["decoy-1"];
    s.runner.credits = 5;
    s.corp.credits = 10;
    // Grip cards so net damage has targets if accepted.
    for (let i = 0; i < 3; i++) {
      const id = `grip-${i}`;
      s.cards[id] = {
        id,
        defId: "sure-gamble",
        title: `Grip ${i}`,
        type: "event",
        side: "runner",
        zone: "runner:grip",
        faceup: true,
        rezzed: false,
      };
      s.runner.hand.push(id);
    }

    const snareFx = {
      op: "seq" as const,
      effects: [
        {
          op: "do" as const,
          action: { kind: "lose_credits" as const, side: "corp" as const, amount: 4 },
        },
        {
          op: "do" as const,
          action: { kind: "give_tags" as const, amount: 1 },
        },
        {
          op: "do" as const,
          action: { kind: "net_damage" as const, amount: 3 },
        },
      ],
    };
    const r = evalEffect({ state: s, sourceId: "decoy-1" }, snareFx);
    expect(r.ok).toBe(true);
    expect(s.corp.credits).toBe(6);
    expect(s.pendingTags?.remaining).toBe(1);
    expect(s.pendingEffectContinuation?.effects.length).toBe(1);
    expect(s.runner.tags).toBe(0);

    const legal = legalActions(s);
    expect(legal.some((a) => a.type === "accept_tags")).toBe(true);
    expect(
      legal.some(
        (a) =>
          a.type === "use_paid_ability" &&
          a.cardId === "decoy-1" &&
          a.abilityId === "avoid-tag",
      ),
    ).toBe(true);

    // Avoid the tag — seq continues to net damage.
    s = must(s, {
      type: "use_paid_ability",
      cardId: "decoy-1",
      abilityId: "avoid-tag",
    });
    expect(s.pendingTags).toBeNull();
    expect(s.runner.tags).toBe(0);
    expect(s.runner.rig).not.toContain("decoy-1");
    // Net damage should have applied (or pending if interrupt) after continuation.
    expect(
      s.pendingDamage !== null ||
        s.runner.hand.length < 3 ||
        s.log.some((l) => /net damage|Pending 3 net/i.test(l)),
    ).toBe(true);
  });

  it("accepting tags then continues into net damage", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.cards["decoy-2"] = {
      id: "decoy-2",
      defId: "decoy-fixture",
      title: "Decoy Fixture",
      type: "resource",
      side: "runner",
      zone: "runner:rig",
      faceup: true,
      rezzed: true,
      paidAbilities: [
        {
          id: "avoid-tag",
          windows: ["tag_interrupt_paw"],
          cost: { trashSelf: true },
          effect: {
            op: "do",
            action: { kind: "prevent_pending_tags", amount: 1 },
          },
        },
      ],
    };
    s.runner.rig = ["decoy-2"];
    s.corp.credits = 10;
    const snareFx = {
      op: "seq" as const,
      effects: [
        {
          op: "do" as const,
          action: { kind: "give_tags" as const, amount: 1 },
        },
        {
          op: "do" as const,
          action: { kind: "net_damage" as const, amount: 1 },
        },
      ],
    };
    evalEffect({ state: s, sourceId: "decoy-2" }, snareFx);
    expect(s.pendingTags?.remaining).toBe(1);
    s = must(s, { type: "accept_tags" });
    expect(s.runner.tags).toBe(1);
    expect(s.pendingTags).toBeNull();
    expect(
      s.pendingDamage !== null ||
        s.log.some((l) => /net damage|Pending .* net/i.test(l)),
    ).toBe(true);
  });
});
