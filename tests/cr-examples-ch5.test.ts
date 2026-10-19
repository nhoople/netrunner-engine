/**
 * Comprehensive Rules examples from chapter 5.
 * Each test plays that example's board.
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
  CR,
} from "../src/index.js";
import type { Action, GameState } from "../src/state/types.js";
import { noteCorpActionType } from "../src/state/corpActionHooks.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.7");
});

function must(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`${result.error} ${JSON.stringify(result.cites)}`);
  return result.state;
}


function at(lines: string[], fragment: string): number {
  const i = lines.findIndex((line) => line.includes(fragment));
  expect(i, fragment).toBeGreaterThanOrEqual(0);
  return i;
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


  it("completes Stimhack's play after the run, the core damage, and the trash (CR 5.2.2b.ex1)", () => {
    let s = createInitialState();
    const ev = instantiateCard("stimhack", "sh-1", "runner:grip");
    s.cards["sh-1"] = ev;
    s.runner.hand = [...s.runner.hand, "sh-1"];
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    for (const id of s.corp.hand) {
      const held = s.cards[id];
      if (held) held.zone = "corp:rd";
      s.corp.deck.push(id);
    }
    s.corp.hand = [];

    s = must(s, { type: "play_event", cardId: "sh-1", serverId: "hq" });

    const damage = at(s.log, "core damage 1:");
    const trashed = at(s.log, "Stimhack trashed");
    const complete = at(s.log, "Play effect complete");
    const instruction = at(s.log, "Checkpoint open [instruction]");
    expect(damage).toBeLessThan(trashed);
    expect(trashed).toBeLessThan(complete);
    expect(complete).toBeLessThan(instruction);
    expect(s.log[complete]).toContain(CR.playComplete.number);
    expect(s.cards["sh-1"]?.zone).toBe("runner:heap");
    expect(s.run).toBeNull();
    expect(s.checkpoints).toHaveLength(0);
  });


  it("does not offer MirrorMorph after two play-operation actions (CR 5.2.5b.ex1)", () => {
    const s = createInitialState();
    const morph = instantiateCard(
      "mirrormorph-endless-iteration",
      "mm-1",
      "corp:identity",
    );
    s.cards["mm-1"] = morph;
    s.corp.identityId = "mm-1";
    s.activeSide = "corp";
    noteCorpActionType(s, "play_operation");
    noteCorpActionType(s, "play_operation");
    expect(s.turn.mirrormorphClickDiscountPending).toBe(false);
    expect(s.pendingChoice).toBeNull();
    noteCorpActionType(s, "credit");
    noteCorpActionType(s, "install");
    noteCorpActionType(s, "advance");
    expect(s.turn.mirrormorphThirdDistinctFiredThisTurn).toBe(true);
    expect(s.turn.mirrormorphClickDiscountPending).toBe(false);
    expect(s.pendingChoice).toBeNull();
  });


});
