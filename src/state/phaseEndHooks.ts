/** Action-phase end card hooks (Mercia / Cacophony-class). */

import { evalEffect } from "../effects/eval.js";
import { log } from "./createGame.js";
import type { GameState } from "./types.js";

export function fireCorpActionPhaseEnd(state: GameState): void {
  const corpIdentity = state.cards[state.corp.identityId];
  if (corpIdentity?.onCorpActionPhaseEnd) {
    const r = evalEffect(
      { state, sourceId: state.corp.identityId },
      corpIdentity.onCorpActionPhaseEnd,
    );
    if (!r.ok) {
      log(
        state,
        `onCorpActionPhaseEnd failed on ${corpIdentity.title}: ${r.error}`,
      );
    }
  }
  for (const server of Object.values(state.servers)) {
    for (const id of server.root) {
      const card = state.cards[id];
      if (!card?.onCorpActionPhaseEnd) continue;
      if (!card.rezzed && !card.persistent) continue;
      const r = evalEffect(
        { state, sourceId: id },
        card.onCorpActionPhaseEnd,
      );
      if (!r.ok) {
        log(
          state,
          `onCorpActionPhaseEnd failed on ${card.title}: ${r.error}`,
        );
      }
    }
  }
}

export function fireRunnerActionPhaseEnd(state: GameState): void {
  for (const id of [...state.runner.rig]) {
    const card = state.cards[id];
    if (!card?.onRunnerActionPhaseEnd) continue;
    const r = evalEffect(
      { state, sourceId: id },
      card.onRunnerActionPhaseEnd,
    );
    if (!r.ok) {
      log(
        state,
        `onRunnerActionPhaseEnd failed on ${card.title}: ${r.error}`,
      );
    }
  }
}
