/**
 * Always Be Running: the first click must start a run, unless the Runner
 * declines an additional cost on that run (CR 9.12.3e).
 */
import { abilitiesSuppressed } from "./abilities.js";
import type { Action, GameState } from "./types.js";

export function firstClickMustIsActive(state: GameState): boolean {
  if ((state.turn.runnerClicksSpentThisTurn ?? 0) > 0) return false;
  if (state.turn.firstClickMustSatisfied) return false;
  return state.runner.installed.some(
    (id) =>
      !abilitiesSuppressed(state, id) &&
      state.cards[id]?.firstClickMustBeRunOrRunEvent,
  );
}

export function actionMeetsFirstClickMust(
  state: GameState,
  action: Action,
): boolean {
  if (action.type === "basic_run") return true;
  if (action.type === "play_event") {
    const card = state.cards[action.cardId];
    return (
      Boolean(card?.runEvent) ||
      (card?.subtypes ?? []).some((name) => name.toLowerCase() === "run")
    );
  }
  if (action.type === "use_paid_ability" && action.cardId && action.abilityId) {
    const card = state.cards[action.cardId];
    return Boolean(
      card?.paidAbilities?.find((ability) => ability.id === action.abilityId)
        ?.startsRun,
    );
  }
  return false;
}

const RESTRICTED_CLICKS = new Set<Action["type"]>([
  "basic_gain_credit",
  "basic_draw",
  "basic_install",
  "basic_remove_tag",
  "play_event",
  "use_paid_ability",
  "use_identity_ability",
]);

export function firstClickMustBlocks(state: GameState, action: Action): boolean {
  if (state.activeSide !== "runner") return false;
  if (!firstClickMustIsActive(state)) return false;
  if (!RESTRICTED_CLICKS.has(action.type)) return false;
  return !actionMeetsFirstClickMust(state, action);
}
