/**
 * RWR v1.00: Cupellation / Heliamphora — final 65/65 slice.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  getCardDef,
  instantiateCard,
  loadCardCatalog,
  purgeVirusCounters,
  validateEffectTree,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.138.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("RWR v1.00 Cupellation / Heliamphora", () => {
  it("loads two clear cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of ["cupellation", "heliamphora"]) {
      expect(catalog.get(id)!.unsupported ?? [], id).toEqual([]);
    }
  });

  it("Cupellation IR: maxHosted + access host + HQ breach Effect", () => {
    const def = getCardDef("cupellation");
    expect(def.maxHostedCards).toBe(1);
    expect(def.accessHostNonAgendaFaceup).toEqual({ creditCost: 1 });
    expect(validateEffectTree(def.onBreachHqIfHostingCorpCard!)).toBeNull();
    expect(JSON.stringify(def.onBreachHqIfHostingCorpCard)).toContain(
      "trash_self",
    );
    expect(JSON.stringify(def.onBreachHqIfHostingCorpCard)).toContain(
      "bonus_access",
    );
  });

  it("Heliamphora IR: Archives interrupt + onVirusPurge random HQ", () => {
    const def = getCardDef("heliamphora");
    expect(def.onWouldAccessArchivesHostInstead).toEqual({
      oncePerArchivesBreach: true,
    });
    expect(validateEffectTree(def.onVirusPurge!)).toBeNull();
    expect(JSON.stringify(def.onVirusPurge)).toContain('"pick":"random"');
    expect(JSON.stringify(def.onVirusPurge)).toContain('"amount":2');
    expect(JSON.stringify(def.onVirusPurge)).toContain("trash_self");
  });

  it("Cupellation hosts accessed non-agenda faceup (not installed)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.runner.credits = 5;
    const cup = instantiateCard("cupellation", "cup-1", "runner:rig");
    s.cards["cup-1"] = cup;
    s.runner.rig = ["cup-1"];

    const asset = instantiateCard("pad-campaign", "a-1", "corp:hq");
    s.cards["a-1"] = asset;
    s.corp.hand = ["a-1"];

    s.run = {
      attackedServerId: "hq",
      phase: "breach",
      position: null,
      successful: true,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: "a-1",
      accessCandidates: [],
      accessedCardIds: ["a-1"],
      accessRemaining: 0,
      encounter: null,
      breached: true,
    };
    s.timingKey = "breach.awaitAccess";

    s = must(s, { type: "access_host_non_agenda_faceup", cardId: "a-1" });
    expect(s.runner.credits).toBe(4);
    expect(s.cards["cup-1"]!.hostedCardIds).toEqual(["a-1"]);
    expect(s.cards["a-1"]!.zone).toBe("hosted:cup-1");
    expect(s.cards["a-1"]!.hostId).toBe("cup-1");
    expect(s.cards["a-1"]!.faceup).toBe(true);
    expect(s.corp.hand).not.toContain("a-1");
    expect(s.corp.discard).not.toContain("a-1");
    expect(s.runner.rig).not.toContain("a-1");
  });

  it("Heliamphora onVirusPurge trashes 2 random HQ + self", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const heli = instantiateCard("heliamphora", "heli-1", "runner:rig");
    s.cards["heli-1"] = heli;
    s.runner.rig = ["heli-1"];

    for (const id of ["h1", "h2", "h3"]) {
      const c = instantiateCard("hedge-fund", id, "corp:hq");
      s.cards[id] = c;
    }
    s.corp.hand = ["h1", "h2", "h3"];

    purgeVirusCounters(s, s.corp.identityId);
    expect(s.runner.rig).not.toContain("heli-1");
    expect(s.runner.discard).toContain("heli-1");
    expect(s.corp.hand).toHaveLength(1);
    expect(s.corp.discard.filter((id) => id.startsWith("h")).length).toBe(2);
  });

  it("trash_hq random amount validates and evals", () => {
    const fx = {
      op: "do" as const,
      action: {
        kind: "trash_hq" as const,
        pick: "random" as const,
        amount: 2,
      },
    };
    expect(validateEffectTree(fx)).toBeNull();
    let s = createInitialState();
    s = structuredClone(s);
    for (const id of ["x1", "x2"]) {
      s.cards[id] = instantiateCard("hedge-fund", id, "corp:hq");
    }
    s.corp.hand = ["x1", "x2"];
    const r = evalEffect({ state: s, sourceId: s.corp.identityId }, fx);
    expect(r.ok).toBe(true);
    expect(s.corp.hand).toHaveLength(0);
  });
});
