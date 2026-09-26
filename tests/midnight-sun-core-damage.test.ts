/**
 * Midnight Sun core-damage cluster: core_damage IR (+ brain_damage alias),
 * onFirstCoreDamageThisTurn (Esâ).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  CR,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  validateEffectTree,
} from "../src/index.js";
import { dealDamage, isCoreDamageType } from "../src/state/damage.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v0.5.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

function esaWired(): boolean {
  const esa = getCardDef("esa-afontov-eco-insurrectionist");
  return (
    (esa.unsupported?.length ?? 0) === 0 &&
    Boolean(esa.onFirstCoreDamageThisTurn)
  );
}

describe("MS core-damage IR (always)", () => {
  it("accepts core_damage and brain_damage Effect IR", () => {
    expect(validateEffectTree(fx.coreDamage(1))).toBeNull();
    expect(validateEffectTree(fx.brainDamage(1))).toBeNull();
    expect(isCoreDamageType("core")).toBe(true);
    expect(isCoreDamageType("brain")).toBe(true);
    expect(isCoreDamageType("net")).toBe(false);
    expect(CR.coreDamage.id).toBe("rule_core_damage");
    expect(CR.brainDamage.id).toBe("rule_brain_damage");
  });

  it("core_damage and brain_damage both reduce max hand and trash grip", () => {
    let s = createInitialState();
    s = structuredClone(s);
    // Fill grip so damage does not flatline
    for (let i = 0; i < 4; i++) {
      const id = `filler-${i}`;
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }
    const beforeHand = s.runner.hand.length;
    const r = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      fx.coreDamage(1),
    );
    expect(r.ok).toBe(true);
    expect(s.runner.brainDamage).toBe(1);
    expect(s.runner.maxHandSize).toBe(4);
    expect(s.runner.hand.length).toBe(beforeHand - 1);
    expect(s.turn.coreDamageSufferedThisTurn).toBe(1);

    const r2 = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      fx.brainDamage(1),
    );
    expect(r2.ok).toBe(true);
    expect(s.runner.brainDamage).toBe(2);
    expect(s.turn.coreDamageSufferedThisTurn).toBe(2);
  });

  it("onFirstCoreDamageThisTurn fires once per turn (synthetic Esâ)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    for (let i = 0; i < 5; i++) {
      const id = `grip-${i}`;
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }
    const stackTop = s.runner.deck[0];
    expect(stackTop).toBeTruthy();

    const id = s.cards[s.runner.identityId]!;
    id.onFirstCoreDamageThisTurn = {
      op: "choose",
      chooser: "runner",
      options: [
        {
          id: "draw-sabotage",
          label: "Draw 1 and sabotage 2",
          effect: fx.seq(fx.draw("runner", 1), fx.sabotage(2, true)),
        },
        { id: "decline", label: "Decline", effect: fx.seq() },
      ],
    };

    dealDamage(s, "core", 1, "test-source");
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["draw-sabotage", "decline"]),
    );

    s = must(s, { type: "choose_option", optionId: "draw-sabotage" });
    expect(s.runner.hand).toContain(stackTop);
    expect(s.pendingSabotage?.amount).toBe(2);

    // Corp resolves sabotage (empty HQ → all from R&D)
    s.corp.hand = [];
    s = must(s, { type: "resolve_sabotage", hqCardIds: [] });
    expect(s.pendingSabotage).toBeNull();

    const bd = s.runner.brainDamage;
    const handLen = s.runner.hand.length;
    dealDamage(s, "core", 1, "test-source-2");
    expect(s.runner.brainDamage).toBe(bd + 1);
    expect(s.runner.hand.length).toBe(handLen - 1);
    // Second core damage this turn: no new choice
    expect(s.pendingChoice).toBeNull();
  });

  it("decline path skips draw and sabotage", () => {
    let s = createInitialState();
    s = structuredClone(s);
    for (let i = 0; i < 3; i++) {
      const id = `g-${i}`;
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }
    const id = s.cards[s.runner.identityId]!;
    id.onFirstCoreDamageThisTurn = {
      op: "choose",
      chooser: "runner",
      options: [
        {
          id: "draw-sabotage",
          label: "Draw 1 and sabotage 2",
          effect: fx.seq(fx.draw("runner", 1), fx.sabotage(2, true)),
        },
        { id: "decline", label: "Decline", effect: fx.seq() },
      ],
    };
    const handBefore = s.runner.hand.length;
    dealDamage(s, "brain", 1, "alias-source");
    expect(s.pendingChoice).toBeTruthy();
    s = must(s, { type: "choose_option", optionId: "decline" });
    expect(s.pendingSabotage).toBeNull();
    // One trash from damage; no draw
    expect(s.runner.hand.length).toBe(handBefore - 1);
  });
});

describe("MS Esâ card JSON (soft-skip until wired pin)", () => {
  it("Esâ wires onFirstCoreDamageThisTurn with may draw+sabotage", () => {
    if (!esaWired()) return;
    const esa = getCardDef("esa-afontov-eco-insurrectionist");
    expect(esa.unsupported).toEqual([]);
    expect(esa.onFirstCoreDamageThisTurn).toBeTruthy();
    expect(validateEffectTree(esa.onFirstCoreDamageThisTurn!)).toBeNull();

    let s = createInitialState();
    s = structuredClone(s);
    const live = instantiateCard(
      "esa-afontov-eco-insurrectionist",
      "esa-live",
      "runner:identity",
    );
    s.cards["esa-live"] = live;
    s.runner.identityId = "esa-live";
    for (let i = 0; i < 4; i++) {
      const id = `h-${i}`;
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }
    dealDamage(s, "core", 1, "hakarl");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["draw-sabotage", "decline"]),
    );
  });
});
