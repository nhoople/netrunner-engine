/** Core game-state types for the Netrunner engine library. */

import type { Effect } from "../effects/ir.js";

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

export type DamageType = "net" | "meat" | "brain";

export interface Subroutine {
  id: string;
  text: string;
  /** Effect IR executed when this sub resolves unbroken. */
  effect: Effect;
}

export interface BreakerAbility {
  /**
   * Ice subtype this breaker can break, e.g. barrier.
   * Use `"*"` for AI breakers that break any ice.
   */
  breaksSubtype: string;
  strength: number;
  /** Credits to break one subroutine (or one ability use when breakMaxSubs > 1). */
  breakCredits: number;
  /**
   * Max subroutines broken per paid break ability use (default 1).
   * Extra breaks in the same encounter after paying once are free until the
   * remaining budget is spent (Buzzsaw / Cleaver "break up to 2").
   */
  breakMaxSubs?: number;
  /** Credits to pump (+pumpStrength, default 1) via paid ability. */
  pumpCredits?: number;
  pumpStrength?: number;
  /**
   * When pumping, strength gain equals installed icebreaker count (Unity)
   * instead of the fixed pump effect amount.
   */
  pumpUsesIcebreakerCount?: boolean;
  /** Reduce breakCredits by this much after a successful run this turn (Marjanah). */
  breakCreditsDiscountIfSuccessfulRunThisTurn?: number;
}

export type PaidAbilityWindow =
  | "approach_paw"
  | "encounter_paw"
  | "corp_action_paw"
  | "runner_action_paw";

/** Cost model for paid abilities / play costs (CR 1.16). */
export interface CostSpec {
  clicks?: number;
  credits?: number;
  /** Spend from a card's recurring credit pool. */
  recurringCredits?: number;
  /** Spend hosted virus counters from this card. */
  virusCounters?: number;
  /** Trash this card as a cost. */
  trashSelf?: boolean;
}

/** Minimal paid ability (CR 9.5.1) — body is effect IR. */
export interface PaidAbility {
  id: string;
  label: string;
  /** @deprecated prefer `cost` */
  clickCost: number;
  /** @deprecated prefer `cost` */
  creditCost: number;
  cost?: CostSpec;
  windows: PaidAbilityWindow[];
  effect: Effect;
  /** Enforce once-per-turn usage for this ability. */
  oncePerTurn?: boolean;
}

export interface CardInstance {
  id: string;
  /** Definition id from card data (stable across instances). */
  defId?: string;
  title: string;
  type: CardType;
  side: Side;
  /** Printed install cost in credits (programs/hardware/resources/ice). */
  installCost: number;
  /** Corp rez cost (ice/assets/upgrades). */
  rezCost?: number;
  /** Play cost for operations / events. */
  playCost?: number;
  strength?: number;
  subtypes?: string[];
  subroutines?: Subroutine[];
  breaker?: BreakerAbility;
  /** Paid abilities usable in matching PAW windows (CR 9.5). */
  paidAbilities?: PaidAbility[];
  /**
   * Continuous / on-rez effect IR (e.g. prevent jack-out).
   * Evaluated when the card is rezzed.
   */
  onRez?: Effect;
  /** Effect IR when an operation/event is played. */
  onPlay?: Effect;
  /** Effect IR when Corp scores this agenda. */
  onScore?: Effect;
  /** Effect IR when Runner steals this agenda. */
  onSteal?: Effect;
  /** Effect IR when this ice is encountered (CR 6.5.1). */
  onEncounter?: Effect;
  /** Effect IR when this card's controller's turn begins (rezzed/installed). */
  onTurnBegin?: Effect;
  /** Effect IR when this card is installed. */
  onInstall?: Effect;
  /** Effect IR when the Runner makes a successful run (installed/rezzed source). */
  onSuccessfulRun?: Effect;
  /** Effect IR when this card is accessed (ambushes). */
  onAccess?: Effect;
  /**
   * Hardcoded prevention while this card is rezzed during a run.
   * Prefer onRez prevent IR; kept for back-compat with Lockdown tests.
   */
  prevention?: {
    jackOutForRun?: boolean;
  };
  /** Effect IR the first time the Runner receives a tag each turn (identities). */
  onFirstTagThisTurn?: Effect;
  /** Effect IR when Corp scores any agenda (identity continuous). */
  onAgendaScored?: Effect;
  /** Agenda points when scored/stolen. */
  agendaPoints?: number;
  /** Advancement requirement to score. */
  advancementRequirement?: number;
  /** Current advancement counters. */
  advancementTokens?: number;
  /** Printed trash cost (assets/upgrades). */
  trashCost?: number;
  /** Max recurring credits on this card. */
  recurringCreditsMax?: number;
  /** Current recurring credit pool. */
  recurringCredits?: number;
  /** Hosted credit pool (e.g. Armitage). Not refilled. */
  hostedCredits?: number;
  /** Credits placed on this card when installed. */
  hostedCreditsOnInstall?: number;
  /** Hosted virus counters. */
  virusCounters?: number;
  /** +strength while protecting a remote (Palisade). */
  strengthBonusProtectingRemote?: number;
  /** +strength while advancementTokens >= threshold (Pharos). */
  strengthBonusAtAdvancements?: { threshold: number; bonus: number };
  /** Hand-size modifier applied while installed / scored. */
  handSizeBonus?: number;
  /** Memory units this program uses (default 1 for programs). */
  memoryCost?: number;
  /** Bonus to Runner memory limit while installed (consoles / chips). */
  muBonus?: number;
  /** +strength per installed icebreaker (Echelon). */
  strengthBonusPerIcebreaker?: number;
  /** Lower install cost after a successful run this turn (Carmen). */
  installCostDiscountIfSuccessfulRunThisTurn?: number;
  /** Lower first program install cost this turn while this card is installed (DZMZ). */
  firstProgramInstallDiscount?: number;
  /** When hosted credits empty and card trashes, draw this many (Nico). */
  drawOnHostedEmpty?: number;
  /** Play restriction: Runner must be tagged. */
  playRequiresTagged?: boolean;
  /** Play restriction: Runner made a successful run last turn. */
  playRequiresSuccessfulRunLastTurn?: boolean;
  /** Trash this card when the run ends if it broke a sub this run (Mayfly). */
  trashAfterBreakingThisRun?: boolean;
  /** Gain this many credits when any agenda is scored or stolen (Pantograph). */
  creditsOnScoreOrSteal?: number;
  /** Zahya: gain 1¢ per access when HQ/R&D run ends (once per turn). */
  creditsPerAccessOnCentralRunEnd?: boolean;
  /** René: on access-trash, gain credits/draw once per turn. */
  onAccessTrashGain?: { credits: number; draw: number; oncePerTurn?: boolean };
  /** Base link value (identities). */
  link?: number;
  /** Explicit unsupported clause notes from card data. */
  unsupported?: string[];
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
  /** Runner tags (CR 10.5). Corp unused in v0. */
  tags: number;
  /** Runner brain damage (CR 10.4). */
  brainDamage: number;
  /** Runner link (identity + modifiers). */
  link: number;
  /**
   * Runner base memory limit before card bonuses (default 4).
   * Corp unused.
   */
  memoryLimit: number;
  /** Deck / stack card ids, top at index 0. */
  deck: string[];
  hand: string[];
  discard: string[];
  score: string[];
  /** Runner only: installed rig card ids. */
  rig: string[];
}

/** Per-turn flags shared by Gateway continuous / conditional abilities. */
export interface TurnBookkeeping {
  successfulRunThisTurn: boolean;
  successfulRunLastTurn: boolean;
  agendaPointsScoredThisTurn: number;
  programsInstalledThisTurn: number;
  basicDrawsThisTurn: number;
  usedAbilities: string[];
  installedThisTurn: string[];
  cannotScoreAgendas: boolean;
  tagsGivenThisTurn: number;
  hqBreachesThisTurn: number;
  /** Zahya once-per-turn run-end credit ability used. */
  zahyaRunEndUsed: boolean;
  /** René once-per-turn access-trash ability used. */
  reneAccessTrashUsed: boolean;
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
  /**
   * After paying for a multi-break ability, remaining free breaks for that
   * breaker this encounter (Buzzsaw / Cleaver).
   */
  freeBreaksRemaining?: { breakerId: string; remaining: number };
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
  /** How many more cards the Runner may access this breach (centrals). */
  accessRemaining: number | null;
  encounter: EncounterState | null;
  /** Set when a subroutine ends the run. */
  endedTheRun: boolean;
  /** Runner cannot jack out for the remainder of this run (cannot effects). */
  cannotJackOut: boolean;
  /** Run-scoped icebreaker strength boosts (cardId → delta). */
  strengthBoosts: Record<string, number>;
  /** Encounter-scoped icebreaker strength boosts (cleared when passing ice). */
  encounterStrengthBoosts: Record<string, number>;
  /** Encounter-scoped ice strength boosts (cardId → delta). */
  iceStrengthBoosts: Record<string, number>;
  /** Card currently being accessed (awaiting steal/trash/no-action). */
  accessingCardId: string | null;
  /** Extra central accesses granted for this breach (Jailbreak / Docklands). */
  bonusAccess?: number;
  /** Breaker ids that broke a subroutine this run (Mayfly). */
  breakersThatBroke?: string[];
}

export type ForbiddenAction =
  | "jack_out"
  | "basic_run"
  | "basic_gain_credit"
  | "basic_draw"
  | "basic_install"
  | "rez_ice"
  | "break_subroutine"
  | "play_operation"
  | "play_event";

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
 * Nested paid-ability / priority window frame (CR 9.2.4 / 9.2.4d).
 * Window closes after two consecutive passes (or one pass when the opponent
 * has no legal window actions — auto-pass).
 */
export interface PriorityWindowFrame {
  id: string;
  stepKey: string;
  nestDepth: number;
  consecutivePasses: number;
  priorityHolder: Side;
  checkpointId: string;
}

export interface TraceState {
  id: string;
  sourceId: string;
  baseStrength: number;
  corpSpent: number;
  runnerLinkSpent: number;
  onSuccess: Effect;
  onFailure?: Effect;
}

export interface PendingDamage {
  type: DamageType;
  remaining: number;
  sourceId: string;
}

/** Corp chooses which program to trash (e.g. Rototurret). */
export interface PendingTrashProgram {
  sourceId: string;
  candidates: string[];
}

/** Host chooses among effect IR options (Ballista, Funhouse, etc.). */
export interface PendingChoice {
  sourceId: string;
  chooser: Side;
  options: Array<{ id: string; label: string; effect: Effect }>;
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

export interface GameConfig {
  /** Agenda points required to win (default 7). */
  agendaPointsToWin: number;
  /**
   * When true, mark `done` after the first Runner turn completes
   * (legacy vertical-slice demos). Library `createGame` sets false.
   */
  stopAfterFirstCycle: boolean;
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
  /** Nested priority / PAW stack (innermost last). */
  priorityStack: PriorityWindowFrame[];
  /** Active cannot effects. */
  restrictions: Restriction[];
  /** Pending interactive trace, if any. */
  trace: TraceState | null;
  /** Pending damage awaiting prevention, if any. */
  pendingDamage: PendingDamage | null;
  /** Pending Corp choice of program to trash. */
  pendingTrashProgram: PendingTrashProgram | null;
  /** Pending effect-IR choice (chooser must resolve). */
  pendingChoice: PendingChoice | null;
  /** Turn-scoped flags for conditional abilities. */
  turn: TurnBookkeeping;
  /** Winner when the game has ended. */
  winner: Side | null;
  /** Win reason for hosts. */
  winReason: "corp_agenda" | "runner_agenda" | "flatline" | null;
  config: GameConfig;
  log: string[];
  /** True when the game (or demo cycle) has finished. */
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
  | { type: "play_operation"; cardId: string }
  | { type: "play_event"; cardId: string }
  | { type: "advance"; cardId: string }
  | { type: "score_agenda"; cardId: string }
  | { type: "rez_ice"; cardId: string }
  | {
      type: "break_subroutine";
      breakerId: string;
      subIndex: number;
    }
  | {
      /** Spend [click] to break a subroutine on bioroid ice (card text). */
      type: "break_bioroid_subroutine";
      subIndex: number;
    }
  | { type: "use_paid_ability"; cardId: string; abilityId: string }
  | { type: "use_identity_ability"; abilityId: string }
  | { type: "continue_run" }
  | { type: "jack_out" }
  | { type: "access_card"; cardId: string }
  | { type: "steal_agenda"; cardId: string }
  | { type: "trash_accessed"; cardId: string }
  | { type: "finish_access" }
  | { type: "finish_breach" }
  | { type: "boost_trace"; credits: number }
  | { type: "spend_link"; amount: number }
  | { type: "resolve_trace" }
  | { type: "prevent_damage"; amount: number }
  | { type: "accept_damage" }
  | { type: "choose_trash_program"; cardId: string }
  | { type: "choose_option"; optionId: string }
  | { type: "rez_asset"; cardId: string }
  | { type: "discard_to_hand_size" };

/** Host intent — same as Action for the pure library API. */
export type Intent = Action;

export type ApplyResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string; cites: RuleCite[] };

/** Side-filtered public view for future online hosts. */
export interface PublicView {
  viewer: Side;
  turnNumber: number;
  activeSide: Side;
  timingKey: string;
  timing: TimingCursor;
  done: boolean;
  winner: Side | null;
  winReason: GameState["winReason"];
  self: {
    clicks: number;
    credits: number;
    tags: number;
    brainDamage: number;
    link: number;
    maxHandSize: number;
    hand: string[];
    handCount: number;
    deckCount: number;
    discard: string[];
    score: string[];
    scorePoints: number;
    rig: string[];
    identityId: string;
  };
  opponent: {
    clicks: number;
    credits: number;
    tags: number;
    brainDamage: number;
    link: number;
    maxHandSize: number;
    handCount: number;
    deckCount: number;
    discardFaceup: string[];
    score: string[];
    scorePoints: number;
    rig: string[];
    identityId: string;
  };
  servers: Array<{
    id: ServerId;
    kind: Server["kind"];
    ice: Array<{
      id: string;
      title: string | null;
      rezzed: boolean;
      strength: number | null;
    }>;
    root: Array<{
      id: string;
      title: string | null;
      rezzed: boolean;
      type: CardType | null;
      advancementTokens: number | null;
    }>;
  }>;
  run: RunState | null;
  trace: TraceState | null;
  pendingDamage: PendingDamage | null;
  pendingTrashProgram: PendingTrashProgram | null;
  pendingChoice: PendingChoice | null;
  priorityStack: PriorityWindowFrame[];
  log: string[];
}
