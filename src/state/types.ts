/** Core game-state types for the v0 Netrunner engine scaffold. */

export type Side = "corp" | "runner";

export type CardType =
  | "identity"
  | "agenda"
  | "asset"
  | "upgrade"
  | "ice"
  | "operation"
  | "event"
  | "hardware"
  | "program"
  | "resource";

export type ZoneId =
  | "corp:rd"
  | "corp:hq"
  | "corp:archives"
  | "corp:score"
  | "runner:stack"
  | "runner:grip"
  | "runner:heap"
  | "runner:rig"
  | "runner:score"
  | `server:${string}:root`
  | `server:${string}:ice`;

export interface Subroutine {
  id: string;
  effect: "end_the_run";
  text: string;
}

export interface BreakerAbility {
  /** Ice subtype this breaker can break, e.g. barrier. */
  breaksSubtype: string;
  strength: number;
  /** Credits to break one subroutine. */
  breakCredits: number;
}

export interface CardInstance {
  id: string;
  title: string;
  type: CardType;
  side: Side;
  /** Printed install cost in credits (programs/hardware/resources/ice). */
  installCost: number;
  /** Corp rez cost (ice/assets/upgrades). */
  rezCost?: number;
  strength?: number;
  subtypes?: string[];
  subroutines?: Subroutine[];
  breaker?: BreakerAbility;
  /**
   * Hardcoded prevention while this card is rezzed during a run.
   * v0: jackOutForRun → Runner cannot jack out (CR 1.2.2).
   */
  prevention?: {
    jackOutForRun?: boolean;
  };
  /** Whether the card is faceup (Runner cards / accessed / Archives). */
  faceup: boolean;
  /** Corp installed cards: rezzed vs unrezzed. */
  rezzed: boolean;
  zone: ZoneId;
}

export type CentralServerId = "hq" | "rd" | "archives";
export type ServerId = CentralServerId | `remote-${number}`;

export interface Server {
  id: ServerId;
  kind: "central" | "remote";
  /** Ice positions: index 0 = outermost. CR 6.2 / 4.6.9. */
  ice: string[];
  /** Root cards (agendas/assets/upgrades). */
  root: string[];
}

export interface PlayerState {
  side: Side;
  clicks: number;
  credits: number;
  maxHandSize: number;
  identityId: string;
  /** Deck / stack card ids, top at index 0. */
  deck: string[];
  hand: string[];
  discard: string[];
  score: string[];
  /** Runner only: installed rig card ids. */
  rig: string[];
}

export type TurnPhase =
  | "corp_draw"
  | "corp_action"
  | "corp_discard"
  | "runner_action"
  | "runner_discard";

export type RunPhase =
  | "initiation"
  | "approach_ice"
  | "encounter"
  | "movement"
  | "success"
  | "breach"
  | "access"
  | "ends";

export interface EncounterState {
  iceId: string;
  /** Parallel to card.subroutines — true if broken this encounter. */
  broken: boolean[];
}

export interface RunState {
  attackedServerId: ServerId;
  phase: RunPhase;
  /** Ice index being approached/encountered, or null when past ice. */
  position: number | null;
  successful: boolean | null;
  accessedCardIds: string[];
  /** Cards still available to access during breach. */
  accessCandidates: string[];
  encounter: EncounterState | null;
  /** Set when a subroutine ends the run. */
  endedTheRun: boolean;
  /** Runner cannot jack out for the remainder of this run (cannot effects). */
  cannotJackOut: boolean;
}

export type ForbiddenAction =
  | "jack_out"
  | "basic_run"
  | "basic_gain_credit"
  | "basic_draw"
  | "basic_install"
  | "rez_ice"
  | "break_subroutine";

export interface RuleCite {
  number: string;
  id: string;
}

/** Active cannot / forbid effects (CR 1.2.2). */
export interface Restriction {
  forbid: ForbiddenAction;
  cite: RuleCite;
  source: string;
}

export type CheckpointKind = "cost" | "timing" | "priority_window";

/** Nested resolve / cost / priority checkpoint frame (CR 1.16.3 / 9.2.4 / 9.11.1b). */
export interface CheckpointFrame {
  id: string;
  kind: CheckpointKind;
  label: string;
  cites: RuleCite[];
  /** What opened this frame (action type or step key). */
  openedBy: string;
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

export interface GameState {
  turnNumber: number;
  activeSide: Side;
  /** Derived from the timing graph node (kept for describe / filters). */
  turnPhase: TurnPhase;
  corp: PlayerState;
  runner: PlayerState;
  cards: Record<string, CardInstance>;
  servers: Record<ServerId, Server>;
  nextRemoteNumber: number;
  run: RunState | null;
  /** Explicit step-graph key, e.g. corp.takeAction */
  timingKey: string;
  timing: TimingCursor;
  /** Nested checkpoint stack (innermost last). */
  checkpoints: CheckpointFrame[];
  /** Active cannot effects. */
  restrictions: Restriction[];
  log: string[];
  /** True when the demo vertical slice has finished. */
  done: boolean;
}

export type InstallDestination =
  | { kind: "new_remote" }
  | { kind: "remote_root"; serverId: ServerId }
  | { kind: "protect"; serverId: ServerId }
  | { kind: "rig" };

export type Action =
  | { type: "pass_window" }
  | { type: "basic_gain_credit" }
  | { type: "basic_draw" }
  | {
      type: "basic_install";
      cardId: string;
      destination: InstallDestination;
    }
  | { type: "basic_run"; serverId: ServerId }
  | { type: "rez_ice"; cardId: string }
  | {
      type: "break_subroutine";
      breakerId: string;
      subIndex: number;
    }
  | { type: "continue_run" }
  | { type: "jack_out" }
  | { type: "access_card"; cardId: string }
  | { type: "finish_breach" }
  | { type: "discard_to_hand_size" };

export type ApplyResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string; cites: RuleCite[] };
