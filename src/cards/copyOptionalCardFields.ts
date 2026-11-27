/** The second half of instantiateCard: what it sets from a card's data only when the data has it, in the original order, and the declared pump ability it adds (CR 3.9.5b). */
import type { CardInstance } from "../state/types/card.js";
import type { PaidAbility, Subroutine } from "../state/types/abilities.js";
import {
  canonicalizeAbilityFlags,
  syncSubroutinesFromRecords,
} from "../effects/abilityRecord.js";
import type { CardDef } from "./cardDef.js";

/** A paid ability that raises its own card's strength (`pump_strength`, …). */
const PUMP_KIND = /"kind":"[a-z_]*pump[a-z_]*"/;

/**
 * The printed "N[credit]: +M strength" of an icebreaker whose card data
 * states it only in the breaker declaration (`pumpCredits`, `pumpStrength`)
 * and has no pump paid ability of its own (CR 3.9.5b, 9.3.7b). It goes
 * through `pump_strength`, so the icebreaker's strength increase lasts for
 * the remainder of the current encounter (CR 3.9.5b). Its cost is paid like
 * any other paid ability's, so Dagger's
 * `paidAbilitiesUseStealthCreditsOnly` applies to it. A pump is not an
 * interface ability (CR 3.9.5e), so it carries no `interface` flag and works
 * below the ice's strength. A card that has its own pump ability keeps it.
 */
function declaredPumpAbility(card: CardInstance): PaidAbility | null {
  const br = card.breaker;
  if (!br || !(br.pumpCredits && br.pumpCredits > 0)) return null;
  if (
    (card.paidAbilities ?? []).some((ab) =>
      PUMP_KIND.test(JSON.stringify(ab.effect ?? null)),
    )
  ) {
    return null;
  }
  const credits = br.pumpCredits;
  const strength = br.pumpStrength ?? 1;
  return {
    id: `${card.defId}-pump`,
    label: `Pump ${card.title} +${strength} strength`,
    clickCost: 0,
    creditCost: credits,
    cost: { credits },
    windows: ["encounter_paw"],
    effect: {
      op: "do",
      action: { kind: "pump_strength", amount: strength },
    },
  };
}

/** The rest of instantiateCard, moved here unchanged: what it sets on the card from the card's data when the data has it (hooks, abilities, optional fields), in the original order. */
export function copyOptionalCardFields(card: CardInstance, def: CardDef): void {
  if (def.breaker) {
    card.breaker = { ...def.breaker };
  }
  if (def.paidAbilities) {
    card.paidAbilities = def.paidAbilities.map((a): PaidAbility => ({
      ...a,
      clickCost: a.clickCost ?? a.cost?.clicks ?? 0,
      creditCost: a.creditCost ?? a.cost?.credits ?? 0,
      cost: a.cost ? { ...a.cost } : undefined,
      windows: [...a.windows],
      effect: structuredClone(a.effect),
      oncePerTurn: a.oncePerTurn,
      oncePerRun: a.oncePerRun,
      oncePerEncounter: a.oncePerEncounter,
      usableByRunnerOnSelfIce: a.usableByRunnerOnSelfIce,
      usableFromHq: a.usableFromHq,
      usableFromArchives: a.usableFromArchives,
      usableByAnyPlayer: a.usableByAnyPlayer,
      usableFromRunnerScoreArea: a.usableFromRunnerScoreArea,
      requireProtectingHostServer: a.requireProtectingHostServer,
      requiresAdvancements: a.requiresAdvancements,
      requiresThreat: a.requiresThreat,
      requiresSuccessfulRdRunThisTurn: a.requiresSuccessfulRdRunThisTurn,
      requiresSuccessfulHqRunThisTurn: a.requiresSuccessfulHqRunThisTurn,
      requiresRezzedIce: a.requiresRezzedIce,
      requiresSuccessfulAllCentralsThisTurn:
        a.requiresSuccessfulAllCentralsThisTurn,
      requiresUntagged: a.requiresUntagged,
      requireRunnerTagged: a.requireRunnerTagged,
      requiresActiveRun: a.requiresActiveRun,
      requireOtherServer: a.requireOtherServer,
      requireThisServer: a.requireThisServer,
      onlyDuringArchivesRun: a.onlyDuringArchivesRun,
      requireRunnerClicksEq: a.requireRunnerClicksEq,
      requireEncounterSubtype: a.requireEncounterSubtype,
      requireEncounterChosenIce: a.requireEncounterChosenIce,
      requireAttackingMark: a.requireAttackingMark,
      requireBrokenSubThisEncounter: a.requireBrokenSubThisEncounter,
      requireFullyBrokenThisEncounter: a.requireFullyBrokenThisEncounter,
      requireSufferedCorpDamageThisTurn: a.requireSufferedCorpDamageThisTurn,
      requireSufferedMeatDamageThisTurn: a.requireSufferedMeatDamageThisTurn,
      requireSufferedAnyDamageThisTurn: a.requireSufferedAnyDamageThisTurn,
      requireNextPawAfterDamage: a.requireNextPawAfterDamage,
      requireDuringRun: a.requireDuringRun,
      forbidDuringRun: a.forbidDuringRun,
      onlyDuringOwnTurn: a.onlyDuringOwnTurn,
      formicaryApproachAnyServer: a.formicaryApproachAnyServer,
      requirePendingDamageTypes: a.requirePendingDamageTypes
        ? [...a.requirePendingDamageTypes]
        : undefined,
      oncePerPendingDamageInstance: a.oncePerPendingDamageInstance,
      onlyCorpTrashes: a.onlyCorpTrashes,
      requirePendingTrashCardTypes: a.requirePendingTrashCardTypes
        ? [...a.requirePendingTrashCardTypes]
        : undefined,
      requiresCorpCreditsGte: a.requiresCorpCreditsGte,
      startsRun: a.startsRun ? structuredClone(a.startsRun) : undefined,
    }));
    for (const ab of card.paidAbilities) {
      canonicalizeAbilityFlags(ab);
    }
    if (def.paidAbilitiesOncePerTurn) {
      for (const ab of card.paidAbilities) {
        ab.oncePerTurn = true;
        canonicalizeAbilityFlags(ab);
      }
    }
  }
  {
    const pump = declaredPumpAbility(card);
    if (pump) card.paidAbilities = [...(card.paidAbilities ?? []), pump];
  }
  if (typeof card.autoPreventNetOrMeatDamagePayOrTrash === "number") {
    card.paidAbilities = [
      ...(card.paidAbilities ?? []),
      {
        id: "guru-prevent-all",
        label: "Prevent all net or meat damage",
        clickCost: 0,
        creditCost: 0,
        windows: ["damage_interrupt"],
        effect: {
          op: "do",
          action: { kind: "prevent_all_pending_net_or_meat" },
        },
      },
    ];
  }
  if (def.onRez) card.onRez = structuredClone(def.onRez);
  if (def.abilities && def.abilities.length > 0) {
    card.abilities = structuredClone(def.abilities);
  }
  // Prefer CR 9.3.7e records for printed subroutines. Catalog dual-write of
  // `subroutines` remains for shape tests; runtime does not depend on it.
  if ((card.abilities ?? []).some((a) => a.class === "subroutine")) {
    syncSubroutinesFromRecords(card);
  } else if (def.subroutines) {
    card.subroutines = def.subroutines.map((s): Subroutine => ({
      id: s.id,
      text: s.text,
      effect: structuredClone(s.effect),
      ...(s.requireLostClickToBreakThisRun
        ? { requireLostClickToBreakThisRun: true }
        : {}),
    }));
  }
  if (def.onPlay) card.onPlay = structuredClone(def.onPlay);
  if (def.playAdditionalCost) {
    card.playAdditionalCost = structuredClone(def.playAdditionalCost);
  }
  if (def.onScore) card.onScore = structuredClone(def.onScore);
  if (def.onForfeit) card.onForfeit = structuredClone(def.onForfeit);
  if (def.scoreAdditionalCost) {
    card.scoreAdditionalCost = structuredClone(def.scoreAdditionalCost);
  }
  if (def.stealAdditionalCost) {
    card.stealAdditionalCost = structuredClone(def.stealAdditionalCost);
  }
  if (def.trashAdditionalCost) {
    card.trashAdditionalCost = structuredClone(def.trashAdditionalCost);
  }
  if (def.stealAdditionalCostFromProtectingServer) {
    card.stealAdditionalCostFromProtectingServer = structuredClone(
      def.stealAdditionalCostFromProtectingServer,
    );
  }
  if (def.onSteal) card.onSteal = structuredClone(def.onSteal);
  if (def.onGrayOrBlackOpsTrashedAfterResolve) {
    card.onGrayOrBlackOpsTrashedAfterResolve = structuredClone(
      def.onGrayOrBlackOpsTrashedAfterResolve,
    );
  }
  if (def.onPassAllIceProtectingServer) {
    card.onPassAllIceProtectingServer = structuredClone(
      def.onPassAllIceProtectingServer,
    );
  }
  if (def.onWouldTakeBadPublicity) {
    card.onWouldTakeBadPublicity = structuredClone(def.onWouldTakeBadPublicity);
  }
  if (def.dynamicEtrSubroutineCountFromCorpAgendaPoints) {
    card.dynamicEtrSubroutineCountFromCorpAgendaPoints = true;
  }
  if (def.dynamicEtrSubroutineCountFromRezzedIceSubtype) {
    card.dynamicEtrSubroutineCountFromRezzedIceSubtype =
      def.dynamicEtrSubroutineCountFromRezzedIceSubtype;
  }
  if (def.dynamicEtrSubroutineCountFromCorpHandSize) {
    card.dynamicEtrSubroutineCountFromCorpHandSize = true;
  }
  if (def.runnerIcebreakerAbilityAdditionalCostOnThisServer !== undefined) {
    card.runnerIcebreakerAbilityAdditionalCostOnThisServer =
      def.runnerIcebreakerAbilityAdditionalCostOnThisServer;
  }
  if (def.gainCreditsOnTraceInitiated !== undefined) {
    card.gainCreditsOnTraceInitiated = def.gainCreditsOnTraceInitiated;
  }
  if (def.onGripRdSuccessInstallSelfIgnoringCosts) {
    card.onGripRdSuccessInstallSelfIgnoringCosts = true;
  }
  if (def.onGripArchivesSuccessInstallSelfIgnoringCosts) {
    card.onGripArchivesSuccessInstallSelfIgnoringCosts = true;
  }
  if (def.strengthPerCorpCardInHq) {
    card.strengthPerCorpCardInHq = def.strengthPerCorpCardInHq;
  }
  if (def.rezCostIncreasePerCorpCardInHq) {
    card.rezCostIncreasePerCorpCardInHq = def.rezCostIncreasePerCorpCardInHq;
  }
  if (def.jackOutOnThisServerTrashRunnerProgram) {
    card.jackOutOnThisServerTrashRunnerProgram = true;
  }
  if (def.runnerCannotPlayCurrentEvents) {
    card.runnerCannotPlayCurrentEvents = true;
  }
  if (def.morphOddAdvancementSubtypeSwap) {
    card.morphOddAdvancementSubtypeSwap = {
      ...def.morphOddAdvancementSubtypeSwap,
    };
  }
  if (def.supplierHost) {
    card.supplierHost = true;
  }
  if (def.onFirstRunnerCreditPoolEmptyThisTurn) {
    card.onFirstRunnerCreditPoolEmptyThisTurn = structuredClone(
      def.onFirstRunnerCreditPoolEmptyThisTurn,
    );
  }
  if (def.trashSelfWhenRunnerTagged) {
    card.trashSelfWhenRunnerTagged = true;
  }
  if (def.playersCannotTrashThisIce) {
    card.playersCannotTrashThisIce = true;
  }
  if (def.runnerFirstInstallCostIncreasePerPowerCounterOnThis) {
    card.runnerFirstInstallCostIncreasePerPowerCounterOnThis =
      def.runnerFirstInstallCostIncreasePerPowerCounterOnThis;
  }
  if (def.handSizeBonusPerInstalledCopyWithSameDefId) {
    card.handSizeBonusPerInstalledCopyWithSameDefId =
      def.handSizeBonusPerInstalledCopyWithSameDefId;
  }
  if (def.trashSelfOnUnsuccessfulRunThisTurn) {
    card.trashSelfOnUnsuccessfulRunThisTurn = true;
  }
  if (def.onCorpRemoteServerCreated) {
    card.onCorpRemoteServerCreated = structuredClone(
      def.onCorpRemoteServerCreated,
    );
  }
  if (def.onEncounterRezzedAfterApproach) {
    card.onEncounterRezzedAfterApproach = structuredClone(
      def.onEncounterRezzedAfterApproach,
    );
  }
  if (def.advancementRequirementIncreasePerCorpBadPublicity !== undefined) {
    card.advancementRequirementIncreasePerCorpBadPublicity =
      def.advancementRequirementIncreasePerCorpBadPublicity;
  }
  if (def.blackguardForceRezOnExpose) {
    card.blackguardForceRezOnExpose = true;
  }
  if (def.breakerOnlyOutermostIce) card.breakerOnlyOutermostIce = true;
  if (def.breakerOnlyInnermostIce) card.breakerOnlyInnermostIce = true;
  if (def.onScoreIfRunnerTaggedPlaceAgendaCounter) {
    card.onScoreIfRunnerTaggedPlaceAgendaCounter = true;
  }
  if (def.playRequiresCorpBadPublicityGte !== undefined) {
    card.playRequiresCorpBadPublicityGte = def.playRequiresCorpBadPublicityGte;
  }
  if (def.onEncounter) card.onEncounter = structuredClone(def.onEncounter);
  if (def.onPass) card.onPass = structuredClone(def.onPass);
  if (def.onBypass) card.onBypass = structuredClone(def.onBypass);
  if (def.onBypassMayInstallFromHeap) {
    card.onBypassMayInstallFromHeap = { ...def.onBypassMayInstallFromHeap };
  }
  if (def.onFirstProgramInstallEachTurn) {
    card.onFirstProgramInstallEachTurn = structuredClone(
      def.onFirstProgramInstallEachTurn,
    );
  }
  if (def.onFirstHardwareInstallEachTurn) {
    card.onFirstHardwareInstallEachTurn = structuredClone(
      def.onFirstHardwareInstallEachTurn,
    );
  }
  if (def.onFirstEncounterEachRun) {
    card.onFirstEncounterEachRun = structuredClone(def.onFirstEncounterEachRun);
  }
  if (def.onFirstCorpCardTrashEachTurn) {
    card.onFirstCorpCardTrashEachTurn = structuredClone(
      def.onFirstCorpCardTrashEachTurn,
    );
  }
  if (def.onFirstInstalledCorpCardTrashEachTurn) {
    card.onFirstInstalledCorpCardTrashEachTurn = structuredClone(
      def.onFirstInstalledCorpCardTrashEachTurn,
    );
  }
  if (def.onFirstRunnerStoleOrTrashedCorpCardThisTurn) {
    card.onFirstRunnerStoleOrTrashedCorpCardThisTurn = structuredClone(
      def.onFirstRunnerStoleOrTrashedCorpCardThisTurn,
    );
  }
  if (def.onAccessTrash) {
    card.onAccessTrash = structuredClone(def.onAccessTrash);
  }
  if (def.onFirstCorpRootInstallEachTurn) {
    card.onFirstCorpRootInstallEachTurn = structuredClone(
      def.onFirstCorpRootInstallEachTurn,
    );
  }
  if (def.onAccessRequiresRezzed) card.onAccessRequiresRezzed = true;
  if (def.onAccessRequiresInstalled) card.onAccessRequiresInstalled = true;
  if (def.onPassHost) card.onPassHost = structuredClone(def.onPassHost);
  if (def.hostedCreditsOnAnyIceRez !== undefined) {
    card.hostedCreditsOnAnyIceRez = def.hostedCreditsOnAnyIceRez;
  }
  if (def.hostedCreditsSpendForInstallTypes) {
    card.hostedCreditsSpendForInstallTypes = [
      ...def.hostedCreditsSpendForInstallTypes,
    ];
  }
  if (def.paidAbilitiesOncePerTurn) {
    card.paidAbilitiesOncePerTurn = true;
  }
  if (def.hostedCreditsSpendFor) {
    card.hostedCreditsSpendFor = [...def.hostedCreditsSpendFor];
  }
  if (def.hostedCreditsSpendForInstallSubtypes) {
    card.hostedCreditsSpendForInstallSubtypes = [
      ...def.hostedCreditsSpendForInstallSubtypes,
    ];
  }
  if (def.hostedCreditsSpendForInstallExcludeSubtypes) {
    card.hostedCreditsSpendForInstallExcludeSubtypes = [
      ...def.hostedCreditsSpendForInstallExcludeSubtypes,
    ];
  }
  if (def.accessTrashSelfNonAgendaThenDraw) {
    card.accessTrashSelfNonAgendaThenDraw = true;
  }
  if (def.rezAdditionalCost) {
    card.rezAdditionalCost = structuredClone(def.rezAdditionalCost);
  }
  if (def.onHostRezzed) card.onHostRezzed = structuredClone(def.onHostRezzed);
  if (def.onHostDerezzed) {
    card.onHostDerezzed = structuredClone(def.onHostDerezzed);
  }
  if (def.onHostEncounter) {
    card.onHostEncounter = structuredClone(def.onHostEncounter);
  }
  if (def.threatCannotSpendCreditsDuringSubs !== undefined) {
    card.threatCannotSpendCreditsDuringSubs =
      def.threatCannotSpendCreditsDuringSubs;
  }
  if (def.onApproachServer) {
    card.onApproachServer = structuredClone(def.onApproachServer);
  }
  if (def.onApproachServerOncePerRun) {
    card.onApproachServerOncePerRun = true;
  }
  if (def.onApproachIce) {
    card.onApproachIce = structuredClone(def.onApproachIce);
  }
  if (def.onApproachIceOncePerRun) {
    card.onApproachIceOncePerRun = true;
  }
  if (def.identityFlippedHooks) {
    card.identityFlippedHooks = structuredClone(def.identityFlippedHooks);
  }
  if (def.additionalCostOnScoreAgendaInstalledThisTurn) {
    card.additionalCostOnScoreAgendaInstalledThisTurn = structuredClone(
      def.additionalCostOnScoreAgendaInstalledThisTurn,
    );
  }
  if (def.onRunnerDiscardOverMaxHand) {
    card.onRunnerDiscardOverMaxHand = structuredClone(
      def.onRunnerDiscardOverMaxHand,
    );
  }
  if (def.onCreditsGainedFromAgendaOrOperationAbility) {
    card.onCreditsGainedFromAgendaOrOperationAbility = structuredClone(
      def.onCreditsGainedFromAgendaOrOperationAbility,
    );
  }
  if (def.remoteOnly) card.remoteOnly = true;
  if (def.persistent) card.persistent = true;
  if (def.rezOnlyDuringCorpTurn) card.rezOnlyDuringCorpTurn = true;
  if (def.firstRunCannotTargetRemote) card.firstRunCannotTargetRemote = true;
  if (def.iceGainsTrashToResolveChosenSubOnEncounter) {
    card.iceGainsTrashToResolveChosenSubOnEncounter = true;
  }
  if (def.onTurnBegin) card.onTurnBegin = structuredClone(def.onTurnBegin);
  if (def.onCorpTurnBegin) {
    card.onCorpTurnBegin = structuredClone(def.onCorpTurnBegin);
  }
  if (def.onGameStart) card.onGameStart = structuredClone(def.onGameStart);
  if (def.onInstall) card.onInstall = structuredClone(def.onInstall);
  if (def.onUninstall) card.onUninstall = structuredClone(def.onUninstall);
  if (def.onInstallWithoutSpendingCredits) {
    card.onInstallWithoutSpendingCredits = structuredClone(
      def.onInstallWithoutSpendingCredits,
    );
  }
  if (def.onAccessFaceupInstalledAgenda) {
    card.onAccessFaceupInstalledAgenda = structuredClone(
      def.onAccessFaceupInstalledAgenda,
    );
  }
  if (def.onInstallFromNonHq) {
    card.onInstallFromNonHq = structuredClone(def.onInstallFromNonHq);
  }
  if (def.onCorpTurnEnd) {
    card.onCorpTurnEnd = structuredClone(def.onCorpTurnEnd);
  }
  if (def.onDiscardPhaseEnd) {
    card.onDiscardPhaseEnd = structuredClone(def.onDiscardPhaseEnd);
  }
  if (def.onWouldDrawOncePerTurn) {
    card.onWouldDrawOncePerTurn = structuredClone(def.onWouldDrawOncePerTurn);
  }
  if (def.onFirstTrashMatchingRunnerIdentityFactionEachTurn) {
    card.onFirstTrashMatchingRunnerIdentityFactionEachTurn = structuredClone(
      def.onFirstTrashMatchingRunnerIdentityFactionEachTurn,
    );
  }
  if (def.onFirstRevealEachTurn) {
    card.onFirstRevealEachTurn = structuredClone(def.onFirstRevealEachTurn);
  }
  if (def.mirrormorphOnThirdDistinctAction) {
    card.mirrormorphOnThirdDistinctAction = structuredClone(
      def.mirrormorphOnThirdDistinctAction,
    );
    card.mirrormorphTrackDistinctActions = true;
  }
  if (def.blankIdentitiesWhileResolving) {
    card.blankIdentitiesWhileResolving = true;
  }
  if (def.onCorpActionPhaseEnd) {
    card.onCorpActionPhaseEnd = structuredClone(def.onCorpActionPhaseEnd);
  }
  if (def.onRunnerActionPhaseEnd) {
    card.onRunnerActionPhaseEnd = structuredClone(def.onRunnerActionPhaseEnd);
  }
  if (def.onAnyIceRez) {
    card.onAnyIceRez = structuredClone(def.onAnyIceRez);
  }
  if (def.onFirstAgendaScoredOrStolenThisTurn) {
    card.onFirstAgendaScoredOrStolenThisTurn = structuredClone(
      def.onFirstAgendaScoredOrStolenThisTurn,
    );
  }
  if (def.onRunBegin) {
    card.onRunBegin = structuredClone(def.onRunBegin);
  }
  if (def.onBeforeFirstTurn) {
    card.onBeforeFirstTurn = structuredClone(def.onBeforeFirstTurn);
  }
  if (def.onMovedToServerRoot) {
    card.onMovedToServerRoot = structuredClone(def.onMovedToServerRoot);
  }
  if (def.advancedIceProtectingThisServerStrengthBonus !== undefined) {
    card.advancedIceProtectingThisServerStrengthBonus =
      def.advancedIceProtectingThisServerStrengthBonus;
  }
  if (def.onRunBeginMaySpendAgendaCounterRezUpToIceProtectingAttacked) {
    card.onRunBeginMaySpendAgendaCounterRezUpToIceProtectingAttacked = {
      ...def.onRunBeginMaySpendAgendaCounterRezUpToIceProtectingAttacked,
    };
  }
  if (def.onCorpTurnEndDerezUpToIceProtectingLightningServer) {
    card.onCorpTurnEndDerezUpToIceProtectingLightningServer = {
      ...def.onCorpTurnEndDerezUpToIceProtectingLightningServer,
    };
  }
  if (def.oncePerTurnOnRezIceProtectingThisServerDuringRun) {
    card.oncePerTurnOnRezIceProtectingThisServerDuringRun = {
      ...def.oncePerTurnOnRezIceProtectingThisServerDuringRun,
    };
  }
  if (def.onRezApOrDestroyerIceDuringRun) {
    card.onRezApOrDestroyerIceDuringRun = {
      ...def.onRezApOrDestroyerIceDuringRun,
    };
  }
  if (def.derezAtAnyTurnEnd) {
    card.derezAtAnyTurnEnd = true;
  }
  if (def.powerOnHqRdRunEndIfAccessedGte) {
    card.powerOnHqRdRunEndIfAccessedGte = {
      ...def.powerOnHqRdRunEndIfAccessedGte,
    };
  }
  if (def.bonusAccessOnHqRdBreachWhileTagged !== undefined) {
    card.bonusAccessOnHqRdBreachWhileTagged =
      def.bonusAccessOnHqRdBreachWhileTagged;
  }
  if (def.bonusAccessOnFirstHqBreachThisTurn !== undefined) {
    card.bonusAccessOnFirstHqBreachThisTurn =
      def.bonusAccessOnFirstHqBreachThisTurn;
  }
  if (def.bonusAccessOnHqBreach !== undefined) {
    card.bonusAccessOnHqBreach = def.bonusAccessOnHqBreach;
  }
  if (def.bonusAccessOnRdBreach !== undefined) {
    card.bonusAccessOnRdBreach = def.bonusAccessOnRdBreach;
  }
  if (def.threatBasicTrashAdditionalCostTrashHq !== undefined) {
    card.threatBasicTrashAdditionalCostTrashHq =
      def.threatBasicTrashAdditionalCostTrashHq;
  }
  if (def.wageWorkersTrackActions) {
    card.wageWorkersTrackActions = true;
  }
  if (def.onSuccessfulRun) {
    card.onSuccessfulRun = structuredClone(def.onSuccessfulRun);
  }
  if (def.onSuccessfulRunOnRd) {
    card.onSuccessfulRunOnRd = structuredClone(def.onSuccessfulRunOnRd);
  }
  if (def.onPassUnrezzedIce) {
    card.onPassUnrezzedIce = structuredClone(def.onPassUnrezzedIce);
  }
  if (def.onPassRezzedIce) {
    card.onPassRezzedIce = structuredClone(def.onPassRezzedIce);
  }
  if (typeof def.whileScoredMeatDamageIncrease === "number") {
    card.whileScoredMeatDamageIncrease = def.whileScoredMeatDamageIncrease;
  }
  if (def.blocksRunnerRunsOnHostServer) {
    card.blocksRunnerRunsOnHostServer = true;
  }
  if (def.trashSelfWhenFullyBrokenByRunner) {
    card.trashSelfWhenFullyBrokenByRunner = true;
  }
  if (def.trashSelfOnCorpSuccessfulHqRun) {
    card.trashSelfOnCorpSuccessfulHqRun = true;
  }
  if (typeof def.gainCreditsWhenRunnerHostsProgramOnSelf === "number") {
    card.gainCreditsWhenRunnerHostsProgramOnSelf =
      def.gainCreditsWhenRunnerHostsProgramOnSelf;
  }
  if (def.onCorpBasicClickForCreditOrDraw) {
    card.onCorpBasicClickForCreditOrDraw = structuredClone(
      def.onCorpBasicClickForCreditOrDraw,
    );
  }
  if (def.onSuccessfulRunOncePerTurn) {
    card.onSuccessfulRunOncePerTurn = true;
  }
  if (def.onSuccessfulTraceDuringRun) {
    card.onSuccessfulTraceDuringRun = structuredClone(
      def.onSuccessfulTraceDuringRun,
    );
  }
  if (def.onBreakSubroutine) {
    card.onBreakSubroutine = structuredClone(def.onBreakSubroutine);
  }
  if (def.onBreakSubroutineMayPayCreditsBreakAnother) {
    card.onBreakSubroutineMayPayCreditsBreakAnother = {
      ...def.onBreakSubroutineMayPayCreditsBreakAnother,
    };
  }
  if (def.strengthBonusOnBreakSubForRun !== undefined) {
    card.strengthBonusOnBreakSubForRun = def.strengthBonusOnBreakSubForRun;
  }
  if (def.installedCardsTrashCostBonus !== undefined) {
    card.installedCardsTrashCostBonus = def.installedCardsTrashCostBonus;
  }
  if (
    def.mayImmediatelyRezIceOnInstallProtectingThisServerDiscount !== undefined
  ) {
    card.mayImmediatelyRezIceOnInstallProtectingThisServerDiscount =
      def.mayImmediatelyRezIceOnInstallProtectingThisServerDiscount;
  }
  if (def.onAccess) card.onAccess = structuredClone(def.onAccess);
  if (def.onTrash) card.onTrash = structuredClone(def.onTrash);
  if (def.onTrashWhileAccessed) {
    card.onTrashWhileAccessed = structuredClone(def.onTrashWhileAccessed);
  }
  if (def.onVirusPurge) card.onVirusPurge = structuredClone(def.onVirusPurge);
  if (def.onBreachHqIfHostingCorpCard) {
    card.onBreachHqIfHostingCorpCard = structuredClone(
      def.onBreachHqIfHostingCorpCard,
    );
  }
  if (def.onBreachRd) {
    card.onBreachRd = structuredClone(def.onBreachRd);
  }
  if (def.onTrashFromGripOrStack) {
    card.onTrashFromGripOrStack = structuredClone(def.onTrashFromGripOrStack);
  }
  if (def.onRezzedCardTrashed) {
    card.onRezzedCardTrashed = structuredClone(def.onRezzedCardTrashed);
  }
  if (def.onFirstTagThisTurn) {
    card.onFirstTagThisTurn = structuredClone(def.onFirstTagThisTurn);
  }
  if (def.preventFirstTagEachRun) {
    card.preventFirstTagEachRun = true;
  }
  if (def.onTakeTagsWhenUntagged) {
    card.onTakeTagsWhenUntagged = structuredClone(def.onTakeTagsWhenUntagged);
  }
  if (def.connectionBasicTrashAdditionalCostTrashHq) {
    card.connectionBasicTrashAdditionalCostTrashHq = true;
  }
  if (def.onEncounterEndIfRezzedThisTurn) {
    card.onEncounterEndIfRezzedThisTurn = structuredClone(
      def.onEncounterEndIfRezzedThisTurn,
    );
  }
  if (def.onEncounterEnd) {
    card.onEncounterEnd = structuredClone(def.onEncounterEnd);
  }
  if (def.onEncounterEndIfNotFullyBroken) {
    card.onEncounterEndIfNotFullyBroken = structuredClone(
      def.onEncounterEndIfNotFullyBroken,
    );
  }
  if (def.onEncounterEndIfBroke) {
    card.onEncounterEndIfBroke = structuredClone(def.onEncounterEndIfBroke);
  }
  if (def.onAfterOperationOrExpendable) {
    card.onAfterOperationOrExpendable = structuredClone(
      def.onAfterOperationOrExpendable,
    );
  }
  if (def.creditsOnFirstRdTrashThisTurn !== undefined) {
    card.creditsOnFirstRdTrashThisTurn = def.creditsOnFirstRdTrashThisTurn;
  }
  if (def.onFirstPassRezzedCodeGateOrSentryThisTurn) {
    card.onFirstPassRezzedCodeGateOrSentryThisTurn = structuredClone(
      def.onFirstPassRezzedCodeGateOrSentryThisTurn,
    );
  }
  if (def.onFirstCoreDamageThisTurn) {
    card.onFirstCoreDamageThisTurn = structuredClone(
      def.onFirstCoreDamageThisTurn,
    );
  }
  if (def.onSufferCoreDamage) {
    card.onSufferCoreDamage = structuredClone(def.onSufferCoreDamage);
  }
  if (def.onHostFullyBrokenThisEncounter) {
    card.onHostFullyBrokenThisEncounter = structuredClone(
      def.onHostFullyBrokenThisEncounter,
    );
  }
  if (def.onInstallProgramFromHeap) {
    card.onInstallProgramFromHeap = structuredClone(
      def.onInstallProgramFromHeap,
    );
  }
  if (def.onFirstRdRunBeginThisTurn) {
    card.onFirstRdRunBeginThisTurn = structuredClone(
      def.onFirstRdRunBeginThisTurn,
    );
  }
  if (def.onFirstArchivesRunBeginThisTurn) {
    card.onFirstArchivesRunBeginThisTurn = structuredClone(
      def.onFirstArchivesRunBeginThisTurn,
    );
  }
  if (def.onFirstRunBeginThisTurn) {
    card.onFirstRunBeginThisTurn = structuredClone(def.onFirstRunBeginThisTurn);
  }
  if (def.maxRemoteServers !== undefined) {
    card.maxRemoteServers = def.maxRemoteServers;
  }
  if (def.loseClickOnProtectingIceEncounterEndIfBroke) {
    card.loseClickOnProtectingIceEncounterEndIfBroke = true;
  }
  if (def.cannotRunRemotesUntilCentralRunThisTurn) {
    card.cannotRunRemotesUntilCentralRunThisTurn = true;
  }
  if (def.removeVirusOrTrashOnEncounterEndIfBroke) {
    card.removeVirusOrTrashOnEncounterEndIfBroke = true;
  }
  if (typeof def.corpGainsCreditsOnEncounterEndIfBroke === "number") {
    card.corpGainsCreditsOnEncounterEndIfBroke =
      def.corpGainsCreditsOnEncounterEndIfBroke;
  }
  if (typeof def.strengthPenaltyPerGripCard === "number") {
    card.strengthPenaltyPerGripCard = def.strengthPenaltyPerGripCard;
  }
  if (typeof def.gainCreditsOnEachBadPublicityTake === "number") {
    card.gainCreditsOnEachBadPublicityTake =
      def.gainCreditsOnEachBadPublicityTake;
  }
  if (typeof def.corpLosesCreditsOnCreateServer === "number") {
    card.corpLosesCreditsOnCreateServer = def.corpLosesCreditsOnCreateServer;
  }
  if (def.hostNonAiIcebreaker) card.hostNonAiIcebreaker = true;
  if (def.hostedIcebreakerMemoryDoesNotCount) {
    card.hostedIcebreakerMemoryDoesNotCount = true;
  }
  if (typeof def.hostsAnyProgramMemoryCostLte === "number") {
    card.hostsAnyProgramMemoryCostLte = def.hostsAnyProgramMemoryCostLte;
  }
  if (def.hostsBioroidIceIgnoreInstallCost) {
    card.hostsBioroidIceIgnoreInstallCost = true;
  }
  if (def.preventSubroutineBreakOnBioroidByTrash) {
    card.preventSubroutineBreakOnBioroidByTrash = true;
  }
  if (def.playOrInstallDiscountByTrashingGripOncePerTurn !== undefined) {
    card.playOrInstallDiscountByTrashingGripOncePerTurn =
      def.playOrInstallDiscountByTrashingGripOncePerTurn;
  }
  if (def.gainCreditsOnFirstRunnerClickSpendThisTurn !== undefined) {
    card.gainCreditsOnFirstRunnerClickSpendThisTurn =
      def.gainCreditsOnFirstRunnerClickSpendThisTurn;
  }
  if (def.refundCreditsIfRunBeginsOnThisServerDuringClickAction !== undefined) {
    card.refundCreditsIfRunBeginsOnThisServerDuringClickAction =
      def.refundCreditsIfRunBeginsOnThisServerDuringClickAction;
  }
  if (def.onFirstRunnerClickSpendOrLoseDuringRun) {
    card.onFirstRunnerClickSpendOrLoseDuringRun = structuredClone(
      def.onFirstRunnerClickSpendOrLoseDuringRun,
    );
  }
  if (def.trashHostIfAllSubsBrokenThisEncounter) {
    card.trashHostIfAllSubsBrokenThisEncounter = true;
  }
  if (def.additionalRunInitiateCredits) {
    card.additionalRunInitiateCredits = {
      ...def.additionalRunInitiateCredits,
    };
  }
  if (def.additionalRunInitiatePerPowerCounter) {
    card.additionalRunInitiatePerPowerCounter = {
      ...def.additionalRunInitiatePerPowerCounter,
    };
  }
  if (def.additionalRunInitiateClicks !== undefined) {
    card.additionalRunInitiateClicks = def.additionalRunInitiateClicks;
  }
  if (def.rezSpendCreditsForPowerCounters) {
    card.rezSpendCreditsForPowerCounters = {
      max: def.rezSpendCreditsForPowerCounters.max,
    };
  }
  if (def.vacheronStealReplacement) card.vacheronStealReplacement = true;
  if (def.worthZeroAgendaPointsWhileHasAgendaCounters) {
    card.worthZeroAgendaPointsWhileHasAgendaCounters = true;
  }
  if (def.onFirstHardwareUseDuringRunEachTurn) {
    card.onFirstHardwareUseDuringRunEachTurn = structuredClone(
      def.onFirstHardwareUseDuringRunEachTurn,
    );
  }
  if (def.onCorpAbilityCausesRunnerSpendOrLoseCreditsDuringRun) {
    card.onCorpAbilityCausesRunnerSpendOrLoseCreditsDuringRun = structuredClone(
      def.onCorpAbilityCausesRunnerSpendOrLoseCreditsDuringRun,
    );
  }
  if (def.onFirstRemoteInstallThisTurn) {
    card.onFirstRemoteInstallThisTurn = structuredClone(
      def.onFirstRemoteInstallThisTurn,
    );
  }
  if (def.whileScoredBreakerStrengthPenaltyIfIceDerezzedThisRun !== undefined) {
    card.whileScoredBreakerStrengthPenaltyIfIceDerezzedThisRun =
      def.whileScoredBreakerStrengthPenaltyIfIceDerezzedThisRun;
  }
  if (def.onFirstVirusInstallThisTurn) {
    card.onFirstVirusInstallThisTurn = structuredClone(
      def.onFirstVirusInstallThisTurn,
    );
  }
  if (def.onVirusProgramInstall) {
    card.onVirusProgramInstall = structuredClone(def.onVirusProgramInstall);
  }
  if (def.onFirstCorpCardInstallEachTurn) {
    card.onFirstCorpCardInstallEachTurn = structuredClone(
      def.onFirstCorpCardInstallEachTurn,
    );
  }
  if (def.onFirstSuccessfulMarkRunThisTurn) {
    card.onFirstSuccessfulMarkRunThisTurn = structuredClone(
      def.onFirstSuccessfulMarkRunThisTurn,
    );
  }
  if (def.onFirstSuccessfulHqRunThisTurn) {
    card.onFirstSuccessfulHqRunThisTurn = structuredClone(
      def.onFirstSuccessfulHqRunThisTurn,
    );
  }
  if (def.onFirstSuccessfulHqOrRdRunThisTurn) {
    card.onFirstSuccessfulHqOrRdRunThisTurn = structuredClone(
      def.onFirstSuccessfulHqOrRdRunThisTurn,
    );
  }
  if (def.onFirstSuccessfulCentralRunThisTurn) {
    card.onFirstSuccessfulCentralRunThisTurn = structuredClone(
      def.onFirstSuccessfulCentralRunThisTurn,
    );
  }
  if (def.onFirstSuccessfulRunThisTurn) {
    card.onFirstSuccessfulRunThisTurn = structuredClone(
      def.onFirstSuccessfulRunThisTurn,
    );
  }
  if (def.onFirstUnsuccessfulRunThisTurn) {
    card.onFirstUnsuccessfulRunThisTurn = structuredClone(
      def.onFirstUnsuccessfulRunThisTurn,
    );
  }
  if (def.loseCreditsOnFirstAdvertisementRezThisTurn !== undefined) {
    card.loseCreditsOnFirstAdvertisementRezThisTurn =
      def.loseCreditsOnFirstAdvertisementRezThisTurn;
  }
  if (def.onFirstEventTrashedThisTurn) {
    card.onFirstEventTrashedThisTurn = structuredClone(
      def.onFirstEventTrashedThisTurn,
    );
  }
  if (def.icebreakerInstallStrengthBonusThisTurn !== undefined) {
    card.icebreakerInstallStrengthBonusThisTurn = {
      ...def.icebreakerInstallStrengthBonusThisTurn,
    };
  }
  if (def.onFirstInstallInThisServerRootThisTurn) {
    card.onFirstInstallInThisServerRootThisTurn = structuredClone(
      def.onFirstInstallInThisServerRootThisTurn,
    );
  }
  if (def.additionalTagsDuringOutermostIceEncounter !== undefined) {
    card.additionalTagsDuringOutermostIceEncounter =
      def.additionalTagsDuringOutermostIceEncounter;
  }
  if (def.onProgramOrHardwareInstall) {
    card.onProgramOrHardwareInstall = structuredClone(
      def.onProgramOrHardwareInstall,
    );
  }
  if (def.onHardwareInstallOrTrash) {
    card.onHardwareInstallOrTrash = structuredClone(
      def.onHardwareInstallOrTrash,
    );
  }
  if (def.onHardwareInstall) {
    card.onHardwareInstall = structuredClone(def.onHardwareInstall);
  }
  if (def.onPowerCountersGte) {
    card.onPowerCountersGte = {
      amount: def.onPowerCountersGte.amount,
      effect: structuredClone(def.onPowerCountersGte.effect),
    };
  }
  if (def.onHostedCreditsGte) {
    card.onHostedCreditsGte = {
      amount: def.onHostedCreditsGte.amount,
      effect: structuredClone(def.onHostedCreditsGte.effect),
    };
  }
  if (def.onAgendaScored) {
    card.onAgendaScored = structuredClone(def.onAgendaScored);
  }
  if (def.onAgendaScoredOrStolen) {
    card.onAgendaScoredOrStolen = structuredClone(def.onAgendaScoredOrStolen);
  }
  if (def.onAgendaAccessedOrScored) {
    card.onAgendaAccessedOrScored = structuredClone(
      def.onAgendaAccessedOrScored,
    );
  }
  if (def.onAgendaAddedToRunnerScore) {
    card.onAgendaAddedToRunnerScore = structuredClone(
      def.onAgendaAddedToRunnerScore,
    );
  }
  if (def.onScoreTurnEnd) {
    card.onScoreTurnEnd = structuredClone(def.onScoreTurnEnd);
  }
  if (def.onAccessWhileInstalled) {
    card.onAccessWhileInstalled = structuredClone(def.onAccessWhileInstalled);
  }
  if (def.onAccessWhileUninstalled) {
    card.onAccessWhileUninstalled = structuredClone(
      def.onAccessWhileUninstalled,
    );
  }
  if (def.onAccessNotFromRd) {
    card.onAccessNotFromRd = structuredClone(def.onAccessNotFromRd);
  }
  if (def.onCorpDrawCard) {
    card.onCorpDrawCard = structuredClone(def.onCorpDrawCard);
  }
  if (def.onExposeWhileInstalled) {
    card.onExposeWhileInstalled = structuredClone(def.onExposeWhileInstalled);
  }
  if (def.onFirstAdvancementOnServerThisTurn) {
    card.onFirstAdvancementOnServerThisTurn = structuredClone(
      def.onFirstAdvancementOnServerThisTurn,
    );
  }
  if (def.onTurnBeginIfNoRunnerSuccessfulRunLastTurn) {
    card.onTurnBeginIfNoRunnerSuccessfulRunLastTurn = structuredClone(
      def.onTurnBeginIfNoRunnerSuccessfulRunLastTurn,
    );
  }
  if (def.onPsiCreditsRevealed) {
    card.onPsiCreditsRevealed = structuredClone(def.onPsiCreditsRevealed);
  }
  if (def.onAgendaStolen) {
    card.onAgendaStolen = structuredClone(def.onAgendaStolen);
  }
  if (def.onPassRezzedIceProtectingThisServer) {
    card.onPassRezzedIceProtectingThisServer = structuredClone(
      def.onPassRezzedIceProtectingThisServer,
    );
  }
  if (def.onOtherAgendaStolen) {
    card.onOtherAgendaStolen = structuredClone(def.onOtherAgendaStolen);
  }
  if (def.onFullyBreakOncePerTurn) {
    card.onFullyBreakOncePerTurn = structuredClone(def.onFullyBreakOncePerTurn);
  }
  if (def.onFullyBreak) {
    card.onFullyBreak = structuredClone(def.onFullyBreak);
  }
  if (def.hostedCreditsOnRunEventPlay !== undefined) {
    card.hostedCreditsOnRunEventPlay = def.hostedCreditsOnRunEventPlay;
  }
  if (def.hostedCreditsOnFirstEventPlayOncePerTurn !== undefined) {
    card.hostedCreditsOnFirstEventPlayOncePerTurn =
      def.hostedCreditsOnFirstEventPlayOncePerTurn;
  }
  if (def.spendHostedCreditsDuringRuns !== undefined) {
    card.spendHostedCreditsDuringRuns = def.spendHostedCreditsDuringRuns;
  }
  if (def.spendHostedCreditsToUseProgramsDuringRuns !== undefined) {
    card.spendHostedCreditsToUseProgramsDuringRuns =
      def.spendHostedCreditsToUseProgramsDuringRuns;
  }
  if (def.remainderOfTurnOnInstallPrintedCostGte) {
    card.remainderOfTurnOnInstallPrintedCostGte = {
      min: def.remainderOfTurnOnInstallPrintedCostGte.min,
      effect: structuredClone(
        def.remainderOfTurnOnInstallPrintedCostGte.effect,
      ),
    };
  }
  if (def.firstEncounterGainsSubroutine) {
    card.firstEncounterGainsSubroutine = {
      text: def.firstEncounterGainsSubroutine.text,
      effect: structuredClone(def.firstEncounterGainsSubroutine.effect),
    };
  }
  if (def.mayTakeTagForBonusAccessOnHqRdBreach !== undefined) {
    card.mayTakeTagForBonusAccessOnHqRdBreach =
      def.mayTakeTagForBonusAccessOnHqRdBreach;
  }
  if (def.maySwapOutermostIceOnPassAfterFullyBreakOncePerTurn !== undefined) {
    card.maySwapOutermostIceOnPassAfterFullyBreakOncePerTurn =
      def.maySwapOutermostIceOnPassAfterFullyBreakOncePerTurn;
  }
  if (def.creditsOnFirstAdvanceThisTurn !== undefined) {
    card.creditsOnFirstAdvanceThisTurn = def.creditsOnFirstAdvanceThisTurn;
  }
  if (def.onSuccessfulRunOtherServerOncePerTurn) {
    card.onSuccessfulRunOtherServerOncePerTurn = structuredClone(
      def.onSuccessfulRunOtherServerOncePerTurn,
    );
  }
  if (def.onSuccessfulRunEndOncePerTurn) {
    card.onSuccessfulRunEndOncePerTurn = structuredClone(
      def.onSuccessfulRunEndOncePerTurn,
    );
  }
  if (def.onSuccessfulRunEnd) {
    card.onSuccessfulRunEnd = structuredClone(def.onSuccessfulRunEnd);
  }
  if (def.onSpendCreditsOutsidePoolDuringRunOncePerTurn) {
    card.onSpendCreditsOutsidePoolDuringRunOncePerTurn = structuredClone(
      def.onSpendCreditsOutsidePoolDuringRunOncePerTurn,
    );
  }
  if (def.onFirstBadPublicityTakeEachTurn) {
    card.onFirstBadPublicityTakeEachTurn = structuredClone(
      def.onFirstBadPublicityTakeEachTurn,
    );
  }
  if (def.onArchivesFacedownTurnedFaceupGte) {
    card.onArchivesFacedownTurnedFaceupGte = structuredClone(
      def.onArchivesFacedownTurnedFaceupGte,
    );
  }
  if (def.powerCounterOnAgendaScoredOrStolenFromThisServer !== undefined) {
    card.powerCounterOnAgendaScoredOrStolenFromThisServer =
      def.powerCounterOnAgendaScoredOrStolenFromThisServer;
  }
  if (def.onBreachHqRdIfNoBreaksOncePerTurnMayBonusAccess !== undefined) {
    card.onBreachHqRdIfNoBreaksOncePerTurnMayBonusAccess =
      def.onBreachHqRdIfNoBreaksOncePerTurnMayBonusAccess;
  }
  if (def.onBreachRdIfAccessGteMayBonusAccess) {
    card.onBreachRdIfAccessGteMayBonusAccess = {
      ...def.onBreachRdIfAccessGteMayBonusAccess,
    };
  }
  if (def.onRemoveTags) {
    card.onRemoveTags = structuredClone(def.onRemoveTags);
  }
  if (def.onFirstAvoidOrRemoveTagThisTurn) {
    card.onFirstAvoidOrRemoveTagThisTurn = structuredClone(
      def.onFirstAvoidOrRemoveTagThisTurn,
    );
  }
  if (def.onAgendaScoredFromThisServer) {
    card.onAgendaScoredFromThisServer = structuredClone(
      def.onAgendaScoredFromThisServer,
    );
  }
  if (def.onFirstSuccessfulRunOnRdEndsThisTurn) {
    card.onFirstSuccessfulRunOnRdEndsThisTurn = structuredClone(
      def.onFirstSuccessfulRunOnRdEndsThisTurn,
    );
  }
  if (def.onFirstProgramOrHardwareTrashEachTurn) {
    card.onFirstProgramOrHardwareTrashEachTurn = structuredClone(
      def.onFirstProgramOrHardwareTrashEachTurn,
    );
  }
  if (def.onFirstAccessTrashEachTurn) {
    card.onFirstAccessTrashEachTurn = structuredClone(
      def.onFirstAccessTrashEachTurn,
    );
  }
  if (def.onRunnerTurnEnd) {
    card.onRunnerTurnEnd = structuredClone(def.onRunnerTurnEnd);
  }
  if (def.onFirstIceRezEachTurn) {
    card.onFirstIceRezEachTurn = structuredClone(def.onFirstIceRezEachTurn);
  }
  if (def.onSuccessfulRunOnThisServer) {
    card.onSuccessfulRunOnThisServer = structuredClone(
      def.onSuccessfulRunOnThisServer,
    );
  }
  if (def.onRunnerTurnBegin) {
    card.onRunnerTurnBegin = structuredClone(def.onRunnerTurnBegin);
  }
  if (def.onEachCorpBadPublicityTake) {
    card.onEachCorpBadPublicityTake = structuredClone(
      def.onEachCorpBadPublicityTake,
    );
  }
  if (def.onCorpTurnBeginIfRunnerUntagged) {
    card.onCorpTurnBeginIfRunnerUntagged = structuredClone(
      def.onCorpTurnBeginIfRunnerUntagged,
    );
  }
  if (def.onTurnBeginIfCorpNoBadPublicity) {
    card.onTurnBeginIfCorpNoBadPublicity = structuredClone(
      def.onTurnBeginIfCorpNoBadPublicity,
    );
  }
  if (def.onPowerCountersEmpty) {
    card.onPowerCountersEmpty = structuredClone(def.onPowerCountersEmpty);
  }
  if (def.ignoreAdditionalCostFirstDoubleEventEachTurn !== undefined) {
    card.ignoreAdditionalCostFirstDoubleEventEachTurn =
      def.ignoreAdditionalCostFirstDoubleEventEachTurn;
  }
  if (def.strengthBonusIfOutermostOnServer !== undefined) {
    card.strengthBonusIfOutermostOnServer =
      def.strengthBonusIfOutermostOnServer;
  }
  if (def.onFirstGripOrStackTrashBatchEachTurn) {
    card.onFirstGripOrStackTrashBatchEachTurn = structuredClone(
      def.onFirstGripOrStackTrashBatchEachTurn,
    );
  }
  if (def.onStealAgenda) {
    card.onStealAgenda = structuredClone(def.onStealAgenda);
  }
  if (def.onFirstResourcePaidAbilityEachTurn) {
    card.onFirstResourcePaidAbilityEachTurn = structuredClone(
      def.onFirstResourcePaidAbilityEachTurn,
    );
  }
  if (def.powerCounterOnAnyCardRez !== undefined) {
    card.powerCounterOnAnyCardRez = def.powerCounterOnAnyCardRez;
  }
  if (def.powerCounterOnAnyCorpInstall !== undefined) {
    card.powerCounterOnAnyCorpInstall = def.powerCounterOnAnyCorpInstall;
  }
  if (def.powerCountersOnPlay !== undefined) {
    card.powerCountersOnPlay = def.powerCountersOnPlay;
  }
  if (def.prevention) card.prevention = { ...def.prevention };
  if (def.bryanStinsonPlayArchivesTransactionWhileRunnerLt6c) {
    card.bryanStinsonPlayArchivesTransactionWhileRunnerLt6c = true;
    const bryanAb: import("../state/types/abilities.js").PaidAbility = {
      id: "bryan-stinson-play-tx",
      label:
        "[click]: Play a transaction from Archives, ignoring all costs; RFG it",
      clickCost: 1,
      creditCost: 0,
      cost: { clicks: 1 },
      windows: ["corp_action_paw"],
      effect: {
        op: "do",
        action: { kind: "play_archives_transaction" },
      },
    };
    card.paidAbilities = [...(card.paidAbilities ?? []), bryanAb];
  }
}
