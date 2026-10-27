/** GameNET: Corp ability causes Runner spend/lose ≥1¢ during a run → Corp +1¢. */

import type { GameState } from "./types.js";
import {
  fireOnCorpAbilityCausesRunnerSpendOrLoseCreditsDuringRun,
} from "./miscConditionalHooks.js";

/**
 * Note that a Corp card ability caused the Runner to spend or lose credits
 * during a run (CR 1.16.2b). Fires once per aggregate payment/lose instruction
 * when amount ≥ 1 and `sourceId` is a Corp card. Prefer under-firing: only call
 * from hooked sites with Corp attribution (Cayambe lose_credits, Tollbooth
 * pay_credits_or_etr, Earth Station initiate tax, etc.).
 */
export function noteCorpAbilityCausedRunnerCreditLossOrSpend(
  state: GameState,
  amount: number,
  sourceId: string | undefined | null,
): void {
  if (!state.run || amount < 1 || !sourceId) return;
  const source = state.cards[sourceId];
  if (!source || source.side !== "corp") return;

  const idCard = state.cards[state.corp.identityId];
  if (!idCard?.onCorpAbilityCausesRunnerSpendOrLoseCreditsDuringRun) return;
  fireOnCorpAbilityCausesRunnerSpendOrLoseCreditsDuringRun(state, idCard.id);
}
