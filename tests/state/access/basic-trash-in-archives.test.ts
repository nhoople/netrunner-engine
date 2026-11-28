/**
 * FX-small: the Runner cannot trash or pay the trash cost of a card in the
 * Corp's discard pile (CR 7.1.5b). The access candidates, apply's
 * `trash_accessed`, and Neutralize All Threats' forced trash all ask one
 * check, `basicTrashRefusal`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  CR,
  crDataPresent,
  legalActions,
} from "../../../src/index.js";
import { instantiateCard } from "../../../src/cards/instantiateCard.js";
import type { Action } from "../../../src/state/types/actions.js";
import type { GameState } from "../../../src/state/types/game.js";
import type { ServerId } from "../../../src/state/types/servers.js";
import type { ZoneId } from "../../../src/state/types/shared.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
});

function must(state: GameState, action: Action): GameState {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${action.type}: ${r.error}`);
  return r.state;
}

function runnerTurn(): GameState {
  const s = structuredClone(createInitialState());
  // The fixture's Marjanah in the grip is marked rezzed; Runner cards never
  // are (CR 8.1.4f), and this test does not need it.
  s.cards["runner-program-1"]!.rezzed = false;
  s.corp.credits = 10;
  s.runner.credits = 10;
  s.runner.clicks = 4;
  s.activeSide = "runner";
  s.timingKey = "runner.takeAction";
  return s;
}

/** Put a PAD Campaign (trash cost 4) where a run on `server` will access it. */
function placePad(s: GameState, server: ServerId): void {
  const zone: ZoneId =
    server === "archives"
      ? "corp:archives"
      : server === "hq"
        ? "corp:hq"
        : server === "rd"
          ? "corp:rd"
          : `server:${server}:root`;
  const pad = instantiateCard("pad-campaign", "pad", zone);
  pad.rezzed = false;
  pad.faceup = false;
  s.cards["pad"] = pad;
  if (server === "archives") s.corp.discardPile.push("pad");
  else if (server === "hq") s.corp.hand.push("pad");
  else if (server === "rd") s.corp.deck.unshift("pad");
  else {
    s.servers[server] = { id: server, kind: "remote", ice: [], root: ["pad"] };
  }
}

/** Run on the server, passing every window, until the Runner is accessing `cardId`. */
function accessing(
  start: GameState,
  server: ServerId,
  cardId: string,
): GameState {
  let s = must(start, { type: "basic_run", serverId: server });
  for (let i = 0; i < 60; i++) {
    if (s.run?.accessingCardId === cardId) return s;
    const legal = legalActions(s);
    const next =
      legal.find((a) => a.type === "access_card" && a.cardId === cardId) ??
      legal.find((a) => a.type === "continue_run") ??
      legal.find((a) => a.type === "pass_window");
    if (!next) {
      throw new Error(
        `Stuck at ${s.timingKey}: ${legal.map((a) => a.type).join(", ")}`,
      );
    }
    s = must(s, next);
  }
  throw new Error(`Never accessed ${cardId}`);
}

const trashPad: Action = { type: "trash_accessed", cardId: "pad" };

describe("the basic trash ability and Archives (CR 7.1.5b)", () => {
  it("a card accessed in Archives is never offered for its trash cost (CR 7.1.5b)", () => {
    const s0 = runnerTurn();
    placePad(s0, "archives");
    let s = must(s0, { type: "basic_run", serverId: "archives" });
    let offered = false;
    for (let i = 0; i < 60 && s.run; i++) {
      const legal = legalActions(s);
      if (legal.some((a) => a.type === "trash_accessed")) offered = true;
      const next =
        legal.find((a) => a.type === "access_card") ??
        legal.find((a) => a.type === "continue_run") ??
        legal.find((a) => a.type === "finish_access") ??
        legal.find((a) => a.type === "pass_window");
      if (!next) break;
      s = must(s, next);
    }
    expect(s.run).toBeNull();
    expect(offered).toBe(false);
    // The PAD Campaign was accessed (turned faceup in Archives) and stayed.
    expect(s.cards["pad"]!.faceup).toBe(true);
    expect(s.corp.discardPile).toContain("pad");
    expect(s.runner.credits).toBe(10);
  });

  it("a card accessed in Archives cannot be trashed for its trash cost (CR 7.1.5b)", () => {
    const s = runnerTurn();
    placePad(s, "archives");
    // Parked mid-access on the PAD Campaign in Archives, as if the Runner had
    // another mid-access ability to consider.
    s.run = {
      attackedServerId: "archives",
      phase: "breach",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: ["pad"],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      accessingCardId: "pad",
      accessCandidatesPreset: true,
    };
    s.timingKey = "access.midAccess";

    expect(legalActions(s)).not.toContainEqual(trashPad);
    const r = applyAction(s, trashPad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.cites).toContainEqual(CR.trashInArchives);
    expect(s.corp.discardPile).toContain("pad");
    expect(s.runner.credits).toBe(10);
  });

  it("an upgrade installed in the root of Archives can still be trashed: it is not in the discard pile", () => {
    const s0 = runnerTurn();
    const up = instantiateCard(
      "akitaro-watanabe",
      "akitaro",
      "server:archives:root",
    );
    up.rezzed = false;
    up.faceup = false;
    s0.cards["akitaro"] = up;
    s0.servers.archives.root = ["akitaro"];
    const s = accessing(s0, "archives", "akitaro");

    const trash: Action = { type: "trash_accessed", cardId: "akitaro" };
    expect(legalActions(s)).toContainEqual(trash);
    const after = must(s, trash);
    expect(after.cards["akitaro"]!.zone).toBe("corp:archives");
    expect(after.runner.credits).toBe(10 - 3);
  });

  for (const server of ["hq", "rd", "remote-1"] as const) {
    it(`a card accessed in ${server} can still be trashed for its trash cost`, () => {
      const s0 = runnerTurn();
      placePad(s0, server);
      const s = accessing(s0, server, "pad");

      expect(legalActions(s)).toContainEqual(trashPad);
      const after = must(s, trashPad);
      expect(after.cards["pad"]!.zone).toBe("corp:archives");
      expect(after.runner.credits).toBe(10 - 4);
    });
  }

  it("Neutralize All Threats does not force a trash of a card accessed in Archives (CR 7.1.5b, 7.1.5d)", () => {
    const s0 = runnerTurn();
    const nat = instantiateCard(
      "neutralize-all-threats",
      "nat",
      "runner:installed",
    );
    nat.faceup = true;
    s0.cards["nat"] = nat;
    s0.runner.installed.push("nat");
    placePad(s0, "archives");

    const ran = must(s0, { type: "basic_run", serverId: "archives" });
    let s = ran;
    for (let i = 0; i < 60 && s.run; i++) {
      const legal = legalActions(s);
      expect(legal).not.toContainEqual(trashPad);
      const next =
        legal.find((a) => a.type === "access_card" && a.cardId === "pad") ??
        legal.find((a) => a.type === "continue_run") ??
        legal.find((a) => a.type === "finish_access") ??
        legal.find((a) => a.type === "finish_breach") ??
        legal.find((a) => a.type === "pass_window");
      if (!next) break;
      s = must(s, next);
    }
    expect(s.run).toBeNull();
    expect(s.runner.credits).toBe(10);
    expect(s.log.some((l) => /trashes accessed PAD Campaign/.test(l))).toBe(
      false,
    );

    // That access was Neutralize All Threats' first of the turn (its trigger
    // is the access; only the trash is "if able"), so a card with a trash
    // cost accessed in HQ later that turn is not forced: the Runner chooses.
    const hqPad = instantiateCard("pad-campaign", "hq-pad", "corp:hq");
    s.cards["hq-pad"] = hqPad;
    s.corp.hand.push("hq-pad");
    for (let i = 0; i < 6 && s.timingKey !== "runner.takeAction"; i++) {
      s = must(s, { type: "pass_window" });
    }
    const atHq = accessing(s, "hq", "hq-pad");
    expect(atHq.runner.credits).toBe(10);
    expect(atHq.cards["hq-pad"]!.zone).toBe("corp:hq");
    expect(legalActions(atHq)).toContainEqual({
      type: "trash_accessed",
      cardId: "hq-pad",
    });
    expect(legalActions(atHq).some((a) => a.type === "finish_access")).toBe(
      true,
    );
  });
});
