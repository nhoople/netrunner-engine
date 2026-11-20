/**
 * Fix-now findings from the game's visibility scenarios (game #297).
 * Each test plays the card through `applyAction` and asserts state.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  autoWalk,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  fx,
  instantiateCard,
} from "../src/index.js";
import type { Action, GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.25");
});

function must(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok)
    throw new Error(`${result.error} ${JSON.stringify(result.cites)}`);
  return result.state;
}

/** A Runner host with facedown grip cards on it, in the Runner's action window. */
function hostWithFacedownCards(
  hostDef: string,
  hostedDefs: string[],
): GameState {
  const s = createInitialState();
  // The default grip Marjanah is marked rezzed (CR 8.1.4f); clear it.
  s.cards["runner-program-1"]!.rezzed = false;
  const host = instantiateCard(hostDef, "host-1", "runner:installed");
  s.cards["host-1"] = host;
  s.runner.installed.push("host-1");
  host.hostedCardIds = hostedDefs.map((_, i) => `h-${i}`);
  hostedDefs.forEach((def, i) => {
    const card = instantiateCard(def, `h-${i}`, "hosted:host-1");
    card.hostId = "host-1";
    card.faceup = false;
    s.cards[`h-${i}`] = card;
  });
  s.activeSide = "runner";
  s.timingKey = "runner.actionPaw";
  return s;
}

describe("[trash] abilities that act on hosted cards set them aside (CR 9.5.5)", () => {
  it("Read-Write Share [trash] shuffles the facedown hosted cards into the stack, not the heap (CR 9.5.5, 4.1.5)", () => {
    let s = hostWithFacedownCards("read-write-share", [
      "diesel",
      "sure-gamble",
    ]);
    const deckBefore = s.runner.deck.length;
    s = must(s, {
      type: "use_paid_ability",
      cardId: "host-1",
      abilityId: "read-write-share-shuffle",
    });
    expect(s.cards["host-1"]?.zone).toBe("runner:heap");
    for (const id of ["h-0", "h-1"]) {
      expect(s.cards[id]?.zone).toBe("runner:stack");
      expect(s.cards[id]?.hostId).toBeUndefined();
      expect(s.cards[id]?.faceup).toBe(false);
      expect(s.runner.discardPile).not.toContain(id);
    }
    expect(s.runner.deck).toEqual(expect.arrayContaining(["h-0", "h-1"]));
    expect(s.runner.deck).toHaveLength(deckBefore + 2);
    expect(s.runner.setAside ?? []).toEqual([]);
    expect(s.cards["host-1"]?.hostedCardIds ?? []).toEqual([]);
    expect(s.resolvingSetAsideHosted).toBeUndefined();
  });

  it("Bookmark [trash] adds the hosted cards to the grip, not the heap (CR 9.5.5)", () => {
    let s = hostWithFacedownCards("bookmark", [
      "diesel",
      "sure-gamble",
      "dirty-laundry",
    ]);
    const handBefore = s.runner.hand.length;
    s = must(s, {
      type: "use_paid_ability",
      cardId: "host-1",
      abilityId: "bookmark-to-grip-trash",
    });
    expect(s.cards["host-1"]?.zone).toBe("runner:heap");
    for (const id of ["h-0", "h-1", "h-2"]) {
      expect(s.cards[id]?.zone).toBe("runner:grip");
      expect(s.cards[id]?.hostId).toBeUndefined();
      expect(s.runner.discardPile).not.toContain(id);
    }
    expect(s.runner.hand).toEqual(
      expect.arrayContaining(["h-0", "h-1", "h-2"]),
    );
    expect(s.runner.hand).toHaveLength(handBefore + 3);
    expect(s.runner.setAside ?? []).toEqual([]);
    expect(s.resolvingSetAsideHosted).toBeUndefined();
  });
});

describe("Touch-ups (CR 1.15.2, 1.21.3)", () => {
  function gripOf(s: GameState, cards: Array<[string, string]>): void {
    for (const id of s.runner.hand) delete s.cards[id];
    s.runner.hand = [];
    for (const [defId, id] of cards) {
      s.cards[id] = instantiateCard(defId, id, "runner:grip");
      s.runner.hand.push(id);
    }
  }

  function touchUpsChoosesType(s: GameState, cardType: string): GameState {
    s.cards["tu-1"] = instantiateCard("touch-ups", "tu-1", "corp:play-area");
    s.corp.playArea = [...(s.corp.playArea ?? []), "tu-1"];
    const r = evalEffect(
      { state: s, sourceId: "tu-1" },
      fx.do({ kind: "choose_type_shuffle_grip", maxCards: 2 } as never),
    );
    if (!r.ok) throw new Error(r.error);
    return must(s, { type: "choose_option", optionId: `type:${cardType}` });
  }

  it("the Corp chooses up to 2 revealed cards of the type, and they are shuffled into the stack", () => {
    let s = createInitialState();
    gripOf(s, [
      ["diesel", "g-1"],
      ["sure-gamble", "g-2"],
      ["dirty-laundry", "g-3"],
      ["corroder", "g-4"],
    ]);
    const deckBefore = s.runner.deck.length;
    s = touchUpsChoosesType(s, "event");
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(
      s.reveals
        ?.at(-1)
        ?.cards.map((c) => c.defId)
        .sort(),
    ).toEqual(["corroder", "diesel", "dirty-laundry", "sure-gamble"]);
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["choose-card:g-1", "choose-card:g-3"]),
    );
    expect(s.pendingChoice?.options.map((o) => o.id)).not.toContain(
      "choose-card:g-4",
    );
    s = must(s, { type: "choose_option", optionId: "choose-card:g-1" });
    expect(s.pendingChoice?.chooser).toBe("corp");
    s = must(s, { type: "choose_option", optionId: "choose-card:g-3" });
    expect(s.pendingChoice).toBeNull();
    expect(s.runner.hand).toEqual(["g-2", "g-4"]);
    expect(s.runner.deck).toEqual(expect.arrayContaining(["g-1", "g-3"]));
    expect(s.runner.deck).toHaveLength(deckBefore + 2);
    expect(s.cards["g-1"]?.zone).toBe("runner:stack");
  });

  it("reveals the grip even when no card has the chosen type (CR 1.21.3)", () => {
    let s = createInitialState();
    gripOf(s, [["diesel", "g-1"]]);
    s = touchUpsChoosesType(s, "hardware");
    expect(s.pendingChoice).toBeNull();
    expect(s.reveals?.at(-1)?.cards.map((c) => c.defId)).toEqual(["diesel"]);
    expect(s.runner.hand).toEqual(["g-1"]);
  });
});

describe("Invasion of Privacy reveals the grip (CR 1.21.3, 1.21.6)", () => {
  it("reveals through state.reveals, lets the Corp trash a revealed event, and leaves no card faceup", () => {
    let s = createInitialState();
    for (const id of s.runner.hand) delete s.cards[id];
    s.runner.hand = [];
    for (const [defId, id] of [
      ["daily-casts", "g-1"],
      ["sure-gamble", "g-2"],
      ["corroder", "g-3"],
    ] as const) {
      const card = instantiateCard(defId, id, "runner:grip");
      card.faceup = false;
      s.cards[id] = card;
      s.runner.hand.push(id);
    }
    s.cards["iop-1"] = instantiateCard(
      "invasion-of-privacy",
      "iop-1",
      "corp:play-area",
    );
    s.corp.playArea = [...(s.corp.playArea ?? []), "iop-1"];
    s.turn.lastTraceExcess = 2;
    const r = evalEffect(
      { state: s, sourceId: "iop-1" },
      fx.do({ kind: "invasion_of_privacy_success" } as never),
    );
    if (!r.ok) throw new Error(r.error);

    expect(
      s.reveals
        ?.at(-1)
        ?.cards.map((c) => c.defId)
        .sort(),
    ).toEqual(["corroder", "daily-casts", "sure-gamble"]);
    for (const id of ["g-1", "g-2", "g-3"]) {
      expect(s.cards[id]?.revealing).toBe(true);
      expect(s.cards[id]?.faceup).toBe(false);
    }
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "trash:g-1",
      "trash:g-2",
      "done",
    ]);

    s = must(s, { type: "choose_option", optionId: "trash:g-1" });
    s = must(s, { type: "choose_option", optionId: "done" });
    expect(s.pendingChoice).toBeNull();
    expect(s.runner.discardPile).toContain("g-1");
    expect(s.runner.hand).toEqual(["g-2", "g-3"]);
    for (const id of ["g-2", "g-3"]) {
      expect(s.cards[id]?.faceup).toBe(false);
      expect(s.cards[id]?.revealing).toBeUndefined();
    }
  });
});

describe("Apex: Invasive Predator turn-begin ability (CR 9.6.6)", () => {
  function apexTurnBegins(
    extraInstalled: string[] = [],
    heap: string[] = [],
  ): GameState {
    const s = createInitialState();
    s.cards["runner-program-1"]!.rezzed = false;
    delete s.cards[s.runner.identityId];
    s.cards["apex-1"] = instantiateCard(
      "apex-invasive-predator",
      "apex-1",
      "runner:identity",
    );
    s.runner.identityId = "apex-1";
    for (const defId of extraInstalled) {
      const id = `${defId}-1`;
      s.cards[id] = instantiateCard(defId, id, "runner:installed");
      s.runner.installed.push(id);
    }
    for (const defId of heap) {
      const id = `${defId}-heap`;
      const card = instantiateCard(defId, id, "runner:heap");
      card.faceup = true;
      s.cards[id] = card;
      s.runner.discardPile.push(id);
    }
    s.runner.credits = 5;
    s.activeSide = "runner";
    s.timingKey = "runner.turnBegins";
    autoWalk(s);
    return s;
  }

  function answer(s: GameState, optionId: string): GameState {
    const next = must(s, { type: "choose_option", optionId });
    autoWalk(next);
    return next;
  }

  const apexChoice = (s: GameState) =>
    s.pendingChoice?.sourceId === "apex-1" &&
    s.pendingChoice.options.some((o) => o.id === "decline");

  it("Decline ends the ability once; the turn moves on past turn begin", () => {
    let s = apexTurnBegins();
    expect(apexChoice(s)).toBe(true);
    s = answer(s, "decline");
    expect(s.pendingChoice).toBeNull();
    expect(s.timingKey).not.toBe("runner.turnBegins");
    expect(
      s.log.filter((l) =>
        l.includes("Apex: Invasive Predator becomes pending"),
      ),
    ).toHaveLength(1);
  });

  it("installing a grip card facedown resolves once too", () => {
    let s = apexTurnBegins();
    s = answer(s, "accept");
    while (s.pendingChoice && !apexChoice(s)) {
      s = answer(s, s.pendingChoice.options[0]!.id);
    }
    expect(apexChoice(s)).toBe(false);
    expect(s.timingKey).not.toBe("runner.turnBegins");
    expect(s.cards["runner-program-1"]?.zone).toBe("runner:installed");
    expect(s.cards["runner-program-1"]?.faceup).toBe(false);
  });

  it("another turn-begin ability still resolves after Apex's choice (Drug Dealer)", () => {
    let s = apexTurnBegins(["drug-dealer"]);
    for (let i = 0; i < 6 && s.pendingChoice; i += 1) {
      const order = s.pendingChoice.options.find(
        (o) => o.id.startsWith("trigger:") && o.label.startsWith("Apex"),
      );
      s = answer(
        s,
        order
          ? order.id
          : apexChoice(s)
            ? "decline"
            : s.pendingChoice.options[0]!.id,
      );
    }
    expect(s.pendingChoice).toBeNull();
    expect(s.timingKey).not.toBe("runner.turnBegins");
    expect(s.runner.credits).toBe(4);
    expect(
      s.log.filter((l) =>
        l.includes("Apex: Invasive Predator becomes pending"),
      ),
    ).toHaveLength(1);
  });

  it("an inline turn-begin ability still resolves after Apex's choice (Out of the Ashes)", () => {
    let s = apexTurnBegins([], ["out-of-the-ashes"]);
    const offered: string[] = [];
    for (let i = 0; i < 8 && s.pendingChoice; i += 1) {
      const order = s.pendingChoice.options.find(
        (o) => o.id.startsWith("trigger:") && o.label.startsWith("Apex"),
      );
      if (order) {
        s = answer(s, order.id);
        continue;
      }
      offered.push(s.pendingChoice.sourceId ?? "");
      s = answer(s, "decline");
    }
    // Apex resolves first; Out of the Ashes is still pending when the step comes back.
    expect(offered).toEqual(["apex-1", "out-of-the-ashes-heap"]);
    expect(s.pendingChoice).toBeNull();
    expect(s.timingKey).not.toBe("runner.turnBegins");
  });
});
