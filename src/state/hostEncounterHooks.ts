/**
 * Host-encounter and encounter-rezzed-after-approach conditionals.
 * Notes queues / MetPending for 10.3.1a (phase 3).
 */
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState } from "./types.js";

/** Chisel / Eavesdrop: hosted onHostEncounter — queue host ice id. */
export function noteHostEncounter(state: GameState, iceId: string): void {
  const ice = state.cards[iceId];
  if (!ice) return;
  const hosteds = [
    ...state.runner.installed.filter(
      (tid) => state.cards[tid]?.hostId === iceId,
    ),
    ...(ice.hostedCardIds ?? []),
  ];
  const seen = new Set<string>();
  let any = false;
  for (const tid of hosteds) {
    if (seen.has(tid)) continue;
    seen.add(tid);
    if (abilitiesSuppressed(state, tid)) continue;
    const hosted = state.cards[tid];
    if (!hosted?.onHostEncounter || hosted.hostId !== iceId) continue;
    any = true;
    break;
  }
  if (!any) return;
  if (!state.turn.hostEncounterPendingIceIds) {
    state.turn.hostEncounterPendingIceIds = [];
  }
  if (state.turn.hostEncounterPendingIceIds.includes(iceId)) return;
  state.turn.hostEncounterPendingIceIds.push(iceId);
}

/**
 * Identity onEncounterRezzedAfterApproach — note when ice was rezzed during
 * approach of this encounter.
 */
export function noteEncounterRezzedAfterApproach(state: GameState): void {
  if (state.turn.encounterRezzedAfterApproachMetPending) return;
  const id = state.runner.identityId;
  const card = state.cards[id];
  if (!card?.onEncounterRezzedAfterApproach) return;
  if (abilitiesSuppressed(state, id)) return;
  state.turn.encounterRezzedAfterApproachMetPending = true;
}
