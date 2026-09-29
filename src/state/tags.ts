/** Tag interrupt window helpers (CR 9.9.5 / 9.1.2a chain reactions). */

import { log } from "./createGame.js";
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState } from "./types.js";
import { CR } from "../timing/labels.js";

/**
 * Acme Consulting: while encountering the outermost ice protecting any server,
 * the Runner is considered to have N additional tags (even at 0 physical).
 * Virtual tags are not removable; paid remove-tag still uses physical tags.
 * Blanked identities (Direct Access) suppress the bonus.
 */
export function additionalTagsDuringOutermostIceEncounter(
  state: GameState,
): number {
  const encIceId = state.run?.encounter?.iceId;
  if (!encIceId) return 0;
  let serverIce: string[] | null = null;
  for (const server of Object.values(state.servers)) {
    if (server.ice.includes(encIceId)) {
      serverIce = server.ice;
      break;
    }
  }
  // Outermost = index 0 (CR 6.2 / 4.6.9).
  if (!serverIce || serverIce[0] !== encIceId) return 0;
  const idCard = state.cards[state.corp.identityId];
  const bonus = idCard?.additionalTagsDuringOutermostIceEncounter ?? 0;
  if (bonus <= 0) return 0;
  if (abilitiesSuppressed(state, state.corp.identityId)) return 0;
  return bonus;
}

/** Effective tag count for "is tagged" / "number of tags" checks. */
export function effectiveRunnerTags(state: GameState): number {
  return Math.max(0, state.runner.tags) + additionalTagsDuringOutermostIceEncounter(state);
}

/** True when the Runner is considered tagged (includes Acme virtual tags). */
export function runnerIsTagged(state: GameState): boolean {
  return effectiveRunnerTags(state) > 0;
}

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
