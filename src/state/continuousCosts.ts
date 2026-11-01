/**
 * Continuous cost modifiers (framework migration M5).
 * Thin collector over existing stub helpers so new cost families plug in here.
 */
import { continuousIceRezCostIncrease } from "../cards/stubs.js";
import type { GameState } from "./types.js";

export type ContinuousRezCostMod = {
  kind: "ice_rez_cost_increase";
  iceId: string;
  amount: number;
};

/** Collect continuous ice rez-cost increases for one ice. */
export function collectIceRezCostIncreases(
  state: GameState,
  iceId: string,
): ContinuousRezCostMod[] {
  const amount = continuousIceRezCostIncrease(state, iceId);
  if (amount === 0) return [];
  return [{ kind: "ice_rez_cost_increase", iceId, amount }];
}

/** Total continuous ice rez-cost increase via the cost layer. */
export function resolveIceRezCostIncrease(
  state: GameState,
  iceId: string,
): number {
  return collectIceRezCostIncreases(state, iceId).reduce(
    (n, m) => n + m.amount,
    0,
  );
}
