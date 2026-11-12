/**
 * The state invariant checker (src/debug/invariants.ts) catches each
 * problem class on a hand-built state, and each class cites CR rules that
 * exist at the pinned CR version.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertPinnedTag,
  checkInvariants,
  createInitialState,
  crDataPresent,
  PROBLEM_RULES,
} from "../src/index.js";
import { loadIndex } from "../src/cr/load.js";
import type { ProblemCode } from "../src/debug/invariants.js";
import type { GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  assertPinnedTag("v26.03");
});

/**
 * A small legal board: ice-1 protects HQ, asset-1 is in a remote root,
 * program-1 is installed, and a run on HQ is encountering ice-1.
 */
function board(): GameState {
  const state = createInitialState({ agendaPointsToWin: 7, stopAfterFirstCycle: false });
  const take = (list: string[], id: string) => list.splice(list.indexOf(id), 1);
  take(state.corp.deck, "corp-ice-1");
  take(state.corp.deck, "corp-asset-1");
  take(state.runner.hand, "runner-program-1");
  state.servers.hq.ice.push("corp-ice-1");
  state.cards["corp-ice-1"]!.zone = "server:hq:ice";
  state.cards["corp-ice-1"]!.rezzed = true;
  state.servers["remote-1"] = { id: "remote-1", kind: "remote", ice: [], root: ["corp-asset-1"] };
  state.cards["corp-asset-1"]!.zone = "server:remote-1:root";
  state.runner.installed.push("runner-program-1");
  const program = state.cards["runner-program-1"]!;
  program.zone = "runner:installed";
  program.faceup = true;
  program.rezzed = false;
  state.run = {
    attackedServerId: "hq",
    phase: "encounter",
    position: 0,
    successful: null,
    accessedCardIds: [],
    accessCandidates: [],
    encounter: { iceId: "corp-ice-1", broken: [] },
  } as unknown as GameState["run"];
  return state;
}

function codes(state: GameState): ProblemCode[] {
  return [...new Set(checkInvariants(state).map((problem) => problem.code))].sort();
}

/** Host `hostedId` on `hostId` both ways, in the host's zone (CR 1.13.12). */
function host(state: GameState, hostedId: string, hostId: string): void {
  for (const list of [state.corp.deck, state.runner.deck, state.runner.hand]) {
    const at = list.indexOf(hostedId);
    if (at >= 0) list.splice(at, 1);
  }
  const hosted = state.cards[hostedId]!;
  hosted.hostId = hostId;
  hosted.zone = `hosted:${hostId}`;
  state.cards[hostId]!.hostedCardIds = [...(state.cards[hostId]!.hostedCardIds ?? []), hostedId];
}

describe("checkInvariants", () => {
  it("finds nothing on a legal board, with a card legally hosted", () => {
    const state = board();
    host(state, "runner-fill-1", "runner-program-1");
    expect(checkInvariants(state)).toEqual([]);
  });

  it("each problem code cites CR rules that exist at the pin", () => {
    const { numbers } = loadIndex();
    for (const [code, rules] of Object.entries(PROBLEM_RULES)) {
      expect(rules.length, code).toBeGreaterThan(0);
      for (const rule of rules) expect(numbers[rule], `${code} cites ${rule}`).toBeTruthy();
    }
  });

  describe("zones (CR 4.1.1c, 4.1.2b)", () => {
    it("a card in two zone lists: MULTIPLE_ZONES", () => {
      const state = board();
      state.runner.discardPile.push("runner-program-1");
      expect(codes(state)).toEqual(["MULTIPLE_ZONES"]);
    });

    it("a card in no zone list: NO_ZONE", () => {
      const state = board();
      state.runner.installed = [];
      expect(codes(state)).toEqual(["NO_ZONE"]);
    });

    it("a card whose zone field names another zone: ZONE_MISMATCH", () => {
      const state = board();
      state.cards["corp-asset-1"]!.zone = "corp:archives";
      expect(codes(state)).toEqual(["ZONE_MISMATCH"]);
    });

    it("a zone list naming no card: LISTED_NOT_A_CARD", () => {
      const state = board();
      state.corp.hand.push("ghost");
      expect(codes(state)).toEqual(["LISTED_NOT_A_CARD"]);
    });

    it("an identity listed in a zone (CR 4.6.4a): IDENTITY_IN_ZONE_LIST", () => {
      const state = board();
      state.corp.hand.push("corp-id");
      expect(codes(state)).toEqual(["IDENTITY_IN_ZONE_LIST"]);
    });
  });

  describe("ice positions (CR 6.2.1, 4.6.9a)", () => {
    it("ice whose zone protects a server that doesn't list it: ICE_NOT_IN_SERVER", () => {
      const state = board();
      state.run = null;
      state.servers.hq.ice = [];
      state.corp.discardPile.push("corp-ice-1");
      expect(codes(state)).toEqual(["ICE_NOT_IN_SERVER"]);
    });
  });

  describe("hosting (CR 1.13)", () => {
    it("hostId with no entry in the host's list (CR 1.13.4): HOST_LINK_MISSING", () => {
      const state = board();
      state.cards["runner-program-1"]!.hostId = "corp-ice-1";
      expect(codes(state)).toEqual(["HOST_LINK_MISSING"]);
    });

    it("an entry in the host's list whose hostId differs (CR 1.13.4): HOSTED_BACKLINK_MISSING", () => {
      const state = board();
      host(state, "runner-fill-1", "runner-program-1");
      state.cards["runner-fill-1"]!.hostId = undefined;
      expect(codes(state)).toEqual(["HOSTED_BACKLINK_MISSING"]);
    });

    it("hostId naming no card (CR 1.13.1): HOST_MISSING", () => {
      const state = board();
      state.cards["runner-program-1"]!.hostId = "ghost";
      expect(codes(state)).toEqual(["HOST_MISSING"]);
    });

    it("a host that is no longer installed (CR 1.13.1a, 10.3.1g): HOST_NOT_IN_PLAY", () => {
      const state = board();
      host(state, "runner-fill-1", "runner-program-1");
      state.runner.installed = [];
      state.runner.discardPile.push("runner-program-1");
      state.cards["runner-program-1"]!.zone = "runner:heap";
      expect(codes(state)).toEqual(["HOST_NOT_IN_PLAY"]);
    });

    it("a host in a score area is allowed (CR 1.13.1a)", () => {
      const state = board();
      state.run = null;
      state.servers.hq.ice = [];
      state.corp.scoreArea.push("corp-ice-1");
      state.cards["corp-ice-1"]!.zone = "corp:score";
      host(state, "corp-fill-1", "corp-ice-1");
      expect(codes(state)).toEqual([]);
    });

    it("a hosted card in the heap and installed at once, as OCA leaves it: MULTIPLE_ZONES", () => {
      const state = board();
      host(state, "runner-fill-1", "runner-program-1");
      state.runner.discardPile.push("runner-fill-1");
      expect(codes(state)).toEqual(["MULTIPLE_ZONES", "OFF_BOARD_HOSTED"]);
    });

    it("a card in the heap with a hostId (CR 1.13.12): OFF_BOARD_HOSTED", () => {
      const state = board();
      state.runner.deck.splice(state.runner.deck.indexOf("runner-fill-1"), 1);
      state.runner.discardPile.push("runner-fill-1");
      state.cards["runner-fill-1"]!.zone = "runner:heap";
      state.cards["runner-fill-1"]!.hostId = "runner-program-1";
      state.cards["runner-program-1"]!.hostedCardIds = ["runner-fill-1"];
      expect(codes(state)).toEqual(["MULTIPLE_ZONES", "OFF_BOARD_HOSTED"]);
    });
  });

  describe("run position (CR 6.2)", () => {
    it("position -1: POSITION_OUT_OF_RANGE", () => {
      const state = board();
      state.run!.position = -1;
      state.run!.encounter = null;
      expect(codes(state)).toEqual(["POSITION_OUT_OF_RANGE"]);
    });

    it("position past the innermost ice: POSITION_OUT_OF_RANGE", () => {
      const state = board();
      state.run!.position = 1;
      state.run!.encounter = null;
      expect(codes(state)).toEqual(["POSITION_OUT_OF_RANGE"]);
    });

    it("a vacated innermost position still exists (CR 6.2.4)", () => {
      const state = board();
      state.servers.hq.ice = [];
      state.corp.discardPile.push("corp-ice-1");
      state.cards["corp-ice-1"]!.zone = "corp:archives";
      state.run!.positionVacated = true;
      state.run!.encounter!.iceUninstalled = true;
      expect(codes(state)).toEqual([]);
    });

    it("a run on a server that doesn't exist (CR 4.6.8e): RUN_SERVER_MISSING", () => {
      const state = board();
      state.run!.attackedServerId = "remote-9";
      expect(codes(state)).toEqual(["RUN_SERVER_MISSING"]);
    });

    it("encountering ice that isn't in the Runner's position (CR 6.2.7c, 6.2.7d): ENCOUNTER_ICE_MISMATCH", () => {
      const state = board();
      state.run!.position = null;
      expect(codes(state)).toEqual(["ENCOUNTER_ICE_MISMATCH"]);
    });

    it("the encountered ice was uninstalled (CR 6.2.7c): no mismatch", () => {
      const state = board();
      state.run!.position = null;
      state.run!.encounter!.iceUninstalled = true;
      expect(codes(state)).toEqual([]);
    });
  });

  describe("card status and counts", () => {
    it("a rezzed Runner card (CR 8.1.4f): RUNNER_CARD_REZZED", () => {
      const state = board();
      state.cards["runner-program-1"]!.rezzed = true;
      expect(codes(state)).toEqual(["RUNNER_CARD_REZZED"]);
    });

    it("credits below 0 (CR 1.10.3b): NEGATIVE_CREDITS", () => {
      const state = board();
      state.runner.credits = -1;
      expect(codes(state)).toEqual(["NEGATIVE_CREDITS"]);
    });

    it("clicks below 0 (CR 1.11.3b): NEGATIVE_CLICKS", () => {
      const state = board();
      state.corp.clicks = -1;
      expect(codes(state)).toEqual(["NEGATIVE_CLICKS"]);
    });

    it("a winner with the other side's reason (CR 1.7.2): WIN_REASON", () => {
      const state = board();
      state.winner = "corp";
      state.winReason = "runner_agenda";
      expect(codes(state)).toEqual(["WIN_REASON"]);
    });
  });
});
