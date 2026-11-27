/**
 * Core game-state types for the Netrunner engine library.
 *
 * The types live in `src/state/types/`, one file per thing they describe.
 * This file re-exports them so its importers need not change (layout plan
 * slice E2; E5 points the importers at the new files and removes this one).
 */

export type { Side, CardType, ZoneId, DamageType } from "./types/shared.js";
export type {
  ContinuousGainedSubDecl,
  RecurringSpendPurpose,
  Subroutine,
  BreakerAbility,
  InterruptWindow,
  PaidAbilityWindow,
  CostSpec,
  StartsRunSpec,
  PaidAbility,
} from "./types/abilities.js";
export type { CardInstance } from "./types/card.js";
export type { CentralServerId, ServerId, Server } from "./types/servers.js";
export type { PlayerState } from "./types/players.js";
export type { TurnBookkeeping, TurnPhase } from "./types/turn.js";
export type { RunState } from "./types/run.js";
export type {
  ForbiddenAction,
  RuleCite,
  Restriction,
} from "./types/restrictions.js";
export type {
  CheckpointKind,
  CheckpointFrame,
  CheckpointFacts,
  CheckpointSnapshot,
} from "./types/checkpoints.js";
export type {
  PendingAbilityStatus,
  PendingAbilityInstance,
  PendingAbilityPayload,
  StoredConditionalEffectKey,
} from "./types/pendingAbilities.js";
export type {
  ReactionWindowFrame,
  ExpectedEffects,
  PendingStrengthIncrease,
  PriorityWindowFrame,
  TimingCursor,
} from "./types/windows.js";
export type { LingeringDuration, LingeringEffect } from "./types/lingering.js";
export type {
  TraceState,
  PendingEffectContinuation,
} from "./types/pendingChoices.js";
export type { GameConfig, GameState } from "./types/game.js";
export type {
  InstallDestination,
  Action,
  Intent,
  ApplyResult,
} from "./types/actions.js";
export type {
  PublicHostedCardView,
  PublicPlayAreaCardView,
  PublicSetAsideCardView,
  RevealEvent,
  LookEvent,
  PublicView,
} from "./types/publicView.js";
