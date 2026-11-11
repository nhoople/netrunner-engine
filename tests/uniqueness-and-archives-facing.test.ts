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
  evalEffect,
  getPublicView,
  instantiateCard,
  seedRng,
} from "../src/index.js";
import type { Effect } from "../src/index.js";
import { onAccessFinishedWithoutStealOrTrash } from "../src/state/cardDeclarations.js";
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

describe("a card a checkpoint trashes (CR 10.3.1d, 10.3.1g)", () => {
  it("meets its own 'when trashed' ability at the next checkpoint (CR 10.3.1a)", () => {
    const s = createInitialState();
    remoteWith(s, "remote-1", "calvin-b4l3y", "calvin-old", true);
    remoteWith(s, "remote-2", "calvin-b4l3y", "calvin-new", false);
    checkpointAfterInstruction(s, "test.first");
    s.cards["calvin-new"].rezzed = true;
    s.cards["calvin-new"].faceup = true;
    checkpointAfterInstruction(s, "test.second");

    expect(s.cards["calvin-old"].zone).toBe("corp:archives");
    // Printed: "When this asset is trashed, you may draw 2 cards."
    expect(s.pendingChoice?.sourceId).toBe("calvin-old");
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(["draw", "decline"]);
    const lines = s.log;
    const trashed = lines.findIndex((l) => l.includes("Calvin B4L3Y trashed for uniqueness"));
    const pending = lines.findIndex((l) => l.includes("Calvin B4L3Y becomes pending — trashed."));
    const nextCheckpoint = lines.findIndex(
      (l, i) => i > trashed && l.includes("After a checkpoint trashed a card"),
    );
    // Marked pending in the checkpoint after the one that trashed it.
    expect(trashed).toBeGreaterThan(-1);
    expect(nextCheckpoint).toBeGreaterThan(trashed);
    expect(pending).toBeGreaterThan(nextCheckpoint);
  });

  it("runs no extra checkpoint when the trashed card has no such ability", () => {
    const s = createInitialState();
    remoteWith(s, "remote-1", "the-board", "board-old", true);
    remoteWith(s, "remote-2", "the-board", "board-new", false);
    checkpointAfterInstruction(s, "test.first");
    s.cards["board-new"].rezzed = true;
    s.cards["board-new"].faceup = true;
    checkpointAfterInstruction(s, "test.second");
    expect(s.cards["board-old"].zone).toBe("corp:archives");
    expect(s.pendingChoice ?? null).toBeNull();
    expect(s.log.some((l) => l.includes("After a checkpoint trashed a card"))).toBe(false);
  });

  it("keeps the facing of a Corp card hosted on a card that left play (CR 4.4.6b)", () => {
    const s = createInitialState();
    // The host is already in Archives; two pieces of ice are still hosted on it.
    const host = instantiateCard("awakening-center", "host-1", "corp:archives");
    host.hostedCardIds = ["seen", "unseen"];
    s.cards["host-1"] = host;
    s.corp.discardPile.push("host-1");
    for (const [id, rezzed] of [["seen", true], ["unseen", false]] as const) {
      const hosted = instantiateCard("eli-1-0", id, "hosted:host-1");
      hosted.hostId = "host-1";
      hosted.rezzed = rezzed;
      hosted.faceup = rezzed;
      s.cards[id] = hosted;
    }
    checkpointAfterInstruction(s, "test");
    expect(s.cards["seen"].zone).toBe("corp:archives");
    expect(s.cards["seen"].faceup).toBe(true);
    expect(s.cards["seen"].rezzed).toBe(false);
    expect(s.cards["unseen"].zone).toBe("corp:archives");
    expect(s.cards["unseen"].faceup).toBe(false);
    expect(s.log.some((l) => l.includes("Eli 1.0 trashed (CR 10.3.1g)"))).toBe(true);
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

describe("cards trashed out of HQ and R&D by card effects are facedown (CR 4.4.6b)", () => {
  function hqOf(s: GameState, n: number): string[] {
    s.corp.hand = [];
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const id = `hq-${i}`;
      s.cards[id] = instantiateCard("hedge-fund", id, "corp:hq");
      s.corp.hand.push(id);
      ids.push(id);
    }
    return ids;
  }

  function mawTrash(seed: number): { s: GameState; trashed: string } {
    const s = structuredClone(createInitialState());
    seedRng(s, seed);
    s.cards["maw-1"] = instantiateCard("maw", "maw-1", "runner:installed");
    s.runner.installed = ["maw-1"];
    hqOf(s, 8);
    s.cards["seen"] = instantiateCard("pad-campaign", "seen", "server:remote-1:root");
    onAccessFinishedWithoutStealOrTrash(s, "seen");
    expect(s.corp.hand).toHaveLength(7);
    return { s, trashed: s.corp.discardPile.at(-1)! };
  }

  it("Maw trashes a random HQ card, facedown", () => {
    const { s, trashed } = mawTrash(11);
    expect(s.cards[trashed].zone).toBe("corp:archives");
    expect(s.cards[trashed].faceup).toBe(false);
    expect(getPublicView(s, "runner").opponent.discardPileFaceup).not.toContain(trashed);
    // The pick comes from the seeded stream, not from one end of HQ.
    const picks = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((seed) => mawTrash(seed).trashed));
    expect(picks.size).toBeGreaterThan(1);
    expect(mawTrash(11).trashed).toBe(trashed);
  });

  it("a random discard from HQ is facedown", () => {
    const s = structuredClone(createInitialState());
    hqOf(s, 4);
    s.cards["src"] = instantiateCard("hedge-fund", "src", "corp:play-area");
    const r = evalEffect(
      { state: s, sourceId: "src" },
      { op: "do", action: { kind: "corp_discard_random_from_hq", amount: 2 } } as unknown as Effect,
    );
    expect(r.ok).toBe(true);
    const gone = s.corp.discardPile.filter((id) => id.startsWith("hq-"));
    expect(gone).toHaveLength(2);
    for (const id of gone) expect(s.cards[id].faceup).toBe(false);
  });

  it("a card trashed off the top of R&D is facedown", () => {
    const s = structuredClone(createInitialState());
    const top = s.corp.deck[0]!;
    s.turn.damageSufferedThisTurn = 1;
    s.cards["src"] = instantiateCard("salvaged-vanadis-armory", "src", "runner:heap");
    const r = evalEffect(
      { state: s, sourceId: "src" },
      { op: "do", action: { kind: "trash_top_rd_equal_damage_suffered_this_turn" } } as unknown as Effect,
    );
    expect(r.ok).toBe(true);
    expect(s.cards[top].zone).toBe("corp:archives");
    expect(s.cards[top].faceup).toBe(false);
  });
});
