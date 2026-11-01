/**
 * Ported from game.cards.basic-test in mtgred/netrunner, pinned at
 * bc9e2fca073a5b21d247e72877804118e81d5472. See tests/jnet/NOTICE.md and
 * docs/jnet-test-ports.md. Titles state the observable board result; the
 * upstream deftest name sits in the `// jnet:` comment above each test.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
} from "../../src/index.js";
import {
  advance,
  firstRemote,
  iceCard,
  installedCards,
  must,
  newGame,
  playFromHand,
  qty,
  rootCard,
  settle,
  takeCredits,
} from "./helpers.js";
import type { GameState } from "../../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.17");
});

function byTitle(state: GameState, title: string) {
  const card = Object.values(state.cards).find((c) => c.title === title);
  if (!card) throw new Error(`${title} is not on the board`);
  return card;
}

describe("jnet ports — basic", () => {
  // jnet: game.cards.basic-test/corp-basic-actions-gain-1-credit
  it("Corp gains 1 credit from the basic credit action", () => {
    let state = newGame();
    const before = state.corp.credits;
    state = must(state, { type: "basic_gain_credit" });
    expect(state.corp.credits).toBe(before + 1);
  });

  // jnet: game.cards.basic-test/corp-basic-actions-draw-card
  it("Corp draws 1 card from the basic draw action", () => {
    let state = newGame({ corpDeck: qty("Hedge Fund", 10) });
    const before = state.corp.hand.length;
    state = must(state, { type: "basic_draw" });
    expect(state.corp.hand.length).toBe(before + 1);
  });

  // jnet: game.cards.basic-test/corp-basic-actions-install-agenda
  it("Corp installs Project Beale in a new remote", () => {
    const state = playFromHand(
      newGame({ corpHand: ["Project Beale"] }),
      "corp",
      "Project Beale",
    );
    expect(rootCard(state, firstRemote(state)).title).toBe("Project Beale");
  });

  // jnet: game.cards.basic-test/corp-basic-actions-install-asset
  it("Corp installs PAD Campaign in a new remote", () => {
    const state = playFromHand(
      newGame({ corpHand: ["PAD Campaign"] }),
      "corp",
      "PAD Campaign",
    );
    expect(rootCard(state, firstRemote(state)).title).toBe("PAD Campaign");
  });

  // jnet: game.cards.basic-test/corp-basic-actions-install-upgrade
  it("Corp installs Breaker Bay Grid in a new remote", () => {
    const state = playFromHand(
      newGame({ corpHand: ["Breaker Bay Grid"] }),
      "corp",
      "Breaker Bay Grid",
    );
    expect(rootCard(state, firstRemote(state)).title).toBe("Breaker Bay Grid");
  });

  // jnet: game.cards.basic-test/corp-basic-actions-install-ice
  it("Corp installs Ice Wall protecting a new remote", () => {
    const state = playFromHand(newGame({ corpHand: ["Ice Wall"] }), "corp", "Ice Wall");
    expect(iceCard(state, firstRemote(state)).title).toBe("Ice Wall");
  });

  // jnet: game.cards.basic-test/corp-basic-actions-play-operation
  it("Hedge Fund raises Corp credits by 4 after its play cost", () => {
    let state = newGame({ corpHand: ["Hedge Fund"] });
    const before = state.corp.credits;
    state = playFromHand(state, "corp", "Hedge Fund");
    expect(state.corp.credits).toBe(before + 4);
  });

  // jnet: game.cards.basic-test/corp-basic-actions-advance-installed-ice
  it("Corp places 1 advancement counter on Ice Wall", () => {
    let state = playFromHand(newGame({ corpHand: ["Ice Wall"] }), "corp", "Ice Wall", "HQ");
    const ice = iceCard(state, state.servers.hq!);
    state = advance(state, ice.id);
    expect(state.cards[ice.id]?.advancementCounters ?? 0).toBe(1);
  });

  // jnet: game.cards.basic-test/corp-basic-actions-advance-agenda
  it("Corp places 1 advancement counter on Project Beale", () => {
    let state = playFromHand(
      newGame({ corpHand: ["Project Beale"] }),
      "corp",
      "Project Beale",
    );
    const agenda = rootCard(state, firstRemote(state));
    state = advance(state, agenda.id);
    expect(state.cards[agenda.id]?.advancementCounters ?? 0).toBe(1);
  });

  // jnet: game.cards.basic-test/corp-basic-actions-trash-resource-if-runner-is-tagged
  it("Corp trashes Fan Site while the Runner is tagged", () => {
    let state = newGame({
      startAs: "runner",
      runnerHand: ["Fan Site"],
    });
    state = playFromHand(state, "runner", "Fan Site");
    const fanSite = installedCards(state, "runner").find(
      (c) => c.title === "Fan Site",
    )!;
    state.runner.tags = 1;
    state = takeCredits(state, "runner");
    state = must(state, { type: "basic_trash_resource", cardId: fanSite.id });
    expect(state.runner.discardPile).toContain(fanSite.id);
  });

  // jnet: game.cards.basic-test/corp-basic-actions-purge
  it("Corp purges virus counters, trashing Clot, and Botulus regains 1 counter next turn", () => {
    let state = newGame({
      corpHand: ["Ice Wall"],
      runnerHand: ["Clot", "Imp", "Botulus"],
      runnerCredits: 10,
    });
    state = playFromHand(state, "corp", "Ice Wall", "HQ");
    state = takeCredits(state, "corp");
    state = playFromHand(state, "runner", "Clot");
    state = playFromHand(state, "runner", "Imp");
    state = playFromHand(state, "runner", "Botulus", "Ice Wall");
    expect(byTitle(state, "Imp").virusCounters ?? 0).toBe(2);
    expect(byTitle(state, "Botulus").virusCounters ?? 0).toBe(1);
    state = takeCredits(state, "runner");
    state = must(settle(state), { type: "basic_purge_virus" });
    expect(state.runner.discardPile.map((id) => state.cards[id]?.title)).toEqual([
      "Clot",
    ]);
    expect(byTitle(state, "Imp").virusCounters ?? 0).toBe(0);
    expect(byTitle(state, "Botulus").virusCounters ?? 0).toBe(0);
    state = takeCredits(state, "corp");
    expect(byTitle(state, "Botulus").virusCounters ?? 0).toBe(1);
  });

  // jnet: game.cards.basic-test/runner-basic-actions-gain-1-credit
  it("Runner gains 1 credit from the basic credit action", () => {
    let state = newGame({ startAs: "runner" });
    const before = state.runner.credits;
    state = must(state, { type: "basic_gain_credit" });
    expect(state.runner.credits).toBe(before + 1);
  });

  // jnet: game.cards.basic-test/runner-basic-actions-draw-card
  it("Runner draws 1 card from the basic draw action", () => {
    let state = newGame({
      startAs: "runner",
      runnerDeck: qty("Sure Gamble", 10),
    });
    const before = state.runner.hand.length;
    state = must(state, { type: "basic_draw" });
    expect(state.runner.hand.length).toBe(before + 1);
  });

  // jnet: game.cards.basic-test/runner-basic-actions-install-program
  it("Runner installs Misdirection", () => {
    const state = playFromHand(
      newGame({ startAs: "runner", runnerHand: ["Misdirection"] }),
      "runner",
      "Misdirection",
    );
    expect(installedCards(state, "runner").map((c) => c.title)).toContain(
      "Misdirection",
    );
  });

  // jnet: game.cards.basic-test/runner-basic-actions-install-resource
  it("Runner installs Fan Site", () => {
    const state = playFromHand(
      newGame({ startAs: "runner", runnerHand: ["Fan Site"] }),
      "runner",
      "Fan Site",
    );
    expect(installedCards(state, "runner").map((c) => c.title)).toContain("Fan Site");
  });

  // jnet: game.cards.basic-test/runner-basic-actions-install-hardware
  it("Runner installs Bookmark", () => {
    const state = playFromHand(
      newGame({ startAs: "runner", runnerHand: ["Bookmark"] }),
      "runner",
      "Bookmark",
    );
    expect(installedCards(state, "runner").map((c) => c.title)).toContain("Bookmark");
  });

  // jnet: game.cards.basic-test/runner-basic-actions-play-operation
  it("Sure Gamble raises Runner credits by 4 after its play cost", () => {
    let state = newGame({ startAs: "runner", runnerHand: ["Sure Gamble"] });
    const before = state.runner.credits;
    state = playFromHand(state, "runner", "Sure Gamble");
    expect(state.runner.credits).toBe(before + 4);
  });

  // jnet: game.cards.basic-test/runner-basic-actions-run-hq
  it("Runner starts a run on HQ", () => {
    const state = must(newGame({ startAs: "runner" }), {
      type: "basic_run",
      serverId: "hq",
    });
    expect(state.run?.attackedServerId).toBe("hq");
  });

  // jnet: game.cards.basic-test/runner-basic-actions-remove-tag
  it("Runner removes 1 tag with the basic remove-tag action", () => {
    let state = newGame({ startAs: "runner" });
    state.runner.tags = 1;
    state = must(state, { type: "basic_remove_tag" });
    expect(state.runner.tags).toBe(0);
  });
});
