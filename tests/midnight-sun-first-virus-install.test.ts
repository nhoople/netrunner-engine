/**
 * Midnight Sun first-virus-install cluster: onFirstVirusInstallThisTurn
 * (Avgustina → sabotage 1).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  fx,
  getCardDef,
  instantiateCard,
  validateEffectTree,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v0.19.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("MS onFirstVirusInstallThisTurn IR (always)", () => {
  it("accepts onFirstVirusInstallThisTurn sabotage Effect IR", () => {
    expect(validateEffectTree(fx.sabotage(1, true))).toBeNull();
  });

  it("fires once on first virus program install (synthetic Avgustina)", () => {
    let s = createInitialState();
    s = structuredClone(s);

    const avg = instantiateCard("avgustina-ivanovskaya", "avg-1", "runner:rig");
    avg.onFirstVirusInstallThisTurn = fx.sabotage(1, true);
    avg.unsupported = [];
    s.cards["avg-1"] = avg;
    s.runner.rig.push("avg-1");

    const virus = instantiateCard("imp", "imp-1", "runner:grip");
    virus.installCost = 0;
    s.cards["imp-1"] = virus;
    s.runner.hand = ["imp-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.runner.memoryLimit = 8;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    expect(s.turn.virusProgramsInstalledThisTurn).toBe(0);
    s = must(s, {
      type: "basic_install",
      cardId: "imp-1",
      destination: { kind: "rig" },
    });
    expect(s.runner.rig).toContain("imp-1");
    expect(s.turn.virusProgramsInstalledThisTurn).toBe(1);
    expect(s.pendingSabotage?.amount).toBe(1);

    s.corp.hand = [];
    s = must(s, { type: "resolve_sabotage", hqCardIds: [] });
    expect(s.pendingSabotage).toBeNull();

    // Second virus this turn: no new sabotage
    const virus2 = instantiateCard("imp", "imp-2", "runner:grip");
    virus2.installCost = 0;
    s.cards["imp-2"] = virus2;
    s.runner.hand = ["imp-2"];
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s = must(s, {
      type: "basic_install",
      cardId: "imp-2",
      destination: { kind: "rig" },
    });
    expect(s.turn.virusProgramsInstalledThisTurn).toBe(2);
    expect(s.pendingSabotage).toBeNull();
  });

  it("non-virus program install does not fire", () => {
    let s = createInitialState();
    s = structuredClone(s);

    const avg = instantiateCard("avgustina-ivanovskaya", "avg-2", "runner:rig");
    avg.onFirstVirusInstallThisTurn = fx.sabotage(1, true);
    s.cards["avg-2"] = avg;
    s.runner.rig.push("avg-2");

    const nonVirus = instantiateCard("imp", "nv-1", "runner:grip");
    nonVirus.subtypes = [];
    nonVirus.installCost = 0;
    s.cards["nv-1"] = nonVirus;
    s.runner.hand = ["nv-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.runner.memoryLimit = 8;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, {
      type: "basic_install",
      cardId: "nv-1",
      destination: { kind: "rig" },
    });
    expect(s.turn.virusProgramsInstalledThisTurn).toBe(0);
    expect(s.pendingSabotage).toBeNull();
  });
});

describe("MS Avgustina card wiring (v0.19.0+)", () => {
  it("Avgustina wires onFirstVirusInstallThisTurn sabotage; unsupported empty", () => {
    const a = getCardDef("avgustina-ivanovskaya");
    expect(a.unsupported).toEqual([]);
    expect(a.onFirstVirusInstallThisTurn).toEqual(fx.sabotage(1, true));
    expect(validateEffectTree(a.onFirstVirusInstallThisTurn!)).toBeNull();

    let s = createInitialState();
    s = structuredClone(s);
    const live = instantiateCard(
      "avgustina-ivanovskaya",
      "avg-live",
      "runner:rig",
    );
    s.cards["avg-live"] = live;
    s.runner.rig.push("avg-live");

    const virus = instantiateCard("imp", "imp-live", "runner:grip");
    virus.installCost = 0;
    s.cards["imp-live"] = virus;
    s.runner.hand = ["imp-live"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.runner.memoryLimit = 8;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, {
      type: "basic_install",
      cardId: "imp-live",
      destination: { kind: "rig" },
    });
    expect(s.pendingSabotage?.amount).toBe(1);
  });
});
