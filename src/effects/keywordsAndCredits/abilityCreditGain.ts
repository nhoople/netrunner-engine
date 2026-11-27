/** Credit gains from card abilities (CR 9.12.2b, 9.12.2c) and the first-gain-each-turn hook they fire. */
import type { GameState } from "../../state/types/game.js";
import { fireOnCreditsGainedFromAgendaOrOperationAbility } from "../../state/triggers/miscConditionalHooks.js";
import type { SideRef } from "../ir/shared.js";
import { type EffectCtx, type EvalResult, applyPrimitive } from "../eval.js";

/** Zwicky: first credit gain via agenda/operation ability each turn. */
export function maybeFireZwickyCreditsGained(
  state: GameState,
  sourceId: string,
): void {
  if (state.turn.zwickyCreditsDrawUsedThisTurn) return;
  const source = state.cards[sourceId];
  if (!source || (source.type !== "agenda" && source.type !== "operation")) {
    return;
  }
  const idCard = state.cards[state.corp.identityId];
  if (!idCard?.onCreditsGainedFromAgendaOrOperationAbility) return;
  state.turn.zwickyCreditsDrawUsedThisTurn = true;
  fireOnCreditsGainedFromAgendaOrOperationAbility(state, idCard.id);
}

/**
 * Pay a card-ability credit gain through `gain_credits`.
 * A "for each" that only gains credits is one aggregated instruction
 * (CR 9.12.2b, 9.12.2c): pass the total. A non-aggregated instruction
 * (realloc(), which also derezzes) calls this once per instance.
 * A total of 0 or less does not happen (CR 9.12.2b).
 */
export function grantAbilityCredits(
  ctx: EffectCtx,
  side: SideRef,
  amount: number,
): EvalResult {
  if (amount <= 0) return { ok: true };
  return applyPrimitive(ctx, { kind: "gain_credits", side, amount });
}
