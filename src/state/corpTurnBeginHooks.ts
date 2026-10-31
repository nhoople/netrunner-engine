/**
 * Corp turn-begin conditionals. Notes a pending mark list for 10.3.1a
 * (phase 3). Multiple Effect keys share one instruction checkpoint.
 */
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState, StoredConditionalEffectKey } from "./types.js";

export type CorpTurnBeginPendingMark = {
  cardId: string;
  abilityKey: string;
  effectKey: StoredConditionalEffectKey;
  controller: "corp" | "runner";
  logLine: string;
};

function pushMark(
  state: GameState,
  mark: CorpTurnBeginPendingMark,
): void {
  if (!state.turn.corpTurnBeginPending) {
    state.turn.corpTurnBeginPending = [];
  }
  const q = state.turn.corpTurnBeginPending;
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

/** Queue a Corp onTurnBegin source (rezzed / score / SSL from Runner score). */
export function noteCorpOnTurnBegin(
  state: GameState,
  cardId: string,
  logLine: string,
): void {
  const card = state.cards[cardId];
  if (!card?.onTurnBegin) return;
  if (abilitiesSuppressed(state, cardId)) return;
  pushMark(state, {
    cardId,
    abilityKey: "on-turn-begin",
    effectKey: "onTurnBegin",
    controller: "corp",
    logLine,
  });
}

/** Queue onTurnBeginIfRunnerTagged (Corp score). */
export function noteCorpOnTurnBeginIfRunnerTagged(
  state: GameState,
  cardId: string,
): void {
  if (state.runner.tags <= 0) return;
  const card = state.cards[cardId];
  if (!card?.onTurnBeginIfRunnerTagged) return;
  if (abilitiesSuppressed(state, cardId)) return;
  pushMark(state, {
    cardId,
    abilityKey: "on-turn-begin-if-runner-tagged",
    effectKey: "onTurnBeginIfRunnerTagged",
    controller: "corp",
    logLine: `${card.title} becomes pending — Corp turn begin while Runner tagged.`,
  });
}

/** Queue onCorpTurnBeginIfRunnerUntagged (Runner rig). */
export function noteOnCorpTurnBeginIfRunnerUntagged(
  state: GameState,
  cardId: string,
): void {
  if (state.runner.tags > 0) return;
  const card = state.cards[cardId];
  if (!card?.onCorpTurnBeginIfRunnerUntagged) return;
  if (abilitiesSuppressed(state, cardId)) return;
  pushMark(state, {
    cardId,
    abilityKey: "on-corp-turn-begin-if-runner-untagged",
    effectKey: "onCorpTurnBeginIfRunnerUntagged",
    controller: "runner",
    logLine: `${card.title} becomes pending — Corp turn begin while Runner untagged.`,
  });
}

/** Queue onCorpTurnBegin (Runner rig). */
export function noteOnCorpTurnBegin(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card?.onCorpTurnBegin) return;
  if (abilitiesSuppressed(state, cardId)) return;
  pushMark(state, {
    cardId,
    abilityKey: "on-corp-turn-begin",
    effectKey: "onCorpTurnBegin",
    controller: "runner",
    logLine: `${card.title} becomes pending — Corp turn begin.`,
  });
}

/**
 * Queue Tennin onTurnBeginIfNoRunnerSuccessfulRunLastTurn (Corp identity).
 */
export function noteCorpTenninTurnBegin(state: GameState): void {
  if (state.turn.successfulRunLastTurn) return;
  const identity = state.cards[state.corp.identityId];
  if (!identity?.onTurnBeginIfNoRunnerSuccessfulRunLastTurn) return;
  if (abilitiesSuppressed(state, identity.id)) return;
  pushMark(state, {
    cardId: identity.id,
    abilityKey: "on-turn-begin-no-successful-run",
    effectKey: "onTurnBeginIfNoRunnerSuccessfulRunLastTurn",
    controller: "corp",
    logLine: `${identity.title} becomes pending — the Runner made no successful run last turn (CR 5.1.2).`,
  });
}
