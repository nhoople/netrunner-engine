/** Damage types + prevention hooks (CR 10.4). */

import { log } from "./createGame.js";
import { removeCardFromCurrentZone } from "./scoring.js";
import type { DamageType, GameState } from "./types.js";
import { CR } from "../timing/labels.js";

function trashToHeap(state: GameState, cardId: string): void {
  removeCardFromCurrentZone(state, cardId);
  const card = state.cards[cardId];
  state.runner.discard.push(cardId);
  card.zone = "runner:heap";
  card.faceup = true;
}

/**
 * Apply damage. If interactive prevention is desired, set pendingDamage and
 * return "pending". Heuristic auto path trashes from back of grip / applies
 * brain damage immediately.
 */
export function dealDamage(
  state: GameState,
  type: DamageType,
  amount: number,
  sourceId: string,
  opts: { interactive?: boolean } = {},
): "applied" | "pending" | "flatline" {
  if (amount <= 0) return "applied";

  if (opts.interactive) {
    state.pendingDamage = { type, remaining: amount, sourceId };
    log(
      state,
      `Pending ${amount} ${type} damage from ${sourceId} (CR ${CR.sufferDamage.number}).`,
    );
    return "pending";
  }

  return resolveDamage(state, type, amount, sourceId);
}

export function resolveDamage(
  state: GameState,
  type: DamageType,
  amount: number,
  sourceId: string,
): "applied" | "flatline" {
  if (type === "brain") {
    state.runner.brainDamage += amount;
    state.runner.maxHandSize = Math.max(0, 5 - state.runner.brainDamage);
    log(
      state,
      `Brain damage ${amount} → BD=${state.runner.brainDamage}, max hand ${state.runner.maxHandSize} (CR ${CR.brainDamage.number}).`,
    );
    // Also trash from grip like net/meat for the damage amount
  }

  let left = amount;
  let trashed = 0;
  while (left > 0 && state.runner.hand.length > 0) {
    const id = state.runner.hand[state.runner.hand.length - 1]!;
    trashToHeap(state, id);
    trashed += 1;
    left -= 1;
  }

  const cite =
    type === "brain"
      ? CR.brainDamage
      : type === "meat"
        ? CR.meatDamage
        : CR.netDamage;

  log(
    state,
    `${type} damage ${amount}: trashed ${trashed} from grip (CR ${cite.number}, ${CR.sufferDamage.number}) source=${sourceId}.`,
  );

  if (left > 0) {
    // Still owing damage with empty grip → flatline (CR 10.4.3 style).
    state.winner = "corp";
    state.winReason = "flatline";
    state.done = true;
    log(
      state,
      `Runner flatlined — could not suffer remaining ${left} ${type} damage (CR ${CR.flatline.number}).`,
    );
    return "flatline";
  }

  if (state.runner.maxHandSize < 0) {
    state.winner = "corp";
    state.winReason = "flatline";
    state.done = true;
    log(state, `Runner flatlined — max hand size < 0 (CR ${CR.flatline.number}).`);
    return "flatline";
  }

  state.pendingDamage = null;
  return "applied";
}

export function preventPendingDamage(state: GameState, amount: number): void {
  const pending = state.pendingDamage;
  if (!pending) return;
  const prevented = Math.min(amount, pending.remaining);
  pending.remaining -= prevented;
  log(
    state,
    `Prevent ${prevented} ${pending.type} damage → ${pending.remaining} remaining (CR ${CR.preventDamage.number}).`,
  );
  if (pending.remaining <= 0) {
    state.pendingDamage = null;
  }
}

export function acceptPendingDamage(state: GameState): "applied" | "flatline" {
  const pending = state.pendingDamage;
  if (!pending) return "applied";
  const { type, remaining, sourceId } = pending;
  state.pendingDamage = null;
  return resolveDamage(state, type, remaining, sourceId);
}
