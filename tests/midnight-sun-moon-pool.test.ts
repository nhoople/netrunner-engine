/**
 * Midnight Sun Moon Pool: RFG self; trash HQ; reveal Archives → R&D;
 * place advancements per agenda revealed.
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
  instantiateCard,
  validateEffectTree,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.93.0");
});

describe("MS moon_pool_resolve (Moon Pool)", () => {
  it("validates moon_pool_resolve tree", () => {
    expect(validateEffectTree(fx.moonPoolResolve(2, 2))).toBeNull();
  });

  it("RFGs self, trashes HQ, reveals Archives agendas into R&D with advancements", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const pool = instantiateCard("pad-campaign", "mp-1", "corp:archives");
    s.cards["mp-1"] = pool;
    s.corp.discard = ["mp-1"];

    const hq1 = instantiateCard("hedge-fund", "hq-1", "corp:hq");
    const hq2 = instantiateCard("hedge-fund", "hq-2", "corp:hq");
    s.cards["hq-1"] = hq1;
    s.cards["hq-2"] = hq2;
    s.corp.hand = ["hq-1", "hq-2"];

    const facedownAgenda = instantiateCard(
      "hostile-takeover",
      "fa-1",
      "corp:archives",
    );
    facedownAgenda.faceup = false;
    s.cards["fa-1"] = facedownAgenda;
    s.corp.discard.push("fa-1");

    const host = instantiateCard("pad-campaign", "host-1", "server:remote-1:root");
    host.canAdvance = true;
    host.advancementTokens = 0;
    s.cards["host-1"] = host;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["host-1"],
    };

    const r = evalEffect(
      { state: s, sourceId: "mp-1" },
      fx.moonPoolResolve(2, 2),
    );
    expect(r.ok).toBe(true);
    expect(s.cards["mp-1"].zone).toBe("removed-from-game");
    expect(s.corp.hand).toEqual([]);
    expect(s.corp.discard).toContain("hq-1");
    expect(s.corp.discard).toContain("hq-2");
    expect(s.corp.discard).not.toContain("fa-1");
    expect(s.corp.deck).toContain("fa-1");
    expect(s.cards["host-1"].advancementTokens).toBe(1);
  });
});
