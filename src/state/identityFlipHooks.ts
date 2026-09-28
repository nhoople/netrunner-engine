/** Dual-sided Corp identity hooks (Nebula Talent Management). */

import { evalEffect } from "../effects/eval.js";
import { log } from "./createGame.js";
import type { GameState, ServerId } from "./types.js";

export function fireCorpIdentityFlippedFirstOperationPlay(
  state: GameState,
): void {
  const idCard = state.cards[state.corp.identityId];
  if (!idCard?.identityFlipped || !idCard.identityFlippedHooks) return;
  const fx = idCard.identityFlippedHooks.onFirstOperationPlayThisTurn;
  if (!fx || state.turn.corpFlippedIdentityFirstOpUsedThisTurn) return;
  state.turn.corpFlippedIdentityFirstOpUsedThisTurn = true;
  const r = evalEffect({ state, sourceId: state.corp.identityId }, fx);
  if (!r.ok) {
    log(
      state,
      `identityFlipped onFirstOperationPlay failed on ${idCard.title}: ${r.error}`,
    );
  }
}

export function fireCorpIdentityFlippedSuccessfulHqOrRdRun(
  state: GameState,
  serverId: ServerId,
): void {
  if (serverId !== "hq" && serverId !== "rd") return;
  const idCard = state.cards[state.corp.identityId];
  if (!idCard?.identityFlipped || !idCard.identityFlippedHooks) return;
  const fx = idCard.identityFlippedHooks.onSuccessfulHqOrRdRun;
  if (!fx) return;
  const r = evalEffect({ state, sourceId: state.corp.identityId }, fx);
  if (!r.ok) {
    log(
      state,
      `identityFlipped onSuccessfulHqOrRdRun failed on ${idCard.title}: ${r.error}`,
    );
  }
}
