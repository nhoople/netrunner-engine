/** Shackleton Grid-class: spend outside credit pool during a run. */

import { abilitiesSuppressed } from "./abilities.js";
import type { GameState, StoredConditionalEffectKey } from "./types.js";

export type OutsidePoolSpendPendingMark = {
  cardId: string;
  abilityKey: string;
  effectKey: StoredConditionalEffectKey;
  logLine: string;
};

function pushMark(
  state: GameState,
  mark: OutsidePoolSpendPendingMark,
): void {
  if (!state.turn.outsidePoolSpendPending) {
    state.turn.outsidePoolSpendPending = [];
  }
  const q = state.turn.outsidePoolSpendPending;
  if (
    q.some(
      (m) =>
        m.cardId === mark.cardId &&
        m.effectKey === mark.effectKey &&
        m.abilityKey === mark.abilityKey,
    )
  ) {
    return;
  }
  q.push(mark);
}

/** Mark that Runner spent credits outside their credit pool this run. */
export function noteOutsideCreditPoolSpendDuringRun(state: GameState): void {
  if (!state.run) return;
  state.run.outsidePoolCreditSpendThisRun = true;
}

/**
 * Queue once-per-turn may-abilities on rezzed cards in the attacked server
 * root (Shackleton) when the Runner spent outside-pool credits this run.
 * Notes for 10.3.1a (phase 3).
 */
export function noteOutsidePoolSpendTriggers(state: GameState): void {
  const run = state.run;
  if (!run?.outsidePoolCreditSpendThisRun) return;
  if (state.pendingChoice) return;
  const server = state.servers[run.attackedServerId];
  if (!server) return;
  for (const id of server.root) {
    const card = state.cards[id];
    if (!card?.rezzed || !card.onSpendCreditsOutsidePoolDuringRunOncePerTurn) {
      continue;
    }
    if (abilitiesSuppressed(state, id)) continue;
    if (state.turn.outsidePoolSpendAbilityUsedIds.includes(id)) continue;
    state.turn.outsidePoolSpendAbilityUsedIds.push(id);
    run.outsidePoolCreditSpendThisRun = false;
    pushMark(state, {
      cardId: id,
      abilityKey: "on-spend-credits-outside-pool-during-run-once-per-turn",
      effectKey: "onSpendCreditsOutsidePoolDuringRunOncePerTurn",
      logLine: `${card.title} becomes pending — spent credits outside the pool during a run.`,
    });
    return;
  }
}
