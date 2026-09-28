/**
 * Midnight Sun Begemot cluster: +N strength per core damage taken this game
 * (`strengthBonusPerCoreDamageThisGame`; permanent core-damage counter /
 * `runner.brainDamage`, CR §10.4.2b). Install core_damage + breakMaxSubs
 * "any number" already modeled.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  dealDamage,
  effectiveBreakerStrength,
  fx,
  getCardDef,
  instantiateCard,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.09.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("MS strengthBonusPerCoreDamageThisGame (always)", () => {
  it("adds printed strength plus bonus × core damage taken this game", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const beg = instantiateCard("begemot", "beg-1", "runner:rig");
    beg.strengthBonusPerCoreDamageThisGame = 1;
    beg.unsupported = [];
    s.cards["beg-1"] = beg;
    s.runner.rig = ["beg-1"];
    s.runner.brainDamage = 0;

    expect(effectiveBreakerStrength(s, "beg-1")).toBe(2);

    s.runner.brainDamage = 3;
    expect(effectiveBreakerStrength(s, "beg-1")).toBe(5);
  });

  it("scales with N when field is not 1", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const beg = instantiateCard("begemot", "beg-2", "runner:rig");
    beg.strengthBonusPerCoreDamageThisGame = 2;
    s.cards["beg-2"] = beg;
    s.runner.rig = ["beg-2"];
    s.runner.brainDamage = 2;
    expect(effectiveBreakerStrength(s, "beg-2")).toBe(2 + 4);
  });

  it("install onInstall core_damage increases strength via the counter", () => {
    let s = createInitialState();
    s = structuredClone(s);
    // Grip fillers so core damage does not flatline
    for (let i = 0; i < 3; i++) {
      const id = `filler-${i}`;
      const c = instantiateCard("sure-gamble", id, "runner:grip");
      s.cards[id] = c;
      s.runner.hand.push(id);
    }
    const beg = instantiateCard("begemot", "beg-inst", "runner:grip");
    beg.onInstall = fx.coreDamage(1);
    beg.strengthBonusPerCoreDamageThisGame = 1;
    beg.unsupported = [];
    beg.installCost = 0;
    s.cards["beg-inst"] = beg;
    s.runner.hand.push("beg-inst");
    s.runner.credits = 10;
    s.runner.clicks = 4;
    s.runner.brainDamage = 1; // prior core damage this game
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    expect(effectiveBreakerStrength(s, "beg-inst")).toBe(3); // 2 + 1 prior

    s = must(s, {
      type: "basic_install",
      cardId: "beg-inst",
      destination: { kind: "rig" },
    });
    expect(s.runner.brainDamage).toBe(2); // prior + onInstall
    expect(s.runner.rig).toContain("beg-inst");
    expect(effectiveBreakerStrength(s, "beg-inst")).toBe(4); // 2 + 2 CD
  });

  it("dealDamage(core) raises strength for an installed Begemot-shaped breaker", () => {
    let s = createInitialState();
    s = structuredClone(s);
    for (let i = 0; i < 2; i++) {
      const id = `g-${i}`;
      const c = instantiateCard("sure-gamble", id, "runner:grip");
      s.cards[id] = c;
      s.runner.hand.push(id);
    }
    const beg = instantiateCard("begemot", "beg-dmg", "runner:rig");
    beg.strengthBonusPerCoreDamageThisGame = 1;
    s.cards["beg-dmg"] = beg;
    s.runner.rig = ["beg-dmg"];
    s.runner.brainDamage = 0;

    dealDamage(s, "core", 1, "test");
    expect(s.runner.brainDamage).toBe(1);
    expect(effectiveBreakerStrength(s, "beg-dmg")).toBe(3);
  });

  it("pump + strengthBonusPerCoreDamageThisGame stack", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const beg = instantiateCard("begemot", "beg-pump", "runner:rig");
    beg.strengthBonusPerCoreDamageThisGame = 1;
    s.cards["beg-pump"] = beg;
    s.runner.rig = ["beg-pump"];
    s.runner.brainDamage = 2;
    s.run = {
      attackedServerId: "hq",
      position: 0,
      phase: "encounter",
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: { "beg-pump": 1 },
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      encounter: {
        iceId: "ice-1",
        broken: [],
      },
    };
    // 2 printed + 2 CD + 1 run boost
    expect(effectiveBreakerStrength(s, "beg-pump")).toBe(5);
  });
});

describe("MS Begemot card wiring (v0.31.0+)", () => {
  it("Begemot clears unsupported with strengthBonusPerCoreDamageThisGame", () => {
    const def = getCardDef("begemot");
    expect(def.unsupported).toEqual([]);
    expect(def.strengthBonusPerCoreDamageThisGame).toBe(1);
    expect(def.onInstall).toEqual(fx.coreDamage(1));
    expect(def.breaker?.breaksSubtype).toBe("barrier");
    expect(def.breaker?.breakMaxSubs).toBe(99);
    expect(def.breaker?.breakCredits).toBe(1);
    expect(def.breaker?.strength).toBe(2);
    expect(def.memoryCost).toBe(2);
  });

  it("effective strength from card wiring meets ice after core damage", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const beg = instantiateCard("begemot", "beg-enc", "runner:rig");
    s.cards["beg-enc"] = beg;
    s.runner.rig = ["beg-enc"];
    s.runner.brainDamage = 2; // printed 2 + 2 CD = 4
    expect(getCardDef("begemot").strengthBonusPerCoreDamageThisGame).toBe(1);
    expect(effectiveBreakerStrength(s, "beg-enc")).toBe(4);
  });
});
