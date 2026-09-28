/** Scored-agenda breaker modifiers (Stegodon MK IV). */

import type { GameState } from "./types.js";

/** Sum of whileScoredBreakerStrengthPenaltyIfIceDerezzedThisRun from scored agendas. */
export function scoredAgendaBreakerPenaltyIfIceDerezzed(
  state: GameState,
): number {
  if (!state.run?.iceDerezzedThisRun) return 0;
  let total = 0;
  for (const id of state.corp.score) {
    const c = state.cards[id];
    total += c.whileScoredBreakerStrengthPenaltyIfIceDerezzedThisRun ?? 0;
  }
  return total;
}
