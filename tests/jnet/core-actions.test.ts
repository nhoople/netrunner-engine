/**
 * Ported from game.core.actions-test in mtgred/netrunner, pinned at
 * bc9e2fca073a5b21d247e72877804118e81d5472. See tests/jnet/NOTICE.md and
 * docs/jnet-test-ports.md. The file's other deftests drive jnet's chat
 * commands (/undo-click, /undo-turn, /counter, /close-prompt), which have
 * no equivalent here; they are recorded as deferred in the manifest.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  legalActions,
} from "../../src/index.js";
import {
  finishAccess,
  iceCard,
  must,
  newGame,
  playFromHand,
  startEncounter,
  takeCredits,
  walkToAccess,
} from "./helpers.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.8");
});

describe("jnet ports — core actions", () => {
  // jnet: game.core.actions-test/undo-click-with-bioroid-cost
  it("Eli 1.0 lets the Runner lose 1 click per subroutine to break both of its subroutines", () => {
    let state = newGame({ corpHand: ["Eli 1.0"] });
    state = playFromHand(state, "corp", "Eli 1.0", "R&D");
    state = takeCredits(state, "corp");
    const eli = iceCard(state, state.servers.rd!);
    state = startEncounter(state, "rd", eli.id);
    expect(state.runner.clicks).toBe(3);
    expect(
      legalActions(state).filter(
        (a) => a.type === "break_bioroid_subroutine",
      ),
    ).toHaveLength(2);
    state = must(state, { type: "break_bioroid_subroutine", subIndex: 0 });
    state = must(state, { type: "break_bioroid_subroutine", subIndex: 1 });
    expect(state.run?.encounter?.broken).toEqual([true, true]);
    expect(state.runner.clicks).toBe(1);
    state = walkToAccess(state, "rd");
    const candidate = state.run?.accessCandidates[0];
    expect(candidate).toBeTruthy();
    state = must(state, { type: "access_card", cardId: candidate! });
    state = finishAccess(state);
    expect(state.run).toBeNull();
    expect(state.runner.clicks).toBe(1);
  });
});
