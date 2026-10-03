import { describe, expect, it, beforeAll } from "vitest";
import {
  applyIntent,
  assertPinnedTag,
  crDataPresent,
  instantiateCard,
  loadCardCatalog,
  queryLegality,
  setupEmptyRemoteWithIce,
} from "../src/index.js";
import type { GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  assertPinnedTag("v26.03");
  loadCardCatalog(true);
});

function installRunnerCard(state: GameState, defId: string, id: string): GameState {
  const card = instantiateCard(defId, id, "runner:grip");
  const next = structuredClone(state);
  next.cards[id] = card;
  next.runner.hand.push(id);
  next.runner.credits = 10;
  next.runner.clicks = 4;
  const installed = applyIntent(next, {
    type: "basic_install",
    cardId: id,
    destination: { kind: "rig" },
  });
  if (!installed.ok) throw new Error(installed.error);
  return installed.state;
}

function offersTake(state: GameState, abilityId: string): boolean {
  return queryLegality(state).legal.some(
    (entry) => entry.action.type === "use_paid_ability" && entry.action.abilityId === abilityId,
  );
}

describe("hosted credits", () => {
  it("does not offer or accept a take from an empty card, and does not trash it", () => {
    let s = installRunnerCard(setupEmptyRemoteWithIce(), "smartware-distributor", "sw-1");
    expect(s.cards["sw-1"].hostedCredits).toBeUndefined();
    expect(offersTake(s, "smartware-take")).toBe(false);
    const refused = applyIntent(s, {
      type: "use_paid_ability",
      cardId: "sw-1",
      abilityId: "smartware-take",
    });
    expect(refused.ok).toBe(false);

    const loaded = applyIntent(s, {
      type: "use_paid_ability",
      cardId: "sw-1",
      abilityId: "smartware-load",
    });
    if (!loaded.ok) throw new Error(loaded.error);
    s = loaded.state;
    expect(s.cards["sw-1"].hostedCredits).toBe(3);

    s.cards["sw-1"].hostedCredits = 1;
    const last = applyIntent(s, {
      type: "use_paid_ability",
      cardId: "sw-1",
      abilityId: "smartware-take",
    });
    if (!last.ok) throw new Error(last.error);
    s = last.state;
    expect(s.cards["sw-1"].hostedCredits).toBe(0);
    expect(s.runner.rig).toContain("sw-1");
    expect(offersTake(s, "smartware-take")).toBe(false);
  });

  it("trashes a card flagged to trash when a take empties it", () => {
    let s = installRunnerCard(setupEmptyRemoteWithIce(), "smartware-distributor", "sw-1");
    s.cards["sw-1"].trashWhenHostedCreditsEmpty = true;
    s.cards["sw-1"].hostedCredits = 1;
    const last = applyIntent(s, {
      type: "use_paid_ability",
      cardId: "sw-1",
      abilityId: "smartware-take",
    });
    if (!last.ok) throw new Error(last.error);
    expect(last.state.runner.rig).not.toContain("sw-1");
    expect(last.state.runner.discard).toContain("sw-1");
  });

  it("still allows a place-then-take ability from an empty card", () => {
    const s = installRunnerCard(setupEmptyRemoteWithIce(), "pennyshaver", "penny-1");
    expect(s.cards["penny-1"].hostedCredits).toBeUndefined();
    const before = s.runner.credits;
    const paid = applyIntent(s, {
      type: "use_paid_ability",
      cardId: "penny-1",
      abilityId: "pennyshaver-take",
    });
    if (!paid.ok) throw new Error(paid.error);
    expect(paid.state.runner.credits).toBe(before + 1);
    expect(paid.state.runner.rig).toContain("penny-1");
    expect(paid.state.cards["penny-1"].hostedCredits).toBe(0);
  });
});
