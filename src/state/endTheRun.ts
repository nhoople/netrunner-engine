/** End-the-run interrupt window helpers (Lucky Charm-class; CR 9.9.3a). */

import { log } from "./createGame.js";
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState } from "./types.js";
import { CR } from "../timing/labels.js";

/** True when Runner has a payable `end_the_run_interrupt_paw` ability. */
export function hasPayableEndTheRunInterrupt(state: GameState): boolean {
  if (!state.turn.successfulHqRunThisTurn) return false;
  for (const id of state.runner.rig) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card) continue;
    for (const ab of card.paidAbilities ?? []) {
      if (!ab.windows.includes("end_the_run_interrupt_paw")) continue;
      if (
        ab.requiresSuccessfulHqRunThisTurn &&
        !state.turn.successfulHqRunThisTurn
      ) {
        continue;
      }
      const cost = ab.cost
        ? { ...ab.cost }
        : { clicks: ab.clickCost, credits: ab.creditCost };
      if ((cost.powerCounters ?? 0) > (card.powerCounters ?? 0)) continue;
      if ((cost.clicks ?? 0) > state.runner.clicks) continue;
      if ((cost.credits ?? 0) > state.runner.credits) continue;
      if (cost.rfgSelf && !state.runner.rig.includes(id)) continue;
      if (cost.trashSelf && !state.runner.rig.includes(id)) continue;
      return true;
    }
  }
  return false;
}

export function openPendingEndTheRun(
  state: GameState,
  sourceId: string,
  fromCorpCardAbility: boolean,
): void {
  state.pendingEndTheRun = { sourceId, fromCorpCardAbility };
  log(
    state,
    `Pending end the run from ${sourceId} — interrupt PAW (CR ${CR.endTheRun.number}).`,
  );
}

/** Clear pending ETR without ending the run (Lucky Charm prevent). */
export function preventPendingEndTheRun(state: GameState): void {
  if (!state.pendingEndTheRun) return;
  log(state, `Prevent end the run (Corp card ability interrupted).`);
  state.pendingEndTheRun = null;
}

/** Apply pending ETR (accept / no prevent). */
export function acceptPendingEndTheRun(state: GameState): void {
  if (!state.pendingEndTheRun) return;
  state.pendingEndTheRun = null;
  if (!state.run) return;
  state.run.endedTheRun = true;
  state.run.successful = false;
  log(
    state,
    `End the run (CR ${CR.endTheRun.number}) — run is unsuccessful.`,
  );
}
