/** Per-turn bookkeeping for Gateway abilities (successful runs, once-per-turn, etc.). */

import type { GameState, TurnBookkeeping } from "./types.js";

export function emptyTurnBookkeeping(
  prev?: Partial<TurnBookkeeping>,
): TurnBookkeeping {
  return {
    successfulRunThisTurn: false,
    successfulRunLastTurn: prev?.successfulRunLastTurn ?? false,
    agendaPointsScoredThisTurn: 0,
    programsInstalledThisTurn: 0,
    basicDrawsThisTurn: 0,
    usedAbilities: [],
    installedThisTurn: [],
    cannotScoreAgendas: false,
    tagsGivenThisTurn: 0,
    hqBreachesThisTurn: 0,
    serversRunThisTurn: [],
    zahyaRunEndUsed: false,
    reneAccessTrashUsed: false,
    carnivoreAccessTrashUsed: false,
    iceRezzedThisTurn: 0,
    runEventsPlayedThisTurn: 0,
    firstEncounterUsedThisTurn: false,
    remotesCreatedThisTurn: 0,
  };
}

/** Reset Corp-side counters at the start of the Corp turn. */
export function beginCorpTurnFlags(state: GameState): void {
  state.turn = {
    ...state.turn,
    // Runner's just-ended turn success becomes "last turn" for Corp ops (Public Trail).
    successfulRunLastTurn: state.turn.successfulRunThisTurn,
    successfulRunThisTurn: false,
    agendaPointsScoredThisTurn: 0,
    basicDrawsThisTurn: 0,
    usedAbilities: [],
    installedThisTurn: [],
    cannotScoreAgendas: false,
    tagsGivenThisTurn: 0,
  };
}

/** Reset Runner-side counters at the start of the Runner turn. */
export function beginRunnerTurnFlags(state: GameState): void {
  state.turn = emptyTurnBookkeeping({
    successfulRunLastTurn: state.turn.successfulRunLastTurn,
  });
}

export function markAbilityUsed(
  state: GameState,
  cardId: string,
  abilityId: string,
): void {
  state.turn.usedAbilities.push(`${cardId}:${abilityId}`);
}

export function wasAbilityUsed(
  state: GameState,
  cardId: string,
  abilityId: string,
): boolean {
  return state.turn.usedAbilities.includes(`${cardId}:${abilityId}`);
}

export function icebreakerCount(state: GameState): number {
  return state.runner.rig.filter((id) => {
    const c = state.cards[id];
    return Boolean(c?.breaker) || (c?.subtypes ?? []).includes("icebreaker");
  }).length;
}

export function usedMemory(state: GameState): number {
  return state.runner.rig.reduce((sum, id) => {
    const c = state.cards[id];
    if (c.type !== "program") return sum;
    return sum + (c.memoryCost ?? 1);
  }, 0);
}

export function memoryLimit(state: GameState): number {
  let limit = state.runner.memoryLimit;
  for (const id of state.runner.rig) {
    const c = state.cards[id];
    if (c.muBonus) limit += c.muBonus;
  }
  return limit;
}
