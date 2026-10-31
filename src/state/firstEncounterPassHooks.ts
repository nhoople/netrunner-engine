/**
 * First encounter each run (Baklan) and first pass ice each turn (Khan).
 * Notes MetPending for 10.3.1a (phase 3).
 */
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState } from "./types.js";

/** Baklan-class sources on the Runner rig. */
export function firstEncounterEachRunSourceIds(state: GameState): string[] {
  const eligible: string[] = [];
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    if (state.cards[id]?.onFirstEncounterEachRun) eligible.push(id);
  }
  return eligible;
}

/**
 * Record that the first actual encounter of the run began. Does not mark
 * pending; `markConditionalAbilities` owns that (CR 10.3.1a).
 */
export function noteFirstEncounterEachRun(state: GameState): void {
  if (!state.run) return;
  if (state.run.onFirstEncounterEachRunFired) return;
  if (state.run.firstEncounterEachRunMetPending) return;
  const iceId = state.run.encounter?.iceId;
  if (iceId && (state.run.bypassedIceIds ?? []).includes(iceId)) return;
  if (firstEncounterEachRunSourceIds(state).length === 0) return;
  state.run.onFirstEncounterEachRunFired = true;
  state.run.firstEncounterEachRunMetPending = true;
}

/** Khan: first ice passed this turn. */
export function noteFirstPassIce(state: GameState): void {
  if (state.turn.bmFirstPassIceUsedThisTurn) return;
  if (state.turn.firstPassIceMetPending) return;
  const khan = state.cards[state.runner.identityId];
  if (
    !khan?.onFirstPassIceEachTurn ||
    abilitiesSuppressed(state, khan.id)
  ) {
    return;
  }
  state.turn.firstPassIceMetPending = true;
}
