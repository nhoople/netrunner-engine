/**
 * Runner turn-begin conditionals. Notes a pending mark list for 10.3.1a
 * (phase 3). Multiple Effect keys share one instruction checkpoint.
 */
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState, StoredConditionalEffectKey } from "./types.js";

export type RunnerTurnBeginPendingMark = {
  cardId: string;
  abilityKey: string;
  effectKey: StoredConditionalEffectKey;
  controller: "corp" | "runner";
  logLine: string;
};

function pushMark(
  state: GameState,
  mark: RunnerTurnBeginPendingMark,
): void {
  if (!state.turn.runnerTurnBeginPending) {
    state.turn.runnerTurnBeginPending = [];
  }
  const q = state.turn.runnerTurnBeginPending;
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

/** Queue Runner identity onTurnBegin. */
export function noteRunnerIdentityOnTurnBegin(
  state: GameState,
  cardId: string,
): void {
  const card = state.cards[cardId];
  if (!card?.onTurnBegin) return;
  if (abilitiesSuppressed(state, cardId)) return;
  pushMark(state, {
    cardId,
    abilityKey: "on-turn-begin",
    effectKey: "onTurnBegin",
    controller: "runner",
    logLine: `${card.title} becomes pending — Runner turn begin.`,
  });
}

/**
 * Queue Runner-rig onTurnBegin / onTurnBeginIfCorpNoBadPublicity.
 * Skips inactive sources (CR 9.6.10).
 */
export function noteRunnerRigTurnBegin(
  state: GameState,
  cardId: string,
): void {
  if (!state.runner.installed.includes(cardId)) return;
  if (abilitiesSuppressed(state, cardId)) return;
  const card = state.cards[cardId];
  if (!card) return;
  if (
    card.onTurnBeginIfCorpNoBadPublicity &&
    (state.corp.badPublicity ?? 0) === 0
  ) {
    pushMark(state, {
      cardId,
      abilityKey: "on-turn-begin-if-corp-no-bp",
      effectKey: "onTurnBeginIfCorpNoBadPublicity",
      controller: "runner",
      logLine: `${card.title} becomes pending — Runner turn begin (Corp has no bad publicity).`,
    });
  }
  if (!card.onTurnBegin) return;
  pushMark(state, {
    cardId,
    abilityKey: "on-turn-begin",
    effectKey: "onTurnBegin",
    controller: "runner",
    logLine: `${card.title} becomes pending — Runner turn begin.`,
  });
}

/** Queue Corp onRunnerTurnBegin (rezzed root / score / current). */
export function noteOnRunnerTurnBegin(
  state: GameState,
  cardId: string,
): void {
  const card = state.cards[cardId];
  if (!card?.onRunnerTurnBegin) return;
  if (abilitiesSuppressed(state, cardId)) return;
  pushMark(state, {
    cardId,
    abilityKey: "on-runner-turn-begin",
    effectKey: "onRunnerTurnBegin",
    controller: "corp",
    logLine: `${card.title} becomes pending — Runner turn begin.`,
  });
}

/**
 * Queue onTurnBegin on an agenda in the Runner score area
 * (Project Vacheron et al.).
 */
export function noteRunnerScoreOnTurnBegin(
  state: GameState,
  cardId: string,
): void {
  const card = state.cards[cardId];
  if (!card?.onTurnBegin) return;
  if (abilitiesSuppressed(state, cardId)) return;
  if (
    card.worthZeroAgendaPointsWhileHasAgendaCounters &&
    (card.agendaCounters ?? 0) < 1
  ) {
    return;
  }
  pushMark(state, {
    cardId,
    abilityKey: "on-turn-begin",
    effectKey: "onTurnBegin",
    controller: "runner",
    logLine: `${card.title} becomes pending — Runner turn begin.`,
  });
}
