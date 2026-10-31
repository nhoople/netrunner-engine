/**
 * Corp root successful-run server abilities. Notes structured marks for
 * 10.3.1a (phase 3).
 */
import { abilitiesSuppressed } from "./abilities.js";
import { CR } from "../timing/labels.js";
import type { GameState, StoredConditionalEffectKey } from "./types.js";

export type SuccessfulRunServerPendingMark = {
  cardId: string;
  abilityKey: string;
  effectKey: StoredConditionalEffectKey;
  mandatory: boolean;
  logLine: string;
};

function pushMark(
  state: GameState,
  mark: SuccessfulRunServerPendingMark,
): void {
  if (!state.turn.successfulRunServerPending) {
    state.turn.successfulRunServerPending = [];
  }
  const q = state.turn.successfulRunServerPending;
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

/** Queue rezzed-root successful-run abilities on the attacked server. */
export function noteSuccessfulRunServerAbilities(state: GameState): void {
  const run = state.run;
  if (!run || run.successful !== true) return;
  const server = state.servers[run.attackedServerId];
  if (!server) return;
  for (const id of [...server.root]) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.rezzed) continue;
    if (card.onSuccessfulRun) {
      pushMark(state, {
        cardId: id,
        abilityKey: "on-successful-run",
        effectKey: "onSuccessfulRun",
        mandatory: false,
        logLine: `${card.title} becomes pending — successful run on this server (CR ${CR.ifSuccessfulAbilityOptional.number}).`,
      });
    }
    if (card.onSuccessfulRunOnThisServer) {
      pushMark(state, {
        cardId: id,
        abilityKey: "on-successful-run-on-this-server",
        effectKey: "onSuccessfulRunOnThisServer",
        mandatory: true,
        logLine: `${card.title} becomes pending — successful run on this server (CR ${CR.successfulRun.number}).`,
      });
    }
    if (card.onSuccessfulRunThisServer) {
      pushMark(state, {
        cardId: id,
        abilityKey: "on-successful-run-this-server",
        effectKey: "onSuccessfulRunThisServer",
        mandatory: true,
        logLine: `${card.title} becomes pending — successful run on this server (CR ${CR.successfulRun.number}).`,
      });
    }
  }
}
