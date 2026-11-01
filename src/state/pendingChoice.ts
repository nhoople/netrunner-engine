/**
 * Shared pending-choice helper (standardization S4).
 * Prefer this over inventing new `state.pendingChoice =` shapes in the graph.
 */
import type { Effect } from "../effects/ir.js";
import type { GameState, Side } from "./types.js";

export type PendingChoiceOption = {
  id: string;
  label: string;
  effect: Effect;
};

/**
 * Open a Runner/Corp choose window. No-ops if a choice is already pending.
 * Returns true when the window was opened.
 */
export function openPendingChoose(
  state: GameState,
  args: {
    sourceId: string;
    chooser: Side;
    options: PendingChoiceOption[];
    logLine?: string;
  },
): boolean {
  if (state.pendingChoice) return false;
  if (args.options.length === 0) return false;
  state.pendingChoice = {
    sourceId: args.sourceId,
    chooser: args.chooser,
    options: args.options.map((o) => ({
      id: o.id,
      label: o.label,
      effect: o.effect,
    })),
  };
  if (args.logLine) state.log.push(args.logLine);
  return true;
}
