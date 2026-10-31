/**
 * Flag-driven / synthesized Effect conditionals. Notes for 10.3.1a (phase 3).
 */
import type { Effect } from "../effects/ir.js";
import type { GameState, Side } from "./types.js";

export type InlineConditionalPendingMark = {
  cardId: string;
  abilityKey: string;
  controller: Side;
  mandatory: boolean;
  effect: Effect;
  logLine: string;
  /** Delayed / persistent abilities that outlive the source (CR 9.6.13c). */
  independentOfSource?: boolean;
};

/** Queue an inline Effect conditional for the next 10.3.1a checkpoint. */
export function noteInlineConditional(
  state: GameState,
  mark: InlineConditionalPendingMark,
): void {
  if (!state.turn.inlineConditionalPending) {
    state.turn.inlineConditionalPending = [];
  }
  const q = state.turn.inlineConditionalPending;
  if (
    q.some(
      (m) =>
        m.cardId === mark.cardId &&
        m.abilityKey === mark.abilityKey &&
        m.logLine === mark.logLine,
    )
  ) {
    return;
  }
  q.push(mark);
}
