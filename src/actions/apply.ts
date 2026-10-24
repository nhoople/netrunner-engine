import { chooseSubroutinePosition } from "../effects/lunarUpPrimitives.js";
import { chooseSparedSubroutine } from "../effects/spinHapPrimitives.js";
import { chooseNextSubroutineToResolve } from "../timing/subroutineOrder.js";
import { activePlayer, cloneState, log } from "../state/createGame.js";
import { runnerWinsOnEmptyRnd } from "../state/emptyRnd.js";
import { startingHandSizeFor } from "../state/startingHand.js";
import {
  currentWindow,
  effectiveIceStrength,
  runnerTrashCostForCard,
} from "../cards/stubs.js";
import {
  enhancedLoginProtocolClick,
  sumRunnerFirstRunAdditionalCost,
} from "../state/currents.js";
import { firstClickMustBlocks, firstClickMustIsActive } from "../state/firstClickMust.js";
import { basicDrawBonus, remoteRootAccessTax } from "../state/staticFlags.js";
import { trashCorpCardToArchives } from "../effects/corpTrash.js";
import { onTagsRemoved, resolveDeclaration } from "../state/cardDeclarations.js";
import {
  declareRootEntry,
  resolveRestrictionChoice,
  withCostCheckpoint,
} from "../legality/checkpoints.js";
import { nestPriorityAfterAbility } from "../legality/priority.js";
import { legalActions as queryLegalActions } from "../legality/query.js";
import {
  evalEffect,
  fireHostRezStateTriggers,
  payPendingSwapContinuation,
  resumeExclusiveChoicesIfPending,
  resumeExposeUpTo,
  resumePendingEffectContinuation,
} from "../effects/eval.js";
import {
  abilityCost,
  canPayCost,
  costBeginsWithClick,
  payCost,
  operationAndEventPlayCostIncreaseTotal,
  releaseSetAsideHostedCards,
  returnSetAsideAdvancements,
  basicTrashResourceCreditCost,
  runnerCreditsFor,
  spendRunnerCreditsFor,
  subtractRunnerCreditPool,
} from "../state/costs.js";
import {
  acceptPendingDamage,
  preventPendingDamage,
  preventPendingDamageLoseAllClicks,
  resolveChronosFirstNetPick,
} from "../state/damage.js";
import {
  acceptPendingTags,
  conditionalInterruptRequiresActiveAtOpen,
} from "../state/tags.js";
import {
  acceptPendingExpose,
} from "../state/expose.js";
import {
  acceptPendingInstalledTrash,
  triggerPendingTrashInterrupt,
} from "../state/trashPrevent.js";
import { acceptPendingEndTheRun } from "../state/endTheRun.js";
import { purgeVirusCounters } from "../state/trashHooks.js";
import { resolveSabotageAmount } from "../state/msKeywords.js";
import { fireRunnerValTrigger } from "../effects/sansanValHooks.js";
import { noteCorpActionType } from "../state/corpActionHooks.js";
import {
  fireCorpOnTrash,
  moveRunnerCardToHeap,
  noteAccessTrash,
  resolveSkorpiosTrash,
  noteCorpCardAddedToArchives,
  noteFirstCorpCardTrashEachTurn,
  fireMeatDamageWhenRunnerTakesTags,
} from "../state/trashHooks.js";
import { fireTdatdOnAgendaAccessedOrScored } from "../effects/kitaraTdatdPrimitives.js";
import { boostTrace, resolveTrace, spendLink } from "../state/trace.js";
import { psiCorpBid, psiRunnerBid } from "../state/psi.js";
import {
  agendaPointsFor,
  removeCardFromCurrentZone,
} from "../state/scoring.js";
import {
  markAbilityUsed,
  programBannedThisRun,
  wasAbilityUsed,
} from "../state/turn.js";
import { abilitiesSuppressed } from "../state/abilities.js";
import { resolvePendingOnEncounter } from "../state/onEncounter.js";
import { runnerAbilityCarrierIds } from "../state/fenris.js";
import { beginBreachAccess } from "../state/access.js";
import { applyRunAccessRestrictions } from "../state/accessFilter.js";
import { isRunTargetAllowed } from "../state/runLegality.js";
import { modifiersFromStartsRun } from "../state/runStart.js";
import type {
  Action,
  ApplyResult,
  GameState,
  RuleCite,
  Server,
  ServerId,
  Side,
} from "../state/types.js";
import { CR } from "../timing/labels.js";
import {
  resolveDeferredPersistentAmaze,
  resumeRunnerTurnBeginAbilities,
} from "../timing/graph.js";
import { resolveDelayedRunEndOrder } from "../effects/kitaraWinPrimitives.js";
import { installCorp } from "./installCorp.js";
import { chooseBreakerSubtype, chooseInstalledIce, chooseServerOnInstalledCard, installRunner } from "./installRunner.js";
import {
  advanceRunUntilStop,
  finishRunReturnToAction,
  jackOut,
  resolvePortAnsonProgramTrash,
  startRun,
} from "./run.js";
import {
  breakBioroidSubroutine,
  breakBioroidSubroutines,
  breakSubroutine,
  finalizePendingSubroutineBreak,
  resolveTyrsHandRezDuringBreakInterrupt,
} from "./breakSubroutine.js";
import { spendClick } from "./spendClick.js";
import { advanceCard, scoreAgendaAction } from "./score.js";
import {
  applyPatchworkDiscount,
  continuePlayedOperation,
  playEvent,
  playOperation,
  notePlayEffectComplete,
  settleDeferredPlayedEvent,
  settleDeferredTerminalOperation,
} from "./play.js";
import { rezAsset, rezIce, forfeitSpecificAgenda } from "./rez.js";
import {
  findPaidAbility,
  resolveGeistAfterTrashCost,
  usePaidAbility,
} from "./paidAbility.js";
import {
  advanceFromMidAccess,
  carnivoreAvailable,
  completeAccessAndContinue,
  completeStealAgenda,
  enterStealAgendaOrComplete,
  findCupellationHost,
  findHeliamphora,
  heliamphoraHostInsteadAvailable,
  hostCorpCardFaceupOn,
  payStealAdditionalCosts,
  stealAdditionalCosts,
  stealAdditionalCreditsForAgenda,
  stealNetOrMeatPrevented,
} from "./access.js";
import { finishPendingDraw } from "../effects/draw.js";
import { discardPhase, drawN, drawOne, passWindow } from "./phase.js";
import {
  actionAllowedHere,
  afterBasicAction,
  autoWalk,
  enterStep,
  getStep,
  resolveAndAdvance,
} from "../timing/machine.js";

function fail(error: string, cites: RuleCite[]): ApplyResult {
  return { ok: false, error, cites };
}

function ok(state: GameState): ApplyResult {
  return { ok: true, state };
}


/** Patchwork: trash 1 from grip for a once-per-turn play/install discount. */

function shuffleInPlace(arr: string[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

function openingMulliganSide(state: GameState): Side | null {
  if (state.timingKey === "opening.corpMulligan") return "corp";
  if (state.timingKey === "opening.runnerMulligan") return "runner";
  return null;
}

/** CR 1.6.6a — keep the already-dealt starting hand and advance. */
function keepStartingHand(state: GameState): ApplyResult {
  const side = openingMulliganSide(state);
  if (!side) {
    return fail("keep_starting_hand is only legal during opening mulligan.", [
      CR.mulligan,
    ]);
  }
  const who = side === "corp" ? "Corp" : "Runner";
  log(state, `${who} keeps their starting hand`);
  resolveAndAdvance(state);
  return ok(state);
}

/**
 * CR 1.6.6a — shuffle starting hand into deck, draw a new starting hand,
 * then advance. Second hand cannot be mulliganed.
 */
function takeMulligan(state: GameState): ApplyResult {
  const side = openingMulliganSide(state);
  if (!side) {
    return fail("mulligan is only legal during opening mulligan.", [CR.mulligan]);
  }
  const p = side === "corp" ? state.corp : state.runner;
  const deckZone = side === "corp" ? "corp:rd" : "runner:stack";
  const handZone = side === "corp" ? "corp:hq" : "runner:grip";

  for (const id of p.hand) {
    const card = state.cards[id];
    card.zone = deckZone;
    if (side === "corp") card.faceup = false;
  }
  p.deck.push(...p.hand);
  p.hand = [];
  shuffleInPlace(p.deck);

  const n = startingHandSizeFor(state.cards[p.identityId]);
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    const top = p.deck.shift();
    if (!top) break;
    drawn += 1;
    p.hand.push(top);
    const card = state.cards[top];
    card.zone = handZone;
    card.faceup = side === "runner";
  }
  if (side === "corp" && drawn < n) {
    runnerWinsOnEmptyRnd(state);
    return ok(state);
  }

  const who = side === "corp" ? "Corp" : "Runner";
  log(state, `${who} takes a mulligan`);
  resolveAndAdvance(state);
  return ok(state);
}

function listServers(state: GameState): Server[] {
  return Object.values(state.servers);
}

function emptyRemoteExists(state: GameState): Server | undefined {
  return listServers(state).find(
    (s) => s.kind === "remote" && s.root.length === 0,
  );
}



function chooseTrashProgram(state: GameState, cardId: string): ApplyResult {
  const pending = state.pendingTrashProgram;
  if (!pending) {
    return fail("No pending trash-program choice.", [CR.trashing]);
  }
  if (!pending.candidates.includes(cardId)) {
    return fail("That card is not a legal trash target.", [CR.trashing]);
  }
  const card = state.cards[cardId];
  if (card.side === "corp") {
    const handIdx = state.corp.hand.indexOf(cardId);
    if (handIdx >= 0) state.corp.hand.splice(handIdx, 1);
    state.corp.discardPile.push(cardId);
    card.zone = "corp:archives";
    card.faceup = true;
  } else {
    const handIdx = state.runner.hand.indexOf(cardId);
    if (handIdx >= 0) state.runner.hand.splice(handIdx, 1);
    const rigIdx = state.runner.installed.indexOf(cardId);
    if (rigIdx >= 0) state.runner.installed.splice(rigIdx, 1);
    state.runner.discardPile.push(cardId);
    card.zone = "runner:heap";
    card.faceup = true;
  }
  state.pendingTrashProgram = null;
  log(
    state,
    `Trashes ${card.title} (CR ${CR.trashing.number}).`,
  );
  // Resume the run graph from the current auto step (resolveSub).
  const step = getStep(state);
  if (step.kind === "auto" || step.kind === "branch") {
    const nextKey =
      typeof step.next === "function" ? step.next(state) : step.next;
    enterStep(state, nextKey);
  }
  const cont = advanceRunUntilStop(state);
  if (!cont.ok) return cont;
  finishRunReturnToAction(cont.state);
  return cont;
}

function resolveSabotageIntent(
  state: GameState,
  hqCardIds: string[],
): ApplyResult {
  const pending = state.pendingSabotage;
  if (!pending) {
    return fail("No pending sabotage.", [CR.sabotage]);
  }
  const r = resolveSabotageAmount(
    state,
    pending.sourceId,
    pending.amount,
    hqCardIds,
  );
  if (!r.ok) return fail(r.error, r.cites);
  state.pendingSabotage = null;
  if (state.pendingChoice || state.pendingTrashProgram || state.pendingDamage) {
    return ok(state);
  }
  if (state.run) {
    const step = getStep(state);
    if (step.kind === "auto" || step.kind === "branch") {
      const nextKey =
        typeof step.next === "function" ? step.next(state) : step.next;
      enterStep(state, nextKey);
    }
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }
  return ok(state);
}

function chooseOption(state: GameState, optionId: string): ApplyResult {
  const pending = state.pendingChoice;
  if (!pending) {
    return fail("No pending choice.", [CR.paidAbility]);
  }
  if (pending.loopCount && optionId.startsWith("loop-times:")) {
    const times = Number(optionId.slice("loop-times:".length));
    if (!Number.isInteger(times) || times < 0) {
      return fail("Choose how many times the loop resolves.", [CR.mandatoryLoop]);
    }
    state.pendingChoice = null;
    log(
      state,
      `The loop resolves ${times} time(s), then ends (CR ${CR.mandatoryLoop.number}).`,
    );
    return ok(state);
  }
  if (optionId.startsWith("decl:") || optionId.startsWith("bribery-x:") || optionId.startsWith("install-x:")) {
    state.pendingChoice = null;
    if (optionId.startsWith("bribery-x:")) {
      const x = Number(optionId.slice("bribery-x:".length));
      const cardId = state.turn.briberyCardId ?? pending.sourceId;
      state.turn.briberyCardId = cardId;
      state.turn.briberyX = x;
      return playEvent(state, cardId);
    }
    if (optionId.startsWith("install-x:")) {
      const x = Number(optionId.slice("install-x:".length));
      state.turn.installCostX = x;
      state.turn.installCostXCardId = pending.sourceId;
      const destination = state.turn.installCostXDestination ?? { kind: "installed" };
      state.turn.installCostXDestination = undefined;
      return installRunner(state, pending.sourceId, destination);
    }
    if (optionId.startsWith("decl:bazaar:")) {
      const cardId = optionId.slice("decl:bazaar:".length);
      return installRunner(state, cardId, { kind: "installed" });
    }
    if (optionId.startsWith("decl:deep:")) {
      const installedId = optionId.split(":")[3];
      const installed = installedId ? state.cards[installedId] : undefined;
      const ability = installed?.paidAbilities?.find(
        (candidate) => (candidate.cost?.clicks ?? candidate.clickCost ?? 0) > 0,
      );
      if (!installedId || !ability) return ok(state);
      state.turn.deepRedAbility = { cardId: installedId, abilityId: ability.id };
      return usePaidAbility(state, installedId, ability.id);
    }
    const outcome = resolveDeclaration(state, optionId);
    if (outcome === "jackout") return jackOut(state);
    return ok(state);
  }
  if (optionId.startsWith("anson:")) {
    const cardId = optionId.slice("anson:".length);
    if (!cardId) {
      return fail("Choose an installed program to trash.", [
        CR.jackingOut,
        CR.trashing,
      ]);
    }
    state.pendingChoice = null;
    return resolvePortAnsonProgramTrash(state, cardId);
  }
  if (optionId.startsWith("chronos:")) {
    const cardId = optionId.slice("chronos:".length);
    if (!cardId) {
      return fail("Choose the first card for this net damage.", [
        CR.sequentialDamageSelection,
      ]);
    }
    state.pendingChoice = null;
    resolveChronosFirstNetPick(state, cardId);
    return ok(state);
  }
  if (optionId.startsWith("diwan:")) {
    const serverId = optionId.slice("diwan:".length);
    if (!serverId || !pending.options.some((option) => option.id === optionId)) {
      return fail("Choose a server.", [CR.runnerBasicInstall]);
    }
    state.pendingChoice = null;
    chooseServerOnInstalledCard(state, pending.sourceId, serverId);
    return ok(state);
  }
  if (optionId.startsWith("subtype:")) {
    const subtype = optionId.slice("subtype:".length);
    if (!subtype || !pending.options.some((option) => option.id === optionId)) {
      return fail("Choose barrier, code gate, or sentry.", [CR.runnerBasicInstall]);
    }
    state.pendingChoice = null;
    chooseBreakerSubtype(state, pending.sourceId, subtype);
    return ok(state);
  }
  if (optionId.startsWith("chosen-ice:")) {
    const iceId = optionId.slice("chosen-ice:".length);
    if (!iceId || !pending.options.some((option) => option.id === optionId)) {
      return fail("Choose an installed piece of ice.", [CR.runnerBasicInstall]);
    }
    state.pendingChoice = null;
    chooseInstalledIce(state, pending.sourceId, iceId);
    return ok(state);
  }
  if (optionId.startsWith("restrict:")) {
    if (!pending.options.some((option) => option.id === optionId)) {
      return fail("Choose a set to trash.", [CR.checkpointCardRestrictions]);
    }
    state.pendingChoice = null;
    resolveRestrictionChoice(state, optionId);
    return ok(state);
  }
  if (optionId.startsWith("root-access:")) {
    const rest = optionId.slice("root-access:".length);
    const sep = rest.indexOf(":");
    const decision = rest.slice(0, sep);
    const cardId = rest.slice(sep + 1);
    if ((decision !== "yes" && decision !== "no") || !cardId) {
      return fail("Choose whether the card becomes a candidate.", [
        CR.checkpointCardEnteringRoot,
      ]);
    }
    state.pendingChoice = null;
    declareRootEntry(state, decision, cardId);
    return ok(state);
  }
  const option = pending.options.find((o) => o.id === optionId);
  if (!option) {
    return fail("Unknown choice option.", [CR.paidAbility]);
  }
  const sourceId = pending.sourceId;
  state.pendingChoice = null;
  if (state.run) state.run.pendingJackOutOffer = false;
  if (optionId === "st-decline" || optionId.startsWith("st-server:")) {
    const card = state.cards[sourceId];
    if (card?.securityTesting) {
      if (optionId === "st-decline") {
        card.namedServerId = undefined;
        log(
          state,
          `${card.title} — no server chosen this turn (CR ${CR.lingeringChoiceTurn.number}).`,
        );
      } else {
        const serverId = optionId.slice("st-server:".length);
        card.namedServerId = serverId as ServerId;
        log(
          state,
          `${card.title} — choose ${serverId} until this turn ends (CR ${CR.lingeringChoiceTurn.number}).`,
        );
      }
    }
    return ok(state);
  }

  if (optionId === "must-trash:pay" || optionId === "must-trash:imp") {
    const cardId = state.run?.accessingCardId;
    if (!cardId) {
      return fail("No card is being accessed.", [CR.trashing]);
    }
    return applyAction(state, {
      type: optionId === "must-trash:pay" ? "trash_accessed" : "access_trash_with_virus",
      cardId,
    });
  }

  if (optionId === "first-run-cost:pay" || optionId === "first-run-cost:decline") {
    const serverId = state.turn.pendingFirstRunServerId;
    state.turn.pendingFirstRunServerId = undefined;
    if (optionId === "first-run-cost:decline") {
      state.turn.firstClickMustSatisfied = true;
      log(
        state,
        `Declined the additional cost — the first click can be spent on another action (CR ${CR.mustNotForceAdditionalCost.number}).`,
      );
      return ok(state);
    }
    if (!serverId) {
      return fail("No run is waiting on the additional cost.", [CR.runnerBasicRun]);
    }
    state.turn.payingFirstRunAdditionalCost = true;
    return applyAction(state, { type: "basic_run", serverId });
  }

  if (optionId.startsWith("play-cost-x:")) {
    const cardId = state.pendingPlayCostXCardId;
    state.pendingPlayCostXCardId = null;
    if (!cardId) {
      return fail("No play cost of X is waiting.", [CR.playCostX]);
    }
    const chosenX = Number(optionId.slice("play-cost-x:".length));
    const increase = operationAndEventPlayCostIncreaseTotal(state);
    if (
      !Number.isInteger(chosenX) ||
      chosenX < 0 ||
      state.corp.credits < chosenX + increase
    ) {
      return fail("Illegal value of X.", [CR.playCostX]);
    }
    return continuePlayedOperation(state, cardId, chosenX + increase, chosenX);
  }

  if (optionId.startsWith("forfeit-agenda:")) {
    const agendaId = optionId.slice("forfeit-agenda:".length);
    const op = state.cards[sourceId];
    if (!op?.playAdditionalCostForfeitAgenda) {
      return fail("No agenda forfeit is waiting.", [CR.playOperation]);
    }
    if (
      !state.corp.scoreArea.includes(agendaId) ||
      state.cards[agendaId]?.cannotForfeit
    ) {
      return fail("That agenda cannot be forfeited.", [CR.playOperation]);
    }
    forfeitSpecificAgenda(state, agendaId);
    const increase = operationAndEventPlayCostIncreaseTotal(state);
    const cost = (op.playCost ?? 0) + increase;
    return continuePlayedOperation(state, sourceId, cost);
  }

  if (optionId === "subcontract-done" || optionId.startsWith("subcontract-play:")) {
    if (optionId.startsWith("subcontract-play:")) {
      const cardId = optionId.slice("subcontract-play:".length);
      state.turn.ftmSubcontractRemaining = Math.max(
        0,
        (state.turn.ftmSubcontractRemaining ?? 1) - 1,
      );
      const played = playOperation(state, cardId, { fromAbility: true });
      if (!played.ok) return played;
      if (state.pendingChoice) return ok(state);
    }
    const remaining = state.turn.ftmSubcontractRemaining ?? 0;
    const more = state.corp.hand.filter(
      (id) => state.cards[id]?.type === "operation",
    );
    if (optionId !== "subcontract-done" && remaining > 0 && more.length > 0) {
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          ...more.map((id) => ({
            id: `subcontract-play:${id}`,
            label: `Play ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "corp" as const,
                amount: 0,
              },
            },
          })),
          {
            id: "subcontract-done",
            label: "Done playing operations",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "corp" as const,
                amount: 0,
              },
            },
          },
        ],
      };
      return ok(state);
    }
    notePlayEffectComplete(state);
    if (state.deferAfterBasicAction) {
      state.deferAfterBasicAction = false;
      afterBasicAction(state);
    }
    return ok(state);
  }

  // Trieste: option id forbid-runner-break:<iceId>
  if (optionId.startsWith("forbid-runner-break:")) {
    const iceId = optionId.slice("forbid-runner-break:".length);
    const ice = state.cards[iceId];
    if (ice) {
      ice.cannotBreakWithRunnerCardAbilities = true;
      log(
        state,
        `Choose ${ice.title} — Runner card abilities cannot break its subroutines.`,
      );
    }
    if (state.deferAfterBasicAction) {
      state.deferAfterBasicAction = false;
      afterBasicAction(state);
    }
    return ok(state);
  }

  if (optionId.startsWith("immolation-replace:")) {
    const cardId = optionId.slice("immolation-replace:".length);
    if (!state.run) return fail("No breach in progress.", [CR.breach]);
    const chosen = state.cards[cardId];
    const copyId = Object.values(state.servers)
      .flatMap((server) => server.ice)
      .find((id) => {
        const ice = state.cards[id];
        return Boolean(ice?.rezzed && chosen && ice.title === chosen.title && id !== cardId);
      });
    if (copyId) trashCorpCardToArchives(state, copyId);
    const at = state.run.accessCandidates.indexOf(cardId);
    if (at >= 0) state.run.accessCandidates.splice(at, 1);
    state.run.immolationScriptAccessReplace = false;
    state.run.pendingImmolationAccessCardId = undefined;
    state.pendingChoice = null;
    log(
      state,
      `${chosen?.title ?? cardId} ceases to be a candidate and was not accessed (CR ${CR.candidatesAlreadyAccessed.number}).`,
    );
    return ok(state);
  }
  if (optionId.startsWith("immolation-access:")) {
    const cardId = optionId.slice("immolation-access:".length);
    if (!state.run) return fail("No breach in progress.", [CR.breach]);
    state.run.immolationScriptAccessReplace = false;
    state.pendingChoice = null;
    return applyAction(state, { type: "access_card", cardId });
  }
  if (optionId.startsWith("archives-rfg:")) {
    const cardId = optionId.slice("archives-rfg:".length);
    if (!state.run) return fail("No breach in progress.", [CR.breach]);
    const card = state.cards[cardId];
    state.turn.archivesInterfaceUsedThisBreach = true;
    const at = state.run.accessCandidates.indexOf(cardId);
    if (at >= 0) state.run.accessCandidates.splice(at, 1);
    if (card) {
      state.corp.discardPile = state.corp.discardPile.filter((id) => id !== cardId);
      if (!state.removedFromGame.includes(cardId)) state.removedFromGame.push(cardId);
      card.zone = "removed-from-game";
      card.faceup = true;
      log(state, `${card.title} is removed from the game instead of being accessed.`);
    }
    state.pendingChoice = null;
    return ok(state);
  }
  if (optionId.startsWith("archives-access:")) {
    const cardId = optionId.slice("archives-access:".length);
    if (!state.run) return fail("No breach in progress.", [CR.breach]);
    state.run.archivesInterfaceSkippedCardId = cardId;
    state.pendingChoice = null;
    return applyAction(state, { type: "access_card", cardId });
  }
  if (optionId.startsWith("access-tax-pay:")) {
    const cardId = optionId.slice("access-tax-pay:".length);
    if (!state.run) return fail("No breach in progress.", [CR.breach]);
    const card = state.cards[cardId];
    const tax = card ? remoteRootAccessTax(state, card) : 0;
    if (state.runner.credits < tax) {
      return fail("Cannot pay the additional cost to access.", [CR.candidatesAlreadyAccessed]);
    }
    state.runner.credits -= tax;
    state.run.accessTaxPaidFor = cardId;
    state.pendingChoice = null;
    log(state, `Paid ${tax}¢ to access ${card?.title ?? cardId}.`);
    return applyAction(state, { type: "access_card", cardId });
  }
  if (optionId.startsWith("access-tax-decline:")) {
    const cardId = optionId.slice("access-tax-decline:".length);
    if (!state.run) return fail("No breach in progress.", [CR.breach]);
    const at = state.run.accessCandidates.indexOf(cardId);
    if (at >= 0) state.run.accessCandidates.splice(at, 1);
    state.pendingChoice = null;
    log(
      state,
      `${state.cards[cardId]?.title ?? cardId} ceases to be a candidate and was not accessed (CR ${CR.candidatesAlreadyAccessed.number}).`,
    );
    return ok(state);
  }

  // Heliamphora: host Archives card instead of accessing, or proceed to access.
  if (optionId.startsWith("heliamphora-host:")) {
    const cardId = optionId.slice("heliamphora-host:".length);
    if (!state.run) return fail("No run for Heliamphora.", [CR.breach]);
    const heliId = sourceId;
    if (!state.run.accessCandidates.includes(cardId) && !state.corp.discardPile.includes(cardId)) {
      // Still allow if only in discard (candidate list may lag).
    }
    const idx = state.run.accessCandidates.indexOf(cardId);
    if (idx >= 0) state.run.accessCandidates.splice(idx, 1);
    if (state.run.randomAccessLimit !== null) {
      state.run.randomAccessLimit = Math.max(0, state.run.randomAccessLimit - 1);
    }
    hostCorpCardFaceupOn(state, heliId, cardId);
    state.run.heliamphoraHostInsteadUsedThisBreach = true;
    state.run.pendingHeliamphoraAccessCardId = undefined;
    log(state, `Chose "${option.label}" on ${state.cards[heliId]?.title ?? heliId}.`);
    enterStep(state, "breach.access");
    autoWalk(state);
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }
  if (optionId.startsWith("heliamphora-access:")) {
    const cardId = optionId.slice("heliamphora-access:".length);
    if (!state.run) return fail("No run for Heliamphora.", [CR.breach]);
    state.run.pendingHeliamphoraAccessCardId = cardId; // sentinel: skip re-offer
    // Mark so access_card won't re-offer: clear availability by setting used? No —
    // decline does not consume the once-per-breach. Use pending flag: access_card
    // skips offer when pendingHeliamphoraAccessCardId is already set to this card.
    log(state, `Chose "${option.label}" on ${state.cards[sourceId]?.title ?? sourceId}.`);
    return applyAction(state, { type: "access_card", cardId });
  }

  const exclusive = state.pendingExclusiveChoices;
  const isExclusivePick =
    exclusive !== null &&
    exclusive.options.some((o) => o.id === optionId);
  if (isExclusivePick && exclusive) {
    if (!exclusive.usedIds.includes(optionId)) {
      exclusive.usedIds.push(optionId);
      exclusive.remaining = Math.max(0, exclusive.remaining - 1);
    }
  }

  // Positional swap ids are `swap-${iceA}-${iceB}`. Other swap- prefixes,
  // such as Thimblerig's swap-ice:, carry their own effect (CR 8.8.3a).
  const allIce: string[] = [];
  for (const server of Object.values(state.servers)) {
    allIce.push(...server.ice);
  }
  let swapA: string | undefined;
  let swapB: string | undefined;
  for (const x of allIce) {
    for (const y of allIce) {
      if (x !== y && optionId === `swap-${x}-${y}`) {
        swapA = x;
        swapB = y;
      }
    }
  }
  if (swapA && swapB) {
    swapIcePositions(state, swapA, swapB);
    log(
      state,
      `Swap ${state.cards[swapA].title} with ${state.cards[swapB].title}.`,
    );
  } else if (
    state.cards[sourceId]?.mayRezIceIgnoringCostsOnScoreOrSteal ||
    state.cards[optionId]?.type === "ice"
  ) {
    if (optionId !== "decline" && state.cards[optionId]?.type === "ice") {
      const ice = state.cards[optionId];
      ice.rezzed = true;
      ice.faceup = true;
      log(state, `Rez ${ice.title} ignoring all costs.`);
      if (ice.onRez) {
        const r = evalEffect({ state, sourceId: optionId }, ice.onRez);
        if (!r.ok) return fail(r.error, r.cites);
      }
      fireHostRezStateTriggers(state, optionId, "rez");
    }
  } else if (
    state.cards[sourceId]?.mayInstallOnScoreOrSteal ||
    (optionId !== "decline" &&
      state.runner.hand.includes(optionId) &&
      ["program", "hardware", "resource"].includes(
        state.cards[optionId]?.type ?? "",
      ))
  ) {
    if (optionId !== "decline" && state.runner.hand.includes(optionId)) {
      const installed = installRunner(state, optionId);
      if (!installed.ok) return installed;
    }
  } else if (optionId === "zahya-gain" || optionId === "zahya-decline") {
    // The gain is applied after the choice is logged.
  } else if (optionId.startsWith("delayed-run-end:") && state.run) {
    state.run.delayedRunEndChoice = optionId;
  } else if (
    optionId.startsWith("skorpios-rfg:") ||
    optionId.startsWith("skorpios-heap:")
  ) {
    // Destination is applied after the choice is logged.
  } else if (optionId.startsWith("resolve-next:")) {
    const index = Number(optionId.slice("resolve-next:".length));
    const ordered = chooseNextSubroutineToResolve(state, index);
    if (!ordered.ok) return fail(ordered.error, ordered.cites);
    log(
      state,
      `Chose "${option.label}" on ${state.cards[sourceId]?.title ?? sourceId}.`,
    );
    if (state.pendingChoice) return ok(state);
    autoWalk(state);
    if (state.run) {
      const cont = advanceRunUntilStop(state);
      if (!cont.ok) return cont;
      finishRunReturnToAction(cont.state);
      return cont;
    }
    return ok(state);
  } else if (optionId.startsWith("spare-sub:")) {
    const index = Number(optionId.slice("spare-sub:".length));
    const spared = chooseSparedSubroutine(state, index, sourceId);
    if (!spared.ok) return fail(spared.error, spared.cites);
  } else if (optionId.startsWith("grail-at:")) {
    const index = Number(optionId.slice("grail-at:".length));
    if (!Number.isInteger(index)) {
      return fail("Choose a position for the subroutine.", [
        CR.subroutineOrderChoice,
      ]);
    }
    chooseSubroutinePosition(state, index);
  } else if (optionId.startsWith("247:")) {
    const agendaId = optionId.slice("247:".length);
    const agenda = state.cards[agendaId];
    if (!agenda || !state.corp.scoreArea.includes(agendaId)) {
      return fail("That agenda is not scored.", [
        CR.whenScoredAdditionalRequirement,
      ]);
    }
    if (agenda.onScoreIfRunnerTaggedPlaceAgendaCounter) {
      if ((state.runner.tags ?? 0) <= 0) {
        log(
          state,
          `${agenda.title}'s when-scored ability cannot resolve; Runner is not tagged (CR ${CR.whenScoredAdditionalRequirement.number}).`,
        );
      } else {
        agenda.agendaCounters = (agenda.agendaCounters ?? 0) + 1;
        log(
          state,
          `${agenda.title}'s when-scored ability resolves; place 1 agenda counter → ${agenda.agendaCounters} (CR ${CR.whenScoredAdditionalRequirement.number}).`,
        );
      }
    } else if (agenda.onScore) {
      const r = evalEffect({ state, sourceId: agendaId }, agenda.onScore);
      if (!r.ok) return fail(r.error, r.cites);
    }
  } else {
    const r = evalEffect(
      {
        state,
        sourceId,
        runnerSuffers: /^suffer\b/i.test(option.label),
      },
      option.effect,
    );
    if (!r.ok) return fail(r.error, r.cites);
  }

  if (
    state.turn.deferredPersistentAmaze &&
    !state.pendingStartRun &&
    !state.pendingChoice
  ) {
    resolveDeferredPersistentAmaze(state);
  }

  const hiddenLook =
    optionId.startsWith("cultivate-") || optionId.startsWith("rd-arrange:");
  const sourceTitle = state.cards[sourceId]?.title ?? sourceId;
  log(
    state,
    hiddenLook
      ? `Chose on ${sourceTitle}.`
      : `Chose "${option.label}" on ${sourceTitle}.`,
  );
  if (
    state.turn.pendingZahyaRunEnd &&
    (optionId === "zahya-gain" || optionId === "zahya-decline")
  ) {
    const pending = state.turn.pendingZahyaRunEnd;
    state.turn.pendingZahyaRunEnd = undefined;
    const title = state.cards[sourceId]?.title ?? sourceId;
    if (optionId === "zahya-gain") {
      state.runner.credits += pending.credits;
      state.turn.zahyaRunEndUsed = true;
      log(
        state,
        `${title} — gain ${pending.credits}¢ (${pending.credits} access(es) on ${pending.serverId}).`,
      );
    } else {
      log(
        state,
        `${title}'s ability was not used (CR ${CR.oncePerTurnFlag.number}).`,
      );
    }
    if (state.timingKey === "run.ends") {
      const nextKey = state.run?.isPostRunBreach
        ? "breach.begin"
        : "runner.actionPaw";
      enterStep(state, nextKey);
      autoWalk(state);
      if (
        state.pendingChoice ||
        state.pendingTrashProgram ||
        state.pendingSabotage ||
        state.pendingDamage ||
        state.trace ||
        state.psi
      ) {
        return ok(state);
      }
      if (state.run) {
        const cont = advanceRunUntilStop(state);
        if (!cont.ok) return cont;
        finishRunReturnToAction(cont.state);
        return cont;
      }
      return ok(state);
    }
  }
  const encounter = state.run?.encounter;
  if (
    encounter?.onEncounterPending &&
    !state.pendingChoice &&
    (state.cards[sourceId]?.chosenIceId === encounter.iceId ||
      state.cards[sourceId]?.paidAbilities?.some(
        (ability) => ability.id === "security-nexus-trace",
      ))
  ) {
    resolvePendingOnEncounter(state);
  }
  if (
    state.turn.pendingSkorpiosTrash &&
    (optionId.startsWith("skorpios-rfg:") || optionId.startsWith("skorpios-heap:"))
  ) {
    resolveSkorpiosTrash(state, optionId);
  }
  if (state.run?.delayedRunEndChoice && state.timingKey === "run.ends") {
    const choice = state.run.delayedRunEndChoice;
    state.run.delayedRunEndChoice = undefined;
    resolveDelayedRunEndOrder(state, choice);
    autoWalk(state);
    if (
      state.pendingChoice ||
      state.pendingTrashProgram ||
      state.pendingSabotage ||
      state.pendingDamage ||
      state.trace ||
      state.psi
    ) {
      return ok(state);
    }
    const continued = advanceRunUntilStop(state);
    if (!continued.ok) return continued;
    finishRunReturnToAction(continued.state);
    return continued;
  }
  if (
    state.run?.runnerCannotSpendCredits &&
    !state.pendingChoice &&
    !state.pendingDamage
  ) {
    state.run.runnerCannotSpendCredits = false;
  }
  if (
    state.pendingTrashProgram ||
    state.pendingChoice ||
    state.pendingSabotage ||
    state.pendingDamage
  ) {
    return ok(state);
  }
  releaseSetAsideHostedCards(state);
  returnSetAsideAdvancements(state);
  if (
    state.pendingTrashProgram ||
    state.pendingChoice ||
    state.pendingSabotage ||
    state.pendingDamage ||
    state.done
  ) {
    return ok(state);
  }

  // Ganked!-class: mid-access forced encounter — divert to approachIce.
  if (
    state.run?.reencounterIceId &&
    state.run.resumeAccessAfterReencounter &&
    state.run.accessingCardId
  ) {
    const iceId = state.run.reencounterIceId;
    const server = state.servers[state.run.attackedServerId];
    const pos = server?.ice.indexOf(iceId) ?? -1;
    if (pos >= 0) {
      state.run.position = pos;
      state.run.reencounterIceId = undefined;
      enterStep(state, "run.approachIce");
      autoWalk(state);
      const cont = advanceRunUntilStop(state);
      if (!cont.ok) return cont;
      finishRunReturnToAction(cont.state);
      return cont;
    }
    if (state.cards[iceId]?.type === "ice") {
      state.run.forceEncounterIceId = iceId;
      state.run.reencounterIceId = undefined;
      enterStep(state, "run.approachIce");
      autoWalk(state);
      const cont = advanceRunUntilStop(state);
      if (!cont.ok) return cont;
      finishRunReturnToAction(cont.state);
      return cont;
    }
    state.run.reencounterIceId = undefined;
    state.run.resumeAccessAfterReencounter = false;
  }

  // Konjin-class: nested encounter then resume parent — divert now.
  if (
    state.run?.reencounterIceId &&
    state.run.resumeEncounterIceId &&
    !state.run.resumeAccessAfterReencounter
  ) {
    const iceId = state.run.reencounterIceId;
    state.run.reencounterIceId = undefined;
    const server = state.servers[state.run.attackedServerId];
    const pos = server?.ice.indexOf(iceId) ?? -1;
    if (pos >= 0) {
      state.run.position = pos;
    }
    state.run.forceEncounterIceId = iceId;
    enterStep(state, "run.approachIce");
    autoWalk(state);
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }

  const exclusiveCont = resumeExclusiveChoicesIfPending(state);
  if (!exclusiveCont.ok) {
    return fail(exclusiveCont.error, exclusiveCont.cites);
  }
  if (
    state.pendingTrashProgram ||
    state.pendingChoice ||
    state.pendingSabotage ||
    state.pendingDamage
  ) {
    return ok(state);
  }

  if (state.pendingStartRunOnMark) {
    const mark = state.markServerId;
    const runSrc = state.pendingStartRunOnMark.sourceId;
    state.pendingStartRunOnMark = null;
    state.deferAfterBasicAction = false;
    if (mark && state.servers[mark]) {
      const walked = startRun(state, mark, { runSourceId: runSrc });
      if (!walked.ok) return walked;
      finishRunReturnToAction(walked.state);
      return walked;
    }
    log(state, `Run on mark declined — mark missing.`);
  }

  if (state.pendingStartRun) {
    const pending = state.pendingStartRun;
    state.pendingStartRun = null;
    state.deferAfterBasicAction = false;
    if (state.servers[pending.serverId]) {
      const mods: import("../state/runStart.js").RunModifiers = {
        runSourceId: pending.sourceId,
      };
      if (pending.bypassFirstEncounterForClicks !== undefined) {
        mods.bypassFirstEncounterForClicks =
          pending.bypassFirstEncounterForClicks;
      }
      if (pending.bonusAccess !== undefined) {
        mods.bonusAccess = pending.bonusAccess;
      }
      if (pending.skipBreach) {
        mods.skipBreach = true;
      }
      if (pending.onSuccessfulRunEffect) {
        mods.onSuccessfulRunEffect = pending.onSuccessfulRunEffect;
      }
      if (pending.onRunEndEffect) {
        mods.onRunEndEffect = pending.onRunEndEffect;
      }
      if (pending.hiredHelpAgendaTaxPaid) {
        mods.hiredHelpAgendaTaxPaid = true;
      }
      if (pending.forbidCorpRezIceDuringRun) {
        mods.forbidCorpRezIceDuringRun = true;
      }
      if (pending.rfgFirstNonAgendaAccess) {
        mods.rfgFirstNonAgendaAccess = true;
      }
      if (pending.lastingRfgCopiesOnAccess) {
        mods.lastingRfgCopiesOnAccess = true;
      }
      const walked = startRun(state, pending.serverId as import("../state/types.js").ServerId, mods);
      if (!walked.ok) return walked;
      if (walked.state.turn.ohForcedRunCannotJackOut && walked.state.run) {
        walked.state.run.cannotJackOut = true;
        walked.state.turn.ohForcedRunCannotJackOut = false;
        log(walked.state, `An Offer — Runner cannot jack out this run.`);
      }
      finishRunReturnToAction(walked.state);
      return walked;
    }
    log(state, `Pending run — server ${pending.serverId} missing.`);
  }

  if (state.run?.wakeImplantPending) {
    state.run.wakeImplantPending = false;
    state.run.wakeImplantResolved = true;
    beginBreachAccess(state);
    if (state.pendingChoice) return ok(state);
    autoWalk(state);
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }

  if (state.run?.mercuryBreachPending) {
    state.run.mercuryBreachPending = false;
    beginBreachAccess(state);
    if (state.pendingChoice) return ok(state);
    autoWalk(state);
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }

  if (state.run?.mediumBreachPending) {
    state.run.mediumBreachPending = false;
    beginBreachAccess(state);
    if (state.pendingChoice) return ok(state);
    autoWalk(state);
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }

  if (state.run?.cupellationBreachPending) {
    state.run.cupellationBreachPending = false;
    beginBreachAccess(state);
    if (state.pendingChoice) return ok(state);
    autoWalk(state);
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }

  if (state.run?.onBreachRdPending) {
    state.run.onBreachRdPending = false;
    beginBreachAccess(state);
    if (state.pendingChoice || state.psi) return ok(state);
    autoWalk(state);
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }

  if (state.pendingRunEventStart) {
    const pending = state.pendingRunEventStart;
    state.pendingRunEventStart = null;
    state.deferAfterBasicAction = false;
    const runCard = state.cards[pending.sourceId];
    const mods = runCard?.runEvent
      ? modifiersFromStartsRun(state, runCard.runEvent, pending.sourceId)
      : { runSourceId: pending.sourceId };
    const hosted = runCard?.hostedCredits ?? 0;
    if (hosted > 0) {
      mods.eventCredits = (mods.eventCredits ?? 0) + hosted;
      runCard!.hostedCredits = 0;
    }
    if (state.servers[pending.serverId]) {
      state.playedRunEventId = pending.sourceId;
      const title = state.cards[pending.sourceId]?.title;
      if (title) {
        log(
          state,
          `${title} remains in the play area for this run (CR ${CR.playingTimingStructure.number}).`,
        );
      }
      const walked = startRun(state, pending.serverId, mods);
      if (!walked.ok) return walked;
      finishRunReturnToAction(walked.state);
      return walked;
    }
    log(state, `Deferred run event — server missing.`);
  }

  if (state.pendingStealAgendaId) {
    const agendaId = state.pendingStealAgendaId;
    state.pendingStealAgendaId = null;
    const resumed = completeStealAgenda(state, { cardId: agendaId });
    if (!resumed.ok) return resumed;
    if (
      state.pendingChoice ||
      state.pendingTrashProgram ||
      state.pendingSabotage ||
      state.pendingDamage
    ) {
      return resumed;
    }
  }

  if (state.pendingTrashAccessedCardId) {
    const cardId = state.pendingTrashAccessedCardId;
    state.pendingTrashAccessedCardId = null;
    const trashed = applyAction(state, { type: "trash_accessed", cardId });
    return trashed;
  }

  // Resume scoring after scoreAdditionalCost (Azef must_trash).
  if (state.pendingScoreAgendaId) {
    if (
      state.pendingChoice ||
      state.pendingDamage ||
      state.pendingTrashProgram
    ) {
      return ok(state);
    }
    const agendaId = state.pendingScoreAgendaId;
    const scored = scoreAgendaAction(state, agendaId);
    if (!scored.ok) return scored;
    if (
      state.pendingTrashProgram ||
      state.pendingChoice ||
      state.pendingSabotage ||
      state.pendingDamage
    ) {
      return scored;
    }
  }

  // Resume rez after rezAdditionalCost (Valentão).
  if (state.pendingRezCardId) {
    const rezId = state.pendingRezCardId;
    const rezCard = state.cards[rezId];
    if (rezCard?.type === "ice") {
      const rezzed = rezIce(state, rezId);
      if (!rezzed.ok) return rezzed;
      if (
        state.pendingTrashProgram ||
        state.pendingChoice ||
        state.pendingSabotage ||
        state.pendingDamage
      ) {
        return rezzed;
      }
    }
  }

  // The rest of a seq that paused on this choice (Cell Portal derez after
  // the jack-out offer) resolves before the timing chart moves on.
  resumePendingEffectContinuation(state);
  if (
    state.pendingChoice ||
    state.pendingDamage ||
    state.pendingTags ||
    state.pendingTrashProgram ||
    state.pendingSabotage ||
    state.trace ||
    state.psi
  ) {
    return ok(state);
  }

  if (state.run) {
    // ETR from jack-out offer
    if (state.run.endedTheRun) {
      enterStep(state, "run.closePriorityWindows");
    } else {
      const step = getStep(state);
      if (step.kind === "auto" || step.kind === "branch") {
        const nextKey =
          typeof step.next === "function" ? step.next(state) : step.next;
        enterStep(state, nextKey);
      }
    }
    if (
      state.run.accessingCardId &&
      (state.timingKey === "access.midAccess" ||
        state.timingKey === "access.cardAccessed" ||
        state.timingKey === "access.stealAgenda")
    ) {
      autoWalk(state);
      return advanceFromMidAccess(state);
    }
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }

  // Resume a seq that paused when this choice window opened.
  resumePendingEffectContinuation(state);
  payPendingSwapContinuation(state);
  if (
    state.pendingTrashProgram ||
    state.pendingChoice ||
    state.pendingSabotage ||
    state.pendingDamage ||
    state.pendingTags ||
    state.trace ||
    state.psi
  ) {
    return ok(state);
  }

  if (state.pendingStandaloneBreach) {
    const pending = state.pendingStandaloneBreach;
    state.pendingStandaloneBreach = null;
    const sid = pending.serverId;
    if (state.servers[sid]) {
      log(state, `Standalone breach of ${sid} begins (CR ${CR.breach.number}).`);
      state.run = {
        attackedServerId: sid,
        phase: "breach",
        position: null,
        successful: null,
        accessedCardIds: [],
        accessCandidates: [],
        randomAccessLimit: null,
        encounter: null,
        endedTheRun: false,
        cannotJackOut: false,
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
        accessingCardId: null,
        isPostRunBreach: true,
        runSourceId: pending.sourceId,
        ...(pending.cannotAccessRoot ? { cannotAccessRoot: true } : {}),
      };
      enterStep(state, "breach.begin");
      beginBreachAccess(state);
      if (state.pendingChoice) return ok(state);
      autoWalk(state);
      const cont = advanceRunUntilStop(state);
      if (!cont.ok) return cont;
      finishRunReturnToAction(cont.state);
      return cont;
    }
  }

  if (state.pendingStandaloneCardAccess) {
    const pending = state.pendingStandaloneCardAccess;
    state.pendingStandaloneCardAccess = null;
    const sid = pending.serverId;
    const card = state.cards[pending.cardId];
    if (state.servers[sid] && card) {
      log(
        state,
        `Standalone access of ${card.title} on ${sid} begins (CR ${CR.cardAccessed.number}).`,
      );
      state.run = {
        attackedServerId: sid,
        phase: "breach",
        position: null,
        successful: null,
        accessedCardIds: [],
        accessCandidates: [pending.cardId],
        randomAccessLimit: 1,
        encounter: null,
        endedTheRun: false,
        cannotJackOut: false,
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
        accessingCardId: null,
        isPostRunBreach: true,
        accessCandidatesPreset: true,
        runSourceId: pending.sourceId,
      };
      enterStep(state, "breach.begin");
      beginBreachAccess(state);
      if (state.pendingChoice) return ok(state);
      autoWalk(state);
      const cont = advanceRunUntilStop(state);
      if (!cont.ok) return cont;
      finishRunReturnToAction(cont.state);
      return cont;
    }
  }

  finishPendingDraw(state);
  if (!state.pendingChoice) resumeExposeUpTo(state);
  if (!state.pendingChoice) resumeRunnerTurnBeginAbilities(state);
  if (!state.pendingChoice) settleDeferredPlayedEvent(state);
  if (!state.pendingChoice) settleDeferredTerminalOperation(state);
  if (state.pendingChoice) return ok(state);
  if (state.deferAfterBasicAction) {
    state.deferAfterBasicAction = false;
    afterBasicAction(state);
  }
  return ok(state);
}

function swapIcePositions(state: GameState, a: string, b: string): void {
  let serverA: Server | null = null;
  let idxA = -1;
  let serverB: Server | null = null;
  let idxB = -1;
  for (const server of Object.values(state.servers)) {
    const ia = server.ice.indexOf(a);
    const ib = server.ice.indexOf(b);
    if (ia >= 0) {
      serverA = server;
      idxA = ia;
    }
    if (ib >= 0) {
      serverB = server;
      idxB = ib;
    }
  }
  if (!serverA || !serverB || idxA < 0 || idxB < 0) return;
  serverA.ice[idxA] = b;
  serverB.ice[idxB] = a;
  state.cards[a].zone = `server:${serverB.id}:ice`;
  state.cards[b].zone = `server:${serverA.id}:ice`;
}



function useIdentityAbility(state: GameState, abilityId: string): ApplyResult {
  const idCard =
    state.cards[
      state.activeSide === "corp"
        ? state.corp.identityId
        : state.runner.identityId
    ];
  if (!idCard) return fail("No identity.", [CR.identityAbility]);
  const ability = findPaidAbility(idCard, abilityId);
  if (!ability) {
    return fail("Unknown identity ability.", [CR.identityAbility]);
  }
  const window = currentWindow(state.timingKey);
  // CR 5.2.1: a cost that begins with a click is an action. Anything else
  // on an identity is a paid ability (CR 9.2.7b).
  const atTake =
    state.timingKey === "corp.takeAction" ||
    state.timingKey === "runner.takeAction";
  const clickAction = costBeginsWithClick(ability);
  if (clickAction && !atTake) {
    return fail(
      "A paid ability whose cost begins with a click is an action (CR 5.2.1).",
      [CR.actionPhase, CR.basicActions],
    );
  }
  if (!clickAction && atTake) {
    return fail("This identity ability is used in a paid ability window.", [
      CR.identityAbility,
    ]);
  }
  if (!atTake && (!window || !ability.windows.includes(window))) {
    return fail("Identity ability not usable now.", [CR.identityAbility]);
  }
  const cost = abilityCost(ability, state, idCard);
  if (!canPayCost(state, idCard.side, cost, idCard)) {
    return fail("Cannot pay identity ability cost.", [CR.identityAbility]);
  }
  payCost(state, idCard.side, cost, `identity:${abilityId}`, idCard);
  resolveGeistAfterTrashCost(state, idCard, cost);
  const applied = evalEffect(
    { state, sourceId: idCard.id, payerSide: idCard.side },
    ability.effect,
  );
  if (!applied.ok) return fail(applied.error, applied.cites);
  log(
    state,
    `${idCard.side} uses identity ability ${ability.label} (CR ${CR.identityAbility.number}).`,
  );
  if (atTake && (cost.clicks ?? 0) > 0) {
    afterBasicAction(state);
  } else if (window) {
    nestPriorityAfterAbility(state, `identity:${abilityId}`);
  }
  return ok(state);
}

/** Pure action apply: returns a new state or a cited legality error. */
export function applyAction(state: GameState, action: Action): ApplyResult {
  const next = cloneState(state);
  if (next.done && action.type !== "pass_window") {
    return fail("Game marked done.", []);
  }
  if (firstClickMustBlocks(next, action)) {
    return fail(
      "The first click must be spent to make a run or play a run event.",
      [CR.mustNotForceAdditionalCost],
    );
  }

  // Trace / damage interrupts take precedence
  if (next.trace) {
    switch (action.type) {
      case "boost_trace": {
        const err = boostTrace(next, action.credits);
        if (err) return fail(err, [CR.trace]);
        return ok(next);
      }
      case "spend_link": {
        const err = spendLink(next, action.amount);
        if (err) return fail(err, [CR.trace]);
        return ok(next);
      }
      case "resolve_trace": {
        const r = resolveTrace(next);
        if (!r.ok) return fail(r.error, [CR.trace]);
        return ok(next);
      }
      case "use_paid_ability": {
        return usePaidAbility(
          next,
          action.cardId,
          action.abilityId,
          action.serverId,
        );
      }
      default:
        return fail("Trace in progress — boost, spend link, or resolve.", [
          CR.trace,
        ]);
    }
  }

  if (next.psi) {
    switch (action.type) {
      case "psi_runner_bid": {
        const err = psiRunnerBid(next, action.amount);
        if (err) return fail(err, [CR.trace]);
        return ok(next);
      }
      case "psi_corp_bid": {
        const err = psiCorpBid(next, action.amount);
        if (err) return fail(err, [CR.trace]);
        // Resume R&D breach after onBreachRd psi (Akiko Nisei).
        if (next.run?.onBreachRdPending) {
          next.run.onBreachRdPending = false;
          beginBreachAccess(next);
          if (next.pendingChoice || next.psi) return ok(next);
          autoWalk(next);
          const cont = advanceRunUntilStop(next);
          if (!cont.ok) return cont;
          finishRunReturnToAction(cont.state);
          return cont;
        }
        // Resume auto-walk if psi paused an auto/branch step (Letheia).
        if (
          next.pendingChoice ||
          next.pendingTrashProgram ||
          next.pendingSabotage ||
          next.pendingDamage ||
          next.trace ||
          next.psi
        ) {
          return ok(next);
        }
        autoWalk(next);
        if (next.run) {
          const cont = advanceRunUntilStop(next);
          if (!cont.ok) return cont;
          finishRunReturnToAction(cont.state);
          return cont;
        }
        return ok(next);
      }
      default:
        return fail("Psi game in progress — Runner then Corp must bid.", [
          CR.trace,
        ]);
    }
  }

  if (next.pendingExpose && next.pendingExpose.phase === "interrupt") {
    if (action.type === "use_paid_ability") {
      const paid = usePaidAbility(
        next,
        action.cardId,
        action.abilityId,
        action.serverId,
      );
      if (!paid.ok) return paid;
      if (next.pendingExpose) return ok(next);
      resumePendingEffectContinuation(next);
      return ok(next);
    }
    if (action.type === "accept_expose") {
      acceptPendingExpose(next);
      resumeExposeUpTo(next);
      resumePendingEffectContinuation(next);
      return ok(next);
    }
    return fail("Pending expose — prevent or accept.", [CR.expose]);
  }

  if (next.pendingTrashPrevent) {
    // Dummy Box-class: paid interrupt may open a grip-trash choice; allow it
    // while the installed-trash interrupt is still open (CR 1.2.1).
    if (action.type === "choose_option" && next.pendingChoice) {
      const chosen = chooseOption(next, action.optionId);
      if (!chosen.ok) return chosen;
      if (!next.pendingTrashPrevent) resumePendingEffectContinuation(next);
      return chosen;
    }
    if (action.type === "use_paid_ability") {
      const paid = usePaidAbility(
        next,
        action.cardId,
        action.abilityId,
        action.serverId,
      );
      if (!paid.ok) return paid;
      if (next.pendingTrashPrevent) return ok(next);
      resumePendingEffectContinuation(next);
      return ok(next);
    }
    if (action.type === "trigger_pending_trash_interrupt") {
      const triggered = triggerPendingTrashInterrupt(next, action.cardId);
      if (!triggered.ok) return fail(triggered.error, triggered.cites);
      resumePendingEffectContinuation(next);
      return ok(next);
    }
    if (action.type === "accept_installed_trash") {
      acceptPendingInstalledTrash(next, moveRunnerCardToHeap);
      resumePendingEffectContinuation(next);
      return ok(next);
    }
    return fail("Pending installed trash — prevent or accept.", [CR.trashing]);
  }

  if (next.pendingTags) {
    if (action.type === "choose_option" && next.pendingChoice) {
      return chooseOption(next, action.optionId);
    }
    if (action.type === "use_paid_ability") {
      const bornDuringWindow = Boolean(
        next.pendingTags.activeAtOpen &&
          !next.pendingTags.activeAtOpen.includes(action.cardId),
      );
      if (
        bornDuringWindow &&
        conditionalInterruptRequiresActiveAtOpen(action.abilityId)
      ) {
        const title = next.cards[action.cardId]?.title ?? action.cardId;
        return fail(
          `${title} was not active when the interrupt window opened, so its ability is not pending.`,
          [CR.conditionalInterruptStillRelevant],
        );
      }
      const paid = usePaidAbility(
        next,
        action.cardId,
        action.abilityId,
        action.serverId,
      );
      if (!paid.ok) return paid;
      if (bornDuringWindow) {
        log(
          next,
          `${next.cards[action.cardId]?.title ?? action.cardId} was not active when the interrupt window opened and can still be used (CR ${CR.paidInterruptNeedNotBeActiveAtOpen.number}).`,
        );
      }
      if (next.pendingTags) return ok(next);
      resumePendingEffectContinuation(next);
      return ok(next);
    }
    if (action.type === "accept_tags") {
      const taken = acceptPendingTags(next);
      if (taken > 0) fireMeatDamageWhenRunnerTakesTags(next);
      resumePendingEffectContinuation(next);
      return ok(next);
    }
    return fail("Pending tags — avoid or accept.", [CR.tags]);
  }

  if (next.pendingEndTheRun) {
    if (action.type === "use_paid_ability") {
      const paid = usePaidAbility(
        next,
        action.cardId,
        action.abilityId,
        action.serverId,
      );
      if (!paid.ok) return paid;
      if (next.pendingEndTheRun) return ok(next);
      resumePendingEffectContinuation(next);
      return ok(next);
    }
    if (action.type === "accept_end_the_run") {
      acceptPendingEndTheRun(next);
      resumePendingEffectContinuation(next);
      return ok(next);
    }
    return fail("Pending end the run — prevent or accept.", [CR.endTheRun]);
  }

  if (next.pendingSubroutineBreak) {
    if (action.type === "rez_asset") {
      return resolveTyrsHandRezDuringBreakInterrupt(next, action.cardId);
    }
    if (action.type === "use_paid_ability") {
      const paid = usePaidAbility(
        next,
        action.cardId,
        action.abilityId,
        action.serverId,
      );
      if (!paid.ok) return paid;
      if (next.pendingSubroutineBreak?.prevented) {
        return finalizePendingSubroutineBreak(next, true);
      }
      return ok(next);
    }
    if (action.type === "pass_window") {
      return finalizePendingSubroutineBreak(next, false);
    }
    return fail(
      "Pending subroutine-break interrupt — rez, use a paid ability, or pass.",
      [CR.encounterBreakPaw],
    );
  }

  if (next.pendingDamage) {
    if (action.type === "use_paid_ability") {
      const paid = usePaidAbility(
        next,
        action.cardId,
        action.abilityId,
        action.serverId,
      );
      if (!paid.ok) return paid;
      if (next.pendingDamage) return ok(next);
      resumePendingEffectContinuation(next);
      if (
        next.run?.accessingCardId &&
        (next.timingKey === "access.cardAccessed" ||
          next.timingKey === "access.midAccess")
      ) {
        autoWalk(next);
        return advanceFromMidAccess(next);
      }
      return ok(next);
    }
    switch (action.type) {
      case "prevent_damage":
        preventPendingDamage(next, action.amount);
        break;
      case "prevent_damage_lose_all_clicks":
        if (!next.pendingDamage.preventByLoseAllClicks) {
          return fail("Cannot prevent this damage by losing clicks.", [
            CR.preventDamage,
          ]);
        }
        if (next.runner.clicks <= 0) {
          return fail("No clicks remaining to prevent damage.", [
            CR.preventDamage,
          ]);
        }
        preventPendingDamageLoseAllClicks(next);
        break;
      case "accept_damage":
        acceptPendingDamage(next);
        break;
      default:
        return fail("Pending damage — prevent or accept.", [CR.preventDamage]);
    }
    if (next.pendingDamage) return ok(next);
    resumePendingEffectContinuation(next);
    // Resume nested access-a-card walk after onAccess damage interrupt.
    if (
      next.run?.accessingCardId &&
      (next.timingKey === "access.cardAccessed" ||
        next.timingKey === "access.midAccess")
    ) {
      autoWalk(next);
      return advanceFromMidAccess(next);
    }
    return ok(next);
  }

  if (next.pendingTrashProgram) {
    if (action.type === "choose_trash_program") {
      return chooseTrashProgram(next, action.cardId);
    }
    return fail("Pending trash-program choice — Corp must choose a target.", [
      CR.trashing,
    ]);
  }

  if (next.pendingSabotage) {
    if (action.type === "resolve_sabotage") {
      return resolveSabotageIntent(next, action.hqCardIds);
    }
    return fail(
      "Pending sabotage — Corp must resolve_sabotage with HQ card ids.",
      [CR.sabotage, CR.sabotageResolution],
    );
  }

  if (next.pendingChoice) {
    if (action.type === "choose_option") {
      return chooseOption(next, action.optionId);
    }
    return fail(
      `Pending choice for ${next.pendingChoice.chooser} — resolve with choose_option.`,
      [CR.paidAbility],
    );
  }

  switch (action.type) {
    case "pass_window":
      return passWindow(next);

    case "keep_starting_hand":
      return keepStartingHand(next);

    case "mulligan":
      return takeMulligan(next);

    case "continue_run":
      if (next.timingKey !== "run.jackOutWindow") {
        return fail("continue_run is only for the jack-out window.", [
          CR.jackOutMovement,
        ]);
      }
      return passWindow(next);

    case "basic_gain_credit": {
      const gate = actionAllowedHere(next, action.type);
      if (!gate.ok) {
        return fail(
          "Basic actions are only legal at the take-action step.",
          gate.cites,
        );
      }
      const bad = spendClick(next);
      if (bad) return bad;
      const cite =
        next.activeSide === "corp" ? CR.corpBasicCredit : CR.runnerBasicCredit;
      activePlayer(next).credits += 1;
      log(
        next,
        `${next.activeSide} gains 1 credit (CR ${cite.number}, ${CR.gainCredits.number}).`,
      );
      // CPC Generator: first Runner basic gain-credit each turn → Corp gains 1¢.
      if (next.activeSide === "runner" && !next.turn.cpcGeneratorFiredThisTurn) {
        for (const server of Object.values(next.servers)) {
          for (const id of server.root) {
            const c = next.cards[id];
            const gainAmt = c?.rezzed
              ? c.corpGainsOnFirstRunnerBasicGainCreditEachTurn
              : undefined;
            if (typeof gainAmt === "number" && gainAmt > 0) {
              next.corp.credits += gainAmt;
              next.turn.cpcGeneratorFiredThisTurn = true;
              log(
                next,
                `${c!.title} — Corp gains ${gainAmt}¢ (Runner basic gain credit).`,
              );
              break;
            }
          }
          if (next.turn.cpcGeneratorFiredThisTurn) break;
        }
      }
      noteCorpActionType(next, "basic_gain");
      for (const rid of [...next.runner.installed]) {
        const rigCard = next.cards[rid];
        if (!rigCard?.onCorpBasicClickForCreditOrDraw) continue;
        const r = evalEffect(
          { state: next, sourceId: rid },
          rigCard.onCorpBasicClickForCreditOrDraw,
        );
        if (!r.ok) {
          log(
            next,
            `onCorpBasicClickForCreditOrDraw failed on ${rigCard.title}: ${r.error}`,
          );
        }
        if (next.pendingChoice) break;
      }
      afterBasicAction(next);
      return ok(next);
    }

    case "basic_purge_virus": {
      const gate = actionAllowedHere(next, action.type);
      if (!gate.ok) {
        return fail(
          "Purge is only legal at the Corp take-action step.",
          gate.cites,
        );
      }
      if (next.activeSide !== "corp") {
        return fail("Only the Corp purges virus counters.", [
          CR.corpBasicPurge,
          CR.purge,
        ]);
      }
      if (next.corp.clicks < 3) {
        return fail("Purge costs 3 clicks.", [CR.corpBasicPurge, CR.spendClicks]);
      }
      for (let i = 0; i < 3; i++) {
        const bad = spendClick(next);
        if (bad) return bad;
      }
      purgeVirusCounters(next, next.corp.identityId);
      log(
        next,
        `Corp purges virus counters (CR ${CR.corpBasicPurge.number}, ${CR.purge.number}).`,
      );
      noteCorpActionType(next, "basic_purge");
      afterBasicAction(next);
      return ok(next);
    }

    case "basic_remove_tag": {
      const gate = actionAllowedHere(next, action.type);
      if (!gate.ok) {
        return fail(
          "Basic actions are only legal at the take-action step.",
          gate.cites,
        );
      }
      if (next.activeSide !== "runner") {
        return fail("Only the Runner may remove a tag with the basic action.", [
          CR.runnerBasicRemoveTag,
          CR.taggedRemoveTag,
        ]);
      }
      if (next.runner.tags <= 0) {
        return fail("Runner has no tags to remove.", [
          CR.runnerBasicRemoveTag,
          CR.taggedRemoveTag,
          CR.tagged,
        ]);
      }
      const tagCost =
        2 +
        (next.cards[next.corp.identityId]?.basicRemoveTagAdditionalCostCreditsWhileUnflipped &&
        !next.cards[next.corp.identityId]?.identityFlipped
          ? next.cards[next.corp.identityId]!.basicRemoveTagAdditionalCostCreditsWhileUnflipped!
          : 0);
      if (runnerCreditsFor(next, "basic_remove_tag") < tagCost) {
        return fail("Need 2¢ to remove a tag.", [
          CR.runnerBasicRemoveTag,
          CR.taggedRemoveTag,
          CR.costCheckpoint,
        ]);
      }
      const bad = spendClick(next);
      if (bad) return bad;
      withCostCheckpoint(next, "basic_remove_tag", () => {
        spendRunnerCreditsFor(next, tagCost, "basic_remove_tag");
        next.runner.tags -= 1;
        onTagsRemoved(next);
      });
      log(
        next,
        `Runner removes 1 tag for {click}+2¢ → ${next.runner.tags} tag(s) (CR ${CR.runnerBasicRemoveTag.number}, ${CR.taggedRemoveTag.number}).`,
      );
      afterBasicAction(next);
      return ok(next);
    }

    case "basic_draw": {
      const gate = actionAllowedHere(next, action.type);
      if (!gate.ok) {
        return fail(
          "Basic actions are only legal at the take-action step.",
          gate.cites,
        );
      }
      const bad = spendClick(next);
      if (bad) return bad;
      if (next.activeSide === "runner" && next.turn.ccRunnerCannotDraw) {
        return fail("Runner cannot draw (Lockdown).", [CR.drawing]);
      }
      const cite =
        next.activeSide === "corp" ? CR.corpBasicDraw : CR.runnerBasicDraw;
      let drawAmount = 1 + (next.activeSide === "runner" ? basicDrawBonus(next) : 0);
      if (
        next.activeSide === "runner" &&
        next.turn.basicDrawsThisTurn === 0 &&
        next.runner.installed.some(
          (id) => next.cards[id].defId === "verbal-plasticity",
        )
      ) {
        drawAmount = 2;
        log(next, `Verbal Plasticity — first basic draw is 2.`);
      }
      const drewTotal = drawN(next, next.activeSide, drawAmount);
      if (next.winReason === "empty_rd") return ok(next);
      if (drewTotal === 0) {
        return fail("Deck is empty.", [cite, CR.drawing]);
      }
      next.turn.basicDrawsThisTurn += 1;
      log(
        next,
        `${next.activeSide} draws ${drewTotal} (CR ${cite.number}, ${CR.drawing.number}).`,
      );
      if (next.pendingChoice) {
        next.deferAfterBasicAction = true;
        return ok(next);
      }
      if (next.activeSide === "runner") {
        fireRunnerValTrigger(
          next,
          "valBasicClickDrawTriggerCount",
          (c) => c.onFirstBasicClickDrawEachTurn,
          "onFirstBasicClickDrawEachTurn",
        );
      }
      if (next.activeSide === "corp") {
        noteCorpActionType(next, "basic_draw");
        // Corporate Defector: reveal cards drawn with the basic action.
        if (
          next.runner.installed.some(
            (id) => next.cards[id]?.revealCorpBasicActionDraws,
          )
        ) {
          const revealed = next.corp.hand.slice(-drewTotal);
          for (const id of revealed) {
            const c = next.cards[id];
            if (c) {
              log(next, `Corporate Defector — reveal ${c.title}.`);
            }
          }
        }
      }
      if (next.activeSide === "corp") {
        for (const rid of [...next.runner.installed]) {
          const rigCard = next.cards[rid];
          if (!rigCard?.onCorpBasicClickForCreditOrDraw) continue;
          const r = evalEffect(
            { state: next, sourceId: rid },
            rigCard.onCorpBasicClickForCreditOrDraw,
          );
          if (!r.ok) {
            log(
              next,
              `onCorpBasicClickForCreditOrDraw failed on ${rigCard.title}: ${r.error}`,
            );
          }
          if (next.pendingChoice) break;
        }
      }
      afterBasicAction(next);
      return ok(next);
    }

    case "basic_install": {
      const gate = actionAllowedHere(next, action.type);
      if (!gate.ok) {
        return fail(
          "Basic actions are only legal at the take-action step.",
          gate.cites,
        );
      }
      if (next.activeSide === "runner" && next.turn.dtwnRunnerCannotInstall) {
        return fail("Runner cannot install cards for the remainder of the turn (Jua).", [
          CR.runnerBasicInstall,
        ]);
      }
      const bad = spendClick(next);
      if (bad) return bad;
      if (next.activeSide === "runner" && action.trashGripForDiscountCardId) {
        const pw = applyPatchworkDiscount(
          next,
          action.trashGripForDiscountCardId,
          action.cardId,
        );
        if (!pw.ok) return fail(pw.error, [CR.runnerBasicInstall]);
        next.turn.patchworkPendingDiscountThisAction = pw.discount;
      }
      const result =
        next.activeSide === "corp"
          ? installCorp(next, action.cardId, action.destination)
          : action.destination.kind === "installed" ||
              action.destination.kind === "host_ice" ||
              action.destination.kind === "host_card"
            ? installRunner(next, action.cardId, action.destination)
            : fail("Runner installs go to the installed area or a legal host.", [
                CR.runnerBasicInstall,
              ]);
      next.turn.patchworkPendingDiscountThisAction = 0;
      if (!result.ok) return result;
      if (next.activeSide === "corp") {
        noteCorpActionType(result.state, "basic_install");
      }
      afterBasicAction(result.state);
      return result;
    }

    case "basic_trash_resource": {
      const gate = actionAllowedHere(next, action.type);
      if (!gate.ok) {
        return fail(
          "Basic actions are only legal at the take-action step.",
          gate.cites,
        );
      }
      if (next.activeSide !== "corp") {
        return fail("Only the Corp may trash a resource with the basic action.", [
          CR.corpBasicTrashResource,
        ]);
      }
      if (next.runner.tags <= 0) {
        return fail("Runner must be tagged to trash a resource.", [
          CR.corpBasicTrashResource,
          CR.tagged,
        ]);
      }
      const target = next.cards[action.cardId];
      if (
        !target ||
        target.type !== "resource" ||
        !next.runner.installed.includes(action.cardId)
      ) {
        return fail("Not an installed Runner resource.", [
          CR.corpBasicTrashResource,
        ]);
      }
      if (target.corpCannotTrashWhileOtherResourceInstalled) {
        const other = next.runner.installed.some(
          (id) =>
            id !== action.cardId && next.cards[id]?.type === "resource",
        );
        if (other) {
          return fail(
            "Cannot trash this resource while another resource is installed.",
            [CR.corpBasicTrashResource],
          );
        }
      }
      const corpPts = agendaPointsFor(next, "corp");
      const runnerPts = agendaPointsFor(next, "runner");
      const threat = Math.max(corpPts, runnerPts);
      const threatCost = target.threatBasicTrashAdditionalCostTrashHq;
      const connectionCost = runnerAbilityCarrierIds(next).some((cid) => {
        if (abilitiesSuppressed(next, cid)) return false;
        return (
          Boolean(next.cards[cid]?.connectionBasicTrashAdditionalCostTrashHq) &&
          (target.subtypes ?? []).includes("connection")
        );
      });
      if (typeof threatCost === "number" && threat >= threatCost) {
        if (next.corp.hand.length < 1) {
          return fail(
            "Threat additional cost: must trash 1 card from HQ.",
            [CR.corpBasicTrashResource, CR.trashing],
          );
        }
        const hqId = next.corp.hand[next.corp.hand.length - 1]!;
        const hqCard = next.cards[hqId]!;
        next.corp.hand.pop();
        next.corp.discardPile.push(hqId);
        hqCard.zone = "corp:archives";
        hqCard.faceup = true;
        noteCorpCardAddedToArchives(next);
        log(
          next,
          `Threat ${threatCost} — trash ${hqCard.title} from HQ as additional cost.`,
        );
      } else if (connectionCost) {
        if (next.corp.hand.length < 1) {
          return fail(
            "Sebastião: must trash 1 card from HQ to trash a connection.",
            [CR.corpBasicTrashResource, CR.trashing],
          );
        }
        const hqId = next.corp.hand[next.corp.hand.length - 1]!;
        const hqCard = next.cards[hqId]!;
        next.corp.hand.pop();
        next.corp.discardPile.push(hqId);
        hqCard.zone = "corp:archives";
        hqCard.faceup = true;
        noteCorpCardAddedToArchives(next);
        log(
          next,
          `Sebastião — trash ${hqCard.title} from HQ as additional cost.`,
        );
      }
      // Wireless Net Pavilion: additional credit cost to basic trash resource.
      {
        let extra = 0;
        for (const rid of next.runner.installed) {
          const c = next.cards[rid];
          if (typeof c?.basicTrashResourceAdditionalCostCredits === "number") {
            extra = Math.max(extra, c.basicTrashResourceAdditionalCostCredits);
          }
        }
        if (extra > 0) {
          if (next.corp.credits < extra) {
            return fail(
              `Wireless Net Pavilion — must pay ${extra}¢ additional cost.`,
              [CR.corpBasicTrashResource],
            );
          }
          next.corp.credits -= extra;
          log(
            next,
            `Wireless Net Pavilion — pay ${extra}¢ additional cost → ${next.corp.credits}¢.`,
          );
        }
      }
      const pay = basicTrashResourceCreditCost(next);
      if (next.corp.credits < pay) {
        return fail(`Need ${pay}¢ to trash a resource.`, [CR.corpBasicTrashResource]);
      }
      next.corp.credits -= pay;
      const bad = spendClick(next);
      if (bad) return bad;
      moveRunnerCardToHeap(next, action.cardId);
      log(
        next,
        `Corp trashes ${target.title} with the basic action (CR ${CR.corpBasicTrashResource.number}).`,
      );
      noteCorpActionType(next, "basic_trash_resource");
      afterBasicAction(next);
      return ok(next);
    }

    case "basic_run": {
      if (next.activeSide !== "runner") {
        return fail("Only the Runner may make a run.", [CR.runnerBasicRun]);
      }
      const gate = actionAllowedHere(next, action.type);
      if (!gate.ok) {
        return fail(
          "Runs are only legal at the Runner take-action step.",
          gate.cites,
        );
      }
      if (
        !isRunTargetAllowed(next, action.serverId)
      ) {
        return fail(
          "The first run each turn cannot be made against a remote server.",
          [CR.runnerBasicRun],
        );
      }
      const extra = next.turn.runnerMadeRunThisTurn
        ? 0
        : sumRunnerFirstRunAdditionalCost(next);
      const prompted =
        extra > 0 &&
        firstClickMustIsActive(next) &&
        !next.turn.payingFirstRunAdditionalCost;
      if (prompted) {
        const canPay = next.runner.credits >= extra;
        next.turn.pendingFirstRunServerId = action.serverId;
        next.pendingChoice = {
          sourceId: next.runner.identityId,
          chooser: "runner",
          options: [
            ...(canPay
              ? [
                  {
                    id: "first-run-cost:pay",
                    label: `Pay ${extra}¢ and make the run`,
                    effect: {
                      op: "do" as const,
                      action: {
                        kind: "gain_credits" as const,
                        side: "runner" as const,
                        amount: 0,
                      },
                    },
                  },
                ]
              : []),
            {
              id: "first-run-cost:decline",
              label: "Decline the additional cost",
              effect: {
                op: "do" as const,
                action: {
                  kind: "gain_credits" as const,
                  side: "runner" as const,
                  amount: 0,
                },
              },
            },
          ],
        };
        log(
          next,
          `The first click must be a run — the additional ${extra}¢ can be declined (CR ${CR.mustNotForceAdditionalCost.number}).`,
        );
        return ok(next);
      }
      if (extra > 0 && next.runner.credits < extra) {
        return fail(
          `First run this turn requires ${extra} additional credits (Enhanced Login Protocol).`,
          [CR.runnerBasicRun],
        );
      }
      const elpClick = enhancedLoginProtocolClick(next);
      if (elpClick && next.runner.clicks < 2) {
        return fail(
          "Enhanced Login Protocol — the first run each turn spends an additional click.",
          [CR.abilitiesDuringRun, CR.runnerBasicRun],
        );
      }
      const bad = spendClick(next);
      if (bad) return bad;
      if (elpClick) {
        const extraClick = spendClick(next);
        if (extraClick) return extraClick;
        log(
          next,
          `Enhanced Login Protocol — spend 1 click to initiate the run (CR ${CR.abilitiesDuringRun.number}).`,
        );
      }
      if (extra > 0) {
        subtractRunnerCreditPool(next, extra);
        next.turn.payingFirstRunAdditionalCost = false;
        log(
          next,
          `Runner pays ${extra}¢ additional cost for first run this turn.`,
        );
      }
      const walked = startRun(next, action.serverId);
      if (!walked.ok) {
        next.run = null;
        return walked;
      }
      finishRunReturnToAction(walked.state);
      return walked;
    }

    case "play_operation":
      return playOperation(next, action.cardId);

    case "play_event":
      return playEvent(
        next,
        action.cardId,
        action.serverId,
        action.trashGripForDiscountCardId,
      );

    case "advance":
      return advanceCard(next, action.cardId);

    case "score_agenda":
      return scoreAgendaAction(next, action.cardId);

    case "use_identity_ability":
      return useIdentityAbility(next, action.abilityId);

    case "rez_ice":
      return rezIce(next, action.cardId);

    case "break_subroutine":
      return breakSubroutine(next, action.breakerId, action.subIndex);

    case "break_bioroid_subroutine":
      return breakBioroidSubroutine(next, action.subIndex);

    case "break_bioroid_subroutines":
      return breakBioroidSubroutines(next, action.subIndexes);

    case "use_paid_ability":
      return usePaidAbility(
        next,
        action.cardId,
        action.abilityId,
        action.serverId,
      );

    case "rez_asset":
      return rezAsset(next, action.cardId);

    case "choose_trash_program":
      return fail("No pending trash-program choice.", [CR.trashing]);

    case "resolve_sabotage":
      return fail("No pending sabotage.", [CR.sabotage]);

    case "jack_out":
      return jackOut(next);

    case "access_card": {
      const gate = actionAllowedHere(next, action.type);
      if (!gate.ok) return fail("No breach access window.", gate.cites);
      if (!next.run) return fail("No breach in progress.", [CR.breach]);
      const idx = next.run.accessCandidates.indexOf(action.cardId);
      if (idx < 0) {
        return fail("Card is not an access candidate.", [CR.remoteCandidates]);
      }
      const preview = next.cards[action.cardId];
      if (
        next.run.attackedServerId === "archives" &&
        next.run.immolationScriptAccessReplace &&
        preview?.type === "ice" &&
        next.run.pendingImmolationAccessCardId !== action.cardId
      ) {
        const copy = Object.values(next.servers).some((server) =>
          server.ice.some((id) => {
            const ice = next.cards[id];
            return Boolean(ice?.rezzed && ice.title === preview.title && id !== action.cardId);
          }),
        );
        if (copy) {
          next.run.pendingImmolationAccessCardId = action.cardId;
          next.pendingChoice = {
            sourceId: next.runner.identityId,
            chooser: "runner",
            options: [
              {
                id: `immolation-replace:${action.cardId}`,
                label: `Trash a rezzed copy of ${preview.title} instead`,
                effect: { op: "do", action: { kind: "gain_credits", side: "runner", amount: 0 } },
              },
              {
                id: `immolation-access:${action.cardId}`,
                label: "Access it",
                effect: { op: "do", action: { kind: "gain_credits", side: "runner", amount: 0 } },
              },
            ],
          };
          log(
            next,
            `Immolation Script — may trash a rezzed copy of ${preview.title} instead of accessing it (CR ${CR.candidatesAlreadyAccessed.number}).`,
          );
          return ok(next);
        }
      }
      if (
        next.run.attackedServerId === "archives" &&
        preview?.zone === "corp:archives" &&
        next.run.archivesInterfaceSkippedCardId !== action.cardId &&
        !next.turn.archivesInterfaceUsedThisBreach
      ) {
        const faceId = next.runner.installed.find(
          (id) => next.cards[id]?.archivesAccessMayRfgInstead,
        );
        if (faceId) {
          next.pendingChoice = {
            sourceId: faceId,
            chooser: "runner",
            options: [
              {
                id: `archives-rfg:${action.cardId}`,
                label: `Remove ${preview.title} from the game`,
                effect: { op: "do", action: { kind: "gain_credits", side: "runner", amount: 0 } },
              },
              {
                id: `archives-access:${action.cardId}`,
                label: "Access it",
                effect: { op: "do", action: { kind: "gain_credits", side: "runner", amount: 0 } },
              },
            ],
          };
          log(next, `${next.cards[faceId]!.title} — may remove ${preview.title} from the game instead of accessing it.`);
          return ok(next);
        }
      }
      const tax = preview ? remoteRootAccessTax(next, preview) : 0;
      if (tax > 0 && next.run.accessTaxPaidFor !== action.cardId) {
        const options = [
          ...(next.runner.credits >= tax
            ? [{
                id: `access-tax-pay:${action.cardId}`,
                label: `Pay ${tax}¢`,
                effect: { op: "do" as const, action: { kind: "gain_credits" as const, side: "runner" as const, amount: 0 } },
              }]
            : []),
          {
            id: `access-tax-decline:${action.cardId}`,
            label: "Decline to pay",
            effect: { op: "do" as const, action: { kind: "gain_credits" as const, side: "runner" as const, amount: 0 } },
          },
        ];
        next.pendingChoice = {
          sourceId: next.corp.identityId,
          chooser: "runner",
          options,
        };
        log(
          next,
          `${next.cards[next.corp.identityId]?.title ?? "Corp"} — pay ${tax}¢ to access ${preview?.title ?? action.cardId}, or it ceases to be a candidate (CR ${CR.candidatesAlreadyAccessed.number}).`,
        );
        return ok(next);
      }
      // Heliamphora: [interrupt] before Archives access resolves.
      if (
        next.run.attackedServerId === "archives" &&
        heliamphoraHostInsteadAvailable(next) &&
        !next.run.pendingHeliamphoraAccessCardId
      ) {
        const heliId = findHeliamphora(next)!;
        const title = next.cards[action.cardId]?.title ?? action.cardId;
        next.run.pendingHeliamphoraAccessCardId = action.cardId;
        next.pendingChoice = {
          sourceId: heliId,
          chooser: "runner",
          options: [
            {
              id: `heliamphora-host:${action.cardId}`,
              label: `Host ${title} faceup on Heliamphora instead`,
              effect: {
                op: "do",
                action: { kind: "gain_credits", side: "runner", amount: 0 },
              },
            },
            {
              id: `heliamphora-access:${action.cardId}`,
              label: "Access normally",
              effect: {
                op: "do",
                action: { kind: "gain_credits", side: "runner", amount: 0 },
              },
            },
          ],
        };
        log(
          next,
          `${next.cards[heliId]!.title} — may host ${title} instead of accessing.`,
        );
        return ok(next);
      }
      next.run.pendingHeliamphoraAccessCardId = undefined;
      next.run.accessCandidates.splice(idx, 1);
      next.run.accessedCardIds.push(action.cardId);
      next.run.accessingCardId = action.cardId;
      next.turn.accessedACardThisTurn = true;
      if (next.run.randomAccessLimit !== null) {
        next.run.randomAccessLimit = Math.max(0, next.run.randomAccessLimit - 1);
      }
      // Flagship: re-apply other-than-self access cap after each access.
      applyRunAccessRestrictions(next);
      const card = next.cards[action.cardId];
      const faceupInstalledAgenda =
        card.type === "agenda" &&
        card.faceup &&
        (card.zone ?? "").includes(":root");
      card.faceup = true;
      if (faceupInstalledAgenda) {
        const idCard = next.cards[next.corp.identityId];
        if (idCard?.onAccessFaceupInstalledAgenda) {
          const r = evalEffect(
            { state: next, sourceId: next.corp.identityId },
            idCard.onAccessFaceupInstalledAgenda,
          );
          if (!r.ok) {
            log(
              next,
              `onAccessFaceupInstalledAgenda failed on ${idCard.title}: ${r.error}`,
            );
          }
        }
      }
      if (
        card.mustRevealWhenAccessedFromRd &&
        next.run.attackedServerId === "rd"
      ) {
        log(
          next,
          `Revealed ${card.title} while accessing from R&D (CR ${CR.ambushText.number}).`,
        );
      }
      // RNG Key: reveal next access this run; match named number → gain/draw.
      if (next.run.dtwnRngKeyPendingReveal) {
        next.run.dtwnRngKeyPendingReveal = false;
        log(next, `RNG Key — reveal accessed ${card.title}.`);
        const named = next.run.dtwnRngKeyNamedNumber;
        const sourceId = next.run.dtwnRngKeySourceId;
        const rez = card.rezCost;
        const play = card.playCost;
        const adv = card.advancementRequirement;
        const match =
          typeof named === "number" &&
          (rez === named || play === named || adv === named);
        if (match && sourceId) {
          const r = evalEffect(
            { state: next, sourceId },
            { op: "do", action: { kind: "dtwn_rng_key_reward" } },
          );
          if (!r.ok) {
            log(next, `RNG Key reward failed: ${r.error}`);
          }
        }
      }
      // Franchise City: agendas accessed from R&D must be revealed.
      if (
        card.type === "agenda" &&
        next.run.attackedServerId === "rd"
      ) {
        for (const server of Object.values(next.servers)) {
          for (const id of server.root) {
            const up = next.cards[id];
            if (up?.rezzed && up.mustRevealAgendasAccessedFromRd) {
              log(
                next,
                `${up.title} — reveal accessed agenda ${card.title} from R&D.`,
              );
            }
          }
        }
      }
      // Power to the People: first agenda access this turn → gain credits.
      if (
        card.type === "agenda" &&
        typeof next.turn.uotFirstAgendaAccessCredits === "number"
      ) {
        const gain = next.turn.uotFirstAgendaAccessCredits;
        next.turn.uotFirstAgendaAccessCredits = undefined;
        next.runner.credits += gain;
        log(
          next,
          `Power to the People — gain ${gain}¢ on first agenda access → ${next.runner.credits}¢.`,
        );
      }
      // Franchise City: when Runner accesses an agenda, add this to Corp score.
      if (card.type === "agenda") {
        for (const server of Object.values(next.servers)) {
          for (const id of [...server.root]) {
            const asset = next.cards[id];
            if (!asset?.rezzed || !asset.addSelfToCorpScoreOnAgendaAccess) {
              continue;
            }
            const pts = asset.addSelfToCorpScoreOnAgendaAccess.agendaPoints;
            const r = evalEffect(
              { state: next, sourceId: id },
              {
                op: "do",
                action: {
                  kind: "add_to_corp_score_as_agenda",
                  agendaPoints: pts,
                },
              },
            );
            if (!r.ok) {
              log(
                next,
                `${asset.title} addSelfToCorpScoreOnAgendaAccess failed: ${r.error}`,
              );
            }
          }
        }
      }
      log(
        next,
        `Accessed ${card.title} (CR ${CR.cardAccessed.number} / appendix ${CR.accessAppendix1.number}).`,
      );
      if (card.onAccess) {
        // Ambush exemption: Snare!/Behold! do not fire from Archives.
        if (
          next.run.attackedServerId === "archives" &&
          (card.skipOnAccessFromArchives || card.defId === "snare")
        ) {
          log(next, `${card.title} onAccess skipped — accessed from Archives.`);
        } else if (card.onAccessRequiresRezzed && !card.rezzed) {
          log(
            next,
            `${card.title} onAccess skipped — requires rezzed.`,
          );
        } else if (
          card.onAccessRequiresInstalled &&
          !card.zone.endsWith(":root")
        ) {
          log(
            next,
            `${card.title} onAccess skipped — requires installed.`,
          );
        } else if (abilitiesSuppressed(next, action.cardId)) {
          log(
            next,
            `${card.title} onAccess skipped — abilities blanked.`,
          );
        } else {
          const r = evalEffect(
            { state: next, sourceId: action.cardId },
            card.onAccess,
          );
          if (!r.ok) return fail(r.error, r.cites);
        }
      }
      // Watch the World Burn: RFG accessed card by lasting title or first non-agenda.
      {
        const lasting = next.rfgPrintedTitlesOnAccess ?? [];
        const lastingHit = lasting.includes(card.title);
        const firstNonAgenda =
          Boolean(next.run.rfgFirstNonAgendaAccess) &&
          !next.run.rfgFirstNonAgendaAccessUsed &&
          card.type !== "agenda";
        if (lastingHit || firstNonAgenda) {
          if (firstNonAgenda) next.run.rfgFirstNonAgendaAccessUsed = true;
          if (next.run.lastingRfgCopiesOnAccess && !lastingHit) {
            if (!next.rfgPrintedTitlesOnAccess) {
              next.rfgPrintedTitlesOnAccess = [];
            }
            if (!next.rfgPrintedTitlesOnAccess.includes(card.title)) {
              next.rfgPrintedTitlesOnAccess.push(card.title);
            }
          }
          removeCardFromCurrentZone(next, action.cardId);
          card.zone = "removed-from-game";
          card.faceup = true;
          if (!next.removedFromGame) next.removedFromGame = [];
          if (!next.removedFromGame.includes(action.cardId)) {
            next.removedFromGame.push(action.cardId);
          }
          next.run.accessingCardId = null;
          next.run.breachStoleOrTrashed = true;
          log(
            next,
            `Watch the World Burn — remove ${card.title} from the game.`,
          );
          if (next.pendingChoice || next.pendingDamage || next.pendingTrashProgram) {
            return ok(next);
          }
          return completeAccessAndContinue(next);
        }
      }
      if (card.type === "agenda") {
        next.turn.lastScoredOrStolenAgendaId = action.cardId;
        fireTdatdOnAgendaAccessedOrScored(next);
      }
      // Ganked!-class: onAccess may schedule a forced encounter immediately
      // (single rezzed ice, no pendingChoice). Divert before mid-access resume.
      if (
        next.run?.reencounterIceId &&
        next.run.resumeAccessAfterReencounter &&
        !next.pendingChoice
      ) {
        const iceId = next.run.reencounterIceId;
        const server = next.servers[next.run.attackedServerId];
        const pos = server?.ice.indexOf(iceId) ?? -1;
        if (pos >= 0) {
          next.run.position = pos;
          next.run.reencounterIceId = undefined;
          enterStep(next, "run.approachIce");
          autoWalk(next);
          const cont = advanceRunUntilStop(next);
          if (!cont.ok) return cont;
          finishRunReturnToAction(cont.state);
          return cont;
        }
        if (next.cards[iceId]?.type === "ice") {
          next.run.forceEncounterIceId = iceId;
          next.run.reencounterIceId = undefined;
          enterStep(next, "run.approachIce");
          autoWalk(next);
          const cont = advanceRunUntilStop(next);
          if (!cont.ok) return cont;
          finishRunReturnToAction(cont.state);
          return cont;
        }
        next.run.reencounterIceId = undefined;
        next.run.resumeAccessAfterReencounter = false;
      }
      // Nested access-a-card appendix 11.6_1 → 11.6_2 (…); park on pending.
      enterStep(next, "access.cardAccessed");
      if (
        next.pendingChoice ||
        next.pendingDamage ||
        next.pendingTrashProgram
      ) {
        return ok(next);
      }
      autoWalk(next);
      return advanceFromMidAccess(next);
    }

    case "steal_agenda": {
      if (next.run) next.run.breachStoleOrTrashed = true;
      if (!next.run || next.run.accessingCardId !== action.cardId) {
        return fail("Not accessing that agenda.", [CR.stealingAgenda]);
      }
      if (next.timingKey !== "access.stealAgenda") {
        return fail("Steal only after mid-access (CR 7.2.3).", [
          CR.accessAgenda,
          CR.midAccessAgenda,
        ]);
      }
      if (next.run.cannotStealOrTrash) {
        return fail("Cannot steal Corp cards this run.", [CR.stealingAgenda]);
      }
      const agenda = next.cards[action.cardId];
      const whistleblowerIgnore =
        Boolean(next.run.whistleblowerNamedTitle) &&
        agenda?.title === next.run.whistleblowerNamedTitle;
      if (whistleblowerIgnore) {
        log(
          next,
          `Whistleblower — steal ${agenda.title} ignoring all costs.`,
        );
        next.run.whistleblowerNamedTitle = undefined;
        return completeStealAgenda(next, action);
      }
      if (
        stealNetOrMeatPrevented(
          next,
          action.cardId,
          next.run.attackedServerId,
        )
      ) {
        return fail(
          `Cannot suffer the damage to steal ${agenda?.title ?? action.cardId}.`,
          [CR.stealingAgenda, CR.costInterruptStaticMandatory],
        );
      }
      const stealClicks = agenda?.stealAdditionalClicks ?? 0;
      if (stealClicks > 0) {
        if (next.runner.clicks < stealClicks) {
          return fail(
            `Must spend ${stealClicks} [click] to steal ${agenda.title}.`,
            [CR.stealingAgenda, CR.spendClicks],
          );
        }
        next.runner.clicks -= stealClicks;
        log(
          next,
          `Runner spends ${stealClicks} [click] to steal ${agenda.title} → ${next.runner.clicks} (CR ${CR.spendClicks.number}).`,
        );
      }
      const stealCredits = stealAdditionalCreditsForAgenda(
        next,
        action.cardId,
        next.run.attackedServerId,
      );
      if (stealCredits > 0) {
        if (next.runner.credits < stealCredits) {
          return fail(
            `Must pay ${stealCredits}¢ to steal ${agenda.title}.`,
            [CR.stealingAgenda],
          );
        }
        subtractRunnerCreditPool(next, stealCredits);
        log(
          next,
          `Runner pays ${stealCredits}¢ additional cost to steal ${agenda.title} → ${next.runner.credits}¢.`,
        );
      }
      const stealServerId = next.run.attackedServerId;
      if (next.pendingStealAgendaId === action.cardId) {
        next.pendingStealAgendaId = null;
      } else if (
        stealAdditionalCosts(next, stealServerId, action.cardId).length > 0
      ) {
        next.pendingStealAgendaId = action.cardId;
        const paid = payStealAdditionalCosts(
          next,
          action.cardId,
          stealServerId,
        );
        if (!paid.ok) {
          next.pendingStealAgendaId = null;
          return paid;
        }
        if (next.pendingChoice) {
          return ok(next);
        }
        next.pendingStealAgendaId = null;
      }
      return completeStealAgenda(next, action);
    }

    case "trash_accessed": {
      if (next.run) next.run.breachStoleOrTrashed = true;
      if (!next.run || next.run.accessingCardId !== action.cardId) {
        return fail("Not accessing that card.", [CR.trashing]);
      }
      if (next.run.cannotStealOrTrash) {
        return fail("Cannot trash Corp cards this run.", [CR.trashing]);
      }
      const card = next.cards[action.cardId];
      if (card.cannotBeTrashedByRunnerWhileRezzed && card.rezzed) {
        return fail(
          `Cannot trash rezzed ${card.title}.`,
          [CR.trashing],
        );
      }
      const wasRezzedForThreat = Boolean(card.rezzed);
      if (card.trashAdditionalCost) {
        if (next.pendingTrashAccessedCardId === action.cardId) {
          next.pendingTrashAccessedCardId = null;
        } else {
          next.pendingTrashAccessedCardId = action.cardId;
          const r = evalEffect(
            { state: next, sourceId: action.cardId },
            card.trashAdditionalCost,
          );
          if (!r.ok) {
            next.pendingTrashAccessedCardId = null;
            return fail(r.error, r.cites);
          }
          if (next.pendingChoice) return ok(next);
          next.pendingTrashAccessedCardId = null;
        }
      }
      let cost = runnerTrashCostForCard(next, action.cardId);
      const kim = next.cards[next.runner.identityId];
      if (
        kim?.firstAccessedOperationTrashFreeEachTurn &&
        card.type === "operation" &&
        !next.turn.firstAccessedOperationTrashedFreeThisTurn
      ) {
        cost = 0;
        next.turn.firstAccessedOperationTrashedFreeThisTurn = true;
        log(next, `${kim.title} — first accessed operation is trashed for free.`);
      }
      const purpose =
        card.type === "asset" ? ("trash_asset" as const) : ("trash" as const);
      if (runnerCreditsFor(next, purpose) < cost) {
        return fail("Insufficient credits to trash.", [CR.trashing]);
      }
      spendRunnerCreditsFor(next, cost, purpose);
      // Marilyn: may shuffle into R&D instead of Archives.
      const serverId = next.run.attackedServerId;
      const server = next.servers[serverId];
      server.root = server.root.filter((id) => id !== action.cardId);
      next.corp.hand = next.corp.hand.filter((id) => id !== action.cardId);
      next.corp.deck = next.corp.deck.filter((id) => id !== action.cardId);
      if (card.mayShuffleIntoRdWhenTrashed) {
        next.corp.deck.push(action.cardId);
        card.zone = "corp:rd";
        card.faceup = false;
        card.rezzed = false;
        card.hostedCredits = undefined;
        log(
          next,
          `Runner trashes accessed ${card.title} for ${cost}¢ — shuffled into R&D instead.`,
        );
      } else {
        next.corp.discardPile.push(action.cardId);
        card.zone = "corp:archives";
        card.faceup = true;
        log(
          next,
          `Runner trashes accessed ${card.title} for ${cost}¢ (CR ${CR.trashing.number}).`,
        );
      }
      next.run.accessingCardId = null;
      fireCorpOnTrash(next, action.cardId);
      noteFirstCorpCardTrashEachTurn(next);
      noteAccessTrash(next, cost);
      // Public Access Plaza: Threat N → tag when Runner trashes while rezzed.
      const threatTrash = card.threatGiveTagsOnRezzedTrash;
      if (threatTrash && wasRezzedForThreat) {
        const threatPts = Math.max(
          agendaPointsFor(next, "corp"),
          agendaPointsFor(next, "runner"),
        );
        if (threatPts >= threatTrash.level) {
          next.runner.tags += threatTrash.tags;
          log(
            next,
            `${card.title} — Threat ${threatTrash.level}: give Runner ${threatTrash.tags} tag(s) → ${next.runner.tags}.`,
          );
        }
      }
      // René: first access-trash each turn → gain ¢ + draw
      const idCard = next.cards[next.runner.identityId];
      const gain = idCard?.onAccessTrashGain;
      if (gain && !(gain.oncePerTurn && next.turn.reneAccessTrashUsed)) {
        next.runner.credits += gain.credits;
        let drew = 0;
        for (let i = 0; i < gain.draw; i++) {
          if (drawOne(next, "runner")) drew += 1;
        }
        next.turn.reneAccessTrashUsed = true;
        log(
          next,
          `René “Loup” Arcemont — gain ${gain.credits}¢ and draw ${drew}.`,
        );
      }
      return completeAccessAndContinue(next);
    }

    case "access_rfg_paying_trash_cost": {
      if (!next.run || next.run.accessingCardId !== action.cardId) {
        return fail("Not accessing that card.", [CR.trashing]);
      }
      if (next.turn.siSalsetteSlumsUsedThisTurn) {
        return fail("Salsette Slums already used this turn.", [CR.trashing]);
      }
      const slums = next.cards[action.slumsId];
      if (!slums?.accessPayTrashCostRemoveFromGameOncePerTurn) {
        return fail("Salsette Slums not available.", [CR.trashing]);
      }
      if (!next.runner.installed.includes(action.slumsId)) {
        return fail("Salsette Slums not installed.", [CR.trashing]);
      }
      const card = next.cards[action.cardId];
      const cost = runnerTrashCostForCard(next, action.cardId);
      const purpose =
        card.type === "asset" ? ("trash_asset" as const) : ("trash" as const);
      if (runnerCreditsFor(next, purpose) < cost) {
        return fail("Insufficient credits to RFG.", [CR.trashing]);
      }
      spendRunnerCreditsFor(next, cost, purpose);
      const serverId = next.run.attackedServerId;
      const server = next.servers[serverId];
      server.root = server.root.filter((id) => id !== action.cardId);
      next.corp.hand = next.corp.hand.filter((id) => id !== action.cardId);
      next.corp.deck = next.corp.deck.filter((id) => id !== action.cardId);
      if (!next.removedFromGame) next.removedFromGame = [];
      next.removedFromGame.push(action.cardId);
      card.zone = "removed-from-game";
      card.faceup = true;
      card.rezzed = false;
      next.run.accessingCardId = null;
      next.turn.siSalsetteSlumsUsedThisTurn = true;
      noteAccessTrash(next, cost);
      log(
        next,
        `Salsette Slums — pay ${cost}¢: remove ${card.title} from the game.`,
      );
      return completeAccessAndContinue(next);
    }

    case "access_trash_from_grip": {
      if (!next.run?.accessingCardId) {
        return fail("Not mid-access.", [CR.trashing]);
      }
      if (next.run.cannotStealOrTrash) {
        return fail("Cannot trash Corp cards this run.", [CR.trashing]);
      }
      const sid = next.run.attackedServerId;
      if (sid !== "hq" && sid !== "rd") {
        return fail("Carnivore only on HQ/R&D access.", [CR.trashing]);
      }
      if (!carnivoreAvailable(next)) {
        return fail("Carnivore not available.", [CR.trashing]);
      }
      const carnIds: string[] = [...next.runner.installed];
      if (next.run.runSourceId) carnIds.push(next.run.runSourceId);
      const carn = carnIds
        .map((id) => next.cards[id])
        .find((c) => {
          const spec = c?.accessTrashFromGrip;
          if (!spec) return false;
          if (spec.oncePerTurn && next.turn.carnivoreAccessTrashUsed) return false;
          return next.runner.hand.length >= spec.gripCards;
        });
      const n = carn!.accessTrashFromGrip!.gripCards;
      for (let i = 0; i < n; i++) {
        const gid = next.runner.hand.pop();
        if (!gid) {
          return fail("Not enough cards in grip.", [CR.trashing]);
        }
        next.runner.discardPile.push(gid);
        next.cards[gid].zone = "runner:heap";
        next.cards[gid].faceup = true;
      }
      const accessedId = next.run.accessingCardId;
      const card = next.cards[accessedId];
      const server = next.servers[sid];
      server.root = server.root.filter((id) => id !== accessedId);
      next.corp.hand = next.corp.hand.filter((id) => id !== accessedId);
      next.corp.deck = next.corp.deck.filter((id) => id !== accessedId);
      next.corp.discardPile.push(accessedId);
      card.zone = "corp:archives";
      card.faceup = true;
      next.run.accessingCardId = null;
      if (carn!.accessTrashFromGrip!.oncePerTurn) {
        next.turn.carnivoreAccessTrashUsed = true;
      }
      noteFirstCorpCardTrashEachTurn(next);
      noteAccessTrash(next, card.trashCost ?? 0);
      log(
        next,
        `Carnivore — trash ${n} from grip to trash accessed ${card.title}.`,
      );
      return completeAccessAndContinue(next);
    }

    case "access_trash_with_virus": {
      if (!next.run || next.run.accessingCardId !== action.cardId) {
        return fail("Not accessing that card.", [CR.trashing]);
      }
      if (next.run.cannotStealOrTrash) {
        return fail("Cannot trash Corp cards this run.", [CR.trashing]);
      }
      const imp = next.runner.installed
        .map((id) => next.cards[id])
        .find(
          (c) =>
            c.accessTrashWithVirus &&
            (c.virusCounters ?? 0) >= 1 &&
            !wasAbilityUsed(next, c.id, "imp-access-trash") &&
            !programBannedThisRun(next, c.id),
        );
      if (!imp) {
        return fail("No Imp virus trash available.", [CR.trashing]);
      }
      imp.virusCounters = (imp.virusCounters ?? 0) - 1;
      markAbilityUsed(next, imp.id, "imp-access-trash");
      const accessedId = action.cardId;
      const card = next.cards[accessedId];
      const server = next.servers[next.run.attackedServerId];
      server.root = server.root.filter((id) => id !== accessedId);
      next.corp.hand = next.corp.hand.filter((id) => id !== accessedId);
      next.corp.deck = next.corp.deck.filter((id) => id !== accessedId);
      next.corp.discardPile.push(accessedId);
      card.zone = "corp:archives";
      card.faceup = true;
      next.run.accessingCardId = null;
      noteFirstCorpCardTrashEachTurn(next);
      noteAccessTrash(next, card.trashCost ?? 0);
      log(
        next,
        `Imp — spend virus counter to trash accessed ${card.title}.`,
      );
      return completeAccessAndContinue(next);
    }

    case "access_trash_free": {
      if (!next.run || next.run.accessingCardId !== action.cardId) {
        return fail("Not accessing that card.", [CR.trashing]);
      }
      if (next.run.cannotStealOrTrash) {
        return fail("Cannot trash Corp cards this run.", [CR.trashing]);
      }
      if (!next.run.accessTrashFree) {
        return fail("No free access trash available this run.", [CR.trashing]);
      }
      const accessedId = action.cardId;
      const card = next.cards[accessedId];
      const server = next.servers[next.run.attackedServerId];
      server.root = server.root.filter((id) => id !== accessedId);
      next.corp.hand = next.corp.hand.filter((id) => id !== accessedId);
      next.corp.deck = next.corp.deck.filter((id) => id !== accessedId);
      next.corp.discardPile.push(accessedId);
      card.zone = "corp:archives";
      card.faceup = true;
      next.run.accessingCardId = null;
      noteFirstCorpCardTrashEachTurn(next);
      noteAccessTrash(next, 0);
      log(
        next,
        `Demolition Run — trash accessed ${card.title} for 0¢.`,
      );
      return completeAccessAndContinue(next);
    }

    case "access_trash_paying_printed_cost_from_stealth": {
      if (!next.run || next.run.accessingCardId !== action.cardId) {
        return fail("Not accessing that card.", [CR.trashing]);
      }
      if (next.run.cannotStealOrTrash) {
        return fail("Cannot trash Corp cards this run.", [CR.trashing]);
      }
      const lamp = next.cards[action.lampadesId];
      if (
        !lamp?.accessTrashPayingPrintedCostFromStealth ||
        !next.runner.installed.includes(action.lampadesId) ||
        (lamp.powerCounters ?? 0) < 1
      ) {
        return fail("Lampades trash not available.", [CR.trashing]);
      }
      const accessed = next.cards[action.cardId];
      const printed = accessed?.rezCost ?? accessed?.playCost ?? 0;
      const stealthCost = {
        credits: printed,
        creditsFromStealthOnly: true as const,
      };
      if (!canPayCost(next, "runner", stealthCost, lamp)) {
        return fail("Insufficient stealth credits for printed cost.", [
          CR.trashing,
        ]);
      }
      lamp.powerCounters = (lamp.powerCounters ?? 0) - 1;
      payCost(next, "runner", stealthCost, "lampades-access-trash", lamp);
      const accessedId = action.cardId;
      const server = next.servers[next.run.attackedServerId];
      server.root = server.root.filter((id) => id !== accessedId);
      next.corp.hand = next.corp.hand.filter((id) => id !== accessedId);
      next.corp.deck = next.corp.deck.filter((id) => id !== accessedId);
      next.corp.discardPile.push(accessedId);
      accessed.zone = "corp:archives";
      accessed.faceup = true;
      next.run.accessingCardId = null;
      noteFirstCorpCardTrashEachTurn(next);
      noteAccessTrash(next, accessed.trashCost ?? 0);
      log(
        next,
        `${lamp.title} — spend power + ${printed}¢ from stealth to trash accessed ${accessed.title}.`,
      );
      return completeAccessAndContinue(next);
    }

    case "access_trash_self_non_agenda_draw": {
      if (!next.run || next.run.accessingCardId !== action.cardId) {
        return fail("Not accessing that card.", [CR.trashing]);
      }
      if (next.run.cannotStealOrTrash) {
        return fail("Cannot trash Corp cards this run.", [CR.trashing]);
      }
      const accessed = next.cards[action.cardId];
      if (!accessed || accessed.type === "agenda" || accessed.side !== "corp") {
        return fail("Can only trash a non-agenda Corp card.", [CR.trashing]);
      }
      const gourmand = next.cards[action.gourmandId];
      if (
        !gourmand?.accessTrashSelfNonAgendaThenDraw ||
        !next.runner.installed.includes(action.gourmandId)
      ) {
        return fail("Gourmand trash not available.", [CR.trashing]);
      }
      moveRunnerCardToHeap(next, action.gourmandId);
      const accessedId = action.cardId;
      const server = next.servers[next.run.attackedServerId];
      server.root = server.root.filter((id) => id !== accessedId);
      next.corp.hand = next.corp.hand.filter((id) => id !== accessedId);
      next.corp.deck = next.corp.deck.filter((id) => id !== accessedId);
      next.corp.discardPile.push(accessedId);
      accessed.zone = "corp:archives";
      accessed.faceup = true;
      next.run.accessingCardId = null;
      noteFirstCorpCardTrashEachTurn(next);
      noteAccessTrash(next, accessed.trashCost ?? 0);
      const drew = drawOne(next, "runner") ? 1 : 0;
      log(
        next,
        `${gourmand.title} — trash self to trash accessed ${accessed.title}; draw ${drew}.`,
      );
      return completeAccessAndContinue(next);
    }

    case "access_host_non_agenda_faceup": {
      if (!next.run || next.run.accessingCardId !== action.cardId) {
        return fail("Not accessing that card.", [CR.trashing]);
      }
      const accessed = next.cards[action.cardId];
      if (!accessed || accessed.type === "agenda" || accessed.side !== "corp") {
        return fail("Can only host a non-agenda Corp card.", [CR.trashing]);
      }
      const hostId = findCupellationHost(next);
      if (!hostId) {
        return fail("Cupellation host not available.", [CR.trashing]);
      }
      const host = next.cards[hostId]!;
      const cost = host.accessHostNonAgendaFaceup!.creditCost;
      if (next.runner.credits < cost) {
        return fail("Insufficient credits to host.", [CR.trashing]);
      }
      subtractRunnerCreditPool(next, cost);
      hostCorpCardFaceupOn(next, hostId, action.cardId);
      next.run.accessingCardId = null;
      log(
        next,
        `${host.title} — pay ${cost}¢ to host accessed ${accessed.title}.`,
      );
      return completeAccessAndContinue(next);
    }

    case "access_host_agenda_on_film_critic": {
      if (!next.run || next.run.accessingCardId !== action.cardId) {
        return fail("Not accessing that card.", [CR.trashing]);
      }
      const accessed = next.cards[action.cardId];
      if (!accessed || accessed.type !== "agenda") {
        return fail("Can only host an agenda.", [CR.trashing]);
      }
      const host = next.cards[action.hostId];
      if (!host?.mayHostAccessedAgenda || !next.runner.installed.includes(action.hostId)) {
        return fail("Film Critic host not available.", [CR.trashing]);
      }
      const cap = host.hostAgendaCapacity ?? 1;
      const hostedAgendas = (host.hostedCardIds ?? []).filter(
        (hid) => next.cards[hid]?.type === "agenda",
      ).length;
      if (hostedAgendas >= cap) {
        return fail("Film Critic already hosts an agenda.", [CR.trashing]);
      }
      hostCorpCardFaceupOn(next, action.hostId, action.cardId);
      next.run.accessingCardId = null;
      log(
        next,
        `${host.title} — host accessed agenda ${accessed.title}.`,
      );
      return completeAccessAndContinue(next);
    }

    case "finish_access": {
      if (!next.run?.accessingCardId) {
        return fail("Not mid-access.", [CR.breach, CR.midAccessAbility]);
      }
      // Pass mid-access (11.6_2) → agenda steal step (11.6_3) or complete.
      if (next.timingKey === "access.stealAgenda") {
        // Declining steal when additional costs block / Runner declines.
        return completeAccessAndContinue(next);
      }
      return enterStealAgendaOrComplete(next);
    }

    case "finish_breach": {
      const gate = actionAllowedHere(next, action.type);
      if (!gate.ok) return fail("No breach access window.", gate.cites);
      if (!next.run) return fail("No breach in progress.", [CR.breach]);
      if (next.run.accessingCardId) {
        return fail("Finish current access first.", [CR.breach]);
      }
      const remaining = next.run.randomAccessLimit;
      if (
        remaining !== null &&
        remaining > 0 &&
        next.run.accessCandidates.length > 0
      ) {
        return fail("Candidates remain.", [CR.remoteCandidates]);
      }
      if (remaining === null && next.run.accessCandidates.length > 0) {
        return fail("Candidates remain.", [CR.remoteCandidates]);
      }
      enterStep(next, "breach.complete");
      autoWalk(next);
      const cont = advanceRunUntilStop(next);
      if (!cont.ok) return cont;
      finishRunReturnToAction(cont.state);
      return cont;
    }

    case "boost_trace":
    case "spend_link":
    case "resolve_trace":
      return fail("No trace in progress.", [CR.trace]);

    case "psi_runner_bid":
    case "psi_corp_bid":
      return fail("No psi game in progress.", [CR.trace]);

    case "prevent_damage":
    case "prevent_damage_lose_all_clicks":
    case "accept_damage":
      return fail("No pending damage.", [CR.preventDamage]);

    case "accept_expose":
      if (!next.pendingExpose) {
        return fail("No pending expose.", [CR.expose]);
      }
      acceptPendingExpose(next);
      resumeExposeUpTo(next);
      return ok(next);
    case "accept_installed_trash":
      if (!next.pendingTrashPrevent) {
        return fail("No pending installed trash.", [CR.trashing]);
      }
      acceptPendingInstalledTrash(next, moveRunnerCardToHeap);
      return ok(next);
    case "trigger_pending_trash_interrupt":
      return fail("No pending installed trash.", [
        CR.conditionalInterruptStillRelevant,
      ]);
    case "accept_tags":
      return fail("No pending tags.", [CR.tags]);

    case "accept_end_the_run":
      return fail("No pending end the run.", [CR.endTheRun]);

    case "discard_to_hand_size":
      return discardPhase(next);

    case "choose_option":
      return fail("No pending choice.", [CR.paidAbility]);

    default: {
      const _exhaustive: never = action;
      return fail(`Unknown action: ${JSON.stringify(_exhaustive)}`, []);
    }
  }
}

/** List legal actions at the current timing graph node. */
export function legalActions(state: GameState): Action[] {
  return queryLegalActions(state);
}

export function describeState(state: GameState): string {
  const step = getStep(state);
  const lines = [
    `Turn ${state.turnNumber} | active=${state.activeSide} | phase=${state.turnPhase} | key=${state.timingKey}`,
    `Timing: [${step.stepNumber}] ${step.label} (${step.stepId}) kind=${step.kind}`,
    `Corp: ${state.corp.clicks} clicks, ${state.corp.credits}c, hand=${state.corp.hand.length}, R&D=${state.corp.deck.length}, score=${state.corp.scoreArea.length}`,
    `Runner: ${state.runner.clicks} clicks, ${state.runner.credits}c, tags=${state.runner.tags}, coreDamage=${state.runner.coreDamage}, grip=${state.runner.hand.length}, installed=${state.runner.installed.length}`,
    `Servers: ${listServers(state)
      .map((s) => {
        const iceDesc = s.ice
          .map((id) => `${state.cards[id].title}${state.cards[id].rezzed ? "*" : ""}`)
          .join("|");
        return `${s.id}[ice=${iceDesc || "—"},root=${s.root.length}]`;
      })
      .join(", ")}`,
  ];
  if (state.winner) {
    lines.push(`Winner: ${state.winner} (${state.winReason})`);
  }
  if (state.checkpoints.length) {
    lines.push(
      `Checkpoints: ${state.checkpoints.map((c) => `${c.kind}:${c.label}`).join(" > ")}`,
    );
  }
  if (state.priorityStack.length) {
    lines.push(
      `Priority: ${state.priorityStack.map((p) => `d${p.nestDepth}/${p.priorityHolder}/pass${p.consecutivePasses}`).join(" > ")}`,
    );
  }
  if (state.restrictions.length) {
    lines.push(
      `Restrictions: ${state.restrictions.map((r) => `${r.forbid}@${r.source}`).join(", ")}`,
    );
  }
  if (state.trace) {
    lines.push(
      `Trace: base=${state.trace.baseStrength} corp+${state.trace.corpSpent} link+${state.trace.runnerLinkSpent}`,
    );
  }
  if (state.pendingDamage) {
    lines.push(
      `Pending damage: ${state.pendingDamage.remaining} ${state.pendingDamage.type}`,
    );
  }
  if (state.pendingTrashProgram) {
    lines.push(
      `Pending trash program: choose among ${state.pendingTrashProgram.candidates.join(",")}`,
    );
  }
  if (state.run) {
    lines.push(
      `Run: ${state.run.attackedServerId} phase=${state.run.phase} success=${state.run.successful} pos=${state.run.position} etr=${state.run.endedTheRun} noJack=${state.run.cannotJackOut}`,
    );
    const boosts = Object.entries(state.run.strengthBoosts);
    const encBoosts = Object.entries(state.run.encounterStrengthBoosts);
    const iceBoosts = Object.entries(state.run.iceStrengthBoosts);
    if (boosts.length || encBoosts.length || iceBoosts.length) {
      lines.push(
        `Strength boosts: run={${boosts.map(([k, v]) => `${k}:+${v}`).join(",")}} encounter={${encBoosts.map(([k, v]) => `${k}:+${v}`).join(",")}} ice={${iceBoosts.map(([k, v]) => `${k}:+${v}`).join(",")}}`,
      );
    }
    if (state.run.encounter) {
      const iceId = state.run.encounter.iceId;
      lines.push(
        `Encounter: ${iceId} str=${effectiveIceStrength(state, iceId)} broken=${state.run.encounter.broken.join(",")}`,
      );
    }
    if (state.run.accessingCardId) {
      lines.push(`Accessing: ${state.run.accessingCardId}`);
    }
  }
  const empty = emptyRemoteExists(state);
  if (empty) lines.push(`Empty remote present: ${empty.id}`);
  return lines.join("\n");
}
