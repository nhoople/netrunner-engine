import { describe, expect, it, beforeAll } from "vitest";
import {
  applyIntent,
  autoResolveTrace,
  createGame,
  createInitialState,
  createShortGameState,
  CR,
  dealDamage,
  fx,
  getPublicView,
  queryLegality,
  assertPinnedTag,
  crDataPresent,
} from "../src/index.js";
import type { Action, GameState, ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) {
    throw new Error("Run `npm run fetch-cr` before tests.");
  }
  assertPinnedTag("v26.03");
});

function must(state: GameState, action: Action): GameState {
  const r = applyIntent(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

function pass(state: GameState): GameState {
  return must(state, { type: "pass_window" });
}

/** Walk Corp from gainClicks to takeAction. */
function toCorpTakeAction(s: GameState): GameState {
  s = pass(s);
  s = pass(s);
  s = pass(s);
  return s;
}

function burnSide(s: GameState, side: "corp" | "runner"): GameState {
  for (let guard = 0; guard < 50 && !s.done; guard++) {
    // Keep walking while this side is active, or while parked on the
    // other side's pre-action pass steps we still need to clear.
    const legal = queryLegality(s).legal.map((e) => e.action);
    if (legal.some((a) => a.type === "discard_to_hand_size")) {
      s = must(s, { type: "discard_to_hand_size" });
      continue;
    }
    if (legal.some((a) => a.type === "pass_window")) {
      // Stop once the *other* side reaches takeAction.
      if (
        s.activeSide !== side &&
        (s.timingKey === "corp.takeAction" ||
          s.timingKey === "runner.takeAction")
      ) {
        break;
      }
      s = pass(s);
      continue;
    }
    if (
      s.activeSide === side &&
      legal.some((a) => a.type === "basic_gain_credit")
    ) {
      s = must(s, { type: "basic_gain_credit" });
      continue;
    }
    break;
  }
  return s;
}

function toRunnerTakeAction(s: GameState): GameState {
  s = burnSide(s, "corp");
  for (let guard = 0; guard < 10; guard++) {
    if (s.timingKey === "runner.takeAction") return s;
    if (s.timingKey === "runner.gainClicks" || s.timingKey === "runner.actionPaw") {
      s = pass(s);
      continue;
    }
    break;
  }
  return s;
}

describe("library API", () => {
  it("exports createGame / queryLegality / applyIntent / getPublicView", () => {
    let s = createGame({ stopAfterFirstCycle: false, agendaPointsToWin: 3 });
    expect(s.config.stopAfterFirstCycle).toBe(false);
    s = toCorpTakeAction(s);
    const legality = queryLegality(s);
    expect(legality.legal.length).toBeGreaterThan(0);
    s = must(s, { type: "basic_gain_credit" });
    const view = getPublicView(s, "corp");
    expect(view.viewer).toBe("corp");
    expect(view.self.credits).toBe(s.corp.credits);
    expect(view.opponent.handCount).toBe(s.runner.hand.length);
    expect(view.self.hand).toEqual([...s.corp.hand]);
  });
});

describe("Phase 1 short game (scripted)", () => {
  it("Corp installs+advances+scores agenda to win", () => {
    let s = createShortGameState({ agendaPointsToWin: 3 });
    expect(s.cards["corp-agenda"].agendaPoints).toBe(3);

    // Corp turn 1: draw agenda into hand, install on remote
    s = toCorpTakeAction(s);
    while (!s.corp.hand.includes("corp-agenda") && s.corp.clicks > 0) {
      if (s.timingKey === "corp.actionPaw") s = pass(s);
      s = must(s, { type: "basic_draw" });
    }
    if (s.timingKey === "corp.actionPaw") s = pass(s);
    expect(s.corp.hand).toContain("corp-agenda");
    s = must(s, {
      type: "basic_install",
      cardId: "corp-agenda",
      destination: { kind: "new_remote" },
    });
    expect(s.cards["corp-agenda"].zone).toMatch(/:root$/);

    s = burnSide(s, "corp");
    s = burnSide(s, "runner");
    expect(s.activeSide).toBe("corp");
    expect(s.done).toBe(false);

    // Advance to 5 and score (may span turns)
    for (let guard = 0; guard < 80 && !s.winner; guard++) {
      if (
        s.timingKey === "corp.actionPaw" ||
        s.timingKey === "runner.actionPaw"
      ) {
        s = pass(s);
        continue;
      }
      const tokens = s.cards["corp-agenda"].advancementTokens ?? 0;
      const legal = queryLegality(s).legal.map((e) => e.action);
      if (
        legal.some(
          (a) => a.type === "score_agenda" && a.cardId === "corp-agenda",
        )
      ) {
        s = must(s, { type: "score_agenda", cardId: "corp-agenda" });
        break;
      }
      if (s.timingKey === "corp.takeAction") {
        if (tokens < 5 && s.corp.credits >= 1) {
          s = must(s, { type: "advance", cardId: "corp-agenda" });
        } else {
          s = must(s, { type: "basic_gain_credit" });
        }
        continue;
      }
      if (s.timingKey === "runner.takeAction") {
        s = must(s, { type: "basic_gain_credit" });
        continue;
      }
      if (legal.some((a) => a.type === "discard_to_hand_size")) {
        s = must(s, { type: "discard_to_hand_size" });
      } else if (legal.some((a) => a.type === "pass_window")) {
        s = pass(s);
      } else {
        break;
      }
    }

    expect(s.winner).toBe("corp");
    expect(s.winReason).toBe("corp_agenda");
    expect(s.done).toBe(true);
    expect(s.log.some((l) => l.includes(CR.scoringAgenda.number))).toBe(true);
  });

  it("Runner steals agenda from remote to win", () => {
    let s = createShortGameState({ agendaPointsToWin: 3 });
    s = toCorpTakeAction(s);
    const agenda = s.cards["corp-agenda"];
    s.corp.deck = s.corp.deck.filter((id) => id !== "corp-agenda");
    const remoteId = `remote-${s.nextRemoteNumber++}` as ServerId;
    s.servers[remoteId] = {
      id: remoteId,
      kind: "remote",
      ice: [],
      root: ["corp-agenda"],
    };
    agenda.zone = `server:${remoteId}:root`;
    agenda.advancementTokens = 0;

    s = burnSide(s, "corp");
    s = toRunnerTakeAction(s);
    expect(s.timingKey).toBe("runner.takeAction");
    s = must(s, { type: "basic_run", serverId: remoteId });

    for (let guard = 0; guard < 20 && !s.winner; guard++) {
      if (s.run?.accessingCardId === "corp-agenda") {
        s = must(s, { type: "steal_agenda", cardId: "corp-agenda" });
        break;
      }
      const legal = queryLegality(s).legal.map((e) => e.action);
      const access = legal.find(
        (a) => a.type === "access_card" && a.cardId === "corp-agenda",
      );
      if (access) {
        s = must(s, access);
        continue;
      }
      if (legal.some((a) => a.type === "pass_window")) {
        s = pass(s);
        continue;
      }
      break;
    }

    expect(s.winner).toBe("runner");
    expect(s.winReason).toBe("runner_agenda");
    expect(s.runner.score).toContain("corp-agenda");
  });
});

describe("Phase 1 mechanics smoke", () => {
  it("nested priority logs after rez", () => {
    let s = createShortGameState();
    s = toCorpTakeAction(s);
    while (!s.corp.hand.includes("corp-ice-1") && s.corp.clicks > 0) {
      if (s.timingKey === "corp.actionPaw") s = pass(s);
      s = must(s, { type: "basic_draw" });
    }
    if (s.timingKey === "corp.actionPaw") s = pass(s);
    s = must(s, {
      type: "basic_install",
      cardId: "corp-ice-1",
      destination: { kind: "new_remote" },
    });
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    s = burnSide(s, "corp");
    s = toRunnerTakeAction(s);
    s = must(s, {
      type: "basic_install",
      cardId: "runner-program-1",
      destination: { kind: "rig" },
    });
    s = pass(s);
    s.corp.credits = 10;
    s = must(s, { type: "basic_run", serverId: remote.id as ServerId });
    s = must(s, { type: "rez_ice", cardId: remote.ice[0] });
    expect(s.log.some((l) => l.includes("Nested priority"))).toBe(true);
    expect(s.priorityStack.length).toBeGreaterThan(0);
    s = pass(s);
    expect(s.timingKey).toBe("run.encounterPaw");
  });

  it("central HQ breach offers an HQ card candidate", () => {
    let s = createShortGameState();
    s.corp.hand.push("corp-hedge");
    s.cards["corp-hedge"].zone = "corp:hq";
    s = toCorpTakeAction(s);
    s = burnSide(s, "corp");
    s = toRunnerTakeAction(s);
    s = must(s, { type: "basic_run", serverId: "hq" });
    expect(s.timingKey).toBe("breach.awaitAccess");
    expect(s.run?.accessCandidates.length).toBeGreaterThan(0);
    expect(s.log.some((l) => l.includes(CR.hqAccess.number))).toBe(true);
  });

  it("trace auto-resolves and can give tags", () => {
    const s = createInitialState();
    const r = autoResolveTrace(s, "corp-id", 3, fx.giveTags(1));
    expect(r.ok).toBe(true);
    expect(s.runner.tags).toBe(1);
  });

  it("flatline when net damage exceeds grip", () => {
    const s = createInitialState();
    s.runner.hand = [];
    const result = dealDamage(s, "net", 1, "test");
    expect(result).toBe("flatline");
    expect(s.winner).toBe("corp");
    expect(s.winReason).toBe("flatline");
  });
});
