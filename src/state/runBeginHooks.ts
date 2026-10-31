/**
 * First-run-begin conditionals (Stegodon / Tributary / Prognostic Q-Loop /
 * Padma / Front Company / Daredevil). Notes MetPending for 10.3.1a (phase 3).
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

/**
 * Daredevil: first run each turn on a server with ≥N ice. Does not mark
 * pending; `markConditionalAbilities` owns that (CR 10.3.1a).
 */
export function noteDaredevilFirstRun(state: GameState): void {
  if (state.turn.daredevilDrawUsedThisTurn) return;
  if (state.turn.daredevilDrawMetPending) return;
  if (!state.run) return;
  const iceCount = state.servers[state.run.attackedServerId]?.ice.length ?? 0;
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const spec = state.cards[id]?.drawOnFirstRunEachTurnIfServerIceGte;
    if (!spec || iceCount < spec.ice) continue;
    state.turn.daredevilDrawMetPending = true;
    return;
  }
}
