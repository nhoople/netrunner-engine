/**
 * Midnight Sun Ob Superheavy: on rezzed card trash, search R&D for printed
 * rez cost 1 less, install and rez ignoring credit costs.
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
  assertCardsPinnedTag("v0.85.0");
});

describe("MS Ob Superheavy search_rd_install_rez_by_printed_rez_cost", () => {
  it("validates search tree", () => {
    expect(
      validateEffectTree(fx.searchRdInstallRezByPrintedRezCost(-1)),
    ).toBeNull();
  });

  it("installs and rezzes R&D card with printed rez = last - 1", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.turn.lastTrashedRezzedPrintedRezCost = 3;
    const ice = instantiateCard("ice-wall", "iw-1", "corp:rd");
    ice.rezCost = 2;
    s.cards["iw-1"] = ice;
    s.corp.deck = ["iw-1", ...s.corp.deck];
    const id = instantiateCard(
      "haas-bioroid-precision-design",
      "ob-1",
      "corp:identity",
    );
    s.cards["ob-1"] = id;
    s.corp.identityId = "ob-1";

    const r = evalEffect(
      { state: s, sourceId: "ob-1" },
      fx.searchRdInstallRezByPrintedRezCost(-1),
    );
    expect(r.ok).toBe(true);
    expect(s.corp.deck).not.toContain("iw-1");
    expect(s.cards["iw-1"].rezzed).toBe(true);
    expect(s.cards["iw-1"].zone).toMatch(/^server:remote-\d+:ice$/);
  });
});
