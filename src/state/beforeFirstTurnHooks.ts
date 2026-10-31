/**
 * Corp identity onBeforeFirstTurn (CR 1.6.7a). Notes for 10.3.1a (phase 3).
 */
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState, StoredConditionalEffectKey } from "./types.js";

export type BeforeFirstTurnPendingMark = {
  cardId: string;
  abilityKey: string;
  effectKey: StoredConditionalEffectKey;
  logLine: string;
};

function pushMark(
  state: GameState,
  mark: BeforeFirstTurnPendingMark,
): void {
  if (!state.turn.beforeFirstTurnPending) {
    state.turn.beforeFirstTurnPending = [];
  }
  const q = state.turn.beforeFirstTurnPending;
  if (
    q.some(
      (m) =>
        m.cardId === mark.cardId &&
        m.effectKey === mark.effectKey &&
        m.abilityKey === mark.abilityKey,
    )
  ) {
    return;
  }
  q.push(mark);
}

/** Queue Corp identity onBeforeFirstTurn. */
export function noteOnBeforeFirstTurn(
  state: GameState,
  cardId: string,
): void {
  if (abilitiesSuppressed(state, cardId)) return;
  const card = state.cards[cardId];
  if (!card?.onBeforeFirstTurn) return;
  pushMark(state, {
    cardId,
    abilityKey: "on-before-first-turn",
    effectKey: "onBeforeFirstTurn",
    logLine: `${card.title} becomes pending — before first turn.`,
  });
}
