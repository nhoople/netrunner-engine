import { applyAction, legalActions } from "../actions/apply.js";
import {
  applyIceDef,
  effectiveBreakerStrength,
  effectiveIceStrength,
  type DemoIceId,
} from "../cards/stubs.js";
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

/** Play through Corp turn: install ice on a new empty remote. */
export function setupEmptyRemoteWithIce(
  iceKind: DemoIceId = "ice-wall",
): GameState {
  let s = createInitialState();
  if (iceKind !== "ice-wall") {
    applyIceDef(s.cards["corp-ice-1"], iceKind);
  }
  // High-rez ice needs extra credits before install/rez.
  if (iceKind === "pharos") {
    s.corp.credits = 12;
  } else if (iceKind === "hortum" || iceKind === "rototurret") {
    s.corp.credits = 8;
  } else if (iceKind === "eli-1-0" || iceKind === "palisade") {
    s.corp.credits = 6;
  }
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
 * Ice slice: install Marjanah → run → Corp rezzes Ice Wall → break ETR → breach.
 */
export function runIceBreakSlice(): GameState {
  let s = setupEmptyRemoteWithIce();

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

/**
 * Palisade on a remote (printed 2 + 2 remote bonus = 4): pump Marjanah thrice, break → success.
 */
export function runPumpBreakSlice(): GameState {
  let s = setupEmptyRemoteWithIce("palisade");
  s.runner.credits = 8;

  s = must(s, {
    type: "basic_install",
    cardId: "runner-program-1",
    destination: { kind: "rig" },
  });
  s = pass(s);

  const remote = Object.values(s.servers).find(
    (srv) => srv.kind === "remote" && srv.root.length === 0,
  )!;
  const iceId = remote.ice[0];

  s = must(s, { type: "basic_run", serverId: remote.id as ServerId });
  s = must(s, { type: "rez_ice", cardId: iceId });
  s = pass(s); // approach → encounter

  if (s.timingKey !== "run.encounterPaw") {
    throw new Error(`Expected encounterPaw, got ${s.timingKey}`);
  }

  const iceStr = effectiveIceStrength(s, iceId);
  if (iceStr !== 4) {
    throw new Error(`Expected Palisade remote strength 4, got ${iceStr}`);
  }

  // Without pumps, break is illegal (str 1 < 4).
  const tooWeak = applyAction(s, {
    type: "break_subroutine",
    breakerId: "runner-program-1",
    subIndex: 0,
  });
  if (tooWeak.ok) {
    throw new Error("Expected break to fail under ice strength");
  }

  for (let i = 0; i < 3; i++) {
    s = must(s, {
      type: "use_paid_ability",
      cardId: "runner-program-1",
      abilityId: "marjanah-pump",
    });
  }
  if (
    effectiveBreakerStrength(s, "runner-program-1") <
    effectiveIceStrength(s, iceId)
  ) {
    throw new Error("Expected Marjanah to meet Palisade strength after pumps");
  }

  s = must(s, {
    type: "break_subroutine",
    breakerId: "runner-program-1",
    subIndex: 0,
  });
  s = pass(s); // no unbroken → movement → jack-out
  s = pass(s); // continue → success / empty breach
  return s;
}

/**
 * Hortum unbroken: gain_credits fires then ETR (multi-sub order).
 */
export function runMultiSubEtrSlice(): GameState {
  let s = setupEmptyRemoteWithIce("hortum");
  const remote = Object.values(s.servers).find(
    (srv) => srv.kind === "remote" && srv.root.length === 0,
  )!;
  const corpBefore = s.corp.credits;

  s = must(s, { type: "basic_run", serverId: remote.id as ServerId });
  s = must(s, { type: "rez_ice", cardId: remote.ice[0] });
  const afterRez = s.corp.credits;
  s = pass(s); // approach → encounter
  s = pass(s); // encounter → resolve gain then ETR

  if (s.run !== null) {
    throw new Error("Expected run to end via ETR");
  }
  // Rez spent Hortum rezCost (4); then +1 from first sub (unadvanced).
  if (s.corp.credits !== afterRez + 1) {
    throw new Error(
      `Expected Corp credits ${afterRez + 1} after gain-credits sub, got ${s.corp.credits} (before run ${corpBefore})`,
    );
  }
  return s;
}

/**
 * Palisade remote strength bonus: approach confirms str 4, pump Marjanah past it.
 * (Replaces the old synthetic Bastion fortify demo.)
 */
export function runFortifyPumpSlice(): GameState {
  let s = setupEmptyRemoteWithIce("palisade");
  s.corp.credits = 6;
  s.runner.credits = 8;

  s = must(s, {
    type: "basic_install",
    cardId: "runner-program-1",
    destination: { kind: "rig" },
  });
  s = pass(s);

  const remote = Object.values(s.servers).find(
    (srv) => srv.kind === "remote" && srv.root.length === 0,
  )!;
  const iceId = remote.ice[0];

  s = must(s, { type: "basic_run", serverId: remote.id as ServerId });
  s = must(s, { type: "rez_ice", cardId: iceId });
  if (effectiveIceStrength(s, iceId) !== 4) {
    throw new Error(
      `Expected Palisade strength 4 on remote, got ${effectiveIceStrength(s, iceId)}`,
    );
  }
  s = pass(s); // → encounter

  for (let i = 0; i < 3; i++) {
    s = must(s, {
      type: "use_paid_ability",
      cardId: "runner-program-1",
      abilityId: "marjanah-pump",
    });
  }
  s = must(s, {
    type: "break_subroutine",
    breakerId: "runner-program-1",
    subIndex: 0,
  });
  s = pass(s);
  s = pass(s);
  return s;
}

export function listLegal(state: GameState): Action[] {
  return legalActions(state);
}

/**
 * Tithe unbroken: 1 net damage + Corp gains 1¢ via effect IR (CR 10.4).
 */
export function runPulseNeedleSlice(): GameState {
  let s = setupEmptyRemoteWithIce("tithe");
  // Put a filler in grip so net damage has something to trash.
  const filler = "runner-fill-1";
  if (s.runner.deck[0] === filler) s.runner.deck.shift();
  s.runner.hand.push(filler);
  s.cards[filler].zone = "runner:grip";
  s.cards[filler].faceup = true;

  const remote = Object.values(s.servers).find(
    (srv) => srv.kind === "remote" && srv.root.length === 0,
  )!;
  const gripBefore = s.runner.hand.length;
  const corpBefore = s.corp.credits;

  s = must(s, { type: "basic_run", serverId: remote.id as ServerId });
  s = must(s, { type: "rez_ice", cardId: remote.ice[0] });
  const afterRez = s.corp.credits;
  s = pass(s); // approach → encounter
  s = pass(s); // encounter → resolve damage + gain → movement

  if (s.runner.hand.length !== gripBefore - 1) {
    throw new Error(
      `Expected grip ${gripBefore - 1} after net damage, got ${s.runner.hand.length}`,
    );
  }
  if (s.corp.credits !== afterRez + 1) {
    throw new Error(
      `Expected Corp +1¢ from Tithe (after rez ${afterRez}), got ${s.corp.credits} (before ${corpBefore})`,
    );
  }
  // No ETR — should reach jack-out window
  if (s.timingKey !== "run.jackOutWindow") {
    throw new Error(`Expected jackOutWindow, got ${s.timingKey}`);
  }
  s = pass(s); // continue → success
  return s;
}

/**
 * Rototurret unbroken: trash Marjanah then ETR (CR 1.19.1 / 6.1.4).
 */
export function runScrapCodeSlice(): GameState {
  let s = setupEmptyRemoteWithIce("rototurret");
  s = must(s, {
    type: "basic_install",
    cardId: "runner-program-1",
    destination: { kind: "rig" },
  });
  s = pass(s);

  const remote = Object.values(s.servers).find(
    (srv) => srv.kind === "remote" && srv.root.length === 0,
  )!;

  s = must(s, { type: "basic_run", serverId: remote.id as ServerId });
  s = must(s, { type: "rez_ice", cardId: remote.ice[0] });
  s = pass(s);
  s = pass(s); // resolve trash + ETR (single program → auto)

  if (s.runner.rig.includes("runner-program-1")) {
    throw new Error("Expected Marjanah trashed by Rototurret");
  }
  if (s.cards["runner-program-1"].zone !== "runner:heap") {
    throw new Error("Marjanah should be in heap");
  }
  if (s.run !== null) {
    throw new Error("Expected ETR to end the run");
  }
  return s;
}
