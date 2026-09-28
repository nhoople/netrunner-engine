/** Deferred onEncounter (when-encountered interrupt window). */

import { evalEffect } from "../effects/eval.js";
import { abilitiesSuppressed } from "./abilities.js";
import { log } from "./createGame.js";
import type { GameState } from "./types.js";

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
