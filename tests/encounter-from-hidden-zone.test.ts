/**
 * Cards the Runner accesses in HQ or R&D, including ice they then encounter
 * there (Archangel, Chrysalis, Herald, Sapper).
 *
 * Both players may look at a card while it is being accessed, except that
 * the Corp may not look at one accessed from R&D (CR 7.1.2). These ice must
 * be revealed while accessed in R&D (CR 1.21.7), and their subroutines are
 * active for the encounter (CR 9.1.8h). Once the access is over, a card still
 * in HQ or R&D is neither faceup nor facedown (CR 1.21.1a, 4.1.5, 4.1.6) and
 * not rezzed (CR 8.1.1).
 *
 * Zahya Sadeghi's run-end ability opens a choice in the same action that
 * completes the last access, so the card is checked while that choice is
 * still open.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  checkInvariants,
  createInitialState,
  crDataPresent,
  instantiateCard,
  STEPS,
} from "../src/index.js";
import { revealCards } from "../src/state/reveal.js";
import { removeCardFromCurrentZone } from "../src/state/scoring.js";
import type { Action, GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.23");
});

function must(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`${result.error} ${JSON.stringify(result.cites)}`);
  return result.state;
}

/**
 * A new game with Zahya Sadeghi as the Runner's identity and 3 cards in the
 * grip. `createInitialState` marks its Runner program rezzed, which other
 * tests record in the invariant baseline (CR 8.1.4f); that is cleared so
 * this file finds no problem but the one it tests.
 */
function freshState(): GameState {
  const s = createInitialState();
  s.cards["runner-program-1"]!.rezzed = false;
  s.cards["runner-id"] = instantiateCard(
    "zahya-sadeghi-versatile-smuggler",
    "runner-id",
    "runner:grip",
  );
  for (const id of s.runner.deck.splice(0, 2)) {
    s.runner.hand.push(id);
    s.cards[id]!.zone = "runner:grip";
  }
  return s;
}

/** A successful run on `server` that is about to access `cardId`. */
function breachWith(state: GameState, server: "hq" | "rd", cardId: string): void {
  state.activeSide = "runner";
  state.timingKey = "breach.awaitAccess";
  state.run = {
    attackedServerId: server,
    phase: "breach",
    position: null,
    successful: true,
    accessedCardIds: [],
    accessCandidates: [cardId],
    // R&D: the top card only (CR 7.4.7a); HQ: no random access left to limit.
    randomAccessLimit: server === "rd" ? 1 : null,
    encounter: null,
    endedTheRun: false,
    cannotJackOut: false,
    accessingCardId: null,
  };
}

/** Pass priority until the forced encounter is over and access resumes. */
function finishEncounter(state: GameState): GameState {
  let s = state;
  const resumed = () => s.log.some((line) => line.includes("Resume access after forced encounter"));
  for (let i = 0; i < 12 && !resumed(); i++) {
    s = must(s, { type: "pass_window" });
  }
  expect(resumed()).toBe(true);
  expect(s.timingKey).toBe("access.midAccess");
  return s;
}

/** The access and the run are over, with Zahya's choice open. */
function expectRunOverWithZahyaChoice(s: GameState): void {
  expect(s.run?.accessingCardId ?? null).toBeNull();
  expect(s.pendingChoice?.options.map((option) => option.id)).toContain("zahya-gain");
}

const hiddenZoneFaceup = (s: GameState) =>
  checkInvariants(s).filter((p) => p.code === "FACEUP_IN_HIDDEN_ZONE");

describe("cards accessed in HQ or R&D (CR 7.1.2, 1.21.1a)", () => {
  it("leaves Archangel in HQ not faceup when the Corp declines to pay", () => {
    let s = freshState();
    s.cards["arch-1"] = instantiateCard("archangel", "arch-1", "corp:hq");
    s.corp.hand = ["arch-1"];
    s.corp.credits = 5;
    breachWith(s, "hq", "arch-1");

    s = must(s, { type: "access_card", cardId: "arch-1" });
    // Both players may look at it while it is accessed in HQ (CR 7.1.2).
    expect(s.cards["arch-1"]!.faceup).toBe(true);
    s.activeSide = "corp";
    s = must(s, { type: "choose_option", optionId: "decline" });

    expectRunOverWithZahyaChoice(s);
    const arch = s.cards["arch-1"]!;
    expect(arch.zone).toBe("corp:hq");
    expect(arch.faceup).toBe(false);
    expect(arch.rezzed).toBe(false);
    expect(hiddenZoneFaceup(s)).toEqual([]);
  });

  it("leaves Archangel in HQ neither faceup nor rezzed after the encounter", () => {
    let s = freshState();
    s.cards["arch-1"] = instantiateCard("archangel", "arch-1", "corp:hq");
    s.corp.hand = ["arch-1"];
    s.corp.credits = 5;
    breachWith(s, "hq", "arch-1");

    s = must(s, { type: "access_card", cardId: "arch-1" });
    s.activeSide = "corp";
    s = must(s, { type: "choose_option", optionId: "accept" });
    s = finishEncounter(s);
    s.activeSide = "runner";
    s = must(s, { type: "finish_access" });

    expectRunOverWithZahyaChoice(s);
    const arch = s.cards["arch-1"]!;
    expect(arch.zone).toBe("corp:hq");
    expect(s.corp.hand).toContain("arch-1");
    expect(arch.faceup).toBe(false);
    expect(arch.rezzed).toBe(false);
    expect(hiddenZoneFaceup(s)).toEqual([]);
  });

  it("leaves Chrysalis in R&D neither faceup nor rezzed after the encounter", () => {
    let s = freshState();
    s.cards["chrys-1"] = instantiateCard("chrysalis", "chrys-1", "corp:rd");
    s.corp.deck = ["chrys-1", ...s.corp.deck];
    breachWith(s, "rd", "chrys-1");

    s = must(s, { type: "access_card", cardId: "chrys-1" });
    s = finishEncounter(s);
    s = must(s, { type: "finish_access" });

    expectRunOverWithZahyaChoice(s);
    const chrys = s.cards["chrys-1"]!;
    expect(chrys.zone).toBe("corp:rd");
    expect(s.corp.deck).toContain("chrys-1");
    expect(chrys.faceup).toBe(false);
    expect(chrys.rezzed).toBe(false);
    expect(hiddenZoneFaceup(s)).toEqual([]);
  });

  it("ends the encounter's mark when the run ends during it (CR 9.1.8h, 6.5.9b)", () => {
    const s = freshState();
    const chrys = instantiateCard("chrysalis", "chrys-1", "corp:rd");
    // As force_encounter_accessed_ice leaves it for the encounter.
    chrys.rezzed = true;
    chrys.faceup = true;
    s.cards["chrys-1"] = chrys;
    s.corp.deck = ["chrys-1", ...s.corp.deck];
    breachWith(s, "rd", "chrys-1");
    s.run!.accessingCardId = "chrys-1";
    s.run!.encounter = { iceId: "chrys-1", broken: [false] };
    s.timingKey = "run.ends";

    STEPS["run.ends"]!.onResolve!(s);

    expect(chrys.rezzed).toBe(false);
    expect(chrys.faceup).toBe(false);
  });

  it("flags a Corp card left faceup in R&D, and not one being revealed (CR 1.21.1a, 1.21.6)", () => {
    const s = freshState();
    const herald = instantiateCard("herald", "her-1", "corp:rd");
    herald.faceup = true;
    s.cards["her-1"] = herald;
    s.corp.deck = ["her-1", ...s.corp.deck];
    const found = hiddenZoneFaceup(s);
    expect(found.map((p) => p.id)).toEqual(["her-1"]);
    expect(found[0]!.rules).toContain("1.21.1a");

    herald.revealing = true;
    expect(hiddenZoneFaceup(s)).toEqual([]);
  });

  it("drops the reveal mark when the revealed card moves (CR 1.21.6)", () => {
    const s = freshState();
    const herald = instantiateCard("herald", "her-1", "corp:rd");
    s.cards["her-1"] = herald;
    s.corp.deck = ["her-1", ...s.corp.deck];
    revealCards(s, ["her-1"], "her-1");
    expect(herald.revealing).toBe(true);
    removeCardFromCurrentZone(s, "her-1");
    expect(herald.revealing).toBeUndefined();
  });
});
