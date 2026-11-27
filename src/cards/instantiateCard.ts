/** instantiateCard: build a card instance from its definition; it copies every always-present field here, then calls copyOptionalCardFields. */
import type { CardInstance } from "../state/types.js";
import { getCardDef } from "./load.js";
import { copyOptionalCardFields } from "./copyOptionalCardFields.js";

/** Instantiate a card from its data definition. */

export function instantiateCard(
  defId: string,
  instanceId: string,
  zone: CardInstance["zone"],
): CardInstance {
  const def = getCardDef(defId);
  const card: CardInstance = {
    id: instanceId,
    defId: def.id,
    title: def.title,
    type: def.type,
    side: def.side,
    installCost: def.installCost ?? 0,
    rezCost: def.rezCost,
    playCost: def.playCost,
    trashCost: def.trashCost,
    strength: def.strength,
    subtypes: def.subtypes ? [...def.subtypes] : undefined,
    agendaPoints: def.agendaPoints,
    advancementRequirement: def.advancementRequirement,
    advancementRequirementEqualsRunnerGrip:
      def.advancementRequirementEqualsRunnerGrip,
    advancementRequirementReductionPerTag:
      def.advancementRequirementReductionPerTag,
    advancementRequirementReductionPerCoreDamageThisGame:
      def.advancementRequirementReductionPerCoreDamageThisGame,
    advancementRequirementReductionPerBadPublicity:
      def.advancementRequirementReductionPerBadPublicity
        ? { ...def.advancementRequirementReductionPerBadPublicity }
        : undefined,
    advancementRequirementIncreasePerCorpBadPublicity:
      def.advancementRequirementIncreasePerCorpBadPublicity,
    advancementCounters: def.type === "agenda" ? 0 : undefined,
    recurringCreditsMax: def.recurringCreditsMax,
    recurringCreditsMaxEqualsRunnerLink:
      def.recurringCreditsMaxEqualsRunnerLink,
    recurringCreditsMaxEqualsVirusCounters:
      def.recurringCreditsMaxEqualsVirusCounters,
    recurringCreditsMaxEqualsRemoteServers:
      def.recurringCreditsMaxEqualsRemoteServers,
    recurringCreditsMaxEqualsIceProtectingHq:
      def.recurringCreditsMaxEqualsIceProtectingHq,
    startingHandSize: def.startingHandSize,
    playRequiresVirusCounterPlacedOnProgramThisTurn:
      def.playRequiresVirusCounterPlacedOnProgramThisTurn,
    recurringCredits:
      def.recurringCreditsMax !== undefined ||
      def.recurringCreditsMaxEqualsRunnerLink ||
      def.recurringCreditsMaxEqualsVirusCounters ||
      def.recurringCreditsMaxEqualsRemoteServers ||
      def.recurringCreditsMaxEqualsIceProtectingHq
        ? 0
        : undefined,
    hostedCreditsOnInstall: def.hostedCreditsOnInstall,
    hostedCredits: undefined,
    virusCounters: undefined,
    strengthBonusProtectingRemote: def.strengthBonusProtectingRemote,
    strengthBonusProtectingArchives: def.strengthBonusProtectingArchives,
    strengthBonusProtectingRd: def.strengthBonusProtectingRd,
    strengthBonusProtectingHq: def.strengthBonusProtectingHq,
    strengthBonusWhileTagged: def.strengthBonusWhileTagged,
    maxPrintedSubsBreakExceptSubtype: def.maxPrintedSubsBreakExceptSubtype,
    paidAbilityCreditDiscountIfOwnInstalledTrashedThisTurn:
      def.paidAbilityCreditDiscountIfOwnInstalledTrashedThisTurn,
    maxInstalledRunnerTrashesPerEncounter:
      def.maxInstalledRunnerTrashesPerEncounter,
    strengthBonusAtAdvancements: def.strengthBonusAtAdvancements
      ? { ...def.strengthBonusAtAdvancements }
      : undefined,
    maxPrintedSubsBreakablePerEncounterAtAdvancements:
      def.maxPrintedSubsBreakablePerEncounterAtAdvancements
        ? { ...def.maxPrintedSubsBreakablePerEncounterAtAdvancements }
        : undefined,
    handSizeBonus: def.handSizeBonus,
    handSizePerPowerCounter: def.handSizePerPowerCounter,
    runnerHandSizePenaltyPerPowerCounter:
      def.runnerHandSizePenaltyPerPowerCounter,
    runnerHandSizeBonus: def.runnerHandSizeBonus,
    handSizeEqualsCredits: def.handSizeEqualsCredits,
    advancementRequirementReductionPerScoredCopy:
      def.advancementRequirementReductionPerScoredCopy,
    cannotBeBypassed: def.cannotBeBypassed,
    corpPlayCostIncreaseForRunnerEventsOps:
      def.corpPlayCostIncreaseForRunnerEventsOps,
    trashSelfWhenInstalledProgramTrashed:
      def.trashSelfWhenInstalledProgramTrashed,
    powerCountersOnInstallFromUnusedMu: def.powerCountersOnInstallFromUnusedMu,
    recurringSpendForPlayEventSubtypes: def.recurringSpendForPlayEventSubtypes,
    allottedClicksBonus: def.allottedClicksBonus,
    giveStrengthToInstalledIcebreakers: def.giveStrengthToInstalledIcebreakers
      ? { ...def.giveStrengthToInstalledIcebreakers }
      : undefined,
    hostIcebreakerStrengthBonus: def.hostIcebreakerStrengthBonus,
    extendsHostBreakerPumpToRun: def.extendsHostBreakerPumpToRun,
    hostedCardsPlayableAsGrip: def.hostedCardsPlayableAsGrip,
    powerCounterOnDamageOrTrashFromHq: def.powerCounterOnDamageOrTrashFromHq,
    mayInstallAgendasFaceup: def.mayInstallAgendasFaceup,
    rfgOnUninstall: def.rfgOnUninstall,
    memoryCost: def.memoryCost ?? (def.type === "program" ? 1 : undefined),
    memoryCostZeroIfLinkGte: def.memoryCostZeroIfLinkGte,
    muBonus: def.muBonus,
    muBonusOnlyForCaissaPrograms: def.muBonusOnlyForCaissaPrograms,
    triggerCaissaClickAbilityOnCaissaInstall:
      def.triggerCaissaClickAbilityOnCaissaInstall,
    strengthBonusPerIcebreaker: def.strengthBonusPerIcebreaker,
    strengthBonusPerHeapSubtype: def.strengthBonusPerHeapSubtype
      ? { ...def.strengthBonusPerHeapSubtype }
      : undefined,
    installCostDiscountPerInstalledIcebreaker:
      def.installCostDiscountPerInstalledIcebreaker,
    strengthBonusPerCoreDamageThisGame: def.strengthBonusPerCoreDamageThisGame,
    threatStrengthBonus: def.threatStrengthBonus
      ? { ...def.threatStrengthBonus }
      : undefined,
    threatCannotSpendCreditsDuringSubs: def.threatCannotSpendCreditsDuringSubs,
    installCostDiscountIfSuccessfulRunThisTurn:
      def.installCostDiscountIfSuccessfulRunThisTurn,
    installCostDiscountIfSuccessfulHqRunThisTurn:
      def.installCostDiscountIfSuccessfulHqRunThisTurn,
    firstProgramInstallDiscount: def.firstProgramInstallDiscount,
    firstJobConnectionOrHardwareInstallDiscount:
      def.firstJobConnectionOrHardwareInstallDiscount,
    firstProgramOrHardwareInstallDiscount:
      def.firstProgramOrHardwareInstallDiscount,
    iceProtectingThisServerStrengthBonus:
      def.iceProtectingThisServerStrengthBonus,
    trashHostWhenStrengthLte: def.trashHostWhenStrengthLte,
    placeVirusCounterOnInstalledVirusProgram:
      def.placeVirusCounterOnInstalledVirusProgram,
    playRequiresScoredAgendaThisTurn: def.playRequiresScoredAgendaThisTurn,
    amplifyNetDamageOnTrashChosenEncounterType:
      def.amplifyNetDamageOnTrashChosenEncounterType,
    drawOnHostedEmpty: def.drawOnHostedEmpty,
    clicksOnHostedEmpty: def.clicksOnHostedEmpty,
    playRequiresTagged: def.playRequiresTagged,
    playRequiresCreditsLt: def.playRequiresCreditsLt,
    playCostReducedByLink: def.playCostReducedByLink,
    playRequiresRunnerAccessedCardLastTurn:
      def.playRequiresRunnerAccessedCardLastTurn,
    rfgInsteadOfTrashing: def.rfgInsteadOfTrashing,
    playRequiresInstalledResource: def.playRequiresInstalledResource,
    playRequiresInstalledProgram: def.playRequiresInstalledProgram,
    playRequiresInstalledProgramOrHardware:
      def.playRequiresInstalledProgramOrHardware,
    playRequiresUntagged: def.playRequiresUntagged,
    coreDamageOnAgendaScoredFromThisServer:
      def.coreDamageOnAgendaScoredFromThisServer,
    mustRevealWhenAccessedFromRd: def.mustRevealWhenAccessedFromRd,
    skipOnAccessFromArchives: def.skipOnAccessFromArchives,
    playRequiresMinTags: def.playRequiresMinTags,
    faction: typeof def.faction === "string" ? def.faction : undefined,
    blankIdentitiesWhileResolving: def.blankIdentitiesWhileResolving,
    playRequiresRunnerAgendaPointsGte: def.playRequiresRunnerAgendaPointsGte,
    playRequiresSuccessfulRunLastTurn: def.playRequiresSuccessfulRunLastTurn,
    playRequiresUnsuccessfulRunLastTurn:
      def.playRequiresUnsuccessfulRunLastTurn,
    playRequiresRunnerMadeRunLastTurn: def.playRequiresRunnerMadeRunLastTurn,
    playRequiresRunnerInstalledResourceLastTurn:
      def.playRequiresRunnerInstalledResourceLastTurn,
    iceStrengthBonusForSubtype: def.iceStrengthBonusForSubtype
      ? { ...def.iceStrengthBonusForSubtype }
      : undefined,
    playRequiresNoSuccessfulHqRunLastTurn:
      def.playRequiresNoSuccessfulHqRunLastTurn,
    playRequiresAgendaStolenLastTurn: def.playRequiresAgendaStolenLastTurn,
    playRequiresRunnerStoleOrTrashedCorpCardLastTurn:
      def.playRequiresRunnerStoleOrTrashedCorpCardLastTurn,
    playRequiresRunnerTrashedCorpCardLastTurn:
      def.playRequiresRunnerTrashedCorpCardLastTurn,
    playRequiresCorpHasInstalledCard: def.playRequiresCorpHasInstalledCard,
    playRequiresAgendaStolenThisTurn: def.playRequiresAgendaStolenThisTurn,
    playRequiresFirstClick: def.playRequiresFirstClick,
    trashAfterBreakingThisRun: def.trashAfterBreakingThisRun,
    creditsOnScoreOrSteal: def.creditsOnScoreOrSteal,
    creditsPerAccessOnCentralRunEnd: def.creditsPerAccessOnCentralRunEnd,
    onAccessTrashGain: def.onAccessTrashGain
      ? { ...def.onAccessTrashGain }
      : undefined,
    runEvent: def.runEvent ? structuredClone(def.runEvent) : undefined,
    runEventOptional: def.runEventOptional,
    installOnIce: def.installOnIce,
    caissaAdvanceOnSuccessfulRun: def.caissaAdvanceOnSuccessfulRun,
    hostStrengthModifier: def.hostStrengthModifier,
    hostStrengthPerVirusCounter: def.hostStrengthPerVirusCounter,
    hostStrengthPerPowerCounter: def.hostStrengthPerPowerCounter,
    otherIceProtectingServerStrengthModifier:
      def.otherIceProtectingServerStrengthModifier,
    blanksHostAbilities: def.blanksHostAbilities,
    chargeOnFirstBreakDuringHostEncounter:
      def.chargeOnFirstBreakDuringHostEncounter,
    derezHostAtVirus: def.derezHostAtVirus,
    tagsIfAgendaStolenThisRun: def.tagsIfAgendaStolenThisRun,
    gainCreditsOnFirstMarkRunEndIfBreached:
      def.gainCreditsOnFirstMarkRunEndIfBreached,
    gainCreditsOnFirstCompanionInstallOrSpendThisTurn:
      def.gainCreditsOnFirstCompanionInstallOrSpendThisTurn,
    bioroidBreakGivesCorpAllottedClickNextTurn:
      def.bioroidBreakGivesCorpAllottedClickNextTurn,
    bioroidBreakMaxSubs: def.bioroidBreakMaxSubs,
    paidAbilitiesUseStealthCreditsOnly: def.paidAbilitiesUseStealthCreditsOnly,
    onSuccessfulHqRunMayPayForBonusAccess:
      def.onSuccessfulHqRunMayPayForBonusAccess
        ? { ...def.onSuccessfulHqRunMayPayForBonusAccess }
        : undefined,
    onSuccessfulRdRunMayPayForBonusAccess:
      def.onSuccessfulRdRunMayPayForBonusAccess
        ? { ...def.onSuccessfulRdRunMayPayForBonusAccess }
        : undefined,
    meatDamageOnInstalledCorpTrashOncePerTurn:
      def.meatDamageOnInstalledCorpTrashOncePerTurn,
    maySpendPowerCountersForBonusRdAccess:
      def.maySpendPowerCountersForBonusRdAccess
        ? { ...def.maySpendPowerCountersForBonusRdAccess }
        : undefined,
    powerOnScoreIfAgendaNotInstalledOrAdvancedThisTurn:
      def.powerOnScoreIfAgendaNotInstalledOrAdvancedThisTurn,
    agendaPointsToWinReductionPerPowerCounter:
      def.agendaPointsToWinReductionPerPowerCounter,
    agendaPointsToWinModifierBoth: def.agendaPointsToWinModifierBoth,
    creditsOnTrashFromThisServer: def.creditsOnTrashFromThisServer,
    approachServerTax: def.approachServerTax
      ? { ...def.approachServerTax }
      : undefined,
    approachServerEtrUnlessCreditsPerAdvancedIce:
      def.approachServerEtrUnlessCreditsPerAdvancedIce,
    onVirusPurgeOncePerTurn: def.onVirusPurgeOncePerTurn,
    gainClickOnFirstRunEventThisTurn: def.gainClickOnFirstRunEventThisTurn,
    playRequiresOtherGripCardsGte: def.playRequiresOtherGripCardsGte,
    remoteOnly: def.remoteOnly,
    persistent: def.persistent,
    serverRootAssetTrashCostBonus: def.serverRootAssetTrashCostBonus,
    corpCardTrashCostReduction: def.corpCardTrashCostReduction,
    rezOnlyDuringCorpTurn: def.rezOnlyDuringCorpTurn,
    firstRunCannotTargetRemote: def.firstRunCannotTargetRemote,
    iceGainsTrashToResolveChosenSubOnEncounter:
      def.iceGainsTrashToResolveChosenSubOnEncounter,
    firstEncounterSubsBecomeNetDamage: def.firstEncounterSubsBecomeNetDamage,
    trashWhenNoHostedCards: def.trashWhenNoHostedCards,
    hostedCardIds: undefined,
    deckLimit: def.deckLimit,
    offerJackOutAfterSub: def.offerJackOutAfterSub,
    accessTrashFromGrip: def.accessTrashFromGrip
      ? { ...def.accessTrashFromGrip }
      : undefined,
    mayInstallOnScoreOrSteal: def.mayInstallOnScoreOrSteal,
    mayRezIceIgnoringCostsOnScoreOrSteal:
      def.mayRezIceIgnoringCostsOnScoreOrSteal,
    maySwapIceOnAgendaScoredOrStolen: def.maySwapIceOnAgendaScoredOrStolen,
    searchRdNonAgendaOnScoreFromServer: def.searchRdNonAgendaOnScoreFromServer,
    strengthPerAdvancement: def.strengthPerAdvancement,
    strengthPerVirusCounter: def.strengthPerVirusCounter,
    sameServerIceStrengthBonus: def.sameServerIceStrengthBonus,
    rezAsNonIceDuringRunsOnServer: def.rezAsNonIceDuringRunsOnServer,
    strengthBonusIfNoInstalledSubtype: def.strengthBonusIfNoInstalledSubtype
      ? { ...def.strengthBonusIfNoInstalledSubtype }
      : undefined,
    strengthCannotBeLowered: def.strengthCannotBeLowered,
    runnerEncounterIceStrengthModifier: def.runnerEncounterIceStrengthModifier,
    firstIceRezCostIncrease: def.firstIceRezCostIncrease,
    iceRezCostIncrease: def.iceRezCostIncrease,
    iceRezCostIncreaseBySubtype: def.iceRezCostIncreaseBySubtype
      ? { ...def.iceRezCostIncreaseBySubtype }
      : undefined,
    iceRezCostIncreaseProtectingHostedServer:
      def.iceRezCostIncreaseProtectingHostedServer,
    strengthBonusPerRezzedIceWithSubtype:
      def.strengthBonusPerRezzedIceWithSubtype
        ? { ...def.strengthBonusPerRezzedIceWithSubtype }
        : undefined,
    iceRezCostReductionProtectingThisServer:
      def.iceRezCostReductionProtectingThisServer,
    iceRezCostReductionPerAgendaCounter:
      def.iceRezCostReductionPerAgendaCounter,
    installedCardsTrashCostBonus: def.installedCardsTrashCostBonus,
    mayImmediatelyRezIceOnInstallProtectingThisServerDiscount:
      def.mayImmediatelyRezIceOnInstallProtectingThisServerDiscount,
    strengthBonusOnBreakSubForRun: def.strengthBonusOnBreakSubForRun,
    onBreakSubroutineMayPayCreditsBreakAnother:
      def.onBreakSubroutineMayPayCreditsBreakAnother
        ? { ...def.onBreakSubroutineMayPayCreditsBreakAnother }
        : undefined,
    rootRezCostReductionThisServerIfThreat:
      def.rootRezCostReductionThisServerIfThreat
        ? { ...def.rootRezCostReductionThisServerIfThreat }
        : undefined,
    rezCostDiscountPerRezzedSubtype: def.rezCostDiscountPerRezzedSubtype
      ? { ...def.rezCostDiscountPerRezzedSubtype }
      : undefined,
    rezCostDiscountPerOtherUnrezzedIce: def.rezCostDiscountPerOtherUnrezzedIce,
    eventPlayCostDiscount: def.eventPlayCostDiscount,
    gainCreditOnFirstRunEvent: def.gainCreditOnFirstRunEvent,
    netDamageOnAgendaScoredOrStolen: def.netDamageOnAgendaScoredOrStolen,
    drawOnFirstRemoteCreated: def.drawOnFirstRemoteCreated,
    gainCreditOnTransactionPlayed: def.gainCreditOnTransactionPlayed,
    firstEncounterGainsCodeGate: def.firstEncounterGainsCodeGate,
    forbidScoreAgendaInstalledThisTurn: def.forbidScoreAgendaInstalledThisTurn,
    cannotScoreIfInstalledThisTurn: def.cannotScoreIfInstalledThisTurn,
    unique: def.unique,
    hostsUniqueCompanionOrConnectionResources:
      def.hostsUniqueCompanionOrConnectionResources
        ? { ...def.hostsUniqueCompanionOrConnectionResources }
        : undefined,
    handSizeBonusIfHostingCompanionAndConnection:
      def.handSizeBonusIfHostingCompanionAndConnection,
    flipIdentityOnSuccessfulCentralRun: def.flipIdentityOnSuccessfulCentralRun,
    trashOnVirusPurge: def.trashOnVirusPurge,
    maxHostedCards: def.maxHostedCards,
    accessHostNonAgendaFaceup: def.accessHostNonAgendaFaceup
      ? { ...def.accessHostNonAgendaFaceup }
      : undefined,
    onWouldAccessArchivesHostInstead: def.onWouldAccessArchivesHostInstead
      ? { ...def.onWouldAccessArchivesHostInstead }
      : undefined,
    powerCountersOnInstall: def.powerCountersOnInstall,
    powerCountersOnRez: def.powerCountersOnRez,
    trashWhenPowerEmpty: def.trashWhenPowerEmpty,
    lingerAsCurrent: def.lingerAsCurrent,
    currentTrashOnAgendaStolen: def.currentTrashOnAgendaStolen,
    currentTrashOnAgendaScored: def.currentTrashOnAgendaScored,
    runnerFirstRunEachTurnAdditionalCost:
      def.runnerFirstRunEachTurnAdditionalCost,
    blankRunnerIdentityPrintedAbilities:
      def.blankRunnerIdentityPrintedAbilities,
    limitOnePerServer: def.limitOnePerServer,
    runnerLosesAllCreditsOnClickLossDuringRunOnThisServer:
      def.runnerLosesAllCreditsOnClickLossDuringRunOnThisServer,
    whileScoredIceSubtypeStrengthBonus: def.whileScoredIceSubtypeStrengthBonus,
    ignoreInstallCostFirstIceEachTurn: def.ignoreInstallCostFirstIceEachTurn,
    firstEncounteredIceStrengthPenaltyThisRun:
      def.firstEncounteredIceStrengthPenaltyThisRun,
    corpMaxIceInstallsPerTurn: def.corpMaxIceInstallsPerTurn,
    strengthPerCorpCardInHq: def.strengthPerCorpCardInHq,
    rezCostIncreasePerCorpCardInHq: def.rezCostIncreasePerCorpCardInHq,
    jackOutOnThisServerTrashRunnerProgram:
      def.jackOutOnThisServerTrashRunnerProgram,
    runnerCannotPlayCurrentEvents: def.runnerCannotPlayCurrentEvents,
    morphOddAdvancementSubtypeSwap: def.morphOddAdvancementSubtypeSwap,
    supplierHost: def.supplierHost,
    onFirstRunnerCreditPoolEmptyThisTurn:
      def.onFirstRunnerCreditPoolEmptyThisTurn
        ? structuredClone(def.onFirstRunnerCreditPoolEmptyThisTurn)
        : undefined,
    onGripArchivesSuccessInstallSelfIgnoringCosts:
      def.onGripArchivesSuccessInstallSelfIgnoringCosts,
    trashSelfWhenRunnerTagged: def.trashSelfWhenRunnerTagged,
    netDamageWheneverRunnerTrashesCorpCard:
      def.netDamageWheneverRunnerTrashesCorpCard,
    memoryLimitEqualsGripSize: def.memoryLimitEqualsGripSize,
    onGripHqSuccessInstallSelfIgnoringCosts:
      def.onGripHqSuccessInstallSelfIgnoringCosts,
    trashCostIncreasePerFacedownArchivesCard:
      def.trashCostIncreasePerFacedownArchivesCard,
    gainCreditsOnCreateServer: def.gainCreditsOnCreateServer,
    whileScoredStealAdditionalCreditsPerAdvancement:
      def.whileScoredStealAdditionalCreditsPerAdvancement,
    gainCreditsWhenCorpLosesCredits: def.gainCreditsWhenCorpLosesCredits,
    drawWhenCorpRezzesIce: def.drawWhenCorpRezzesIce,
    strengthBonusPerUnusedMu: def.strengthBonusPerUnusedMu,
    briberyPlayCostX: def.briberyPlayCostX,
    gainCreditsOnJackOut: def.gainCreditsOnJackOut,
    additionalCreditsToAccessRemoteRoot:
      def.additionalCreditsToAccessRemoteRoot,
    rezCostReductionPerAdvancement: def.rezCostReductionPerAdvancement,
    gainCreditsOnSpendAgendaCounter: def.gainCreditsOnSpendAgendaCounter,
    badPublicityOnRez: def.badPublicityOnRez,
    firstRunnerInstallTrashFromGripEachTurn:
      def.firstRunnerInstallTrashFromGripEachTurn,
    iceProtectingThisServerAdditionalAdvancementCounters:
      def.iceProtectingThisServerAdditionalAdvancementCounters,
    firstAccessedOperationTrashFreeEachTurn:
      def.firstAccessedOperationTrashFreeEachTurn,
    corpStartsWithBadPublicity: def.corpStartsWithBadPublicity,
    corpHandSizeBonusPerBadPublicity: def.corpHandSizeBonusPerBadPublicity,
    installRequiresCorpBadPublicityGte: def.installRequiresCorpBadPublicityGte,
    placeVirusCounterWhenInstalledCorpCardTrashed:
      def.placeVirusCounterWhenInstalledCorpCardTrashed,
    hivemindSharesVirusCounters: def.hivemindSharesVirusCounters,
    onFirstInstallEachTurn: def.onFirstInstallEachTurn
      ? structuredClone(def.onFirstInstallEachTurn)
      : undefined,
    onFirstClickLossEachTurnExceptPaidAbility:
      def.onFirstClickLossEachTurnExceptPaidAbility
        ? structuredClone(def.onFirstClickLossEachTurnExceptPaidAbility)
        : undefined,
    geneticsAlsoTriggerSecondTime: def.geneticsAlsoTriggerSecondTime,
    onFirstDamageEachTurn: def.onFirstDamageEachTurn
      ? structuredClone(def.onFirstDamageEachTurn)
      : undefined,
    agendaAdvancementRequirementBonusPerCopyInCorpScore:
      def.agendaAdvancementRequirementBonusPerCopyInCorpScore,
    onFirstBasicClickDrawEachTurn: def.onFirstBasicClickDrawEachTurn
      ? structuredClone(def.onFirstBasicClickDrawEachTurn)
      : undefined,
    bioroidIceRezCostReductionPerRunnerClickRemaining:
      def.bioroidIceRezCostReductionPerRunnerClickRemaining,
    chooseIdentityFaceBeforeFirstTurn: def.chooseIdentityFaceBeforeFirstTurn,
    identityFaceOptions: def.identityFaceOptions
      ? structuredClone(def.identityFaceOptions)
      : undefined,
    identityFaces: def.identityFaces
      ? structuredClone(def.identityFaces)
      : undefined,
    onFullyBreakProtectingIce: def.onFullyBreakProtectingIce
      ? structuredClone(def.onFullyBreakProtectingIce)
      : undefined,
    rezNonIceAdditionalCostRandomTrashHq:
      def.rezNonIceAdditionalCostRandomTrashHq,
    hostsConnectionResources: def.hostsConnectionResources,
    drawOnHostConnectionInstall: def.drawOnHostConnectionInstall,
    onFirstEventEachTurnMayPlayAnother: def.onFirstEventEachTurnMayPlayAnother,
    trashHostedProgramsOnTurnEnd: def.trashHostedProgramsOnTurnEnd,
    playCostX: def.playCostX,
    cardsCannotLeaveRunnerHeap: def.cardsCannotLeaveRunnerHeap,
    eventPlayExtraCostIfCopyInHeap: def.eventPlayExtraCostIfCopyInHeap,
    rootRezCostReductionThisServer: def.rootRezCostReductionThisServer,
    rootTrashCostIncreaseThisServer: def.rootTrashCostIncreaseThisServer,
    preventCyberneticInstallDamage: def.preventCyberneticInstallDamage,
    runnerChoosesDamageTrashFromGrip: def.runnerChoosesDamageTrashFromGrip,
    drawOnUseTrashAbility: def.drawOnUseTrashAbility,
    iceCannotBeBypassedThisServer: def.iceCannotBeBypassedThisServer,
    cardsCannotBeExposedThisServer: def.cardsCannotBeExposedThisServer,
    trashTopOfStackOnAdvance: def.trashTopOfStackOnAdvance
      ? { ...def.trashTopOfStackOnAdvance }
      : undefined,
    increaseFirstCoreDamagePerTurn: def.increaseFirstCoreDamagePerTurn,
    hostAgendaCapacity: def.hostAgendaCapacity,
    mayHostAccessedAgenda: def.mayHostAccessedAgenda,
    countsAsTagged: def.countsAsTagged,
    preventAllMeatDamage: def.preventAllMeatDamage,
    runnerLosesClickWhenTrashesCorpCard:
      def.runnerLosesClickWhenTrashesCorpCard,
    cannotStealMoreThanOneAgendaPerTurn:
      def.cannotStealMoreThanOneAgendaPerTurn,
    cannotStealUnlessCopyInRunnerScore: def.cannotStealUnlessCopyInRunnerScore,
    placeAdvancementOnAnotherOnAdvance: def.placeAdvancementOnAnotherOnAdvance
      ? { ...def.placeAdvancementOnAnotherOnAdvance }
      : undefined,
    basicTrashResourceAdditionalCostCredits:
      def.basicTrashResourceAdditionalCostCredits,
    corpChoosesFirstNetDamageCardEachTurn:
      def.corpChoosesFirstNetDamageCardEachTurn,
    netDamageOnJackOut: def.netDamageOnJackOut,
    runnerCannotDrawMoreThanPerTurn: def.runnerCannotDrawMoreThanPerTurn,
    mustRevealAgendasAccessedFromRd: def.mustRevealAgendasAccessedFromRd,
    addSelfToCorpScoreOnAgendaAccess: def.addSelfToCorpScoreOnAgendaAccess
      ? { ...def.addSelfToCorpScoreOnAgendaAccess }
      : undefined,
    hostAssetsOnly: def.hostAssetsOnly,
    basicRemoveTagAdditionalCostCreditsWhileUnflipped:
      def.basicRemoveTagAdditionalCostCreditsWhileUnflipped,
    basicTrashResourceCreditReductionWhileFlipped:
      def.basicTrashResourceCreditReductionWhileFlipped,
    subroutineTraceBaseStrengthBonus: def.subroutineTraceBaseStrengthBonus,
    assetsGainSubtype: def.assetsGainSubtype,
    addToCorpScoreOnAccessIfRunnerTagged:
      def.addToCorpScoreOnAccessIfRunnerTagged,
    runnerAllottedClicksBonus: def.runnerAllottedClicksBonus,
    gainsEtrSubroutineWhileCurrentActive:
      def.gainsEtrSubroutineWhileCurrentActive,
    strengthBonusPerRunnerTag: def.strengthBonusPerRunnerTag,
    playAdditionalCostForfeitAgenda: def.playAdditionalCostForfeitAgenda,
    runnerSpendsFirstForTracesDuringRun:
      def.runnerSpendsFirstForTracesDuringRun,
    traceBaseStrengthBonusDuringRunOnThisServer:
      def.traceBaseStrengthBonusDuringRunOnThisServer,
    cannotInstallNonVirtualResources: def.cannotInstallNonVirtualResources,
    turnFacedownInsteadOfHeapWhenTrashed:
      def.turnFacedownInsteadOfHeapWhenTrashed,
    gainCreditsOnFirstOwnInstalledTrashEachTurn:
      def.gainCreditsOnFirstOwnInstalledTrashEachTurn,
    startWithDirectiveCards: def.startWithDirectiveCards,
    muEqualsAgendaPoints: def.muEqualsAgendaPoints,
    handSizeEqualsAgendaPoints: def.handSizeEqualsAgendaPoints,
    firstClickMustBeRunOrRunEvent: def.firstClickMustBeRunOrRunEvent,
    mustTrashFirstAccessedCardWithTrashCostEachTurn:
      def.mustTrashFirstAccessedCardWithTrashCostEachTurn,
    drawAtTurnEndIfGripBelowMaxHandSize:
      def.drawAtTurnEndIfGripBelowMaxHandSize,
    installRequiresLinkGte: def.installRequiresLinkGte,
    installCostReductionPerLink: def.installCostReductionPerLink,
    blankCorpIdentityPrintedAbilities: def.blankCorpIdentityPrintedAbilities,
    hostedCreditsOnProgramOrHardwareInstall:
      def.hostedCreditsOnProgramOrHardwareInstall,
    runnerChoosesUnbrokenSubroutineOrder:
      def.runnerChoosesUnbrokenSubroutineOrder,
    breakOnAtMostOneIcePerRun: def.breakOnAtMostOneIcePerRun,
    onFinishAccessRdOncePerTurn: def.onFinishAccessRdOncePerTurn
      ? structuredClone(def.onFinishAccessRdOncePerTurn)
      : undefined,
    onEncounterAnyIceOncePerTurn: def.onEncounterAnyIceOncePerTurn
      ? structuredClone(def.onEncounterAnyIceOncePerTurn)
      : undefined,
    zeroInfluenceIfNonAllianceFactionCardsGte:
      def.zeroInfluenceIfNonAllianceFactionCardsGte
        ? { ...def.zeroInfluenceIfNonAllianceFactionCardsGte }
        : undefined,
    onPassIceProtectingThisServerMaySwap:
      def.onPassIceProtectingThisServerMaySwap,
    zeroInfluenceIfIceInDeckLte: def.zeroInfluenceIfIceInDeckLte,
    zeroInfluenceIfCardsInDeckGte: def.zeroInfluenceIfCardsInDeckGte,
    chooseServerOnInstall: def.chooseServerOnInstall,
    additionalCreditCostToInstallInChosenServer:
      def.additionalCreditCostToInstallInChosenServer,
    gainCreditOnTrashAbilityUse: def.gainCreditOnTrashAbilityUse,
    daemonHostMaxMuFromInstalledCopiesOfSelf:
      def.daemonHostMaxMuFromInstalledCopiesOfSelf,
    hostedProgramMemoryDoesNotCount: def.hostedProgramMemoryDoesNotCount,
    corpAdditionalBadPublicity: def.corpAdditionalBadPublicity,
    corpAdditionalBadPublicityCannotBeRemoved:
      def.corpAdditionalBadPublicityCannotBeRemoved,
    playRequiresInstalledSubtype: def.playRequiresInstalledSubtype,
    placePowerCounterOnAnyCardRez: def.placePowerCounterOnAnyCardRez,
    gainCreditOnFirstRunnerDrawEachTurn:
      def.gainCreditOnFirstRunnerDrawEachTurn,
    onAdvance: def.onAdvance ? structuredClone(def.onAdvance) : undefined,
    zeroInfluenceIfCardCopiesGte: def.zeroInfluenceIfCardCopiesGte
      ? { ...def.zeroInfluenceIfCardCopiesGte }
      : undefined,
    mayJackOutOnEncounterSentryOncePerTurn:
      def.mayJackOutOnEncounterSentryOncePerTurn,
    revealRandomHqOnJackOut: def.revealRandomHqOnJackOut,
    installRequiresSuccessfulHqRunThisTurn:
      def.installRequiresSuccessfulHqRunThisTurn,
    corpAllottedClicksBonusWhileInstalled:
      def.corpAllottedClicksBonusWhileInstalled,
    onCorpRezAssetOrUpgradeMayPayRezCostTrashSelfDerez:
      def.onCorpRezAssetOrUpgradeMayPayRezCostTrashSelfDerez,
    onDrawAgendaMayRevealAndInstall: def.onDrawAgendaMayRevealAndInstall,
    gainCreditWheneverRunnerBreaksSubroutine:
      def.gainCreditWheneverRunnerBreaksSubroutine,
    onRezOtherCardInRootOrProtectingMayRezDiscount:
      def.onRezOtherCardInRootOrProtectingMayRezDiscount,
    hostAgendaPointsModifier: def.hostAgendaPointsModifier,
    accessPayTrashCostRemoveFromGameOncePerTurn:
      def.accessPayTrashCostRemoveFromGameOncePerTurn,
    addInstalledNonVirusProgramToStackTopOnEncounterEndIfBroke:
      def.addInstalledNonVirusProgramToStackTopOnEncounterEndIfBroke,
    patronChooseServerDrawInsteadOfBreach:
      def.patronChooseServerDrawInsteadOfBreach,
    onInstallHardwareFromGripMayInstallAnotherCopy:
      def.onInstallHardwareFromGripMayInstallAnotherCopy,
    onRunnerSearchStackOrInstallFromHeapTrashRandomFromGrip:
      def.onRunnerSearchStackOrInstallFromHeapTrashRandomFromGrip,
    gainClickFirstTimeSpendClicksGteOnSameActionEachTurn:
      def.gainClickFirstTimeSpendClicksGteOnSameActionEachTurn,
    onDrawMayLoseClickRevealSwapArchivesSameTypeOncePerTurn:
      def.onDrawMayLoseClickRevealSwapArchivesSameTypeOncePerTurn,
    onAnySuccessfulTraceGainAndRunnerLose:
      def.onAnySuccessfulTraceGainAndRunnerLose
        ? { ...def.onAnySuccessfulTraceGainAndRunnerLose }
        : undefined,
    onRezOrPlayOutOfFactionGainCredits: def.onRezOrPlayOutOfFactionGainCredits,
    zeroInfluenceIfAssetsInDeckGte: def.zeroInfluenceIfAssetsInDeckGte,
    mustTrashWhenAccessedWhileInstalled:
      def.mustTrashWhenAccessedWhileInstalled,
    heapOnTurnBeginMayRfgSelfToMakeRun: def.heapOnTurnBeginMayRfgSelfToMakeRun,
    autoPreventNetOrMeatDamagePayOrTrash:
      def.autoPreventNetOrMeatDamagePayOrTrash,
    placePowerOnHqOrRdRunEndIfNoAgendaStolen:
      def.placePowerOnHqOrRdRunEndIfNoAgendaStolen,
    firstSuccessfulHqRunEachTurnPsiCorpChoosesAccess:
      def.firstSuccessfulHqRunEachTurnPsiCorpChoosesAccess,
    onSuccessfulRunMayPlaceAdvancementOnCanBeAdvanced:
      def.onSuccessfulRunMayPlaceAdvancementOnCanBeAdvanced,
    corpCannotWinExceptFlatline: def.corpCannotWinExceptFlatline,
    playRequiresAgendaInRunnerScoreArea:
      def.playRequiresAgendaInRunnerScoreArea,
    revealGripWhileRunnerTagged: def.revealGripWhileRunnerTagged,
    hostAssetsOrAgendas: def.hostAssetsOrAgendas,
    trashCostIncreasePerHostedCard: def.trashCostIncreasePerHostedCard,
    rezRequiresTagged: def.rezRequiresTagged,
    blockRunnerPaidAbilitiesExceptIcebreakersAndMidAccess:
      def.blockRunnerPaidAbilitiesExceptIcebreakersAndMidAccess,
    corpLosesCreditsOnNonFirstDrawThisTurn:
      def.corpLosesCreditsOnNonFirstDrawThisTurn,
    mayExposeApproachedIceThenMayTrashSelfToJackOut:
      def.mayExposeApproachedIceThenMayTrashSelfToJackOut,
    additionalIceRezCostEqualToSubroutineCountWhenCorpCreditsGte:
      def.additionalIceRezCostEqualToSubroutineCountWhenCorpCreditsGte,
    onSuccessfulRdRunMayReplaceSpentRecurringCredit:
      def.onSuccessfulRdRunMayReplaceSpentRecurringCredit,
    firstRevealSecretlySpentCreditsGainThatManyEachTurn:
      def.firstRevealSecretlySpentCreditsGainThatManyEachTurn,
    onUnsuccessfulRunOnThisServer: def.onUnsuccessfulRunOnThisServer
      ? structuredClone(def.onUnsuccessfulRunOnThisServer)
      : undefined,
    firstIceRezCostReductionPerRunnerTag:
      def.firstIceRezCostReductionPerRunnerTag,
    onTurnBeginIfRunnerTagged: def.onTurnBeginIfRunnerTagged
      ? structuredClone(def.onTurnBeginIfRunnerTagged)
      : undefined,
    iceStrengthBonusPerFiveCorpCreditsWhenCorpCreditsGte:
      def.iceStrengthBonusPerFiveCorpCreditsWhenCorpCreditsGte
        ? { ...def.iceStrengthBonusPerFiveCorpCreditsWhenCorpCreditsGte }
        : undefined,
    blankUniqueNonRegionAssetUpgradePrintedAbilities:
      def.blankUniqueNonRegionAssetUpgradePrintedAbilities,
    mayInstallSelfFromHeapOnEncounterBarrier:
      def.mayInstallSelfFromHeapOnEncounterBarrier,
    onFirstPassIceEachTurn: def.onFirstPassIceEachTurn
      ? structuredClone(def.onFirstPassIceEachTurn)
      : undefined,
    playRequiresRunnerCreditsGte: def.playRequiresRunnerCreditsGte,
    firstAdvancedIceEncounterEndMeatDamageEachTurn:
      def.firstAdvancedIceEncounterEndMeatDamageEachTurn,
    handSizeBonusPerTag: def.handSizeBonusPerTag,
    drawPerAccessOnFirstSuccessfulHqOrRdRunEndEachTurn:
      def.drawPerAccessOnFirstSuccessfulHqOrRdRunEndEachTurn,
    mayInstallSelfFromHeapOnEncounterCodeGate:
      def.mayInstallSelfFromHeapOnEncounterCodeGate,
    firstStealthSpendEachRunPlaceCreditOrDraw:
      def.firstStealthSpendEachRunPlaceCreditOrDraw,
    spendHostedCreditsForAnything: def.spendHostedCreditsForAnything,
    revealDrawnCards: def.revealDrawnCards,
    playRequiresRunnerCreditsLt: def.playRequiresRunnerCreditsLt,
    trashTopOfStackOnRunnerNetDamage: def.trashTopOfStackOnRunnerNetDamage,
    resourceInstallCostIncrease: def.resourceInstallCostIncrease,
    bonusAccessOnHqBreachPerFullyBrokenProtectingIce:
      def.bonusAccessOnHqBreachPerFullyBrokenProtectingIce,
    mayInsteadOfBreachRdAccessOneOfTopN:
      def.mayInsteadOfBreachRdAccessOneOfTopN,
    secretSpendCannotEqual: def.secretSpendCannotEqual,
    meatDamageWhenSecretSpendAmountsDiffer:
      def.meatDamageWhenSecretSpendAmountsDiffer,
    onRunDeclaredOnThisServerIfTagged: def.onRunDeclaredOnThisServerIfTagged
      ? structuredClone(def.onRunDeclaredOnThisServerIfTagged)
      : undefined,
    placePowerPerUnbrokenSubOnAnyEncounterEnd:
      def.placePowerPerUnbrokenSubOnAnyEncounterEnd,
    mayInstallSelfFromHeapOnEncounterSentry:
      def.mayInstallSelfFromHeapOnEncounterSentry,
    drawOnFirstTrashInstalledEachTurn: def.drawOnFirstTrashInstalledEachTurn,
    cannotRezNonIceDuringRunnerTurn: def.cannotRezNonIceDuringRunnerTurn,
    gainsPaidAbilitiesOfHostedIcebreakers:
      def.gainsPaidAbilitiesOfHostedIcebreakers,
    additionalClickNextTurnOnSuccessfulRunEndIfRunnerLt6cOrNoClicks:
      def.additionalClickNextTurnOnSuccessfulRunEndIfRunnerLt6cOrNoClicks,
    mayMoveAnyAdvancementsFromSelfToRezzedIce:
      def.mayMoveAnyAdvancementsFromSelfToRezzedIce,
    sifrMayZeroEncounterIceStrengthOncePerTurn:
      def.sifrMayZeroEncounterIceStrengthOncePerTurn,
    playRequiresCorpScoredNoAgendasLastTurn:
      def.playRequiresCorpScoredNoAgendasLastTurn,
    trashTopOfStackOnBreakSubIfRunnerHasAi:
      def.trashTopOfStackOnBreakSubIfRunnerHasAi,
    firstTraceEachTurnRunnerLinkTreatedAs0:
      def.firstTraceEachTurnRunnerLinkTreatedAs0,
    gainCreditsWhenRunnerSpendsForLinkPer2Spent:
      def.gainCreditsWhenRunnerSpendsForLinkPer2Spent,
    bryanStinsonPlayArchivesTransactionWhileRunnerLt6c:
      def.bryanStinsonPlayArchivesTransactionWhileRunnerLt6c,
    nasxMaySpendUpTo2OnAbilityCreditGainToPlacePower:
      def.nasxMaySpendUpTo2OnAbilityCreditGainToPlacePower,
    mawFirstAccessNotArchivesNoStealOrTrashForceCorpTrashHq:
      def.mawFirstAccessNotArchivesNoStealOrTrashForceCorpTrashHq,
    archivistOnCorpScoresInitiativeOrSecurityTrace:
      def.archivistOnCorpScoresInitiativeOrSecurityTrace,
    iceNotInnermostInstallCostIncrease: def.iceNotInnermostInstallCostIncrease,
    synthDnaFirstApSubBrokenEachTurnNetDamage:
      def.synthDnaFirstApSubBrokenEachTurnNetDamage,
    netAnalyticsMayDrawWhenRunnerAvoidsOrRemovesTags:
      def.netAnalyticsMayDrawWhenRunnerAvoidsOrRemovesTags,
    jemisonOnForfeitPlaceAdvancementsEqualAgendaPointsPlus1:
      def.jemisonOnForfeitPlaceAdvancementsEqualAgendaPointsPlus1,
    oberthFirstAdvanceThisServerAdditionalAdvancement:
      def.oberthFirstAdvanceThisServerAdditionalAdvancement,
    placePowerCounterOnSufferAnyDamage: def.placePowerCounterOnSufferAnyDamage,
    strengthBonusPerIceProtectingThisServer:
      def.strengthBonusPerIceProtectingThisServer,
    systemSeizureFirstPumpStrengthLastsRemainderOfRun:
      def.systemSeizureFirstPumpStrengthLastsRemainderOfRun,
    corpGainsOnFirstRunnerBasicGainCreditEachTurn:
      def.corpGainsOnFirstRunnerBasicGainCreditEachTurn,
    additionalTagsWhileHosted: def.additionalTagsWhileHosted,
    mcaInformantCondition: def.mcaInformantCondition,
    mcaInformantHosted: def.mcaInformantHosted,
    daemonHostInstallCreditDiscount: def.daemonHostInstallCreditDiscount,
    basicDrawBonus: def.basicDrawBonus,
    additionalCardsOnFirstBasicDrawEachTurn:
      def.additionalCardsOnFirstBasicDrawEachTurn,
    gainCreditOnCorpTurnEndIfArchivesHasFacedown:
      def.gainCreditOnCorpTurnEndIfArchivesHasFacedown,
    polyhistorPassAllHqIceMayDrawForceCorpDraw:
      def.polyhistorPassAllHqIceMayDrawForceCorpDraw,
    maxwellJamesRequireAfterSuccessfulHqRunPaidWindow:
      def.maxwellJamesRequireAfterSuccessfulHqRunPaidWindow,
    placePowerCounterOnInstallCardInRemoteRoot:
      def.placePowerCounterOnInstallCardInRemoteRoot,
    onSuccessfulRunThisServer: def.onSuccessfulRunThisServer
      ? structuredClone(def.onSuccessfulRunThisServer)
      : undefined,
    skorpiosRfgOneTrashedRunnerCardOncePerTurn:
      def.skorpiosRfgOneTrashedRunnerCardOncePerTurn,
    onTrashWhileRezzedTakeBadPublicity: def.onTrashWhileRezzedTakeBadPublicity,
    meatDamageWhenRunnerTakesTags: def.meatDamageWhenRunnerTakesTags,
    playOnlyIfRunnerStoleAgendaLastTurn:
      def.playOnlyIfRunnerStoleAgendaLastTurn,
    longTermInvestmentGainAbilityAtHostedCredits:
      def.longTermInvestmentGainAbilityAtHostedCredits,
    strengthBonusPerSubroutineOnEncounteredBarrier:
      def.strengthBonusPerSubroutineOnEncounteredBarrier,
    aeneasInformantRevealGainOnAccessWithoutTrash:
      def.aeneasInformantRevealGainOnAccessWithoutTrash,
    hostGainsAiSubtype: def.hostGainsAiSubtype,
    hostGainsLoseClickBreakAnySubroutine:
      def.hostGainsLoseClickBreakAnySubroutine,
    hostGainsPumpAbility: def.hostGainsPumpAbility
      ? { ...def.hostGainsPumpAbility }
      : undefined,
    inversificatorSwapIceAfterFullyBrokeOncePerTurn:
      def.inversificatorSwapIceAfterFullyBrokeOncePerTurn,
    trashSelfAndMeatDamageWhenCreditsZero:
      def.trashSelfAndMeatDamageWhenCreditsZero,
    bioroidWorkCrewRequireAfterOperationPaidWindow:
      def.bioroidWorkCrewRequireAfterOperationPaidWindow,
    mayTakeTagToBypassOnEncounter: def.mayTakeTagToBypassOnEncounter,
    gainCreditsOnBreakSubThisServerIfTagged:
      def.gainCreditsOnBreakSubThisServerIfTagged,
    playRequiresOtherCardsInHq: def.playRequiresOtherCardsInHq,
    trashSelfWhenNoPowerCounters: def.trashSelfWhenNoPowerCounters,
    corpCannotTrashWhileOtherResourceInstalled:
      def.corpCannotTrashWhileOtherResourceInstalled,
    installCostX: def.installCostX,
    powerCountersOnInstallEqualPaidX: def.powerCountersOnInstallEqualPaidX,
    onTurnEndIfGripEmptyDrawPerPowerThenTrash:
      def.onTurnEndIfGripEmptyDrawPerPowerThenTrash,
    gainCreditsOnFirstDerezIceEachTurn: def.gainCreditsOnFirstDerezIceEachTurn,
    drawOnFirstRunEachTurnIfServerIceGte:
      def.drawOnFirstRunEachTurnIfServerIceGte
        ? { ...def.drawOnFirstRunEachTurnIfServerIceGte }
        : undefined,
    fullyBreakNextEncounterFirstNSubsDoNotResolve:
      def.fullyBreakNextEncounterFirstNSubsDoNotResolve,
    onRunnerTrashFromThisServerRootOrProtecting:
      def.onRunnerTrashFromThisServerRootOrProtecting
        ? structuredClone(def.onRunnerTrashFromThisServerRootOrProtecting)
        : undefined,
    onEncounterEndIfPrintedSubroutineBroken:
      def.onEncounterEndIfPrintedSubroutineBroken
        ? structuredClone(def.onEncounterEndIfPrintedSubroutineBroken)
        : undefined,
    playRequiresNoSuccessfulRunLastTurn:
      def.playRequiresNoSuccessfulRunLastTurn,
    onRezIceProtectingThisServer: def.onRezIceProtectingThisServer
      ? structuredClone(def.onRezIceProtectingThisServer)
      : undefined,
    ripDealHeapInsteadOfHqAccess: def.ripDealHeapInsteadOfHqAccess,
    rfgSelfOnRunEnd: def.rfgSelfOnRunEnd,
    strengthBonusPerInstalledProgram: def.strengthBonusPerInstalledProgram,
    strengthBonusPerIceProtectingAttackedServerDuringRun:
      def.strengthBonusPerIceProtectingAttackedServerDuringRun,
    nonVirtualResourceInstallCostIncrease:
      def.nonVirtualResourceInstallCostIncrease,
    cannotHostCards: def.cannotHostCards,
    afterMandatoryDraw: def.afterMandatoryDraw
      ? structuredClone(def.afterMandatoryDraw)
      : undefined,
    hostAgendaGainsPublic: def.hostAgendaGainsPublic,
    playRequiresSuccessfulCentralRunThisTurn:
      def.playRequiresSuccessfulCentralRunThisTurn,
    onFirstEmptyGripEachTurn: def.onFirstEmptyGripEachTurn
      ? structuredClone(def.onFirstEmptyGripEachTurn)
      : undefined,
    placeVirusCounterOnExposeAnyCard: def.placeVirusCounterOnExposeAnyCard,
    placeVirusCounterOnFinishBreachIfNoStealOrTrash:
      def.placeVirusCounterOnFinishBreachIfNoStealOrTrash,
    revealCorpBasicActionDraws: def.revealCorpBasicActionDraws,
    operationAndEventPlayCostIncrease: def.operationAndEventPlayCostIncrease,
    corpGainsCreditsOnFirstRunnerEventEachTurn:
      def.corpGainsCreditsOnFirstRunnerEventEachTurn,
    trashTopOfStackWhenAllSubsBrokenOnProtectingIce:
      def.trashTopOfStackWhenAllSubsBrokenOnProtectingIce,
    strengthBonusIfInstalledSubtype: def.strengthBonusIfInstalledSubtype
      ? { ...def.strengthBonusIfInstalledSubtype }
      : undefined,
    mayGainCreditsOnCorpCardExposed: def.mayGainCreditsOnCorpCardExposed,
    memoryCostPerPowerCounter: def.memoryCostPerPowerCounter,
    corpHandSizeBonusWhileInstalled: def.corpHandSizeBonusWhileInstalled,
    gainCreditsOnFirstFullyBreakEachTurn:
      def.gainCreditsOnFirstFullyBreakEachTurn,
    placeAdvancementOnSufferMeatDamage: def.placeAdvancementOnSufferMeatDamage,
    playRequiresRunnerHasInstalledHardwareOrNonVirtualResource:
      def.playRequiresRunnerHasInstalledHardwareOrNonVirtualResource,
    playRequiresRunnerHasInstalledCard: def.playRequiresRunnerHasInstalledCard,
    onTurnBeginFromRunnerScoreOnCorpTurn:
      def.onTurnBeginFromRunnerScoreOnCorpTurn,
    onDrawIceMayRevealAndInstallProtectingThisServerPayingLess:
      def.onDrawIceMayRevealAndInstallProtectingThisServerPayingLess,
    mayPlaceVirusCounterWhenCorpCardTrashed:
      def.mayPlaceVirusCounterWhenCorpCardTrashed,
    corpLosesCreditsOnFirstRunnerInstallEachTurn:
      def.corpLosesCreditsOnFirstRunnerInstallEachTurn,
    gainCreditsOnFirstRunnerPlayOrInstallNamedType:
      def.gainCreditsOnFirstRunnerPlayOrInstallNamedType,
    mayGainCreditWhenRunnerInstallsOrTrashesInstalled:
      def.mayGainCreditWhenRunnerInstallsOrTrashesInstalled,
    programInstallCostIncrease: def.programInstallCostIncrease,
    hardwareInstallCostIncrease: def.hardwareInstallCostIncrease,
    virtualResourceInstallCostIncrease: def.virtualResourceInstallCostIncrease,
    mayGainCreditWhenRunnerInstallsProgramHardwareOrVirtual:
      def.mayGainCreditWhenRunnerInstallsProgramHardwareOrVirtual,
    mayExposeFirstCorpInstallEachTurnUnlessCorpPays:
      def.mayExposeFirstCorpInstallEachTurnUnlessCorpPays,
    accessTrashNonAgendaWithVirusEqualPrintedCost:
      def.accessTrashNonAgendaWithVirusEqualPrintedCost,
    trashHostAtVirus: def.trashHostAtVirus,
    onEncounterMayPayCreditsGrantIceSubtype:
      def.onEncounterMayPayCreditsGrantIceSubtype
        ? { ...def.onEncounterMayPayCreditsGrantIceSubtype }
        : undefined,
    hostIcebreakerStrengthIncreasesLastRemainderOfTurn:
      def.hostIcebreakerStrengthIncreasesLastRemainderOfTurn,
    hqOrRdRootOnly: def.hqOrRdRootOnly,
    gainCreditsPerCardAccessedDuringBreach:
      def.gainCreditsPerCardAccessedDuringBreach,
    mayPayCreditsToTagWhenRunnerTrashesFromThisServerOrRoot:
      def.mayPayCreditsToTagWhenRunnerTrashesFromThisServerOrRoot
        ? { ...def.mayPayCreditsToTagWhenRunnerTrashesFromThisServerOrRoot }
        : undefined,
    mayRfgSelfToTrashOutermostIceOnFirstFullBreakEachTurn:
      def.mayRfgSelfToTrashOutermostIceOnFirstFullBreakEachTurn,
    mayGainCreditOnFirstCorpCardAbilityCreditGainEachTurn:
      def.mayGainCreditOnFirstCorpCardAbilityCreditGainEachTurn,
    spendHostedCreditsToUseHostedProgram:
      def.spendHostedCreditsToUseHostedProgram,
    trashHostedProgramAtEndOfTurnIfHostedCreditsUsed:
      def.trashHostedProgramAtEndOfTurnIfHostedCreditsUsed,
    placePowerOnFirstSuccessfulRemoteRunEndIfBreachedNoSteal:
      def.placePowerOnFirstSuccessfulRemoteRunEndIfBreachedNoSteal,
    scoreWhenPowerGte: def.scoreWhenPowerGte
      ? { ...def.scoreWhenPowerGte }
      : undefined,
    onApproachServerOncePerTurn: def.onApproachServerOncePerTurn,
    mayTagOnFirstRunEventOrIcebreakerInstallEachTurn:
      def.mayTagOnFirstRunEventOrIcebreakerInstallEachTurn,
    daemonHostVirusProgramsOnly: def.daemonHostVirusProgramsOnly,
    preventOneVirusPurgeOnHostedProgram:
      def.preventOneVirusPurgeOnHostedProgram,
    muBonusOnlyForVirusPrograms: def.muBonusOnlyForVirusPrograms,
    trashFromGripTriggerOnlyByNetOrMeatDamage:
      def.trashFromGripTriggerOnlyByNetOrMeatDamage,
    archivesAccessMayRfgInstead: def.archivesAccessMayRfgInstead
      ? { ...def.archivesAccessMayRfgInstead }
      : undefined,

    playersCannotTrashThisIce: def.playersCannotTrashThisIce,
    dynamicEtrSubroutineCountFromCorpHandSize:
      def.dynamicEtrSubroutineCountFromCorpHandSize,
    runnerFirstInstallCostIncreasePerPowerCounterOnThis:
      def.runnerFirstInstallCostIncreasePerPowerCounterOnThis,
    handSizeBonusPerInstalledCopyWithSameDefId:
      def.handSizeBonusPerInstalledCopyWithSameDefId,
    trashSelfOnUnsuccessfulRunThisTurn: def.trashSelfOnUnsuccessfulRunThisTurn,
    onCorpRemoteServerCreated: def.onCorpRemoteServerCreated
      ? structuredClone(def.onCorpRemoteServerCreated)
      : undefined,
    trashWhenHostedCreditsEmpty: def.trashWhenHostedCreditsEmpty,
    trashSelfOnCorpIceInstall: def.trashSelfOnCorpIceInstall,
    scoreWhenPowerEmpty: def.scoreWhenPowerEmpty
      ? structuredClone(def.scoreWhenPowerEmpty)
      : undefined,
    installServers: def.installServers ? [...def.installServers] : undefined,
    daemonHost: def.daemonHost,
    daemonHostMaxMu: def.daemonHostMaxMu,
    daemonHostExcludeIcebreaker: def.daemonHostExcludeIcebreaker,
    chooseBonusAccessLessThanVirusOnRdBreach:
      def.chooseBonusAccessLessThanVirusOnRdBreach,
    chooseBonusAccessLessThanVirusOnHqBreach:
      def.chooseBonusAccessLessThanVirusOnHqBreach,
    mayExposeApproachedUnrezzedIceOncePerRunThenMayJackOut:
      def.mayExposeApproachedUnrezzedIceOncePerRunThenMayJackOut,
    personalWorkshop: def.personalWorkshop,
    onAccessRequiresInstalled: def.onAccessRequiresInstalled,
    canAdvanceOnlyWhenRezzed: def.canAdvanceOnlyWhenRezzed,
    mayRezWhenCardWouldBeExposed: def.mayRezWhenCardWouldBeExposed,
    rfgWhenPowerEmpty: def.rfgWhenPowerEmpty,
    badPublicityCountersOnRez: def.badPublicityCountersOnRez,
    winWhenBadPublicityCountersEmpty: def.winWhenBadPublicityCountersEmpty,
    etrSubroutinesPerPowerCounter: def.etrSubroutinesPerPowerCounter,
    powerCounterOnHarmonicIceRez: def.powerCounterOnHarmonicIceRez,
    powerOnFirstInstalledCardCreditSpendThisTurn:
      def.powerOnFirstInstalledCardCreditSpendThisTurn,
    removePowerForBonusAccessOnHqRdBreach:
      def.removePowerForBonusAccessOnHqRdBreach,
    playRequiresSuccessfulRunThisTurn: def.playRequiresSuccessfulRunThisTurn,
    playRequiresThreat: def.playRequiresThreat,
    installRequiresSuccessfulCentralRunThisTurn:
      def.installRequiresSuccessfulCentralRunThisTurn,
    agendaPointsPerAgendaCounter: def.agendaPointsPerAgendaCounter,
    agendaPointsWhileHasAgendaCounter: def.agendaPointsWhileHasAgendaCounter,
    cannotBreakWithAi: def.cannotBreakWithAi,
    cannotBreakWithAiAtAdvancements: def.cannotBreakWithAiAtAdvancements,
    cannotBreakExceptSubtype: def.cannotBreakExceptSubtype,
    cannotBeTrashedByRunnerWhileRezzed: def.cannotBeTrashedByRunnerWhileRezzed,
    strengthBonusIfSoleIceProtectingServer:
      def.strengthBonusIfSoleIceProtectingServer,
    strengthBonusIfRezzedThisTurn: def.strengthBonusIfRezzedThisTurn,
    paidAbilityCreditDiscountIfRunEventActive:
      def.paidAbilityCreditDiscountIfRunEventActive,
    threatGiveTagsOnRezzedTrash: def.threatGiveTagsOnRezzedTrash
      ? { ...def.threatGiveTagsOnRezzedTrash }
      : undefined,
    cannotBreakWithRunnerCardAbilities: def.cannotBreakWithRunnerCardAbilities,
    installFaceup: def.installFaceup,
    creditsOnAdvance: def.creditsOnAdvance
      ? { ...def.creditsOnAdvance }
      : undefined,
    advancementRequirementReduction: def.advancementRequirementReduction,
    agendaAdvancementRequirementBonus: def.agendaAdvancementRequirementBonus,
    agendaAdvancementRequirementBonusIfVirusCountersGte:
      def.agendaAdvancementRequirementBonusIfVirusCountersGte
        ? { ...def.agendaAdvancementRequirementBonusIfVirusCountersGte }
        : undefined,
    runsCannotBeSuccessful: def.runsCannotBeSuccessful,
    maxAccessOtherThanSelf: def.maxAccessOtherThanSelf,
    continuousSubtypeGrants:
      def.continuousSubtypeGrants && def.continuousSubtypeGrants.length > 0
        ? structuredClone(def.continuousSubtypeGrants)
        : undefined,
    continuousGainedSubDecls:
      def.continuousGainedSubDecls && def.continuousGainedSubDecls.length > 0
        ? structuredClone(def.continuousGainedSubDecls)
        : undefined,
    recurringSpendFor: def.recurringSpendFor
      ? [...def.recurringSpendFor]
      : undefined,
    accessTrashWithVirus: def.accessTrashWithVirus,
    accessTrashPayingPrintedCostFromStealth:
      def.accessTrashPayingPrintedCostFromStealth,
    returnHostedBadPublicityOnUninstall:
      def.returnHostedBadPublicityOnUninstall,
    gainsTextOfHostedIdentity: def.gainsTextOfHostedIdentity,
    returnHostedIdentityToOutsideGameOnUninstall:
      def.returnHostedIdentityToOutsideGameOnUninstall,
    agendaPointsModifierInRunnerScoreArea:
      def.agendaPointsModifierInRunnerScoreArea,
    runnerScoredAgendaPointsModifier: def.runnerScoredAgendaPointsModifier,
    canAdvance: def.canAdvance,
    playRequiresSuccessfulHqRunThisTurn:
      def.playRequiresSuccessfulHqRunThisTurn,
    playRequiresSuccessfulAllCentralsThisTurn:
      def.playRequiresSuccessfulAllCentralsThisTurn,
    playRequiresCorpBadPublicityGte: def.playRequiresCorpBadPublicityGte,
    onGrayOrBlackOpsTrashedAfterResolve: def.onGrayOrBlackOpsTrashedAfterResolve
      ? structuredClone(def.onGrayOrBlackOpsTrashedAfterResolve)
      : undefined,
    onPassAllIceProtectingServer: def.onPassAllIceProtectingServer
      ? structuredClone(def.onPassAllIceProtectingServer)
      : undefined,
    onWouldTakeBadPublicity: def.onWouldTakeBadPublicity
      ? structuredClone(def.onWouldTakeBadPublicity)
      : undefined,
    dynamicEtrSubroutineCountFromCorpAgendaPoints:
      def.dynamicEtrSubroutineCountFromCorpAgendaPoints,
    dynamicEtrSubroutineCountFromRezzedIceSubtype:
      def.dynamicEtrSubroutineCountFromRezzedIceSubtype,
    runnerIcebreakerAbilityAdditionalCostOnThisServer:
      def.runnerIcebreakerAbilityAdditionalCostOnThisServer,
    gainCreditsOnTraceInitiated: def.gainCreditsOnTraceInitiated,
    onGripRdSuccessInstallSelfIgnoringCosts:
      def.onGripRdSuccessInstallSelfIgnoringCosts,
    onEncounterRezzedAfterApproach: def.onEncounterRezzedAfterApproach
      ? structuredClone(def.onEncounterRezzedAfterApproach)
      : undefined,
    blackguardForceRezOnExpose: def.blackguardForceRezOnExpose,
    breakerOnlyOutermostIce: def.breakerOnlyOutermostIce,
    breakerOnlyInnermostIce: def.breakerOnlyInnermostIce,
    onScoreIfRunnerTaggedPlaceAgendaCounter:
      def.onScoreIfRunnerTaggedPlaceAgendaCounter,
    playRequiresScoredAgendaNotInstalledThisTurn:
      def.playRequiresScoredAgendaNotInstalledThisTurn,
    playRequiresNoCorpActionFinished: def.playRequiresNoCorpActionFinished,
    playRequiresNoActiveLockdown: def.playRequiresNoActiveLockdown,
    lingerUntilCorpNextTurnBegins: def.lingerUntilCorpNextTurnBegins,
    rezAdditionalCostForfeitAgenda: def.rezAdditionalCostForfeitAgenda,
    rezCostCreditDiscountOnForfeitAgenda:
      def.rezCostCreditDiscountOnForfeitAgenda,
    rezAdditionalCostDerezSubtype: def.rezAdditionalCostDerezSubtype,
    playAdditionalClick: def.playAdditionalClick,
    playAdditionalClicks: def.playAdditionalClicks,
    stealAdditionalClicks: def.stealAdditionalClicks,
    stealAdditionalCredits: def.stealAdditionalCredits,
    stealAdditionalCreditsFormula: def.stealAdditionalCreditsFormula,
    runnerLoseCreditsOnBreakPrintedSubroutine:
      def.runnerLoseCreditsOnBreakPrintedSubroutine,
    stealAdditionalCreditsWhileRezzed: def.stealAdditionalCreditsWhileRezzed,
    stealAdditionalCreditsFromProtectingServer:
      def.stealAdditionalCreditsFromProtectingServer,
    playCostDiscountPerIceProtectingServer:
      def.playCostDiscountPerIceProtectingServer,
    firstDoubleOperationClickDiscount: def.firstDoubleOperationClickDiscount,
    rezCostDiscountIfAgendaScoredOrStolenThisTurn:
      def.rezCostDiscountIfAgendaScoredOrStolenThisTurn,
    allIceStrengthPenalty: def.allIceStrengthPenalty,
    allIceStrengthBonus: def.allIceStrengthBonus,
    cannotBreakExceptIcebreaker: def.cannotBreakExceptIcebreaker,
    gainCreditOnBreakIceStrengthLteOncePerTurn:
      def.gainCreditOnBreakIceStrengthLteOncePerTurn,
    endsActionPhase: def.endsActionPhase,
    removePowerCounterOnAnySuccessfulRun:
      def.removePowerCounterOnAnySuccessfulRun,
    additionalRunCostTrashAgendaFromScoreUnlessSuccessfulHqThisTurn:
      def.additionalRunCostTrashAgendaFromScoreUnlessSuccessfulHqThisTurn,
    mayShuffleIntoRdWhenTrashed: def.mayShuffleIntoRdWhenTrashed,
    badPublicityOnScore: def.badPublicityOnScore,
    playCostXMaxRunnerTags: def.playCostXMaxRunnerTags,
    installSpendCreditsForPowerCounters:
      def.installSpendCreditsForPowerCounters,
    strengthPerPowerCounter: def.strengthPerPowerCounter,
    interfaceRequiresEqualStrength: def.interfaceRequiresEqualStrength,
    interfaceRequiresTrojanHost: def.interfaceRequiresTrojanHost,
    interfaceRequiresChosenServer: def.interfaceRequiresChosenServer,
    chooseBreakerSubtypeOnInstall: def.chooseBreakerSubtypeOnInstall,
    returnToGripAtDiscardPhase: def.returnToGripAtDiscardPhase,
    chooseIceOnInstallForBypass: def.chooseIceOnInstallForBypass,
    chooseIceOnInstall: def.chooseIceOnInstall,
    hostedProgramsLoseAbilities: def.hostedProgramsLoseAbilities,
    securityTesting: def.securityTesting,
    rezBioroidDiscountOnFirstPass: def.rezBioroidDiscountOnFirstPass,
    interruptFirstDrawBottomOne: def.interruptFirstDrawBottomOne,
    subliminalMessaging: def.subliminalMessaging,
    aylaSetAside: def.aylaSetAside,
    steveCambridge: def.steveCambridge,
    aesopPawnshop: def.aesopPawnshop,
    targetedMarketing: def.targetedMarketing,
    link: def.link,
    minimumDeckSize: def.minimumDeckSize,
    influenceLimit: def.influenceLimit,
    influence: def.influence,
    unsupported: def.unsupported ? [...def.unsupported] : undefined,
    faceup: def.type === "identity" || def.side === "runner",
    rezzed: def.type === "identity",
    zone,
  };
  copyOptionalCardFields(card, def);
  return card;
}
