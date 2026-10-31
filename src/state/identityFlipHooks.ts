/** Dual-sided Corp identity hooks (Nebula Talent Management). */

import type { GameState, ServerId } from "./types.js";
import { noteStoredConditionals } from "./storedConditionalHooks.js";
import { checkpointAfterInstruction } from "../legality/checkpoints.js";

/**
 * Nebula-class: first operation play while flipped this turn. Records the
 * condition for the next 10.3.1a scanner pass (phase 3). Does not mark
 * pending here.
 */
export function fireCorpIdentityFlippedFirstOperationPlay(
  state: GameState,
): void {
  const idCard = state.cards[state.corp.identityId];
  if (!idCard?.identityFlipped || !idCard.identityFlippedHooks) return;
  const fx = idCard.identityFlippedHooks.onFirstOperationPlayThisTurn;
  if (!fx || state.turn.corpFlippedIdentityFirstOpUsedThisTurn) return;
  if (state.turn.corpFlippedIdentityFirstOpMetPending) return;
  state.turn.corpFlippedIdentityFirstOpMetPending = true;
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
  noteStoredConditionals(state, [
    {
      abilityKey: "identity-flipped-successful-central",
      sourceId: idCard.id,
      controller: "corp",
      mandatory: true,
      effectKey,
      logLine: `${idCard.title} becomes pending — successful ${serverId.toUpperCase()} run while flipped.`,
    },
  ]);
  if ((state.turn.storedConditionalPending ?? []).length > 0) {
    checkpointAfterInstruction(state, "identity.flipped.successfulCentral");
  }
}
