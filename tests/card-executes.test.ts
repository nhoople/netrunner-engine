/**
 * Each card's printed play, rez, subroutine, and paid ability runs in a
 * minimal state. A throw is a card the engine cannot execute. A result of
 * "not enough credits" or an open choice still counts as the tree running.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  instantiateCard,
  loadCardCatalog,
} from "../src/index.js";
import type { Effect } from "../src/effects/ir.js";
import type { GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.6");
});

function isEffect(value: unknown): value is Effect {
  return Boolean(value && typeof value === "object" && "op" in value);
}

describe("each card's printed abilities execute", () => {
  it("evaluates play, rez, subroutines, and paid abilities without throwing", () => {
    const base = createInitialState();
    const failures: string[] = [];
    for (const def of loadCardCatalog(true).values()) {
      const trees: Array<[string, Effect]> = [];
      if (isEffect(def.onPlay)) trees.push(["onPlay", def.onPlay]);
      if (isEffect(def.onRez)) trees.push(["onRez", def.onRez]);
      for (const [index, sub] of (def.subroutines ?? []).entries()) {
        if (isEffect(sub.effect)) trees.push([`subroutines[${index}]`, sub.effect]);
      }
      for (const [index, ability] of (def.paidAbilities ?? []).entries()) {
        if (isEffect(ability.effect)) trees.push([`paidAbilities[${index}]`, ability.effect]);
      }
      if (trees.length === 0) continue;
      const state = structuredClone(base) as GameState;
      const zone = def.side === "corp" ? "corp:hq" : "runner:grip";
      const card = instantiateCard(def.id, "card", zone);
      card.rezzed = true;
      card.faceup = true;
      state.cards.card = card;
      if (def.side === "corp") state.corp.hand.push("card");
      else state.runner.hand.push("card");
      for (const [label, effect] of trees) {
        try {
          evalEffect({ state, sourceId: "card" }, effect);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failures.push(`${def.id} ${label}: ${message}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
