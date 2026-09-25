import { applyAction, legalActions } from "../actions/apply.js";
import { createInitialState } from "../state/createGame.js";
import type { Action, GameState, ServerId } from "../state/types.js";

function must(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) {
    throw new Error(`${result.error} cites=${JSON.stringify(result.cites)}`);
  }
  return result.state;
}

function pass(state: GameState): GameState {
  return must(state, { type: "pass_window" });
}

/** Play through Corp turn: install Static Wall on a new empty remote. */
export function setupEmptyRemoteWithIce(): GameState {
  let s = createInitialState();
  s = pass(s);
  s = pass(s);
  s = pass(s);
  s = must(s, { type: "basic_draw" });
  s = pass(s);
  s = must(s, { type: "basic_gain_credit" });
  s = pass(s);
  const iceId = s.corp.hand.find((id) => s.cards[id].type === "ice");
  if (!iceId) throw new Error("Expected ice in HQ after draw");
  s = must(s, {
    type: "basic_install",
    cardId: iceId,
    destination: { kind: "new_remote" },
  });
  s = pass(s);
  s = must(s, { type: "discard_to_hand_size" });
  s = pass(s);
  // Runner turn start → takeAction
  s = pass(s);
  s = pass(s);
  return s;
}

/**
 * Classic vertical slice: decline rez, continue past jack-out, empty breach.
 */
export function runVerticalSlice(): GameState {
  let s = setupEmptyRemoteWithIce();

  const emptyRemote = Object.values(s.servers).find(
    (srv) => srv.kind === "remote" && srv.root.length === 0,
  );
  if (!emptyRemote) throw new Error("Expected empty remote");

  s = must(s, { type: "basic_run", serverId: emptyRemote.id as ServerId });
  // Approach PAW — Corp declines rez
  if (s.timingKey !== "run.approachPaw") {
    throw new Error(`Expected approachPaw, got ${s.timingKey}`);
  }
  s = pass(s);
  // Jack-out window — continue
  if (s.timingKey !== "run.jackOutWindow") {
    throw new Error(`Expected jackOutWindow, got ${s.timingKey}`);
  }
  s = pass(s);
  // Empty breach auto-completes → runner action loop

  while (s.runner.clicks > 0) {
    if (s.timingKey === "runner.actionPaw") {
      s = pass(s);
    }
    s = must(s, { type: "basic_gain_credit" });
  }

  s = pass(s);
  s = must(s, { type: "discard_to_hand_size" });
  s = pass(s);
  return s;
}

/**
 * Ice slice: install Crowbar → run → Corp rezzes → Runner breaks ETR → continue → breach.
 */
export function runIceBreakSlice(): GameState {
  let s = setupEmptyRemoteWithIce();

  // Install Crowbar
  s = must(s, {
    type: "basic_install",
    cardId: "runner-program-1",
    destination: { kind: "rig" },
  });
  s = pass(s);

  const emptyRemote = Object.values(s.servers).find(
    (srv) => srv.kind === "remote" && srv.root.length === 0,
  );
  if (!emptyRemote) throw new Error("Expected empty remote");

  s = must(s, { type: "basic_run", serverId: emptyRemote.id as ServerId });
  const iceId = emptyRemote.ice[0];
  s = must(s, { type: "rez_ice", cardId: iceId });
  s = pass(s); // close approach PAW → encounter

  if (s.timingKey !== "run.encounterPaw") {
    throw new Error(`Expected encounterPaw, got ${s.timingKey}`);
  }
  s = must(s, {
    type: "break_subroutine",
    breakerId: "runner-program-1",
    subIndex: 0,
  });
  s = pass(s); // resolve (none left) → movement → jack-out
  s = pass(s); // continue past jack-out → success / empty breach

  return s;
}

/**
 * Ice slice: Corp rezzes, Runner does not break → ETR ends the run.
 */
export function runIceEtrSlice(): GameState {
  let s = setupEmptyRemoteWithIce();
  const emptyRemote = Object.values(s.servers).find(
    (srv) => srv.kind === "remote" && srv.root.length === 0,
  )!;
  s = must(s, { type: "basic_run", serverId: emptyRemote.id as ServerId });
  s = must(s, { type: "rez_ice", cardId: emptyRemote.ice[0] });
  s = pass(s); // approach → encounter
  s = pass(s); // encounter PAW → resolve ETR → run ends
  return s;
}

export function listLegal(state: GameState): Action[] {
  return legalActions(state);
}
