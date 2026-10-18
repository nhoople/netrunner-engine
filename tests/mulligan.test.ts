/**
 * CR 1.6.6a opening mulligan — keep_starting_hand / mulligan.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  createInitialState,
  getPublicView,
  instantiateCard,
  queryLegality,
  startingHandSizeFor,
  assertPinnedTag,
  crDataPresent,
} from "../src/index.js";
import type { Action, GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) {
    throw new Error("Run `npm run fetch-cr` before tests.");
  }
  assertPinnedTag("v26.03");
});

function must(state: GameState, action: Action): GameState {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

function dealStartingHands(state: GameState, corpN = 5, runnerN = 5): GameState {
  const s = structuredClone(state);
  // Ensure enough cards in each deck to draw a starting hand.
  while (s.corp.deck.length + s.corp.hand.length < corpN) {
    const id = `corp-extra-${s.corp.deck.length}`;
    s.cards[id] = {
      id,
      title: id,
      type: "operation",
      side: "corp",
      installCost: 0,
      faceup: false,
      rezzed: false,
      zone: "corp:rd",
    };
    s.corp.deck.push(id);
  }
  while (s.runner.deck.length + s.runner.hand.length < runnerN) {
    const id = `runner-extra-${s.runner.deck.length}`;
    s.cards[id] = {
      id,
      title: id,
      type: "event",
      side: "runner",
      installCost: 0,
      faceup: false,
      rezzed: false,
      zone: "runner:stack",
    };
    s.runner.deck.push(id);
  }
  // Deal from deck into hand (first hand already "dealt" before mulligan).
  while (s.corp.hand.length < corpN && s.corp.deck.length > 0) {
    const top = s.corp.deck.shift()!;
    s.corp.hand.push(top);
    s.cards[top].zone = "corp:hq";
  }
  while (s.runner.hand.length < runnerN && s.runner.deck.length > 0) {
    const top = s.runner.deck.shift()!;
    s.runner.hand.push(top);
    s.cards[top].zone = "runner:grip";
    s.cards[top].faceup = true;
  }
  return s;
}

describe("CR 1.6.6a opening mulligan", () => {
  it("new game offers Corp only keep_starting_hand and mulligan; Runner has none", () => {
    const s = createInitialState();
    expect(s.timingKey).toBe("opening.corpMulligan");
    const view = queryLegality(s);
    expect(view.priority).toBe("corp");
    expect(view.legal.map((e) => e.action.type).sort()).toEqual([
      "keep_starting_hand",
      "mulligan",
    ]);
    for (const e of view.legal) {
      expect(e.actor).toBe("corp");
      expect(e.cites).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ number: "1.6.6a", id: "rule_mulligan" }),
        ]),
      );
    }
    expect(view.legal.some((e) => e.action.type === "pass_window")).toBe(false);
    expect(view.legal.some((e) => e.actor === "runner")).toBe(false);
  });

  it("Corp mulligan redraws startingHandSize and preserves card ids in hand+deck", () => {
    let s = dealStartingHands(createInitialState(), 5, 5);
    const before = [...s.corp.hand, ...s.corp.deck].sort();
    expect(s.corp.hand.length).toBe(5);
    s = must(s, { type: "mulligan" });
    expect(s.timingKey).toBe("opening.runnerMulligan");
    expect(s.corp.hand.length).toBe(
      startingHandSizeFor(s.cards[s.corp.identityId]),
    );
    const after = [...s.corp.hand, ...s.corp.deck].sort();
    expect(after).toEqual(before);
    for (const id of s.corp.hand) {
      expect(s.cards[id].zone).toBe("corp:hq");
    }
    for (const id of s.corp.deck) {
      expect(s.cards[id].zone).toBe("corp:rd");
    }
  });

  it("Corp is not offered a second mulligan; Runner then chooses", () => {
    let s = createInitialState();
    s = must(s, { type: "mulligan" });
    expect(s.timingKey).toBe("opening.runnerMulligan");
    const view = queryLegality(s);
    expect(view.priority).toBe("runner");
    expect(view.legal.map((e) => e.action.type).sort()).toEqual([
      "keep_starting_hand",
      "mulligan",
    ]);
    for (const e of view.legal) {
      expect(e.actor).toBe("runner");
    }
  });

  it("after Runner keeps, timingKey is corp.gainClicks and Corp is offered pass_window", () => {
    let s = createInitialState();
    s = must(s, { type: "keep_starting_hand" });
    s = must(s, { type: "keep_starting_hand" });
    expect(s.timingKey).toBe("corp.gainClicks");
    const view = queryLegality(s);
    expect(view.priority).toBe("corp");
    expect(view.legal.some((e) => e.action.type === "pass_window")).toBe(true);
  });

  it("identity with startingHandSize 9 redraws 9", () => {
    let s = createInitialState();
    // Swap Runner identity to Andromeda (startingHandSize: 9).
    const andromeda = instantiateCard(
      "andromeda-dispossessed-ristie",
      "runner-id",
      "runner:grip",
    );
    s.cards["runner-id"] = andromeda;
    s.runner.identityId = "runner-id";
    expect(startingHandSizeFor(andromeda)).toBe(9);

    s = dealStartingHands(s, 5, 9);
    expect(s.runner.hand.length).toBe(9);
    const before = [...s.runner.hand, ...s.runner.deck].sort();

    s = must(s, { type: "keep_starting_hand" }); // Corp keeps
    expect(s.timingKey).toBe("opening.runnerMulligan");
    s = must(s, { type: "mulligan" });
    expect(s.runner.hand.length).toBe(9);
    expect([...s.runner.hand, ...s.runner.deck].sort()).toEqual(before);
  });

  it("Runner cannot mulligan while Corp is still choosing", () => {
    const s = createInitialState();
    expect(s.timingKey).toBe("opening.corpMulligan");
    const r = applyAction(s, { type: "mulligan" });
    // Corp mulligan is legal for Corp — applying it as the only mulligan action
    // advances to Runner. The Runner-as-actor check is via legality actors.
    const view = queryLegality(s);
    expect(view.legal.every((e) => e.actor === "corp")).toBe(true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // After Corp mulligans, Runner may choose — Corp is done.
    expect(r.state.timingKey).toBe("opening.runnerMulligan");
    const runnerView = queryLegality(r.state);
    expect(runnerView.legal.every((e) => e.actor === "runner")).toBe(true);
  });

  it("state log contains the decision and no card titles", () => {
    let s = dealStartingHands(createInitialState(), 5, 5);
    const titles = Object.values(s.cards).map((c) => c.title);
    s = must(s, { type: "mulligan" });
    s = must(s, { type: "keep_starting_hand" });
    expect(s.log.some((l) => l === "Corp takes a mulligan")).toBe(true);
    expect(s.log.some((l) => l === "Runner keeps their starting hand")).toBe(
      true,
    );
    const decisionLogs = s.log.filter(
      (l) => l.includes("mulligan") || l.includes("keeps their starting hand"),
    );
    for (const line of decisionLogs) {
      for (const title of titles) {
        // Skip generic filler ids that appear in the keep/mulligan phrasing itself.
        if (title === "mulligan") continue;
        expect(line.includes(title)).toBe(false);
      }
      expect(line).not.toMatch(/corp-fill|runner-fill|corp-asset|corp-ice/);
    }
    const pub = getPublicView(s, "corp");
    expect(pub.log).toEqual(s.log);
  });
});
