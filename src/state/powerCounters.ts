/**
 * Static-condition power-counter thresholds
 * (Environmental Testing–class; CR §9.6.7).
 */

import { evalEffect } from "../effects/eval.js";
import { CR } from "../timing/labels.js";
import { log } from "./createGame.js";
import type { CardInstance, GameState } from "./types.js";
import type { Effect } from "../effects/ir.js";

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

/**
 * Envelopment-class: ice gains an ETR subroutine before printed ones
 * for each hosted power counter. Rebuilds `subroutines` from
 * `baseSubroutines` + N synthetic ETR leaves.
 */
export function syncEtrPerPowerCounterSubs(card: CardInstance): void {
  if (!card.etrSubroutinesPerPowerCounter) return;
  if (!card.baseSubroutines) {
    card.baseSubroutines = card.subroutines
      ? structuredClone(card.subroutines)
      : [];
  }
  const n = Math.max(0, card.powerCounters ?? 0);
  const etrEffect: Effect = {
    op: "do",
    action: { kind: "end_the_run" },
  };
  const etrSubs = Array.from({ length: n }, (_, i) => ({
    id: `${card.defId}-etr-power-${i}`,
    text: "End the run.",
    effect: structuredClone(etrEffect),
  }));
  card.subroutines = [...etrSubs, ...structuredClone(card.baseSubroutines)];
}
