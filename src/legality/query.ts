import type {
  Action,
  GameState,
  RuleCite,
  Side,
} from "../state/types.js";
import { getStep } from "../timing/machine.js";
import { CR } from "../timing/labels.js";
import { isForbidden } from "./checkpoints.js";
import { collectCandidateActions } from "./candidates.js";

export interface WindowInfo {
  key: string;
  stepId: string;
  stepNumber: string;
  label: string;
  structure: GameState["timing"]["structure"];
  kind: string;
}

export interface LegalActionEntry {
  action: Action;
  /** Who may take this action in the current window. */
  actor: Side | "system";
  cites: RuleCite[];
}

export interface LegalityView {
  window: WindowInfo;
  activeSide: Side;
  /**
   * Who currently holds priority to act in this window (v0 stub).
   * Corp on approach PAW rez; Runner on encounter/jack-out; active player on turn actions.
   */
  priority: Side | "system";
  legal: LegalActionEntry[];
  checkpoints: GameState["checkpoints"];
  restrictions: GameState["restrictions"];
}

export type ActionExplanation =
  | {
      legal: true;
      action: Action;
      actor: Side | "system";
      cites: RuleCite[];
      window: WindowInfo;
    }
  | {
      legal: false;
      action: Action;
      reason: string;
      cites: RuleCite[];
      window: WindowInfo;
    };

function windowInfo(state: GameState): WindowInfo {
  const step = getStep(state);
  return {
    key: step.key,
    stepId: step.stepId,
    stepNumber: step.stepNumber,
    label: step.label,
    structure: step.structure,
    kind: step.kind,
  };
}

function priorityFor(state: GameState): Side | "system" {
  switch (state.timingKey) {
    case "run.approachPaw":
      return "corp";
    case "run.encounterPaw":
    case "run.jackOutWindow":
    case "breach.awaitAccess":
      return "runner";
    case "corp.takeAction":
    case "corp.actionPaw":
    case "corp.discard":
    case "corp.gainClicks":
    case "corp.mandatoryDraw":
    case "corp.actionPhaseEnd":
    case "corp.turnComplete":
      return "corp";
    case "runner.takeAction":
    case "runner.actionPaw":
    case "runner.discard":
    case "runner.gainClicks":
    case "runner.actionPhaseEnd":
    case "runner.turnComplete":
      return "runner";
    default:
      return state.activeSide;
  }
}

function citesForAction(action: Action): RuleCite[] {
  switch (action.type) {
    case "basic_gain_credit":
      return [CR.corpBasicCredit, CR.runnerBasicCredit, CR.actionPhase];
    case "basic_draw":
      return [CR.corpBasicDraw, CR.runnerBasicDraw, CR.actionPhase];
    case "basic_install":
      return [CR.corpBasicInstall, CR.runnerBasicInstall, CR.installing];
    case "basic_run":
      return [CR.runnerBasicRun, CR.announceServer];
    case "rez_ice":
      return [CR.rezInPaw, CR.rezIceRestriction, CR.rezProcedure];
    case "break_subroutine":
      return [CR.encounterBreakPaw, CR.fullyBreak];
    case "jack_out":
      return [CR.jackOutMovement, CR.jackingOut];
    case "continue_run":
    case "pass_window":
      return [CR.priorityWindow];
    case "access_card":
    case "finish_breach":
      return [CR.breach];
    case "discard_to_hand_size":
      return [CR.maxHandSize];
    default:
      return [];
  }
}

function actorFor(action: Action, state: GameState): Side | "system" {
  switch (action.type) {
    case "rez_ice":
      return "corp";
    case "break_subroutine":
    case "jack_out":
    case "continue_run":
    case "basic_run":
    case "access_card":
    case "finish_breach":
      return "runner";
    case "basic_gain_credit":
    case "basic_draw":
    case "basic_install":
    case "discard_to_hand_size":
      return state.activeSide;
    case "pass_window":
      return priorityFor(state);
    default:
      return "system";
  }
}

/**
 * Rich legality snapshot for the current timing window.
 * Driven by the step graph + cannot restrictions + resource checks.
 */
export function queryLegality(state: GameState): LegalityView {
  const window = windowInfo(state);
  const candidates = collectCandidateActions(state);
  const legal: LegalActionEntry[] = [];

  for (const action of candidates) {
    const explanation = explainAction(state, action);
    if (explanation.legal) {
      legal.push({
        action,
        actor: explanation.actor,
        cites: explanation.cites,
      });
    }
  }

  return {
    window,
    activeSide: state.activeSide,
    priority: priorityFor(state),
    legal,
    checkpoints: [...state.checkpoints],
    restrictions: [...state.restrictions],
  };
}

/** Flat action list (compat with CLI / demos). */
export function legalActions(state: GameState): Action[] {
  return queryLegality(state).legal.map((e) => e.action);
}

export function isActionLegal(state: GameState, action: Action): boolean {
  return explainAction(state, action).legal;
}

/**
 * Explain whether an action is legal now, with CR / appendix citations.
 */
export function explainAction(
  state: GameState,
  action: Action,
): ActionExplanation {
  const window = windowInfo(state);

  if (state.done && action.type !== "pass_window") {
    return {
      legal: false,
      action,
      reason: "Game marked done.",
      cites: [],
      window,
    };
  }

  // Cannot precedence (CR 1.2.2)
  const forbidKey =
    action.type === "continue_run" ? null : (action.type as ForbiddenActionLike);
  if (forbidKey && isForbiddenActionType(forbidKey)) {
    const restriction = isForbidden(state, forbidKey);
    if (restriction) {
      return {
        legal: false,
        action,
        reason: `Cannot ${restriction.forbid}: forbidden by ${restriction.source}`,
        cites: [restriction.cite, CR.cannotPrecedence],
        window,
      };
    }
  }

  // Window / phase gates
  const gate = gateAction(state, action);
  if (!gate.ok) {
    return {
      legal: false,
      action,
      reason: gate.reason,
      cites: gate.cites,
      window,
    };
  }

  // Must appear among concrete candidates (resources, targets)
  const candidates = collectCandidateActions(state);
  if (!candidates.some((c) => actionsEqual(c, action))) {
    return {
      legal: false,
      action,
      reason: "Action is not available in this window (missing target, resources, or side).",
      cites: citesForAction(action),
      window,
    };
  }

  return {
    legal: true,
    action,
    actor: actorFor(action, state),
    cites: citesForAction(action),
    window,
  };
}

type ForbiddenActionLike = Parameters<typeof isForbidden>[1];

function isForbiddenActionType(
  t: string,
): t is ForbiddenActionLike {
  return [
    "jack_out",
    "basic_run",
    "basic_gain_credit",
    "basic_draw",
    "basic_install",
    "rez_ice",
    "break_subroutine",
  ].includes(t);
}

function gateAction(
  state: GameState,
  action: Action,
): { ok: true } | { ok: false; reason: string; cites: RuleCite[] } {
  const step = getStep(state);

  switch (action.type) {
    case "basic_gain_credit":
    case "basic_draw":
    case "basic_install":
    case "basic_run": {
      if (state.run) {
        return {
          ok: false,
          reason: "Cannot take turn actions during a run.",
          cites: [CR.runnerBasicRun, CR.actionPhase, CR.actionsOutsidePhase],
        };
      }
      if (step.kind !== "action" || !step.allows?.includes(action.type)) {
        return {
          ok: false,
          reason: `Basic action illegal outside take-action step (at ${step.key}).`,
          cites: [CR.actionPhase, CR.actionsOutsidePhase, CR.basicActions],
        };
      }
      if (action.type === "basic_run" && state.activeSide !== "runner") {
        return {
          ok: false,
          reason: "Only the Runner may make a run.",
          cites: [CR.runnerBasicRun],
        };
      }
      return { ok: true };
    }
    case "rez_ice":
      if (state.timingKey !== "run.approachPaw") {
        return {
          ok: false,
          reason: "Rez ice only during approach PAW (11.4_2_b).",
          cites: [CR.rezInPaw, CR.rezIceRestriction],
        };
      }
      return { ok: true };
    case "break_subroutine":
      if (state.timingKey !== "run.encounterPaw") {
        return {
          ok: false,
          reason: "Break only during encounter PAW (11.4_3_b).",
          cites: [CR.encounterBreakPaw],
        };
      }
      return { ok: true };
    case "jack_out":
    case "continue_run":
      if (state.timingKey !== "run.jackOutWindow") {
        return {
          ok: false,
          reason: "Jack out / continue only during movement jack-out step (11.4_4_c).",
          cites: [CR.jackOutMovement, CR.jackOutAfterPass],
        };
      }
      return { ok: true };
    case "pass_window":
      if (step.kind !== "pass") {
        return {
          ok: false,
          reason: `Cannot pass at ${step.key} (kind=${step.kind}).`,
          cites: [CR.priorityWindow],
        };
      }
      return { ok: true };
    case "discard_to_hand_size":
      if (step.kind !== "discard") {
        return {
          ok: false,
          reason: "Discard only during discard step.",
          cites: [CR.maxHandSize],
        };
      }
      return { ok: true };
    case "access_card":
    case "finish_breach":
      if (step.kind !== "access") {
        return {
          ok: false,
          reason: "Access only during breach access window.",
          cites: [CR.breach],
        };
      }
      return { ok: true };
    default:
      return { ok: true };
  }
}

function actionsEqual(a: Action, b: Action): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
