/**
 * First successful-run families this turn (PAN-Weave / RNG Key / Zenit /
 * Virtuoso). Notes MetPending for 10.3.1a (phase 3).
 */
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState, StoredConditionalEffectKey } from "./types.js";

/** Runner rig + identity sources for a first-successful-run Effect key. */
export function firstSuccessfulRunSourceIds(
  state: GameState,
  effectKey: StoredConditionalEffectKey,
): string[] {
  const eligible: string[] = [];
  for (const id of [...state.runner.installed, state.runner.identityId]) {
    if (!id || abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card) continue;
    if (!(card as unknown as Record<string, unknown>)[effectKey]) continue;
    eligible.push(id);
  }
  return eligible;
}

/** PAN-Weave-class: first successful HQ run this turn. */
export function noteFirstSuccessfulHqRun(state: GameState): void {
  if (state.turn.firstSuccessfulHqRunMetPending) return;
  if (
    firstSuccessfulRunSourceIds(state, "onFirstSuccessfulHqRunThisTurn")
      .length === 0
  ) {
    return;
  }
  state.turn.firstSuccessfulHqRunMetPending = true;
}

/** RNG Key-class: first successful HQ or R&D run this turn. */
export function noteFirstSuccessfulHqOrRdRun(state: GameState): void {
  if (state.turn.firstSuccessfulHqOrRdRunMetPending) return;
  if (
    firstSuccessfulRunSourceIds(state, "onFirstSuccessfulHqOrRdRunThisTurn")
      .length === 0
  ) {
    return;
  }
  state.turn.firstSuccessfulHqOrRdRunMetPending = true;
}

/** Zenit-class: first successful central run this turn. */
export function noteFirstSuccessfulCentralRun(state: GameState): void {
  if (state.turn.firstSuccessfulCentralRunMetPending) return;
  if (
    firstSuccessfulRunSourceIds(state, "onFirstSuccessfulCentralRunThisTurn")
      .length === 0
  ) {
    return;
  }
  state.turn.firstSuccessfulCentralRunMetPending = true;
}

/** Virtuoso-class: first successful run on the mark this turn. */
export function noteFirstSuccessfulMarkRun(state: GameState): void {
  if (state.turn.firstSuccessfulMarkRunMetPending) return;
  if (
    firstSuccessfulRunSourceIds(state, "onFirstSuccessfulMarkRunThisTurn")
      .length === 0
  ) {
    return;
  }
  state.turn.firstSuccessfulMarkRunMetPending = true;
}
