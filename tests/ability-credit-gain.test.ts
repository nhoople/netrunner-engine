/**
 * Card-ability credit gains go through gain_credits.
 * Aggregated "for each" gains are one instance (CR 9.12.2b, 9.12.2c).
 * realloc() also derezzes, so each ice is its own instance (CR 9.12.2b ex3).
 * NASX's whenever includes its own ability (printed text; CR 1.2.1).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  createInitialState,
  evalEffect,
  getCardDef,
  instantiateCard,
  loadCardCatalog,
  loadCardPool,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.145.0");
  loadCardPool();
  loadCardCatalog();
});

function corpWithNasx() {
  const s = createInitialState();
  const nasx = instantiateCard("nasx", "nasx-1", "server:hq:root");
  nasx.rezzed = true;
  s.cards["nasx-1"] = nasx;
  s.servers.hq!.root.push("nasx-1");
  return s;
}

describe("ability credit gains", () => {
  it("offers NASX on an aggregated per-advancement gain", () => {
    const s = corpWithNasx();
    const agenda = instantiateCard("hostile-takeover", "agenda-1", "server:hq:root");
    agenda.rezzed = true;
    agenda.advancementTokens = 3;
    s.cards["agenda-1"] = agenda;
    s.servers.hq!.root.push("agenda-1");
    const before = s.corp.credits;
    const r = evalEffect(
      { state: s, sourceId: "agenda-1" },
      {
        op: "do",
        action: {
          kind: "gain_credits",
          side: "corp",
          amount: 0,
          tally: {
            count: "source_advancement_tokens",
            per: 1,
            side: "source",
          },
        },
      },
    );
    expect(r.ok).toBe(true);
    expect(s.corp.credits).toBe(before + 3);
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "decline",
      "nasx-power:1",
      "nasx-power:2",
    ]);
  });

  it("does not gain or offer NASX when the tally is 0", () => {
    const s = corpWithNasx();
    const agenda = instantiateCard("hostile-takeover", "agenda-1", "server:hq:root");
    agenda.advancementTokens = 0;
    s.cards["agenda-1"] = agenda;
    s.servers.hq!.root.push("agenda-1");
    const before = s.corp.credits;
    evalEffect(
      { state: s, sourceId: "agenda-1" },
      {
        op: "do",
        action: {
          kind: "gain_credits",
          side: "corp",
          amount: 0,
          tally: {
            count: "source_advancement_tokens",
            per: 1,
            side: "source",
          },
        },
      },
    );
    expect(s.corp.credits).toBe(before);
    expect(s.pendingChoice).toBeNull();
  });

  it("offers NASX when NASX's own turn-begin ability gains a credit", () => {
    const s = corpWithNasx();
    const before = s.corp.credits;
    evalEffect(
      { state: s, sourceId: "nasx-1" },
      getCardDef("nasx").onTurnBegin!,
    );
    expect(s.corp.credits).toBe(before + 1);
    expect(s.pendingChoice?.sourceId).toBe("nasx-1");
    expect(s.pendingChoice?.options.some((o) => o.id === "nasx-power:1")).toBe(
      true,
    );
  });

  it("realloc() triggers NASX once per ice, then continues", () => {
    const s = corpWithNasx();
    const iceA = instantiateCard("ice-wall", "ice-a", "server:hq:ice");
    const iceB = instantiateCard("ice-wall", "ice-b", "server:hq:ice");
    iceA.rezzed = true;
    iceA.rezCost = 1;
    iceB.rezzed = true;
    iceB.rezCost = 3;
    s.cards["ice-a"] = iceA;
    s.cards["ice-b"] = iceB;
    s.servers.hq!.ice.push("ice-a", "ice-b");
    const op = instantiateCard("realloc", "realloc-1", "corp:discard");
    s.cards["realloc-1"] = op;
    const before = s.corp.credits;

    const first = evalEffect(
      { state: s, sourceId: "realloc-1" },
      {
        op: "do",
        action: { kind: "realloc_resolve", iceIds: ["ice-a", "ice-b"] },
      },
    );
    expect(first.ok).toBe(true);
    expect(s.corp.credits).toBe(before + 1);
    expect(s.cards["ice-a"]!.rezzed).toBe(false);
    expect(s.cards["ice-b"]!.rezzed).toBe(true);
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "decline",
      "nasx-power:1",
    ]);
    expect(s.pendingEffectContinuation?.effects).toEqual([
      {
        op: "do",
        action: { kind: "realloc_resolve", iceIds: ["ice-b"] },
      },
    ]);

    const declined = applyAction(s, { type: "choose_option", optionId: "decline" });
    expect(declined.ok).toBe(true);
    if (!declined.ok) return;
    expect(declined.state.cards["ice-b"]!.rezzed).toBe(false);
    expect(declined.state.corp.credits).toBe(before + 1 + 3);
    expect(declined.state.pendingChoice?.options.map((o) => o.id)).toContain(
      "nasx-power:2",
    );
  });
});
