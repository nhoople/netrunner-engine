/**
 * CR 10.3.1d: of several active unique cards with one name, and of several
 * installed consoles under one player, all but the one that became active
 * most recently are trashed.
 * CR 4.4.6b: a Corp card is put in Archives faceup if the Runner could see
 * it when it was trashed, and facedown otherwise.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  createInitialState,
  CR,
  getPublicView,
  instantiateCard,
} from "../src/index.js";
import type { GameState } from "../src/index.js";
import { trashCorpCardToArchives } from "../src/effects/corpTrash.js";
import { checkpointAfterInstruction } from "../src/legality/checkpoints.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
});

function remoteWith(s: GameState, serverId: string, defId: string, id: string, rezzed: boolean) {
  const card = instantiateCard(defId, id, `server:${serverId}:root`);
  card.rezzed = rezzed;
  card.faceup = rezzed;
  s.cards[id] = card;
  s.servers[serverId] = { id: serverId, kind: "remote", ice: [], root: [id] };
  s.corp.installed.push(id);
  return card;
}

function installRunner(s: GameState, defId: string, id: string): void {
  s.cards[id] = instantiateCard(defId, id, "runner:installed");
  s.runner.installed.push(id);
}

describe("uniqueness keeps the card that became active most recently (CR 10.3.1d)", () => {
  it("cites the rule", () => {
    expect(CR.checkpointUniqueness.number).toBe("10.3.1d");
  });

  it("trashes the older rezzed copy even when it sits in a later server", () => {
    const s = createInitialState();
    // The older copy is in remote-9; the newer one is rezzed in remote-1.
    remoteWith(s, "remote-9", "the-board", "board-old", true);
    remoteWith(s, "remote-1", "the-board", "board-new", false);
    checkpointAfterInstruction(s, "test.first");
    expect(s.cards["board-old"].zone).toBe("server:remote-9:root");

    s.cards["board-new"].rezzed = true;
    s.cards["board-new"].faceup = true;
    checkpointAfterInstruction(s, "test.second");

    expect(s.cards["board-old"].zone).toBe("corp:archives");
    expect(s.cards["board-new"].zone).toBe("server:remote-1:root");
    expect(s.cards["board-new"].rezzed).toBe(true);
    expect(s.log.some((l) => l.includes("trashed for uniqueness"))).toBe(true);
  });

  it("puts the trashed rezzed copy in Archives faceup (CR 4.4.6b)", () => {
    const s = createInitialState();
    remoteWith(s, "remote-1", "the-board", "board-old", true);
    remoteWith(s, "remote-2", "the-board", "board-new", false);
    checkpointAfterInstruction(s, "test.first");
    s.cards["board-new"].rezzed = true;
    s.cards["board-new"].faceup = true;
    checkpointAfterInstruction(s, "test.second");
    expect(s.cards["board-old"].zone).toBe("corp:archives");
    expect(s.cards["board-old"].faceup).toBe(true);
    expect(getPublicView(s, "runner").opponent.discardPileFaceup).toContain("board-old");
  });

  it("does not count an unrezzed copy", () => {
    const s = createInitialState();
    remoteWith(s, "remote-1", "the-board", "board-a", true);
    remoteWith(s, "remote-2", "the-board", "board-b", false);
    checkpointAfterInstruction(s, "test");
    expect(s.cards["board-a"].zone).toBe("server:remote-1:root");
    expect(s.cards["board-b"].zone).toBe("server:remote-2:root");
  });

  it("keeps the console installed last, wherever it sits in the rig", () => {
    const s = createInitialState();
    installRunner(s, "turntable", "console-old");
    checkpointAfterInstruction(s, "test.first");
    // The newer console is put in front of the older one in the rig.
    s.cards["console-new"] = instantiateCard("vigil", "console-new", "runner:installed");
    s.runner.installed.unshift("console-new");
    checkpointAfterInstruction(s, "test.second");
    expect(s.runner.installed).toEqual(["console-new"]);
    expect(s.cards["console-old"].zone).toBe("runner:heap");
  });

  it("treats a card that was derezzed and rezzed again as the newest", () => {
    const s = createInitialState();
    remoteWith(s, "remote-1", "the-board", "board-a", true);
    checkpointAfterInstruction(s, "test.first");
    remoteWith(s, "remote-2", "the-board", "board-b", false);
    // board-a is derezzed, board-b is rezzed, then board-a is rezzed again.
    s.cards["board-a"].rezzed = false;
    s.cards["board-b"].rezzed = true;
    s.cards["board-b"].faceup = true;
    checkpointAfterInstruction(s, "test.second");
    s.cards["board-a"].rezzed = true;
    checkpointAfterInstruction(s, "test.third");
    expect(s.cards["board-b"].zone).toBe("corp:archives");
    expect(s.cards["board-a"].zone).toBe("server:remote-1:root");
  });
});

describe("a trashed Corp card faces up only if the Runner could see it (CR 4.4.6b)", () => {
  it("is facedown when trashed from HQ", () => {
    const s = createInitialState();
    const card = instantiateCard("hostile-takeover", "h-1", "corp:hq");
    s.cards["h-1"] = card;
    s.corp.hand.push("h-1");
    trashCorpCardToArchives(s, "h-1", "corp");
    expect(card.zone).toBe("corp:archives");
    expect(card.faceup).toBe(false);
    const view = getPublicView(s, "runner");
    expect(view.opponent.discardPileFaceup).not.toContain("h-1");
  });

  it("is facedown when trashed from HQ even if it was revealed earlier (CR 1.21.3)", () => {
    const s = createInitialState();
    const card = instantiateCard("hostile-takeover", "h-1", "corp:hq");
    card.faceup = true;
    s.cards["h-1"] = card;
    s.corp.hand.push("h-1");
    trashCorpCardToArchives(s, "h-1", "corp");
    expect(card.faceup).toBe(false);
  });

  it("is facedown when an unrezzed installed card is trashed", () => {
    const s = createInitialState();
    const card = remoteWith(s, "remote-1", "pad-campaign", "pad-1", false);
    trashCorpCardToArchives(s, "pad-1", "corp");
    expect(card.zone).toBe("corp:archives");
    expect(card.faceup).toBe(false);
  });

  it("is faceup when a rezzed installed card is trashed", () => {
    const s = createInitialState();
    const card = remoteWith(s, "remote-1", "pad-campaign", "pad-1", true);
    trashCorpCardToArchives(s, "pad-1", "corp");
    expect(card.zone).toBe("corp:archives");
    expect(card.faceup).toBe(true);
  });

  it("is faceup when the Runner is accessing the card", () => {
    const s = createInitialState();
    const card = instantiateCard("pad-campaign", "h-1", "corp:hq");
    s.cards["h-1"] = card;
    s.corp.hand.push("h-1");
    s.run = {
      attackedServerId: "hq",
      phase: "breach",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: ["h-1"],
      randomAccessLimit: 1,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      accessingCardId: "h-1",
    };
    trashCorpCardToArchives(s, "h-1", "runner");
    expect(card.zone).toBe("corp:archives");
    expect(card.faceup).toBe(true);
  });
});
