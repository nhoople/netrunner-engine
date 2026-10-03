/**
 * Static-condition hosted-credit thresholds (Side Hustle-class).
 */

import { evalEffect } from "../effects/eval.js";
import { CR } from "../timing/labels.js";
import { log } from "./createGame.js";
import type { GameState } from "./types.js";

/**
 * After hosted credits on `cardId` increase, if the card declares
 * `onHostedCreditsGte` and current count ≥ amount, evaluate its effect.
 */
/**
 * A paid ability whose whole effect is "take hosted credits" cannot be used
 * when the card has none. Sequences that place credits first (Pennyshaver)
 * are not this shape.
 */
export function directHostedTakeFromEmpty(
  hostedCredits: number | undefined,
  effect: { op?: string; action?: { kind?: string; amount?: number } } | undefined,
): boolean {
  if (effect?.op !== "do") return false;
  if (effect.action?.kind !== "take_hosted_credits") return false;
  return (hostedCredits ?? 0) <= 0;
}

export function maybeFireHostedCreditsGte(
  state: GameState,
  cardId: string,
): void {
  const card = state.cards[cardId];
  if (!card?.onHostedCreditsGte) return;
  const { amount, effect } = card.onHostedCreditsGte;
  if ((card.hostedCredits ?? 0) < amount) return;
  if (state.done) return;

  log(
    state,
    `${card.title} — ${card.hostedCredits} hosted ¢ ≥ ${amount} (CR ${CR.staticCondition.number}).`,
  );
  const r = evalEffect({ state, sourceId: cardId }, effect);
  if (!r.ok) {
    log(
      state,
      `onHostedCreditsGte failed on ${card.title}: ${r.error}`,
    );
  }
}
