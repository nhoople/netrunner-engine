/**
 * Midnight Sun Mitosis: install up to 2 from HQ into new remotes with
 * advancements; those cards cannot be scored/rezzed this turn.
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
  fx,
  instantiateCard,
  validateEffectTree,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.39.0");
});

describe("MS install_hq_new_remotes_with_advancements (Mitosis)", () => {
  it("validates mitosis install tree", () => {
    expect(
      validateEffectTree(fx.installHqNewRemotesWithAdvancements(2, 2)),
    ).toBeNull();
  });

  it("installs up to 2 HQ cards into new remotes with advancements and lockout", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.corp.credits = 20;
    const a = instantiateCard("hostile-takeover", "ag-1", "corp:hq");
    a.installCost = 0;
    const b = instantiateCard("pad-campaign", "as-1", "corp:hq");
    b.installCost = 0;
    const c = instantiateCard("ice-wall", "ice-1", "corp:hq");
    c.installCost = 1;
    s.cards["ag-1"] = a;
    s.cards["as-1"] = b;
    s.cards["ice-1"] = c;
    s.corp.hand = ["ag-1", "as-1", "ice-1"];
    const src = instantiateCard("hedge-fund", "mit-1", "corp:play-area");
    s.cards["mit-1"] = src;

    const r = evalEffect(
      { state: s, sourceId: "mit-1" },
      fx.installHqNewRemotesWithAdvancements(2, 2),
    );
    expect(r.ok).toBe(true);
    expect(s.corp.hand).toEqual(["ice-1"]);
    expect(s.turn.cannotScoreOrRezCardIds.sort()).toEqual(
      ["ag-1", "as-1"].sort(),
    );
    expect(s.cards["ag-1"].advancementTokens).toBe(2);
    expect(s.cards["as-1"].advancementTokens).toBe(2);
    expect(s.cards["ag-1"].zone).toMatch(/^server:remote-\d+:root$/);
    expect(s.cards["as-1"].zone).toMatch(/^server:remote-\d+:root$/);

    // Cannot score locked agenda this turn.
    s.timingKey = "corp.takeAction";
    s.activeSide = "corp";
    const score = applyAction(s, { type: "score_agenda", cardId: "ag-1" });
    expect(score.ok).toBe(false);
  });
});
