/**
 * Encounter-begin conditionals (any-ice once / Compile first encounter).
 * Notes queues for 10.3.1a (phase 3).
 */
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState, StoredConditionalEffectKey } from "./types.js";

export type EncounterAbilityPendingMark = {
  cardId: string;
  abilityKey: string;
  effectKey: StoredConditionalEffectKey;
  mandatory: boolean;
  logLine: string;
};

function pushMark(
  state: GameState,
  mark: EncounterAbilityPendingMark,
): void {
  if (!state.turn.encounterAbilityPending) {
    state.turn.encounterAbilityPending = [];
  }
  const q = state.turn.encounterAbilityPending;
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

/**
 * Queue onEncounterAnyIceOncePerTurn. Also records first-encountered ice
 * for the run when unset.
 */
export function noteEncounterAnyIceOncePerTurn(state: GameState): void {
  const encountered = state.run?.encounter?.iceId;
  if (state.run && encountered && !state.run.firstEncounteredIceId) {
    state.run.firstEncounteredIceId = encountered;
  }
  if (state.turn.encounterAnyIceHookFiredThisTurn) return;
  let noted = false;
  const ids = [state.runner.identityId, ...state.runner.installed];
  for (const id of ids) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.onEncounterAnyIceOncePerTurn) continue;
    pushMark(state, {
      cardId: id,
      abilityKey: "on-encounter-any-ice-once",
      effectKey: "onEncounterAnyIceOncePerTurn",
      mandatory: false,
      logLine: `${card.title} becomes pending — encounter ice, once this turn (CR 6.5).`,
    });
    noted = true;
  }
  if (noted) state.turn.encounterAnyIceHookFiredThisTurn = true;
}

/** Queue Compile-class runEvent.onFirstEncounterThisRun. */
export function noteCompileFirstEncounter(state: GameState): void {
  const run = state.run;
  const eventId = state.playedRunEventId;
  if (!run || !eventId || run.compileFirstEncounterFired) return;
  if (abilitiesSuppressed(state, eventId)) return;
  const event = state.cards[eventId];
  if (!event?.runEvent?.onFirstEncounterThisRun) return;
  run.compileFirstEncounterFired = true;
  pushMark(state, {
    cardId: eventId,
    abilityKey: "run-event-first-encounter",
    effectKey: "runEvent.onFirstEncounterThisRun",
    mandatory: false,
    logLine: `${event.title} becomes pending — first encounter this run (CR 6.5).`,
  });
}
