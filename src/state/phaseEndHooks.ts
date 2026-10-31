/**
 * Action-phase end conditionals. Notes queues for 10.3.1a (phase 3).
 */
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState, StoredConditionalEffectKey } from "./types.js";

export type ActionPhaseEndPendingMark = {
  cardId: string;
  abilityKey: string;
  effectKey: StoredConditionalEffectKey;
  controller: "corp" | "runner";
  logLine: string;
};

function pushCorp(state: GameState, mark: ActionPhaseEndPendingMark): void {
  if (!state.turn.corpActionPhaseEndPending) {
    state.turn.corpActionPhaseEndPending = [];
  }
  const q = state.turn.corpActionPhaseEndPending;
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

function pushRunner(state: GameState, mark: ActionPhaseEndPendingMark): void {
  if (!state.turn.runnerActionPhaseEndPending) {
    state.turn.runnerActionPhaseEndPending = [];
  }
  const q = state.turn.runnerActionPhaseEndPending;
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

/** Queue Corp action-phase-end conditionals (identity / rezzed roots / score). */
export function noteCorpActionPhaseEnd(state: GameState): void {
  const corpIdentity = state.cards[state.corp.identityId];
  if (corpIdentity?.onCorpActionPhaseEnd) {
    if (!abilitiesSuppressed(state, corpIdentity.id)) {
      pushCorp(state, {
        cardId: corpIdentity.id,
        abilityKey: "on-corp-action-phase-end",
        effectKey: "onCorpActionPhaseEnd",
        controller: "corp",
        logLine: `${corpIdentity.title} becomes pending — Corp action phase ends.`,
      });
    }
  }
  for (const server of Object.values(state.servers)) {
    for (const id of server.root) {
      if (abilitiesSuppressed(state, id)) continue;
      const card = state.cards[id];
      if (!card?.onCorpActionPhaseEnd) continue;
      if (!card.rezzed && !card.persistent) continue;
      pushCorp(state, {
        cardId: id,
        abilityKey: "on-corp-action-phase-end",
        effectKey: "onCorpActionPhaseEnd",
        controller: "corp",
        logLine: `${card.title} becomes pending — Corp action phase ends.`,
      });
    }
  }
  for (const id of state.corp.scoreArea) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.onCorpActionPhaseEnd) continue;
    pushCorp(state, {
      cardId: id,
      abilityKey: "on-corp-action-phase-end",
      effectKey: "onCorpActionPhaseEnd",
      controller: "corp",
      logLine: `${card.title} becomes pending — Corp action phase ends.`,
    });
  }
}

/** Queue Runner action-phase-end conditionals (rig + Méliès U Corp ID). */
export function noteRunnerActionPhaseEnd(state: GameState): void {
  for (const id of [...state.runner.installed]) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.onRunnerActionPhaseEnd) continue;
    pushRunner(state, {
      cardId: id,
      abilityKey: "on-runner-action-phase-end",
      effectKey: "onRunnerActionPhaseEnd",
      controller: "runner",
      logLine: `${card.title} becomes pending — Runner action phase ends.`,
    });
  }
  const corpId = state.cards[state.corp.identityId];
  if (corpId?.onRunnerActionPhaseEnd && !abilitiesSuppressed(state, corpId.id)) {
    pushRunner(state, {
      cardId: corpId.id,
      abilityKey: "on-runner-action-phase-end",
      effectKey: "onRunnerActionPhaseEnd",
      controller: "corp",
      logLine: `${corpId.title} becomes pending — Runner action phase ends.`,
    });
  }
}
