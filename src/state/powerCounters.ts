/**
 * Static-condition power-counter thresholds
 * (Environmental Testing–class; CR §9.6.7).
 */

import { evalEffect } from "../effects/eval.js";
import { CR } from "../timing/labels.js";
import { log } from "./createGame.js";
import type { GameState } from "./types.js";

/**
 * After power counters on `cardId` increase, if the card declares
 * `onPowerCountersGte` and current count ≥ amount, evaluate its effect.
 * Models mandatory static-condition abilities like Environmental Testing's
 * "When there are 4 or more hosted power counters…".
 */
export function maybeFirePowerCountersGte(
  state: GameState,
  cardId: string,
): void {
  const card = state.cards[cardId];
  if (!card?.onPowerCountersGte) return;
  const { amount, effect } = card.onPowerCountersGte;
  if ((card.powerCounters ?? 0) < amount) return;
  if (state.done) return;

  log(
    state,
    `${card.title} — ${card.powerCounters} power ≥ ${amount} (CR ${CR.staticCondition.number}).`,
  );
  const r = evalEffect({ state, sourceId: cardId }, effect);
  if (!r.ok) {
    log(
      state,
      `onPowerCountersGte failed on ${card.title}: ${r.error}`,
    );
  }
}
