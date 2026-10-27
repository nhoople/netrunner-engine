/** Action-phase end card hooks (Mercia / Cacophony-class). */

import type { GameState } from "./types.js";
import {
  fireStoredConditionals,
  type StoredConditionalMark,
} from "./storedTriggers.js";

export function fireCorpActionPhaseEnd(state: GameState): void {
  const items: StoredConditionalMark[] = [];
  const corpIdentity = state.cards[state.corp.identityId];
  if (corpIdentity?.onCorpActionPhaseEnd) {
    items.push({
      abilityKey: "on-corp-action-phase-end",
      sourceId: corpIdentity.id,
      controller: "corp",
      mandatory: true,
      effectKey: "onCorpActionPhaseEnd",
      logLine: `${corpIdentity.title} becomes pending — Corp action phase ends.`,
    });
  }
  for (const server of Object.values(state.servers)) {
    for (const id of server.root) {
      const card = state.cards[id];
      if (!card?.onCorpActionPhaseEnd) continue;
      if (!card.rezzed && !card.persistent) continue;
      items.push({
        abilityKey: "on-corp-action-phase-end",
        sourceId: id,
        controller: "corp",
        mandatory: true,
        effectKey: "onCorpActionPhaseEnd",
        logLine: `${card.title} becomes pending — Corp action phase ends.`,
      });
    }
  }
  // Scored agendas (Witch Hunt).
  for (const id of state.corp.scoreArea) {
    const card = state.cards[id];
    if (!card?.onCorpActionPhaseEnd) continue;
    items.push({
      abilityKey: "on-corp-action-phase-end",
      sourceId: id,
      controller: "corp",
      mandatory: true,
      effectKey: "onCorpActionPhaseEnd",
      logLine: `${card.title} becomes pending — Corp action phase ends.`,
    });
  }
  fireStoredConditionals(state, items);
}

export function fireRunnerActionPhaseEnd(state: GameState): void {
  const items: StoredConditionalMark[] = [];
  for (const id of [...state.runner.installed]) {
    const card = state.cards[id];
    if (!card?.onRunnerActionPhaseEnd) continue;
    items.push({
      abilityKey: "on-runner-action-phase-end",
      sourceId: id,
      controller: "runner",
      mandatory: true,
      effectKey: "onRunnerActionPhaseEnd",
      logLine: `${card.title} becomes pending — Runner action phase ends.`,
    });
  }
  // Méliès U: Corp identity gains credits at Runner action phase end.
  const corpId = state.cards[state.corp.identityId];
  if (corpId?.onRunnerActionPhaseEnd) {
    items.push({
      abilityKey: "on-runner-action-phase-end",
      sourceId: corpId.id,
      controller: "corp",
      mandatory: true,
      effectKey: "onRunnerActionPhaseEnd",
      logLine: `${corpId.title} becomes pending — Runner action phase ends.`,
    });
  }
  fireStoredConditionals(state, items);
}
