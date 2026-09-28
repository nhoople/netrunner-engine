/** Tag interrupt window helpers (CR 9.9.5 / 9.1.2a chain reactions). */

import { log } from "./createGame.js";
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState } from "./types.js";
import { CR } from "../timing/labels.js";

/** True when Runner has a payable `tag_interrupt_paw` ability (Decoy-class). */
export function hasPayableTagInterrupt(state: GameState): boolean {
  for (const id of state.runner.rig) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card) continue;
    for (const ab of card.paidAbilities ?? []) {
      if (!ab.windows.includes("tag_interrupt_paw")) continue;
      if (ab.requireDuringRun && !state.run) continue;
      const cost = ab.cost
        ? { ...ab.cost }
        : { clicks: ab.clickCost, credits: ab.creditCost };
      if ((cost.powerCounters ?? 0) > (card.powerCounters ?? 0)) continue;
      if ((cost.clicks ?? 0) > state.runner.clicks) continue;
      if ((cost.credits ?? 0) > state.runner.credits) continue;
      if (cost.trashSelf && !state.runner.rig.includes(id)) continue;
      return true;
    }
  }
  return false;
}

export function openPendingTags(
  state: GameState,
  amount: number,
  sourceId: string,
): void {
  state.pendingTags = { remaining: amount, sourceId };
  log(
    state,
    `Pending ${amount} tag(s) from ${sourceId} — interrupt PAW (CR ${CR.tags.number} / avoid).`,
  );
}

export function preventPendingTags(state: GameState, amount: number): void {
  const pending = state.pendingTags;
  if (!pending) return;
  const prevented = Math.min(amount, pending.remaining);
  pending.remaining -= prevented;
  log(
    state,
    `Avoid/prevent ${prevented} tag(s) → ${pending.remaining} remaining.`,
  );
  if (pending.remaining <= 0) {
    state.pendingTags = null;
  }
}

/** Apply remaining pending tags without reopening the interrupt. */
export function acceptPendingTags(state: GameState): void {
  if (!state.pendingTags) return;
  const { remaining } = state.pendingTags;
  state.pendingTags = null;
  if (remaining <= 0) return;
  state.runner.tags += remaining;
  state.turn.tagsGivenThisTurn += remaining;
  log(
    state,
    `Runner receives ${remaining} tag(s) → ${state.runner.tags} (CR ${CR.tags.number}).`,
  );
}
