/**
 * Parhelion v0.64: Mr. Hendrik + Nightmare Archive.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  agendaPointsFor,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  queryLegality,
  validateEffectTree,
} from "../src/index.js";
import type { ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.94.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

function emptyRun(server: ServerId, candidates: string[]) {
  return {
    attackedServerId: server,
    phase: "breach" as const,
    position: null,
    successful: true,
    accessedCardIds: [] as string[],
    accessCandidates: candidates,
    accessRemaining: null as number | null,
    encounter: null,
    endedTheRun: false,
    cannotJackOut: false,
    strengthBoosts: {} as Record<string, number>,
    encounterStrengthBoosts: {} as Record<string, number>,
    iceStrengthBoosts: {} as Record<string, number>,
    accessingCardId: null as string | null,
  };
}

describe("PH Mr. Hendrik", () => {
  it("wires onAccess may_pay_credits_for_core_damage while installed", () => {
    const def = getCardDef("mr-hendrik");
    expect(def.unsupported ?? []).toEqual([]);
    expect(def.onAccess).toEqual({
      op: "if",
      cond: { op: "source_installed" },
      then: {
        op: "do",
        action: {
          kind: "may_pay_credits_for_core_damage",
          amount: 2,
          damage: 1,
        },
      },
    });
    expect(validateEffectTree(def.onAccess!)).toBeNull();
    expect(validateEffectTree(fx.mayPayCreditsForCoreDamage(2, 1))).toBeNull();
  });

  it("Corp may pay 2¢ for interactive core damage; Runner prevents by losing clicks", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const remote = "remote-1" as ServerId;
    s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
    const card = instantiateCard("mr-hendrik", "hendrik-1", `server:${remote}:root`);
    s.cards["hendrik-1"] = card;
    s.servers[remote].root = ["hendrik-1"];
    s.corp.credits = 5;
    s.runner.clicks = 2;
    s.runner.brainDamage = 0;
    s.activeSide = "runner";
    s.timingKey = "breach.awaitAccess";
    s.run = emptyRun(remote, ["hendrik-1"]);

    s = must(s, { type: "access_card", cardId: "hendrik-1" });
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.some((o) => o.id === "pay")).toBe(true);

    s = must(s, { type: "choose_option", optionId: "pay" });
    expect(s.corp.credits).toBe(3);
    expect(s.pendingDamage).toEqual({
      type: "core",
      remaining: 1,
      sourceId: "hendrik-1",
      preventByLoseAllClicks: true,
    });

    const legal = queryLegality(s).legal.map((e) => e.action.type);
    expect(legal).toContain("prevent_damage_lose_all_clicks");
    expect(legal).toContain("accept_damage");
    expect(legal).not.toContain("prevent_damage");

    s = must(s, { type: "prevent_damage_lose_all_clicks" });
    expect(s.runner.clicks).toBe(0);
    expect(s.pendingDamage).toBeNull();
    expect(s.runner.brainDamage).toBe(0);
  });

  it("accepting pending damage applies 1 core damage", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const remote = "remote-1" as ServerId;
    s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
    const card = instantiateCard("mr-hendrik", "hendrik-2", `server:${remote}:root`);
    s.cards["hendrik-2"] = card;
    s.servers[remote].root = ["hendrik-2"];
    // Fill grip so core damage does not flatline.
    for (let i = 0; i < 3; i++) {
      const id = `grip-${i}`;
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }
    s.corp.credits = 5;
    s.runner.clicks = 0;
    s.activeSide = "runner";
    s.timingKey = "breach.awaitAccess";
    s.run = emptyRun(remote, ["hendrik-2"]);

    s = must(s, { type: "access_card", cardId: "hendrik-2" });
    s = must(s, { type: "choose_option", optionId: "pay" });
    expect(s.pendingDamage?.preventByLoseAllClicks).toBe(true);
    const legal = queryLegality(s).legal.map((e) => e.action.type);
    expect(legal).not.toContain("prevent_damage_lose_all_clicks");
    s = must(s, { type: "accept_damage" });
    expect(s.runner.brainDamage).toBe(1);
    expect(s.pendingDamage).toBeNull();
  });

  it("does not offer pay when not installed (HQ access)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const card = instantiateCard("mr-hendrik", "hendrik-hq", "corp:hq");
    s.cards["hendrik-hq"] = card;
    s.corp.hand = ["hendrik-hq"];
    s.corp.credits = 5;
    const r = evalEffect({ state: s, sourceId: "hendrik-hq" }, card.onAccess!);
    expect(r.ok).toBe(true);
    expect(s.pendingChoice).toBeNull();
    expect(s.pendingDamage).toBeNull();
  });
});

describe("PH Nightmare Archive", () => {
  it("wires mustReveal + onAccess choose score/−1 or core+rfg", () => {
    const def = getCardDef("nightmare-archive");
    expect(def.unsupported ?? []).toEqual([]);
    expect(def.mustRevealWhenAccessedFromRd).toBe(true);
    expect(def.onAccess?.op).toBe("choose");
    expect(validateEffectTree(def.onAccess!)).toBeNull();
    expect(validateEffectTree(fx.addToRunnerScoreAsAgenda(-1))).toBeNull();
  });

  it("Runner may add to score area as −1 agenda point", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const remote = "remote-1" as ServerId;
    s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
    const card = instantiateCard(
      "nightmare-archive",
      "na-1",
      `server:${remote}:root`,
    );
    s.cards["na-1"] = card;
    s.servers[remote].root = ["na-1"];
    s.activeSide = "runner";
    s.timingKey = "breach.awaitAccess";
    s.run = emptyRun(remote, ["na-1"]);

    s = must(s, { type: "access_card", cardId: "na-1" });
    expect(s.pendingChoice?.chooser).toBe("runner");
    s = must(s, { type: "choose_option", optionId: "score-neg1" });
    expect(s.runner.score).toContain("na-1");
    expect(s.cards["na-1"].zone).toBe("runner:score");
    expect(s.cards["na-1"].agendaPoints).toBe(-1);
    expect(agendaPointsFor(s, "runner")).toBe(-1);
    expect(s.servers[remote].root).not.toContain("na-1");
  });

  it("declining scores deals 1 core damage and RFGs", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const remote = "remote-1" as ServerId;
    s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
    const card = instantiateCard(
      "nightmare-archive",
      "na-2",
      `server:${remote}:root`,
    );
    s.cards["na-2"] = card;
    s.servers[remote].root = ["na-2"];
    for (let i = 0; i < 3; i++) {
      const id = `grip-na-${i}`;
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }
    s.activeSide = "runner";
    s.timingKey = "breach.awaitAccess";
    s.run = emptyRun(remote, ["na-2"]);

    s = must(s, { type: "access_card", cardId: "na-2" });
    s = must(s, { type: "choose_option", optionId: "damage-rfg" });
    expect(s.runner.brainDamage).toBe(1);
    expect(s.cards["na-2"].zone).toBe("removed-from-game");
    expect(s.removedFromGame).toContain("na-2");
    expect(s.servers[remote].root).not.toContain("na-2");
  });

  it("must reveal when accessed from R&D", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const card = instantiateCard("nightmare-archive", "na-rd", "corp:rd");
    card.faceup = false;
    s.cards["na-rd"] = card;
    s.corp.deck = ["na-rd", ...s.corp.deck];
    s.activeSide = "runner";
    s.timingKey = "breach.awaitAccess";
    s.run = emptyRun("rd", ["na-rd"]);

    s = must(s, { type: "access_card", cardId: "na-rd" });
    expect(s.cards["na-rd"].faceup).toBe(true);
    expect(s.log.some((l) => /Revealed Nightmare Archive while accessing from R&D/.test(l))).toBe(
      true,
    );
    expect(s.pendingChoice?.chooser).toBe("runner");
  });
});
