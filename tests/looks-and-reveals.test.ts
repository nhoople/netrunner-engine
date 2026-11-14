/**
 * Looking at cards, searching, and revealing.
 *
 * CR 1.21.1a: a card in a hidden or secret zone is neither faceup nor
 * facedown, so neither player sees a card in a deck.
 * CR 1.21.2: a player who looks at a card sees its front face and does not
 * show it to the other player.
 * CR 1.21.3 / 1.21.3a: a revealed card is shown to all players and is not
 * turned faceup.
 * CR 1.21.6: a looked-at card stays visible to the looker until the ability
 * has finished resolving or the card moves.
 * CR 8.7.1: the player searching a zone looks at all the cards in it.
 * CR 1.15.2: a player chooses the cards their instruction names.
 */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  createInitialState,
  evalEffect,
  getCardDef,
  getPublicView,
  instantiateCard,
  playEffectFromCard,
} from "../src/index.js";
import type { Action, Effect, GameState } from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.23");
});

const RD = ["hedge-fund", "ice-wall", "pad-campaign", "enigma", "project-atlas", "snare"];
const STACK = ["sure-gamble", "corroder", "diesel", "gordian-blade", "clone-chip", "armitage-codebusting"];

function put(s: GameState, defId: string, id: string, zone: string) {
  const card = instantiateCard(defId, id, zone);
  s.cards[id] = card;
  return card;
}

/**
 * A board with six known cards in each deck. The stack cards carry the
 * faceup flag Runner cards are created with, as they do in a dealt match.
 */
function board(): GameState {
  const s = createInitialState();
  s.activeSide = "corp";
  s.timingKey = "corp.takeAction";
  s.corp.clicks = 3;
  s.corp.credits = 9;
  s.runner.credits = 9;
  s.priorityStack = [];
  s.corp.hand = [];
  s.corp.deck = [];
  s.runner.deck = [];
  s.runner.hand = [];
  RD.forEach((defId, i) => {
    put(s, defId, `rd-${i}`, "corp:rd").faceup = false;
    s.corp.deck.push(`rd-${i}`);
  });
  STACK.forEach((defId, i) => {
    put(s, defId, `st-${i}`, "runner:stack");
    s.runner.deck.push(`st-${i}`);
  });
  const corpSource = put(s, "melange-mining-corp", "src-c", "server:remote-1:root");
  corpSource.rezzed = true;
  corpSource.faceup = true;
  s.servers["remote-1"] = { id: "remote-1", kind: "remote", ice: [], root: ["src-c"] };
  s.corp.installed.push("src-c");
  put(s, "kati-jones", "src-r", "runner:installed").faceup = true;
  s.runner.installed.push("src-r");
  return s;
}

function run(s: GameState, sourceId: string, effect: Effect): void {
  const result = evalEffect({ state: s, sourceId }, effect);
  if (!result.ok) throw new Error(result.error);
}

function doKind(s: GameState, sourceId: string, kind: string, rest: Record<string, unknown> = {}): void {
  run(s, sourceId, { op: "do", action: { kind, ...rest } as never });
}

function must(s: GameState, action: Action): GameState {
  const result = applyAction(s, action);
  if (!result.ok) throw new Error(`${s.timingKey}: ${result.error}`);
  return result.state;
}

const choose = (s: GameState, optionId: string): GameState =>
  must(s, { type: "choose_option", optionId });

/** The pending choice as the given seat reads it. */
function seen(s: GameState, side: "corp" | "runner"): string {
  return JSON.stringify(getPublicView(s, side).pendingChoice);
}

/** Ids and titles of the cards in, or taken from, either deck. */
function deckCards(s: GameState): Array<{ id: string; title: string }> {
  return Object.values(s.cards)
    .filter((card) => card.zone === "corp:rd" || card.zone === "runner:stack")
    .map((card) => ({ id: card.id, title: card.title }));
}

const titles = (events: Array<{ cards: Array<{ title: string }> }> | undefined): string[] =>
  (events ?? []).flatMap((event) => event.cards.map((card) => card.title));

describe("looking at cards", () => {
  it("shows the Corp's look at R&D to the Corp only", () => {
    const s = board();
    doKind(s, "src-c", "look_top_n_rd_arrange", { n: 3 });
    expect(s.pendingChoice?.chooser).toBe("corp");
    // The Corp reads the three cards. The Runner reads none of them.
    expect(seen(s, "corp")).toContain("Hedge Fund");
    const runner = seen(s, "runner");
    for (const card of deckCards(s)) {
      expect(runner).not.toContain(card.title);
      expect(runner).not.toContain(`"${card.id}"`);
    }
    expect(getPublicView(s, "runner").pendingChoice?.options.map((o) => o.label)).toEqual([
      "Place a looked card on R&D next",
      "Place a looked card on R&D next",
      "Place a looked card on R&D next",
    ]);
    // The record of the look is the looker's alone, and the cards are not faceup.
    expect(titles(getPublicView(s, "corp").looks)).toEqual(["Hedge Fund", "Ice Wall", "PAD Campaign"]);
    expect(getPublicView(s, "runner").looks).toEqual([]);
    expect(s.reveals ?? []).toEqual([]);
    for (const id of ["rd-0", "rd-1", "rd-2"]) {
      expect(s.cards[id]?.lookedBy).toBe("corp");
      expect(s.cards[id]?.faceup).toBe(false);
    }
    // The log counts the cards and does not name them.
    expect(s.log.join("\n")).toContain("the Corp looks at 3 card(s) (CR 1.21.2)");
    expect(s.log.join("\n")).not.toContain("Hedge Fund");
  });

  it("stops the look when the ability has finished (CR 1.21.6)", () => {
    let s = board();
    doKind(s, "src-c", "look_top_n_rd_arrange", { n: 2 });
    s = choose(s, "rd-arrange:rd-1");
    // Still arranging: the second choice is part of the same look.
    expect(s.pendingChoice?.look).toBe(true);
    expect(seen(s, "runner")).not.toContain("Hedge Fund");
    s = choose(s, "rd-arrange:rd-0");
    expect(s.pendingChoice).toBeFalsy();
    expect(s.corp.deck).toHaveLength(6);
    for (const card of Object.values(s.cards)) expect(card.lookedBy).toBeUndefined();
    for (const id of s.corp.deck) expect(s.cards[id]?.faceup).toBe(false);
  });

  it("shows the Runner's look at R&D to the Runner only, not to the Corp who owns the cards", () => {
    const s = board();
    doKind(s, "src-r", "look_top_n_rd_arrange", { n: 3 });
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(seen(s, "runner")).toContain("Hedge Fund");
    const corp = seen(s, "corp");
    for (const card of deckCards(s)) {
      expect(corp).not.toContain(card.title);
      expect(corp).not.toContain(`"${card.id}"`);
    }
    expect(titles(getPublicView(s, "runner").looks)).toEqual(["Hedge Fund", "Ice Wall", "PAD Campaign"]);
    expect(getPublicView(s, "corp").looks).toEqual([]);
  });

  it("has the named player look when the source belongs to the other one", () => {
    // Insight is the Runner's event; the Corp looks and arranges.
    const s = board();
    doKind(s, "src-r", "look_top_n_rd_arrange", { n: 2, looker: "corp" });
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(titles(getPublicView(s, "corp").looks)).toEqual(["Hedge Fund", "Ice Wall"]);
    expect(getPublicView(s, "runner").looks).toEqual([]);
    expect(seen(s, "runner")).not.toContain("Hedge Fund");
    const arranged = choose(choose(s, "rd-arrange:rd-1"), "rd-arrange:rd-0");
    expect(arranged.turn.rdLooker).toBeUndefined();
  });

  it("hides a label that names the looked card when the card stays in R&D", () => {
    for (const kind of [
      "look_top_rd_may_trash",
      "look_top_rd_may_bottom",
      "look_top_rd_may_advance_may_bottom",
      "look_top_rd_may_trash_if_do_archives_to_hq",
    ]) {
      const s = board();
      doKind(s, "src-c", kind);
      expect(seen(s, "corp"), kind).toContain("Hedge Fund");
      expect(seen(s, "runner"), kind).not.toContain("Hedge Fund");
      expect(titles(getPublicView(s, "corp").looks), kind).toEqual(["Hedge Fund"]);
      expect(s.log.join("\n"), kind).not.toContain("Hedge Fund");
    }
  });

  it("tells only the looker what a look with nothing to choose showed", () => {
    // Spy Camera: the Runner looks at the top card of R&D.
    const s = board();
    doKind(s, "src-r", "look_top_1_rd");
    expect(s.pendingChoice).toBeFalsy();
    expect(titles(getPublicView(s, "runner").looks)).toEqual(["Hedge Fund"]);
    expect(getPublicView(s, "corp").looks).toEqual([]);
    expect(s.log.join("\n")).not.toContain("Hedge Fund");

    const stack = board();
    doKind(stack, "src-r", "look_at_top_of_stack");
    expect(titles(getPublicView(stack, "runner").looks)).toEqual(["Sure Gamble"]);
    expect(getPublicView(stack, "corp").looks).toEqual([]);
  });

  it("does not show the Corp a card in the stack, whatever its faceup flag says (CR 1.21.1a)", () => {
    const s = board();
    expect(s.cards["st-1"]?.faceup).toBe(true);
    doKind(s, "src-r", "search_stack_program_install");
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(seen(s, "runner")).toContain("Corroder");
    const corp = seen(s, "corp");
    for (const card of deckCards(s)) {
      expect(corp).not.toContain(card.title);
      expect(corp).not.toContain(`"${card.id}"`);
    }
  });

  it("does not show the Runner the cards the Corp searches through (CR 8.7.1)", () => {
    const s = board();
    doKind(s, "src-c", "search_rd_to_hq", { amount: 1 });
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(seen(s, "corp")).toContain("Hedge Fund");
    const runner = seen(s, "runner");
    for (const card of deckCards(s)) {
      expect(runner).not.toContain(card.title);
      expect(runner).not.toContain(`"${card.id}"`);
    }
    // The searching player is looking at the cards they may take, and stops
    // when the search is done (CR 1.21.6).
    const candidates = s.pendingChoice!.options
      .map((option) => option.id.split(":")[1])
      .filter((id): id is string => Boolean(id && s.cards[id]));
    expect(candidates.length).toBeGreaterThan(0);
    for (const id of candidates) expect(s.cards[id]?.lookedBy, id).toBe("corp");
    const done = choose(s, s.pendingChoice!.options[0]!.id);
    expect(Object.values(done.cards).filter((card) => card.lookedBy)).toEqual([]);
  });

  it("leaves no card in R&D or HQ faceup once nothing is pending, and leaves the Runner's cards as dealt", () => {
    let s = board();
    doKind(s, "src-c", "search_rd_to_hq", { amount: 1 });
    s = choose(s, "choose-card:rd-3");
    expect(s.pendingChoice).toBeFalsy();
    expect(s.corp.hand).toContain("rd-3");
    for (const id of [...s.corp.deck, ...s.corp.hand]) {
      expect(s.cards[id]?.faceup, id).toBe(false);
    }
    // A Runner card keeps the flag it was dealt with, so one drawn and then
    // installed or trashed by any path is faceup (CR 8.5.4, CR 8.1.4c).
    for (const id of s.runner.deck) expect(s.cards[id]?.faceup, id).toBe(true);
  });

  it("offers a reveal without naming the card the player has not seen", () => {
    // Bug: the Runner pays before the drawn card is shown.
    const s = board();
    put(s, "hedge-fund", "drawn-1", "corp:hq").faceup = false;
    s.corp.hand = ["drawn-1"];
    s.turn.pendingCorpDrawnCardId = "drawn-1";
    doKind(s, "src-r", "may_pay_reveal_top");
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(JSON.stringify(s.pendingChoice)).not.toContain("Hedge Fund");
    const paid = choose(s, "bug-pay");
    expect(titles(paid.reveals)).toEqual(["Hedge Fund"]);
    expect(paid.runner.credits).toBe(7);
    expect(paid.cards["drawn-1"]?.faceup).toBe(false);
  });
});

describe("looks whose kind is not named for looking", () => {
  it("shows the top 3 cards of R&D to the Runner alone when Keyhole resolves (CR 1.21.2)", () => {
    let s = board();
    doKind(s, "src-r", "breach_instead_keyhole");
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(seen(s, "runner")).toContain("Trash Hedge Fund");
    const corp = seen(s, "corp");
    for (const id of ["rd-0", "rd-1", "rd-2"]) {
      expect(s.cards[id]?.lookedBy, id).toBe("runner");
      expect(s.cards[id]?.faceup, id).toBe(false);
      expect(corp).not.toContain(`"${id}"`);
      expect(corp).not.toContain(s.cards[id]!.title);
    }
    expect(titles(getPublicView(s, "runner").looks)).toEqual(["Hedge Fund", "Ice Wall", "PAD Campaign"]);
    expect(getPublicView(s, "corp").looks).toEqual([]);

    // The Runner saw the card it trashes, so it is faceup in Archives
    // (CR 4.4.6b). The other two go back unseen by the Corp.
    s = choose(s, "keyhole-trash:rd-1");
    expect(s.cards["rd-1"]?.zone).toBe("corp:archives");
    expect(s.cards["rd-1"]?.faceup).toBe(true);
    for (const id of ["rd-0", "rd-2"]) {
      expect(s.corp.deck).toContain(id);
      expect(s.cards[id]?.lookedBy).toBeUndefined();
      expect(s.cards[id]?.faceup).toBe(false);
    }
  });

  it("shows the top 3 cards of R&D to the Corp alone for Accelerated Diagnostics (CR 1.21.2, CR 4.4.6b)", () => {
    let s = board();
    doKind(s, "src-c", "accelerated_diagnostics");
    expect(titles(getPublicView(s, "corp").looks)).toEqual(["Hedge Fund", "Ice Wall", "PAD Campaign"]);
    expect(getPublicView(s, "runner").looks).toEqual([]);
    expect(seen(s, "corp")).toContain("Play Hedge Fund");
    expect(seen(s, "runner")).not.toContain("Hedge Fund");
    // The Corp plays Hedge Fund. The two it did not play are trashed
    // facedown, and the log does not name them.
    s = choose(s, "play-looked:rd-0");
    for (const id of ["rd-1", "rd-2"]) {
      expect(s.cards[id]?.zone, id).toBe("corp:archives");
      expect(s.cards[id]?.faceup, id).toBe(false);
      expect(s.log.join("\n")).not.toContain(s.cards[id]!.title);
    }
    expect(s.log.join("\n")).toContain("Hedge Fund");
  });
});

describe("every look and search kind", () => {
  const kinds = [
    ...new Set(
      [...readFileSync("src/effects/ir.ts", "utf8").matchAll(/"((?:look|search)_[a-z0-9_]+)"/g)].map(
        (match) => match[1]!,
      ),
    ),
  ];

  it("lists the kinds", () => {
    expect(kinds.length).toBeGreaterThan(40);
  });

  it("opens no choice that shows the other player a card from a deck", () => {
    const leaks: string[] = [];
    let opened = 0;
    for (const kind of kinds) {
      for (const sourceId of ["src-c", "src-r"]) {
        const s = board();
        let result;
        try {
          result = evalEffect(
            { state: s, sourceId },
            { op: "do", action: { kind, n: 3, amount: 3, x: 3 } as never },
          );
        } catch {
          // The kind needs arguments this sweep does not supply.
          continue;
        }
        const choice = s.pendingChoice;
        if (!result.ok || !choice) continue;
        opened += 1;
        const other = choice.chooser === "corp" ? "runner" : "corp";
        const shown = new Set(titles(s.reveals));
        const view = seen(s, other);
        for (const card of deckCards(s)) {
          if (shown.has(card.title)) continue;
          if (view.includes(card.title) || view.includes(`"${card.id}"`)) {
            leaks.push(`${kind} from ${sourceId}: ${other} reads ${card.title}`);
          }
        }
      }
    }
    expect(leaks).toEqual([]);
    expect(opened).toBeGreaterThan(20);
  });
});

describe("revealing cards", () => {
  it("has the Corp choose the HQ cards Celebrity Gift reveals (CR 1.15.2)", () => {
    let s = board();
    put(s, "celebrity-gift", "gift-1", "corp:play-area").faceup = true;
    for (const [defId, id] of [
      ["hedge-fund", "hq-1"],
      ["ice-wall", "hq-2"],
      ["project-atlas", "hq-3"],
    ]) {
      put(s, defId!, id!, "corp:hq").faceup = false;
      s.corp.hand.push(id!);
    }
    run(s, "gift-1", playEffectFromCard(getCardDef("celebrity-gift"))!);
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "choose-card:hq-1",
      "choose-card:hq-2",
      "choose-card:hq-3",
      "choose-cards-done",
    ]);
    // The Runner does not read the Corp's hand in the offer.
    expect(seen(s, "runner")).not.toContain("Project Atlas");
    s = choose(s, "choose-card:hq-1");
    s = choose(s, "choose-card:hq-2");
    s = choose(s, "choose-cards-done");
    expect(titles(s.reveals)).toEqual(["Hedge Fund", "Ice Wall"]);
    expect(s.corp.credits).toBe(13);
    expect(s.corp.hand).toEqual(["hq-1", "hq-2", "hq-3"]);
    for (const id of s.corp.hand) expect(s.cards[id]?.faceup).toBe(false);
  });

  it("reveals all of HQ for Executive Wiretaps with nothing to choose", () => {
    const s = board();
    put(s, "executive-wiretaps", "taps-1", "runner:play-area");
    for (const [defId, id] of [
      ["hedge-fund", "hq-1"],
      ["ice-wall", "hq-2"],
    ]) {
      put(s, defId!, id!, "corp:hq").faceup = false;
      s.corp.hand.push(id!);
    }
    run(s, "taps-1", playEffectFromCard(getCardDef("executive-wiretaps"))!);
    expect(s.pendingChoice).toBeFalsy();
    expect(titles(s.reveals)).toEqual(["Hedge Fund", "Ice Wall"]);
    expect(s.corp.credits).toBe(9);
  });

  it("records the cards a reveal shows, for both players", () => {
    // Inject: the top 4 cards of the stack.
    const inject = board();
    doKind(inject, "src-r", "reveal_top_four");
    expect(titles(inject.reveals)).toEqual(["Sure Gamble", "Corroder", "Diesel", "Gordian Blade"]);
    expect(titles(getPublicView(inject, "corp").reveals)).toEqual(titles(inject.reveals));

    // Levy Advanced Research Lab: the top 4 cards of the stack.
    const levy = board();
    doKind(levy, "src-r", "reveal_levy_advanced_research_lab");
    expect(titles(levy.reveals)).toEqual(["Sure Gamble", "Corroder", "Diesel", "Gordian Blade"]);

    // Angel Arena: the top card of the stack.
    const arena = board();
    doKind(arena, "src-r", "reveal_top_may_bottom");
    expect(titles(arena.reveals)).toEqual(["Sure Gamble"]);

    // Bamboo Dome: the top 3 cards of R&D.
    const dome = board();
    doKind(dome, "src-c", "reveal_top_3");
    expect(titles(dome.reveals)).toEqual(["Hedge Fund", "Ice Wall", "PAD Campaign"]);

    // The whole grip.
    const grip = board();
    put(grip, "sure-gamble", "g-1", "runner:grip");
    put(grip, "diesel", "g-2", "runner:grip");
    grip.runner.hand = ["g-1", "g-2"];
    doKind(grip, "src-c", "reveal_grip");
    expect(titles(grip.reveals)).toEqual(["Sure Gamble", "Diesel"]);

    // A card searched for by type goes to HQ revealed, and is hidden there.
    const search = board();
    doKind(search, "src-c", "search_rd_type_to_hq", { cardType: "ice" });
    expect(titles(search.reveals)).toEqual(["Ice Wall"]);
    expect(search.cards["rd-1"]?.faceup).toBe(false);
  });

  it("reveals a card installed by 'install and rez' that could not be rezzed, and leaves it facedown (CR 1.21.3a)", () => {
    const s = board();
    s.corp.credits = 0;
    put(s, "pad-campaign", "pad-1", "corp:hq").faceup = false;
    s.corp.hand = ["pad-1"];
    doKind(s, "src-c", "install_and_rez_hq_card_with_discount", { cardId: "pad-1", totalDiscount: 0 });
    const card = s.cards["pad-1"]!;
    expect(card.zone.startsWith("server:")).toBe(true);
    expect(card.rezzed).toBe(false);
    expect(card.faceup).toBe(false);
    expect(titles(s.reveals)).toEqual(["PAD Campaign"]);
    // The Runner's board shows an unrezzed card with no title.
    const root = getPublicView(s, "runner").servers.flatMap((server) => server.root);
    expect(root.find((entry) => entry.id === "pad-1")?.title).toBeNull();
  });

  it("keeps a revealed card in the record and nowhere else once it is back in the deck (CR 1.21.6)", () => {
    let s = board();
    doKind(s, "src-r", "reveal_top_may_bottom");
    s = choose(s, "angel-keep");
    expect(s.runner.deck[0]).toBe("st-0");
    const title = s.cards["st-0"]!.title;
    expect(titles(s.reveals)).toEqual([title]);
    // The reveal is in the record and the log. The board does not show the card.
    const { reveals: _record, log: _log, ...rest } = getPublicView(s, "corp");
    expect(JSON.stringify(rest)).not.toContain(title);
    expect(JSON.stringify(rest)).not.toContain(`"st-0"`);
  });

  it("has the Corp look, not the Runner, when Insight is played", () => {
    const def = getCardDef("insight");
    const effect = playEffectFromCard(def)!;
    const s = board();
    put(s, "insight", "insight-1", "runner:play-area");
    run(s, "insight-1", effect);
    expect(s.pendingChoice?.chooser).toBe("corp");
    let t = choose(s, "arrange");
    // The Corp arranges. The Runner, whose event it is, sees nothing yet.
    expect(t.pendingChoice?.chooser).toBe("corp");
    expect(seen(t, "runner")).not.toContain("Hedge Fund");
    expect(getPublicView(t, "runner").looks).toEqual([]);
    expect(titles(getPublicView(t, "corp").looks)).toEqual([
      "Hedge Fund",
      "Ice Wall",
      "PAD Campaign",
      "Enigma",
    ]);
    expect(t.reveals ?? []).toEqual([]);
    for (const title of ["Enigma", "PAD Campaign", "Ice Wall", "Hedge Fund"]) {
      const option = t.pendingChoice?.options.find((o) => o.label.includes(title));
      t = choose(t, option!.id);
    }
    // Then the top 4 cards are revealed to both players, in the Corp's order.
    expect(titles(t.reveals)).toEqual(["Enigma", "PAD Campaign", "Ice Wall", "Hedge Fund"]);
    for (const id of t.corp.deck) expect(t.cards[id]?.faceup).toBe(false);
  });
});
