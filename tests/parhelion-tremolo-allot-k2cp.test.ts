/**
 * Parhelion Tremolo / allotted clicks / K2CP slice:
 * Tremolo cybernetic break discount, Basilar allottedClicksBonus,
 * Hypoxia allotted_clicks_next_turn + RFG, K2CP icebreaker aura.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  effectiveBreakerStrength,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  queryLegality,
  validateEffectTree,
} from "../src/index.js";
import { resolveAndAdvance } from "../src/timing/machine.js";
import type { ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.124.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("PH Tremolo cybernetic break discount", () => {
  it("reduces break cost by 1¢ per installed cybernetic", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const tr = instantiateCard("cleaver", "tr-1", "runner:rig");
    tr.title = "Tremolo";
    tr.breaker = {
      breaksSubtype: "barrier",
      strength: 2,
      breakCredits: 3,
      breakMaxSubs: 2,
      breakCreditsDiscountPerInstalledSubtype: {
        subtype: "cybernetic",
        amount: 1,
      },
    };
    tr.unsupported = [];
    const cyber = instantiateCard("marrow", "cy-1", "runner:rig");
    cyber.subtypes = ["cybernetic"];
    cyber.unsupported = [];
    s.cards["tr-1"] = tr;
    s.cards["cy-1"] = cyber;
    s.runner.rig = ["tr-1", "cy-1"];
    s.runner.credits = 5;
    const ice = instantiateCard("palisade", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    ice.strength = 2;
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;
    s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
    let guard = 0;
    while (s.timingKey !== "run.encounterPaw" && s.run && guard++ < 20) {
      if (queryLegality(s).legal.some((e) => e.action.type === "pass_window")) {
        s = must(s, { type: "pass_window" });
      } else {
        break;
      }
    }
    expect(s.timingKey).toBe("run.encounterPaw");
    const before = s.runner.credits;
    s = must(s, {
      type: "break_subroutine",
      breakerId: "tr-1",
      subIndex: 0,
    });
    // 3 − 1 cybernetic = 2¢
    expect(s.runner.credits).toBe(before - 2);
  });
});

describe("PH Basilar allotted clicks + Hypoxia next-turn delta", () => {
  it("accepts allotted_clicks_next_turn IR", () => {
    expect(
      validateEffectTree(fx.allottedClicksNextTurn("runner", -1)),
    ).toBeNull();
  });

  it("Basilar grants +1 allotted click on gainClicks", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const bas = instantiateCard("marrow", "bas-1", "runner:rig");
    bas.title = "Basilar";
    bas.allottedClicksBonus = 1;
    bas.unsupported = [];
    s.cards["bas-1"] = bas;
    s.runner.rig = ["bas-1"];
    s.timingKey = "runner.gainClicks";
    resolveAndAdvance(s);
    expect(s.runner.clicks).toBe(5);
  });

  it("pending delta reduces next Runner allotment then clears", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const r = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      fx.allottedClicksNextTurn("runner", -1),
    );
    expect(r.ok).toBe(true);
    expect(s.runnerAllottedClicksDeltaNextTurn).toBe(-1);
    s.timingKey = "runner.gainClicks";
    resolveAndAdvance(s);
    expect(s.runner.clicks).toBe(3);
    expect(s.runnerAllottedClicksDeltaNextTurn).toBe(0);
  });
});

describe("PH K2CP Turbine aura", () => {
  it("gives +2 strength to non-AI icebreakers, not AI", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const k2 = instantiateCard("sure-gamble", "k2-1", "runner:rig");
    k2.title = "K2CP Turbine";
    k2.type = "program";
    k2.giveStrengthToInstalledIcebreakers = {
      amount: 2,
      excludeSubtype: "ai",
    };
    k2.unsupported = [];
    const fracter = instantiateCard("cleaver", "cl-1", "runner:rig");
    fracter.unsupported = [];
    const ai = instantiateCard("mayfly", "ai-1", "runner:rig");
    ai.subtypes = ["icebreaker", "ai"];
    ai.breaker = {
      breaksSubtype: "*",
      strength: 1,
      breakCredits: 1,
    };
    ai.unsupported = [];
    s.cards["k2-1"] = k2;
    s.cards["cl-1"] = fracter;
    s.cards["ai-1"] = ai;
    s.runner.rig = ["k2-1", "cl-1", "ai-1"];
    expect(effectiveBreakerStrength(s, "cl-1")).toBe(
      (fracter.breaker?.strength ?? 0) + 2,
    );
    expect(effectiveBreakerStrength(s, "ai-1")).toBe(1);
  });
});

describe("PH tremolo/allot/k2cp card wiring (pin v0.50.0)", () => {
  it("wires Tremolo / Basilar / Hypoxia / K2CP with empty unsupported", () => {
    const tremolo = getCardDef("tremolo");
    expect(tremolo.unsupported).toEqual([]);
    expect(tremolo.breaker?.breakCredits).toBe(3);
    expect(tremolo.breaker?.breakMaxSubs).toBe(2);
    expect(tremolo.breaker?.breakCreditsDiscountPerInstalledSubtype).toEqual({
      subtype: "cybernetic",
      amount: 1,
    });

    const basilar = getCardDef("basilar-synthgland-2kvj");
    expect(basilar.unsupported).toEqual([]);
    expect(basilar.allottedClicksBonus).toBe(1);
    expect(basilar.onInstall).toEqual(fx.coreDamage(2));

    const hypoxia = getCardDef("hypoxia");
    expect(hypoxia.unsupported).toEqual([]);
    expect(hypoxia.playRequiresTagged).toBe(true);
    expect(validateEffectTree(hypoxia.onPlay!)).toBeNull();
    expect(JSON.stringify(hypoxia.onPlay)).toContain("allotted_clicks_next_turn");
    expect(JSON.stringify(hypoxia.onPlay)).toContain("rfg_self");

    const k2 = getCardDef("k2cp-turbine");
    expect(k2.unsupported).toEqual([]);
    expect(k2.giveStrengthToInstalledIcebreakers).toEqual({
      amount: 2,
      excludeSubtype: "ai",
    });
  });
});
