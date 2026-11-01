/** Per-turn bookkeeping for Gateway abilities (successful runs, once-per-turn, etc.). */

import { abilitiesSuppressed } from "./abilities.js";
import { recomputeRunnerMaxHandSize } from "./handSize.js";
import { lingeringRunnerMuModifier } from "./lingeringEffects.js";
import type { GameState, TurnBookkeeping } from "./types.js";
import { agendaPointMu } from "./staticFlags.js";

export function emptyTurnBookkeeping(
  prev?: Partial<TurnBookkeeping>,
): TurnBookkeeping {
  return {
    successfulRunThisTurn: false,
    successfulRunCountThisTurn: 0,
    successfulRunLastTurn: prev?.successfulRunLastTurn ?? false,
    unsuccessfulRunThisTurn: false,
    hyoubuSecretSpendGainUsedThisTurn: false,
    firstPassIceMetPending: false,
    bmFirstPassIceUsedThisTurn: false,
    bmFirstAdvancedIceEncounterEndMeatUsed: false,
    esObelusRunEndUsed: false,
    esSufferedCorpDamageThisTurn: false,
    esNetMercurStealthUsedThisRun: false,
    esNetMercurPendingSourceId: undefined,
    injectionAttackBreakerBonus: undefined,
    unsuccessfulRunLastTurn: prev?.unsuccessfulRunLastTurn ?? false,
    advertisementRezzedThisTurn: false,
    dadDuplicateSubsOnNextIceEncounter: false,
    dadPreventWhenEncounteredArmed: false,
    dadBlankedCardIds: [],
    dadBreakerStrengthBoosts: {},
    dadCannotUseProgramsThisRun: false,
    dadOwnInstalledTrashedThisTurn: 0,
    successfulRunServersThisTurn: [],
    successfulRunServersLastTurn: prev?.successfulRunServersLastTurn ?? [],
    agendaPointsScoredThisTurn: 0,
    scoredCardIdsThisTurn: [],
    programsInstalledThisTurn: 0,
    hardwareInstalledThisTurn: 0,
    lastHardwareInstalledId: null,
    programsWithVirusPlacedThisTurn: [],
    jobConnectionOrHardwareInstallDiscountUsedThisTurn: false,
    lastStolenAgendaId: null,
    basicDrawsThisTurn: 0,
    usedAbilities: [],
    installedThisTurn: [],
    valInstallTriggerCount: 0,
    valClickLossTriggerCount: 0,
    valDamageTriggerCount: 0,
    valBasicClickDrawTriggerCount: 0,
    valSuccessfulRunTriggerCount: 0,
    bbPreventAllTagsThisRun: false,
    lastPlayCostX: undefined,
    ccAnalogDreamersRun: false,
    ccRunnerCannotDraw: false,
    ccImmolationScriptUsedThisRun: false,
    agendasStolenThisTurn: 0,
    uotFirstAgendaAccessCredits: undefined,
    uotCannotRezOutermostIce: false,
    uotBookmarkHostRemaining: undefined,
    uotRunnerCardsDrawnThisTurn: 0,
    uotChronosNetDamageUsedThisTurn: false,
    uotChronosTrashRemaining: undefined,
    corpInstalledFromHqThisTurn: false,
    firstCorpCardInstallUsedThisTurn: false,
    firstCorpCardInstallMetPending: false,
    tdatd419FiredThisTurn: false,
    lastScoredOrStolenAgendaId: undefined,
    tdatdFalsifiedNamedType: undefined,
    rezzedThisTurnIds: [],
    sisyphusPassMetPending: false,
    sisyphusPassUsedThisTurn: false,
    passUnrezzedIceMetPending: false,
    passRezzedIceMetPending: false,
    passIceOnPassPendingIds: [],
    passHostPendingIceIds: [],
    passProtectingServerPendingIds: [],
    encounterEndPendingIds: [],
    encounterEndRezzedThisTurnPendingIds: [],
    encounterEndNotFullyBrokenPendingIds: [],
    encounterEndPrintedSubBrokenPendingIds: [],
    hostEncounterPendingIceIds: [],
    encounterRezzedAfterApproachMetPending: false,
    approachServerPendingIds: [],
    passAllIceProtectingServerPendingIds: [],
    bypassPendingSourceIds: [],
    approachIcePendingIds: [],
    firstSuccessfulRdRunEndMetPending: false,
    successfulRunOnRdPendingIds: [],
    successfulRunEndOncePendingIds: [],
    successfulRunEndPendingIds: [],
    otherServerSuccessPendingIds: [],
    successfulRunPendingIds: [],
    successfulRunServerPending: [],
    unsuccessfulRunServerPendingIds: [],
    accessAbilityPending: [],
    corpActionPhaseEndPending: [],
    runnerActionPhaseEndPending: [],
    encounterAbilityPending: [],
    outsidePoolSpendPending: [],
    beforeFirstTurnPending: [],
    iceRezAbilityPending: [],
    inlineConditionalPending: [],
    storedConditionalPending: [],
    runBeginPendingIds: [],
    corpTurnEndPendingIds: [],
    runnerTurnEndPendingIds: [],
    scoreTurnEndPendingIds: [],
    corpTurnBeginPending: [],
    runnerTurnBeginPending: [],
    nuvemFirstRdTrashUsedThisTurn: false,
    advancedThisTurn: [],
    cannotScoreAgendas: false,
    cannotAdvanceCards: false,
    cannotScoreOrRezCardIds: [],
    cannotAccessCardIdsThisTurn: [],
    remotesUnlockedByCentralRunThisTurn: false,
    patchworkDiscountUsedThisTurn: false,
    patchworkPendingDiscountThisAction: 0,
    sundewFirstClickSpendFiredThisTurn: false,
    sundewRefundServerIdsThisAction: [],
    seidrClickDuringRunFiredThisTurn: false,
    seidrClickMetPending: false,
    corpInstallInProgress: false,
    obSuperheavyUsedThisTurn: false,
    lastTrashedRezzedPrintedRezCost: null,
    lastTrashedOwnProgramInstallCost: null,
    lastTraceExcess: null,
    lastResolvedTraceStrength: null,
    firstRemoteInstallThisTurnUsed: false,
    firstRemoteInstallMetPending: false,
    triggerRemoteInstallServerId: null,
    onTrashSourceServerId: null,
    firstRunBeginMetPending: false,
    runBeginThisTurnUsed: false,
    firstRdRunBeginMetPending: false,
    firstArchivesRunBeginMetPending: false,
    firstUnsuccessfulRunMetPending: false,
    firstSuccessfulHqRunMetPending: false,
    firstSuccessfulHqOrRdRunMetPending: false,
    firstSuccessfulCentralRunMetPending: false,
    firstSuccessfulMarkRunMetPending: false,
    daredevilDrawMetPending: false,
    installedCardCreditSpendThisTurn: false,
    companionInstallOrSpendCreditsFiredThisTurn: false,
    tagsGivenThisTurn: 0,
    firstTagThisTurnMetPending: false,
    firstTagThisTurnUsedThisTurn: false,
    runnerCreditPoolEmptyFiredThisTurn: false,
    firstCreditPoolEmptyMetPending: false,
    firstHardwareInstallMetPending: false,
    firstHardwareInstallUsedThisTurn: false,
    firstProgramInstallMetPending: false,
    firstProgramInstallUsedThisTurn: false,
    firstVirusInstallMetPending: false,
    firstVirusInstallUsedThisTurn: false,
    coreDamageSufferedThisTurn: 0,
    damageSufferedThisTurn: 0,
    valDamageTriggerPendingCounts: [],
    valInstallTriggerPendingCounts: [],
    valClickLossTriggerPendingCounts: [],
    valBasicClickDrawTriggerPendingCounts: [],
    valSuccessfulRunTriggerPendingCounts: [],
    vanadisNextPawArmed: false,
    ssByAnyMeansActive: false,
    ssFirstFullyBreakCreditsFired: false,
    respirocytesEmptyGripFiredThisTurn: false,
    virusProgramsInstalledThisTurn: 0,
    rdRunBegunThisTurn: false,
    archivesRunBegunThisTurn: false,
    lastAgendaScoredOrStolenServerId: null,
    successfulMarkRunThisTurn: false,
    hqBreachesThisTurn: 0,
    serversRunThisTurn: [],
    zahyaRunEndUsed: false,
    reneAccessTrashUsed: false,
    firstCorpCardTrashUsedThisTurn: false,
    firstCorpCardTrashMetPending: false,
    firstCorpRootInstallUsedThisTurn: false,
    firstCorpRootInstallMetPending: false,
    carnivoreAccessTrashUsed: false,
    iceRezzedThisTurn: 0,
    runEventsPlayedThisTurn: 0,
    eventsPlayedThisTurn: 0,
    mandatesPlayedThisTurn: 0,
    firstEncounterUsedThisTurn: false,
    gantulgaEncounterIceId: null,
    remotesCreatedThisTurn: 0,
    agendaPointsStolenThisTurn: 0,
    agendaPointsStolenLastTurn: prev?.agendaPointsStolenLastTurn ?? 0,
    runnerStoleOrTrashedCorpCardThisTurn: false,
    runnerTrashedOwnInstalledThisTurn: false,
    runnerStoleOrTrashedCorpCardLastTurn:
      prev?.runnerStoleOrTrashedCorpCardLastTurn ?? false,
    runnerTrashedCorpCardThisTurn: false,
    runnerTrashedCorpCardLastTurn: prev?.runnerTrashedCorpCardLastTurn ?? false,
    firstRunnerStoleOrTrashedUsedThisTurn: false,
    firstRunnerStoleOrTrashedMetPending: false,
    firstAgendaScoredOrStolenUsedThisTurn: false,
    firstAgendaScoredOrStolenMetPending: false,
    rezIceForfeitDiscountCardId: null,
    corpActionTypeCounts: {},
    corpActionsCompletedThisTurn: 0,
    runnerClicksSpentThisTurn: 0,
    remainderOfTurnOnInstallPrintedCostGte: [],
    delayedTurnEndTags: [],
    corpFlippedIdentityFirstOpUsedThisTurn: false,
    corpFlippedIdentityFirstOpMetPending: false,
    runnerDiscardedToMaxHandIds: [],
    operationPlayedFromNonHq: false,
    zwickyCreditsDrawUsedThisTurn: false,
    rdLookedCards: [],
    rdArrangePlaced: [],
    rdArrangeThenMayDrawIfUnprotected: false,
    successfulHqRunThisTurn: false,
    successfulHqRunLastTurn: prev?.successfulHqRunLastTurn ?? false,
    successfulRdRunThisTurn: false,
    successfulArchivesRunThisTurn: false,
    accessedACardThisTurn: false,
    accessedACardLastTurn: prev?.accessedACardLastTurn ?? false,
    paulesCafeInstallUsedThisTurn: false,
    bufferDriveGripStackTrashUsedThisTurn: false,
    bufferDriveGripStackTrashMetPending: false,
    hardwareUsedDuringRunThisTurn: false,
    gripOrStackTrashBatchDepth: 0,
    pendingGripOrStackTrashBatchIds: [],
    lastRunPassedUnrezzedIceIds: prev?.lastRunPassedUnrezzedIceIds ?? [],
    currentRunPassedUnrezzedIceIds: [],
    runnerMadeRunThisTurn: false,
    runnerMadeRunLastTurn: prev?.runnerMadeRunLastTurn ?? false,
    runnerInstalledResourceThisTurn: false,
    runnerInstalledResourceLastTurn: prev?.runnerInstalledResourceLastTurn ?? false,
    subliminalPlayedThisTurn: false,
    steveCambridgeUsedThisTurn: false,
    bioroidPassedThisTurn: false,
    bioroidIcePaidAbilitiesForbidden: false,
    iceStrengthBoostsThisTurn: {},
    breakerStrengthBoostsThisTurn: {},
    iceAdditionalRezCostThisTurn: {},
    lastInstalledFromEffectId: null,
    pendingBioroidRezDiscount: 0,
    onSuccessfulRunFiredIds: [],
    onSuccessfulRunEndFiredIds: [],
    cannotMakeAnotherRunThisTurn: false,
    onFirstAvoidOrRemoveTagFiredIds: [],
    firstSuccessfulRdRunEndUsedThisTurn: false,
    firstProgramOrHardwareTrashUsedThisTurn: false,
    firstProgramOrHardwareTrashMetPending: false,
    firstAccessTrashUsedThisTurn: false,
    firstAccessTrashMetPending: false,
    lastAccessTrashCost: 0,
    firstResourcePaidAbilityThisTurn: false,
    onFullyBreakFiredIds: [],
    mercuryBreachBonusUsedThisTurn: false,
    infoBountyMarkRunEndUsed: false,
    hostileArchitectureUsedThisTurn: false,
    skipDiscardThisTurn: false,
    lastAdvancementTargetId: null,
    corpCardsAddedToArchivesThisTurn: 0,
    brasiliaAbilityUsedIds: [],
    lightningPendingDerez: null,
    firstCorpOnRemoveTagsThisTurn: false,
    ipEnforcementTagsRemoved: 0,
    ryoPhoenixFiredThisTurn: false,
    doubleOpClickDiscountUsedThisTurn: false,
    tungstenBreakCreditUsedThisTurn: false,
    stickAndPokeUsedThisTurn: false,
    sipaSwapUsedThisTurn: false,
    otherServerSuccessAbilityUsedIds: [],
    outsidePoolSpendAbilityUsedIds: [],
    firstBadPublicityTakeUsedThisTurn: false,
    firstBadPublicityMetPending: false,
    corpBadPublicityTakeEventsPending: 0,
    firstEventTrashedUsedThisTurn: false,
    firstEventTrashedMetPending: false,
    firstInstallInServerRootUsedIds: [],
    onVirusPurgeOncePerTurnFiredIds: [],
    climacticBonusAccessOnFirstHqRdBreach: 0,
    firstTrashMatchingRunnerIdentityFactionUsedThisTurn: false,
    firstTrashMatchingRunnerIdentityFactionMetPending: false,
    mlReaverDrawUsedThisTurn: false,
    firstInstalledTrashMetPending: false,
    sifrUsedThisTurn: false,
    sifrHandSizePenaltyActive: false,
    sensorNetPendingDerezIds: [],
    netQuarantineFirstTraceUsedThisTurn: false,
    corpScoredAgendaLastTurn: prev?.corpScoredAgendaLastTurn ?? false,
    firstRevealCreditUsedThisTurn: false,
    firstRevealMetPending: false,
    onWouldDrawOncePerTurnFiredIds: [],
    pendingWouldDrawAmount: null,
    corpActionKindsInOrderThisTurn: [],
    corpActionSequenceThisTurn: [],
    mirrormorphThirdDistinctFiredThisTurn: false,
    mirrormorphThirdDistinctMetPending: false,
    mirrormorphClickDiscountPending: false,
  };
}

/** Reset Corp-side counters at the start of the Corp turn. */
export function beginCorpTurnFlags(state: GameState): void {
  if (state.turn.gyriLabyrinthHandPenalty) {
    state.runner.maxHandSize += 2;
  }
  // Saraswati-class locks expire when the next Corp turn begins.
  state.cannotScoreOrRezUntilNextCorpTurnCardIds = [];
  for (const card of Object.values(state.cards)) {
    if (card?.scoredThisTurn) card.scoredThisTurn = false;
  }
  state.turn = {
    ...state.turn,
    // Runner's just-ended turn success becomes "last turn" for Corp ops (Public Trail).
    successfulRunLastTurn: state.turn.successfulRunThisTurn,
    successfulHqRunLastTurn: state.turn.successfulHqRunThisTurn,
    accessedACardLastTurn: state.turn.accessedACardThisTurn,
    accessedACardThisTurn: false,
    successfulRunServersLastTurn: [
      ...(state.turn.successfulRunServersThisTurn ?? []),
    ],
    successfulRunThisTurn: false,
    successfulRunCountThisTurn: 0,
    unsuccessfulRunThisTurn: false,
    hyoubuSecretSpendGainUsedThisTurn: false,
    firstPassIceMetPending: false,
    bmFirstPassIceUsedThisTurn: false,
    bmFirstAdvancedIceEncounterEndMeatUsed: false,
    esObelusRunEndUsed: false,
    esSufferedCorpDamageThisTurn: false,
    esNetMercurStealthUsedThisRun: false,
    esNetMercurPendingSourceId: undefined,
    injectionAttackBreakerBonus: undefined,
    unsuccessfulRunLastTurn: state.turn.unsuccessfulRunThisTurn,
    advertisementRezzedThisTurn: false,
    dadDuplicateSubsOnNextIceEncounter: false,
    dadPreventWhenEncounteredArmed: false,
    dadBlankedCardIds: [],
    dadBreakerStrengthBoosts: {},
    dadCannotUseProgramsThisRun: false,
    dadOwnInstalledTrashedThisTurn: 0,
    successfulRunServersThisTurn: [],
    successfulHqRunThisTurn: false,
    agendaPointsScoredThisTurn: 0,
    scoredCardIdsThisTurn: [],
    basicDrawsThisTurn: 0,
    usedAbilities: [],
    installedThisTurn: [],
    valInstallTriggerCount: 0,
    valClickLossTriggerCount: 0,
    valDamageTriggerCount: 0,
    valBasicClickDrawTriggerCount: 0,
    valSuccessfulRunTriggerCount: 0,
    bbPreventAllTagsThisRun: false,
    lastPlayCostX: undefined,
    ccAnalogDreamersRun: false,
    ccRunnerCannotDraw: false,
    ccImmolationScriptUsedThisRun: false,
    agendasStolenThisTurn: 0,
    uotFirstAgendaAccessCredits: undefined,
    uotCannotRezOutermostIce: false,
    uotBookmarkHostRemaining: undefined,
    uotRunnerCardsDrawnThisTurn: 0,
    uotChronosNetDamageUsedThisTurn: false,
    uotChronosTrashRemaining: undefined,
    corpInstalledFromHqThisTurn: false,
    firstCorpCardInstallUsedThisTurn: false,
    firstCorpCardInstallMetPending: false,
    tdatd419FiredThisTurn: false,
    lastScoredOrStolenAgendaId: undefined,
    tdatdFalsifiedNamedType: undefined,
    rezzedThisTurnIds: [],
    sisyphusPassMetPending: false,
    sisyphusPassUsedThisTurn: false,
    passUnrezzedIceMetPending: false,
    passRezzedIceMetPending: false,
    passIceOnPassPendingIds: [],
    passHostPendingIceIds: [],
    passProtectingServerPendingIds: [],
    encounterEndPendingIds: [],
    encounterEndRezzedThisTurnPendingIds: [],
    encounterEndNotFullyBrokenPendingIds: [],
    encounterEndPrintedSubBrokenPendingIds: [],
    hostEncounterPendingIceIds: [],
    encounterRezzedAfterApproachMetPending: false,
    approachServerPendingIds: [],
    passAllIceProtectingServerPendingIds: [],
    bypassPendingSourceIds: [],
    approachIcePendingIds: [],
    firstSuccessfulRdRunEndMetPending: false,
    successfulRunOnRdPendingIds: [],
    successfulRunEndOncePendingIds: [],
    successfulRunEndPendingIds: [],
    otherServerSuccessPendingIds: [],
    successfulRunPendingIds: [],
    successfulRunServerPending: [],
    unsuccessfulRunServerPendingIds: [],
    accessAbilityPending: [],
    corpActionPhaseEndPending: [],
    runnerActionPhaseEndPending: [],
    encounterAbilityPending: [],
    outsidePoolSpendPending: [],
    beforeFirstTurnPending: [],
    iceRezAbilityPending: [],
    inlineConditionalPending: [],
    storedConditionalPending: [],
    runBeginPendingIds: [],
    corpTurnEndPendingIds: [],
    runnerTurnEndPendingIds: [],
    scoreTurnEndPendingIds: [],
    corpTurnBeginPending: [],
    runnerTurnBeginPending: [],
    nuvemFirstRdTrashUsedThisTurn: false,
    advancedThisTurn: [],
    cannotScoreAgendas: false,
    cannotAdvanceCards: false,
    tagsGivenThisTurn: 0,
    firstTagThisTurnMetPending: false,
    firstTagThisTurnUsedThisTurn: false,
    runnerCreditPoolEmptyFiredThisTurn: false,
    firstCreditPoolEmptyMetPending: false,
    firstHardwareInstallMetPending: false,
    firstHardwareInstallUsedThisTurn: false,
    firstProgramInstallMetPending: false,
    firstProgramInstallUsedThisTurn: false,
    firstVirusInstallMetPending: false,
    firstVirusInstallUsedThisTurn: false,
    coreDamageSufferedThisTurn: 0,
    damageSufferedThisTurn: 0,
    valDamageTriggerPendingCounts: [],
    valInstallTriggerPendingCounts: [],
    valClickLossTriggerPendingCounts: [],
    valBasicClickDrawTriggerPendingCounts: [],
    valSuccessfulRunTriggerPendingCounts: [],
    vanadisNextPawArmed: false,
    ssByAnyMeansActive: false,
    ssFirstFullyBreakCreditsFired: false,
    respirocytesEmptyGripFiredThisTurn: false,
    virusProgramsInstalledThisTurn: 0,
    subliminalPlayedThisTurn: false,
    bioroidPassedThisTurn: false,
    bioroidIcePaidAbilitiesForbidden: false,
    iceStrengthBoostsThisTurn: {},
    breakerStrengthBoostsThisTurn: {},
    iceAdditionalRezCostThisTurn: {},
    lastInstalledFromEffectId: null,
    runnerMadeRunLastTurn: state.turn.runnerMadeRunThisTurn,
    runnerInstalledResourceLastTurn: state.turn.runnerInstalledResourceThisTurn,
    runnerInstalledResourceThisTurn: false,
    // Oppo / Hangeki: Runner's just-ended turn trash/steal becomes "last turn".
    runnerStoleOrTrashedCorpCardLastTurn:
      state.turn.runnerStoleOrTrashedCorpCardThisTurn,
    runnerTrashedCorpCardLastTurn: state.turn.runnerTrashedCorpCardThisTurn,
    pendingBioroidRezDiscount: 0,
    skipDiscardThisTurn: false,
    lastAdvancementTargetId: null,
    corpCardsAddedToArchivesThisTurn: 0,
    cannotScoreOrRezCardIds: [],
    cannotAccessCardIdsThisTurn: [],
    remotesUnlockedByCentralRunThisTurn: false,
    patchworkDiscountUsedThisTurn: false,
    patchworkPendingDiscountThisAction: 0,
    sundewFirstClickSpendFiredThisTurn: false,
    sundewRefundServerIdsThisAction: [],
    seidrClickDuringRunFiredThisTurn: false,
    seidrClickMetPending: false,
    firstRemoteInstallThisTurnUsed: false,
    firstRemoteInstallMetPending: false,
    firstBadPublicityTakeUsedThisTurn: false,
    firstBadPublicityMetPending: false,
    corpBadPublicityTakeEventsPending: 0,
    firstEventTrashedUsedThisTurn: false,
    firstEventTrashedMetPending: false,
    corpInstallInProgress: false,
    obSuperheavyUsedThisTurn: false,
    lastTrashedRezzedPrintedRezCost: null,
    lastTrashedOwnProgramInstallCost: null,
    lastTraceExcess: null,
    lastResolvedTraceStrength: null,
    brasiliaAbilityUsedIds: [],
    lightningPendingDerez: null,
    firstCorpOnRemoveTagsThisTurn: false,
    onFirstAvoidOrRemoveTagFiredIds: [],
    firstSuccessfulRdRunEndUsedThisTurn: false,
    firstProgramOrHardwareTrashUsedThisTurn: false,
    firstProgramOrHardwareTrashMetPending: false,
    firstAccessTrashUsedThisTurn: false,
    firstAccessTrashMetPending: false,
    lastAccessTrashCost: 0,
    ipEnforcementTagsRemoved: 0,
    ryoPhoenixFiredThisTurn: false,
    doubleOpClickDiscountUsedThisTurn: false,
    tungstenBreakCreditUsedThisTurn: false,
    firstAgendaScoredOrStolenUsedThisTurn: false,
    firstAgendaScoredOrStolenMetPending: false,
    rezIceForfeitDiscountCardId: null,
    corpActionsCompletedThisTurn: 0,
    runnerClicksSpentThisTurn: 0,
    remainderOfTurnOnInstallPrintedCostGte: [],
    delayedTurnEndTags: [],
    climacticBonusAccessOnFirstHqRdBreach: 0,
    firstTrashMatchingRunnerIdentityFactionUsedThisTurn: false,
    firstTrashMatchingRunnerIdentityFactionMetPending: false,
    mlReaverDrawUsedThisTurn: false,
    firstInstalledTrashMetPending: false,
    sifrUsedThisTurn: false,
    sifrHandSizePenaltyActive: state.turn.sifrHandSizePenaltyActive,
    sensorNetPendingDerezIds: [],
    netQuarantineFirstTraceUsedThisTurn: false,
    corpScoredAgendaLastTurn: state.turn.corpScoredAgendaLastTurn,
    firstRevealCreditUsedThisTurn: false,
    firstRevealMetPending: false,
    corpActionKindsInOrderThisTurn: [],
    corpActionSequenceThisTurn: [],
    mirrormorphThirdDistinctFiredThisTurn: false,
    mirrormorphThirdDistinctMetPending: false,
    mirrormorphClickDiscountPending: false,
    corpFlippedIdentityFirstOpUsedThisTurn: false,
    corpFlippedIdentityFirstOpMetPending: false,
    runnerDiscardedToMaxHandIds: [],
    operationPlayedFromNonHq: false,
    zwickyCreditsDrawUsedThisTurn: false,
  };
}

/** Reset Runner-side counters at the start of the Runner turn. */
export function beginRunnerTurnFlags(state: GameState): void {
  const hadSifrHandPenalty = state.turn.sifrHandSizePenaltyActive;
  const corpScoredLast =
    (state.turn.agendaPointsScoredThisTurn ?? 0) > 0 ||
    (state.turn.scoredCardIdsThisTurn ?? []).length > 0;
  state.turn = emptyTurnBookkeeping({
    successfulRunLastTurn: state.turn.successfulRunLastTurn,
    unsuccessfulRunLastTurn: state.turn.unsuccessfulRunLastTurn,
    successfulHqRunLastTurn: state.turn.successfulHqRunLastTurn,
    successfulRunServersLastTurn: state.turn.successfulRunServersLastTurn,
    agendaPointsStolenLastTurn: state.turn.agendaPointsStolenThisTurn,
    runnerStoleOrTrashedCorpCardLastTurn:
      state.turn.runnerStoleOrTrashedCorpCardThisTurn,
    runnerTrashedCorpCardLastTurn: state.turn.runnerTrashedCorpCardThisTurn,
    lastRunPassedUnrezzedIceIds: state.turn.lastRunPassedUnrezzedIceIds,
    runnerMadeRunLastTurn: state.turn.runnerMadeRunThisTurn,
    runnerInstalledResourceLastTurn: state.turn.runnerInstalledResourceThisTurn,
    runnerInstalledResourceThisTurn: false,
    accessedACardLastTurn: state.turn.accessedACardLastTurn,
    corpScoredAgendaLastTurn: corpScoredLast,
  });
  // Şifr: clearing the flag restores hand size via recompute (CR 9.12.1a).
  if (hadSifrHandPenalty) recomputeRunnerMaxHandSize(state);
}

export function markAbilityUsed(
  state: GameState,
  cardId: string,
  abilityId: string,
): void {
  state.turn.usedAbilities.push(`${cardId}:${abilityId}`);
}

/**
 * A card that leaves play and is installed again is a new object, so a
 * once-per-turn use on the previous object does not carry over (CR 1.12.2).
 */
export function cardBecameNewObject(state: GameState, cardId: string): void {
  const prefix = `${cardId}:`;
  state.turn.usedAbilities = state.turn.usedAbilities.filter(
    (key) => !key.startsWith(prefix),
  );
}

export function wasAbilityUsed(
  state: GameState,
  cardId: string,
  abilityId: string,
): boolean {
  return state.turn.usedAbilities.includes(`${cardId}:${abilityId}`);
}

/** Wendigo: the Runner cannot use this program for the rest of the run. */
export function programBannedThisRun(
  state: GameState,
  cardId: string,
): boolean {
  return Boolean(state.run?.bannedProgramInstanceIds?.includes(cardId));
}

export function markAbilityUsedThisRun(
  state: GameState,
  cardId: string,
  abilityId: string,
): void {
  if (!state.run) return;
  if (!state.run.usedAbilitiesThisRun) state.run.usedAbilitiesThisRun = [];
  state.run.usedAbilitiesThisRun.push(`${cardId}:${abilityId}`);
}

export function wasAbilityUsedThisRun(
  state: GameState,
  cardId: string,
  abilityId: string,
): boolean {
  return (state.run?.usedAbilitiesThisRun ?? []).includes(
    `${cardId}:${abilityId}`,
  );
}

export function markAbilityUsedThisEncounter(
  state: GameState,
  cardId: string,
  abilityId: string,
): void {
  if (!state.run) return;
  if (!state.run.usedAbilitiesThisEncounter) {
    state.run.usedAbilitiesThisEncounter = [];
  }
  state.run.usedAbilitiesThisEncounter.push(`${cardId}:${abilityId}`);
}

export function wasAbilityUsedThisEncounter(
  state: GameState,
  cardId: string,
  abilityId: string,
): boolean {
  return (state.run?.usedAbilitiesThisEncounter ?? []).includes(
    `${cardId}:${abilityId}`,
  );
}

export function icebreakerCount(state: GameState): number {
  return state.runner.installed.filter((id) => {
    const c = state.cards[id];
    return Boolean(c?.breaker) || (c?.subtypes ?? []).includes("icebreaker");
  }).length;
}

/**
 * Effective MU cost for a program (Key Master cloud: 0 while link ≥ threshold).
 * Uses recomputed printed link (`state.runner.link`).
 */
export function effectiveMemoryCost(state: GameState, cardId: string): number {
  const c = state.cards[cardId];
  if (!c) return 1;
  const printed = c.memoryCost ?? 1;
  if (abilitiesSuppressed(state, cardId)) return printed;
  const thresh = c.memoryCostZeroIfLinkGte;
  if (typeof thresh === "number" && (state.runner.link ?? 0) >= thresh) {
    return 0;
  }
  const perPower = c.memoryCostPerPowerCounter ?? 0;
  if (perPower !== 0) {
    return printed + perPower * (c.powerCounters ?? 0);
  }
  return printed;
}

/** Installed programs that count toward the memory limit, in install order. */
export function programMemoryCosts(
  state: GameState,
): { id: string; cost: number }[] {
  const costs: { id: string; cost: number }[] = [];
  let caissaPool = caissaMuBonusAvailable(state);
  for (const id of state.runner.installed) {
    const c = state.cards[id];
    if (!c || c.type !== "program") continue;
    // Muse-class: programs hosted on a daemonHost do not consume MU.
    if (c.hostId && !abilitiesSuppressed(state, c.hostId)) {
      const host = state.cards[c.hostId];
      if (host?.daemonHost) continue;
      if (host?.hostedIcebreakerMemoryDoesNotCount) continue;
      if (host?.hostedProgramMemoryDoesNotCount) continue;
    }
    let cost = effectiveMemoryCost(state, id);
    if ((c.subtypes ?? []).includes("virus")) {
      for (const hid of state.runner.installed) {
        if (abilitiesSuppressed(state, hid)) continue;
        const host = state.cards[hid];
        if (host?.muBonusOnlyForVirusPrograms) {
          cost = Math.max(0, cost - (host.muBonus ?? 0));
        }
      }
    }
    if (isCaissaProgram(state, id) && caissaPool > 0) {
      const reduce = Math.min(cost, caissaPool);
      cost -= reduce;
      caissaPool -= reduce;
    }
    costs.push({ id, cost });
  }
  return costs;
}

export function usedMemory(state: GameState): number {
  return programMemoryCosts(state).reduce((sum, entry) => sum + entry.cost, 0);
}

export function memoryLimit(state: GameState): number {
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const c = state.cards[id];
    if (c?.memoryLimitEqualsGripSize) {
      return state.runner.hand.length;
    }
  }
  let limit = state.runner.memoryLimit + agendaPointMu(state);
  const identity = state.cards[state.runner.identityId];
  if (
    identity?.muBonus &&
    !abilitiesSuppressed(state, state.runner.identityId)
  ) {
    limit += identity.muBonus;
  }
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const c = state.cards[id];
    if (c.muBonus && !c.muBonusOnlyForCaissaPrograms) limit += c.muBonus;
  }
  limit += lingeringRunnerMuModifier(state);
  return limit;
}

function isCaissaProgram(state: GameState, programId: string): boolean {
  const subs = (state.cards[programId]?.subtypes ?? []).map((s) =>
    s.toLowerCase(),
  );
  return subs.some((s) => s.includes("caissa") || s.includes("caïssa"));
}

export function caissaMuBonusAvailable(state: GameState): number {
  let pool = 0;
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const c = state.cards[id];
    if (c.muBonusOnlyForCaissaPrograms && c.muBonus) {
      pool += c.muBonus;
    }
  }
  return pool;
}
