/**
 * Comprehensive Rules examples from chapter 5.
 * Each test plays that example's board. An example that already has a
 * test in a mechanism file stays in that file.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  instantiateCard,
} from "../src/index.js";
import type { Action, GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.6");
});

function must(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`${result.error} ${JSON.stringify(result.cites)}`);
  return result.state;
}

describe("CR examples, chapter 5", () => {
    it("treats Professional Contacts as an action and Eli's click-break as an encounter ability (CR 5.2.1a.ex1)", () => {
    const s = createInitialState();
    const contacts = instantiateCard("professional-contacts", "pc-1", "runner:installed");
    s.cards["pc-1"] = contacts;
    s.runner.installed = ["pc-1"];
    s.runner.clicks = 1;
    s.runner.credits = 0;
    const deckBefore = s.runner.deck.length;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    const acted = must(s, {
      type: "use_paid_ability",
      cardId: "pc-1",
      abilityId: "pro-contacts",
    });
    expect(acted.runner.credits).toBe(1);
    expect(acted.runner.deck.length).toBe(deckBefore - 1);
    expect(acted.runner.clicks).toBe(0);

    const eli = instantiateCard("eli-1-0", "eli-1", "server:hq:ice");
    eli.rezzed = true;
    acted.cards["eli-1"] = eli;
    acted.servers.hq.ice = ["eli-1"];
    acted.runner.clicks = 1;
    acted.activeSide = "runner";
    acted.timingKey = "run.encounterPaw";
    acted.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: { iceId: "eli-1", broken: [false, false], strengthBoost: 0 },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    const broken = must(acted, {
      type: "break_bioroid_subroutine",
      subIndex: 0,
    });
    expect(broken.run?.encounter && "broken" in broken.run.encounter
      ? broken.run.encounter.broken[0]
      : false).toBe(true);
    expect(broken.timingKey).toBe("run.encounterPaw");
    expect(broken.runner.clicks).toBe(0);
  });
});
