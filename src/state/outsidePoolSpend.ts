/** Shackleton Grid-class: spend outside credit pool during a run. */

import { abilitiesSuppressed } from "./abilities.js";
import { evalEffect } from "../effects/eval.js";
import { log } from "./createGame.js";
import type { GameState } from "./types.js";

/** Mark that Runner spent credits outside their credit pool this run. */
export function noteOutsideCreditPoolSpendDuringRun(state: GameState): void {
  if (!state.run) return;
  state.run.outsidePoolCreditSpendThisRun = true;
}

/**
 * If the Runner spent outside-pool credits this run, offer once-per-turn
 * may-abilities on rezzed cards in the attacked server root (Shackleton).
 */
export function fireOutsidePoolSpendTriggers(state: GameState): void {
  const run = state.run;
  if (!run?.outsidePoolCreditSpendThisRun) return;
  if (state.pendingChoice) return;
  const server = state.servers[run.attackedServerId];
  if (!server) return;
  for (const id of server.root) {
    const card = state.cards[id];
    if (!card?.rezzed || !card.onSpendCreditsOutsidePoolDuringRunOncePerTurn) {
      continue;
    }
    if (abilitiesSuppressed(state, id)) continue;
    if (state.turn.outsidePoolSpendAbilityUsedIds.includes(id)) continue;
    state.turn.outsidePoolSpendAbilityUsedIds.push(id);
    run.outsidePoolCreditSpendThisRun = false;
    const r = evalEffect(
      { state, sourceId: id },
      card.onSpendCreditsOutsidePoolDuringRunOncePerTurn,
    );
    if (!r.ok) {
      log(
        state,
        `onSpendCreditsOutsidePoolDuringRunOncePerTurn failed on ${card.title}: ${r.error}`,
      );
    }
    return;
  }
}
