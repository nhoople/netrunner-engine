/**
 * Ported from game.core.set-up-test in mtgred/netrunner, pinned at
 * bc9e2fca073a5b21d247e72877804118e81d5472. See tests/jnet/NOTICE.md and
 * docs/jnet-test-ports.md. Upstream asserts chat log wording; this port
 * asserts the keep/mulligan board effect (hand identity) instead.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
} from "../../src/index.js";
import { must, newGame } from "./helpers.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.18");
});

const CORP_OPENING = [
  "Ice Wall",
  "Hedge Fund",
  "IPO",
  "NGO Front",
  "PAD Campaign",
];
const CORP_DECK = [
  "Jackson Howard",
  "Enigma",
  "Merger",
  "SanSan City Grid",
];
const RUNNER_OPENING = [
  "Sure Gamble",
  "Drug Dealer",
  "Corroder",
  "Nfr",
  "Kasi String",
];
const RUNNER_DECK = ["Stimhack", "Desperado", "Jak Sinclair"];

describe("jnet ports — core set-up", () => {
  // jnet: game.core.set-up-test/mulligan-responses
  it("keeping the opening hand leaves those five cards in place", () => {
    let state = newGame({
      corpHand: CORP_OPENING,
      corpDeck: CORP_DECK,
      runnerHand: RUNNER_OPENING,
      runnerDeck: RUNNER_DECK,
      leaveAtMulligan: true,
    });
    const corpHand = [...state.corp.hand];
    state = must(state, { type: "keep_starting_hand" });
    expect(state.corp.hand).toEqual(corpHand);
    const runnerHand = [...state.runner.hand];
    state = must(state, { type: "keep_starting_hand" });
    expect(state.runner.hand).toEqual(runnerHand);
  });

  // jnet: game.core.set-up-test/mulligan-responses
  it("taking a mulligan replaces the opening hand", () => {
    let state = newGame({
      corpHand: CORP_OPENING,
      corpDeck: CORP_DECK,
      runnerHand: RUNNER_OPENING,
      runnerDeck: RUNNER_DECK,
      leaveAtMulligan: true,
    });
    const corpHand = [...state.corp.hand];
    state = must(state, { type: "mulligan" });
    expect(state.corp.hand).not.toEqual(corpHand);
    expect(state.corp.hand).toHaveLength(5);
    const runnerHand = [...state.runner.hand];
    state = must(state, { type: "mulligan" });
    expect(state.runner.hand).not.toEqual(runnerHand);
    expect(state.runner.hand).toHaveLength(5);
  });
});
