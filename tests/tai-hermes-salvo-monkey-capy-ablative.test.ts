/**
 * TAI v0.77: Hermes, Salvo Testing, Monkeywrench, Capybara, Ablative Barrier.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  effectiveIceStrength,
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
  assertCardsPinnedTag("v1.100.0");
});

describe("TAI Hermes / Salvo / Monkeywrench / Capybara / Ablative", () => {
  it("wires Hermes muBonus + onAgendaScoredOrStolen; unsupported empty", () => {
    const def = getCardDef("hermes");
    expect(def.unsupported).toEqual([]);
    expect(def.muBonus).toBe(1);
    expect(def.subtypes).toContain("console");
    expect(validateEffectTree(def.onAgendaScoredOrStolen!)).toBeNull();
  });

  it("wires Salvo Testing onAgendaScored may core; unsupported empty", () => {
    const def = getCardDef("salvo-testing");
    expect(def.unsupported).toEqual([]);
    expect(def.agendaPoints).toBe(3);
    expect(def.advancementRequirement).toBe(5);
    expect(validateEffectTree(def.onAgendaScored!)).toBeNull();
  });

  it("wires Monkeywrench trojan strength mods; unsupported empty", () => {
    const def = getCardDef("monkeywrench");
    expect(def.unsupported).toEqual([]);
    expect(def.installOnIce).toBe(true);
    expect(def.hostStrengthModifier).toBe(-2);
    expect(def.otherIceProtectingServerStrengthModifier).toBe(-1);
  });

  it("Monkeywrench lowers host and sibling ice strength", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const host = instantiateCard("enigma", "ice-host", "server:hq:ice");
    host.strength = 5;
    const other = instantiateCard("enigma", "ice-other", "server:hq:ice");
    other.strength = 4;
    s.cards["ice-host"] = host;
    s.cards["ice-other"] = other;
    s.servers.hq.ice = ["ice-host", "ice-other"];
    const mw = instantiateCard("monkeywrench", "mw-1", "runner:rig");
    mw.hostId = "ice-host";
    mw.hostStrengthModifier = -2;
    mw.otherIceProtectingServerStrengthModifier = -1;
    s.cards["mw-1"] = mw;
    s.runner.rig.push("mw-1");
    expect(effectiveIceStrength(s, "ice-host")).toBe(3);
    expect(effectiveIceStrength(s, "ice-other")).toBe(3);
  });

  it("wires Capybara onBypass; unsupported empty", () => {
    const def = getCardDef("capybara");
    expect(def.unsupported).toEqual([]);
    expect(def.onBypass).toBeDefined();
    expect(validateEffectTree(def.onBypass!)).toBeNull();
  });

  it("rfg_self_then_derez_bypassed_ice RFGs source and derezzes ice", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("enigma", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    ice.faceup = true;
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];
    const capy = instantiateCard("capybara", "capy-1", "runner:rig");
    s.cards["capy-1"] = capy;
    s.runner.rig.push("capy-1");
    s.run = {
      attackedServerId: "hq",
      position: 0,
      phase: "encounter",
      bypassedIceIds: ["ice-1"],
      iceStrengthBoosts: {},
      strengthBoosts: {},
      encounterStrengthBoosts: {},
    } as typeof s.run;
    const r = evalEffect(
      { state: s, sourceId: "capy-1" },
      fx.do({ kind: "rfg_self_then_derez_bypassed_ice" }),
    );
    expect(r.ok).toBe(true);
    expect(s.cards["capy-1"]!.zone).toBe("removed-from-game");
    expect(s.runner.rig).not.toContain("capy-1");
    expect(s.cards["ice-1"]!.rezzed).toBe(false);
  });

  it("wires Ablative Barrier Threat onRez + ETR; unsupported empty", () => {
    const def = getCardDef("ablative-barrier");
    expect(def.unsupported).toEqual([]);
    expect(def.onRez).toBeDefined();
    expect(validateEffectTree(def.onRez!)).toBeNull();
    expect(def.subroutines).toHaveLength(1);
    expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
  });

  it("install_from_hq_or_archives excludeAgenda skips agendas", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ag = instantiateCard("hostile-takeover", "ag-1", "corp:hq");
    const ice = instantiateCard("enigma", "ice-hq", "corp:hq");
    s.cards["ag-1"] = ag;
    s.cards["ice-hq"] = ice;
    s.corp.hand = ["ag-1", "ice-hq"];
    const src = instantiateCard("ablative-barrier", "ab-1", "server:hq:ice");
    s.cards["ab-1"] = src;
    s.servers.hq.ice = ["ab-1"];
    const beforeRemotes = Object.keys(s.servers).filter((id) =>
      id.startsWith("remote-"),
    ).length;
    const r = evalEffect(
      { state: s, sourceId: "ab-1" },
      fx.do({
        kind: "install_from_hq_or_archives",
        excludeAgenda: true,
        excludeSourceServer: true,
      }),
    );
    expect(r.ok).toBe(true);
    expect(s.corp.hand).toContain("ag-1");
    expect(s.corp.hand).not.toContain("ice-hq");
    const afterRemotes = Object.keys(s.servers).filter((id) =>
      id.startsWith("remote-"),
    );
    expect(afterRemotes.length).toBe(beforeRemotes + 1);
    expect(agendaPointsFor(s, "corp")).toBe(0);
  });
});
