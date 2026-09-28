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
