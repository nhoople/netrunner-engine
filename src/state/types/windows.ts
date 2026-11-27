/** Reaction, interrupt and priority windows, and the timing cursor. */

import type { DamageType, Side } from "./shared.js";

/**
 * Reaction window opened after a checkpoint when conditionals were marked
 * pending (CR 10.3.2 / 9.2.8). Owns a fixed set of instance ids (CR 9.2.8a).
 */
export interface ReactionWindowFrame {
  id: string;
  /** Checkpoint that closed just before this window opened. */
  afterCheckpointId: string | null;
  pendingInstanceIds: string[];
  priorityHolder: Side;
  consecutivePasses: number;
}

/**
 * Expected effects of an imminent instruction (CR 9.9.2). Updated as
 * prevents / replacements resolve during the interrupt window.
 */
export interface ExpectedEffects {
  damage?: { type: DamageType; amount: number };
  tags?: { amount: number };
  endTheRun?: boolean;
  trashCardIds?: string[];
  exposeCardIds?: string[];
  /** Imminent bioroid subroutine break (Tyr's Hand-class; CR 9.9.2). */
  breakSubroutine?: { iceId: string; subIndex: number } | null;
  /** Imminent icebreaker strength increase (System Seizure-class; CR 9.9.2). */
  strengthIncrease?: {
    breakerId: string;
    amount: number;
    duration: "encounter" | "run" | "turn" | "checkpoint";
  };
  notes?: string[];
}

/**
 * Opened for a `strength_increase_interrupt` (System Seizure-class). An
 * icebreaker strength increase is imminent; mandatory interrupts may grant
 * lasting duration rewrites before the boost commits.
 */
export interface PendingStrengthIncrease {
  breakerId: string;
  amount: number;
  requestedDuration: "encounter" | "run" | "turn" | "checkpoint";
  sourceId: string;
  effectId: string;
  expectedEffects?: ExpectedEffects;
}

/**
 * Nested paid-ability / priority window frame (CR 9.2.4 / 9.2.4d).
 * Window closes after two consecutive passes: both players receive priority
 * (CR 9.2.7a). The jack-out choice closes on the Runner's pass (CR 6.9.4c).
 */
export interface PriorityWindowFrame {
  id: string;
  stepKey: string;
  nestDepth: number;
  consecutivePasses: number;
  priorityHolder: Side;
  checkpointId: string;
}

/**
 * Timing cursor labeled with CR appendix / step ids.
 * Appendix labels from timing-structures.json (11.2 / 11.3 / 11.4 / 11.5).
 */
export interface TimingCursor {
  structure: "corp_turn" | "runner_turn" | "run" | "breach";
  /** Stable YAML / deep-link id, e.g. sec_appendix_timing_structure_corps_turn_1_a */
  stepId: string;
  /** Printed appendix number when known, e.g. 11.2_1_a */
  stepNumber: string;
  label: string;
}
