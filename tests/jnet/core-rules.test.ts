/**
 * Ported from game.core.rules-test in mtgred/netrunner, pinned at
 * bc9e2fca073a5b21d247e72877804118e81d5472. See tests/jnet/NOTICE.md and
 * docs/jnet-test-ports.md. Upstream unique/region trash OK prompts are
 * jnet UI; this engine trashes the older copy at the uniqueness / region
 * checkpoint (CR 10.3.1d / 8.5.6a) without a confirm step.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
} from "../../src/index.js";
import {
  memoryLimit,
  usedMemory,
} from "../../src/state/turn.js";
import {
  installedCards,
  must,
  newGame,
  playFromHand,
  remotes,
  rezCard,
  settle,
} from "./helpers.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.16");
});

describe("jnet ports — core rules", () => {
  // jnet: game.core.rules-test/corp-rez-unique
  it("rezzing a second Caprice Nisei trashes the first", () => {
    let state = newGame({
      corpHand: ["Caprice Nisei", "Caprice Nisei"],
      corpCredits: 10,
    });
    state = playFromHand(state, "corp", "Caprice Nisei", "HQ");
    state = playFromHand(state, "corp", "Caprice Nisei", "R&D");
    const hq = state.servers.hq!.root[0]!;
    const rd = state.servers.rd!.root[0]!;
    state = rezCard(state, hq);
    expect(state.cards[hq]?.rezzed).toBe(true);
    state = rezCard(state, rd);
    expect(state.cards[rd]?.rezzed).toBe(true);
    expect(state.servers.hq!.root).not.toContain(hq);
    expect(state.corp.discardPile).toContain(hq);
  });

  // jnet: game.core.rules-test/runner-install-program
  it("installing Gordian Blade pays its install cost and uses its MU", () => {
    let state = newGame({
      runnerHand: ["Gordian Blade"],
      runnerCredits: 5,
      startAs: "runner",
    });
    const beforeCredits = state.runner.credits;
    const beforeMu = memoryLimit(state) - usedMemory(state);
    state = playFromHand(state, "runner", "Gordian Blade");
    const gord = installedCards(state, "runner")[0]!;
    expect(state.runner.credits).toBe(beforeCredits - gord.installCost);
    expect(memoryLimit(state) - usedMemory(state)).toBe(
      beforeMu - (gord.memoryCost ?? 0),
    );
  });

  // jnet: game.core.rules-test/installing-second-region-test
  it("installing a second region into a remote trashes the first", () => {
    let state = newGame({
      corpHand: [
        "Crisium Grid",
        "Jinja City Grid",
      ],
      corpCredits: 10,
    });
    state = playFromHand(state, "corp", "Jinja City Grid");
    const remote1 = remotes(state)[0]!.id;
    const crisium = state.corp.hand.find(
      (id) => state.cards[id]?.title === "Crisium Grid",
    )!;
    state = must(settle(state), {
      type: "basic_install",
      cardId: crisium,
      destination: { kind: "remote_root", serverId: remote1 },
    });
    expect(state.servers[remote1]!.root).toHaveLength(1);
    expect(state.cards[state.servers[remote1]!.root[0]!]?.title).toBe(
      "Crisium Grid",
    );
    expect(
      state.corp.discardPile.some(
        (id) => state.cards[id]?.title === "Jinja City Grid",
      ),
    ).toBe(true);
  });

  // jnet: game.core.rules-test/installing-second-unique-trashes-first-unique-test
  it("installing a second Kati Jones trashes the first", () => {
    let state = newGame({
      runnerHand: ["Kati Jones", "Kati Jones"],
      runnerCredits: 20,
      startAs: "runner",
    });
    state = playFromHand(state, "runner", "Kati Jones");
    const first = installedCards(state, "runner")[0]!.id;
    state = playFromHand(state, "runner", "Kati Jones");
    expect(state.runner.discardPile).toContain(first);
    expect(installedCards(state, "runner").map((c) => c.title)).toEqual([
      "Kati Jones",
    ]);
  });
});
