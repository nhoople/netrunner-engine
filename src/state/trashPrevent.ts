/** Trash-interrupt helpers for Sacrificial Construct-class (CR 9.9.5). */

import { log } from "./createGame.js";
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState } from "./types.js";
import { CR } from "../timing/labels.js";

export function hasPayableTrashInterrupt(state: GameState): boolean {
  for (const id of state.runner.rig) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card) continue;
    for (const ab of card.paidAbilities ?? []) {
      if (!ab.windows.includes("trash_interrupt_paw")) continue;
      const cost = ab.cost
        ? { ...ab.cost }
        : { clicks: ab.clickCost, credits: ab.creditCost };
      if ((cost.clicks ?? 0) > state.runner.clicks) continue;
      if ((cost.credits ?? 0) > state.runner.credits) continue;
      if (cost.trashSelf && !state.runner.rig.includes(id)) continue;
      return true;
    }
  }
  return false;
}

/**
 * If an installed program/hardware is about to be trashed and a trash
 * interrupt is payable, open pendingTrashPrevent and return true (caller
 * must not trash yet).
 */
export function maybeOpenTrashPrevent(
  state: GameState,
  cardId: string,
): boolean {
  if (state.suppressTrashPrevent) return false;
  if (state.pendingTrashPrevent) return false;
  const card = state.cards[cardId];
  if (!card) return false;
  if (card.type !== "program" && card.type !== "hardware" && card.type !== "resource") {
    return false;
  }
  const installed =
    card.zone === "runner:rig" || state.runner.rig.includes(cardId);
  if (!installed) return false;
  if (!hasPayableTrashInterrupt(state)) return false;
  state.pendingTrashPrevent = { cardId };
  log(
    state,
    `Pending trash of ${card.title} — interrupt PAW (CR ${CR.trashing.number} / prevent).`,
  );
  return true;
}

export function preventPendingInstalledTrash(state: GameState): void {
  const pending = state.pendingTrashPrevent;
  if (!pending) return;
  log(
    state,
    `Prevent trash of ${state.cards[pending.cardId]?.title ?? pending.cardId}.`,
  );
  state.pendingTrashPrevent = null;
}

export function acceptPendingInstalledTrash(
  state: GameState,
  trashFn: (state: GameState, cardId: string) => void,
): void {
  const pending = state.pendingTrashPrevent;
  if (!pending) return;
  const id = pending.cardId;
  state.pendingTrashPrevent = null;
  state.suppressTrashPrevent = true;
  try {
    trashFn(state, id);
  } finally {
    state.suppressTrashPrevent = false;
  }
}
