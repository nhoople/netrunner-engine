/**
 * CR adherence optional: Plascrete-class meat damage prevent IR through the
 * damage interrupt PAW path (CR 9.9.3a / 9.9.5 / 10.4).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertPinnedTag,
  createInitialState,
  crDataPresent,
  cardsDataPresent,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
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

function hasPlascreteDef(): boolean {
  if (!cardsDataPresent()) return false;
  try {
    getCardDef("plascrete-carapace");
    return true;
  } catch {
    return false;
  }
}

describe("CR optional — Plascrete meat prevent interrupt", () => {
  it("catalog exposes Plascrete fixtures IR when cards data includes fixtures", () => {
    if (!hasPlascreteDef()) {
      // Pin archive may predate fixtures; CARDS_DATA_ROOT / newer pin required.
      expect(cardsDataPresent()).toBe(true);
      return;
    }
    const def = getCardDef("plascrete-carapace");
    expect(def.powerCountersOnInstall).toBe(4);
    expect(def.trashWhenPowerEmpty).toBe(true);
    const ab = def.paidAbilities?.find((a) => a.id === "plascrete-prevent-meat");
    expect(ab?.windows).toContain("damage_interrupt_paw");
    expect(ab?.requirePendingDamageTypes).toEqual(["meat"]);
    expect(ab?.requireDuringRun).toBeFalsy();
  });

  it("meat damage opens interrupt PAW and Plascrete can prevent (not net)", () => {
    let s = createInitialState();
    s = structuredClone(s);

    if (hasPlascreteDef()) {
      const pc = instantiateCard("plascrete-carapace", "pc", "runner:rig");
      pc.powerCounters = pc.powerCountersOnInstall ?? 4;
      s.cards["pc"] = pc;
    } else {
      // Inline Plascrete-class shape when fixtures not yet in pin archive.
      s.cards["pc"] = {
        id: "pc",
        defId: "plascrete-carapace",
        title: "Plascrete Carapace",
        type: "hardware",
        side: "runner",
        zone: "runner:rig",
        faceup: true,
        rezzed: true,
        installCost: 3,
        powerCounters: 4,
        powerCountersOnInstall: 4,
        trashWhenPowerEmpty: true,
        paidAbilities: [
          {
            id: "plascrete-prevent-meat",
            label: "prevent meat",
            clickCost: 0,
            creditCost: 0,
            cost: { powerCounters: 1 },
            windows: ["damage_interrupt_paw"],
            requirePendingDamageTypes: ["meat"],
            effect: fx.do({ kind: "prevent_pending_damage", amount: 1 }),
          },
        ],
      };
    }
    s.runner.rig = ["pc"];
    s.runner.hand = ["h1", "h2"];
    for (const id of ["h1", "h2"]) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    }

    const meat = evalEffect(
      { state: s, sourceId: "src" },
      fx.do({ kind: "meat_damage", amount: 2 }),
    );
    expect(meat.ok).toBe(true);
    expect(s.pendingDamage).toMatchObject({
      type: "meat",
      remaining: 2,
      interruptPawOnly: true,
    });
    expect(
      legalActions(s).some(
        (a) =>
          a.type === "use_paid_ability" &&
          a.cardId === "pc" &&
          a.abilityId === "plascrete-prevent-meat",
      ),
    ).toBe(true);

    s = must(s, {
      type: "use_paid_ability",
      cardId: "pc",
      abilityId: "plascrete-prevent-meat",
    });
    expect(s.cards["pc"]!.powerCounters).toBe(3);
    expect(s.pendingDamage?.remaining).toBe(1);

    s = must(s, { type: "accept_damage" });
    expect(s.pendingDamage).toBeNull();
    expect(s.runner.hand).toHaveLength(1);
  });

  it("Plascrete does not open or pay against net damage", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.cards["pc"] = {
      id: "pc",
      defId: "plascrete-carapace",
      title: "Plascrete Carapace",
      type: "hardware",
      side: "runner",
      zone: "runner:rig",
      faceup: true,
      rezzed: true,
      installCost: 3,
      powerCounters: 4,
      paidAbilities: [
        {
          id: "plascrete-prevent-meat",
          label: "prevent meat",
          clickCost: 0,
          creditCost: 0,
          cost: { powerCounters: 1 },
          windows: ["damage_interrupt_paw"],
          requirePendingDamageTypes: ["meat"],
          effect: fx.do({ kind: "prevent_pending_damage", amount: 1 }),
        },
      ],
    };
    s.runner.rig = ["pc"];
    s.runner.hand = ["h1"];
    s.cards["h1"] = instantiateCard("sure-gamble", "h1", "runner:grip");

    const r = evalEffect(
      { state: s, sourceId: "src" },
      fx.netDamage(1),
    );
    expect(r.ok).toBe(true);
    // No payable interrupt for net → damage applies immediately.
    expect(s.pendingDamage).toBeNull();
    expect(s.runner.hand).toHaveLength(0);
    expect(s.cards["pc"]!.powerCounters).toBe(4);
  });
});
