/** `GameConfig` and `GameState`: the whole game. */

import type { InstallDestination } from "./actions.js";
import type { CardInstance } from "./card.js";
import type { CheckpointFrame, CheckpointSnapshot } from "./checkpoints.js";
import type { LingeringEffect } from "./lingering.js";
import type { PendingAbilityInstance } from "./pendingAbilities.js";
import type {
  PendingChoice,
  PendingCost,
  PendingDamage,
  PendingEffectContinuation,
  PendingEndTheRun,
  PendingExclusiveChoices,
  PendingSabotage,
  PendingSubroutineBreak,
  PendingTags,
  PendingTrashProgram,
  PsiState,
  TraceState,
} from "./pendingChoices.js";
import type { PlayerState } from "./players.js";
import type { LookEvent, RevealEvent } from "./publicView.js";
import type { Restriction } from "./restrictions.js";
import type { RunState } from "./run.js";
import type { Server, ServerId } from "./servers.js";
import type { Side } from "./shared.js";
import type { TurnBookkeeping, TurnPhase } from "./turn.js";
import type {
  ExpectedEffects,
  PendingStrengthIncrease,
  PriorityWindowFrame,
  ReactionWindowFrame,
  TimingCursor,
} from "./windows.js";

export interface GameConfig {
  /** Agenda points required to win (default 7). */
  agendaPointsToWin: number;
  /**
   * When true, mark `done` after the first Runner turn completes
   * (legacy vertical-slice demos). Library `createGame` sets false.
   */
  stopAfterFirstCycle: boolean;
  /**
   * Seed for the game's random stream. The same seed, setup, and intents
   * always give the same game. Omit for the fixed default seed.
   */
  seed?: number;
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
  /** PAD Factory: card ids that cannot be scored until next Corp turn begins. */
  bfCannotScoreUntilNextCorpTurn?: string[];
  run: RunState | null;
  /**
   * Bad publicity fund — Runner-controlled credits outside the credit pool,
   * filled at run initiation and emptied at run end (CR §10.6.2 / §10.6.3).
   */
  badPublicityFund: number;
  /** Monotonic counter for facedown set-aside groups (CR 4.8.7). */
  setAsideGroupSeq?: number;
  /** Explicit step-graph key, e.g. corp.takeAction */
  timingKey: string;
  timing: TimingCursor;
  /** Nested checkpoint stack (innermost last). */
  checkpoints: CheckpointFrame[];
  /**
   * Facts from the previous checkpoint's 10.3.1a ("had" state, CR 9.6.6a).
   * Conditionals compare the current game against this at the next checkpoint.
   */
  previousCheckpointSnapshot: CheckpointSnapshot | null;
  /**
   * Pending conditional ability instances waiting for / resolving in a
   * reaction window (CR 9.6.2 / 10.3.2).
   */
  pendingAbilities: PendingAbilityInstance[];
  /**
   * Nested reaction windows opened after checkpoints (CR 10.3.2 / 9.2.8).
   * Innermost last; each owns a fixed pending set (CR 9.2.8a).
   */
  reactionStack: ReactionWindowFrame[];
  /**
   * Lingering effects independent of their sources (CR 9.10.1). Removed at
   * 10.3.1b when duration has passed. Coexists with ad-hoc turn/run fields
   * until those migrate onto this registry.
   */
  lingeringEffects: LingeringEffect[];
  /** Nested priority / PAW stack (innermost last). */
  priorityStack: PriorityWindowFrame[];
  /** Active cannot effects. */
  restrictions: Restriction[];
  /** Pending interactive trace, if any. */
  trace: TraceState | null;
  /** Pending interactive psi game, if any. */
  psi: PsiState | null;
  /** Pending damage awaiting prevention, if any. */
  pendingDamage: PendingDamage | null;
  /** Zaibatsu-class expose interrupt. */
  pendingExpose: {
    cardId: string;
    phase: "may_rez" | "interrupt";
    offeredRezIds?: string[];
    /** Live expected effects for this imminent expose (CR 9.9.2). */
    expectedEffects?: ExpectedEffects;
  } | null;
  pendingTrashPrevent: {
    cardId: string;
    /** Conditional interrupts marked pending when this window opened. */
    pendingInterruptIds?: string[];
    /** False once the trash is no longer an expected effect (CR 9.9.4c). */
    trashExpected?: boolean;
    /** Live expected effects for this imminent trash instruction (CR 9.9.2). */
    expectedEffects?: ExpectedEffects;
    /** The player carrying out the trash, when recorded (CR 1.14.5). */
    by?: "corp" | "runner" | null;
  } | null;
  /** When true, skip trash-prevent interrupt (accepting pending trash). */
  suppressTrashPrevent?: boolean;
  /**
   * Armed for the trash-self cost about to be paid when that ability
   * refers to virus counters hosted on its source (CR 9.5.5).
   */
  pendingTrashSetAsideVirus?: { sourceId: string };
  /** Virus counters set aside for the trash ability that is resolving. */
  resolvingSetAsideVirus?: { sourceId: string; count: number };
  /**
   * Armed for the trash-self cost about to be paid when that ability
   * acts on cards hosted on its source (CR 9.5.5).
   */
  pendingTrashSetAsideHosted?: { sourceId: string };
  /** Hosted cards set aside for the trash ability that is resolving. */
  resolvingSetAsideHosted?: { sourceId: string; cardIds: string[] };
  /**
   * Armed for the trash-self cost about to be paid when that ability
   * moves advancement counters off its source (CR 9.5.5).
   */
  pendingTrashSetAsideAdvancements?: { sourceId: string };
  /** Advancement counters set aside for the trash ability that is resolving. */
  resolvingSetAsideAdvancements?: { sourceId: string; count: number };
  pendingTags: PendingTags | null;
  /**
   * Pending end-the-run awaiting interrupt (Lucky Charm-class).
   */
  pendingEndTheRun: PendingEndTheRun | null;
  /** Pending subroutine-break interrupt (Tyr's Hand-class). */
  pendingSubroutineBreak: PendingSubroutineBreak | null;
  /**
   * Pending icebreaker strength-increase interrupt (System Seizure-class).
   * Auto-resolved today (mandatory, no choices); held during the window.
   */
  pendingStrengthIncrease: PendingStrengthIncrease | null;
  /** Remaining seq effects after an interrupt pause. */
  pendingEffectContinuation: PendingEffectContinuation | null;
  /** Pending Corp choice of program to trash. */
  pendingTrashProgram: PendingTrashProgram | null;
  /**
   * Runner is installing a program that would exceed the memory limit
   * (CR 3.9.3b / 8.5.6c). They trash installed programs until it fits,
   * then the install continues with the same destination.
   */
  pendingMuProgramInstall: {
    cardId: string;
    destination: InstallDestination;
  } | null;
  /** Pending sabotage N — Corp chooses HQ cards (CR §10.12). */
  pendingSabotage: PendingSabotage | null;
  /** Pending effect-IR choice (chooser must resolve). */
  pendingChoice: PendingChoice | null;
  /**
   * Cards set aside by a draw whose checkpoint reaction window is still open
   * (CR 8.4.5a / 10.3.2). They enter hand when that window closes (CR 8.4.5c).
   */
  pendingDrawSetAside?: { side: Side; cardIds: string[] } | null;
  /**
   * Exclusive multi-choice scaled by ice passed this run (Into the Depths).
   * Survives nested pendingChoice (charge / search install) until remaining is 0.
   */
  pendingExclusiveChoices: PendingExclusiveChoices | null;
  /**
   * After `start_run_on_mark` IR: host should start a run on the mark.
   * Cleared when the run begins or when there is no mark.
   */
  pendingStartRunOnMark: { sourceId: string } | null;
  /** Trick Shot-class: start a follow-up run on a chosen server. */
  pendingStartRun: {
    sourceId: string;
    serverId: ServerId;
    bypassFirstEncounterForClicks?: number;
    bonusAccess?: number;
    skipBreach?: boolean;
    onSuccessfulRunEffect?: import("../../effects/ir.js").Effect;
    onRunEndEffect?: import("../../effects/ir.js").Effect;
    /** Hired Help: agenda forfeit already paid for this pending run. */
    hiredHelpAgendaTaxPaid?: boolean;
    /** Cyber Threat: the Corp cannot rez ice during this run. */
    forbidCorpRezIceDuringRun?: boolean;
    /** Dorm Computer: prevent all tags during this run. */
    preventAllTagsThisRun?: boolean;
    rfgFirstNonAgendaAccess?: boolean;
    lastingRfgCopiesOnAccess?: boolean;
    /** Always Have a Backup Plan: ignore additional costs to run; bypass this ice. */
    backupPlanIgnoreAdditionalCosts?: boolean;
    backupPlanBypassIceId?: string;
  } | null;
  /**
   * Cataloguer-class: begin a standalone post-run-style breach of this server
   * (not a successful run). Cleared when the breach shell starts.
   */
  pendingStandaloneBreach: {
    sourceId: string;
    serverId: ServerId;
    /** Mind's Eye: exclude server-root cards from this breach. */
    cannotAccessRoot?: boolean;
  } | null;
  /**
   * Hangeki-class: out-of-run access of one installed Corp card via a
   * post-run-style breach shell with a single preset candidate.
   */
  pendingStandaloneCardAccess: {
    sourceId: string;
    cardId: string;
    serverId: ServerId;
  } | null;
  /**
   * After run-event onPlay choice (e.g. Reprise return-to-HQ): start this run
   * once the choice resolves. Cleared when the run begins.
   */
  pendingRunEventStart: { sourceId: string; serverId: ServerId } | null;
  /**
   * A played event whose trash step waits on a pending choice (CR 8.6.6b).
   * Settled when that choice finishes.
   */
  pendingPlayedEventTrashId: string | null;
  /**
   * A terminal operation whose play ability is still open (CR 9.7.1).
   * The action phase ends when that ability finishes.
   */
  pendingTerminalOperationId: string | null;
  /**
   * An operation with a play cost of X, already in the play area, waiting for
   * the Corp to choose X before that cost is paid (CR 8.6.2a).
   */
  pendingPlayCostXCardId: string | null;
  /**
   * A run event that is still in the play area for the run it started (CR 8.6.5).
   * Trashed when that run is over.
   */
  playedRunEventId: string | null;
  /**
   * Play/ability spent a click but deferred `afterBasicAction` for a pending
   * choice (e.g. Carpe Diem may-run). Cleared when the choice resolves.
   */
  deferAfterBasicAction: boolean;
  /**
   * Agenda awaiting score after `scoreAdditionalCost` resolves (Azef).
   * Cleared when scoring completes or the cost cannot be paid.
   */
  pendingScoreAgendaId: string | null;
  /** Agenda awaiting steal after steal additional costs (Daniela). */
  pendingStealAgendaId: string | null;
  /** Card awaiting trash_accessed after trashAdditionalCost (Daniela). */
  pendingTrashAccessedCardId: string | null;
  /** Ice awaiting rez after rezAdditionalCost (Valentão). */
  pendingRezCardId: string | null;
  /**
   * Pending allotted-click delta applied on the Runner's next gain-clicks step
   * (Hypoxia −1). Cleared when applied.
   */
  runnerAllottedClicksDeltaNextTurn: number;
  /** Hypoxia-class pending Corp allotted clicks (Aggressive Trendsetting +1). */
  corpAllottedClicksDeltaNextTurn: number;
  /** The Price of Freedom: Corp cannot advance during their next turn. */
  corpCannotAdvanceCardsNextTurn: boolean;
  /**
   * Saraswati-class: card ids that cannot be scored or rezzed until the next
   * Corp turn begins (survives Runner turn; cleared in beginCorpTurnFlags).
   */
  cannotScoreOrRezUntilNextCorpTurnCardIds: string[];
  /** Turn-scoped flags for conditional abilities. */
  turn: TurnBookkeeping;
  /** Cards removed from the game (Steve Cambridge). */
  removedFromGame: string[];
  /** Cards shown to all players by a reveal (CR 1.21.3). Open to both. */
  reveals?: RevealEvent[];
  revealSeq?: number;
  /** Cards one player looked at (CR 1.21.2). Each entry is for that player only. */
  looks?: LookEvent[];
  lookSeq?: number;
  /**
   * Watch the World Burn lasting titles: accessing a card with one of these
   * printed titles removes it from the game.
   */
  rfgPrintedTitlesOnAccess: string[];
  /** Encore: additional Runner turns to take after this one. */
  pendingExtraRunnerTurns: number;
  /** Most recent forfeited agenda's printed agenda points (Jemison / Quarantine). */
  lastForfeitedAgendaPoints: number;
  /** Advancement requirement of the most recently forfeited agenda (Success). */
  lastForfeitedAdvancementRequirement: number;
  /** Winner when the game has ended. A draw is neither side. */
  winner: Side | "draw" | null;
  /** Win reason for hosts. */
  winReason:
    | "corp_agenda"
    | "runner_agenda"
    | "flatline"
    | "empty_rd"
    | "corp_alternate"
    | "runner_alternate"
    | "draw"
    | null;
  config: GameConfig;
  /**
   * Position in this game's seeded random stream (see `state/rng.ts`).
   * It predicts every later shuffle and random pick, so a host must never
   * send it to a seat.
   */
  rngState?: number;
  /** Last number handed out per id prefix (see `state/ids.ts`). */
  idSeq?: Record<string, number>;
  /**
   * Ids of the active cards, oldest first by when each became active.
   * Kept by the checkpoint so that uniqueness trashes all but the newest
   * (CR 10.3.1d).
   */
  activeOrder?: string[];
  /**
   * An action whose cost has its payer pick cards. Nothing is paid until
   * the picks are in; the action then resolves with them (CR 1.16.1).
   */
  pendingCost?: PendingCost;
  /** The picks for the cost being paid by the action now resolving. */
  costCardIds?: string[];
  log: string[];
  /** True when the game (or demo cycle) has finished. */
  done: boolean;
}
