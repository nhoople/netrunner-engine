/** Dual-sided Corp identity hooks (Nebula Talent Management). */

import type { GameState, ServerId } from "./types.js";
import { fireStoredConditionals } from "./storedTriggers.js";

export function fireCorpIdentityFlippedFirstOperationPlay(
  state: GameState,
): void {
  const idCard = state.cards[state.corp.identityId];
  if (!idCard?.identityFlipped || !idCard.identityFlippedHooks) return;
  const fx = idCard.identityFlippedHooks.onFirstOperationPlayThisTurn;
  if (!fx || state.turn.corpFlippedIdentityFirstOpUsedThisTurn) return;
  state.turn.corpFlippedIdentityFirstOpUsedThisTurn = true;
  fireStoredConditionals(state, [
    {
      abilityKey: "identity-flipped-first-op",
      sourceId: idCard.id,
      controller: "corp",
      mandatory: true,
      effectKey: "identityFlippedHooks.onFirstOperationPlayThisTurn",
      logLine: `${idCard.title} becomes pending — first operation play while flipped.`,
    },
  ]);
}

export function fireCorpIdentityFlippedSuccessfulHqOrRdRun(
  state: GameState,
  serverId: ServerId,
): void {
  if (serverId !== "hq" && serverId !== "rd") return;
  const idCard = state.cards[state.corp.identityId];
  if (!idCard?.identityFlipped || !idCard.identityFlippedHooks) return;
  const useHqOnly =
    serverId === "hq" && idCard.identityFlippedHooks.onSuccessfulHqRun;
  const effectKey = useHqOnly
    ? ("identityFlippedHooks.onSuccessfulHqRun" as const)
    : ("identityFlippedHooks.onSuccessfulHqOrRdRun" as const);
  const fx = useHqOnly
    ? idCard.identityFlippedHooks.onSuccessfulHqRun
    : idCard.identityFlippedHooks.onSuccessfulHqOrRdRun;
  if (!fx) return;
  fireStoredConditionals(state, [
    {
      abilityKey: "identity-flipped-successful-central",
      sourceId: idCard.id,
      controller: "corp",
      mandatory: true,
      effectKey,
      logLine: `${idCard.title} becomes pending — successful ${serverId.toUpperCase()} run while flipped.`,
    },
  ]);
}
