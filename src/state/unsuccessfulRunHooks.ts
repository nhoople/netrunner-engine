/**
 * First unsuccessful run this turn (John Masanori-class). Notes MetPending
 * for 10.3.1a (phase 3).
 */
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState } from "./types.js";

/**
 * Sources that may mark for first unsuccessful run this turn (Runner rig /
 * identities / rezzed Corp root+ice).
 */
export function firstUnsuccessfulRunSourceIds(state: GameState): string[] {
  const eligible: string[] = [];
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    if (state.cards[id]?.onFirstUnsuccessfulRunThisTurn) eligible.push(id);
  }
  for (const id of [state.runner.identityId, state.corp.identityId]) {
    if (!id || abilitiesSuppressed(state, id)) continue;
    if (state.cards[id]?.onFirstUnsuccessfulRunThisTurn) eligible.push(id);
  }
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root, ...server.ice]) {
      if (abilitiesSuppressed(state, id)) continue;
      const card = state.cards[id];
      if (!card?.rezzed || !card.onFirstUnsuccessfulRunThisTurn) continue;
      eligible.push(id);
    }
  }
  return eligible;
}

/**
 * Record that the first unsuccessful run of the turn was declared. Does not
 * mark pending; `markConditionalAbilities` owns that (CR 10.3.1a).
 */
export function noteFirstUnsuccessfulRun(state: GameState): void {
  if (state.turn.firstUnsuccessfulRunMetPending) return;
  if (firstUnsuccessfulRunSourceIds(state).length === 0) return;
  state.turn.firstUnsuccessfulRunMetPending = true;
}
