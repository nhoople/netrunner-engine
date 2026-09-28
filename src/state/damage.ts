/** Damage types + prevention hooks (CR 10.4). */

import { evalEffect } from "../effects/eval.js";
import { log } from "./createGame.js";
import { moveRunnerCardToHeap } from "./trashHooks.js";
import type { DamageType, GameState } from "./types.js";
import { CR } from "../timing/labels.js";
import { recomputeRunnerMaxHandSize } from "./handSize.js";
import { abilitiesSuppressed } from "./abilities.js";
import { pickRandomSubset } from "./rng.js";

function trashToHeap(state: GameState, cardId: string): void {
  moveRunnerCardToHeap(state, cardId);
}

/** Core damage includes the older "brain damage" alias (CR §10.4.2c). */
export function isCoreDamageType(type: DamageType): boolean {
  return type === "core" || type === "brain";
}

/**
 * True when the Runner has a payable `damage_interrupt_paw` ability
 * (AirbladeX-class). Lightweight cost check to avoid importing `costs.ts`
 * (which itself imports `dealDamage`).
 */
export function hasPayableDamageInterrupt(state: GameState): boolean {
  for (const id of state.runner.rig) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card) continue;
    for (const ab of card.paidAbilities ?? []) {
      if (!ab.windows.includes("damage_interrupt_paw")) continue;
      if (ab.requireDuringRun && !state.run) continue;
      const cost = ab.cost
        ? { ...ab.cost }
        : { clicks: ab.clickCost, credits: ab.creditCost };
      if ((cost.powerCounters ?? 0) > (card.powerCounters ?? 0)) continue;
      if ((cost.clicks ?? 0) > state.runner.clicks) continue;
      if ((cost.credits ?? 0) > state.runner.credits) continue;
      return true;
    }
  }
  return false;
}

/**
 * Apply damage. If interactive prevention is desired, set pendingDamage and
 * return "pending". Otherwise resolve with random simultaneous grip trash
 * (CR 10.4.2a / 10.4.3).
 *
 * Net/meat/core open a damage interrupt PAW when a payable prevent ability
 * exists (CR 9.9.3a / 9.9.5 / 10.4) — AirbladeX-class and future Plascrete-
 * class cards. Explicit `interactive` / Hendrik lose-clicks paths unchanged.
 */
export function dealDamage(
  state: GameState,
  type: DamageType,
  amount: number,
  sourceId: string,
  opts: {
    interactive?: boolean;
    preventByLoseAllClicks?: boolean;
    /** Suppress free prevent_damage; only interrupt paid abilities + accept. */
    interruptPawOnly?: boolean;
  } = {},
): "applied" | "pending" | "flatline" {
  if (amount <= 0) return "applied";

  let interactive = Boolean(opts.interactive);
  let interruptPawOnly = Boolean(opts.interruptPawOnly);
  const canInterrupt = hasPayableDamageInterrupt(state);
  const damageOpensInterrupt =
    type === "net" || type === "meat" || isCoreDamageType(type);

  if (
    !interactive &&
    !opts.preventByLoseAllClicks &&
    damageOpensInterrupt &&
    canInterrupt
  ) {
    interactive = true;
    interruptPawOnly = true;
  }

  if (interactive) {
    state.pendingDamage = {
      type,
      remaining: amount,
      sourceId,
      ...(opts.preventByLoseAllClicks
        ? { preventByLoseAllClicks: true }
        : {}),
      ...(interruptPawOnly ? { interruptPawOnly: true } : {}),
    };
    log(
      state,
      `Pending ${amount} ${type} damage from ${sourceId} (CR ${CR.sufferDamage.number}${
        interruptPawOnly
          ? `; interrupt PAW ${CR.preventDamage.number}`
          : ""
      }).`,
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
    recomputeRunnerMaxHandSize(state);
    state.turn.coreDamageSufferedThisTurn += amount;
    log(
      state,
      `Core damage ${amount} → BD=${state.runner.brainDamage}, max hand ${state.runner.maxHandSize} (CR ${CR.coreDamage.number}; brain alias ${CR.brainDamage.number}).`,
    );
    // Also trash from grip like net/meat for the damage amount
  }

  let left = amount;
  const toTrash = Math.min(amount, state.runner.hand.length);
  // CR 10.4.2a / 10.4.3: randomly chosen cards, trashed simultaneously.
  const picks = pickRandomSubset(state.runner.hand, toTrash);
  for (const id of picks) {
    trashToHeap(state, id);
  }
  const trashed = picks.length;
  left -= trashed;

  const cite = core
    ? CR.coreDamage
    : type === "meat"
      ? CR.meatDamage
      : CR.netDamage;
  const label = core ? "core" : type;

  log(
    state,
    `${label} damage ${amount}: trashed ${trashed} from grip simultaneously (CR ${cite.number}, ${CR.multipleDamageSimultaneous.number}, ${CR.sufferDamage.number}) source=${sourceId}.`,
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

  if (amount > 0 && !state.done) {
    const idCard = state.cards[state.corp.identityId];
    if (idCard?.powerCounterOnDamageOrTrashFromHq) {
      idCard.powerCounters = (idCard.powerCounters ?? 0) + 1;
      log(
        state,
        `${idCard.title} — place 1 power (damage) → ${idCard.powerCounters}.`,
      );
    }
  }

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

/** Prevent all pending damage by losing all remaining clicks (Mr. Hendrik). */
export function preventPendingDamageLoseAllClicks(state: GameState): void {
  const pending = state.pendingDamage;
  if (!pending?.preventByLoseAllClicks) return;
  const lost = state.runner.clicks;
  state.runner.clicks = 0;
  state.pendingDamage = null;
  log(
    state,
    `Runner loses ${lost} click(s) to prevent ${pending.remaining} ${pending.type} damage (CR ${CR.preventDamage.number}).`,
  );
}

export function acceptPendingDamage(state: GameState): "applied" | "flatline" {
  if (!state.pendingDamage) return "applied";
  const { type, remaining, sourceId } = state.pendingDamage;
  state.pendingDamage = null;
  return resolveDamage(state, type, remaining, sourceId);
}
