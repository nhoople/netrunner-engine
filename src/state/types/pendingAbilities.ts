/** Pending conditional ability instances and their payloads. */

import type { Effect } from "../../effects/ir.js";
import type { ServerId } from "./servers.js";
import type { Side } from "./shared.js";

/** Lifecycle of a pending conditional ability instance (CR 9.6.2 / 9.6.12). */
export type PendingAbilityStatus =
  "pending" | "imminent" | "resolving" | "done" | "cancelled";

/**
 * One instance of a conditional ability waiting in (or resolving through)
 * a reaction window (CR 9.6.2). Multiple instances of the same ability are
 * independent (CR 9.6.4 / 9.6.4b).
 */
export interface PendingAbilityInstance {
  id: string;
  /** Stable key for the printed/granted ability (not the instance). */
  abilityKey: string;
  sourceId: string;
  controller: Side;
  mandatory: boolean;
  status: PendingAbilityStatus;
  /**
   * True once the first instruction is imminent (CR 9.6.12 / 9.5.4 / 9.8.8).
   * Pending dies if the ability goes inactive (CR 9.6.10); independent does not.
   */
  independentOfSource: boolean;
  /**
   * Reaction / interrupt window that owns this fixed set (CR 9.2.8a / 9.2.9a).
   * Null until the window opens.
   */
  windowId: string | null;
  /**
   * The source was an active installed card (a rezzed asset, upgrade or ice,
   * or a faceup Runner card) when the instance became pending, so it can
   * later become inactive (CR 1.8.3a).
   */
  sourceActiveInPlay?: boolean;
  /** Resolver payload until the ability is fully on Effect IR hooks. */
  payload?: PendingAbilityPayload;
}

export type PendingAbilityPayload =
  | { kind: "blackguard_force_rez"; targetId: string }
  | { kind: "swap_install_trigger"; serverId: ServerId }
  | { kind: "reveal_drawn_card"; cardId: string }
  | { kind: "may_install_drawn_agenda"; cardId: string }
  | {
      kind: "may_install_drawn_ice";
      cardId: string;
      serverId: ServerId;
      discount: number;
    }
  | { kind: "may_raman_swap"; cardIds: string[] }
  | { kind: "trash_random_from_grip" }
  | { kind: "net_damage_on_corp_trash"; amount: number }
  | { kind: "draw_on_trash_ability"; amount: number }
  | { kind: "chum_net_damage"; amount: number }
  | { kind: "amaze_give_tags"; amount: number }
  | { kind: "on_corp_draw_card"; drawnCardId: string }
  | {
      kind: "stored_conditional";
      /** Card field / dotted path resolved at resolve time. */
      effectKey: StoredConditionalEffectKey;
    }
  | {
      kind: "inline_conditional";
      /** Synthesized Effect for flag-driven conditionals (no card Effect field). */
      effect: Effect;
    };

/** Card field (or dotted path) for a storedTriggers conditional Effect. */
export type StoredConditionalEffectKey =
  | "onScoreTurnEnd"
  | "onWouldTakeBadPublicity"
  | "onFirstRunnerCreditPoolEmptyThisTurn"
  | "onSuccessfulRun"
  | "onSuccessfulRunOnThisServer"
  | "onSuccessfulRunThisServer"
  | "onUnsuccessfulRunOnThisServer"
  | "onAccessWhileInstalled"
  | "onAccessWhileUninstalled"
  | "onAccessNotFromRd"
  | "onExposeWhileInstalled"
  | "onFirstAdvancementOnServerThisTurn"
  | "onEncounterAnyIceOncePerTurn"
  | "runEvent.onFirstEncounterThisRun"
  | "onFinishAccessRdOncePerTurn"
  | "onTurnBeginIfNoRunnerSuccessfulRunLastTurn"
  | "onPsiCreditsRevealed"
  | "onCorpActionPhaseEnd"
  | "onRunnerActionPhaseEnd"
  | "onAgendaAddedToRunnerScore"
  | "onFirstRunnerStoleOrTrashedCorpCardThisTurn"
  | "onFirstRunnerClickSpendOrLoseDuringRun"
  | "onEachCorpBadPublicityTake"
  | "onFirstBadPublicityTakeEachTurn"
  | "onFirstAgendaScoredOrStolenThisTurn"
  | "mirrormorphOnThirdDistinctAction"
  | "identityFlippedHooks.onFirstOperationPlayThisTurn"
  | "identityFlippedHooks.onSuccessfulHqOrRdRun"
  | "identityFlippedHooks.onSuccessfulHqRun"
  | "onFirstEventTrashedThisTurn"
  | "onFirstInstallInThisServerRootThisTurn"
  | "onFirstCorpCardTrashEachTurn"
  | "onFirstInstalledCorpCardTrashEachTurn"
  | "onFirstAccessTrashEachTurn"
  | "onAccessTrash"
  | "onTakeTagsWhenUntagged"
  | "onFirstAvoidOrRemoveTagThisTurn"
  | "onTrash"
  | "onUninstall"
  | "onTrashFromGripOrStack"
  | "onFirstGripOrStackTrashBatchEachTurn"
  | "onFirstProgramOrHardwareTrashEachTurn"
  | "onFirstRemoteInstallThisTurn"
  | "onFirstCorpRootInstallEachTurn"
  | "onFirstCorpCardInstallEachTurn"
  | "onFirstTrashMatchingRunnerIdentityFactionEachTurn"
  | "onVirusPurge"
  | "onRemoveTags"
  | "onSufferCoreDamage"
  | "onFirstCoreDamageThisTurn"
  | "onFirstEmptyGripEachTurn"
  | "onProgramOrHardwareInstall"
  | "onFirstHardwareInstallEachTurn"
  | "onFirstProgramInstallEachTurn"
  | "onHardwareInstall"
  | "onHardwareInstallOrTrash"
  | "onFirstInstallEachTurn"
  | "onFirstClickLossEachTurnExceptPaidAbility"
  | "onFirstBasicClickDrawEachTurn"
  | "onFirstDamageEachTurn"
  | "onGameStart"
  | "onEncounter"
  | "onVirusProgramInstall"
  | "onFirstVirusInstallThisTurn"
  | "onTurnBegin"
  | "onTurnBeginIfRunnerTagged"
  | "onCorpTurnBeginIfRunnerUntagged"
  | "onCorpTurnBegin"
  | "onBreachRd"
  | "onBreachHqIfHostingCorpCard"
  | "onCorpTurnEnd"
  | "onRunnerTurnBegin"
  | "onRunnerTurnEnd"
  | "onRunBegin"
  | "onFirstRdRunBeginThisTurn"
  | "onFirstRunBeginThisTurn"
  | "onFirstArchivesRunBeginThisTurn"
  | "onTurnBeginIfCorpNoBadPublicity"
  | "onApproachIce"
  | "onPass"
  | "onPassHost"
  | "onSuccessfulRunOnRd"
  | "onSuccessfulRunOtherServerOncePerTurn"
  | "onSuccessfulRunEndOncePerTurn"
  | "onSuccessfulRunEnd"
  | "onAdvance"
  | "onScore"
  | "onAgendaScored"
  | "onTrashWhileAccessed"
  | "onCorpRemoteServerCreated"
  | "onBypass"
  | "onBreakSubroutine"
  | "onAccess"
  | "onForfeit"
  | "onInstall"
  | "onRez"
  | "onPlay"
  | "onHostRezzed"
  | "onHostDerezzed"
  | "onAnyIceRez"
  | "onRezIceProtectingThisServer"
  | "onSteal"
  | "onStealAgenda"
  | "onOtherAgendaStolen"
  | "onAgendaStolen"
  | "onFullyBreak"
  | "onEncounterEnd"
  | "onMovedToServerRoot"
  | "onEncounterEndIfRezzedThisTurn"
  | "onEncounterEndIfNotFullyBroken"
  | "onEncounterEndIfPrintedSubroutineBroken"
  | "onEncounterRezzedAfterApproach"
  | "onFirstEncounterEachRun"
  | "onHostEncounter"
  | "onFirstPassIceEachTurn"
  | "onPassUnrezzedIce"
  | "onPassRezzedIce"
  | "onFirstPassRezzedCodeGateOrSentryThisTurn"
  | "onPassRezzedIceProtectingThisServer"
  | "onPassAllIceProtectingServer"
  | "onApproachServer"
  | "onFirstSuccessfulMarkRunThisTurn"
  | "onFirstSuccessfulHqRunThisTurn"
  | "onFirstSuccessfulHqOrRdRunThisTurn"
  | "onFirstSuccessfulCentralRunThisTurn"
  | "onFirstSuccessfulRunThisTurn"
  | "onFirstUnsuccessfulRunThisTurn"
  | "onFirstSuccessfulRunOnRdEndsThisTurn"
  | "onAccessFaceupInstalledAgenda"
  | "onAfterOperationOrExpendable"
  | "onAgendaAccessedOrScored"
  | "onAgendaScoredFromThisServer"
  | "onAgendaScoredOrStolen"
  | "onCorpBasicClickForCreditOrDraw"
  | "onCreditsGainedFromAgendaOrOperationAbility"
  | "onDiscardPhaseEnd"
  | "onFirstIceRezEachTurn"
  | "onFirstRevealEachTurn"
  | "onFirstTagThisTurn"
  | "onFullyBreakOncePerTurn"
  | "onFullyBreakProtectingIce"
  | "onGrayOrBlackOpsTrashedAfterResolve"
  | "onHostFullyBrokenThisEncounter"
  | "onInstallFromNonHq"
  | "onInstallProgramFromHeap"
  | "onInstallWithoutSpendingCredits"
  | "onPowerCountersEmpty"
  | "onRezzedCardTrashed"
  | "onRunDeclaredOnThisServerIfTagged"
  | "onRunnerDiscardOverMaxHand"
  | "identityFlippedHooks.onRunnerDiscardPhaseEnd"
  | "onRunnerTrashFromThisServerRootOrProtecting"
  | "onSpendCreditsOutsidePoolDuringRunOncePerTurn"
  | "onSuccessfulTraceDuringRun"
  | "onWouldDrawOncePerTurn"
  | "afterMandatoryDraw"
  | "onBeforeFirstTurn"
  | "onFirstHardwareUseDuringRunEachTurn"
  | "onFirstResourcePaidAbilityEachTurn"
  | "identityFlippedHooks.onFlipToBackIfRunMatchesFace"
  | "onCorpAbilityCausesRunnerSpendOrLoseCreditsDuringRun"
  | "onArchivesFacedownTurnedFaceupGte";
