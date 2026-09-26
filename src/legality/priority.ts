/**
 * Nested priority / paid-ability windows (CR 9.2.4 / 9.2.4d).
 * Replaces the log-only closePriorityWindow stub with a real pass loop.
 */
import type {
  Action,
  GameState,
  PriorityWindowFrame,
  Side,
} from "../state/types.js";
import { CR } from "../timing/labels.js";
import { popCheckpoint, pushCheckpoint } from "./checkpoints.js";

let prioritySeq = 0;

export function currentPriorityWindow(
  state: GameState,
): PriorityWindowFrame | null {
  return state.priorityStack[state.priorityStack.length - 1] ?? null;
}

export function priorityHolderForStep(timingKey: string, activeSide: Side): Side {
  switch (timingKey) {
    case "run.approachPaw":
    case "corp.actionPaw":
    case "corp.drawPaw":
    case "corp.discardPaw":
      return "corp";
    case "run.encounterPaw":
    case "run.jackOutWindow":
    case "runner.actionPaw":
    case "runner.startPaw":
    case "runner.discardPaw":
      return "runner";
    default:
      return activeSide;
  }
}

/**
 * Open a priority window for the current PAW / pass step.
 * Logical stack only — close cites are recorded when the window closes.
 */
export function ensurePriorityWindow(state: GameState): PriorityWindowFrame {
  const existing = currentPriorityWindow(state);
  if (existing && existing.stepKey === state.timingKey) {
    return existing;
  }
  const pw: PriorityWindowFrame = {
    id: `pw-${++prioritySeq}`,
    stepKey: state.timingKey,
    nestDepth: state.priorityStack.length,
    consecutivePasses: 0,
    priorityHolder: priorityHolderForStep(state.timingKey, state.activeSide),
    checkpointId: "",
  };
  state.priorityStack.push(pw);
  state.log.push(
    `Priority window open depth=${pw.nestDepth} holder=${pw.priorityHolder} (CR ${CR.priorityWindow.number}).`,
  );
  return pw;
}

/**
 * After a paid ability (or other interrupting act), reset the pass loop
 * inside the current window (CR 9.2.4d).
 */
export function nestPriorityAfterAbility(
  state: GameState,
  openedBy: string,
): void {
  const outer = ensurePriorityWindow(state);
  outer.consecutivePasses = 0;
  const frame = pushCheckpoint(
    state,
    "priority_window",
    `Nested priority after ${openedBy}`,
    [CR.nestedPriorityWindow, CR.priorityWindow],
    openedBy,
  );
  popCheckpoint(state, frame.id);
  state.log.push(
    `Nested priority after ${openedBy} — passes reset (CR ${CR.nestedPriorityWindow.number}).`,
  );
}

/**
 * Close the innermost priority window frame.
 * Returns true if the stack is now empty.
 */
export function closeInnermostPriorityWindow(state: GameState): boolean {
  const pw = state.priorityStack.pop();
  if (!pw) return true;
  const frame = pushCheckpoint(
    state,
    "priority_window",
    `Priority window closes @ ${pw.stepKey}`,
    [CR.priorityWindow, CR.timingCheckpoint],
    pw.stepKey,
  );
  popCheckpoint(state, frame.id);
  state.log.push(
    `Priority window close depth=${pw.nestDepth} @ ${pw.stepKey} (CR ${CR.priorityWindow.number}).`,
  );
  return state.priorityStack.length === 0;
}

/** Close any open frames for this step, else log a close cite. */
export function closePriorityWindow(state: GameState, stepKey: string): void {
  while (
    state.priorityStack.length > 0 &&
    state.priorityStack[state.priorityStack.length - 1]!.stepKey === stepKey
  ) {
    closeInnermostPriorityWindow(state);
  }
  if (
    state.priorityStack.length === 0 ||
    state.priorityStack[state.priorityStack.length - 1]!.stepKey !== stepKey
  ) {
    const frame = pushCheckpoint(
      state,
      "priority_window",
      "Priority window closes",
      [CR.priorityWindow, CR.timingCheckpoint],
      stepKey,
    );
    popCheckpoint(state, frame.id);
  }
}

/**
 * Record a pass. `opponentHasActions` must reflect whether the *other*
 * player has a non-pass act in this window (not the passer).
 */
export function recordPriorityPass(
  state: GameState,
  opponentHasActions: boolean,
): "still_open" | "step_closed" {
  const pw = ensurePriorityWindow(state);
  pw.consecutivePasses += 1;
  const other: Side = pw.priorityHolder === "corp" ? "runner" : "corp";
  pw.priorityHolder = other;

  if (!opponentHasActions && pw.consecutivePasses === 1) {
    pw.consecutivePasses = 2;
    state.log.push(
      `Auto-pass ${other} (no legal window actions) (CR ${CR.priority.number}).`,
    );
  }

  if (pw.consecutivePasses < 2) {
    state.log.push(
      `Pass priority → ${pw.priorityHolder} (passes=${pw.consecutivePasses}/2).`,
    );
    return "still_open";
  }

  const fullyClosed = closeInnermostPriorityWindow(state);
  if (!fullyClosed) {
    const outer = currentPriorityWindow(state);
    if (outer) outer.consecutivePasses = 0;
    return "still_open";
  }
  return "step_closed";
}

export function isWindowAct(action: Action): boolean {
  switch (action.type) {
    case "pass_window":
    case "continue_run":
    case "finish_breach":
    case "finish_access":
    case "discard_to_hand_size":
      return false;
    default:
      return true;
  }
}

export function actorSideForAction(
  action: Action,
  state: GameState,
): Side | "system" {
  switch (action.type) {
    case "rez_ice":
    case "rez_asset":
    case "play_operation":
    case "advance":
    case "score_agenda":
    case "boost_trace":
    case "choose_trash_program":
      return "corp";
    case "choose_option":
      return state.pendingChoice?.chooser ?? "system";
    case "break_subroutine":
    case "break_bioroid_subroutine":
    case "jack_out":
    case "basic_run":
    case "access_card":
    case "play_event":
    case "steal_agenda":
    case "trash_accessed":
    case "spend_link":
      return "runner";
    case "use_paid_ability": {
      const card = state.cards[action.cardId];
      return card?.side ?? "system";
    }
    case "use_identity_ability":
    case "basic_gain_credit":
    case "basic_draw":
    case "basic_install":
      return state.activeSide;
    default:
      return "system";
  }
}
