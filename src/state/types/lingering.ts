/** Lingering effects and their durations. */

import type { Side } from "./shared.js";

/** Duration for a lingering effect (CR 9.10.1). */
export type LingeringDuration =
  | { kind: "turn"; side?: Side }
  | { kind: "run" }
  /**
   * "Until the end of the next run this turn" (Paintbrush): ends when the
   * next run ends, or when the turn ends if no run does (CR 9.10.1).
   */
  | { kind: "next_run_this_turn" }
  | { kind: "encounter" }
  | { kind: "until_checkpoint" }
  | { kind: "custom"; label: string };

/**
 * First-class lingering effect (CR 9.10.1). Independent of its source once
 * created; removed at 10.3.1b when the duration has passed.
 */
export interface LingeringEffect {
  id: string;
  /** Card that created the effect (may later be inactive / gone). */
  createdBy: string;
  independent: true;
  duration: LingeringDuration;
  /** Consumer tag until more effects migrate onto the registry. */
  kind: string;
  payload?: unknown;
  expired?: boolean;
}
