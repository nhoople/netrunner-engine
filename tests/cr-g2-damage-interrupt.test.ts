/**
 * CR adherence G2 residual: core damage also opens interrupt PAW when a
 * payable damage_interrupt_paw ability exists; hotfix conflict-marker
 * docstring left in damage.ts by #174 merge.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertPinnedTag,
  createInitialState,
  crDataPresent,
  dealDamage,
  evalEffect,
  fx,
  instantiateCard,
  legalActions,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  assertPinnedTag("v26.03");
});

describe("CR G2 — damage interrupt for core + hygiene", () => {
  it("damage.ts has no leftover conflict markers", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/state/damage.ts", "utf8");
    expect(src.includes("<<<<<<<")).toBe(false);
    expect(src.includes(">>>>>>>")).toBe(false);
  });

  it("core damage opens interrupt PAW when a payable preventer exists", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const abx = instantiateCard("airbladex-jsrf-ed", "abx", "runner:rig");
    abx.powerCounters = 2;
    // Broaden to core for host G2 coverage (Plascrete-class shape).
    abx.paidAbilities = [
      {
        id: "prevent-core",
        label: "prevent core",
        clickCost: 0,
        creditCost: 0,
        cost: { powerCounters: 1 },
        windows: ["damage_interrupt_paw"],
        effect: fx.do({ kind: "prevent_pending_damage", amount: 1 }),
      },
    ];
    s.cards["abx"] = abx;
    s.runner.rig = ["abx"];
    s.runner.hand = ["h1", "h2"];
    for (const id of ["h1", "h2"]) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    }

    const status = dealDamage(s, "core", 1, "src");
    expect(status).toBe("pending");
    expect(s.pendingDamage).toMatchObject({
      type: "core",
      remaining: 1,
      interruptPawOnly: true,
    });
    expect(
      legalActions(s).some(
        (a) =>
          a.type === "use_paid_ability" &&
          a.cardId === "abx" &&
          a.abilityId === "prevent-core",
      ),
    ).toBe(true);
  });

  it("core_damage IR opens the same interrupt window", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const abx = instantiateCard("airbladex-jsrf-ed", "abx", "runner:rig");
    abx.powerCounters = 1;
    abx.paidAbilities = [
      {
        id: "prevent-core",
        label: "prevent",
        clickCost: 0,
        creditCost: 0,
        cost: { powerCounters: 1 },
        windows: ["damage_interrupt_paw"],
        effect: fx.do({ kind: "prevent_pending_damage", amount: 1 }),
      },
    ];
    s.cards["abx"] = abx;
    s.runner.rig = ["abx"];
    const r = evalEffect(
      { state: s, sourceId: "ice" },
      fx.do({ kind: "core_damage", amount: 1 }),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingDamage?.type).toBe("core");
  });
});
