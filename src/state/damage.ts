/** Damage types + prevention hooks (CR 10.4). */

import { evalEffect } from "../effects/eval.js";
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

/** Core damage includes the older "brain damage" alias (CR §10.4.2c). */
export function isCoreDamageType(type: DamageType): boolean {
  return type === "core" || type === "brain";
}

/**
 * Apply damage. If interactive prevention is desired, set pendingDamage and
 * return "pending". Heuristic auto path trashes from back of grip / applies
 * core damage immediately.
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
  const core = isCoreDamageType(type);
  const beforeCore = state.turn.coreDamageSufferedThisTurn;

  if (core) {
    state.runner.brainDamage += amount;
    state.runner.maxHandSize = Math.max(0, 5 - state.runner.brainDamage);
    state.turn.coreDamageSufferedThisTurn += amount;
    log(
      state,
      `Core damage ${amount} → BD=${state.runner.brainDamage}, max hand ${state.runner.maxHandSize} (CR ${CR.coreDamage.number}; brain alias ${CR.brainDamage.number}).`,
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

  const cite = core
    ? CR.coreDamage
    : type === "meat"
      ? CR.meatDamage
      : CR.netDamage;
  const label = core ? "core" : type;

  log(
    state,
    `${label} damage ${amount}: trashed ${trashed} from grip (CR ${cite.number}, ${CR.sufferDamage.number}) source=${sourceId}.`,
  );

  if (left > 0) {
    // Still owing damage with empty grip → flatline (CR 10.4.3 style).
    state.winner = "corp";
    state.winReason = "flatline";
    state.done = true;
    log(
      state,
      `Runner flatlined — could not suffer remaining ${left} ${label} damage (CR ${CR.flatline.number}).`,
    );
    state.pendingDamage = null;
    return "flatline";
  }

  if (state.runner.maxHandSize < 0) {
    state.winner = "corp";
    state.winReason = "flatline";
    state.done = true;
    log(state, `Runner flatlined — max hand size < 0 (CR ${CR.flatline.number}).`);
    state.pendingDamage = null;
    return "flatline";
  }

  state.pendingDamage = null;

  // First core damage this turn → Runner identity trigger (Esâ).
  if (core && beforeCore === 0 && amount > 0 && !state.done) {
    const idCard = state.cards[state.runner.identityId];
    if (idCard?.onFirstCoreDamageThisTurn) {
      const r = evalEffect(
        { state, sourceId: idCard.id },
        idCard.onFirstCoreDamageThisTurn,
      );
      if (!r.ok) {
        log(
          state,
          `onFirstCoreDamageThisTurn failed on ${idCard.title}: ${r.error}`,
        );
      }
    }
  }

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
