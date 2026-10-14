/** Deferred onEncounter (when-encountered interrupt window). */

import { evalEffect } from "../effects/eval.js";
import { abilitiesSuppressed } from "./abilities.js";
import { log } from "./createGame.js";
import type { GameState } from "./types.js";

/** True if Runner has a when_encountered_interrupt_paw paid ability (e.g. AirbladeX). */
export function runnerHasWhenEncounteredInterrupt(state: GameState): boolean {
  const ids = [state.runner.identityId, ...state.runner.rig];
  for (const id of ids) {
    if (!id) continue;
    const card = state.cards[id];
    if (!card || abilitiesSuppressed(state, id)) continue;
    for (const ab of card.paidAbilities ?? []) {
      if (ab.windows.includes("when_encountered_interrupt_paw")) return true;
    }
  }
  return false;
}

/**
 * A chosen-ice bypass (Femme Fatale) or Rigged Results will offer to end
 * this encounter before its on-encounter ability resolves.
 */
export function chosenIceBypassOffered(state: GameState, iceId: string): boolean {
  if ((state.run?.bypassedIceIds ?? []).includes(iceId)) return false;
  if (state.turn.ftmRiggedResultsBypassIceId === iceId) return true;
  const n = state.cards[iceId]?.subroutines?.length ?? 0;
  if (n <= 0 || state.runner.credits < n) return false;
  for (const rid of state.runner.rig) {
    if (state.cards[rid]?.chosenIceId === iceId) return true;
  }
  return false;
}

/** Fire pending onEncounter on current ice if not prevented. */
export function resolvePendingOnEncounter(state: GameState): void {
  const run = state.run;
  const enc = run?.encounter;
  if (!enc?.onEncounterPending || enc.onEncounterPrevented) {
    if (enc) enc.onEncounterPending = false;
    return;
  }
  const iceId = enc.iceId;
  const ice = state.cards[iceId];
  enc.onEncounterPending = false;
  if (
    !ice?.onEncounter ||
    abilitiesSuppressed(state, iceId) ||
    (run!.bypassedIceIds ?? []).includes(iceId)
  ) {
    return;
  }
  const r = evalEffect({ state, sourceId: iceId }, ice.onEncounter);
  if (!r.ok) {
    log(state, `onEncounter failed on ${ice.title}: ${r.error}`);
  }
}
