/** Scored-agenda breaker modifiers (Stegodon MK IV). */

import { abilitiesSuppressed } from "./abilities.js";
import { resolveIceSubtypes } from "./continuousEffects.js";
import type { GameState } from "./types.js";

/** Sum of whileScoredBreakerStrengthPenaltyIfIceDerezzedThisRun from scored agendas. */
export function scoredAgendaBreakerPenaltyIfIceDerezzed(
  state: GameState,
): number {
  if (!state.run?.iceDerezzedThisRun) return 0;
  let total = 0;
  for (const id of state.corp.scoreArea) {
    if (abilitiesSuppressed(state, id)) continue;
    const c = state.cards[id];
    total += c.whileScoredBreakerStrengthPenaltyIfIceDerezzedThisRun ?? 0;
  }
  return total;
}

/** Sum of whileScored ice subtype strength bonuses (layered subtypes; M4). */
export function scoredAgendaIceSubtypeStrengthBonus(
  state: GameState,
  ice: import("./types.js").CardInstance,
): number {
  let total = 0;
  const layered = resolveIceSubtypes(state, ice.id).map((s) => s.toLowerCase());
  for (const id of state.corp.scoreArea) {
    if (abilitiesSuppressed(state, id)) continue;
    const spec = state.cards[id]?.whileScoredIceSubtypeStrengthBonus;
    if (!spec) continue;
    if (layered.includes(spec.subtype.toLowerCase())) total += spec.bonus;
  }
  return total;
}

export function scoredAgendaMeatDamageIncrease(state: GameState): number {
  let total = 0;
  for (const id of state.corp.scoreArea) {
    if (abilitiesSuppressed(state, id)) continue;
    total += state.cards[id]?.whileScoredMeatDamageIncrease ?? 0;
  }
  return total;
}
