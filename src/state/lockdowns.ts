/**
 * Lockdown operations (CR 3.5.1c / 8.6.6c): play gate, play-area linger,
 * Corp-turn-begin trash, and helpers for continuous/hook iteration.
 */
import { log } from "./createGame.js";
import type { CardInstance, GameState } from "./types.js";
import { CR } from "../timing/labels.js";

/** True when the card is a lockdown subtype. */
export function isLockdownCard(card: CardInstance | undefined): boolean {
  return Boolean(card?.subtypes?.includes("lockdown"));
}

/**
 * Active lockdowns linger faceup in `corp:play-area` until Corp's next turn
 * begins (CR 8.6.6c).
 */
export function activeLockdownIds(state: GameState): string[] {
  const out: string[] = [];
  for (const card of Object.values(state.cards)) {
    if (card.zone === "corp:play-area" && isLockdownCard(card)) {
      out.push(card.id);
    }
  }
  return out;
}

export function hasActiveLockdown(state: GameState): boolean {
  return activeLockdownIds(state).length > 0;
}

/** Sum of `allIceStrengthBonus` from active play-area lockdowns. */
export function allIceStrengthBonusFromLockdowns(state: GameState): number {
  let bonus = 0;
  for (const id of activeLockdownIds(state)) {
    bonus += state.cards[id]?.allIceStrengthBonus ?? 0;
  }
  return bonus;
}

/**
 * Extra steal cost from active lockdowns with `stealAdditionalCreditsFormula`
 * (NAPD Cordon: base + perAdvancement × agenda advancement tokens).
 */
export function stealAdditionalCreditsFromActiveLockdowns(
  state: GameState,
  agendaId: string,
): number {
  const agenda = state.cards[agendaId];
  const adv = agenda?.advancementTokens ?? 0;
  let total = 0;
  for (const id of activeLockdownIds(state)) {
    const formula = state.cards[id]?.stealAdditionalCreditsFormula;
    if (!formula) continue;
    total += formula.base + formula.perAdvancement * adv;
  }
  return total;
}

/** NEXT Activation Command-class: cannot break with non-icebreaker cards. */
export function cannotBreakExceptIcebreakerActive(state: GameState): boolean {
  for (const id of activeLockdownIds(state)) {
    if (state.cards[id]?.cannotBreakExceptIcebreaker) return true;
  }
  return false;
}

export function cardHasIcebreakerSubtype(
  card: CardInstance | undefined,
): boolean {
  return Boolean(card?.subtypes?.includes("icebreaker"));
}

/**
 * Trash all active lockdowns at Corp turn begin, before pending conditionals
 * (CR 3.5.1c). Play-area cards are zone-only (not in hand/discard arrays).
 */
export function trashActiveLockdownsAtCorpTurnBegin(state: GameState): void {
  const ids = activeLockdownIds(state);
  if (ids.length === 0) return;
  for (const id of ids) {
    const card = state.cards[id];
    if (!card) continue;
    card.zone = "corp:archives";
    card.faceup = true;
    card.rezzed = false;
    if (!state.corp.discard.includes(id)) {
      state.corp.discard.push(id);
    }
    log(
      state,
      `${card.title} trashed at Corp turn begin (lockdown linger ends; CR ${CR.lockdownOperation.number} / ${CR.playNotTrashedUntil.number}).`,
    );
  }
}
