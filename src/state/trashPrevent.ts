/** Trash-interrupt helpers for Sacrificial Construct and Harbinger (CR 9.9.4c). */

import { log } from "./createGame.js";
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState } from "./types.js";
import { CR } from "../timing/labels.js";

export type TrashInterruptResult =
  | { ok: true }
  | { ok: false; error: string; cites: { number: string; id: string }[] };

export function hasPayableTrashInterrupt(state: GameState): boolean {
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card) continue;
    for (const ab of card.paidAbilities ?? []) {
      if (!ab.windows.includes("trash_interrupt")) continue;
      const cost = ab.cost
        ? { ...ab.cost }
        : { clicks: ab.clickCost, credits: ab.creditCost };
      if ((cost.clicks ?? 0) > state.runner.clicks) continue;
      if ((cost.credits ?? 0) > state.runner.credits) continue;
      if (cost.trashSelf && !state.runner.installed.includes(id)) continue;
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
    card.zone === "runner:installed" || state.runner.installed.includes(cardId);
  if (!installed) return false;
  const facedownInterrupt =
    Boolean(card.turnFacedownInsteadOfHeapWhenTrashed) &&
    !abilitiesSuppressed(state, cardId);
  if (!facedownInterrupt && !hasPayableTrashInterrupt(state)) return false;
  state.pendingTrashPrevent = {
    cardId,
    pendingInterruptIds: facedownInterrupt ? [cardId] : [],
    trashExpected: true,
  };
  log(
    state,
    facedownInterrupt
      ? `Pending trash of ${card.title} — ${card.title}'s interrupt is pending (CR ${CR.trashing.number}).`
      : `Pending trash of ${card.title} — interrupt PAW (CR ${CR.trashing.number} / prevent).`,
  );
  return true;
}

export function preventPendingInstalledTrash(state: GameState): void {
  const pending = state.pendingTrashPrevent;
  if (!pending) return;
  const title = state.cards[pending.cardId]?.title ?? pending.cardId;
  log(state, `Prevent trash of ${title}.`);
  if ((pending.pendingInterruptIds?.length ?? 0) > 0) {
    pending.trashExpected = false;
    log(
      state,
      `${title}'s interrupt is still pending but is no longer relevant — the instruction is not expected to trash ${title} (CR ${CR.conditionalInterruptStillRelevant.number}).`,
    );
    return;
  }
  state.pendingTrashPrevent = null;
}

/** Turn the pending card facedown instead of trashing it, while that interrupt is still relevant. */
export function triggerPendingTrashInterrupt(
  state: GameState,
  cardId: string,
): TrashInterruptResult {
  const pending = state.pendingTrashPrevent;
  const card = state.cards[cardId];
  if (
    !pending ||
    !card ||
    !pending.pendingInterruptIds?.includes(cardId)
  ) {
    return {
      ok: false,
      error: "That trash interrupt is not pending.",
      cites: [CR.conditionalInterruptStillRelevant],
    };
  }
  if (pending.trashExpected === false) {
    return {
      ok: false,
      error: `${card.title}'s interrupt is still pending but is no longer relevant.`,
      cites: [CR.conditionalInterruptStillRelevant],
    };
  }
  card.faceup = false;
  state.pendingTrashPrevent = null;
  state.turn.dadOwnInstalledTrashedThisTurn =
    (state.turn.dadOwnInstalledTrashedThisTurn ?? 0) + 1;
  if (state.turn.dadOwnInstalledTrashedThisTurn === 1) {
    for (const id of state.runner.installed) {
      const installed = state.cards[id];
      const credits = installed?.gainCreditsOnFirstOwnInstalledTrashEachTurn;
      if (typeof credits === "number" && credits > 0) {
        state.runner.credits += credits;
        log(state, `${installed!.title} — gain ${credits}¢ (first own trash).`);
      }
    }
  }
  log(
    state,
    `${card.title} turns facedown instead of being trashed (CR ${CR.conditionalInterruptStillRelevant.number}).`,
  );
  return { ok: true };
}

export function acceptPendingInstalledTrash(
  state: GameState,
  trashFn: (state: GameState, cardId: string) => void,
): void {
  const pending = state.pendingTrashPrevent;
  if (!pending) return;
  if (pending.trashExpected === false) {
    const title = state.cards[pending.cardId]?.title ?? pending.cardId;
    state.pendingTrashPrevent = null;
    log(
      state,
      `Trash of ${title} is not an expected effect (CR ${CR.conditionalInterruptStillRelevant.number}).`,
    );
    return;
  }
  const id = pending.cardId;
  state.pendingTrashPrevent = null;
  state.suppressTrashPrevent = true;
  try {
    trashFn(state, id);
  } finally {
    state.suppressTrashPrevent = false;
  }
}
