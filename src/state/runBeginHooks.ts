/**
 * First-run-begin conditionals (Stegodon / Tributary / Prognostic Q-Loop /
 * Padma / Front Company). Notes MetPending for 10.3.1a (phase 3).
 */
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState } from "./types.js";

/** Stegodon / Tributary / Prognostic — first run begin this turn. */
export function noteFirstRunBegin(state: GameState): void {
  if (state.turn.runBeginThisTurnUsed) return;
  if (state.turn.firstRunBeginMetPending) return;
  if (!anyFirstRunBeginSource(state)) return;
  state.turn.firstRunBeginMetPending = true;
}

/** Padma — first R&D run begin this turn. */
export function noteFirstRdRunBegin(state: GameState): void {
  if (state.turn.rdRunBegunThisTurn) return;
  state.turn.rdRunBegunThisTurn = true;
  if (state.turn.firstRdRunBeginMetPending) return;
  const idCard = state.cards[state.runner.identityId];
  if (
    !idCard?.onFirstRdRunBeginThisTurn ||
    abilitiesSuppressed(state, idCard.id)
  ) {
    return;
  }
  state.turn.firstRdRunBeginMetPending = true;
}

/** Front Company — first Archives run begin this turn. */
export function noteFirstArchivesRunBegin(state: GameState): void {
  if (state.turn.archivesRunBegunThisTurn) return;
  state.turn.archivesRunBegunThisTurn = true;
  if (state.turn.firstArchivesRunBeginMetPending) return;
  for (const server of Object.values(state.servers)) {
    for (const id of server.root) {
      if (abilitiesSuppressed(state, id)) continue;
      const card = state.cards[id];
      if (!card?.rezzed || !card.onFirstArchivesRunBeginThisTurn) continue;
      state.turn.firstArchivesRunBeginMetPending = true;
      return;
    }
  }
}

function anyFirstRunBeginSource(state: GameState): boolean {
  for (const id of state.corp.scoreArea) {
    if (abilitiesSuppressed(state, id)) continue;
    if (state.cards[id]?.onFirstRunBeginThisTurn) return true;
  }
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.ice, ...server.root]) {
      if (abilitiesSuppressed(state, id)) continue;
      const card = state.cards[id];
      if (card?.rezzed && card.onFirstRunBeginThisTurn) return true;
    }
  }
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    if (state.cards[id]?.onFirstRunBeginThisTurn) return true;
  }
  return false;
}
