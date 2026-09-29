/**
 * TAI v0.74: Threat cond + Shibboleth / Mindscaping / Jaguarundi.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  validateEffectTree,
  agendaPointsFor,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.74.0");
});

describe("TAI threat + Mindscaping / Shibboleth / Jaguarundi", () => {
  it("wires Shibboleth threat strength −2 + decoder; unsupported empty", () => {
    const def = getCardDef("shibboleth");
    expect(def.unsupported).toEqual([]);
    expect(def.threatStrengthBonus).toEqual({ level: 4, amount: -2 });
    expect(def.breaker?.breaksSubtype).toBe("code gate");
  });

  it("wires Mindscaping choose tree; unsupported empty", () => {
    const def = getCardDef("mindscaping");
    expect(def.unsupported).toEqual([]);
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });

  it("wires Jaguarundi threat onEncounter + subs; unsupported empty", () => {
    const def = getCardDef("jaguarundi");
    expect(def.unsupported).toEqual([]);
    expect(def.onEncounter).toBeDefined();
    expect(validateEffectTree(def.onEncounter!)).toBeNull();
    for (const sub of def.subroutines ?? []) {
      expect(validateEffectTree(sub.effect)).toBeNull();
    }
  });

  it("net_damage_up_to_tags caps at max", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.runner.tags = 5;
    for (let i = 0; i < 5; i++) {
      const id = `g-${i}`;
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }
    const src = instantiateCard("mindscaping", "ms-1", "corp:play-area");
    s.cards["ms-1"] = src;
    const before = s.runner.hand.length;
    const r = evalEffect(
      { state: s, sourceId: "ms-1" },
      fx.netDamageUpToTags(3),
    );
    expect(r.ok).toBe(true);
    expect(s.runner.hand.length).toBe(before - 3);
  });

  it("hq_to_top_rd moves one HQ card to R&D top", () => {
    let s = createInitialState();
    s = structuredClone(s);
    for (const id of ["h1", "h2"]) {
      s.cards[id] = instantiateCard("hedge-fund", id, "corp:hq");
      s.corp.hand.push(id);
    }
    const src = instantiateCard("mindscaping", "ms-2", "corp:play-area");
    s.cards["ms-2"] = src;
    const r = evalEffect(
      { state: s, sourceId: "ms-2" },
      fx.hqToTopRd("first"),
    );
    expect(r.ok).toBe(true);
    expect(s.corp.hand).toHaveLength(1);
    expect(s.corp.deck.at(-1)).toBe("h1");
  });

  it("threat cond uses max agenda points across players", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ag = instantiateCard("hostile-takeover", "ag-1", "corp:score");
    ag.agendaPoints = 4;
    s.cards["ag-1"] = ag;
    s.corp.score = ["ag-1"];
    expect(agendaPointsFor(s, "corp")).toBe(4);
    const ice = instantiateCard("jaguarundi", "jag-1", "server:hq:ice");
    ice.onEncounter = getCardDef("jaguarundi").onEncounter;
    s.cards["jag-1"] = ice;
    const r = evalEffect(
      { state: s, sourceId: "jag-1" },
      ice.onEncounter!,
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice?.chooser).toBe("runner");
  });
});
