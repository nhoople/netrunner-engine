/** Checkpoint frames, facts and snapshots. */

import type { RuleCite } from "./restrictions.js";

export type CheckpointKind =
  | "cost"
  | "draw"
  | "play"
  | "trace"
  | "timing"
  | "instruction"
  | "priority_window";

/** Nested resolve / cost / priority checkpoint frame (CR 1.16.3 / 9.2.4 / 9.11.1). */
export interface CheckpointFrame {
  id: string;
  kind: CheckpointKind;
  label: string;
  cites: RuleCite[];
  /** What opened this frame (action type or step key). */
  openedBy: string;
}

/**
 * Facts recorded at CR 10.3.1a so the next checkpoint can compare changes
 * (CR 9.6.6 / 9.6.6a). Expand as more conditionals migrate off hooks.
 */
export interface CheckpointFacts {
  cardZones: Record<string, string>;
  cardFaceup: Record<string, boolean>;
  cardRezzed: Record<string, boolean>;
  /** Advancement counters at 10.3.1a (CR 9.6.6a "had"). */
  cardAdvancementCounters: Record<string, number>;
  /** Expose counts at 10.3.1a (CR 9.6.4b Blackguard). */
  exposureCounts: Record<string, number>;
  corpCredits: number;
  runnerCredits: number;
  corpTags: number;
  runnerTags: number;
}

/** Snapshot taken at the start of a checkpoint's 10.3.1a step. */
export interface CheckpointSnapshot {
  /** Checkpoint frame id that produced this snapshot, if any. */
  checkpointId: string | null;
  facts: CheckpointFacts;
}
